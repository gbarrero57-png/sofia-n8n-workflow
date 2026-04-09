-- Migration 031: Re-engagement Reminders — recordatorios para conversaciones abandonadas
-- Date: 2026-04-09
--
-- Lógica:
--   Detecta conversaciones donde el paciente pidió una cita (CREATE_EVENT),
--   recibió opciones de horario pero no eligió ninguna (booked = false, label awaiting_slot),
--   y dejó de responder. Se envían hasta 2 recordatorios:
--     R1: ~2h después del último mensaje (dentro ventana 24h WhatsApp — texto libre)
--     R2: ~24h después del último mensaje (fuera ventana — requiere template Twilio)
--
-- Tablas: reengagement_reminders
-- Funciones: get_conversations_to_reengage(), mark_reengagement_sent(), stop_reengagement()

-- ── 1. Tabla de tracking de re-engagement ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS reengagement_reminders (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                 UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  chatwoot_conversation_id  TEXT        NOT NULL,
  chatwoot_account_id       INTEGER     NOT NULL,
  chatwoot_inbox_id         INTEGER     NOT NULL,
  patient_name              TEXT,
  phone                     TEXT,
  -- Estado de recordatorios
  reminder_1_sent           BOOLEAN     NOT NULL DEFAULT false,
  reminder_1_sent_at        TIMESTAMPTZ,
  reminder_2_sent           BOOLEAN     NOT NULL DEFAULT false,
  reminder_2_sent_at        TIMESTAMPTZ,
  -- Parar recordatorios cuando el paciente responde, agenda, o humano toma control
  stopped                   BOOLEAN     NOT NULL DEFAULT false,
  stopped_reason            TEXT,       -- 'booked' | 'human_takeover' | 'replied' | 'max_reminders'
  stopped_at                TIMESTAMPTZ,
  -- Metadata
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_reengagement_conversation UNIQUE (clinic_id, chatwoot_conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_reeng_clinic_conv
  ON reengagement_reminders (clinic_id, chatwoot_conversation_id);

CREATE INDEX IF NOT EXISTS idx_reeng_pending
  ON reengagement_reminders (clinic_id, stopped, reminder_1_sent, reminder_2_sent)
  WHERE stopped = false;

CREATE TRIGGER trg_reengagement_updated
  BEFORE UPDATE ON reengagement_reminders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 2. get_conversations_to_reengage() ────────────────────────────────────────
-- Devuelve conversaciones abandonadas que necesitan R1 o R2.
-- Se llama desde el cron de n8n cada hora.
--
-- Criterios de abandono:
--   - intent = 'CREATE_EVENT' y booked = false
--   - bot_paused = false y status = 'active'
--   - message_count >= 2 (hubo intercambio real)
--   - Silencio: R1 entre 1h30m y 3h, R2 entre 22h y 26h
--
-- Returns: reminder_type = 'R1' | 'R2'
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
  reminder_type             TEXT,         -- 'R1' | 'R2'
  reengagement_id           UUID          -- NULL si aún no existe fila en reengagement_reminders
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
    NULL::TEXT                AS chatwoot_api_token,  -- clinics no tiene esta columna; workflow usa fallback hardcoded
    cv.patient_name,
    NULL::TEXT                AS phone,  -- phone no disponible sin appointment; Chatwoot solo necesita conversation_id
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
    AND cm.message_count >= 2
    -- Ventana R1: entre 1h30m y 3h de silencio
    AND cv.last_activity_at BETWEEN now() - interval '3 hours'
                                AND now() - interval '1 hour 30 minutes'
    -- No existe fila aún (primera vez) O fila existe pero R1 no enviado y no parado
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
    AND rr.reminder_1_sent = true
    AND rr.reminder_2_sent = false
    AND rr.stopped         = false
    -- Ventana R2: entre 22h y 26h desde el último mensaje
    AND cv.last_activity_at BETWEEN now() - interval '26 hours'
                                AND now() - interval '22 hours'

  ORDER BY last_activity_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 3. mark_reengagement_sent() ───────────────────────────────────────────────
-- Crea o actualiza la fila de reengagement_reminders al enviar un recordatorio.
CREATE OR REPLACE FUNCTION mark_reengagement_sent(
  p_clinic_id               UUID,
  p_chatwoot_conversation_id TEXT,
  p_chatwoot_account_id     INTEGER,
  p_chatwoot_inbox_id       INTEGER,
  p_patient_name            TEXT,
  p_phone                   TEXT,
  p_reminder_type           TEXT   -- 'R1' | 'R2'
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO reengagement_reminders (
    clinic_id, chatwoot_conversation_id, chatwoot_account_id, chatwoot_inbox_id,
    patient_name, phone
  )
  VALUES (
    p_clinic_id, p_chatwoot_conversation_id, p_chatwoot_account_id, p_chatwoot_inbox_id,
    p_patient_name, p_phone
  )
  ON CONFLICT (clinic_id, chatwoot_conversation_id) DO NOTHING;

  -- Obtener ID
  SELECT id INTO v_id
  FROM reengagement_reminders
  WHERE clinic_id = p_clinic_id
    AND chatwoot_conversation_id = p_chatwoot_conversation_id;

  -- Marcar el tipo de recordatorio enviado
  IF p_reminder_type = 'R1' THEN
    UPDATE reengagement_reminders SET
      reminder_1_sent    = true,
      reminder_1_sent_at = now()
    WHERE id = v_id;
  ELSIF p_reminder_type = 'R2' THEN
    UPDATE reengagement_reminders SET
      reminder_2_sent    = true,
      reminder_2_sent_at = now(),
      stopped            = true,
      stopped_reason     = 'max_reminders',
      stopped_at         = now()
    WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. stop_reengagement() ────────────────────────────────────────────────────
-- Detiene los recordatorios cuando el paciente agenda, responde, o humano toma control.
-- Puede llamarse desde el webhook principal de SofIA al detectar respuesta o booking.
CREATE OR REPLACE FUNCTION stop_reengagement(
  p_clinic_id               UUID,
  p_chatwoot_conversation_id TEXT,
  p_reason                  TEXT DEFAULT 'replied'  -- 'booked' | 'human_takeover' | 'replied'
)
RETURNS VOID AS $$
BEGIN
  UPDATE reengagement_reminders SET
    stopped        = true,
    stopped_reason = p_reason,
    stopped_at     = now()
  WHERE clinic_id               = p_clinic_id
    AND chatwoot_conversation_id = p_chatwoot_conversation_id
    AND stopped                 = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 5. RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE reengagement_reminders ENABLE ROW LEVEL SECURITY;

-- service_role: acceso total (n8n usa service_role)
CREATE POLICY reengagement_service_all ON reengagement_reminders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- authenticated (staff/admin): solo su clínica
CREATE POLICY reengagement_clinic_read ON reengagement_reminders
  FOR SELECT TO authenticated
  USING (
    clinic_id IN (
      SELECT id FROM clinics
      WHERE id = (auth.jwt()->'app_metadata'->>'clinic_id')::UUID
    )
  );

-- ── 6. Grants ──────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION get_conversations_to_reengage()                                              TO service_role;
GRANT EXECUTE ON FUNCTION mark_reengagement_sent(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT)       TO service_role;
GRANT EXECUTE ON FUNCTION stop_reengagement(UUID, TEXT, TEXT)                                          TO service_role;
GRANT ALL     ON TABLE reengagement_reminders                                                          TO service_role;
