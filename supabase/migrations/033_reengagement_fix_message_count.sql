-- Migration 033: Fix re-engagement — lower message_count threshold to 1
-- Date: 2026-04-14
--
-- Razón: el caso más común de abandono es que el paciente manda 1 mensaje
-- ("quiero agendar una cita"), SofIA ofrece horarios, y el paciente no responde.
-- Con message_count >= 2, esos abandonos nunca recibían re-engagement.
-- Cambiamos a >= 1 para capturar este escenario.

CREATE OR REPLACE FUNCTION get_conversations_to_reengage()
RETURNS TABLE (
  chatwoot_conversation_id  TEXT,
  chatwoot_account_id       INTEGER,
  chatwoot_inbox_id         INTEGER,
  clinic_id                 UUID,
  clinic_name               TEXT,
  chatwoot_api_token        TEXT,
  patient_name              TEXT,
  phone                     TEXT,
  last_activity_at          TIMESTAMPTZ,
  reminder_type             TEXT,
  reengagement_id           UUID
) AS $$
BEGIN
  -- ─── R1: primera vez que aparece como abandonada (1.5h–3h de silencio) ───
  RETURN QUERY
  SELECT
    cv.chatwoot_conversation_id,
    c.chatwoot_account_id,
    c.chatwoot_inbox_id,
    cv.clinic_id,
    c.name                    AS clinic_name,
    NULL::TEXT                AS chatwoot_api_token,
    cv.patient_name,
    NULL::TEXT                AS phone,
    cv.last_activity_at,
    'R1'::TEXT                AS reminder_type,
    rr.id                     AS reengagement_id
  FROM conversations cv
  JOIN clinics c          ON c.id = cv.clinic_id
  JOIN conversation_metrics cm
                          ON cm.clinic_id = cv.clinic_id
                         AND cm.conversation_id = cv.chatwoot_conversation_id::INTEGER
  LEFT JOIN reengagement_reminders rr
                          ON rr.clinic_id = cv.clinic_id
                         AND rr.chatwoot_conversation_id = cv.chatwoot_conversation_id
  WHERE cv.status        = 'active'
    AND cv.bot_paused    = false
    AND cm.intent        = 'CREATE_EVENT'
    AND cm.booked        = false
    AND cm.message_count >= 1
    AND c.active = true
    AND (c.bot_config->>'reengagement_enabled' IS NULL
         OR c.bot_config->>'reengagement_enabled' = 'true')
    AND cv.last_activity_at BETWEEN now() - interval '3 hours'
                                AND now() - interval '1 hour 30 minutes'
    AND (
      rr.id IS NULL
      OR (rr.reminder_1_sent = false AND rr.stopped = false)
    )

  UNION ALL

  -- ─── R2: 22h–26h de silencio, R1 ya enviado, R2 aún no enviado ───────────
  SELECT
    cv.chatwoot_conversation_id,
    c.chatwoot_account_id,
    c.chatwoot_inbox_id,
    cv.clinic_id,
    c.name,
    NULL::TEXT,
    cv.patient_name,
    NULL::TEXT,
    cv.last_activity_at,
    'R2'::TEXT,
    rr.id
  FROM conversations cv
  JOIN clinics c          ON c.id = cv.clinic_id
  JOIN conversation_metrics cm
                          ON cm.clinic_id = cv.clinic_id
                         AND cm.conversation_id = cv.chatwoot_conversation_id::INTEGER
  JOIN reengagement_reminders rr
                          ON rr.clinic_id = cv.clinic_id
                         AND rr.chatwoot_conversation_id = cv.chatwoot_conversation_id
  WHERE cv.status        = 'active'
    AND cv.bot_paused    = false
    AND cm.intent        = 'CREATE_EVENT'
    AND cm.booked        = false
    AND c.active         = true
    AND (c.bot_config->>'reengagement_enabled' IS NULL
         OR c.bot_config->>'reengagement_enabled' = 'true')
    AND rr.reminder_1_sent = true
    AND rr.reminder_2_sent = false
    AND rr.stopped         = false
    AND cv.last_activity_at BETWEEN now() - interval '26 hours'
                                AND now() - interval '22 hours'

  ORDER BY last_activity_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_conversations_to_reengage() TO service_role;
