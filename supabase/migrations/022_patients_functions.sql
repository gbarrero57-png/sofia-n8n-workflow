-- ============================================================
-- SofIA SaaS — Portal de Historial Clínico
-- Migration 022: Funciones RPC para el portal médico
--
-- PREREQUISITO: 020 + 021
--
-- FUNCIONES:
--   1. create_or_update_patient   — upsert por (clinic_id, dni)
--   2. add_clinical_record        — nueva consulta + marca cita completed
--   3. get_patient_by_dni         — búsqueda exacta con alergias
--   4. search_patients            — búsqueda fuzzy por DNI o nombre
--   5. get_patient_timeline       — todas las consultas paginadas
--   6. get_today_appointments_with_status — citas del día + indicador historia
--
-- SEGURIDAD:
--   Todas usan SECURITY DEFINER + validación explícita del JWT.
--   Patrón idéntico a 011_auth_staff.sql.
-- ============================================================

-- ============================================================
-- FUNCIÓN 1: create_or_update_patient
--
-- Crea un nuevo paciente o actualiza el existente si el DNI ya
-- está registrado en la clínica (UPSERT por clinic_id + dni).
-- Si el paciente tenía soft delete, lo reactiva.
-- Validación: solo staff/admin de la misma clínica puede operar.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_or_update_patient(
    p_clinic_id                 UUID,
    p_dni                       TEXT,
    p_full_name                 TEXT,
    p_birth_date                DATE        DEFAULT NULL,
    p_gender                    gender_type DEFAULT NULL,
    p_phone                     TEXT        DEFAULT NULL,
    p_email                     TEXT        DEFAULT NULL,
    p_address                   TEXT        DEFAULT NULL,
    p_blood_type                blood_type_enum DEFAULT 'desconocido',
    p_emergency_contact_name    TEXT        DEFAULT NULL,
    p_emergency_contact_phone   TEXT        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_clinic UUID := (auth.jwt() ->> 'clinic_id')::uuid;
    v_caller_role   TEXT := auth.jwt() ->> 'user_role';
    v_caller_user   UUID := auth.uid();
    v_patient_id    UUID;
    v_is_new        BOOLEAN := false;
BEGIN
    -- Seguridad: solo staff/admin de la misma clínica
    IF v_caller_clinic IS NULL OR v_caller_clinic <> p_clinic_id THEN
        RETURN jsonb_build_object('error', 'CLINIC_MISMATCH',
            'message', 'No tienes acceso a esta clínica');
    END IF;
    IF v_caller_role NOT IN ('admin', 'staff') THEN
        RETURN jsonb_build_object('error', 'PERMISSION_DENIED',
            'message', 'Se requiere rol admin o staff');
    END IF;

    -- Validar formato DNI peruano (8 dígitos numéricos)
    IF p_dni !~ '^[0-9]{8}$' THEN
        RETURN jsonb_build_object('error', 'INVALID_DNI',
            'message', 'El DNI debe tener exactamente 8 dígitos numéricos');
    END IF;

    -- Validar nombre no vacío
    IF trim(p_full_name) = '' THEN
        RETURN jsonb_build_object('error', 'INVALID_NAME',
            'message', 'El nombre completo es requerido');
    END IF;

    -- Verificar si ya existe (incluyendo soft-deleted)
    SELECT id INTO v_patient_id
    FROM patients
    WHERE clinic_id = p_clinic_id AND dni = p_dni
    LIMIT 1;

    IF v_patient_id IS NULL THEN
        v_is_new := true;
        INSERT INTO patients (
            clinic_id, dni, full_name, birth_date, gender,
            phone, email, address, blood_type,
            emergency_contact_name, emergency_contact_phone,
            created_by, updated_by
        )
        VALUES (
            p_clinic_id, p_dni, trim(p_full_name), p_birth_date, p_gender,
            p_phone, p_email, p_address, p_blood_type,
            p_emergency_contact_name, p_emergency_contact_phone,
            v_caller_user, v_caller_user
        )
        RETURNING id INTO v_patient_id;
    ELSE
        -- Actualizar campos. COALESCE: no sobreescribe con NULL si ya tiene valor.
        -- full_name sí se actualiza (puede necesitar corrección).
        -- blood_type solo actualiza si se da un valor distinto de 'desconocido'.
        UPDATE patients SET
            full_name       = trim(p_full_name),
            birth_date      = COALESCE(p_birth_date, birth_date),
            gender          = COALESCE(p_gender, gender),
            phone           = COALESCE(p_phone, phone),
            email           = COALESCE(p_email, email),
            address         = COALESCE(p_address, address),
            blood_type      = CASE WHEN p_blood_type <> 'desconocido'
                                   THEN p_blood_type
                                   ELSE blood_type END,
            emergency_contact_name  = COALESCE(p_emergency_contact_name, emergency_contact_name),
            emergency_contact_phone = COALESCE(p_emergency_contact_phone, emergency_contact_phone),
            updated_by      = v_caller_user,
            deleted_at      = NULL,   -- Reactiva si estaba soft-deleted
            updated_at      = now()
        WHERE id = v_patient_id;
    END IF;

    RETURN jsonb_build_object(
        'success',      true,
        'patient_id',   v_patient_id,
        'is_new',       v_is_new,
        'clinic_id',    p_clinic_id,
        'dni',          p_dni,
        'full_name',    trim(p_full_name)
    );
END;
$$;

COMMENT ON FUNCTION public.create_or_update_patient IS
    'Upsert de paciente por (clinic_id, dni). '
    'Crea si no existe, actualiza si existe (incluso reactiva soft-deleted). '
    'Valida formato DNI y pertenencia a la clínica del caller.';

GRANT EXECUTE ON FUNCTION public.create_or_update_patient TO authenticated;

-- ============================================================
-- FUNCIÓN 2: add_clinical_record
--
-- Crea un nuevo registro clínico (consulta/visita).
-- Opcionalmente vincula con una cita y la marca como completed.
-- Desnormaliza el nombre del médico en attended_by_name.
-- ============================================================

CREATE OR REPLACE FUNCTION public.add_clinical_record(
    p_patient_id            UUID,
    p_clinic_id             UUID,
    p_consultation_date     DATE        DEFAULT CURRENT_DATE,
    p_reason                TEXT        DEFAULT '',
    p_diagnosis             TEXT        DEFAULT '',
    p_treatment             TEXT        DEFAULT NULL,
    p_medications           TEXT        DEFAULT NULL,
    p_observations          TEXT        DEFAULT NULL,
    p_next_appointment_rec  DATE        DEFAULT NULL,
    p_weight_kg             NUMERIC     DEFAULT NULL,
    p_height_cm             NUMERIC     DEFAULT NULL,
    p_blood_pressure        TEXT        DEFAULT NULL,
    p_temperature_c         NUMERIC     DEFAULT NULL,
    p_appointment_id        UUID        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_clinic UUID := (auth.jwt() ->> 'clinic_id')::uuid;
    v_caller_role   TEXT := auth.jwt() ->> 'user_role';
    v_caller_user   UUID := auth.uid();
    v_staff_name    TEXT;
    v_record_id     UUID;
BEGIN
    -- Seguridad: clínica y rol
    IF v_caller_clinic IS NULL OR v_caller_clinic <> p_clinic_id THEN
        RETURN jsonb_build_object('error', 'CLINIC_MISMATCH');
    END IF;
    IF v_caller_role NOT IN ('admin', 'staff') THEN
        RETURN jsonb_build_object('error', 'PERMISSION_DENIED');
    END IF;

    -- Validar campos requeridos
    IF trim(p_reason) = '' THEN
        RETURN jsonb_build_object('error', 'INVALID_REASON',
            'message', 'El motivo de consulta es requerido');
    END IF;
    IF trim(p_diagnosis) = '' THEN
        RETURN jsonb_build_object('error', 'INVALID_DIAGNOSIS',
            'message', 'El diagnóstico es requerido');
    END IF;

    -- Verificar que el paciente existe y pertenece a la clínica
    IF NOT EXISTS (
        SELECT 1 FROM patients
        WHERE id = p_patient_id AND clinic_id = p_clinic_id AND deleted_at IS NULL
    ) THEN
        RETURN jsonb_build_object('error', 'PATIENT_NOT_FOUND',
            'message', 'Paciente no encontrado en esta clínica');
    END IF;

    -- Verificar que la cita (si se pasa) pertenece a esta clínica
    IF p_appointment_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM appointments
        WHERE id = p_appointment_id AND clinic_id = p_clinic_id
    ) THEN
        RETURN jsonb_build_object('error', 'APPOINTMENT_NOT_FOUND',
            'message', 'La cita indicada no existe en esta clínica');
    END IF;

    -- Obtener nombre del médico para desnormalización
    SELECT full_name INTO v_staff_name
    FROM staff
    WHERE user_id = v_caller_user AND clinic_id = p_clinic_id AND active = true;

    -- Insertar registro clínico
    INSERT INTO clinical_records (
        clinic_id, patient_id, appointment_id,
        consultation_date, reason, diagnosis, treatment,
        medications, observations, next_appointment_rec,
        weight_kg, height_cm, blood_pressure, temperature_c,
        attended_by, attended_by_name
    )
    VALUES (
        p_clinic_id, p_patient_id, p_appointment_id,
        p_consultation_date, trim(p_reason), trim(p_diagnosis),
        p_treatment, p_medications, p_observations, p_next_appointment_rec,
        p_weight_kg, p_height_cm, p_blood_pressure, p_temperature_c,
        v_caller_user, COALESCE(v_staff_name, 'Médico')
    )
    RETURNING id INTO v_record_id;

    -- Marcar la cita como completada si se vinculó
    IF p_appointment_id IS NOT NULL THEN
        UPDATE appointments
        SET status = 'completed', updated_at = now()
        WHERE id = p_appointment_id
          AND clinic_id = p_clinic_id
          AND status IN ('scheduled', 'confirmed');
    END IF;

    RETURN jsonb_build_object(
        'success',      true,
        'record_id',    v_record_id,
        'patient_id',   p_patient_id,
        'clinic_id',    p_clinic_id,
        'appointment_updated', p_appointment_id IS NOT NULL
    );
END;
$$;

COMMENT ON FUNCTION public.add_clinical_record IS
    'Crea una nueva consulta clínica. '
    'Si appointment_id se pasa, la cita se marca como completed. '
    'Desnormaliza attended_by_name para preservar el nombre del médico.';

GRANT EXECUTE ON FUNCTION public.add_clinical_record TO authenticated;

-- ============================================================
-- FUNCIÓN 3: get_patient_by_dni
--
-- Búsqueda exacta por DNI dentro de una clínica.
-- Devuelve perfil + lista de alergias activas + total de visitas.
-- Retorna {found: false} si no existe (sin revelar si existe en otra clínica).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_patient_by_dni(
    p_clinic_id UUID,
    p_dni       TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_clinic UUID := (auth.jwt() ->> 'clinic_id')::uuid;
    v_caller_role   TEXT := auth.jwt() ->> 'user_role';
    v_result        jsonb;
BEGIN
    -- Seguridad: solo puede buscar en su clínica
    IF v_caller_clinic IS NULL OR v_caller_clinic <> p_clinic_id THEN
        RETURN jsonb_build_object('found', false);  -- Silencioso, sin error
    END IF;
    IF v_caller_role NOT IN ('admin', 'staff') THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    SELECT jsonb_build_object(
        'found',        true,
        'id',           p.id,
        'dni',          p.dni,
        'full_name',    p.full_name,
        'birth_date',   p.birth_date,
        'gender',       p.gender,
        'blood_type',   p.blood_type,
        'phone',        p.phone,
        'email',        p.email,
        'address',      p.address,
        'emergency_contact_name',  p.emergency_contact_name,
        'emergency_contact_phone', p.emergency_contact_phone,
        'created_at',   p.created_at,
        'allergies',    COALESCE(
            (SELECT jsonb_agg(
                jsonb_build_object(
                    'id',        a.id,
                    'allergen',  a.allergen,
                    'severity',  a.severity,
                    'reaction',  a.reaction,
                    'confirmed', a.confirmed
                ) ORDER BY
                    CASE a.severity
                        WHEN 'anafilaxis' THEN 1
                        WHEN 'severa'     THEN 2
                        WHEN 'moderada'   THEN 3
                        ELSE 4
                    END
            )
            FROM patient_allergies a
            WHERE a.patient_id = p.id AND a.deleted_at IS NULL),
            '[]'::jsonb
        ),
        'total_visits', (
            SELECT COUNT(*)
            FROM clinical_records cr
            WHERE cr.patient_id = p.id AND cr.deleted_at IS NULL
        ),
        'last_visit', (
            SELECT MAX(cr.consultation_date)
            FROM clinical_records cr
            WHERE cr.patient_id = p.id AND cr.deleted_at IS NULL
        )
    )
    INTO v_result
    FROM patients p
    WHERE p.clinic_id = p_clinic_id
      AND p.dni = p_dni
      AND p.deleted_at IS NULL;

    RETURN COALESCE(v_result, jsonb_build_object('found', false));
END;
$$;

COMMENT ON FUNCTION public.get_patient_by_dni IS
    'Búsqueda exacta de paciente por DNI dentro de la clínica del caller. '
    'Incluye alergias ordenadas por severidad y métricas de visitas. '
    'Retorna {found: false} sin error si no existe (evita enumeración).';

GRANT EXECUTE ON FUNCTION public.get_patient_by_dni TO authenticated;

-- ============================================================
-- FUNCIÓN 4: search_patients
--
-- Búsqueda combinada por DNI parcial o nombre (fuzzy trigram).
-- Máximo 20 resultados. Ordena: DNI exacto > DNI parcial > nombre.
-- ============================================================

CREATE OR REPLACE FUNCTION public.search_patients(
    p_clinic_id UUID,
    p_query     TEXT,
    p_limit     INTEGER DEFAULT 20
)
RETURNS TABLE (
    id          UUID,
    dni         TEXT,
    full_name   TEXT,
    birth_date  DATE,
    phone       TEXT,
    blood_type  blood_type_enum,
    last_visit  DATE,
    total_visits BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_clinic UUID := (auth.jwt() ->> 'clinic_id')::uuid;
    v_caller_role   TEXT := auth.jwt() ->> 'user_role';
    v_query         TEXT := trim(p_query);
BEGIN
    -- Seguridad: devuelve vacío silenciosamente si hay mismatch
    IF v_caller_clinic IS NULL OR v_caller_clinic <> p_clinic_id THEN RETURN; END IF;
    IF v_caller_role NOT IN ('admin', 'staff') THEN RETURN; END IF;
    IF v_query = '' THEN RETURN; END IF;

    RETURN QUERY
    SELECT
        pat.id,
        pat.dni,
        pat.full_name,
        pat.birth_date,
        pat.phone,
        pat.blood_type,
        (SELECT MAX(cr.consultation_date)
         FROM clinical_records cr
         WHERE cr.patient_id = pat.id AND cr.deleted_at IS NULL) AS last_visit,
        (SELECT COUNT(*)
         FROM clinical_records cr
         WHERE cr.patient_id = pat.id AND cr.deleted_at IS NULL) AS total_visits
    FROM patients pat
    WHERE pat.clinic_id = p_clinic_id
      AND pat.deleted_at IS NULL
      AND (
          pat.dni = v_query                           -- DNI exacto
          OR pat.dni ILIKE v_query || '%'             -- DNI parcial (ej: primeros 4 dígitos)
          OR pat.full_name ILIKE '%' || v_query || '%'  -- Nombre contiene query
          OR similarity(pat.full_name, v_query) > 0.15  -- Fuzzy match por trigram
      )
    ORDER BY
        CASE WHEN pat.dni = v_query              THEN 1 END NULLS LAST,
        CASE WHEN pat.dni ILIKE v_query || '%'   THEN 2 END NULLS LAST,
        similarity(pat.full_name, v_query) DESC,
        pat.full_name
    LIMIT LEAST(COALESCE(p_limit, 20), 20);  -- Máximo 20 siempre
END;
$$;

COMMENT ON FUNCTION public.search_patients IS
    'Búsqueda de pacientes por DNI parcial o nombre (fuzzy trigram). '
    'Orden: DNI exacto > DNI parcial > similitud de nombre. '
    'Máximo 20 resultados. Requiere pg_trgm (habilitado en 001).';

GRANT EXECUTE ON FUNCTION public.search_patients TO authenticated;

-- ============================================================
-- FUNCIÓN 5: get_patient_timeline
--
-- Todas las consultas de un paciente, ordenadas por fecha descendente.
-- Paginada (limit + offset). Verifica que el paciente pertenece
-- a la clínica del caller antes de devolver datos.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_patient_timeline(
    p_patient_id    UUID,
    p_clinic_id     UUID,
    p_limit         INTEGER DEFAULT 20,
    p_offset        INTEGER DEFAULT 0
)
RETURNS TABLE (
    record_id           UUID,
    consultation_date   DATE,
    reason              TEXT,
    diagnosis           TEXT,
    treatment           TEXT,
    medications         TEXT,
    observations        TEXT,
    next_appointment_rec DATE,
    weight_kg           NUMERIC,
    height_cm           NUMERIC,
    blood_pressure      TEXT,
    temperature_c       NUMERIC,
    attended_by_name    TEXT,
    appointment_id      UUID,
    created_at          TIMESTAMPTZ,
    total_count         BIGINT      -- total de registros para paginación
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_clinic UUID := (auth.jwt() ->> 'clinic_id')::uuid;
    v_caller_role   TEXT := auth.jwt() ->> 'user_role';
    v_total         BIGINT;
BEGIN
    IF v_caller_clinic IS NULL OR v_caller_clinic <> p_clinic_id THEN RETURN; END IF;
    IF v_caller_role NOT IN ('admin', 'staff') THEN RETURN; END IF;

    -- Verificar que el paciente pertenece a la clínica (aislamiento)
    IF NOT EXISTS (
        SELECT 1 FROM patients
        WHERE id = p_patient_id AND clinic_id = p_clinic_id AND deleted_at IS NULL
    ) THEN
        RETURN;
    END IF;

    -- Total para paginación en el frontend
    SELECT COUNT(*) INTO v_total
    FROM clinical_records cr
    WHERE cr.patient_id = p_patient_id
      AND cr.clinic_id  = p_clinic_id
      AND cr.deleted_at IS NULL;

    RETURN QUERY
    SELECT
        cr.id,
        cr.consultation_date,
        cr.reason,
        cr.diagnosis,
        cr.treatment,
        cr.medications,
        cr.observations,
        cr.next_appointment_rec,
        cr.weight_kg,
        cr.height_cm,
        cr.blood_pressure,
        cr.temperature_c,
        cr.attended_by_name,
        cr.appointment_id,
        cr.created_at,
        v_total
    FROM clinical_records cr
    WHERE cr.patient_id = p_patient_id
      AND cr.clinic_id  = p_clinic_id
      AND cr.deleted_at IS NULL
    ORDER BY cr.consultation_date DESC, cr.created_at DESC
    LIMIT LEAST(COALESCE(p_limit, 20), 50)
    OFFSET COALESCE(p_offset, 0);
END;
$$;

COMMENT ON FUNCTION public.get_patient_timeline IS
    'Historial completo de consultas de un paciente, ordenado por fecha descendente. '
    'Paginado: limit (max 50) + offset. Incluye total_count para paginación en el frontend.';

GRANT EXECUTE ON FUNCTION public.get_patient_timeline TO authenticated;

-- ============================================================
-- FUNCIÓN 6: get_today_appointments_with_status
--
-- Citas del día actual para la clínica, con indicador de si
-- ya tienen historia clínica registrada (has_record).
-- Usa el timezone de la clínica para definir "hoy".
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_today_appointments_with_status(
    p_clinic_id UUID
)
RETURNS TABLE (
    appointment_id  UUID,
    patient_name    TEXT,
    service         TEXT,
    start_time      TIMESTAMPTZ,
    end_time        TIMESTAMPTZ,
    status          appointment_status,
    phone           TEXT,
    has_record      BOOLEAN,
    patient_id      UUID,
    patient_dni     TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_clinic UUID := (auth.jwt() ->> 'clinic_id')::uuid;
    v_caller_role   TEXT := auth.jwt() ->> 'user_role';
    v_tz            TEXT;
    v_today_start   TIMESTAMPTZ;
    v_today_end     TIMESTAMPTZ;
BEGIN
    IF v_caller_clinic IS NULL OR v_caller_clinic <> p_clinic_id THEN RETURN; END IF;
    IF v_caller_role NOT IN ('admin', 'staff') THEN RETURN; END IF;

    -- Respetar timezone de la clínica (default Lima)
    SELECT COALESCE(timezone, 'America/Lima') INTO v_tz
    FROM clinics WHERE id = p_clinic_id;

    v_today_start := date_trunc('day', now() AT TIME ZONE v_tz) AT TIME ZONE v_tz;
    v_today_end   := v_today_start + INTERVAL '1 day';

    RETURN QUERY
    SELECT
        a.id                AS appointment_id,
        a.patient_name,
        a.service,
        a.start_time,
        a.end_time,
        a.status,
        a.phone,
        -- Indicador: ¿ya tiene historia clínica?
        EXISTS(
            SELECT 1 FROM clinical_records cr
            WHERE cr.appointment_id = a.id AND cr.deleted_at IS NULL
        )                   AS has_record,
        -- Match heurístico por teléfono (NULL si no tiene perfil aún)
        pat.id              AS patient_id,
        pat.dni             AS patient_dni
    FROM appointments a
    LEFT JOIN patients pat ON (
        pat.clinic_id   = p_clinic_id
        AND pat.deleted_at IS NULL
        AND pat.phone   = a.phone   -- match por teléfono (heurístico para MVP)
    )
    WHERE a.clinic_id   = p_clinic_id
      AND a.start_time >= v_today_start
      AND a.start_time <  v_today_end
      AND a.status IN ('scheduled', 'confirmed', 'completed')
    ORDER BY a.start_time;
END;
$$;

COMMENT ON FUNCTION public.get_today_appointments_with_status IS
    'Citas del día para la clínica. Incluye: '
    'has_record (si ya se llenó la historia), '
    'patient_id y patient_dni si el paciente ya tiene perfil (match por teléfono). '
    'El match por teléfono es heurístico; el médico confirma el vínculo al llenar la historia.';

GRANT EXECUTE ON FUNCTION public.get_today_appointments_with_status TO authenticated;
