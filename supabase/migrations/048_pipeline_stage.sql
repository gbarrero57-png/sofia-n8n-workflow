-- ============================================================
-- 048_pipeline_stage.sql
-- Capa 2: pipeline_stage — embudo granular de prospectos
--
-- Etapas del pipeline (en orden):
--   nuevo              — entró al sistema, sin contacto real aún
--   contactado         — primera respuesta del bot (enviamos el menú)
--   cita_agendada      — bot confirmó una cita
--   cita_confirmada    — paciente llegó / staff confirmó asistencia
--   presupuesto_enviado — staff creó un treatment_plan
--   ganado             — primer pago realizado (o staff marca como ganado)
--   perdido            — marcado manualmente como descartado
--
-- Transiciones automáticas (triggers):
--   bot contacta       → contactado
--   cita confirmada    → cita_agendada   (bot)
--   appointment status = confirmed/completed → cita_confirmada (trigger)
--   treatment_plan INSERT → presupuesto_enviado (trigger)
--   payment INSERT     → ganado + patients.status = active (trigger)
-- ============================================================

-- ── 1. Columna pipeline_stage en patients ─────────────────────────────────────

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS pipeline_stage TEXT NOT NULL DEFAULT 'nuevo'
    CONSTRAINT patients_pipeline_stage_check
    CHECK (pipeline_stage IN (
      'nuevo', 'contactado', 'cita_agendada', 'cita_confirmada',
      'presupuesto_enviado', 'ganado', 'perdido'
    ));

COMMENT ON COLUMN public.patients.pipeline_stage IS
  'Etapa del embudo: nuevo→contactado→cita_agendada→cita_confirmada→presupuesto_enviado→ganado|perdido';

CREATE INDEX IF NOT EXISTS idx_patients_pipeline_stage
  ON public.patients(clinic_id, pipeline_stage)
  WHERE deleted_at IS NULL;

-- ── 2. Backfill: asignar etapa a pacientes existentes ─────────────────────────

-- Pacientes con pagos → ganado
UPDATE public.patients p
SET    pipeline_stage = 'ganado',
       status         = 'active',
       updated_at     = now()
WHERE  p.deleted_at IS NULL
  AND  p.pipeline_stage = 'nuevo'
  AND  EXISTS (
    SELECT 1 FROM public.payments py
    WHERE py.clinic_id = p.clinic_id
      AND py.patient_id = p.id
      AND py.amount > 0
  );

-- Pacientes con treatment_plan sin pago → presupuesto_enviado
UPDATE public.patients p
SET    pipeline_stage = 'presupuesto_enviado',
       updated_at     = now()
WHERE  p.deleted_at IS NULL
  AND  p.pipeline_stage = 'nuevo'
  AND  EXISTS (
    SELECT 1 FROM public.treatment_plans tp
    WHERE tp.clinic_id  = p.clinic_id
      AND tp.patient_id = p.id
  );

-- Pacientes con cita completed/confirmed → cita_confirmada
UPDATE public.patients p
SET    pipeline_stage = 'cita_confirmada',
       updated_at     = now()
WHERE  p.deleted_at IS NULL
  AND  p.pipeline_stage = 'nuevo'
  AND  EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.clinic_id = p.clinic_id
      AND a.phone     = p.phone
      AND a.status    IN ('confirmed', 'completed')
  );

-- Pacientes con cita scheduled → cita_agendada
UPDATE public.patients p
SET    pipeline_stage = 'cita_agendada',
       updated_at     = now()
WHERE  p.deleted_at IS NULL
  AND  p.pipeline_stage = 'nuevo'
  AND  EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.clinic_id = p.clinic_id
      AND a.phone     = p.phone
      AND a.status    IN ('scheduled', 'pending')
  );

-- Pacientes con conversaciones del bot → contactado (fuente whatsapp_bot)
UPDATE public.patients p
SET    pipeline_stage = 'contactado',
       updated_at     = now()
WHERE  p.deleted_at IS NULL
  AND  p.pipeline_stage = 'nuevo'
  AND  p.source = 'whatsapp_bot';

-- ── 3. Trigger: appointment confirmed/completed → cita_confirmada ─────────────

CREATE OR REPLACE FUNCTION public.trg_appointment_pipeline_stage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- On appointment status change to confirmed or completed
  IF NEW.status IN ('confirmed', 'completed')
     AND (OLD.status IS NULL OR OLD.status NOT IN ('confirmed', 'completed'))
  THEN
    UPDATE patients
    SET    pipeline_stage = CASE
                              WHEN NEW.status = 'completed' THEN 'cita_confirmada'
                              WHEN pipeline_stage IN ('nuevo','contactado','cita_agendada')
                                THEN 'cita_confirmada'
                              ELSE pipeline_stage
                            END,
           updated_at     = now()
    WHERE  clinic_id  = NEW.clinic_id
      AND  phone       = NEW.phone
      AND  deleted_at IS NULL
      AND  pipeline_stage NOT IN ('presupuesto_enviado','ganado','perdido');
  END IF;

  -- On appointment creation (scheduled) → cita_agendada if still nuevo/contactado
  IF TG_OP = 'INSERT' AND NEW.status IN ('scheduled','pending','confirmed') THEN
    UPDATE patients
    SET    pipeline_stage = 'cita_agendada',
           updated_at     = now()
    WHERE  clinic_id  = NEW.clinic_id
      AND  phone       = NEW.phone
      AND  deleted_at IS NULL
      AND  pipeline_stage IN ('nuevo','contactado');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointment_pipeline_stage ON public.appointments;
CREATE TRIGGER trg_appointment_pipeline_stage
  AFTER INSERT OR UPDATE OF status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.trg_appointment_pipeline_stage();

-- ── 4. Trigger: treatment_plan INSERT → presupuesto_enviado ──────────────────

CREATE OR REPLACE FUNCTION public.trg_treatment_plan_pipeline_stage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE patients
  SET    pipeline_stage = 'presupuesto_enviado',
         updated_at     = now()
  WHERE  id         = NEW.patient_id
    AND  clinic_id  = NEW.clinic_id
    AND  deleted_at IS NULL
    AND  pipeline_stage NOT IN ('ganado','perdido');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_treatment_plan_pipeline_stage ON public.treatment_plans;
CREATE TRIGGER trg_treatment_plan_pipeline_stage
  AFTER INSERT ON public.treatment_plans
  FOR EACH ROW EXECUTE FUNCTION public.trg_treatment_plan_pipeline_stage();

-- ── 5. Trigger: payment INSERT → ganado ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_payment_pipeline_stage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.amount > 0 THEN
    UPDATE patients
    SET    pipeline_stage = 'ganado',
           status         = 'active',
           updated_at     = now()
    WHERE  id         = NEW.patient_id
      AND  clinic_id  = NEW.clinic_id
      AND  deleted_at IS NULL
      AND  pipeline_stage <> 'perdido';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_pipeline_stage ON public.payments;
CREATE TRIGGER trg_payment_pipeline_stage
  AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_payment_pipeline_stage();

-- ── 6. advance_pipeline_stage() — llamada manual del bot ─────────────────────

CREATE OR REPLACE FUNCTION public.advance_pipeline_stage(
    p_clinic_id UUID,
    p_phone     TEXT,
    p_stage     TEXT   -- solo avanza si el stage actual es menor
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order   TEXT[] := ARRAY['nuevo','contactado','cita_agendada','cita_confirmada',
                             'presupuesto_enviado','ganado','perdido'];
  v_current TEXT;
  v_phone   TEXT;
BEGIN
  v_phone := regexp_replace(p_phone, '^[Ww][Hh][Aa][Tt][Ss][Aa][Pp][Pp]:', '');
  v_phone := trim(v_phone);

  SELECT pipeline_stage INTO v_current
  FROM   patients
  WHERE  clinic_id  = p_clinic_id
    AND  phone      = v_phone
    AND  deleted_at IS NULL
  LIMIT 1;

  IF v_current IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'patient_not_found');
  END IF;

  -- Only advance (never go backwards), never overwrite 'ganado' or 'perdido'
  IF array_position(v_order, p_stage) > array_position(v_order, v_current)
     AND v_current NOT IN ('ganado','perdido')
  THEN
    UPDATE patients
    SET    pipeline_stage = p_stage,
           updated_at     = now()
    WHERE  clinic_id  = p_clinic_id
      AND  phone      = v_phone
      AND  deleted_at IS NULL;

    RETURN jsonb_build_object('ok', true, 'from', v_current, 'to', p_stage);
  END IF;

  RETURN jsonb_build_object('ok', false, 'reason', 'no_advance_needed',
                             'current', v_current, 'requested', p_stage);
END;
$$;

-- ── 7. get_pipeline_funnel() — métricas del embudo por clínica ───────────────

CREATE OR REPLACE FUNCTION public.get_pipeline_funnel(
    p_clinic_id UUID,
    p_days      INT DEFAULT 30
)
RETURNS TABLE (
    stage         TEXT,
    count         BIGINT,
    pct_of_total  NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM   patients
  WHERE  clinic_id  = p_clinic_id
    AND  deleted_at IS NULL
    AND  created_at >= now() - (p_days || ' days')::interval;

  RETURN QUERY
  SELECT
    p.pipeline_stage                                     AS stage,
    COUNT(*)                                             AS count,
    ROUND(COUNT(*)::numeric / NULLIF(v_total,0) * 100, 1) AS pct_of_total
  FROM   patients p
  WHERE  p.clinic_id  = p_clinic_id
    AND  p.deleted_at IS NULL
    AND  p.created_at >= now() - (p_days || ' days')::interval
  GROUP  BY p.pipeline_stage
  ORDER  BY array_position(
    ARRAY['nuevo','contactado','cita_agendada','cita_confirmada',
          'presupuesto_enviado','ganado','perdido'],
    p.pipeline_stage
  );
END;
$$;

-- ── 8. get_clinic_leads — agrega pipeline_stage ──────────────────────────────

CREATE OR REPLACE FUNCTION public.get_clinic_leads(
    p_clinic_id          UUID,
    p_limit              INT   DEFAULT 50,
    p_offset             INT   DEFAULT 0,
    p_source             TEXT  DEFAULT NULL,
    p_acquisition_source TEXT  DEFAULT NULL,
    p_pipeline_stage     TEXT  DEFAULT NULL
)
RETURNS TABLE (
    id                   UUID,
    full_name            TEXT,
    phone                TEXT,
    email                TEXT,
    source               TEXT,
    acquisition_source   TEXT,
    pipeline_stage       TEXT,
    created_at           TIMESTAMPTZ,
    has_appointment      BOOLEAN,
    next_appointment     TIMESTAMPTZ,
    appointment_status   TEXT,
    appointment_id       UUID,
    total                BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH lead_list AS (
    SELECT p.id, p.full_name, p.phone, p.email,
           p.source, p.acquisition_source, p.pipeline_stage, p.created_at
    FROM   patients p
    WHERE  p.clinic_id   = p_clinic_id
      AND  p.status      = 'lead'
      AND  p.deleted_at  IS NULL
      AND  (p_source IS NULL OR p.source = p_source)
      AND  (p_acquisition_source IS NULL
            OR p.acquisition_source = p_acquisition_source
            OR (p_acquisition_source = 'ctwa' AND p.acquisition_source LIKE 'ctwa:%'))
      AND  (p_pipeline_stage IS NULL OR p.pipeline_stage = p_pipeline_stage)
  ),
  next_appts AS (
    SELECT DISTINCT ON (a.clinic_id, a.phone)
           a.phone        AS appt_phone,
           a.start_time,
           a.status::text AS appt_status,
           a.id           AS appt_id
    FROM   appointments a
    WHERE  a.clinic_id = p_clinic_id
    ORDER  BY a.clinic_id, a.phone, a.start_time DESC
  )
  SELECT
    l.id, l.full_name, l.phone, l.email,
    l.source, l.acquisition_source, l.pipeline_stage, l.created_at,
    (na.appt_phone IS NOT NULL)  AS has_appointment,
    na.start_time                AS next_appointment,
    na.appt_status               AS appointment_status,
    na.appt_id                   AS appointment_id,
    COUNT(*) OVER ()             AS total
  FROM   lead_list l
  LEFT   JOIN next_appts na ON na.appt_phone = l.phone
  ORDER  BY l.created_at DESC
  LIMIT  p_limit OFFSET p_offset;
END;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.advance_pipeline_stage(UUID, TEXT, TEXT)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pipeline_funnel(UUID, INT)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_clinic_leads(UUID, INT, INT, TEXT, TEXT, TEXT)
  TO authenticated, service_role;
