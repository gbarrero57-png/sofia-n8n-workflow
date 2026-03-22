-- Migration 018: Reminders v2 — recordatorios de CITA y PAGO para pacientes de cada clínica
-- Date: 2026-03-16
--
-- Lógica:
--   1. Recordatorio de CITA   → paciente con cita en las próximas 24h (ya existe, se mejora)
--   2. Recordatorio de PAGO   → paciente con pago pendiente cuya cita es en las próximas 24h
--                               O paciente con pago vencido (cita completada, pago aún pendiente)
--
-- Cambios:
--   1. appointments: agrega payment_status, payment_amount, payment_currency,
--                    payment_reminder_sent, payment_reminder_sent_at
--   2. payment_reminder_log: tabla para auditoría de recordatorios de pago por cita/paciente
--   3. get_pending_reminders(): corregida — agrega chatwoot_inbox_id, filtra conversation_id NULL
--   4. get_pending_payment_reminders(): nueva — pacientes con pago pendiente
--   5. mark_payment_reminder_sent(): nueva — marca recordatorio de pago enviado

-- ── 1. Extender appointments con campos de pago ────────────────────────────────
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS payment_status         TEXT NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS payment_amount         DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS payment_currency       TEXT NOT NULL DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS payment_reminder_sent     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_reminder_sent_at  TIMESTAMPTZ;

-- payment_status values:
--   not_required  → la cita no genera cobro
--   pending       → pago pendiente (monto definido o no)
--   paid          → pago recibido
--   partial       → pago parcial
--   waived        → condonado

-- ── 2. Tabla de auditoría de recordatorios de pago a pacientes ────────────────
CREATE TABLE IF NOT EXISTS payment_reminder_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  UUID        NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  clinic_id       UUID        NOT NULL REFERENCES clinics(id)      ON DELETE CASCADE,
  patient_name    TEXT,
  phone           TEXT,
  days_label      TEXT,       -- 'manana', 'vencido_3d', etc.
  channel         TEXT        NOT NULL DEFAULT 'whatsapp',
  status          TEXT        NOT NULL DEFAULT 'sent',  -- sent | failed | skipped
  error_message   TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prl_appointment ON payment_reminder_log(appointment_id);
CREATE INDEX IF NOT EXISTS idx_prl_clinic      ON payment_reminder_log(clinic_id);
CREATE INDEX IF NOT EXISTS idx_prl_sent        ON payment_reminder_log(sent_at DESC);

-- ── 3. Actualizar get_pending_reminders() — agrega chatwoot_inbox_id ─────────
CREATE OR REPLACE FUNCTION get_pending_reminders()
RETURNS TABLE (
  appointment_id      UUID,
  clinic_id           UUID,
  conversation_id     INTEGER,
  patient_name        TEXT,
  phone               TEXT,
  service             TEXT,
  start_time          TIMESTAMPTZ,
  clinic_name         TEXT,
  chatwoot_account_id INTEGER,
  chatwoot_inbox_id   INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id                  AS appointment_id,
    a.clinic_id,
    a.conversation_id,
    a.patient_name,
    a.phone,
    a.service,
    a.start_time,
    c.name                AS clinic_name,
    c.chatwoot_account_id,
    c.chatwoot_inbox_id
  FROM appointments a
  JOIN clinics c ON c.id = a.clinic_id
  WHERE a.status IN ('scheduled', 'confirmed')
    AND a.reminder_sent      = false
    AND a.conversation_id    IS NOT NULL   -- solo citas agendadas por bot
    AND a.start_time BETWEEN now() + interval '23 hours'
                         AND now() + interval '25 hours'
  ORDER BY a.start_time;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. Nueva: get_pending_payment_reminders() ─────────────────────────────────
-- Retorna pacientes con pago pendiente en dos escenarios:
--   A) Cita mañana + pago pendiente   → recordar antes de la cita
--   B) Cita completada hace ≤30 días  → recordar cobro vencido
CREATE OR REPLACE FUNCTION get_pending_payment_reminders()
RETURNS TABLE (
  appointment_id      UUID,
  clinic_id           UUID,
  conversation_id     INTEGER,
  patient_name        TEXT,
  phone               TEXT,
  service             TEXT,
  start_time          TIMESTAMPTZ,
  payment_amount      DECIMAL(10,2),
  payment_currency    TEXT,
  payment_status      TEXT,
  clinic_name         TEXT,
  chatwoot_account_id INTEGER,
  chatwoot_inbox_id   INTEGER,
  reminder_type       TEXT     -- 'pre_cita' | 'cobro_vencido'
) AS $$
BEGIN
  -- A: Pago pendiente cuya cita es mañana
  RETURN QUERY
  SELECT
    a.id                  AS appointment_id,
    a.clinic_id,
    a.conversation_id,
    a.patient_name,
    a.phone,
    a.service,
    a.start_time,
    a.payment_amount,
    a.payment_currency,
    a.payment_status,
    c.name                AS clinic_name,
    c.chatwoot_account_id,
    c.chatwoot_inbox_id,
    'pre_cita'::TEXT      AS reminder_type
  FROM appointments a
  JOIN clinics c ON c.id = a.clinic_id
  WHERE a.payment_status IN ('pending', 'partial')
    AND a.payment_reminder_sent = false
    AND a.conversation_id IS NOT NULL
    AND a.start_time BETWEEN now() + interval '23 hours'
                         AND now() + interval '25 hours'

  UNION ALL

  -- B: Cita completada con cobro vencido (hasta 30 días atrás)
  SELECT
    a.id,
    a.clinic_id,
    a.conversation_id,
    a.patient_name,
    a.phone,
    a.service,
    a.start_time,
    a.payment_amount,
    a.payment_currency,
    a.payment_status,
    c.name,
    c.chatwoot_account_id,
    c.chatwoot_inbox_id,
    'cobro_vencido'::TEXT AS reminder_type
  FROM appointments a
  JOIN clinics c ON c.id = a.clinic_id
  WHERE a.payment_status IN ('pending', 'partial')
    AND a.payment_reminder_sent = false
    AND a.conversation_id IS NOT NULL
    AND a.status = 'completed'
    AND a.start_time BETWEEN now() - interval '30 days' AND now() - interval '1 hour'
    -- No recordar más de una vez por día
    AND NOT EXISTS (
      SELECT 1 FROM payment_reminder_log pl
      WHERE pl.appointment_id = a.id
        AND pl.status = 'sent'
        AND pl.sent_at >= now() - interval '20 hours'
    )

  ORDER BY start_time;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 5. Nueva: mark_payment_reminder_sent() ────────────────────────────────────
CREATE OR REPLACE FUNCTION mark_payment_reminder_sent(
  p_appointment_id UUID,
  p_days_label     TEXT    DEFAULT 'manana',
  p_channel        TEXT    DEFAULT 'whatsapp',
  p_status         TEXT    DEFAULT 'sent',
  p_error          TEXT    DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_clinic_id  UUID;
  v_patient    TEXT;
  v_phone      TEXT;
BEGIN
  SELECT clinic_id, patient_name, phone
    INTO v_clinic_id, v_patient, v_phone
    FROM appointments WHERE id = p_appointment_id;

  -- Marcar en el appointment
  IF p_status = 'sent' THEN
    UPDATE appointments SET
      payment_reminder_sent    = true,
      payment_reminder_sent_at = now()
    WHERE id = p_appointment_id;
  END IF;

  -- Loguear
  INSERT INTO payment_reminder_log
    (appointment_id, clinic_id, patient_name, phone, days_label, channel, status, error_message)
  VALUES
    (p_appointment_id, v_clinic_id, v_patient, v_phone, p_days_label, p_channel, p_status, p_error);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 6. Grants ──────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION get_pending_reminders()                                          TO service_role;
GRANT EXECUTE ON FUNCTION get_pending_payment_reminders()                                  TO service_role;
GRANT EXECUTE ON FUNCTION mark_payment_reminder_sent(UUID, TEXT, TEXT, TEXT, TEXT)         TO service_role;
GRANT ALL     ON TABLE payment_reminder_log                                                TO service_role;
