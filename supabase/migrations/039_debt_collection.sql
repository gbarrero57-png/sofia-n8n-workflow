-- Migration 039: Cobranza activa — función de pacientes con deuda + log de recordatorios
--
-- AGREGA:
--   1. get_overdue_patients_with_phone — pacientes con pagos vencidos y teléfono registrado
--   2. debt_reminders                  — log de recordatorios WhatsApp enviados
--   3. get_clinic_reminder_stats       — para el dashboard admin

-- ── 1. Función: get_overdue_patients_with_phone ───────────────────────────────
CREATE OR REPLACE FUNCTION public.get_overdue_patients_with_phone(
  p_clinic_id        uuid,
  p_min_overdue_days int DEFAULT 0   -- 0 = cualquier vencido, 7 = al menos 7 días
)
RETURNS TABLE (
  patient_id    uuid,
  full_name     text,
  phone         text,
  total_overdue numeric,
  payment_count bigint,
  oldest_due    date
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pat.id                AS patient_id,
    pat.full_name,
    pat.phone,
    SUM(pay.amount)       AS total_overdue,
    COUNT(pay.id)         AS payment_count,
    MIN(pay.due_date)     AS oldest_due
  FROM public.payments pay
  JOIN public.patients  pat ON pat.id = pay.patient_id
  WHERE pay.clinic_id  = p_clinic_id
    AND pay.status     IN ('pending', 'partial')
    AND pay.due_date    < CURRENT_DATE - p_min_overdue_days
    AND pat.phone       IS NOT NULL
    AND pat.deleted_at  IS NULL
  GROUP BY pat.id, pat.full_name, pat.phone
  ORDER BY oldest_due ASC;
$$;

-- ── 2. Tabla: debt_reminders ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.debt_reminders (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id          uuid        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  patient_phone       text        NOT NULL,
  amount_reminded     numeric(10,2),
  twilio_message_sid  text,
  status              text        NOT NULL DEFAULT 'sent'
                      CHECK (status IN ('sent','failed','skipped')),
  error_message       text,
  sent_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS debt_reminders_clinic  ON public.debt_reminders (clinic_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS debt_reminders_patient ON public.debt_reminders (patient_id);

ALTER TABLE public.debt_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_debt_reminders_select"
  ON public.debt_reminders FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM public.staff WHERE user_id = auth.uid()));

-- ── 3. Función: get_clinic_reminder_stats ─────────────────────────────────────
-- Cuántos recordatorios se enviaron hoy / en los últimos 7 días
CREATE OR REPLACE FUNCTION public.get_clinic_reminder_stats(
  p_clinic_id uuid
)
RETURNS TABLE (
  sent_today   bigint,
  sent_7days   bigint,
  last_sent_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(CASE WHEN sent_at >= CURRENT_DATE THEN 1 END)                  AS sent_today,
    COUNT(CASE WHEN sent_at >= CURRENT_DATE - 7 THEN 1 END)              AS sent_7days,
    MAX(sent_at)                                                          AS last_sent_at
  FROM public.debt_reminders
  WHERE clinic_id = p_clinic_id
    AND status    = 'sent';
$$;
