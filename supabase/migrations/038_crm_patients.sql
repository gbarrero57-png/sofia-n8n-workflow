-- Migration 038: CRM Dental — tablas de pagos y presupuestos
-- patients, clinical_records, patient_allergies ya existen (020/027/036)
-- patient_id en appointments ya existe (036)
--
-- AGREGA:
--   1. treatment_plans      — presupuestos por paciente
--   2. treatment_plan_items — líneas del presupuesto (servicio + diente + precio)
--   3. payments             — transacciones (cita puntual o abono)
--   4. payment_plans        — planes de cuotas vinculados a un presupuesto
--   5. payment_installments — cuotas individuales con fecha de vencimiento
--   6. Backfill patient_id en appointments por phone match

-- ── 0. patient_id en appointments (columna física) ───────────────────────────
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS appointments_patient_id
  ON public.appointments (patient_id);

-- ── 1. treatment_plans ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.treatment_plans (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id   uuid        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  title        text        NOT NULL DEFAULT 'Plan de tratamiento',
  total_amount numeric(10,2) NOT NULL DEFAULT 0,
  status       text        NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','active','completed','cancelled')),
  notes        text,
  created_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS treatment_plans_patient  ON public.treatment_plans (patient_id);
CREATE INDEX IF NOT EXISTS treatment_plans_clinic   ON public.treatment_plans (clinic_id, status);

-- ── 2. treatment_plan_items ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.treatment_plan_items (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id      uuid        NOT NULL REFERENCES public.treatment_plans(id) ON DELETE CASCADE,
  tooth_number smallint    CHECK (tooth_number BETWEEN 1 AND 32),  -- Universal notation
  service      text        NOT NULL,
  description  text,
  unit_price   numeric(10,2) NOT NULL DEFAULT 0,
  quantity     smallint    NOT NULL DEFAULT 1,
  subtotal     numeric(10,2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
  status       text        NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','in_progress','completed','cancelled')),
  sort_order   smallint    NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plan_items_plan ON public.treatment_plan_items (plan_id);

-- ── 3. payments ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id      uuid        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  appointment_id  uuid        REFERENCES public.appointments(id) ON DELETE SET NULL,
  plan_id         uuid        REFERENCES public.treatment_plans(id) ON DELETE SET NULL,
  amount          numeric(10,2) NOT NULL,
  payment_method  text        NOT NULL DEFAULT 'cash'
                  CHECK (payment_method IN ('cash','card','transfer','yape','plin','other')),
  status          text        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','paid','partial','refunded','cancelled')),
  due_date        date,
  paid_at         timestamptz,
  reference       text,        -- número de operación, voucher, etc.
  notes           text,
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_patient     ON public.payments (patient_id);
CREATE INDEX IF NOT EXISTS payments_clinic_due  ON public.payments (clinic_id, status, due_date);
CREATE INDEX IF NOT EXISTS payments_appointment ON public.payments (appointment_id);

-- ── 4. payment_plans ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_plans (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id          uuid        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  plan_id             uuid        REFERENCES public.treatment_plans(id) ON DELETE SET NULL,
  total_amount        numeric(10,2) NOT NULL,
  installment_amount  numeric(10,2) NOT NULL,
  frequency           text        NOT NULL DEFAULT 'monthly'
                      CHECK (frequency IN ('weekly','biweekly','monthly')),
  installments_total  smallint    NOT NULL,
  installments_paid   smallint    NOT NULL DEFAULT 0,
  start_date          date        NOT NULL,
  next_due_date       date,
  status              text        NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','completed','defaulted','cancelled')),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_plans_patient ON public.payment_plans (patient_id);
CREATE INDEX IF NOT EXISTS payment_plans_clinic  ON public.payment_plans (clinic_id, status);

-- ── 5. payment_installments ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_installments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_plan_id uuid        NOT NULL REFERENCES public.payment_plans(id) ON DELETE CASCADE,
  installment_num smallint    NOT NULL,
  due_date        date        NOT NULL,
  amount          numeric(10,2) NOT NULL,
  status          text        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','paid','overdue')),
  paid_at         timestamptz,
  payment_id      uuid        REFERENCES public.payments(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS installments_plan    ON public.payment_installments (payment_plan_id);
CREATE INDEX IF NOT EXISTS installments_due     ON public.payment_installments (due_date, status);

-- ── 6. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.treatment_plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_plans        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_installments ENABLE ROW LEVEL SECURITY;

-- Staff reads/writes own clinic
CREATE POLICY "crm_treatment_plans_select"
  ON public.treatment_plans FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM public.staff WHERE user_id = auth.uid()));

CREATE POLICY "crm_treatment_plans_insert"
  ON public.treatment_plans FOR INSERT
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM public.staff WHERE user_id = auth.uid()));

CREATE POLICY "crm_treatment_plans_update"
  ON public.treatment_plans FOR UPDATE
  USING (clinic_id IN (SELECT clinic_id FROM public.staff WHERE user_id = auth.uid()));

CREATE POLICY "crm_payments_select"
  ON public.payments FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM public.staff WHERE user_id = auth.uid()));

CREATE POLICY "crm_payments_insert"
  ON public.payments FOR INSERT
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM public.staff WHERE user_id = auth.uid()));

CREATE POLICY "crm_payments_update"
  ON public.payments FOR UPDATE
  USING (clinic_id IN (SELECT clinic_id FROM public.staff WHERE user_id = auth.uid()));

CREATE POLICY "crm_payment_plans_select"
  ON public.payment_plans FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM public.staff WHERE user_id = auth.uid()));

CREATE POLICY "crm_payment_plans_insert"
  ON public.payment_plans FOR INSERT
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM public.staff WHERE user_id = auth.uid()));

CREATE POLICY "crm_payment_plans_update"
  ON public.payment_plans FOR UPDATE
  USING (clinic_id IN (SELECT clinic_id FROM public.staff WHERE user_id = auth.uid()));

-- plan_items y installments heredan acceso a través del plan padre
CREATE POLICY "crm_items_select"
  ON public.treatment_plan_items FOR ALL
  USING (plan_id IN (SELECT id FROM public.treatment_plans
    WHERE clinic_id IN (SELECT clinic_id FROM public.staff WHERE user_id = auth.uid())));

CREATE POLICY "crm_installments_select"
  ON public.payment_installments FOR ALL
  USING (payment_plan_id IN (SELECT id FROM public.payment_plans
    WHERE clinic_id IN (SELECT clinic_id FROM public.staff WHERE user_id = auth.uid())));

-- ── 7. Función: get_patient_balance ──────────────────────────────────────────
-- Retorna deuda pendiente del paciente. Usada por SofIA y el panel.
CREATE OR REPLACE FUNCTION public.get_patient_balance(
  p_patient_id uuid,
  p_clinic_id  uuid
)
RETURNS TABLE (
  total_debt      numeric,
  overdue_debt    numeric,
  pending_payments bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(CASE WHEN status IN ('pending','partial') THEN amount ELSE 0 END), 0) AS total_debt,
    COALESCE(SUM(CASE WHEN status IN ('pending','partial') AND due_date < CURRENT_DATE THEN amount ELSE 0 END), 0) AS overdue_debt,
    COUNT(CASE WHEN status IN ('pending','partial') THEN 1 END) AS pending_payments
  FROM public.payments
  WHERE patient_id = p_patient_id AND clinic_id = p_clinic_id;
$$;

-- ── 8. Función: get_clinic_debt_summary ──────────────────────────────────────
-- Resumen de deuda por clínica. Para el dashboard admin y alerta diaria SofIA.
CREATE OR REPLACE FUNCTION public.get_clinic_debt_summary(
  p_clinic_id uuid
)
RETURNS TABLE (
  patients_with_debt  bigint,
  patients_overdue    bigint,
  total_debt          numeric,
  total_overdue       numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(DISTINCT CASE WHEN status IN ('pending','partial') THEN patient_id END) AS patients_with_debt,
    COUNT(DISTINCT CASE WHEN status IN ('pending','partial') AND due_date < CURRENT_DATE THEN patient_id END) AS patients_overdue,
    COALESCE(SUM(CASE WHEN status IN ('pending','partial') THEN amount ELSE 0 END), 0) AS total_debt,
    COALESCE(SUM(CASE WHEN status IN ('pending','partial') AND due_date < CURRENT_DATE THEN amount ELSE 0 END), 0) AS total_overdue
  FROM public.payments
  WHERE clinic_id = p_clinic_id;
$$;

-- ── 9. Backfill: patient_id en appointments por phone match ──────────────────
-- Solo linkea donde hay paciente registrado con el mismo phone en la misma clínica
UPDATE public.appointments a
SET patient_id = p.id
FROM public.patients p
WHERE a.clinic_id   = p.clinic_id
  AND a.patient_id  IS NULL
  AND a.phone       IS NOT NULL
  AND p.phone       IS NOT NULL
  AND regexp_replace(a.phone, '[^0-9]', '', 'g') =
      regexp_replace(p.phone, '[^0-9]', '', 'g');
