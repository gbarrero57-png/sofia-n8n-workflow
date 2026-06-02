-- ============================================================
-- 060_fix_search_patients_accents.sql
--
-- Problem: search_patients uses ILIKE which is accent-sensitive.
-- Searching "Simulacion" does not match "Simulación".
--
-- Fix: normalize accents on both sides using translate()
-- (no extension needed — works natively in PostgreSQL).
-- ============================================================

DROP FUNCTION IF EXISTS public.search_patients(UUID, TEXT, INT);

CREATE OR REPLACE FUNCTION public.search_patients(
    p_clinic_id UUID,
    p_query     TEXT,
    p_limit     INT  DEFAULT 20
)
RETURNS TABLE (
    id           UUID,
    dni          TEXT,
    full_name    TEXT,
    phone        TEXT,
    birth_date   DATE,
    total_visits BIGINT,
    last_visit   DATE,
    status       TEXT,
    source       TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_norm TEXT := '%' || lower(translate(p_query,
        'áéíóúüñàèìòùÁÉÍÓÚÜÑÀÈÌÒÙ',
        'aeiouunaeioùaeiouunaeioù')) || '%';
BEGIN
    RETURN QUERY
    WITH visits AS (
        SELECT patient_id, COUNT(*) AS cnt, MAX(consultation_date) AS last_v
        FROM   clinical_records
        GROUP  BY patient_id
    )
    SELECT
        p.id, p.dni, p.full_name, p.phone, p.birth_date,
        COALESCE(v.cnt, 0) AS total_visits,
        v.last_v           AS last_visit,
        p.status, p.source
    FROM patients p
    LEFT JOIN visits v ON v.patient_id = p.id
    WHERE p.clinic_id  = p_clinic_id
      AND p.deleted_at IS NULL
      AND (
          lower(translate(p.full_name,
              'áéíóúüñàèìòùÁÉÍÓÚÜÑÀÈÌÒÙ',
              'aeiouunaeioùaeiouunaeioù')) LIKE v_norm
       OR lower(p.dni)   LIKE lower('%' || p_query || '%')
       OR lower(p.phone) LIKE lower('%' || p_query || '%')
      )
    ORDER BY
        CASE WHEN lower(translate(p.full_name,
                 'áéíóúüñàèìòùÁÉÍÓÚÜÑÀÈÌÒÙ',
                 'aeiouunaeioùaeiouunaeioù'))
                 LIKE lower(translate(p_query,
                 'áéíóúüñàèìòùÁÉÍÓÚÜÑÀÈÌÒÙ',
                 'aeiouunaeioùaeiouunaeioù')) || '%'
             THEN 0 ELSE 1 END,
        p.full_name
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_patients(UUID, TEXT, INT)
  TO authenticated, service_role;
