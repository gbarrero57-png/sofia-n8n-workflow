-- ============================================================
-- SofIA SaaS — Multi-Doctor Calendar System
-- Migration 025: Add doctor_id to appointments
--               Replace clinic-level EXCLUDE with doctor-level EXCLUDE
--               Update get_pending_reminders to include doctor_name
-- ============================================================
-- PREREQUISITE: Migration 024 (doctors table) must be applied first.
-- SAFE: All changes are backward-compatible.
--   - doctor_id is NULL for all existing rows (treated as "unassigned")
--   - New EXCLUDE constraints reproduce the same behavior for NULL-doctor rows
-- ============================================================

-- ============================================================
-- SECTION 1: Add doctor_id column to appointments
-- ============================================================

ALTER TABLE public.appointments
    ADD COLUMN doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.appointments.doctor_id IS
    'Doctor assigned to this appointment. '
    'NULL = legacy / bot-booked without doctor preference. '
    'Set by n8n Guardar Cita node when doctor is configured for the clinic.';

-- ============================================================
-- SECTION 2: Replace EXCLUDE constraint
--
-- OLD: no_overlap prevents double-booking per CLINIC (ignores doctor).
--      This was correct when each clinic had one calendar.
--
-- NEW: Two constraints replace it:
--   A) no_doctor_overlap  — per DOCTOR (when doctor_id IS NOT NULL)
--      Two appointments with the same doctor cannot overlap in time.
--      Different doctors at the same clinic CAN have overlapping times.
--
--   B) no_clinic_overlap_unassigned — per CLINIC (when doctor_id IS NULL)
--      Legacy behavior preserved for appointments without a doctor.
--      Equivalent to the old no_overlap, scoped to NULL-doctor rows only.
-- ============================================================

-- Drop the old clinic-level constraint
ALTER TABLE public.appointments DROP CONSTRAINT no_overlap;

-- A) Doctor-level: prevents double-booking same doctor
ALTER TABLE public.appointments
    ADD CONSTRAINT no_doctor_overlap
    EXCLUDE USING gist (
        doctor_id WITH =,
        tstzrange(start_time, end_time) WITH &&
    )
    WHERE (
        status IN ('scheduled', 'confirmed')
        AND doctor_id IS NOT NULL
    );

-- B) Clinic-level for unassigned (legacy / fallback mode)
ALTER TABLE public.appointments
    ADD CONSTRAINT no_clinic_overlap_unassigned
    EXCLUDE USING gist (
        clinic_id WITH =,
        tstzrange(start_time, end_time) WITH &&
    )
    WHERE (
        status IN ('scheduled', 'confirmed')
        AND doctor_id IS NULL
    );

-- ============================================================
-- SECTION 3: New indexes
-- ============================================================

-- n8n slot calculation: busy slots for a specific doctor in a time range
CREATE INDEX idx_appointments_doctor_time
    ON public.appointments (doctor_id, start_time)
    WHERE status IN ('scheduled', 'confirmed')
      AND doctor_id IS NOT NULL;

-- Dashboard: appointments per doctor per clinic
CREATE INDEX idx_appointments_clinic_doctor
    ON public.appointments (clinic_id, doctor_id, start_time)
    WHERE status IN ('scheduled', 'confirmed');

-- ============================================================
-- SECTION 4: Update get_pending_reminders
-- Add doctor_name to reminder output so the reminder message
-- can say "Su cita es con Dr. García el lunes..."
-- Must DROP first because return type changes (new doctor_name column).
-- ============================================================

DROP FUNCTION IF EXISTS public.get_pending_reminders();

CREATE OR REPLACE FUNCTION public.get_pending_reminders()
RETURNS TABLE (
    appointment_id      UUID,
    clinic_id           UUID,
    conversation_id     INTEGER,
    patient_name        TEXT,
    phone               TEXT,
    service             TEXT,
    start_time          TIMESTAMPTZ,
    clinic_name         TEXT,
    chatwoot_account_id INTEGER,
    doctor_name         TEXT        -- NEW: doctor display name or NULL
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.id            AS appointment_id,
        a.clinic_id,
        a.conversation_id,
        a.patient_name,
        a.phone,
        a.service,
        a.start_time,
        c.name          AS clinic_name,
        c.chatwoot_account_id,
        -- doctor_name: display_name override or computed, NULL if no doctor
        CASE
            WHEN d.id IS NULL THEN NULL
            ELSE COALESCE(
                NULLIF(trim(d.display_name), ''),
                'Dr. ' || trim(d.first_name) || ' ' || trim(d.last_name)
            )
        END             AS doctor_name
    FROM public.appointments a
    JOIN public.clinics c ON c.id = a.clinic_id
    LEFT JOIN public.doctors d ON d.id = a.doctor_id
    WHERE a.status IN ('scheduled', 'confirmed')
      AND a.reminder_sent = false
      AND a.start_time BETWEEN now() + interval '23 hours'
                           AND now() + interval '25 hours'
    ORDER BY a.start_time;
END;
$$;

COMMENT ON FUNCTION public.get_pending_reminders() IS
    'Returns appointments needing 24h reminders. '
    'Includes doctor_name (NULL if no doctor assigned). '
    'Updated in migration 025 to support multi-doctor system.';

-- ============================================================
-- SECTION 5: RPC — get_doctor_busy_slots
-- Called by n8n "Leer Citas Supabase" node.
-- Returns busy time blocks for one or all doctors in a clinic,
-- within a given time window (next 7 days by default).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_doctor_busy_slots(
    p_clinic_id  UUID,
    p_doctor_id  UUID        DEFAULT NULL,  -- NULL = all doctors
    p_from       TIMESTAMPTZ DEFAULT now(),
    p_to         TIMESTAMPTZ DEFAULT now() + interval '7 days'
)
RETURNS TABLE (
    doctor_id    UUID,
    doctor_name  TEXT,
    start_time   TIMESTAMPTZ,
    end_time     TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.doctor_id,
        CASE
            WHEN d.id IS NULL THEN NULL
            ELSE COALESCE(
                NULLIF(trim(d.display_name), ''),
                'Dr. ' || trim(d.first_name) || ' ' || trim(d.last_name)
            )
        END             AS doctor_name,
        a.start_time,
        a.end_time
    FROM public.appointments a
    LEFT JOIN public.doctors d ON d.id = a.doctor_id
    WHERE a.clinic_id = p_clinic_id
      AND a.status IN ('scheduled', 'confirmed')
      AND a.start_time >= p_from
      AND a.start_time <= p_to
      AND (p_doctor_id IS NULL OR a.doctor_id = p_doctor_id)
    ORDER BY a.doctor_id, a.start_time;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_doctor_busy_slots(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_doctor_busy_slots(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ)
    TO authenticated, service_role;

COMMENT ON FUNCTION public.get_doctor_busy_slots IS
    'Returns busy time blocks for a clinic. '
    'p_doctor_id=NULL returns all doctors. '
    'Called by n8n to calculate available slots per doctor.';

-- ============================================================
-- SECTION 6: VERIFY (run manually after deploy)
-- ============================================================

-- Check column added:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'appointments' AND column_name = 'doctor_id';

-- Check old constraint removed and new ones exist:
-- SELECT conname, contype FROM pg_constraint
-- WHERE conrelid = 'appointments'::regclass
-- AND conname LIKE '%overlap%' OR conname LIKE '%doctor%';
-- Expected: no_doctor_overlap, no_clinic_overlap_unassigned

-- Smoke test with a doctor insert:
-- INSERT INTO doctors (clinic_id, first_name, last_name, specialty, weekly_schedule)
-- VALUES ('c6c15fca-d7fc-4d98-83c1-2c5cb5a6bef1','Ana','López','Odontología General',
--         '[{"dow":1,"start_hour":9,"end_hour":17},{"dow":2,"start_hour":9,"end_hour":17},
--           {"dow":3,"start_hour":9,"end_hour":17},{"dow":4,"start_hour":9,"end_hour":17},
--           {"dow":5,"start_hour":9,"end_hour":17}]');
-- SELECT * FROM list_doctors('c6c15fca-d7fc-4d98-83c1-2c5cb5a6bef1');
-- SELECT question, answer FROM knowledge_base
--   WHERE metadata->>'doctor_id' IS NOT NULL
--   AND clinic_id = 'c6c15fca-d7fc-4d98-83c1-2c5cb5a6bef1';

-- ============================================================
-- END OF MIGRATION 025
-- ============================================================
