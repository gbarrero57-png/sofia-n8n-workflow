-- ============================================================
-- 042_patient_leads_lifecycle.sql
-- Gestión completa del ciclo de vida paciente/lead multi-clínica
--
-- 1. Columnas status + source en patients
-- 2. Backfill: activa pacientes con citas completadas
-- 3. Update bot_upsert_patient (acepta p_source, setea status='lead')
-- 4. Trigger: marca paciente 'active' al confirmar/completar cita
-- 5. activate_patient(patient_id, clinic_id) — acción staff
-- 6. get_clinic_leads() — lista prospectos con datos de cita
-- 7. update search_patients para incluir status/source
-- ============================================================

-- ── 1. Columnas nuevas en patients ────────────────────────────────────────────

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'lead'
    CONSTRAINT patients_status_check CHECK (status IN ('lead', 'active', 'inactive')),
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
    CONSTRAINT patients_source_check CHECK (source IN ('whatsapp_bot', 'manual', 'referral', 'landing_page', 'import'));

CREATE INDEX IF NOT EXISTS idx_patients_clinic_status
  ON public.patients(clinic_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_patients_clinic_source
  ON public.patients(clinic_id, source)
  WHERE deleted_at IS NULL;

-- ── 2. Backfill: pacientes con cita completada → active ────────────────────

UPDATE public.patients p
SET    status     = 'active',
       updated_at = now()
WHERE  p.deleted_at IS NULL
  AND  p.status   = 'lead'
  AND  EXISTS (
    SELECT 1
    FROM   public.appointments a
    WHERE  a.patient_id = p.id
      AND  a.status     IN ('completed', 'confirmed')
  );

-- Backfill source: pacientes bot tienen full_name 'Paciente Bot'
UPDATE public.patients
SET    source     = 'whatsapp_bot'
WHERE  source     = 'manual'
  AND  full_name  LIKE 'Paciente Bot%'
  AND  deleted_at IS NULL;

-- ── 3. bot_upsert_patient actualizado (acepta p_source) ──────────────────────

CREATE OR REPLACE FUNCTION public.bot_upsert_patient(
    p_clinic_id  UUID,
    p_phone      TEXT,
    p_full_name  TEXT    DEFAULT NULL,
    p_email      TEXT    DEFAULT NULL,
    p_source     TEXT    DEFAULT 'whatsapp_bot'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_phone         TEXT;
    v_patient_id    UUID;
    v_is_new        BOOLEAN := false;
    v_existing_name TEXT;
BEGIN
    v_phone := regexp_replace(p_phone, '^[Ww][Hh][Aa][Tt][Ss][Aa][Pp][Pp]:', '');
    v_phone := trim(v_phone);

    IF p_clinic_id IS NULL THEN
        RETURN jsonb_build_object('error', 'MISSING_CLINIC_ID');
    END IF;
    IF v_phone = '' OR v_phone IS NULL THEN
        RETURN jsonb_build_object('error', 'MISSING_PHONE');
    END IF;

    SELECT id, full_name
    INTO   v_patient_id, v_existing_name
    FROM   patients
    WHERE  clinic_id  = p_clinic_id
      AND  phone      = v_phone
      AND  deleted_at IS NULL
    LIMIT 1;

    IF v_patient_id IS NULL THEN
        DECLARE
            v_dni_placeholder TEXT;
        BEGIN
            LOOP
                v_dni_placeholder := lpad(
                    (floor(random() * 90000000) + 10000000)::text,
                    8, '0'
                );
                EXIT WHEN NOT EXISTS (
                    SELECT 1 FROM patients
                    WHERE clinic_id = p_clinic_id AND dni = v_dni_placeholder
                );
            END LOOP;

            INSERT INTO patients (
                clinic_id, dni, full_name, phone, email, status, source
            )
            VALUES (
                p_clinic_id,
                v_dni_placeholder,
                COALESCE(p_full_name, 'Paciente Bot'),
                v_phone,
                p_email,
                'lead',
                COALESCE(p_source, 'whatsapp_bot')
            )
            RETURNING id INTO v_patient_id;

            v_is_new := true;
        END;
    ELSE
        UPDATE patients SET
            full_name  = CASE
                            WHEN p_full_name IS NOT NULL
                              AND p_full_name NOT IN ('Paciente Bot', 'Paciente')
                              AND (v_existing_name IS NULL
                                OR v_existing_name LIKE 'Paciente Bot%'
                                OR v_existing_name = 'Paciente')
                            THEN p_full_name
                            ELSE full_name
                         END,
            email      = COALESCE(email, p_email),
            updated_at = now()
        WHERE id = v_patient_id;
    END IF;

    RETURN jsonb_build_object(
        'success',    true,
        'patient_id', v_patient_id,
        'is_new',     v_is_new,
        'clinic_id',  p_clinic_id,
        'phone',      v_phone
    );
END;
$$;

-- ── 4. Trigger: cita confirmed/completed → patient activo ────────────────────

CREATE OR REPLACE FUNCTION public.trg_activate_patient_on_appointment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status IN ('completed', 'confirmed')
       AND NEW.patient_id IS NOT NULL
    THEN
        UPDATE patients
        SET    status     = 'active',
               updated_at = now()
        WHERE  id         = NEW.patient_id
          AND  clinic_id  = NEW.clinic_id
          AND  status     = 'lead'
          AND  deleted_at IS NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointment_activate_patient ON public.appointments;

CREATE TRIGGER trg_appointment_activate_patient
    AFTER UPDATE OF status ON public.appointments
    FOR EACH ROW
    WHEN (
        NEW.status IN ('completed', 'confirmed')
        AND OLD.status IS DISTINCT FROM NEW.status
        AND NEW.patient_id IS NOT NULL
    )
    EXECUTE FUNCTION public.trg_activate_patient_on_appointment();

-- ── 5. activate_patient() — acción manual del staff ──────────────────────────

CREATE OR REPLACE FUNCTION public.activate_patient(
    p_patient_id UUID,
    p_clinic_id  UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE patients
    SET    status     = 'active',
           updated_at = now()
    WHERE  id         = p_patient_id
      AND  clinic_id  = p_clinic_id
      AND  deleted_at IS NULL;
    RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_patient TO authenticated;

-- ── 6. get_clinic_leads() — prospectos con datos de cita ─────────────────────

CREATE OR REPLACE FUNCTION public.get_clinic_leads(
    p_clinic_id UUID,
    p_limit     INT  DEFAULT 50,
    p_offset    INT  DEFAULT 0,
    p_source    TEXT DEFAULT NULL   -- NULL = todos
)
RETURNS TABLE (
    id                  UUID,
    full_name           TEXT,
    phone               TEXT,
    email               TEXT,
    source              TEXT,
    created_at          TIMESTAMPTZ,
    has_appointment     BOOLEAN,
    next_appointment    TIMESTAMPTZ,
    appointment_status  TEXT,
    appointment_id      UUID,
    total               BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH lead_list AS (
        SELECT p.id, p.full_name, p.phone, p.email, p.source, p.created_at
        FROM   patients p
        WHERE  p.clinic_id  = p_clinic_id
          AND  p.status     = 'lead'
          AND  p.deleted_at IS NULL
          AND  (p_source IS NULL OR p.source = p_source)
    ),
    next_appts AS (
        SELECT DISTINCT ON (a.clinic_id, a.phone)
               a.phone          AS appt_phone,
               a.start_time,
               a.status::text   AS appt_status,
               a.id             AS appt_id
        FROM   appointments a
        WHERE  a.clinic_id = p_clinic_id
          AND  a.status    NOT IN ('cancelled', 'no_show')
        ORDER  BY a.clinic_id, a.phone, a.start_time ASC
    ),
    counted AS (SELECT COUNT(*) AS total FROM lead_list)
    SELECT
        l.id,
        l.full_name,
        l.phone,
        l.email,
        l.source,
        l.created_at,
        (na.appt_phone IS NOT NULL)  AS has_appointment,
        na.start_time                AS next_appointment,
        na.appt_status               AS appointment_status,
        na.appt_id                   AS appointment_id,
        c.total
    FROM lead_list l
    CROSS JOIN counted c
    LEFT JOIN next_appts na ON na.appt_phone = l.phone
    ORDER BY l.created_at DESC
    LIMIT  p_limit
    OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_clinic_leads TO authenticated;

-- ── 7. get_lead_stats() — métricas para el dashboard de prospectos ────────────

CREATE OR REPLACE FUNCTION public.get_lead_stats(p_clinic_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total          BIGINT;
    v_new_week       BIGINT;
    v_with_appt      BIGINT;
    v_converted_week BIGINT;
BEGIN
    -- Total activos como lead
    SELECT COUNT(*) INTO v_total
    FROM   patients
    WHERE  clinic_id  = p_clinic_id
      AND  status     = 'lead'
      AND  deleted_at IS NULL;

    -- Nuevos esta semana (lun–hoy)
    SELECT COUNT(*) INTO v_new_week
    FROM   patients
    WHERE  clinic_id  = p_clinic_id
      AND  status     = 'lead'
      AND  deleted_at IS NULL
      AND  created_at >= date_trunc('week', now());

    -- Leads con cita programada (scheduled)
    SELECT COUNT(DISTINCT p.id) INTO v_with_appt
    FROM   patients p
    JOIN   appointments a ON a.phone = p.phone AND a.clinic_id = p_clinic_id
    WHERE  p.clinic_id  = p_clinic_id
      AND  p.status     = 'lead'
      AND  p.deleted_at IS NULL
      AND  a.status     IN ('scheduled', 'confirmed');

    -- Convertidos esta semana (lead→active esta semana)
    SELECT COUNT(*) INTO v_converted_week
    FROM   patients
    WHERE  clinic_id  = p_clinic_id
      AND  status     = 'active'
      AND  deleted_at IS NULL
      AND  updated_at >= date_trunc('week', now());

    RETURN jsonb_build_object(
        'total',          v_total,
        'new_this_week',  v_new_week,
        'with_appointment', v_with_appt,
        'converted_week', v_converted_week
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_lead_stats TO authenticated;

-- ── 8. search_patients — incluir status/source en resultado ──────────────────

DROP FUNCTION IF EXISTS public.search_patients(uuid, text, integer);

CREATE OR REPLACE FUNCTION public.search_patients(
    p_clinic_id UUID,
    p_query     TEXT,
    p_limit     INT  DEFAULT 20
)
RETURNS TABLE (
    id           UUID,
    dni          TEXT,
    full_name    TEXT,
    phone        TEXT,
    birth_date   DATE,
    total_visits BIGINT,
    last_visit   DATE,
    status       TEXT,
    source       TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH visits AS (
        SELECT patient_id, COUNT(*) AS cnt, MAX(consultation_date) AS last_v
        FROM   clinical_records
        GROUP  BY patient_id
    )
    SELECT
        p.id,
        p.dni,
        p.full_name,
        p.phone,
        p.birth_date,
        COALESCE(v.cnt, 0)    AS total_visits,
        v.last_v              AS last_visit,
        p.status,
        p.source
    FROM patients p
    LEFT JOIN visits v ON v.patient_id = p.id
    WHERE p.clinic_id  = p_clinic_id
      AND p.deleted_at IS NULL
      AND (
          p.full_name ILIKE '%' || p_query || '%'
       OR p.dni       ILIKE '%' || p_query || '%'
       OR p.phone     ILIKE '%' || p_query || '%'
      )
    ORDER BY
        CASE WHEN p.full_name ILIKE p_query || '%' THEN 0 ELSE 1 END,
        p.full_name
    LIMIT p_limit;
END;
$$;

-- ── 9. RLS: status/source son columnas de la misma tabla patients ─────────────
-- Las políticas existentes (staff SELECT/INSERT/UPDATE scoped a clinic_id)
-- ya cubren estas columnas automáticamente. No requieren cambios.

-- ── 10. link_orphan_appointments — liga citas sin patient_id por teléfono ─────

CREATE OR REPLACE FUNCTION public.link_orphan_appointments(p_clinic_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated INTEGER := 0;
BEGIN
    WITH matched AS (
        SELECT a.id AS appt_id, p.id AS pat_id
        FROM   appointments a
        JOIN   patients      p ON p.phone      = a.phone
                              AND p.clinic_id  = a.clinic_id
                              AND p.deleted_at IS NULL
        WHERE  a.clinic_id  = p_clinic_id
          AND  a.patient_id IS NULL
          AND  a.phone      IS NOT NULL
    )
    UPDATE appointments
    SET    patient_id = matched.pat_id,
           updated_at = now()
    FROM   matched
    WHERE  appointments.id = matched.appt_id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated;
END;
$$;
