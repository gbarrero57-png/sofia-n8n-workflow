-- ============================================================
-- 046_crm_enhancement.sql
-- CRM expandido: notas staff, recordatorios, NPS, tags,
-- seguro médico, recall, LTV, cumpleaños, antecedentes
-- ============================================================

-- ── 1. Columnas nuevas en patients ───────────────────────────

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS tags              text[]    DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_vip            boolean   DEFAULT false,
  ADD COLUMN IF NOT EXISTS insurance_company text,
  ADD COLUMN IF NOT EXISTS insurance_policy  text,
  ADD COLUMN IF NOT EXISTS insurance_expiry  date,
  ADD COLUMN IF NOT EXISTS chronic_conditions   text,
  ADD COLUMN IF NOT EXISTS current_medications  text,
  ADD COLUMN IF NOT EXISTS recall_interval_months int DEFAULT 6,
  ADD COLUMN IF NOT EXISTS next_recall_due   date,
  ADD COLUMN IF NOT EXISTS last_recall_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS birthday_msg_sent_year int,
  ADD COLUMN IF NOT EXISTS referrer_patient_id uuid REFERENCES public.patients(id);

-- ── 2. Columnas nuevas en appointments ───────────────────────

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS nps_sent    boolean   DEFAULT false,
  ADD COLUMN IF NOT EXISTS nps_sent_at timestamptz;

-- ── 3. Tabla patient_notes (notas internas del staff) ────────

CREATE TABLE IF NOT EXISTS public.patient_notes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid        NOT NULL REFERENCES public.clinics(id),
  patient_id      uuid        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  content         text        NOT NULL,
  created_by_name text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_patient_notes_patient
  ON public.patient_notes(clinic_id, patient_id)
  WHERE deleted_at IS NULL;

-- ── 4. Tabla patient_reminders (recordatorios para el staff) ─

CREATE TABLE IF NOT EXISTS public.patient_reminders (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid        NOT NULL REFERENCES public.clinics(id),
  patient_id      uuid        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  title           text        NOT NULL,
  due_date        date        NOT NULL,
  completed       boolean     DEFAULT false,
  completed_at    timestamptz,
  created_by_name text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_reminders_patient
  ON public.patient_reminders(clinic_id, patient_id)
  WHERE completed = false;

CREATE INDEX IF NOT EXISTS idx_patient_reminders_due
  ON public.patient_reminders(clinic_id, due_date)
  WHERE completed = false;

-- ── 5. Tabla nps_responses ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.nps_responses (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      uuid        NOT NULL REFERENCES public.clinics(id),
  patient_id     uuid        REFERENCES public.patients(id),
  appointment_id uuid        REFERENCES public.appointments(id),
  score          int         NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment        text,
  phone          text,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nps_responses_clinic
  ON public.nps_responses(clinic_id, created_at DESC);

-- ── 6. RLS en tablas nuevas ───────────────────────────────────

ALTER TABLE public.patient_notes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nps_responses     ENABLE ROW LEVEL SECURITY;

-- Staff puede ver/modificar registros de su clínica
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'patient_notes' AND policyname = 'notes_staff_access') THEN
    CREATE POLICY notes_staff_access ON public.patient_notes
      USING (clinic_id IN (SELECT clinic_id FROM public.staff WHERE user_id = auth.uid() AND deleted_at IS NULL));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'patient_reminders' AND policyname = 'reminders_staff_access') THEN
    CREATE POLICY reminders_staff_access ON public.patient_reminders
      USING (clinic_id IN (SELECT clinic_id FROM public.staff WHERE user_id = auth.uid() AND deleted_at IS NULL));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nps_responses' AND policyname = 'nps_staff_access') THEN
    CREATE POLICY nps_staff_access ON public.nps_responses
      USING (clinic_id IN (SELECT clinic_id FROM public.staff WHERE user_id = auth.uid() AND deleted_at IS NULL));
  END IF;
END $$;

-- ── 7. get_patient_ltv() ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_patient_ltv(
  p_patient_id uuid,
  p_clinic_id  uuid
)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM public.payments
  WHERE patient_id = p_patient_id
    AND clinic_id  = p_clinic_id
    AND status     = 'paid';
$$;

GRANT EXECUTE ON FUNCTION public.get_patient_ltv TO authenticated;

-- ── 8. get_patients_for_birthday() ───────────────────────────

CREATE OR REPLACE FUNCTION public.get_patients_for_birthday(p_clinic_id uuid)
RETURNS TABLE (
  id                    uuid,
  full_name             text,
  phone                 text,
  birthday_msg_sent_year int
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.phone, p.birthday_msg_sent_year
  FROM public.patients p
  WHERE p.clinic_id  = p_clinic_id
    AND p.deleted_at IS NULL
    AND p.status     = 'active'
    AND p.phone      IS NOT NULL
    AND p.birth_date IS NOT NULL
    AND EXTRACT(MONTH FROM p.birth_date) = EXTRACT(MONTH FROM CURRENT_DATE)
    AND EXTRACT(DAY   FROM p.birth_date) = EXTRACT(DAY   FROM CURRENT_DATE)
    AND (p.birthday_msg_sent_year IS NULL
         OR p.birthday_msg_sent_year < EXTRACT(YEAR FROM CURRENT_DATE)::int);
$$;

GRANT EXECUTE ON FUNCTION public.get_patients_for_birthday TO authenticated;

-- ── 9. get_patients_for_recall() ─────────────────────────────

CREATE OR REPLACE FUNCTION public.get_patients_for_recall(p_clinic_id uuid)
RETURNS TABLE (
  id                    uuid,
  full_name             text,
  phone                 text,
  next_recall_due       date,
  recall_interval_months int
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.phone, p.next_recall_due, p.recall_interval_months
  FROM public.patients p
  WHERE p.clinic_id       = p_clinic_id
    AND p.deleted_at      IS NULL
    AND p.status          = 'active'
    AND p.phone           IS NOT NULL
    AND p.next_recall_due IS NOT NULL
    AND p.next_recall_due <= CURRENT_DATE;
$$;

GRANT EXECUTE ON FUNCTION public.get_patients_for_recall TO authenticated;

-- ── 10. get_appointments_for_nps() ───────────────────────────

CREATE OR REPLACE FUNCTION public.get_appointments_for_nps(p_clinic_id uuid)
RETURNS TABLE (
  id           uuid,
  patient_id   uuid,
  phone        text,
  patient_name text,
  service      text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.patient_id, a.phone, p.full_name, a.service
  FROM public.appointments a
  JOIN public.patients p ON p.id = a.patient_id
  WHERE a.clinic_id  = p_clinic_id
    AND a.status     = 'completed'
    AND a.nps_sent   = false
    AND a.updated_at >= now() - interval '4 hours'
    AND a.updated_at <= now() - interval '1 hour'
    AND a.phone      IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_appointments_for_nps TO authenticated;

-- ── 11. get_clinic_nps_stats() ───────────────────────────────

CREATE OR REPLACE FUNCTION public.get_clinic_nps_stats(
  p_clinic_id uuid,
  p_days      int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total      bigint;
  v_avg        numeric;
  v_promoters  bigint;
  v_passives   bigint;
  v_detractors bigint;
BEGIN
  SELECT
    COUNT(*),
    ROUND(AVG(score)::numeric, 1),
    COUNT(*) FILTER (WHERE score >= 4),
    COUNT(*) FILTER (WHERE score = 3),
    COUNT(*) FILTER (WHERE score <= 2)
  INTO v_total, v_avg, v_promoters, v_passives, v_detractors
  FROM public.nps_responses
  WHERE clinic_id  = p_clinic_id
    AND created_at >= now() - (p_days || ' days')::interval;

  RETURN jsonb_build_object(
    'total',      v_total,
    'avg_score',  COALESCE(v_avg, 0),
    'promoters',  COALESCE(v_promoters, 0),
    'passives',   COALESCE(v_passives, 0),
    'detractors', COALESCE(v_detractors, 0),
    'nps_score',  CASE WHEN COALESCE(v_total, 0) = 0 THEN 0
                  ELSE ROUND(((COALESCE(v_promoters,0) - COALESCE(v_detractors,0))::numeric / v_total * 100))
                  END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_clinic_nps_stats TO authenticated;

-- ── 12. update_patient_recall() ──────────────────────────────

CREATE OR REPLACE FUNCTION public.update_patient_recall(
  p_patient_id      uuid,
  p_clinic_id       uuid,
  p_interval_months int DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_interval      int;
  v_last_completed date;
BEGIN
  SELECT COALESCE(p_interval_months, recall_interval_months, 6)
  INTO   v_interval
  FROM   public.patients
  WHERE  id = p_patient_id;

  SELECT MAX(start_time::date)
  INTO   v_last_completed
  FROM   public.appointments
  WHERE  patient_id = p_patient_id
    AND  status     = 'completed';

  IF v_last_completed IS NOT NULL THEN
    UPDATE public.patients
    SET    next_recall_due         = v_last_completed + (v_interval || ' months')::interval,
           recall_interval_months  = v_interval,
           updated_at              = now()
    WHERE  id         = p_patient_id
      AND  clinic_id  = p_clinic_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_patient_recall TO authenticated;

-- ── 13. Trigger: al completar cita → actualizar recall ────────

CREATE OR REPLACE FUNCTION public.trg_update_recall_on_completed()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.patient_id IS NOT NULL THEN
    PERFORM public.update_patient_recall(NEW.patient_id, NEW.clinic_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointment_update_recall ON public.appointments;

CREATE TRIGGER trg_appointment_update_recall
  AFTER UPDATE OF status ON public.appointments
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.patient_id IS NOT NULL)
  EXECUTE FUNCTION public.trg_update_recall_on_completed();

-- ── 14. get_clinic_reminders_today() — panel de recordatorios ─

CREATE OR REPLACE FUNCTION public.get_clinic_reminders_today(p_clinic_id uuid)
RETURNS TABLE (
  id              uuid,
  patient_id      uuid,
  patient_name    text,
  title           text,
  due_date        date,
  overdue         boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.patient_id, p.full_name, r.title, r.due_date,
         (r.due_date < CURRENT_DATE) AS overdue
  FROM   public.patient_reminders r
  JOIN   public.patients p ON p.id = r.patient_id
  WHERE  r.clinic_id    = p_clinic_id
    AND  r.completed    = false
    AND  r.due_date     <= CURRENT_DATE + 1
  ORDER BY r.due_date ASC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.get_clinic_reminders_today TO authenticated;

-- ── 15. Backfill recall para pacientes con citas completadas ──

WITH last_completed AS (
  SELECT DISTINCT ON (patient_id)
         patient_id,
         start_time::date AS last_visit,
         clinic_id
  FROM   public.appointments
  WHERE  status = 'completed'
  ORDER  BY patient_id, start_time DESC
)
UPDATE public.patients p
SET    next_recall_due = lc.last_visit + (COALESCE(p.recall_interval_months, 6) || ' months')::interval,
       updated_at      = now()
FROM   last_completed lc
WHERE  p.id              = lc.patient_id
  AND  p.deleted_at      IS NULL
  AND  p.next_recall_due IS NULL;
