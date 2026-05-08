-- ============================================================
-- 052_nps_fix_and_funnel.sql
--
-- 1. Reconcilia nps_responses: patient_phone → phone + patient_id
-- 2. Crea get_clinic_nps_stats (requerida por /api/admin/nps)
-- 3. Crea get_clinic_funnel_summary (para /api/admin/metrics ampliado)
-- ============================================================

-- ── 1. Ajustar nps_responses ──────────────────────────────────────────────────
--    El bot inserta patient_phone; el admin app inserta phone + patient_id.
--    Unificamos en phone (nullable) + patient_id (nullable).

ALTER TABLE public.nps_responses
  ADD COLUMN IF NOT EXISTS phone       TEXT,
  ADD COLUMN IF NOT EXISTS patient_id  UUID REFERENCES public.patients(id) ON DELETE SET NULL;

-- Migrar datos existentes si los hay
UPDATE public.nps_responses
SET    phone = patient_phone
WHERE  phone IS NULL AND patient_phone IS NOT NULL;

-- Renombramos patient_phone → patient_phone_legacy y usamos phone como canónico
-- (no eliminamos patient_phone para no romper filas existentes del bot mientras se actualiza)
-- El bot será actualizado para usar phone también.

-- ── 2. get_clinic_nps_stats — requerida por /api/admin/nps ───────────────────

CREATE OR REPLACE FUNCTION public.get_clinic_nps_stats(
    p_clinic_id UUID,
    p_days      INT DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_period_start TIMESTAMPTZ := now() - (p_days || ' days')::interval;
    v_total        BIGINT;
    v_promoters    BIGINT;
    v_passives     BIGINT;
    v_detractors   BIGINT;
    v_avg          NUMERIC;
BEGIN
    IF (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role'
       AND NOT EXISTS (
           SELECT 1 FROM public.staff
           WHERE user_id = auth.uid() AND clinic_id = p_clinic_id
       )
    THEN
        RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;

    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE score >= 4),
        COUNT(*) FILTER (WHERE score = 3),
        COUNT(*) FILTER (WHERE score <= 2),
        ROUND(AVG(score)::numeric, 2)
    INTO v_total, v_promoters, v_passives, v_detractors, v_avg
    FROM public.nps_responses
    WHERE clinic_id  = p_clinic_id
      AND created_at >= v_period_start;

    RETURN jsonb_build_object(
        'total',      COALESCE(v_total,      0),
        'avg_score',  COALESCE(v_avg,        0),
        'nps_score',  CASE WHEN COALESCE(v_total,0) = 0 THEN 0
                           ELSE ROUND((v_promoters - v_detractors)::numeric / v_total * 100)
                      END,
        'promoters',  COALESCE(v_promoters,  0),
        'passives',   COALESCE(v_passives,   0),
        'detractors', COALESCE(v_detractors, 0)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_clinic_nps_stats(UUID, INT) TO authenticated, service_role;

-- ── 3. get_clinic_funnel_summary — embudo + acquisition para /api/admin/metrics ─

CREATE OR REPLACE FUNCTION public.get_clinic_funnel_summary(
    p_clinic_id UUID,
    p_days      INT DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_period_start TIMESTAMPTZ := now() - (p_days || ' days')::interval;
    v_funnel       jsonb;
    v_acquisition  jsonb;
    v_timeline     jsonb;
    v_new_leads    BIGINT;
    v_ctwa_leads   BIGINT;
BEGIN
    IF (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role'
       AND NOT EXISTS (
           SELECT 1 FROM public.staff
           WHERE user_id = auth.uid() AND clinic_id = p_clinic_id
       )
    THEN
        RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;

    -- Pipeline funnel (todos los pacientes activos)
    SELECT jsonb_agg(row_to_json(r) ORDER BY r.pos)
    INTO   v_funnel
    FROM (
        WITH stage_order AS (
            SELECT unnest(ARRAY['nuevo','contactado','cita_agendada','cita_confirmada',
                                'presupuesto_enviado','ganado','perdido']) AS stage,
                   generate_subscripts(ARRAY['nuevo','contactado','cita_agendada','cita_confirmada',
                                             'presupuesto_enviado','ganado','perdido'], 1) AS pos
        ),
        counts AS (
            SELECT pipeline_stage, COUNT(*) AS cnt
            FROM   patients
            WHERE  clinic_id  = p_clinic_id AND deleted_at IS NULL
            GROUP  BY pipeline_stage
        ),
        total AS (SELECT NULLIF(SUM(cnt),0) AS t FROM counts WHERE pipeline_stage != 'perdido')
        SELECT so.stage, COALESCE(c.cnt,0) AS count,
               ROUND(COALESCE(c.cnt,0)::numeric / t.t * 100, 1) AS pct,
               so.pos
        FROM   stage_order so
        LEFT   JOIN counts c ON c.pipeline_stage = so.stage
        CROSS  JOIN total t
    ) r;

    -- Acquisition source breakdown (últimos p_days días)
    SELECT jsonb_agg(row_to_json(a) ORDER BY a.lead_count DESC)
    INTO   v_acquisition
    FROM (
        SELECT
            acquisition_source,
            COUNT(*)                                                   AS lead_count,
            COUNT(DISTINCT ap.phone)                                   AS with_appointment,
            ROUND(COUNT(DISTINCT ap.phone)::numeric / NULLIF(COUNT(*),0) * 100, 1) AS conversion_rate
        FROM   patients p
        LEFT   JOIN LATERAL (
            SELECT 1 FROM appointments a
            WHERE  a.clinic_id = p_clinic_id
              AND  a.phone     = p.phone
              AND  a.status   != 'cancelled'
            LIMIT  1
        ) ap ON true
        WHERE  p.clinic_id  = p_clinic_id
          AND  p.deleted_at IS NULL
          AND  p.created_at >= v_period_start
        GROUP  BY acquisition_source
    ) a;

    -- New leads summary
    SELECT COUNT(*), COUNT(*) FILTER (WHERE acquisition_source LIKE 'ctwa:%')
    INTO   v_new_leads, v_ctwa_leads
    FROM   patients
    WHERE  clinic_id  = p_clinic_id
      AND  deleted_at IS NULL
      AND  created_at >= v_period_start;

    -- Timeline (últimos p_days días, por día)
    SELECT jsonb_agg(row_to_json(d) ORDER BY d.day)
    INTO   v_timeline
    FROM (
        WITH cal AS (
            SELECT generate_series(v_period_start::date, CURRENT_DATE, '1 day')::date AS day
        ),
        ld AS (
            SELECT created_at::date AS day, COUNT(*) AS leads,
                   COUNT(*) FILTER (WHERE acquisition_source LIKE 'ctwa:%') AS ctwa
            FROM   patients
            WHERE  clinic_id = p_clinic_id AND deleted_at IS NULL AND created_at >= v_period_start
            GROUP  BY created_at::date
        ),
        ad AS (
            SELECT created_at::date AS day, COUNT(*) AS appts
            FROM   appointments
            WHERE  clinic_id = p_clinic_id AND created_at >= v_period_start
            GROUP  BY created_at::date
        )
        SELECT cal.day, COALESCE(ld.leads,0) AS leads,
               COALESCE(ld.ctwa,0) AS ctwa, COALESCE(ad.appts,0) AS appts
        FROM   cal
        LEFT   JOIN ld ON ld.day = cal.day
        LEFT   JOIN ad ON ad.day = cal.day
    ) d;

    RETURN jsonb_build_object(
        'funnel',          COALESCE(v_funnel,      '[]'::jsonb),
        'acquisition',     COALESCE(v_acquisition, '[]'::jsonb),
        'timeline',        COALESCE(v_timeline,    '[]'::jsonb),
        'new_leads',       COALESCE(v_new_leads,   0),
        'ctwa_leads',      COALESCE(v_ctwa_leads,  0)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_clinic_funnel_summary(UUID, INT) TO authenticated, service_role;
