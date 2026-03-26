-- ============================================================
-- Migration 028: Fix (?i) inline regex flag in clinical history functions
--
-- PostgreSQL no soporta el flag inline (?i) en regexp_replace.
-- Error: "invalid regular expression: quantifier operand invalid"
-- Fix: reemplazar '^(?i)whatsapp:' con clase de caracteres explícita.
--
-- Afecta: bot_upsert_patient, log_clinical_event, get_patient_history
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. bot_upsert_patient — fix regex line 169
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.bot_upsert_patient(
    p_clinic_id     UUID,
    p_phone         TEXT,
    p_full_name     TEXT    DEFAULT NULL,
    p_email         TEXT    DEFAULT NULL
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
    -- Normalizar phone: remover prefijo "whatsapp:" (case-insensitive)
    v_phone := regexp_replace(p_phone, '^[Ww][Hh][Aa][Tt][Ss][Aa][Pp][Pp]:', '');
    v_phone := trim(v_phone);

    IF p_clinic_id IS NULL THEN
        RETURN jsonb_build_object('error', 'MISSING_CLINIC_ID');
    END IF;
    IF v_phone = '' OR v_phone IS NULL THEN
        RETURN jsonb_build_object('error', 'MISSING_PHONE');
    END IF;

    SELECT id, full_name
    INTO v_patient_id, v_existing_name
    FROM patients
    WHERE clinic_id = p_clinic_id
      AND phone     = v_phone
      AND deleted_at IS NULL
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
                clinic_id,
                dni,
                full_name,
                phone,
                email
            )
            VALUES (
                p_clinic_id,
                v_dni_placeholder,
                COALESCE(p_full_name, 'Paciente Bot'),
                v_phone,
                p_email
            )
            RETURNING id INTO v_patient_id;

            v_is_new := true;
        END;
    ELSE
        UPDATE patients SET
            full_name  = CASE
                            WHEN p_full_name IS NOT NULL AND p_full_name <> 'Paciente Bot'
                            AND (v_existing_name IS NULL OR v_existing_name LIKE 'Paciente Bot%')
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

GRANT EXECUTE ON FUNCTION public.bot_upsert_patient TO service_role;
GRANT EXECUTE ON FUNCTION public.bot_upsert_patient TO authenticated;


-- ────────────────────────────────────────────────────────────
-- 2. log_clinical_event — fix regex line 303
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_clinical_event(
    p_clinic_id         UUID,
    p_event_type        TEXT,
    p_phone             TEXT        DEFAULT NULL,
    p_patient_id        UUID        DEFAULT NULL,
    p_appointment_id    UUID        DEFAULT NULL,
    p_summary           TEXT        DEFAULT NULL,
    p_metadata          JSONB       DEFAULT '{}',
    p_created_by        TEXT        DEFAULT 'bot'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_phone         TEXT;
    v_patient_id    UUID := p_patient_id;
    v_event_id      UUID;
BEGIN
    -- Normalizar phone
    IF p_phone IS NOT NULL THEN
        v_phone := trim(regexp_replace(p_phone, '^[Ww][Hh][Aa][Tt][Ss][Aa][Pp][Pp]:', ''));
    END IF;

    IF p_event_type NOT IN (
        'appointment_booked', 'appointment_confirmed', 'appointment_cancelled',
        'appointment_completed', 'bot_interaction', 'escalation',
        'reminder_sent', 'staff_note'
    ) THEN
        RETURN jsonb_build_object('error', 'INVALID_EVENT_TYPE', 'type', p_event_type);
    END IF;

    IF v_patient_id IS NULL AND v_phone IS NOT NULL AND p_clinic_id IS NOT NULL THEN
        SELECT id INTO v_patient_id
        FROM patients
        WHERE clinic_id = p_clinic_id
          AND phone     = v_phone
          AND deleted_at IS NULL
        LIMIT 1;
    END IF;

    INSERT INTO clinical_events (
        clinic_id,
        patient_id,
        appointment_id,
        event_type,
        phone,
        summary,
        metadata,
        created_by
    )
    VALUES (
        p_clinic_id,
        v_patient_id,
        p_appointment_id,
        p_event_type,
        v_phone,
        p_summary,
        COALESCE(p_metadata, '{}'),
        COALESCE(p_created_by, 'bot')
    )
    RETURNING id INTO v_event_id;

    RETURN jsonb_build_object(
        'success',      true,
        'event_id',     v_event_id,
        'event_type',   p_event_type,
        'patient_id',   v_patient_id,
        'clinic_id',    p_clinic_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_clinical_event TO service_role;
GRANT EXECUTE ON FUNCTION public.log_clinical_event TO authenticated;


-- ────────────────────────────────────────────────────────────
-- 3. get_patient_history — fix regex line 393
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_patient_history(
    p_clinic_id     UUID,
    p_phone         TEXT,
    p_limit         INTEGER DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_phone         TEXT;
    v_patient       jsonb;
    v_events        jsonb;
    v_appointments  jsonb;
BEGIN
    -- Normalizar phone
    v_phone := trim(regexp_replace(p_phone, '^[Ww][Hh][Aa][Tt][Ss][Aa][Pp][Pp]:', ''));

    SELECT jsonb_build_object(
        'id',           p.id,
        'full_name',    p.full_name,
        'phone',        p.phone,
        'email',        p.email,
        'dni',          p.dni,
        'blood_type',   p.blood_type,
        'first_contact', p.created_at,
        'updated_at',   p.updated_at
    )
    INTO v_patient
    FROM patients p
    WHERE p.clinic_id   = p_clinic_id
      AND p.phone       = v_phone
      AND p.deleted_at  IS NULL
    LIMIT 1;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id',             e.id,
            'event_type',     e.event_type,
            'summary',        e.summary,
            'metadata',       e.metadata,
            'created_by',     e.created_by,
            'appointment_id', e.appointment_id,
            'created_at',     e.created_at
        ) ORDER BY e.created_at DESC
    ), '[]'::jsonb)
    INTO v_events
    FROM (
        SELECT * FROM clinical_events
        WHERE clinic_id = p_clinic_id
          AND phone     = v_phone
        ORDER BY created_at DESC
        LIMIT LEAST(COALESCE(p_limit, 20), 50)
    ) e;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id',          a.id,
            'service',     a.service,
            'start_time',  a.start_time,
            'end_time',    a.end_time,
            'status',      a.status,
            'doctor_id',   a.doctor_id,
            'notes',       a.notes,
            'source',      a.source,
            'created_at',  a.created_at
        ) ORDER BY a.start_time DESC
    ), '[]'::jsonb)
    INTO v_appointments
    FROM (
        SELECT * FROM appointments
        WHERE clinic_id = p_clinic_id
          AND phone     LIKE '%' || v_phone
        ORDER BY start_time DESC
        LIMIT LEAST(COALESCE(p_limit, 20), 50)
    ) a;

    RETURN jsonb_build_object(
        'found',        v_patient IS NOT NULL,
        'phone',        v_phone,
        'clinic_id',    p_clinic_id,
        'patient',      v_patient,
        'events',       COALESCE(v_events, '[]'::jsonb),
        'appointments', COALESCE(v_appointments, '[]'::jsonb)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_patient_history TO service_role;
GRANT EXECUTE ON FUNCTION public.get_patient_history TO authenticated;
