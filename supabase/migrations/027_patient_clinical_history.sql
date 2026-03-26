-- ============================================================
-- SofIA SaaS — Patient Clinical History Bot Integration
-- Migration 027: clinical_events table + bot-callable RPC functions
--
-- PREREQUISITOS:
--   - 020_patients_schema.sql  (patients, clinical_records, patient_allergies)
--   - 001_schema.sql           (clinics, appointments, uuid-ossp)
--
-- CONTENIDO:
--   1. TABLE: clinical_events  (bot-driven event log per patient)
--   2. RLS policies            (service role bypasses, anon blocked)
--   3. Indexes                 (patient timeline, clinic queries)
--   4. FUNCTION: bot_upsert_patient   — upsert patient by phone+clinic (service-role, no JWT)
--   5. FUNCTION: log_clinical_event   — insert event into clinical_events (service-role)
--   6. FUNCTION: get_patient_history  — full timeline for a patient by phone
--
-- DISEÑO:
--   - patients tabla existente es por DNI (staff portal).
--   - clinical_events es la capa BOT: se crea por phone, sin DNI.
--   - bot_upsert_patient trabaja con phone+clinic, no DNI.
--   - Columna phone en patients es NULLABLE — el bot la usa para vincular
--     pacientes bot con pacientes staff si el staff ya los ingresó.
--   - Seguridad: todas las funciones bot usan SECURITY DEFINER.
--     El bot llama con service_role key → RLS se bypassea.
--     El frontend llama con JWT → RLS aplica (clinic_id isolation).
-- ============================================================


-- ============================================================
-- SECTION 1: TABLE clinical_events
-- ============================================================

CREATE TABLE IF NOT EXISTS public.clinical_events (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id       UUID        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,

    -- FK a patients por id (si el paciente ya tiene perfil completo).
    -- Nullable: el bot puede logear eventos antes de que exista perfil de staff.
    patient_id      UUID        REFERENCES public.patients(id) ON DELETE SET NULL,

    -- FK directa a appointments para trazabilidad
    appointment_id  UUID        REFERENCES public.appointments(id) ON DELETE SET NULL,

    -- Tipo de evento (extensible via CHECK constraint)
    event_type      TEXT        NOT NULL CHECK (event_type IN (
        'appointment_booked',
        'appointment_confirmed',
        'appointment_cancelled',
        'appointment_completed',
        'bot_interaction',
        'escalation',
        'reminder_sent',
        'staff_note'
    )),

    -- Teléfono del paciente (normalizado, sin "whatsapp:" prefix).
    -- Denormalizado aquí para poder logear eventos aunque no haya patient_id.
    phone           TEXT,

    -- Resumen legible del evento (para el portal staff)
    summary         TEXT,

    -- Datos extra flexibles (conversation_id, chatwoot_id, slot elegido, etc.)
    metadata        JSONB       NOT NULL DEFAULT '{}',

    -- Quién generó este evento
    created_by      TEXT        NOT NULL DEFAULT 'bot'
                    CHECK (created_by IN ('bot', 'staff', 'system')),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.clinical_events IS
    'Log de eventos clínicos generados por el bot SofIA o el staff. '
    'Complementa clinical_records (que es el registro clínico formal del médico). '
    'Permite ver el historial completo de un paciente: citas, escalaciones, recordatorios.';

COMMENT ON COLUMN public.clinical_events.patient_id IS
    'FK a patients. Nullable: el bot logea eventos por phone antes de que '
    'el staff cree el perfil formal. Se vincula retroactivamente cuando el staff crea el paciente.';

COMMENT ON COLUMN public.clinical_events.phone IS
    'Teléfono normalizado (sin whatsapp: prefix). Usado para agrupar eventos '
    'de un contacto antes de que tenga patient_id.';

COMMENT ON COLUMN public.clinical_events.metadata IS
    'Datos adicionales del evento. Ejemplos: '
    '{conversation_id, chatwoot_id, slot_chosen, service, doctor_id, '
    'escalation_reason, reminder_type}.';


-- ============================================================
-- SECTION 2: RLS policies — clinical_events
-- ============================================================

ALTER TABLE public.clinical_events ENABLE ROW LEVEL SECURITY;

-- staff y admin: ver eventos de su clínica
CREATE POLICY clinical_events_select ON public.clinical_events
    FOR SELECT
    USING (
        clinic_id = (auth.jwt() ->> 'clinic_id')::uuid
        AND (auth.jwt() ->> 'user_role') IN ('admin', 'staff')
    );

-- staff y admin: insertar eventos en su clínica
CREATE POLICY clinical_events_insert ON public.clinical_events
    FOR INSERT
    WITH CHECK (
        clinic_id = (auth.jwt() ->> 'clinic_id')::uuid
        AND (auth.jwt() ->> 'user_role') IN ('admin', 'staff')
    );

-- NOTA: service_role key bypasses RLS entirely → el bot puede INSERT sin JWT.
-- anon key: bloqueada (no hay política FOR ALL TO anon).


-- ============================================================
-- SECTION 3: Indexes
-- ============================================================

-- Timeline del paciente por clinic+phone (query más frecuente del bot)
CREATE INDEX IF NOT EXISTS idx_clinical_events_clinic_phone
    ON public.clinical_events (clinic_id, phone, created_at DESC)
    WHERE phone IS NOT NULL;

-- Timeline por patient_id (cuando el perfil ya existe)
CREATE INDEX IF NOT EXISTS idx_clinical_events_patient
    ON public.clinical_events (patient_id, created_at DESC)
    WHERE patient_id IS NOT NULL;

-- Filtro por tipo de evento (búsqueda en dashboard: "ver todas las escalaciones")
CREATE INDEX IF NOT EXISTS idx_clinical_events_type
    ON public.clinical_events (clinic_id, event_type, created_at DESC);

-- Lookup por appointment_id (para vincular registro médico con eventos)
CREATE INDEX IF NOT EXISTS idx_clinical_events_appointment
    ON public.clinical_events (appointment_id)
    WHERE appointment_id IS NOT NULL;


-- ============================================================
-- SECTION 4: FUNCTION bot_upsert_patient
--
-- Crea o actualiza un paciente identificado por (clinic_id, phone).
-- Llamado con service_role key (sin JWT) → RLS bypassed.
-- Normaliza el phone: remueve prefijo "whatsapp:" si existe.
-- Retorna: patient_id + is_new flag.
-- ============================================================

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
    -- Nota: PostgreSQL no soporta (?i) inline flag — usar clase de caracteres explícita
    v_phone := regexp_replace(p_phone, '^[Ww][Hh][Aa][Tt][Ss][Aa][Pp][Pp]:', '');
    -- Remover espacios
    v_phone := trim(v_phone);

    -- Validar inputs mínimos
    IF p_clinic_id IS NULL THEN
        RETURN jsonb_build_object('error', 'MISSING_CLINIC_ID');
    END IF;
    IF v_phone = '' OR v_phone IS NULL THEN
        RETURN jsonb_build_object('error', 'MISSING_PHONE');
    END IF;

    -- Buscar paciente existente por (clinic_id, phone) — SOLO entre activos
    SELECT id, full_name
    INTO v_patient_id, v_existing_name
    FROM patients
    WHERE clinic_id = p_clinic_id
      AND phone     = v_phone
      AND deleted_at IS NULL
    LIMIT 1;

    IF v_patient_id IS NULL THEN
        -- No existe: crear registro mínimo
        -- DNI: generamos un placeholder temporal "BOT-{timestamp}" que cumple el CHECK constraint
        -- NOTA: el CHECK en patients exige dni ~ '^[0-9]{8}$'.
        -- Para pacientes bot (sin DNI real) usamos un DNI placeholder de 8 dígitos
        -- derivado del timestamp. Esto permite crear el registro; el staff lo puede
        -- actualizar con el DNI real cuando el paciente llega a consulta.
        -- Estrategia: INSERT solo si la tabla patients permite NULL en dni
        -- → pero el schema tiene NOT NULL en dni. Entonces usamos un UUID corto.
        -- Usamos los últimos 8 dígitos de EXTRACT(EPOCH) como placeholder único.
        DECLARE
            v_dni_placeholder TEXT;
        BEGIN
            -- Generar DNI placeholder: 8 dígitos, único por clinic
            -- Usamos un loop por si colisiona (muy improbable)
            LOOP
                v_dni_placeholder := lpad(
                    (floor(random() * 90000000) + 10000000)::text,
                    8, '0'
                );
                -- Verificar que no exista ya este dni en la clínica
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
                v_dni_placeholder,                    -- placeholder DNI
                COALESCE(p_full_name, 'Paciente Bot'), -- nombre provisional
                v_phone,
                p_email
            )
            RETURNING id INTO v_patient_id;

            v_is_new := true;
        END;
    ELSE
        -- Ya existe: actualizar nombre/email si se proporcionan y no estaban
        -- COALESCE: no sobreescribe datos existentes con NULL
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

COMMENT ON FUNCTION public.bot_upsert_patient IS
    'Crea o actualiza un paciente por (clinic_id, phone). '
    'Diseñado para ser llamado por el bot SofIA con service_role key. '
    'Normaliza el phone (remueve whatsapp: prefix). '
    'Para pacientes nuevos, genera un DNI placeholder de 8 dígitos aleatorio '
    'que el staff puede actualizar con el DNI real. '
    'Retorna {success, patient_id, is_new, clinic_id, phone}.';

-- Accesible desde service_role (bot) y authenticated (staff portal si necesario)
GRANT EXECUTE ON FUNCTION public.bot_upsert_patient TO service_role;
GRANT EXECUTE ON FUNCTION public.bot_upsert_patient TO authenticated;


-- ============================================================
-- SECTION 5: FUNCTION log_clinical_event
--
-- Inserta un evento en clinical_events.
-- Diseñado para ser llamado por el bot con service_role key.
-- Intenta vincular con patient_id por phone si no se pasa explícitamente.
-- ============================================================

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

    -- Validar evento type (redundante con CHECK pero da mejor error)
    IF p_event_type NOT IN (
        'appointment_booked', 'appointment_confirmed', 'appointment_cancelled',
        'appointment_completed', 'bot_interaction', 'escalation',
        'reminder_sent', 'staff_note'
    ) THEN
        RETURN jsonb_build_object('error', 'INVALID_EVENT_TYPE', 'type', p_event_type);
    END IF;

    -- Si no se pasa patient_id, intentar resolverlo por phone
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

COMMENT ON FUNCTION public.log_clinical_event IS
    'Inserta un evento clínico en clinical_events. '
    'Llamado por el bot con service_role key. '
    'Si no se pasa patient_id, intenta resolverlo por phone+clinic. '
    'Normaliza el phone (remueve whatsapp: prefix). '
    'Retorna {success, event_id, event_type, patient_id, clinic_id}.';

GRANT EXECUTE ON FUNCTION public.log_clinical_event TO service_role;
GRANT EXECUTE ON FUNCTION public.log_clinical_event TO authenticated;


-- ============================================================
-- SECTION 6: FUNCTION get_patient_history
--
-- Devuelve el historial completo de un paciente por phone+clinic.
-- Incluye: perfil del paciente + eventos clínicos (bot) + citas.
-- Accesible por staff (con JWT) o service_role (bot).
-- ============================================================

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

    -- Perfil del paciente (si existe)
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

    -- Eventos clínicos (más recientes primero)
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

    -- Citas del paciente (más recientes primero)
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

COMMENT ON FUNCTION public.get_patient_history IS
    'Historial completo de un paciente por phone+clinic. '
    'Incluye: perfil del paciente (si existe), eventos clínicos del bot, '
    'y citas (de appointments table). '
    'Normaliza el phone. Accesible por service_role y authenticated staff.';

GRANT EXECUTE ON FUNCTION public.get_patient_history TO service_role;
GRANT EXECUTE ON FUNCTION public.get_patient_history TO authenticated;
