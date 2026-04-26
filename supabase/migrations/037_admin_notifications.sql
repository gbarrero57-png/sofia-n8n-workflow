-- Migration 037: Admin appointment notifications
-- Adds admin_notify_phone to clinics + tracking table for pending confirmations

-- ── 1. admin_notify_phone en clinics ─────────────────────────────────────────
ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS admin_notify_phone text;

-- ── 2. Tabla admin_notifications ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_notifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id    uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  clinic_id         uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  admin_phone       text NOT NULL,
  patient_phone     text,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  source            text NOT NULL DEFAULT 'bot'
                    CHECK (source IN ('bot', 'manual')),
  sent_at           timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz,
  twilio_message_sid text
);

CREATE INDEX IF NOT EXISTS admin_notifications_clinic_pending
  ON admin_notifications (clinic_id, status, sent_at DESC);

CREATE INDEX IF NOT EXISTS admin_notifications_appointment
  ON admin_notifications (appointment_id);

-- RLS
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (bot + n8n)
-- Staff/admin can read their clinic's notifications
CREATE POLICY "clinic_read_own_notifications"
  ON admin_notifications FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

-- ── 3. Función: get_clinic_admin_phone ───────────────────────────────────────
-- Usada por Bot Pause Check para saber si el remitente es el admin de la clínica
CREATE OR REPLACE FUNCTION get_clinic_admin_phone(
  p_clinic_id uuid
)
RETURNS TABLE (admin_notify_phone text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT admin_notify_phone FROM clinics WHERE id = p_clinic_id;
$$;

-- ── 4. Función: get_pending_admin_notification ────────────────────────────────
-- Devuelve la notificación pendiente más reciente para un admin_phone
-- Usada por el bot cuando el admin pulsa Confirmar/Cancelar
CREATE OR REPLACE FUNCTION get_pending_admin_notification(
  p_admin_phone text
)
RETURNS TABLE (
  notification_id   uuid,
  appointment_id    uuid,
  clinic_id         uuid,
  patient_phone     text,
  patient_name      text,
  start_time        timestamptz,
  service           text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    an.id,
    an.appointment_id,
    an.clinic_id,
    an.patient_phone,
    a.patient_name,
    a.start_time,
    a.service
  FROM admin_notifications an
  JOIN appointments a ON a.id = an.appointment_id
  WHERE an.admin_phone = regexp_replace(p_admin_phone, '^whatsapp:', '')
    AND an.status = 'pending'
  ORDER BY an.sent_at DESC
  LIMIT 1;
END;
$$;

-- ── 5. Función: resolve_admin_notification ────────────────────────────────────
-- Resuelve la notificación (confirm/cancel) y actualiza el appointment
CREATE OR REPLACE FUNCTION resolve_admin_notification(
  p_notification_id uuid,
  p_action          text  -- 'confirmed' | 'cancelled'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt_id    uuid;
  v_new_status text;
BEGIN
  IF p_action NOT IN ('confirmed', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid action');
  END IF;

  -- Marcar notificación resuelta
  UPDATE admin_notifications
  SET status = p_action, resolved_at = now()
  WHERE id = p_notification_id
  RETURNING appointment_id INTO v_appt_id;

  IF v_appt_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'notification not found');
  END IF;

  -- Actualizar appointment
  v_new_status := CASE p_action WHEN 'confirmed' THEN 'confirmed' ELSE 'cancelled' END;
  UPDATE appointments
  SET status = v_new_status, updated_at = now()
  WHERE id = v_appt_id;

  RETURN jsonb_build_object(
    'success',         true,
    'appointment_id',  v_appt_id,
    'new_status',      v_new_status
  );
END;
$$;

-- ── 6. Seed: admin_notify_phone para clínicas existentes ─────────────────────
UPDATE clinics SET admin_notify_phone = '+51905858566'
WHERE id = 'c6c15fca-d7fc-4d98-83c1-2c5cb5a6bef1';  -- SofIA Demo / Gabriel
