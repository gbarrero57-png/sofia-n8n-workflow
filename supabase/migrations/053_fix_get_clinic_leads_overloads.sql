-- ============================================================
-- 053_fix_get_clinic_leads_overloads.sql
--
-- Problem: migrations 042, 047, and 048 each created a NEW overload
-- of get_clinic_leads (different param counts) instead of replacing
-- the previous one. PostgreSQL raises "function is not unique" on any
-- call, causing the Prospectos list to silently return empty.
--
-- Fix: drop all overloads, keep only the latest 6-param version.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_clinic_leads(UUID, INT, INT, TEXT);
DROP FUNCTION IF EXISTS public.get_clinic_leads(UUID, INT, INT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_clinic_leads(UUID, INT, INT, TEXT, TEXT, TEXT);

CREATE FUNCTION public.get_clinic_leads(
    p_clinic_id          UUID,
    p_limit              INT   DEFAULT 50,
    p_offset             INT   DEFAULT 0,
    p_source             TEXT  DEFAULT NULL,
    p_acquisition_source TEXT  DEFAULT NULL,
    p_pipeline_stage     TEXT  DEFAULT NULL
)
RETURNS TABLE (
    id                   UUID,
    full_name            TEXT,
    phone                TEXT,
    email                TEXT,
    source               TEXT,
    acquisition_source   TEXT,
    pipeline_stage       TEXT,
    created_at           TIMESTAMPTZ,
    has_appointment      BOOLEAN,
    next_appointment     TIMESTAMPTZ,
    appointment_status   TEXT,
    appointment_id       UUID,
    total                BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH lead_list AS (
    SELECT p.id, p.full_name, p.phone, p.email,
           p.source, p.acquisition_source, p.pipeline_stage, p.created_at
    FROM   patients p
    WHERE  p.clinic_id   = p_clinic_id
      AND  p.status      = 'lead'
      AND  p.deleted_at  IS NULL
      AND  (p_source IS NULL OR p.source = p_source)
      AND  (p_acquisition_source IS NULL
            OR p.acquisition_source = p_acquisition_source
            OR (p_acquisition_source = 'ctwa' AND p.acquisition_source LIKE 'ctwa:%'))
      AND  (p_pipeline_stage IS NULL OR p.pipeline_stage = p_pipeline_stage)
  ),
  next_appts AS (
    SELECT DISTINCT ON (a.clinic_id, a.phone)
           a.phone        AS appt_phone,
           a.start_time,
           a.status::text AS appt_status,
           a.id           AS appt_id
    FROM   appointments a
    WHERE  a.clinic_id = p_clinic_id
    ORDER  BY a.clinic_id, a.phone, a.start_time DESC
  )
  SELECT
    l.id, l.full_name, l.phone, l.email,
    l.source, l.acquisition_source, l.pipeline_stage, l.created_at,
    (na.appt_phone IS NOT NULL)  AS has_appointment,
    na.start_time                AS next_appointment,
    na.appt_status               AS appointment_status,
    na.appt_id                   AS appointment_id,
    COUNT(*) OVER ()             AS total
  FROM   lead_list l
  LEFT   JOIN next_appts na ON na.appt_phone = l.phone
  ORDER  BY l.created_at DESC
  LIMIT  p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_clinic_leads(UUID, INT, INT, TEXT, TEXT, TEXT)
  TO authenticated, service_role;
