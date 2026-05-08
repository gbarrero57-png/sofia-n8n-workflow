-- ============================================================
-- 050_metrics.sql
-- Capa 4: funciones de métricas y analytics para dashboard SaaS
--
-- Funciones:
--   get_clinic_dashboard(clinic_id, days)   — KPIs ejecutivos
--   get_conversion_funnel(clinic_id, days)  — embudo con % conversión entre etapas
--   get_revenue_metrics(clinic_id, days)    — ingresos, LTV, ticket promedio
--   get_bot_performance(clinic_id, days)    — rendimiento del bot
--   get_leads_timeline(clinic_id, days)     — leads nuevos por día (gráfico)
-- ============================================================

-- ── 1. get_clinic_dashboard — KPIs ejecutivos ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_clinic_dashboard(
    p_clinic_id UUID,
    p_days      INT DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_period_start  TIMESTAMPTZ := now() - (p_days || ' days')::interval;
    v_leads_new     BIGINT;
    v_leads_ctwa    BIGINT;
    v_appts_total   BIGINT;
    v_appts_done    BIGINT;
    v_appts_cancel  BIGINT;
    v_conversion    NUMERIC;
    v_nps_avg       NUMERIC;
    v_nps_count     BIGINT;
    v_nps_index     NUMERIC;
    v_revenue       NUMERIC;
    v_pipeline      jsonb;
BEGIN
    -- Leads nuevos en el período
    SELECT COUNT(*), COUNT(*) FILTER (WHERE acquisition_source LIKE 'ctwa:%')
    INTO   v_leads_new, v_leads_ctwa
    FROM   patients
    WHERE  clinic_id  = p_clinic_id
      AND  deleted_at IS NULL
      AND  created_at >= v_period_start;

    -- Citas
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status IN ('confirmed','completed')),
        COUNT(*) FILTER (WHERE status = 'cancelled')
    INTO v_appts_total, v_appts_done, v_appts_cancel
    FROM appointments
    WHERE clinic_id  = p_clinic_id
      AND created_at >= v_period_start;

    -- Tasa de conversión lead → cita (leads con al menos 1 cita no cancelada / total leads)
    SELECT ROUND(
        COUNT(DISTINCT a.phone)::numeric
        / NULLIF(COUNT(DISTINCT p.phone), 0) * 100, 1
    )
    INTO v_conversion
    FROM patients p
    LEFT JOIN appointments a
           ON a.clinic_id = p_clinic_id
          AND a.phone     = p.phone
          AND a.status   != 'cancelled'
          AND a.created_at >= v_period_start
    WHERE p.clinic_id  = p_clinic_id
      AND p.deleted_at IS NULL
      AND p.created_at >= v_period_start;

    -- NPS
    SELECT COUNT(*), ROUND(AVG(score)::numeric, 2),
           ROUND(
               (COUNT(*) FILTER (WHERE score >= 4)::numeric
                - COUNT(*) FILTER (WHERE score <= 2)::numeric)
               / NULLIF(COUNT(*), 0) * 100, 1
           )
    INTO v_nps_count, v_nps_avg, v_nps_index
    FROM nps_responses
    WHERE clinic_id  = p_clinic_id
      AND created_at >= v_period_start;

    -- Ingresos cobrados en el período
    SELECT COALESCE(SUM(amount), 0)
    INTO   v_revenue
    FROM   payments
    WHERE  clinic_id  = p_clinic_id
      AND  created_at >= v_period_start;

    -- Pipeline snapshot (todos los pacientes activos, no solo del período)
    SELECT jsonb_object_agg(pipeline_stage, cnt)
    INTO   v_pipeline
    FROM (
        SELECT pipeline_stage, COUNT(*) AS cnt
        FROM   patients
        WHERE  clinic_id  = p_clinic_id
          AND  deleted_at IS NULL
        GROUP  BY pipeline_stage
    ) s;

    RETURN jsonb_build_object(
        'period_days',      p_days,
        'period_start',     v_period_start,
        'leads', jsonb_build_object(
            'new',          v_leads_new,
            'ctwa',         v_leads_ctwa,
            'organic',      v_leads_new - v_leads_ctwa,
            'conversion_pct', v_conversion
        ),
        'appointments', jsonb_build_object(
            'total',        v_appts_total,
            'completed',    v_appts_done,
            'cancelled',    v_appts_cancel,
            'show_rate_pct', ROUND(v_appts_done::numeric / NULLIF(v_appts_total,0) * 100, 1)
        ),
        'nps', jsonb_build_object(
            'responses',    v_nps_count,
            'avg_score',    v_nps_avg,
            'index',        v_nps_index
        ),
        'revenue', jsonb_build_object(
            'collected',    v_revenue
        ),
        'pipeline_snapshot', COALESCE(v_pipeline, '{}'::jsonb)
    );
END;
$$;

-- ── 2. get_conversion_funnel — embudo con % entre etapas ─────────────────────

CREATE OR REPLACE FUNCTION public.get_conversion_funnel(
    p_clinic_id UUID,
    p_days      INT DEFAULT 30
)
RETURNS TABLE (
    stage            TEXT,
    count            BIGINT,
    pct_of_entry     NUMERIC,
    conversion_next  NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_order TEXT[] := ARRAY[
        'nuevo','contactado','cita_agendada','cita_confirmada',
        'presupuesto_enviado','ganado','perdido'
    ];
    v_period_start TIMESTAMPTZ := now() - (p_days || ' days')::interval;
BEGIN
    RETURN QUERY
    WITH counts AS (
        SELECT p.pipeline_stage,
               COUNT(*) AS cnt
        FROM   patients p
        WHERE  p.clinic_id  = p_clinic_id
          AND  p.deleted_at IS NULL
          AND  p.created_at >= v_period_start
        GROUP  BY p.pipeline_stage
    ),
    ordered AS (
        SELECT
            s                                  AS stage,
            COALESCE(c.cnt, 0)                AS cnt,
            array_position(v_order, s)        AS pos
        FROM   unnest(v_order) s
        LEFT   JOIN counts c ON c.pipeline_stage = s
    ),
    entry_count AS (
        SELECT SUM(cnt) AS total FROM ordered WHERE stage != 'perdido'
    )
    SELECT
        o.stage,
        o.cnt,
        ROUND(o.cnt::numeric / NULLIF(e.total, 0) * 100, 1)   AS pct_of_entry,
        ROUND(
            LEAD(o.cnt) OVER (ORDER BY o.pos)::numeric
            / NULLIF(o.cnt, 0) * 100, 1
        )                                                       AS conversion_next
    FROM   ordered o, entry_count e
    ORDER  BY o.pos;
END;
$$;

-- ── 3. get_revenue_metrics — ingresos, LTV, ticket promedio ──────────────────

CREATE OR REPLACE FUNCTION public.get_revenue_metrics(
    p_clinic_id UUID,
    p_days      INT DEFAULT 30
)
RETURNS TABLE (
    total_collected    NUMERIC,
    total_pending      NUMERIC,
    collection_rate    NUMERIC,
    avg_ticket         NUMERIC,
    paying_patients    BIGINT,
    ltv_estimate       NUMERIC,
    payments_count     BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_period_start TIMESTAMPTZ := now() - (p_days || ' days')::interval;
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(py.amount) FILTER (WHERE py.status = 'paid'),   0) AS total_collected,
        COALESCE(SUM(py.amount) FILTER (WHERE py.status = 'pending'), 0) AS total_pending,
        ROUND(
            SUM(py.amount) FILTER (WHERE py.status = 'paid')::numeric
            / NULLIF(SUM(py.amount), 0) * 100, 1
        )                                                                 AS collection_rate,
        ROUND(
            AVG(py.amount) FILTER (WHERE py.status = 'paid'), 2
        )                                                                 AS avg_ticket,
        COUNT(DISTINCT py.patient_id) FILTER (WHERE py.status = 'paid') AS paying_patients,
        ROUND(
            SUM(py.amount) FILTER (WHERE py.status = 'paid')::numeric
            / NULLIF(COUNT(DISTINCT py.patient_id) FILTER (WHERE py.status = 'paid'), 0), 2
        )                                                                 AS ltv_estimate,
        COUNT(*) FILTER (WHERE py.status = 'paid')                       AS payments_count
    FROM   payments py
    WHERE  py.clinic_id  = p_clinic_id
      AND  py.created_at >= v_period_start;
END;
$$;

-- ── 4. get_bot_performance — rendimiento del bot ─────────────────────────────

CREATE OR REPLACE FUNCTION public.get_bot_performance(
    p_clinic_id UUID,
    p_days      INT DEFAULT 30
)
RETURNS TABLE (
    total_conversations  BIGINT,
    bot_handled          BIGINT,
    human_escalated      BIGINT,
    escalation_rate      NUMERIC,
    slots_offered        BIGINT,
    slots_confirmed      BIGINT,
    slot_confirm_rate    NUMERIC,
    avg_response_ms      NUMERIC,
    top_intents          jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_period_start TIMESTAMPTZ := now() - (p_days || ' days')::interval;
    v_top_intents  jsonb;
BEGIN
    -- Top intents from conversation_metrics
    SELECT jsonb_object_agg(intent, cnt)
    INTO   v_top_intents
    FROM (
        SELECT intent_detected AS intent, COUNT(*) AS cnt
        FROM   conversation_metrics
        WHERE  clinic_id  = p_clinic_id
          AND  created_at >= v_period_start
          AND  intent_detected IS NOT NULL
        GROUP  BY intent_detected
        ORDER  BY cnt DESC
        LIMIT  8
    ) t;

    RETURN QUERY
    SELECT
        COUNT(DISTINCT cm.conversation_id)                                        AS total_conversations,
        COUNT(DISTINCT cm.conversation_id) FILTER (WHERE cm.bot_handled = true)   AS bot_handled,
        COUNT(DISTINCT cm.conversation_id) FILTER (WHERE cm.bot_handled = false)  AS human_escalated,
        ROUND(
            COUNT(DISTINCT cm.conversation_id) FILTER (WHERE cm.bot_handled = false)::numeric
            / NULLIF(COUNT(DISTINCT cm.conversation_id), 0) * 100, 1
        )                                                                         AS escalation_rate,
        COUNT(*) FILTER (WHERE cm.slots_offered > 0)                             AS slots_offered,
        COUNT(*) FILTER (WHERE cm.slot_confirmed = true)                         AS slots_confirmed,
        ROUND(
            COUNT(*) FILTER (WHERE cm.slot_confirmed = true)::numeric
            / NULLIF(COUNT(*) FILTER (WHERE cm.slots_offered > 0), 0) * 100, 1
        )                                                                         AS slot_confirm_rate,
        ROUND(AVG(cm.response_time_ms), 0)                                        AS avg_response_ms,
        COALESCE(v_top_intents, '{}'::jsonb)                                      AS top_intents
    FROM   conversation_metrics cm
    WHERE  cm.clinic_id  = p_clinic_id
      AND  cm.created_at >= v_period_start;
END;
$$;

-- ── 5. get_leads_timeline — leads nuevos por día ──────────────────────────────

CREATE OR REPLACE FUNCTION public.get_leads_timeline(
    p_clinic_id UUID,
    p_days      INT DEFAULT 30
)
RETURNS TABLE (
    day              DATE,
    leads_total      BIGINT,
    leads_ctwa       BIGINT,
    leads_organic    BIGINT,
    appts_created    BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_period_start TIMESTAMPTZ := now() - (p_days || ' days')::interval;
BEGIN
    RETURN QUERY
    WITH days AS (
        SELECT generate_series(
            v_period_start::date,
            CURRENT_DATE,
            '1 day'::interval
        )::date AS day
    ),
    lead_days AS (
        SELECT
            created_at::date                                         AS day,
            COUNT(*)                                                 AS total,
            COUNT(*) FILTER (WHERE acquisition_source LIKE 'ctwa:%') AS ctwa,
            COUNT(*) FILTER (WHERE acquisition_source = 'organic')   AS organic
        FROM   patients
        WHERE  clinic_id  = p_clinic_id
          AND  deleted_at IS NULL
          AND  created_at >= v_period_start
        GROUP  BY created_at::date
    ),
    appt_days AS (
        SELECT
            created_at::date AS day,
            COUNT(*)         AS appts
        FROM   appointments
        WHERE  clinic_id  = p_clinic_id
          AND  created_at >= v_period_start
        GROUP  BY created_at::date
    )
    SELECT
        d.day,
        COALESCE(l.total,  0) AS leads_total,
        COALESCE(l.ctwa,   0) AS leads_ctwa,
        COALESCE(l.organic,0) AS leads_organic,
        COALESCE(a.appts,  0) AS appts_created
    FROM      days       d
    LEFT JOIN lead_days  l ON l.day = d.day
    LEFT JOIN appt_days  a ON a.day = d.day
    ORDER BY  d.day;
END;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.get_clinic_dashboard(UUID, INT)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_conversion_funnel(UUID, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_revenue_metrics(UUID, INT)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_bot_performance(UUID, INT)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_leads_timeline(UUID, INT)    TO authenticated, service_role;
