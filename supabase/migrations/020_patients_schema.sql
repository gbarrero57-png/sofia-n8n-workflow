-- ============================================================
-- SofIA SaaS — Portal de Historial Clínico
-- Migration 020: Tablas de pacientes y registros clínicos
--
-- PREREQUISITOS:
--   - 001_schema.sql (uuid-ossp, pg_trgm, btree_gist, clinics, appointments)
--   - 011_auth_staff.sql (staff, update_updated_at trigger function)
--
-- CONTENIDO:
--   1. ENUMs: gender_type, blood_type_enum, allergy_severity
--   2. TABLE: patients         (perfil del paciente, identificado por DNI)
--   3. TABLE: clinical_records (1 fila por consulta/visita)
--   4. TABLE: patient_allergies(lista de alergias, separada para alertas)
--   5. Triggers updated_at
-- ============================================================

-- ============================================================
-- SECTION 1: ENUMs
-- ============================================================

CREATE TYPE gender_type AS ENUM ('M', 'F', 'otro');

CREATE TYPE blood_type_enum AS ENUM (
    'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'desconocido'
);

CREATE TYPE allergy_severity AS ENUM ('leve', 'moderada', 'severa', 'anafilaxis');

-- ============================================================
-- SECTION 2: TABLE patients
--
-- Perfil del paciente. Identificado por (clinic_id, dni).
-- Un mismo DNI en dos clínicas distintas = dos registros independientes.
-- Soft delete: deleted_at IS NOT NULL = eliminado.
-- El UNIQUE parcial garantiza unicidad solo para registros activos,
-- permitiendo reactivar un paciente con el mismo DNI si fue eliminado.
-- ============================================================

CREATE TABLE public.patients (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id   UUID        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,

    -- Identificador principal (DNI peruano: 8 dígitos numéricos)
    dni         TEXT        NOT NULL,
    full_name   TEXT        NOT NULL,
    birth_date  DATE,
    gender      gender_type,

    -- Datos médicos del perfil (estáticos por paciente, no por visita)
    blood_type  blood_type_enum NOT NULL DEFAULT 'desconocido',

    -- Contacto (puede pre-llenarse desde appointments)
    phone       TEXT,
    email       TEXT,
    address     TEXT,

    -- Contacto de emergencia
    emergency_contact_name  TEXT,
    emergency_contact_phone TEXT,

    -- Auditoría de quién creó/modificó
    created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Soft delete (nunca borrar historias clínicas)
    deleted_at  TIMESTAMPTZ,

    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Validación: DNI peruano = exactamente 8 dígitos
    CONSTRAINT patients_dni_format CHECK (dni ~ '^[0-9]{8}$')
);

COMMENT ON TABLE public.patients IS
    'Perfil del paciente por clínica. Identificado por (clinic_id, dni). '
    'Soft delete vía deleted_at. Un mismo DNI puede re-registrarse tras un soft delete.';
COMMENT ON COLUMN public.patients.dni IS
    'DNI peruano: exactamente 8 dígitos numéricos. '
    'Único por clínica entre registros activos (ver índice idx_patients_clinic_dni).';
COMMENT ON COLUMN public.patients.deleted_at IS
    'Soft delete. NULL = activo. IS NOT NULL = eliminado. '
    'Usar deleted_at = now() para eliminar, nunca DELETE.';
COMMENT ON COLUMN public.patients.blood_type IS
    'Tipo de sangre del paciente. Valor por defecto: desconocido hasta que el médico lo confirme.';

-- ============================================================
-- SECTION 3: TABLE clinical_records
--
-- Una fila por consulta/visita. Inmutable para staff una vez guardada.
-- Solo admin puede corregir, con razón obligatoria y auditoría.
-- Soft delete: deleted_at IS NOT NULL (solo admin puede soft-delete).
-- ============================================================

CREATE TABLE public.clinical_records (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id           UUID        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    patient_id          UUID        NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,

    -- Vínculo opcional con cita agendada por SofIA
    -- ON DELETE SET NULL: si se borra la cita, el registro clínico queda sin vínculo
    appointment_id      UUID        REFERENCES public.appointments(id) ON DELETE SET NULL,

    -- Datos de la consulta (llenados por el médico post-visita)
    consultation_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
    reason              TEXT        NOT NULL,   -- Motivo de consulta
    diagnosis           TEXT        NOT NULL,   -- Diagnóstico
    treatment           TEXT,                   -- Tratamiento indicado
    medications         TEXT,                   -- Medicamentos recetados (dosis y frecuencia)
    observations        TEXT,                   -- Observaciones del médico

    -- Seguimiento
    next_appointment_rec DATE,                  -- Próxima cita recomendada (fecha orientativa)

    -- Signos vitales (opcionales, según tipo de clínica)
    weight_kg           NUMERIC(5,2),
    height_cm           NUMERIC(5,1),
    blood_pressure      TEXT,                   -- Formato libre: "120/80 mmHg"
    temperature_c       NUMERIC(4,1),

    -- Quién atendió (desnormalizado para preservar el nombre si el staff es eliminado)
    attended_by         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    attended_by_name    TEXT,       -- Nombre en el momento de la consulta

    -- Auditoría de ediciones (solo admin puede editar post-guardado)
    last_edited_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    last_edited_at      TIMESTAMPTZ,
    edit_reason         TEXT,       -- Obligatorio al editar: razón de la corrección

    -- Soft delete (archivar, no borrar)
    deleted_at          TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.clinical_records IS
    'Una fila por consulta/visita médica. '
    'Inmutable para rol staff. Solo admin puede corregir con edit_reason. '
    'Soft delete via deleted_at. ON DELETE RESTRICT en patient_id: '
    'no se puede eliminar un paciente con registros clínicos.';
COMMENT ON COLUMN public.clinical_records.attended_by_name IS
    'Nombre del médico desnormalizado. Garantiza que el historial muestre '
    'quién atendió incluso si el usuario es eliminado del sistema.';
COMMENT ON COLUMN public.clinical_records.appointment_id IS
    'FK opcional a appointments. Si está presente, el registro se vincula '
    'con una cita de SofIA. Al guardar, la cita se marca como completed.';

-- ============================================================
-- SECTION 4: TABLE patient_allergies
--
-- Lista de alergias separada del registro clínico para:
-- - Mostrar alertas rápidas sin cargar todo el historial
-- - Permitir al bot consultar (solo alergias severas/anafilaxis)
-- - Actualizar sin modificar el registro clínico inmutable
-- ============================================================

CREATE TABLE public.patient_allergies (
    id          UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id   UUID            NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    patient_id  UUID            NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,

    allergen    TEXT            NOT NULL,       -- "Penicilina", "Látex", "Mariscos"
    reaction    TEXT,                           -- Descripción de la reacción observada
    severity    allergy_severity NOT NULL DEFAULT 'moderada',
    confirmed   BOOLEAN         NOT NULL DEFAULT true,  -- false = sospecha, no confirmada

    -- Quién registró la alergia
    recorded_by UUID            REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Soft delete (desactivar sin borrar)
    deleted_at  TIMESTAMPTZ,

    created_at  TIMESTAMPTZ     NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.patient_allergies IS
    'Alergias del paciente. Separadas de clinical_records para consultas rápidas '
    'y alertas críticas. El bot puede leer solo severity IN (severa, anafilaxis).';
COMMENT ON COLUMN public.patient_allergies.confirmed IS
    'true = alergia confirmada clínicamente. '
    'false = sospecha reportada por el paciente, no verificada.';

-- ============================================================
-- SECTION 5: TRIGGERS updated_at
-- Usa la función update_updated_at() definida en 001_schema.sql
-- ============================================================

CREATE TRIGGER trg_patients_updated
    BEFORE UPDATE ON public.patients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_clinical_records_updated
    BEFORE UPDATE ON public.clinical_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
