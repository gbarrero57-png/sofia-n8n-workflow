#!/usr/bin/env python3
"""Deploy Migration 010: Scaling Infrastructure (Rate Limiting + Execution Log)"""
import requests, sys
sys.stdout.reconfigure(encoding='utf-8')

SUPABASE_PROJECT_REF  = "inhyrrjidhzrbqecnptn"
SUPABASE_ACCESS_TOKEN = "sbp_6173188bf253e74928c0a3129f8c747cfe7ab627"
MGMT_URL    = f"https://api.supabase.com/v1/projects/{SUPABASE_PROJECT_REF}/database/query"
MGMT_HEADERS = {"Authorization": f"Bearer {SUPABASE_ACCESS_TOKEN}", "Content-Type": "application/json"}

def deploy(label, sql):
    r = requests.post(MGMT_URL, headers=MGMT_HEADERS, json={"query": sql})
    ok = r.status_code == 201
    print(f"  {'[OK]' if ok else '[ERROR]'} {label}" + (f"\n       {r.text[:250]}" if not ok else ""))
    return ok

print("=" * 65)
print("Migration 010: Scaling Infrastructure")
print("=" * 65)

steps = [

("rate_limit_windows table + RLS", """
CREATE TABLE IF NOT EXISTS rate_limit_windows (
    clinic_id       UUID        NOT NULL,
    operation       TEXT        NOT NULL CHECK (operation IN ('webhook','openai','chatwoot','calendar','supabase')),
    window_minute   TIMESTAMPTZ NOT NULL,
    request_count   INTEGER     NOT NULL DEFAULT 0,
    PRIMARY KEY (clinic_id, operation, window_minute)
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_window_time ON rate_limit_windows (window_minute DESC);
ALTER TABLE rate_limit_windows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rate_limit_service_only ON rate_limit_windows;
CREATE POLICY rate_limit_service_only ON rate_limit_windows FOR ALL USING (auth.role() = 'service_role');
"""),

("execution_log table + indexes + RLS", """
CREATE TABLE IF NOT EXISTS execution_log (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id           UUID        REFERENCES clinics(id) ON DELETE SET NULL,
    conversation_id     TEXT,
    n8n_execution_id    TEXT,
    workflow_id         TEXT,
    intent              TEXT,
    status              TEXT        NOT NULL CHECK (status IN ('success','error','paused','rate_limited','rejected')),
    duration_ms         INTEGER,
    openai_tokens       INTEGER,
    openai_latency_ms   INTEGER,
    node_failed         TEXT,
    error_type          TEXT,
    error_message       TEXT,
    inbox_id            INTEGER,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_execlog_clinic_time  ON execution_log (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execlog_status_time  ON execution_log (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execlog_error        ON execution_log (error_type, created_at DESC) WHERE error_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_execlog_clinic_hour  ON execution_log (clinic_id, date_trunc('hour', created_at));
ALTER TABLE execution_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS execlog_service_write ON execution_log;
CREATE POLICY execlog_service_write ON execution_log FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS execlog_admin_read ON execution_log;
CREATE POLICY execlog_admin_read ON execution_log FOR SELECT USING (
    clinic_id = (auth.jwt() ->> 'clinic_id')::uuid
    AND (auth.jwt() ->> 'user_role') = 'admin'
);
"""),

("check_rate_limit RPC", """
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_clinic_id         UUID,
    p_operation         TEXT,
    p_max_per_minute    INTEGER DEFAULT 30
) RETURNS JSON AS $fn$
DECLARE
    v_window    TIMESTAMPTZ := date_trunc('minute', now());
    v_count     INTEGER;
BEGIN
    INSERT INTO rate_limit_windows (clinic_id, operation, window_minute, request_count)
    VALUES (p_clinic_id, p_operation, v_window, 1)
    ON CONFLICT (clinic_id, operation, window_minute)
    DO UPDATE SET request_count = rate_limit_windows.request_count + 1
    RETURNING request_count INTO v_count;
    RETURN json_build_object(
        'allowed', v_count <= p_max_per_minute,
        'count',   v_count,
        'limit',   p_max_per_minute,
        'window',  v_window
    );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;
"""),

("log_execution RPC", """
CREATE OR REPLACE FUNCTION log_execution(
    p_clinic_id         UUID        DEFAULT NULL,
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
) RETURNS UUID AS $fn$
DECLARE v_id UUID;
BEGIN
    INSERT INTO execution_log (
        clinic_id, conversation_id, n8n_execution_id, workflow_id,
        intent, status, duration_ms, openai_tokens, openai_latency_ms,
        node_failed, error_type, error_message, inbox_id
    ) VALUES (
        p_clinic_id, p_conversation_id, p_n8n_execution_id, p_workflow_id,
        p_intent, p_status, p_duration_ms, p_openai_tokens, p_openai_latency_ms,
        p_node_failed, p_error_type, p_error_message, p_inbox_id
    ) RETURNING id INTO v_id;
    RETURN v_id;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;
"""),

("get_clinic_metrics RPC", """
CREATE OR REPLACE FUNCTION get_clinic_metrics(p_clinic_id UUID, p_hours_back INTEGER DEFAULT 24)
RETURNS JSON AS $fn$
DECLARE
    v_since     TIMESTAMPTZ := now() - (p_hours_back || ' hours')::INTERVAL;
    v_total     INTEGER; v_success INTEGER; v_errors INTEGER;
    v_paused    INTEGER; v_rate_lim INTEGER;
    v_avg_ms    NUMERIC;  v_p95_ms  NUMERIC;  v_tokens BIGINT;
BEGIN
    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE status = 'success'),
           COUNT(*) FILTER (WHERE status = 'error'),
           COUNT(*) FILTER (WHERE status = 'paused'),
           COUNT(*) FILTER (WHERE status = 'rate_limited'),
           ROUND(AVG(duration_ms)),
           PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms),
           SUM(openai_tokens)
    INTO v_total,v_success,v_errors,v_paused,v_rate_lim,v_avg_ms,v_p95_ms,v_tokens
    FROM execution_log WHERE clinic_id = p_clinic_id AND created_at >= v_since;

    RETURN json_build_object(
        'period_hours',         p_hours_back,
        'total_executions',     COALESCE(v_total, 0),
        'success_count',        COALESCE(v_success, 0),
        'error_count',          COALESCE(v_errors, 0),
        'paused_count',         COALESCE(v_paused, 0),
        'rate_limited_count',   COALESCE(v_rate_lim, 0),
        'success_rate_pct',     CASE WHEN v_total > 0 THEN ROUND(v_success::NUMERIC/v_total*100,1) ELSE 100 END,
        'avg_duration_ms',      COALESCE(v_avg_ms, 0),
        'p95_duration_ms',      COALESCE(v_p95_ms, 0),
        'total_openai_tokens',  COALESCE(v_tokens, 0),
        'generated_at',         now()
    );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
"""),

("get_system_health RPC", """
CREATE OR REPLACE FUNCTION get_system_health() RETURNS JSON AS $fn$
DECLARE
    v_active_clinics INTEGER; v_total_1h INTEGER; v_errors_1h INTEGER;
    v_paused_1h INTEGER; v_unknown_inboxes INTEGER; v_rate_limited_1h INTEGER;
    v_deleted INTEGER;
BEGIN
    DELETE FROM rate_limit_windows WHERE window_minute < now() - INTERVAL '2 hours';
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    SELECT COUNT(DISTINCT clinic_id) INTO v_active_clinics
    FROM execution_log WHERE created_at >= now() - INTERVAL '1 hour';

    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE status = 'error'),
           COUNT(*) FILTER (WHERE status = 'paused'),
           COUNT(*) FILTER (WHERE status = 'rate_limited')
    INTO v_total_1h, v_errors_1h, v_paused_1h, v_rate_limited_1h
    FROM execution_log WHERE created_at >= now() - INTERVAL '1 hour';

    SELECT COUNT(*) INTO v_unknown_inboxes
    FROM unknown_inbox_log WHERE last_seen_at >= now() - INTERVAL '24 hours';

    RETURN json_build_object(
        'ts',                   now(),
        'status',               CASE WHEN v_errors_1h > 50 THEN 'degraded'
                                     WHEN v_errors_1h > 10 THEN 'warning'
                                     ELSE 'healthy' END,
        'active_clinics_1h',    COALESCE(v_active_clinics, 0),
        'executions_1h',        COALESCE(v_total_1h, 0),
        'error_rate_1h_pct',    CASE WHEN v_total_1h > 0
                                    THEN ROUND(v_errors_1h::NUMERIC/v_total_1h*100,1) ELSE 0 END,
        'bot_paused_gates_1h',  COALESCE(v_paused_1h, 0),
        'rate_limited_1h',      COALESCE(v_rate_limited_1h, 0),
        'unknown_inboxes_24h',  COALESCE(v_unknown_inboxes, 0),
        'rate_windows_cleaned', v_deleted
    );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;
"""),

("get_error_summary RPC", """
CREATE OR REPLACE FUNCTION get_error_summary(p_hours_back INTEGER DEFAULT 1)
RETURNS TABLE (
    error_type TEXT, error_count BIGINT, clinic_count BIGINT,
    last_seen TIMESTAMPTZ, sample_message TEXT
) AS $fn$
BEGIN
    RETURN QUERY
    SELECT e.error_type, COUNT(*), COUNT(DISTINCT e.clinic_id),
           MAX(e.created_at), MAX(e.error_message)
    FROM execution_log e
    WHERE e.created_at >= now() - (p_hours_back || ' hours')::INTERVAL
      AND e.error_type IS NOT NULL
    GROUP BY e.error_type ORDER BY COUNT(*) DESC LIMIT 20;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
"""),

]

passed = sum(deploy(label, sql) for label, sql in steps)
total  = len(steps)

print(f"\n{'='*65}")
print(f"RESULTADOS: {passed}/{total}")
print(f"{'='*65}")

if passed == total:
    print("\n[SUCCESS] Migration 010 completa")
    print("\nNuevas capacidades:")
    print("  - check_rate_limit: throttling por clínica/operación")
    print("  - log_execution: audit log de cada ejecución del workflow")
    print("  - get_clinic_metrics: panel de métricas por clínica")
    print("  - get_system_health: health check global con auto-limpieza")
    print("  - get_error_summary: top errores para alertas")
else:
    print(f"\n[WARNING] {total - passed} steps fallaron")
    sys.exit(1)
