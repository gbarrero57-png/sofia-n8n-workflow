-- ============================================================
-- 045_fix_balance_and_installments.sql
-- Corrige get_patient_balance, get_clinic_debt_summary y
-- get_overdue_patients_with_phone para incluir cuotas de
-- payment_installments (no solo tabla payments).
-- Antes de esta migración, los planes de cuotas no se
-- contabilizaban como deuda.
-- ============================================================

-- ── 1. get_patient_balance ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_patient_balance(
  p_patient_id uuid,
  p_clinic_id  uuid
)
RETURNS TABLE (
  total_debt       numeric,
  overdue_debt     numeric,
  pending_payments bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH direct_pay AS (
    SELECT amount, due_date
    FROM   public.payments
    WHERE  patient_id = p_patient_id
      AND  clinic_id  = p_clinic_id
      AND  status IN ('pending','partial')
  ),
  installments AS (
    SELECT pi.amount, pi.due_date
    FROM   public.payment_installments pi
    JOIN   public.payment_plans pp ON pp.id = pi.payment_plan_id
    WHERE  pp.patient_id = p_patient_id
      AND  pp.clinic_id  = p_clinic_id
      AND  pp.status     = 'active'
      AND  pi.status     = 'pending'
  ),
  combined AS (
    SELECT amount, due_date FROM direct_pay
    UNION ALL
    SELECT amount, due_date FROM installments
  )
  SELECT
    COALESCE(SUM(amount), 0)                                                          AS total_debt,
    COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN amount ELSE 0 END), 0)        AS overdue_debt,
    COUNT(*)::bigint                                                                   AS pending_payments
  FROM combined;
$$;

-- ── 2. get_clinic_debt_summary ────────────────────────────────────────────────
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
  WITH direct_pay AS (
    SELECT patient_id, amount, due_date
    FROM   public.payments
    WHERE  clinic_id = p_clinic_id
      AND  status IN ('pending','partial')
  ),
  installments AS (
    SELECT pp.patient_id, pi.amount, pi.due_date
    FROM   public.payment_installments pi
    JOIN   public.payment_plans pp ON pp.id = pi.payment_plan_id
    WHERE  pp.clinic_id = p_clinic_id
      AND  pp.status    = 'active'
      AND  pi.status    = 'pending'
  ),
  combined AS (
    SELECT patient_id, amount, due_date FROM direct_pay
    UNION ALL
    SELECT patient_id, amount, due_date FROM installments
  )
  SELECT
    COUNT(DISTINCT patient_id)                                                               AS patients_with_debt,
    COUNT(DISTINCT CASE WHEN due_date < CURRENT_DATE THEN patient_id END)                    AS patients_overdue,
    COALESCE(SUM(amount), 0)                                                                 AS total_debt,
    COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN amount ELSE 0 END), 0)               AS total_overdue
  FROM combined;
$$;

-- ── 3. get_overdue_patients_with_phone ────────────────────────────────────────
-- Incluye cuotas vencidas de payment_installments además de payments vencidos.
CREATE OR REPLACE FUNCTION public.get_overdue_patients_with_phone(
  p_clinic_id        uuid,
  p_min_overdue_days int DEFAULT 0
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
  WITH direct_pay AS (
    SELECT pay.patient_id, pay.amount, pay.due_date
    FROM   public.payments pay
    WHERE  pay.clinic_id = p_clinic_id
      AND  pay.status    IN ('pending','partial')
      AND  pay.due_date  < CURRENT_DATE - p_min_overdue_days
  ),
  installments AS (
    SELECT pp.patient_id, pi.amount, pi.due_date
    FROM   public.payment_installments pi
    JOIN   public.payment_plans pp ON pp.id = pi.payment_plan_id
    WHERE  pp.clinic_id = p_clinic_id
      AND  pp.status    = 'active'
      AND  pi.status    = 'pending'
      AND  pi.due_date  < CURRENT_DATE - p_min_overdue_days
  ),
  combined AS (
    SELECT patient_id, amount, due_date FROM direct_pay
    UNION ALL
    SELECT patient_id, amount, due_date FROM installments
  )
  SELECT
    pat.id            AS patient_id,
    pat.full_name,
    pat.phone,
    SUM(c.amount)     AS total_overdue,
    COUNT(*)          AS payment_count,
    MIN(c.due_date)   AS oldest_due
  FROM   combined c
  JOIN   public.patients pat ON pat.id = c.patient_id
  WHERE  pat.phone      IS NOT NULL
    AND  pat.deleted_at IS NULL
  GROUP  BY pat.id, pat.full_name, pat.phone
  ORDER  BY oldest_due ASC;
$$;
