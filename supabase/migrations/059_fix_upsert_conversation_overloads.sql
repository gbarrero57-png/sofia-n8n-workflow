-- ============================================================
-- 059_fix_upsert_conversation_overloads.sql
--
-- Problem: migrations 007 and 035 each created a NEW overload
-- of upsert_conversation (4-param vs 5-param) instead of
-- replacing the previous one.
-- PostgreSQL raises "function is not unique" on any call,
-- causing all governance tests to fail.
--
-- Fix: drop both overloads, keep only the latest 5-param version
-- (with p_update_activity flag from migration 035).
-- ============================================================

DROP FUNCTION IF EXISTS public.upsert_conversation(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.upsert_conversation(UUID, TEXT, TEXT, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.upsert_conversation(
    p_clinic_id                UUID,
    p_chatwoot_conversation_id TEXT,
    p_patient_name             TEXT    DEFAULT NULL,
    p_last_message             TEXT    DEFAULT NULL,
    p_update_activity          BOOLEAN DEFAULT true
)
RETURNS TABLE (
    conversation_id UUID,
    bot_paused      BOOLEAN,
    status          TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_id     UUID;
    v_paused BOOLEAN;
    v_status TEXT;
BEGIN
    INSERT INTO public.conversations (
        clinic_id, chatwoot_conversation_id, patient_name, last_message, last_activity_at
    ) VALUES (
        p_clinic_id, p_chatwoot_conversation_id, p_patient_name, p_last_message, now()
    )
    ON CONFLICT (clinic_id, chatwoot_conversation_id) DO UPDATE SET
        last_message     = COALESCE(EXCLUDED.last_message, conversations.last_message),
        patient_name     = COALESCE(EXCLUDED.patient_name, conversations.patient_name),
        last_activity_at = CASE WHEN p_update_activity THEN now()
                                ELSE conversations.last_activity_at END
    RETURNING conversations.id, conversations.bot_paused, conversations.status::TEXT
    INTO v_id, v_paused, v_status;

    RETURN QUERY SELECT v_id, v_paused, v_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_conversation(UUID, TEXT, TEXT, TEXT, BOOLEAN)
  TO authenticated, service_role;
