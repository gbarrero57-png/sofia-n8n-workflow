-- ============================================================
-- SofIA SaaS — Multi-Doctor Calendar System
-- Migration 024: doctors table + RLS + KB auto-sync trigger
-- ============================================================

-- ============================================================
-- SECTION 1: TABLE doctors
-- One row per doctor per clinic. Weekly schedule stored as JSONB.
-- Format: [ { "dow": 1, "start_hour": 9, "end_hour": 18 }, ... ]
-- dow: 0=Sunday, 1=Monday, ... 6=Saturday
-- Multiple entries per dow allowed (split shifts).
-- ============================================================

CREATE TABLE public.doctors (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id        UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    first_name       TEXT        NOT NULL,
    last_name        TEXT        NOT NULL,
    specialty        TEXT        NOT NULL DEFAULT 'Odontología General',
    display_name     TEXT,                  -- Override, e.g. "Dr. García". Auto-computed if NULL.
    bio              TEXT,                  -- Short patient-facing description
    weekly_schedule  JSONB       NOT NULL DEFAULT '[]'::jsonb,
    slot_duration_min INTEGER    NOT NULL DEFAULT 30,
    active           BOOLEAN     NOT NULL DEFAULT true,
    created_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT doctors_name_nonempty CHECK (
        length(trim(first_name)) > 0 AND length(trim(last_name)) > 0
    ),
    CONSTRAINT doctors_slot_duration_valid CHECK (
        slot_duration_min IN (15, 20, 30, 45, 60)
    ),
    CONSTRAINT doctors_schedule_is_array CHECK (
        jsonb_typeof(weekly_schedule) = 'array'
    )
);

COMMENT ON TABLE  public.doctors IS
    'One calendar per doctor per clinic. weekly_schedule drives slot availability.';
COMMENT ON COLUMN public.doctors.weekly_schedule IS
    'Array of {dow:0-6, start_hour:0-23, end_hour:1-24}. '
    'Multiple entries per dow = split shift. Empty array = no availability.';
COMMENT ON COLUMN public.doctors.display_name IS
    'Patient-facing name. If NULL, computed as "Dr. first_name last_name".';
COMMENT ON COLUMN public.doctors.slot_duration_min IS
    'Appointment slot length in minutes. Allowed: 15, 20, 30, 45, 60.';

-- ============================================================
-- SECTION 2: updated_at TRIGGER
-- ============================================================

CREATE TRIGGER trg_doctors_updated
    BEFORE UPDATE ON public.doctors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SECTION 3: INDEXES
-- ============================================================

-- Primary dashboard query: list active doctors for a clinic
CREATE INDEX idx_doctors_clinic_active
    ON public.doctors (clinic_id, active)
    WHERE active = true;

-- n8n slot calculation: fetch by clinic
CREATE INDEX idx_doctors_clinic_id
    ON public.doctors (clinic_id);

-- ============================================================
-- SECTION 4: ROW LEVEL SECURITY
-- Pattern follows migration 002 exactly.
-- ============================================================

ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;

-- admin and staff can SELECT active doctors in their clinic
CREATE POLICY doctors_select ON public.doctors
    FOR SELECT
    USING (
        clinic_id = (auth.jwt() ->> 'clinic_id')::uuid
        AND (auth.jwt() ->> 'user_role') IN ('admin', 'staff')
    );

-- admin can INSERT doctors in their own clinic only
CREATE POLICY doctors_admin_insert ON public.doctors
    FOR INSERT
    WITH CHECK (
        clinic_id = (auth.jwt() ->> 'clinic_id')::uuid
        AND (auth.jwt() ->> 'user_role') = 'admin'
    );

-- admin can UPDATE (includes soft-delete via active=false)
CREATE POLICY doctors_admin_update ON public.doctors
    FOR UPDATE
    USING (
        clinic_id = (auth.jwt() ->> 'clinic_id')::uuid
        AND (auth.jwt() ->> 'user_role') = 'admin'
    );

-- No hard-DELETE policy. Deactivation is done via UPDATE active=false.

COMMENT ON POLICY doctors_select          ON public.doctors IS 'admin + staff see their clinic doctors';
COMMENT ON POLICY doctors_admin_insert    ON public.doctors IS 'admin creates doctors in own clinic only';
COMMENT ON POLICY doctors_admin_update    ON public.doctors IS 'admin edits/deactivates doctors in own clinic';

-- ============================================================
-- SECTION 5: HELPER — format_doctor_schedule(JSONB) → TEXT
-- Produces human-readable Spanish schedule summary.
-- Example: "Lunes: 09:00-18:00. Miércoles: 14:00-19:00."
-- ============================================================

CREATE OR REPLACE FUNCTION public.format_doctor_schedule(p_schedule JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_entry       JSONB;
    v_dow         INT;
    v_start       INT;
    v_end         INT;
    v_parts       TEXT[] := '{}';
    v_day_names   TEXT[] := ARRAY[
        'Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'
    ];
BEGIN
    IF p_schedule IS NULL OR p_schedule = '[]'::jsonb THEN
        RETURN 'Sin horario configurado';
    END IF;

    FOR v_entry IN SELECT jsonb_array_elements(p_schedule)
    LOOP
        v_dow   := (v_entry ->> 'dow')::INT;
        v_start := (v_entry ->> 'start_hour')::INT;
        v_end   := (v_entry ->> 'end_hour')::INT;

        IF v_dow BETWEEN 0 AND 6
           AND v_start >= 0 AND v_start < 24
           AND v_end > v_start AND v_end <= 24
        THEN
            v_parts := v_parts || (
                v_day_names[v_dow + 1]
                || ': '
                || lpad(v_start::TEXT, 2, '0') || ':00'
                || ' - '
                || lpad(v_end::TEXT, 2, '0') || ':00'
            );
        END IF;
    END LOOP;

    IF array_length(v_parts, 1) IS NULL THEN
        RETURN 'Sin horario configurado';
    END IF;

    RETURN array_to_string(v_parts, '. ') || '.';
END;
$$;

COMMENT ON FUNCTION public.format_doctor_schedule(JSONB) IS
    'Formats a doctor weekly_schedule JSONB into human-readable Spanish text.';

-- ============================================================
-- SECTION 6: KB AUTO-SYNC TRIGGER
-- After INSERT/UPDATE on doctors → upsert 2 knowledge_base rows:
--   1. "¿Cuándo atiende Dr. X?" → schedule text
--   2. "¿Tienen especialista en Y?" → doctor info
-- After deactivation (active=false) → set KB rows inactive.
-- Uses metadata->>'doctor_id' as the stable key for upserts.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_doctor_to_kb()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_display_name   TEXT;
    v_schedule_text  TEXT;
    v_question_sched TEXT;
    v_answer_sched   TEXT;
    v_keywords_sched TEXT[];
    v_question_spec  TEXT;
    v_answer_spec    TEXT;
    v_keywords_spec  TEXT[];
BEGIN
    -- ── DEACTIVATION (soft-delete): disable KB rows ────────────────
    IF (TG_OP = 'UPDATE' AND NEW.active = false AND OLD.active = true)
       OR TG_OP = 'DELETE'
    THEN
        UPDATE public.knowledge_base
        SET    active     = false,
               updated_at = now()
        WHERE  clinic_id  = COALESCE(OLD.clinic_id, NEW.clinic_id)
          AND  metadata  ->> 'doctor_id' = COALESCE(OLD.id, NEW.id)::TEXT;

        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    -- ── REACTIVATION: re-enable KB rows if doctor is restored ──────
    IF TG_OP = 'UPDATE' AND NEW.active = true AND OLD.active = false THEN
        UPDATE public.knowledge_base
        SET    active     = true,
               updated_at = now()
        WHERE  clinic_id  = NEW.clinic_id
          AND  metadata  ->> 'doctor_id' = NEW.id::TEXT;
        -- Fall through to also refresh content below
    END IF;

    -- ── INSERT / UPDATE (active doctor): sync KB content ──────────

    -- Compute display name
    v_display_name := COALESCE(
        NULLIF(trim(NEW.display_name), ''),
        'Dr. ' || trim(NEW.first_name) || ' ' || trim(NEW.last_name)
    );

    -- Format schedule
    v_schedule_text := public.format_doctor_schedule(NEW.weekly_schedule);

    -- ── KB Row 1: schedule query ───────────────────────────────────
    v_question_sched := '¿Cuándo atiende ' || v_display_name || '?';
    v_answer_sched   := v_display_name
                     || ' (' || NEW.specialty || ') atiende: '
                     || v_schedule_text
                     || CASE WHEN NEW.bio IS NOT NULL AND trim(NEW.bio) != ''
                              THEN ' — ' || trim(NEW.bio)
                              ELSE '' END;
    v_keywords_sched := ARRAY[
        lower(trim(NEW.first_name)),
        lower(trim(NEW.last_name)),
        lower(NEW.specialty),
        'doctor', 'atiende', 'horario', 'cuándo', 'cuando', 'disponible'
    ];

    INSERT INTO public.knowledge_base
        (clinic_id, category, question, answer, keywords, metadata, priority, active)
    VALUES (
        NEW.clinic_id,
        'horarios',
        v_question_sched,
        v_answer_sched,
        v_keywords_sched,
        jsonb_build_object('doctor_id', NEW.id::TEXT, 'kb_type', 'doctor_schedule', 'auto_synced', true),
        5,
        NEW.active
    )
    ON CONFLICT DO NOTHING;  -- handled by UPDATE below

    -- Upsert: update if doctor_id tag already exists
    UPDATE public.knowledge_base
    SET    question   = v_question_sched,
           answer     = v_answer_sched,
           keywords   = v_keywords_sched,
           active     = NEW.active,
           updated_at = now()
    WHERE  clinic_id  = NEW.clinic_id
      AND  metadata  ->> 'doctor_id' = NEW.id::TEXT
      AND  metadata  ->> 'kb_type'   = 'doctor_schedule';

    -- ── KB Row 2: specialty query ──────────────────────────────────
    v_question_spec := '¿Tienen especialista en ' || NEW.specialty || '?';
    v_answer_spec   := 'Sí, contamos con ' || v_display_name
                    || ', especialista en ' || NEW.specialty || '. '
                    || v_schedule_text;
    v_keywords_spec := ARRAY[
        lower(NEW.specialty),
        lower(trim(NEW.first_name)),
        lower(trim(NEW.last_name)),
        'especialista', 'especialidad'
    ];

    INSERT INTO public.knowledge_base
        (clinic_id, category, question, answer, keywords, metadata, priority, active)
    VALUES (
        NEW.clinic_id,
        'servicios',
        v_question_spec,
        v_answer_spec,
        v_keywords_spec,
        jsonb_build_object('doctor_id', NEW.id::TEXT, 'kb_type', 'doctor_specialty', 'auto_synced', true),
        5,
        NEW.active
    )
    ON CONFLICT DO NOTHING;

    UPDATE public.knowledge_base
    SET    question   = v_question_spec,
           answer     = v_answer_spec,
           keywords   = v_keywords_spec,
           active     = NEW.active,
           updated_at = now()
    WHERE  clinic_id  = NEW.clinic_id
      AND  metadata  ->> 'doctor_id' = NEW.id::TEXT
      AND  metadata  ->> 'kb_type'   = 'doctor_specialty';

    RETURN NEW;

EXCEPTION WHEN OTHERS THEN
    -- KB sync failure must NEVER block the doctor save.
    RAISE WARNING 'sync_doctor_to_kb: error for doctor_id=%, clinic_id=%: %',
        NEW.id, NEW.clinic_id, SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_doctor_to_kb() IS
    'Trigger: keeps knowledge_base in sync with doctors table. '
    'Creates/updates 2 KB rows per doctor (schedule + specialty). '
    'On deactivation sets KB rows inactive. SECURITY DEFINER bypasses RLS.';

-- Attach trigger (fires after every INSERT or UPDATE on doctors)
DROP TRIGGER IF EXISTS trg_sync_doctor_to_kb ON public.doctors;
CREATE TRIGGER trg_sync_doctor_to_kb
    AFTER INSERT OR UPDATE OR DELETE ON public.doctors
    FOR EACH ROW EXECUTE FUNCTION public.sync_doctor_to_kb();

-- ============================================================
-- SECTION 7: RPC — list_doctors (dashboard + n8n)
-- Returns active doctors for a clinic with formatted schedule.
-- Can be called with service_role (n8n) or JWT (dashboard).
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_doctors(p_clinic_id UUID)
RETURNS TABLE (
    id               UUID,
    first_name       TEXT,
    last_name        TEXT,
    display_name     TEXT,
    specialty        TEXT,
    bio              TEXT,
    weekly_schedule  JSONB,
    slot_duration_min INTEGER,
    schedule_summary TEXT,
    active           BOOLEAN,
    created_at       TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.id,
        d.first_name,
        d.last_name,
        COALESCE(d.display_name, 'Dr. ' || d.first_name || ' ' || d.last_name) AS display_name,
        d.specialty,
        d.bio,
        d.weekly_schedule,
        d.slot_duration_min,
        public.format_doctor_schedule(d.weekly_schedule) AS schedule_summary,
        d.active,
        d.created_at
    FROM public.doctors d
    WHERE d.clinic_id = p_clinic_id
      AND d.active = true
    ORDER BY d.last_name ASC, d.first_name ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_doctors(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_doctors(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.list_doctors(UUID) IS
    'Returns active doctors for a clinic with human-readable schedule summary. '
    'Called by n8n (Resolver Doctor node) and dashboard Calendarios section.';

-- ============================================================
-- SECTION 8: GRANTS
-- ============================================================

GRANT SELECT, INSERT, UPDATE ON public.doctors TO authenticated;
-- No DELETE grant — soft-delete only via UPDATE active=false

GRANT ALL ON public.doctors TO service_role;

-- ============================================================
-- SECTION 9: VERIFY (run manually after deploy)
-- ============================================================

-- SELECT table_name, column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'doctors' AND table_schema = 'public'
-- ORDER BY ordinal_position;

-- SELECT format_doctor_schedule('[{"dow":1,"start_hour":9,"end_hour":18},{"dow":5,"start_hour":9,"end_hour":13}]'::jsonb);
-- Expected: "Lunes: 09:00 - 18:00. Viernes: 09:00 - 13:00."

-- INSERT INTO doctors (clinic_id, first_name, last_name, specialty, weekly_schedule)
-- VALUES ('a1b2c3d4-e5f6-7890-abcd-ef1234567890','Juan','García','Ortodoncia',
--         '[{"dow":1,"start_hour":9,"end_hour":18},{"dow":3,"start_hour":9,"end_hour":18}]');
-- SELECT question, answer FROM knowledge_base WHERE metadata->>'auto_synced' = 'true' LIMIT 5;

-- ============================================================
-- END OF MIGRATION 024
-- ============================================================
