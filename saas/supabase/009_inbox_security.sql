-- ============================================================
-- SofIA SaaS - Inbox Security & Multi-Tenant Hardening
-- Migration 009: Eliminar DEFAULT_CLINIC + trazabilidad
--
-- Cambios:
--   1. Tabla unknown_inbox_log: registra inboxes no registrados
--   2. resolve_clinic: rechaza inbox desconocido (no silencia)
--   3. cross_validate_inbox_clinic: valida inbox ↔ clinic antes de write
-- ============================================================

-- ============================================================
-- TABLA: unknown_inbox_log
-- Registra intentos de webhook desde inboxes no configurados.
-- Alimenta alertas y detecta misconfiguraciones.
-- ============================================================

CREATE TABLE IF NOT EXISTS unknown_inbox_log (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inbox_id            INTEGER NOT NULL,
    account_id          INTEGER,
    attempt_count       INTEGER NOT NULL DEFAULT 1,
    first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    sample_payload      JSONB,

    CONSTRAINT unique_unknown_inbox UNIQUE (inbox_id)
);

COMMENT ON TABLE unknown_inbox_log IS
    'Inboxes de Chatwoot que llegan al webhook pero no están registrados en clinics';

CREATE INDEX idx_unknown_inbox_last_seen
    ON unknown_inbox_log (last_seen_at DESC);

-- RLS: solo service_role puede escribir (n8n)
ALTER TABLE unknown_inbox_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY unknown_inbox_service_only ON unknown_inbox_log
    FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================================
-- FUNCIÓN: resolve_clinic (hardened)
-- Versión anterior: retornaba vacío si no encontraba clínica.
-- Versión nueva: registra el intento y señaliza el error.
-- ============================================================

CREATE OR REPLACE FUNCTION resolve_clinic(
    p_inbox_id INTEGER,
    p_account_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
    clinic_id       UUID,
    clinic_name     TEXT,
    calendar_id     TEXT,
    timezone        TEXT,
    bot_config      JSONB,
    inbox_id        INTEGER
) AS $fn$
DECLARE
    v_found BOOLEAN := false;
BEGIN
    -- Intentar resolver la clínica
    RETURN QUERY
    SELECT
        c.id,
        c.name,
        c.calendar_id,
        c.timezone,
        c.bot_config,
        p_inbox_id
    FROM clinics c
    WHERE c.chatwoot_inbox_id = p_inbox_id
      AND (p_account_id IS NULL OR c.chatwoot_account_id = p_account_id)
      AND c.is_active = true
    LIMIT 1;

    GET DIAGNOSTICS v_found = ROW_COUNT;

    -- Si no se encontró: registrar el intento
    IF NOT v_found THEN
        INSERT INTO unknown_inbox_log (inbox_id, account_id, sample_payload)
        VALUES (
            p_inbox_id,
            p_account_id,
            json_build_object('inbox_id', p_inbox_id, 'account_id', p_account_id, 'ts', now())
        )
        ON CONFLICT (inbox_id) DO UPDATE SET
            attempt_count    = unknown_inbox_log.attempt_count + 1,
            last_seen_at     = now(),
            account_id       = COALESCE(EXCLUDED.account_id, unknown_inbox_log.account_id);

        -- No retornar nada — el código n8n detectará rows vacíos
        -- y lanzará error explícito
    END IF;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCIÓN: validate_inbox_clinic
-- Validación cruzada inbox_id ↔ clinic_id.
-- Llamada como doble-check antes de writes de governance.
-- Retorna TRUE si son consistentes, FALSE si hay manipulación.
-- ============================================================

CREATE OR REPLACE FUNCTION validate_inbox_clinic(
    p_inbox_id INTEGER,
    p_clinic_id UUID
)
RETURNS BOOLEAN AS $fn$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM clinics
    WHERE chatwoot_inbox_id = p_inbox_id
      AND id = p_clinic_id
      AND is_active = true;

    RETURN v_count > 0;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- FUNCIÓN: get_unknown_inboxes (para dashboard/alertas)
-- Retorna inboxes no registrados ordenados por recencia.
-- ============================================================

CREATE OR REPLACE FUNCTION get_unknown_inboxes(
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    inbox_id        INTEGER,
    attempt_count   INTEGER,
    first_seen_at   TIMESTAMPTZ,
    last_seen_at    TIMESTAMPTZ
) AS $fn$
BEGIN
    RETURN QUERY
    SELECT u.inbox_id, u.attempt_count, u.first_seen_at, u.last_seen_at
    FROM unknown_inbox_log u
    ORDER BY u.last_seen_at DESC
    LIMIT LEAST(p_limit, 100);
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- VERIFICAR que clinics tiene columna is_active
-- Si no existe, agregarla con default true
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clinics' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE clinics ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
        COMMENT ON COLUMN clinics.is_active IS 'Si false, el webhook rechaza mensajes de esta clínica';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clinics' AND column_name = 'chatwoot_account_id'
    ) THEN
        ALTER TABLE clinics ADD COLUMN chatwoot_account_id INTEGER;
        COMMENT ON COLUMN clinics.chatwoot_account_id IS 'Chatwoot account_id para validación cruzada';
    END IF;
END $$;
