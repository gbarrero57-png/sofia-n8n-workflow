-- ============================================================
-- SofIA SaaS — Patient History Improvements
-- Migration 036: mejoras a historia clínica
--
-- PREREQUISITOS: 020, 021, 022, 027
--
-- CAMBIOS:
--   1. get_patient_history     — v2: agrega alergias + clinical_records,
--                                    corrige phone match en appointments
--   2. add_patient_allergy     — nueva RPC para agregar alergias (staff/bot)
--   3. get_patient_context_for_bot — resumen compacto para inyectar en prompt IA
--   4. edit_clinical_record    — edición por admin con edit_reason obligatorio
-- ============================================================


-- ============================================================
-- FUNCIÓN 1: get_patient_history (reemplaza v1 de 027)
--
-- Devuelve historial completo: perfil + alergias + registros
-- clínicos formales + eventos bot + citas.
-- Cambios vs v1:
--   - Incluye patient_allergies ordenadas por severidad
--   - Incluye clinical_records (registros médicos formales del staff)
--   - Phone match en appointments usa normalización explícita
--     en lugar de LIKE '%' || phone que podía romper con prefijos
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
    v_patient_id    UUID;
    v_patient       jsonb;
    v_allergies     jsonb;
    v_records       jsonb;
    v_events        jsonb;
    v_appointments  jsonb;
    v_lim           INTEGER := LEAST(COALESCE(p_limit, 20), 50);
BEGIN
    -- Normalizar phone: remover prefijo whatsapp: (case-insensitive)
    v_phone := trim(regexp_replace(
        COALESCE(p_phone, ''),
        '^[Ww][Hh][Aa][Tt][Ss][Aa][Pp][Pp]:',
        ''
    ));

    IF v_phone = '' THEN
        RETURN jsonb_build_object('found', false, 'error', 'MISSING_PHONE');
    END IF;

    -- ── Perfil del paciente ───────────────────────────────────────
    SELECT
        p.id,
        jsonb_build_object(
            'id',           p.id,
            'full_name',    p.full_name,
            'phone',        p.phone,
            'email',        p.email,
            'dni',          p.dni,
            'birth_date',   p.birth_date,
            'gender',       p.gender,
            'blood_type',   p.blood_type,
            'address',      p.address,
            'emergency_contact_name',  p.emergency_contact_name,
            'emergency_contact_phone', p.emergency_contact_phone,
            'first_contact', p.created_at,
            'updated_at',   p.updated_at
        )
    INTO v_patient_id, v_patient
    FROM patients p
    WHERE p.clinic_id   = p_clinic_id
      AND p.phone       = v_phone
      AND p.deleted_at  IS NULL
    LIMIT 1;

    -- ── Alergias (si hay perfil) ──────────────────────────────────
    IF v_patient_id IS NOT NULL THEN
        SELECT COALESCE(jsonb_agg(
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
                END,
                a.created_at DESC
        ), '[]'::jsonb)
        INTO v_allergies
        FROM patient_allergies a
        WHERE a.patient_id  = v_patient_id
          AND a.deleted_at  IS NULL;

        -- ── Registros clínicos formales (staff) ───────────────────
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id',                   cr.id,
                'consultation_date',    cr.consultation_date,
                'reason',               cr.reason,
                'diagnosis',            cr.diagnosis,
                'treatment',            cr.treatment,
                'medications',          cr.medications,
                'observations',         cr.observations,
                'next_appointment_rec', cr.next_appointment_rec,
                'weight_kg',            cr.weight_kg,
                'height_cm',            cr.height_cm,
                'blood_pressure',       cr.blood_pressure,
                'temperature_c',        cr.temperature_c,
                'attended_by_name',     cr.attended_by_name,
                'appointment_id',       cr.appointment_id,
                'created_at',           cr.created_at
            ) ORDER BY cr.consultation_date DESC, cr.created_at DESC
        ), '[]'::jsonb)
        INTO v_records
        FROM (
            SELECT * FROM clinical_records
            WHERE patient_id = v_patient_id
              AND clinic_id  = p_clinic_id
              AND deleted_at IS NULL
            ORDER BY consultation_date DESC, created_at DESC
            LIMIT v_lim
        ) cr;
    ELSE
        v_allergies := '[]'::jsonb;
        v_records   := '[]'::jsonb;
    END IF;

    -- ── Eventos clínicos bot ──────────────────────────────────────
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
        LIMIT v_lim
    ) e;

    -- ── Citas (match exacto por phone normalizado) ────────────────
    -- v1 usaba LIKE '%' || phone — podía fallar con prefijos distintos.
    -- Ahora normalizamos el phone en appointments también.
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
          AND regexp_replace(
                  regexp_replace(phone, '^[Ww][Hh][Aa][Tt][Ss][Aa][Pp][Pp]:', ''),
                  '^\+', ''
              )
              = regexp_replace(v_phone, '^\+', '')
        ORDER BY start_time DESC
        LIMIT v_lim
    ) a;

    RETURN jsonb_build_object(
        'found',            v_patient IS NOT NULL,
        'phone',            v_phone,
        'clinic_id',        p_clinic_id,
        'patient',          v_patient,
        'allergies',        v_allergies,
        'clinical_records', v_records,
        'events',           v_events,
        'appointments',     v_appointments
    );
END;
$$;

COMMENT ON FUNCTION public.get_patient_history IS
    'Historial completo de un paciente por phone+clinic. '
    'v2 (036): incluye alergias, clinical_records formales, '
    'corrige phone match en appointments. '
    'Accesible por service_role y staff autenticado.';

GRANT EXECUTE ON FUNCTION public.get_patient_history TO service_role;
GRANT EXECUTE ON FUNCTION public.get_patient_history TO authenticated;


-- ============================================================
-- FUNCIÓN 2: add_patient_allergy
--
-- Agrega una alergia al paciente. Callable por staff (JWT)
-- o por el bot (service_role, pasando p_patient_id).
-- Evita duplicados por allergen dentro de la misma clínica/paciente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.add_patient_allergy(
    p_patient_id    UUID,
    p_clinic_id     UUID,
    p_allergen      TEXT,
    p_severity      TEXT        DEFAULT 'leve',
    p_reaction      TEXT        DEFAULT NULL,
    p_confirmed     BOOLEAN     DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_clinic UUID    := (auth.jwt() ->> 'clinic_id')::uuid;
    v_caller_role   TEXT    := auth.jwt() ->> 'user_role';
    v_caller_user   UUID    := auth.uid();
    v_allergy_id    UUID;
    v_is_service    BOOLEAN := (v_caller_clinic IS NULL AND v_caller_role IS NULL);
BEGIN
    -- Seguridad: staff/admin requieren JWT de la misma clínica.
    -- service_role (bot) omite esta validación (v_caller_clinic es NULL).
    IF NOT v_is_service THEN
        IF v_caller_clinic IS NULL OR v_caller_clinic <> p_clinic_id THEN
            RETURN jsonb_build_object('error', 'CLINIC_MISMATCH');
        END IF;
        IF v_caller_role NOT IN ('admin', 'staff') THEN
            RETURN jsonb_build_object('error', 'PERMISSION_DENIED');
        END IF;
    END IF;

    -- Validar severidad
    IF p_severity NOT IN ('leve', 'moderada', 'severa', 'anafilaxis') THEN
        RETURN jsonb_build_object('error', 'INVALID_SEVERITY',
            'valid', ARRAY['leve','moderada','severa','anafilaxis']);
    END IF;

    -- Validar que el paciente existe en la clínica
    IF NOT EXISTS (
        SELECT 1 FROM patients
        WHERE id = p_patient_id AND clinic_id = p_clinic_id AND deleted_at IS NULL
    ) THEN
        RETURN jsonb_build_object('error', 'PATIENT_NOT_FOUND');
    END IF;

    -- Upsert: si ya existe la misma alergia, actualizar severity/reaction
    INSERT INTO patient_allergies (
        clinic_id, patient_id, allergen, severity, reaction, confirmed, recorded_by
    )
    VALUES (
        p_clinic_id,
        p_patient_id,
        trim(lower(p_allergen)),
        p_severity,
        p_reaction,
        p_confirmed,
        v_caller_user  -- NULL para service_role (bot)
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_allergy_id;

    -- Si ya existía (ON CONFLICT), obtener el id existente
    IF v_allergy_id IS NULL THEN
        SELECT id INTO v_allergy_id
        FROM patient_allergies
        WHERE patient_id = p_patient_id
          AND allergen   = trim(lower(p_allergen))
          AND deleted_at IS NULL
        LIMIT 1;

        -- Actualizar severidad/reaction si la nueva es más grave
        UPDATE patient_allergies SET
            severity  = CASE
                WHEN ARRAY_POSITION(
                    ARRAY['leve','moderada','severa','anafilaxis']::text[],
                    p_severity
                ) > ARRAY_POSITION(
                    ARRAY['leve','moderada','severa','anafilaxis']::text[],
                    severity
                ) THEN p_severity
                ELSE severity
            END,
            reaction  = COALESCE(p_reaction, reaction),
            confirmed = (confirmed OR p_confirmed)
        WHERE id = v_allergy_id;
    END IF;

    RETURN jsonb_build_object(
        'success',    true,
        'allergy_id', v_allergy_id,
        'patient_id', p_patient_id,
        'allergen',   trim(lower(p_allergen)),
        'severity',   p_severity
    );
END;
$$;

COMMENT ON FUNCTION public.add_patient_allergy IS
    'Agrega o actualiza una alergia de un paciente. '
    'Callable por staff (JWT) o bot (service_role). '
    'Upsert por allergen: si ya existe, actualiza severity si la nueva es más grave. '
    'Normaliza allergen a lowercase para evitar duplicados por capitalización.';

GRANT EXECUTE ON FUNCTION public.add_patient_allergy TO service_role;
GRANT EXECUTE ON FUNCTION public.add_patient_allergy TO authenticated;


-- ============================================================
-- FUNCIÓN 3: get_patient_context_for_bot
--
-- Devuelve un resumen compacto del paciente listo para inyectar
-- en el system prompt de SofIA. Diseñado para ser liviano:
-- una sola query, sin JSON grande. Callable con service_role.
--
-- Ejemplo de output:
--   {
--     "known": true,
--     "summary": "Paciente conocido: 3 visitas. Última: 15 ene 2026. Alergia SEVERA: latex. Próxima cita recomendada: marzo 2026.",
--     "has_allergies": true,
--     "allergy_alert": "⚠️ ALERGIA SEVERA: latex (anafilaxis)",
--     "last_visit_date": "2026-01-15",
--     "next_rec_date": "2026-03-01",
--     "total_visits": 3,
--     "patient_id": "uuid..."
--   }
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_patient_context_for_bot(
    p_clinic_id     UUID,
    p_phone         TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_phone             TEXT;
    v_patient_id        UUID;
    v_full_name         TEXT;
    v_total_visits      BIGINT  := 0;
    v_last_visit        DATE;
    v_next_rec          DATE;
    v_allergy_alert     TEXT    := '';
    v_has_allergies     BOOLEAN := false;
    v_summary_parts     TEXT[]  := '{}';
    v_summary           TEXT;
    v_months_es         TEXT[]  := ARRAY[
        'ene','feb','mar','abr','may','jun',
        'jul','ago','sep','oct','nov','dic'
    ];
BEGIN
    -- Normalizar phone
    v_phone := trim(regexp_replace(
        COALESCE(p_phone, ''),
        '^[Ww][Hh][Aa][Tt][Ss][Aa][Pp][Pp]:',
        ''
    ));

    IF v_phone = '' THEN
        RETURN jsonb_build_object('known', false);
    END IF;

    -- Buscar paciente por phone
    SELECT id, full_name
    INTO v_patient_id, v_full_name
    FROM patients
    WHERE clinic_id = p_clinic_id
      AND phone     = v_phone
      AND deleted_at IS NULL
    LIMIT 1;

    -- Paciente desconocido → contexto vacío (el bot trata como primera vez)
    IF v_patient_id IS NULL THEN
        RETURN jsonb_build_object('known', false, 'phone', v_phone);
    END IF;

    -- Total de visitas + última visita + próxima recomendada
    SELECT
        COUNT(*)                    INTO v_total_visits
    FROM clinical_records
    WHERE patient_id = v_patient_id
      AND deleted_at IS NULL;

    SELECT
        MAX(consultation_date)      INTO v_last_visit
    FROM clinical_records
    WHERE patient_id = v_patient_id
      AND deleted_at IS NULL;

    -- Próxima cita recomendada: la más próxima en el futuro
    -- o la más reciente del pasado si no hay futura
    SELECT next_appointment_rec INTO v_next_rec
    FROM clinical_records
    WHERE patient_id            = v_patient_id
      AND deleted_at            IS NULL
      AND next_appointment_rec  IS NOT NULL
    ORDER BY
        CASE WHEN next_appointment_rec >= CURRENT_DATE THEN 0 ELSE 1 END,
        ABS(next_appointment_rec - CURRENT_DATE)
    LIMIT 1;

    -- Alerta de alergias: mostrar las más graves
    SELECT
        string_agg(
            UPPER(a.severity) || ': ' || a.allergen
            || CASE WHEN a.reaction IS NOT NULL THEN ' (' || a.reaction || ')' ELSE '' END,
            ' | '
            ORDER BY
                CASE a.severity
                    WHEN 'anafilaxis' THEN 1
                    WHEN 'severa'     THEN 2
                    WHEN 'moderada'   THEN 3
                    ELSE 4
                END
        )
    INTO v_allergy_alert
    FROM patient_allergies a
    WHERE a.patient_id = v_patient_id
      AND a.deleted_at IS NULL
      AND a.severity   IN ('anafilaxis', 'severa', 'moderada');

    v_has_allergies := v_allergy_alert IS NOT NULL;

    -- Construir summary en español
    IF v_total_visits > 0 THEN
        v_summary_parts := array_append(v_summary_parts,
            'Paciente conocido: ' || v_total_visits || ' visita' ||
            CASE WHEN v_total_visits > 1 THEN 's' ELSE '' END
        );
        IF v_last_visit IS NOT NULL THEN
            v_summary_parts := array_append(v_summary_parts,
                'Última visita: ' ||
                EXTRACT(DAY FROM v_last_visit)::int || ' ' ||
                v_months_es[EXTRACT(MONTH FROM v_last_visit)::int] || ' ' ||
                EXTRACT(YEAR FROM v_last_visit)::int
            );
        END IF;
    ELSE
        v_summary_parts := array_append(v_summary_parts, 'Paciente registrado, sin consultas previas');
    END IF;

    IF v_has_allergies THEN
        v_summary_parts := array_append(v_summary_parts, '⚠️ ALERGIAS: ' || v_allergy_alert);
    END IF;

    IF v_next_rec IS NOT NULL THEN
        IF v_next_rec < CURRENT_DATE THEN
            v_summary_parts := array_append(v_summary_parts,
                'Revisión recomendada desde: ' ||
                v_months_es[EXTRACT(MONTH FROM v_next_rec)::int] || ' ' ||
                EXTRACT(YEAR FROM v_next_rec)::int
            );
        ELSE
            v_summary_parts := array_append(v_summary_parts,
                'Próxima revisión recomendada: ' ||
                v_months_es[EXTRACT(MONTH FROM v_next_rec)::int] || ' ' ||
                EXTRACT(YEAR FROM v_next_rec)::int
            );
        END IF;
    END IF;

    v_summary := array_to_string(v_summary_parts, '. ') || '.';

    RETURN jsonb_build_object(
        'known',            true,
        'patient_id',       v_patient_id,
        'full_name',        v_full_name,
        'phone',            v_phone,
        'summary',          v_summary,
        'total_visits',     v_total_visits,
        'last_visit_date',  v_last_visit,
        'next_rec_date',    v_next_rec,
        'has_allergies',    v_has_allergies,
        'allergy_alert',    COALESCE(v_allergy_alert, '')
    );
END;
$$;

COMMENT ON FUNCTION public.get_patient_context_for_bot IS
    'Resumen compacto del paciente por phone+clinic para inyectar en el '
    'system prompt de SofIA. Devuelve: summary (string listo para prompt), '
    'allergy_alert (solo alergias moderadas/severas/anafilaxis), '
    'total_visits, last_visit_date, next_rec_date. '
    'Liviano: sin arrays, sin paginación. Callable por service_role.';

GRANT EXECUTE ON FUNCTION public.get_patient_context_for_bot TO service_role;
GRANT EXECUTE ON FUNCTION public.get_patient_context_for_bot TO authenticated;


-- ============================================================
-- FUNCIÓN 4: edit_clinical_record
--
-- Permite editar un registro clínico existente.
-- Solo admin puede editar. edit_reason es obligatorio.
-- Registra last_edited_by + last_edited_at + edit_reason.
-- No permite editar registros con soft delete.
-- ============================================================

CREATE OR REPLACE FUNCTION public.edit_clinical_record(
    p_record_id             UUID,
    p_clinic_id             UUID,
    p_edit_reason           TEXT,
    -- Campos editables (NULL = no cambiar)
    p_reason                TEXT        DEFAULT NULL,
    p_diagnosis             TEXT        DEFAULT NULL,
    p_treatment             TEXT        DEFAULT NULL,
    p_medications           TEXT        DEFAULT NULL,
    p_observations          TEXT        DEFAULT NULL,
    p_next_appointment_rec  DATE        DEFAULT NULL,
    p_weight_kg             NUMERIC     DEFAULT NULL,
    p_height_cm             NUMERIC     DEFAULT NULL,
    p_blood_pressure        TEXT        DEFAULT NULL,
    p_temperature_c         NUMERIC     DEFAULT NULL
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
BEGIN
    -- Solo admin puede editar registros clínicos
    IF v_caller_clinic IS NULL OR v_caller_clinic <> p_clinic_id THEN
        RETURN jsonb_build_object('error', 'CLINIC_MISMATCH');
    END IF;
    IF v_caller_role <> 'admin' THEN
        RETURN jsonb_build_object('error', 'PERMISSION_DENIED',
            'message', 'Solo administradores pueden editar registros clínicos');
    END IF;

    -- edit_reason es obligatorio
    IF trim(COALESCE(p_edit_reason, '')) = '' THEN
        RETURN jsonb_build_object('error', 'EDIT_REASON_REQUIRED',
            'message', 'Se requiere indicar el motivo de la corrección');
    END IF;

    -- Verificar que el registro existe, pertenece a la clínica y no está eliminado
    IF NOT EXISTS (
        SELECT 1 FROM clinical_records
        WHERE id         = p_record_id
          AND clinic_id  = p_clinic_id
          AND deleted_at IS NULL
    ) THEN
        RETURN jsonb_build_object('error', 'RECORD_NOT_FOUND',
            'message', 'Registro clínico no encontrado o ya eliminado');
    END IF;

    -- Actualizar solo los campos que se pasaron (NULL = preservar valor actual)
    UPDATE clinical_records SET
        reason               = COALESCE(p_reason,               reason),
        diagnosis            = COALESCE(p_diagnosis,            diagnosis),
        treatment            = COALESCE(p_treatment,            treatment),
        medications          = COALESCE(p_medications,          medications),
        observations         = COALESCE(p_observations,         observations),
        next_appointment_rec = COALESCE(p_next_appointment_rec, next_appointment_rec),
        weight_kg            = COALESCE(p_weight_kg,            weight_kg),
        height_cm            = COALESCE(p_height_cm,            height_cm),
        blood_pressure       = COALESCE(p_blood_pressure,       blood_pressure),
        temperature_c        = COALESCE(p_temperature_c,        temperature_c),
        edit_reason          = p_edit_reason,
        last_edited_by       = v_caller_user,
        last_edited_at       = now(),
        updated_at           = now()
    WHERE id        = p_record_id
      AND clinic_id = p_clinic_id;

    RETURN jsonb_build_object(
        'success',    true,
        'record_id',  p_record_id,
        'edited_by',  v_caller_user,
        'edited_at',  now(),
        'edit_reason', p_edit_reason
    );
END;
$$;

COMMENT ON FUNCTION public.edit_clinical_record IS
    'Edita un registro clínico existente. Solo para admin. '
    'edit_reason es obligatorio — queda guardado en el registro para auditoría. '
    'Registra last_edited_by y last_edited_at. '
    'Campos no pasados (NULL) se preservan sin cambios.';

GRANT EXECUTE ON FUNCTION public.edit_clinical_record TO authenticated;
