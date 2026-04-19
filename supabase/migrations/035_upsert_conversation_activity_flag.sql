-- ============================================================
-- Migration 035: upsert_conversation — p_update_activity flag
-- Prevents outgoing SofIA messages from resetting last_activity_at,
-- which was blocking the re-engagement cron from ever finding
-- conversations in the R1/R2 windows.
-- ============================================================

CREATE OR REPLACE FUNCTION upsert_conversation(
    p_clinic_id UUID,
    p_chatwoot_conversation_id TEXT,
    p_patient_name TEXT DEFAULT NULL,
    p_last_message TEXT DEFAULT NULL,
    p_update_activity BOOLEAN DEFAULT true
)
RETURNS TABLE (
    conversation_id UUID,
    bot_paused BOOLEAN,
    status TEXT
) AS $$
DECLARE
    v_id UUID;
    v_paused BOOLEAN;
    v_status TEXT;
BEGIN
    INSERT INTO conversations (
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
