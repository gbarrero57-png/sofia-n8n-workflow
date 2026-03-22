-- ============================================================
-- SofIA SaaS — Portal de Historial Clínico
-- Migration 021: RLS + Índices para tablas de pacientes
--
-- PREREQUISITO: 020_patients_schema.sql
--
-- CONTENIDO:
--   1. RLS policies — patients
--   2. RLS policies — clinical_records
--   3. RLS policies — patient_allergies
--   4. Índices de rendimiento (búsqueda, timeline, dashboard)
-- ============================================================

-- ============================================================
-- SECTION 1: RLS — patients
--
-- REGLA CENTRAL: clinic_id = JWT.clinic_id en TODAS las políticas.
-- Un staff de Clínica A recibe 0 resultados al buscar pacientes
-- de Clínica B. Sin mensaje de error que confirme la existencia.
--
-- staff: INSERT + SELECT (solo registros activos)
-- admin: INSERT + SELECT (incluyendo soft-deleted) + UPDATE
-- Nadie hace hard DELETE desde la aplicación.
-- ============================================================

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- staff y admin: ver pacientes activos de su clínica
CREATE POLICY patients_select_active ON public.patients
    FOR SELECT
    USING (
        clinic_id = (auth.jwt() ->> 'clinic_id')::uuid
        AND deleted_at IS NULL
        AND (auth.jwt() ->> 'user_role') IN ('admin', 'staff')
    );

-- admin: también puede ver soft-deleted (para recuperación)
CREATE POLICY patients_admin_see_deleted ON public.patients
    FOR SELECT
    USING (
        clinic_id = (auth.jwt() ->> 'clinic_id')::uuid
        AND deleted_at IS NOT NULL
        AND (auth.jwt() ->> 'user_role') = 'admin'
    );

-- staff y admin: crear nuevos pacientes en su clínica
CREATE POLICY patients_insert ON public.patients
    FOR INSERT
    WITH CHECK (
        clinic_id = (auth.jwt() ->> 'clinic_id')::uuid
        AND (auth.jwt() ->> 'user_role') IN ('admin', 'staff')
    );

-- admin: actualizar datos del paciente (incluye soft delete via deleted_at)
-- staff no puede modificar perfiles una vez creados
CREATE POLICY patients_admin_update ON public.patients
    FOR UPDATE
    USING (
        clinic_id = (auth.jwt() ->> 'clinic_id')::uuid
        AND (auth.jwt() ->> 'user_role') = 'admin'
    );

-- ============================================================
-- SECTION 2: RLS — clinical_records
--
-- staff: solo INSERT (crear nueva consulta). NO puede editar ni borrar.
-- admin: INSERT + SELECT + UPDATE (correcciones con edit_reason).
-- La historia clínica es inmutable para staff una vez guardada.
-- ============================================================

ALTER TABLE public.clinical_records ENABLE ROW LEVEL SECURITY;

-- staff y admin: ver registros activos de su clínica
CREATE POLICY records_select ON public.clinical_records
    FOR SELECT
    USING (
        clinic_id = (auth.jwt() ->> 'clinic_id')::uuid
        AND deleted_at IS NULL
        AND (auth.jwt() ->> 'user_role') IN ('admin', 'staff')
    );

-- staff y admin: crear nuevos registros clínicos
CREATE POLICY records_insert ON public.clinical_records
    FOR INSERT
    WITH CHECK (
        clinic_id = (auth.jwt() ->> 'clinic_id')::uuid
        AND (auth.jwt() ->> 'user_role') IN ('admin', 'staff')
    );

-- SOLO admin: corregir o soft-delete un registro existente
-- Requiere edit_reason en el UPDATE (validado en la función RPC)
CREATE POLICY records_admin_update ON public.clinical_records
    FOR UPDATE
    USING (
        clinic_id = (auth.jwt() ->> 'clinic_id')::uuid
        AND (auth.jwt() ->> 'user_role') = 'admin'
    );

-- ============================================================
-- SECTION 3: RLS — patient_allergies
--
-- staff y admin: INSERT + SELECT + UPDATE (soft delete vía deleted_at)
-- Las alergias pueden ser corregidas (son más dinámicas que el historial).
-- ============================================================

ALTER TABLE public.patient_allergies ENABLE ROW LEVEL SECURITY;

CREATE POLICY allergies_select ON public.patient_allergies
    FOR SELECT
    USING (
        clinic_id = (auth.jwt() ->> 'clinic_id')::uuid
        AND deleted_at IS NULL
        AND (auth.jwt() ->> 'user_role') IN ('admin', 'staff')
    );

CREATE POLICY allergies_insert ON public.patient_allergies
    FOR INSERT
    WITH CHECK (
        clinic_id = (auth.jwt() ->> 'clinic_id')::uuid
        AND (auth.jwt() ->> 'user_role') IN ('admin', 'staff')
    );

-- staff y admin pueden desactivar alergias (soft delete)
CREATE POLICY allergies_update ON public.patient_allergies
    FOR UPDATE
    USING (
        clinic_id = (auth.jwt() ->> 'clinic_id')::uuid
        AND (auth.jwt() ->> 'user_role') IN ('admin', 'staff')
    );

-- ============================================================
-- SECTION 4: ÍNDICES
--
-- Estrategia:
--   - Índices PARCIALES (WHERE deleted_at IS NULL) para excluir
--     soft-deleted de los scans más frecuentes
--   - pg_trgm para búsqueda fuzzy por nombre
--   - Índice UNIQUE parcial para DNI activo por clínica
-- ============================================================

-- ── patients ────────────────────────────────────────────────

-- Búsqueda principal: DNI exacto dentro de una clínica.
-- UNIQUE garantiza que no haya dos pacientes activos con el mismo DNI.
CREATE UNIQUE INDEX idx_patients_clinic_dni
    ON public.patients (clinic_id, dni)
    WHERE deleted_at IS NULL;

-- Búsqueda por nombre con fuzzy matching (trigram).
-- Soporta ILIKE '%query%' y similarity() en search_patients().
CREATE INDEX idx_patients_name_trgm
    ON public.patients USING gin (full_name gin_trgm_ops)
    WHERE deleted_at IS NULL;

-- Búsqueda por teléfono (pre-llenado desde appointments).
CREATE INDEX idx_patients_phone
    ON public.patients (clinic_id, phone)
    WHERE deleted_at IS NULL AND phone IS NOT NULL;

-- Listado de pacientes de una clínica (dashboard admin).
CREATE INDEX idx_patients_clinic
    ON public.patients (clinic_id, created_at DESC)
    WHERE deleted_at IS NULL;

-- ── clinical_records ─────────────────────────────────────────

-- Timeline del paciente: todas sus consultas ordenadas por fecha.
-- Query más frecuente del portal: GET /patients/:id → timeline.
CREATE INDEX idx_records_patient_date
    ON public.clinical_records (patient_id, consultation_date DESC)
    WHERE deleted_at IS NULL;

-- Dashboard del médico: consultas del día por clínica.
CREATE INDEX idx_records_clinic_date
    ON public.clinical_records (clinic_id, consultation_date DESC)
    WHERE deleted_at IS NULL;

-- Vínculo appointment → clinical_record.
-- Usado para saber si una cita ya tiene historia y para marcarla completed.
CREATE INDEX idx_records_appointment
    ON public.clinical_records (appointment_id)
    WHERE appointment_id IS NOT NULL AND deleted_at IS NULL;

-- Consultas por médico (filtro en dashboard admin).
CREATE INDEX idx_records_attended_by
    ON public.clinical_records (clinic_id, attended_by, consultation_date DESC)
    WHERE deleted_at IS NULL AND attended_by IS NOT NULL;

-- ── patient_allergies ─────────────────────────────────────────

-- Alertas críticas: alergias severas/anafilaxis de un paciente.
-- Llamado frecuente al cargar el perfil del paciente.
CREATE INDEX idx_allergies_patient_severity
    ON public.patient_allergies (patient_id, severity)
    WHERE deleted_at IS NULL;

-- Todas las alergias activas de una clínica (admin dashboard).
CREATE INDEX idx_allergies_clinic
    ON public.patient_allergies (clinic_id)
    WHERE deleted_at IS NULL;
