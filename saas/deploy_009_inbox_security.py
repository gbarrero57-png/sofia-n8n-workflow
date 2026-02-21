#!/usr/bin/env python3
"""Deploy Migration 009: Inbox Security & Multi-Tenant Hardening"""
import requests, sys
sys.stdout.reconfigure(encoding='utf-8')

SUPABASE_PROJECT_REF = "inhyrrjidhzrbqecnptn"
SUPABASE_ACCESS_TOKEN = "sbp_6173188bf253e74928c0a3129f8c747cfe7ab627"
MGMT_URL = f"https://api.supabase.com/v1/projects/{SUPABASE_PROJECT_REF}/database/query"
MGMT_HEADERS = {"Authorization": f"Bearer {SUPABASE_ACCESS_TOKEN}", "Content-Type": "application/json"}

def deploy(label, sql):
    r = requests.post(MGMT_URL, headers=MGMT_HEADERS, json={"query": sql})
    ok = r.status_code == 201
    print(f"  {'[OK]' if ok else '[ERROR]'} {label}")
    if not ok:
        print(f"       {r.text[:300]}")
    return ok

print("=" * 60)
print("Migration 009: Inbox Security & Multi-Tenant Hardening")
print("=" * 60)

results = []

# 1. Agregar columnas a clinics si no existen
results.append(deploy("clinics.is_active column", """
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clinics' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE clinics ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clinics' AND column_name = 'chatwoot_account_id'
    ) THEN
        ALTER TABLE clinics ADD COLUMN chatwoot_account_id INTEGER;
    END IF;
END $$;
"""))

# 2. Tabla unknown_inbox_log
results.append(deploy("unknown_inbox_log table", """
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
"""))

# 3. Índice + RLS en unknown_inbox_log
results.append(deploy("unknown_inbox_log index + RLS", """
CREATE INDEX IF NOT EXISTS idx_unknown_inbox_last_seen
    ON unknown_inbox_log (last_seen_at DESC);

ALTER TABLE unknown_inbox_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS unknown_inbox_service_only ON unknown_inbox_log;
CREATE POLICY unknown_inbox_service_only ON unknown_inbox_log
    FOR ALL
    USING (auth.role() = 'service_role');
"""))

# 4. resolve_clinic hardened
results.append(deploy("resolve_clinic (hardened - registra unknown inboxes)", """
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
    v_row_count INTEGER := 0;
BEGIN
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
      AND c.is_active = true
    LIMIT 1;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    IF v_row_count = 0 THEN
        INSERT INTO unknown_inbox_log (inbox_id, account_id, sample_payload)
        VALUES (
            p_inbox_id,
            p_account_id,
            json_build_object('inbox_id', p_inbox_id, 'account_id', p_account_id, 'ts', now())
        )
        ON CONFLICT (inbox_id) DO UPDATE SET
            attempt_count = unknown_inbox_log.attempt_count + 1,
            last_seen_at  = now(),
            account_id    = COALESCE(EXCLUDED.account_id, unknown_inbox_log.account_id);
    END IF;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;
"""))

# 5. validate_inbox_clinic
results.append(deploy("validate_inbox_clinic (cross-validation)", """
CREATE OR REPLACE FUNCTION validate_inbox_clinic(
    p_inbox_id  INTEGER,
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
"""))

# 6. get_unknown_inboxes (para dashboard/alertas)
results.append(deploy("get_unknown_inboxes (alertas de misconfiguracion)", """
CREATE OR REPLACE FUNCTION get_unknown_inboxes(p_limit INTEGER DEFAULT 20)
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
"""))

passed = sum(results)
total  = len(results)

print(f"\n{'='*60}")
print(f"RESULTADOS: {passed}/{total} deployados")
print(f"{'='*60}")

if passed == total:
    print("\n[SUCCESS] Migration 009 completa")
    print("\nNuevas capacidades:")
    print("  - resolve_clinic registra inboxes desconocidos automáticamente")
    print("  - validate_inbox_clinic verifica inbox↔clinic en Bot Pause Check")
    print("  - get_unknown_inboxes disponible para dashboard de alertas")
    print("  - clinics.is_active permite desactivar clínicas sin borrar")
else:
    print(f"\n[WARNING] {total - passed} funciones fallaron")
    sys.exit(1)
