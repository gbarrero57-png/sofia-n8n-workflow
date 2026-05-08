-- ============================================================
-- 047_acquisition_source.sql
-- Capa 1 de captura: tracking granular del origen de cada lead
--
-- Diferencia con patients.source (canal genérico):
--   source            = canal:  whatsapp_bot | manual | referral | landing_page
--   acquisition_source = origen: organic | ctwa:<source_id> | demo_flow | referral:<nombre> | import
--
-- Convenciones de valor:
--   'organic'              — llegó por WhatsApp sin ad
--   'ctwa:<source_id>'     — click en anuncio Meta (e.g. 'ctwa:limpieza_promo')
--   'demo_flow'            — completó el demo booking de SofIA
--   'referral:<nombre>'    — referido por paciente/doctor identificado
--   'landing_page'         — formulario web
--   'import'               — cargado manualmente/CSV
-- ============================================================

-- ── 1. Nueva columna en patients ─────────────────────────────────────────────

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS acquisition_source TEXT NOT NULL DEFAULT 'organic';

COMMENT ON COLUMN public.patients.acquisition_source IS
  'Origen granular del lead: organic | ctwa:<source_id> | demo_flow | referral:<nombre> | landing_page | import';

CREATE INDEX IF NOT EXISTS idx_patients_acquisition_source
  ON public.patients(clinic_id, acquisition_source)
  WHERE deleted_at IS NULL;

-- ── 2. Backfill: lead de bot sin CTWA → organic ───────────────────────────────

UPDATE public.patients
SET    acquisition_source = 'organic'
WHERE  acquisition_source = 'organic'   -- ya es el default, no hace daño
  AND  deleted_at IS NULL;

-- Leads que vienen de importación
UPDATE public.patients
SET    acquisition_source = 'import'
WHERE  source = 'import'
  AND  acquisition_source = 'organic'
  AND  deleted_at IS NULL;

-- ── 3. bot_upsert_patient — acepta p_acquisition_source ──────────────────────

CREATE OR REPLACE FUNCTION public.bot_upsert_patient(
    p_clinic_id          UUID,
    p_phone              TEXT,
    p_full_name          TEXT    DEFAULT NULL,
    p_email              TEXT    DEFAULT NULL,
    p_source             TEXT    DEFAULT 'whatsapp_bot',
    p_acquisition_source TEXT    DEFAULT 'organic'
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
    v_existing_acq  TEXT;
BEGIN
    v_phone := regexp_replace(p_phone, '^[Ww][Hh][Aa][Tt][Ss][Aa][Pp][Pp]:', '');
    v_phone := trim(v_phone);

    IF p_clinic_id IS NULL THEN
        RETURN jsonb_build_object('error', 'MISSING_CLINIC_ID');
    END IF;
    IF v_phone = '' OR v_phone IS NULL THEN
        RETURN jsonb_build_object('error', 'MISSING_PHONE');
    END IF;

    SELECT id, full_name, acquisition_source
    INTO   v_patient_id, v_existing_name, v_existing_acq
    FROM   patients
    WHERE  clinic_id  = p_clinic_id
      AND  phone      = v_phone
      AND  deleted_at IS NULL
    LIMIT 1;

    IF v_patient_id IS NULL THEN
        -- New patient
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
                clinic_id, dni, full_name, phone, email,
                status, source, acquisition_source
            )
            VALUES (
                p_clinic_id,
                v_dni_placeholder,
                COALESCE(p_full_name, 'Paciente Bot'),
                v_phone,
                p_email,
                'lead',
                COALESCE(p_source, 'whatsapp_bot'),
                COALESCE(p_acquisition_source, 'organic')
            )
            RETURNING id INTO v_patient_id;

            v_is_new := true;
        END;
    ELSE
        -- Existing patient: update name if we have a better one.
        -- Only update acquisition_source if current is generic ('organic')
        -- and new value is more specific (ctwa:*, demo_flow, referral:*).
        UPDATE patients SET
            full_name = CASE
                WHEN p_full_name IS NOT NULL
                  AND p_full_name NOT IN ('Paciente Bot', 'Paciente')
                  AND (v_existing_name IS NULL OR v_existing_name LIKE 'Paciente%')
                THEN p_full_name
                ELSE full_name
            END,
            email = CASE
                WHEN p_email IS NOT NULL THEN p_email
                ELSE email
            END,
            acquisition_source = CASE
                WHEN v_existing_acq = 'organic'
                  AND p_acquisition_source IS NOT NULL
                  AND p_acquisition_source <> 'organic'
                THEN p_acquisition_source
                ELSE acquisition_source
            END,
            updated_at = now()
        WHERE id = v_patient_id
          AND clinic_id = p_clinic_id;
    END IF;

    RETURN jsonb_build_object(
        'patient_id',         v_patient_id,
        'is_new',             v_is_new,
        'acquisition_source', COALESCE(p_acquisition_source, 'organic')
    );
END;
$$;

-- ── 4. get_clinic_leads — expone acquisition_source ──────────────────────────

CREATE OR REPLACE FUNCTION public.get_clinic_leads(
    p_clinic_id          UUID,
    p_limit              INT   DEFAULT 50,
    p_offset             INT   DEFAULT 0,
    p_source             TEXT  DEFAULT NULL,
    p_acquisition_source TEXT  DEFAULT NULL
)
RETURNS TABLE (
    id                   UUID,
    full_name            TEXT,
    phone                TEXT,
    email                TEXT,
    source               TEXT,
    acquisition_source   TEXT,
    created_at           TIMESTAMPTZ,
    has_appointment      BOOLEAN,
    next_appointment     TIMESTAMPTZ,
    appointment_status   TEXT,
    appointment_id       UUID,
    total                BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH lead_list AS (
        SELECT p.id, p.full_name, p.phone, p.email,
               p.source, p.acquisition_source, p.created_at
        FROM   patients p
        WHERE  p.clinic_id   = p_clinic_id
          AND  p.status      = 'lead'
          AND  p.deleted_at  IS NULL
          AND  (p_source IS NULL OR p.source = p_source)
          AND  (p_acquisition_source IS NULL
                OR p.acquisition_source = p_acquisition_source
                OR (p_acquisition_source = 'ctwa'
                    AND p.acquisition_source LIKE 'ctwa:%'))
    ),
    next_appts AS (
        SELECT DISTINCT ON (a.clinic_id, a.phone)
               a.phone        AS appt_phone,
               a.start_time,
               a.status::text AS appt_status,
               a.id           AS appt_id
        FROM   appointments a
        WHERE  a.clinic_id  = p_clinic_id
          AND  a.deleted_at IS NULL
        ORDER  BY a.clinic_id, a.phone, a.start_time DESC
    )
    SELECT
        l.id,
        l.full_name,
        l.phone,
        l.email,
        l.source,
        l.acquisition_source,
        l.created_at,
        (na.appt_phone IS NOT NULL)    AS has_appointment,
        na.start_time                  AS next_appointment,
        na.appt_status                 AS appointment_status,
        na.appt_id                     AS appointment_id,
        COUNT(*) OVER ()               AS total
    FROM   lead_list l
    LEFT   JOIN next_appts na ON na.appt_phone = l.phone
    ORDER  BY l.created_at DESC
    LIMIT  p_limit
    OFFSET p_offset;
END;
$$;

-- ── 5. get_acquisition_summary — distribución de fuentes por clínica ─────────

CREATE OR REPLACE FUNCTION public.get_acquisition_summary(
    p_clinic_id UUID,
    p_days      INT DEFAULT 30
)
RETURNS TABLE (
    acquisition_source TEXT,
    lead_count         BIGINT,
    with_appointment   BIGINT,
    conversion_rate    NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.acquisition_source,
        COUNT(*)                                                   AS lead_count,
        COUNT(*) FILTER (WHERE a.id IS NOT NULL)                   AS with_appointment,
        ROUND(
            COUNT(*) FILTER (WHERE a.id IS NOT NULL)::numeric
            / NULLIF(COUNT(*), 0) * 100, 1
        )                                                          AS conversion_rate
    FROM   patients p
    LEFT   JOIN LATERAL (
        SELECT a.id FROM appointments a
        WHERE  a.clinic_id = p_clinic_id
          AND  a.phone     = p.phone
          AND  a.status   != 'cancelled'
        LIMIT 1
    ) a ON true
    WHERE  p.clinic_id  = p_clinic_id
      AND  p.deleted_at IS NULL
      AND  p.created_at >= now() - (p_days || ' days')::interval
    GROUP  BY p.acquisition_source
    ORDER  BY lead_count DESC;
END;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.bot_upsert_patient(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_clinic_leads(UUID, INT, INT, TEXT, TEXT)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_acquisition_summary(UUID, INT)
  TO authenticated, service_role;
