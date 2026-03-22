-- ============================================================
-- SofIA SaaS — Migration 026
-- Add admin_email to resolve_clinic() return type
-- So n8n can send escalation email notifications to the clinic
-- ============================================================

-- Must DROP first because return type changes
DROP FUNCTION IF EXISTS public.resolve_clinic(INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.resolve_clinic(
    p_inbox_id  INTEGER DEFAULT NULL,
    p_account_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
    clinic_id   UUID,
    clinic_name TEXT,
    calendar_id TEXT,
    timezone    TEXT,
    bot_config  JSONB,
    admin_email TEXT    -- NEW: clinic contact email for escalation notifications
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id          AS clinic_id,
        c.name        AS clinic_name,
        c.calendar_id,
        c.timezone,
        c.bot_config,
        c.admin_email
    FROM public.clinics c
    WHERE c.active = true
      AND (p_inbox_id   IS NULL OR c.chatwoot_inbox_id   = p_inbox_id)
      AND (p_account_id IS NULL OR c.chatwoot_account_id = p_account_id)
    LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.resolve_clinic(INTEGER, INTEGER) IS
    'Maps Chatwoot inbox_id to clinic context. '
    'Updated in migration 026 to include admin_email for escalation notifications.';

-- ============================================================
-- VERIFY (run manually after deploy):
-- SELECT clinic_id, clinic_name, admin_email
-- FROM resolve_clinic(2, NULL);
-- ============================================================
