-- ============================================================
-- 043_fix_bot_upsert_source.sql
-- Corrige bot_upsert_patient para actualizar source='manual'
-- en pacientes existentes cuando se llama desde el bot.
-- Pacientes creados antes de migración 042 quedaron con
-- source='manual' por DEFAULT aunque vinieran del bot.
-- ============================================================

-- Backfill: si el paciente tiene cita con source='bot' o tipo='whatsapp'
-- y su source sigue siendo 'manual', actualizarlo
UPDATE public.patients p
SET    source     = 'whatsapp_bot',
       updated_at = now()
WHERE  p.source     = 'manual'
  AND  p.deleted_at IS NULL
  AND  EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE  a.patient_id = p.id
      AND  a.source IN ('bot', 'whatsapp', 'whatsapp_bot')
  );

-- Actualiza bot_upsert_patient: si el paciente existe con source='manual',
-- lo corrige a p_source (whatsapp_bot por defecto)
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
    v_existing_src  TEXT;
BEGIN
    v_phone := regexp_replace(p_phone, '^[Ww][Hh][Aa][Tt][Ss][Aa][Pp][Pp]:', '');
    v_phone := trim(v_phone);

    IF p_clinic_id IS NULL THEN
        RETURN jsonb_build_object('error', 'MISSING_CLINIC_ID');
    END IF;
    IF v_phone = '' OR v_phone IS NULL THEN
        RETURN jsonb_build_object('error', 'MISSING_PHONE');
    END IF;

    SELECT id, full_name, source
    INTO   v_patient_id, v_existing_name, v_existing_src
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
            -- Corregir source='manual' (default pre-042) si viene del bot
            source     = CASE
                            WHEN source = 'manual'
                            THEN COALESCE(p_source, 'whatsapp_bot')
                            ELSE source
                         END,
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
