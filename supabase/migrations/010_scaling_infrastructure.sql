-- ============================================================
-- SofIA SaaS - Scaling Infrastructure
-- Migration 010: Rate Limiting + Execution Logging
--
-- Para 40 clínicas simultáneas:
--   - rate_limit_windows: throttling por clínica/operación
--   - execution_log: observabilidad y detección de anomalías
--   - system_health: métricas de salud del sistema
-- ============================================================

-- ============================================================
-- TABLA: rate_limit_windows
-- Ventanas de 1 minuto por clínica/operación.
-- Usada por check_rate_limit() en n8n antes de llamar APIs.
-- ============================================================

CREATE TABLE IF NOT EXISTS rate_limit_windows (
    clinic_id       UUID        NOT NULL,
    operation       TEXT        NOT NULL,   -- 'webhook', 'openai', 'chatwoot', 'calendar'
    window_minute   TIMESTAMPTZ NOT NULL,   -- truncado a minuto exacto
    request_count   INTEGER     NOT NULL DEFAULT 0,

    PRIMARY KEY (clinic_id, operation, window_minute),

    CONSTRAINT rate_op_valid CHECK (
        operation IN ('webhook', 'openai', 'chatwoot', 'calendar', 'supabase')
    )
);

COMMENT ON TABLE rate_limit_windows IS
    'Ventanas de rate limiting por clínica y operación. TTL manual via cleanup job.';

-- Purgar ventanas > 2 horas automáticamente (evita tabla inflada)
-- Esto se ejecuta como parte del cleanup en get_system_health()
CREATE INDEX IF NOT EXISTS idx_rate_limit_window_time
    ON rate_limit_windows (window_minute DESC);

-- RLS: solo service_role escribe
ALTER TABLE rate_limit_windows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rate_limit_service_only ON rate_limit_windows;
CREATE POLICY rate_limit_service_only ON rate_limit_windows
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- TABLA: execution_log
-- Log estructurado de cada ejecución del workflow principal.
-- Fuente de verdad para SLA, facturación y debugging.
-- ============================================================

CREATE TABLE IF NOT EXISTS execution_log (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id           UUID        REFERENCES clinics(id) ON DELETE SET NULL,
    conversation_id     TEXT,                   -- Chatwoot conversation ID
    n8n_execution_id    TEXT,                   -- ID de ejecución en n8n
    workflow_id         TEXT,                   -- ID del workflow n8n
    intent              TEXT,                   -- INFO/HUMAN/PAYMENT/CREATE_EVENT
    status              TEXT        NOT NULL    -- 'success' | 'error' | 'paused' | 'rate_limited'
        CHECK (status IN ('success', 'error', 'paused', 'rate_limited', 'rejected')),
    duration_ms         INTEGER,                -- Tiempo total de ejecución
    openai_tokens       INTEGER,                -- Tokens consumidos (si aplica)
    openai_latency_ms   INTEGER,                -- Latencia de OpenAI en ms
    node_failed         TEXT,                   -- Nombre del nodo donde falló
    error_type          TEXT,                   -- 'NETWORK', 'RATE_LIMIT', 'OPENAI', 'GOVERNANCE', etc.
    error_message       TEXT,                   -- Mensaje de error (sin PII)
    inbox_id            INTEGER,                -- Chatwoot inbox_id
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE execution_log IS
    'Log de ejecuciones del workflow principal. Sin PII. Fuente de SLA y billing.';

-- Índices para queries de monitoreo frecuentes
CREATE INDEX IF NOT EXISTS idx_execlog_clinic_time
    ON execution_log (clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_execlog_status_time
    ON execution_log (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_execlog_error
    ON execution_log (error_type, created_at DESC)
    WHERE error_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_execlog_clinic_hour
    ON execution_log (clinic_id, date_trunc('hour', created_at));

-- RLS: service_role escribe, admin/staff de la clínica puede leer los suyos
ALTER TABLE execution_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS execlog_service_write ON execution_log;
CREATE POLICY execlog_service_write ON execution_log
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS execlog_admin_read ON execution_log;
CREATE POLICY execlog_admin_read ON execution_log
    FOR SELECT USING (
        clinic_id = (auth.jwt() ->> 'clinic_id')::uuid
        AND (auth.jwt() ->> 'user_role') = 'admin'
    );

-- ============================================================
-- FUNCIÓN: check_rate_limit
-- Atomic increment + check. Llamada en Bot Pause Check antes
-- de procesar el mensaje con OpenAI.
--
-- Retorna: { allowed: bool, count: int, limit: int }
-- ============================================================

CREATE OR REPLACE FUNCTION check_rate_limit(
    p_clinic_id         UUID,
    p_operation         TEXT,
    p_max_per_minute    INTEGER DEFAULT 30
)
RETURNS JSON AS $fn$
DECLARE
    v_window    TIMESTAMPTZ := date_trunc('minute', now());
    v_count     INTEGER;
BEGIN
    -- Atomic upsert: insert o incrementar en la ventana actual
    INSERT INTO rate_limit_windows (clinic_id, operation, window_minute, request_count)
    VALUES (p_clinic_id, p_operation, v_window, 1)
    ON CONFLICT (clinic_id, operation, window_minute)
    DO UPDATE SET request_count = rate_limit_windows.request_count + 1
    RETURNING request_count INTO v_count;

    RETURN json_build_object(
        'allowed',  v_count <= p_max_per_minute,
        'count',    v_count,
        'limit',    p_max_per_minute,
        'window',   v_window
    );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCIÓN: log_execution
-- Registra el resultado de una ejecución del workflow.
-- Llamada al final del workflow (nodo Registrar Ejecución).
-- ============================================================

CREATE OR REPLACE FUNCTION log_execution(
    p_clinic_id         UUID,
    p_conversation_id   TEXT        DEFAULT NULL,
    p_n8n_execution_id  TEXT        DEFAULT NULL,
    p_workflow_id       TEXT        DEFAULT NULL,
    p_intent            TEXT        DEFAULT NULL,
    p_status            TEXT        DEFAULT 'success',
    p_duration_ms       INTEGER     DEFAULT NULL,
    p_openai_tokens     INTEGER     DEFAULT NULL,
    p_openai_latency_ms INTEGER     DEFAULT NULL,
    p_node_failed       TEXT        DEFAULT NULL,
    p_error_type        TEXT        DEFAULT NULL,
    p_error_message     TEXT        DEFAULT NULL,
    p_inbox_id          INTEGER     DEFAULT NULL
)
RETURNS UUID AS $fn$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO execution_log (
        clinic_id, conversation_id, n8n_execution_id, workflow_id,
        intent, status, duration_ms, openai_tokens, openai_latency_ms,
        node_failed, error_type, error_message, inbox_id
    )
    VALUES (
        p_clinic_id, p_conversation_id, p_n8n_execution_id, p_workflow_id,
        p_intent, p_status, p_duration_ms, p_openai_tokens, p_openai_latency_ms,
        p_node_failed, p_error_type, p_error_message, p_inbox_id
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCIÓN: get_clinic_metrics
-- Panel de métricas por clínica para el dashboard.
-- Últimas 24 horas.
-- ============================================================

CREATE OR REPLACE FUNCTION get_clinic_metrics(
    p_clinic_id     UUID,
    p_hours_back    INTEGER DEFAULT 24
)
RETURNS JSON AS $fn$
DECLARE
    v_since     TIMESTAMPTZ := now() - (p_hours_back || ' hours')::INTERVAL;
    v_total     INTEGER;
    v_success   INTEGER;
    v_errors    INTEGER;
    v_paused    INTEGER;
    v_rate_lim  INTEGER;
    v_avg_ms    NUMERIC;
    v_p95_ms    NUMERIC;
    v_tokens    BIGINT;
BEGIN
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'success'),
        COUNT(*) FILTER (WHERE status = 'error'),
        COUNT(*) FILTER (WHERE status = 'paused'),
        COUNT(*) FILTER (WHERE status = 'rate_limited'),
        ROUND(AVG(duration_ms)),
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms),
        SUM(openai_tokens)
    INTO v_total, v_success, v_errors, v_paused, v_rate_lim, v_avg_ms, v_p95_ms, v_tokens
    FROM execution_log
    WHERE clinic_id = p_clinic_id
      AND created_at >= v_since;

    RETURN json_build_object(
        'period_hours',         p_hours_back,
        'total_executions',     COALESCE(v_total, 0),
        'success_count',        COALESCE(v_success, 0),
        'error_count',          COALESCE(v_errors, 0),
        'paused_count',         COALESCE(v_paused, 0),
        'rate_limited_count',   COALESCE(v_rate_lim, 0),
        'success_rate_pct',     CASE WHEN v_total > 0
                                    THEN ROUND(v_success::NUMERIC / v_total * 100, 1)
                                    ELSE 100 END,
        'avg_duration_ms',      COALESCE(v_avg_ms, 0),
        'p95_duration_ms',      COALESCE(v_p95_ms, 0),
        'total_openai_tokens',  COALESCE(v_tokens, 0),
        'generated_at',         now()
    );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- FUNCIÓN: get_system_health
-- Vista global del sistema. Para monitoreo externo / dashboard admin.
-- Incluye limpieza de rate_limit_windows antiguas.
-- ============================================================

CREATE OR REPLACE FUNCTION get_system_health()
RETURNS JSON AS $fn$
DECLARE
    v_since_1h      TIMESTAMPTZ := now() - INTERVAL '1 hour';
    v_since_24h     TIMESTAMPTZ := now() - INTERVAL '24 hours';
    v_active_clinics INTEGER;
    v_total_1h      INTEGER;
    v_errors_1h     INTEGER;
    v_paused_1h     INTEGER;
    v_unknown_inboxes INTEGER;
    v_rate_limited_1h INTEGER;
    v_deleted_old_windows INTEGER;
BEGIN
    -- Limpiar ventanas de rate limit > 2 horas (maintenance inline)
    DELETE FROM rate_limit_windows WHERE window_minute < now() - INTERVAL '2 hours';
    GET DIAGNOSTICS v_deleted_old_windows = ROW_COUNT;

    -- Clínicas activas (con ejecuciones en la última hora)
    SELECT COUNT(DISTINCT clinic_id)
    INTO v_active_clinics
    FROM execution_log
    WHERE created_at >= v_since_1h;

    -- Métricas última hora
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'error'),
        COUNT(*) FILTER (WHERE status = 'paused'),
        COUNT(*) FILTER (WHERE status = 'rate_limited')
    INTO v_total_1h, v_errors_1h, v_paused_1h, v_rate_limited_1h
    FROM execution_log
    WHERE created_at >= v_since_1h;

    -- Inboxes desconocidos detectados en las últimas 24h
    SELECT COUNT(*)
    INTO v_unknown_inboxes
    FROM unknown_inbox_log
    WHERE last_seen_at >= v_since_24h;

    RETURN json_build_object(
        'ts',                       now(),
        'status',                   CASE
                                        WHEN v_errors_1h > 50  THEN 'degraded'
                                        WHEN v_errors_1h > 10  THEN 'warning'
                                        ELSE 'healthy'
                                    END,
        'active_clinics_1h',        COALESCE(v_active_clinics, 0),
        'executions_1h',            COALESCE(v_total_1h, 0),
        'error_rate_1h_pct',        CASE WHEN v_total_1h > 0
                                        THEN ROUND(v_errors_1h::NUMERIC / v_total_1h * 100, 1)
                                        ELSE 0 END,
        'bot_paused_gates_1h',      COALESCE(v_paused_1h, 0),
        'rate_limited_1h',          COALESCE(v_rate_limited_1h, 0),
        'unknown_inboxes_24h',      COALESCE(v_unknown_inboxes, 0),
        'rate_windows_cleaned',     v_deleted_old_windows
    );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCIÓN: get_error_summary
-- Top errores de las últimas N horas. Para alertas automáticas.
-- ============================================================

CREATE OR REPLACE FUNCTION get_error_summary(p_hours_back INTEGER DEFAULT 1)
RETURNS TABLE (
    error_type      TEXT,
    error_count     BIGINT,
    clinic_count    BIGINT,
    last_seen       TIMESTAMPTZ,
    sample_message  TEXT
) AS $fn$
BEGIN
    RETURN QUERY
    SELECT
        e.error_type,
        COUNT(*)                        AS error_count,
        COUNT(DISTINCT e.clinic_id)     AS clinic_count,
        MAX(e.created_at)               AS last_seen,
        MAX(e.error_message)            AS sample_message
    FROM execution_log e
    WHERE e.created_at >= now() - (p_hours_back || ' hours')::INTERVAL
      AND e.error_type IS NOT NULL
    GROUP BY e.error_type
    ORDER BY error_count DESC
    LIMIT 20;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
