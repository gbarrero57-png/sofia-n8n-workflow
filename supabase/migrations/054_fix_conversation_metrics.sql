-- ============================================================
-- 054_fix_conversation_metrics.sql
--
-- 1. Convert intent column from intent_type enum → TEXT
--    (enum only had 5 values; bot produces 17+ distinct intents)
--
-- 2. Add columns get_bot_performance was already querying:
--    bot_handled, slots_offered, slot_confirmed
--
-- 3. Fix upsert_conversation_metric — remove enum cast, add slots
--
-- 4. Fix get_bot_performance — use real column names
-- ============================================================

-- ── 1. Convert intent enum → TEXT ────────────────────────────────────────────

ALTER TABLE public.conversation_metrics
  ALTER COLUMN intent TYPE TEXT USING intent::TEXT;

-- ── 2. Add missing columns ────────────────────────────────────────────────────

ALTER TABLE public.conversation_metrics
  ADD COLUMN IF NOT EXISTS bot_handled    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS slots_offered  INT     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slot_confirmed BOOLEAN NOT NULL DEFAULT false;

-- Backfill: bot_handled = NOT escalated for existing rows
UPDATE public.conversation_metrics
SET bot_handled = NOT escalated;

-- ── 3. Fix upsert_conversation_metric ────────────────────────────────────────

DROP FUNCTION IF EXISTS public.upsert_conversation_metric(UUID, INTEGER, TEXT, BOOLEAN, BOOLEAN, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.upsert_conversation_metric(
    p_clinic_id        UUID,
    p_conversation_id  INTEGER,
    p_intent           TEXT    DEFAULT 'UNKNOWN',
    p_escalated        BOOLEAN DEFAULT false,
    p_booked           BOOLEAN DEFAULT false,
    p_phase_reached    INTEGER DEFAULT 1,
    p_response_time_ms INTEGER DEFAULT NULL,
    p_slots_offered    INT     DEFAULT 0,
    p_slot_confirmed   BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.conversation_metrics (
        clinic_id, conversation_id, intent, escalated,
        booked, phase_reached, response_time_ms,
        bot_handled, slots_offered, slot_confirmed
    )
    VALUES (
        p_clinic_id, p_conversation_id,
        COALESCE(NULLIF(p_intent, ''), 'UNKNOWN'),
        p_escalated, p_booked, p_phase_reached, p_response_time_ms,
        NOT p_escalated, p_slots_offered, p_slot_confirmed
    )
    ON CONFLICT (clinic_id, conversation_id) DO UPDATE SET
        intent          = COALESCE(NULLIF(EXCLUDED.intent, ''), 'UNKNOWN'),
        escalated       = GREATEST(conversation_metrics.escalated::int, EXCLUDED.escalated::int)::boolean,
        booked          = GREATEST(conversation_metrics.booked::int, EXCLUDED.booked::int)::boolean,
        phase_reached   = GREATEST(conversation_metrics.phase_reached, EXCLUDED.phase_reached),
        response_time_ms = COALESCE(EXCLUDED.response_time_ms, conversation_metrics.response_time_ms),
        bot_handled     = NOT GREATEST(conversation_metrics.escalated::int, EXCLUDED.escalated::int)::boolean,
        slots_offered   = GREATEST(conversation_metrics.slots_offered, EXCLUDED.slots_offered),
        slot_confirmed  = GREATEST(conversation_metrics.slot_confirmed::int, EXCLUDED.slot_confirmed::int)::boolean,
        message_count   = conversation_metrics.message_count + 1,
        updated_at      = now()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_conversation_metric(UUID, INTEGER, TEXT, BOOLEAN, BOOLEAN, INTEGER, INTEGER, INT, BOOLEAN)
  TO authenticated, service_role;

-- ── 4. Fix get_bot_performance — use actual column names ─────────────────────

CREATE OR REPLACE FUNCTION public.get_bot_performance(
    p_clinic_id UUID,
    p_days      INT DEFAULT 30
)
RETURNS TABLE (
    total_conversations BIGINT,
    bot_handled         BIGINT,
    human_escalated     BIGINT,
    escalation_rate     NUMERIC,
    slots_offered       BIGINT,
    slots_confirmed     BIGINT,
    slot_confirm_rate   NUMERIC,
    avg_response_ms     NUMERIC,
    top_intents         jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_period_start TIMESTAMPTZ := now() - (p_days || ' days')::interval;
    v_top_intents  jsonb;
BEGIN
    IF (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role'
       AND NOT EXISTS (
           SELECT 1 FROM public.staff
           WHERE user_id = auth.uid() AND clinic_id = p_clinic_id
       )
    THEN
        RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;

    SELECT jsonb_object_agg(intent, cnt) INTO v_top_intents
    FROM (
        SELECT intent, COUNT(*) AS cnt
        FROM   public.conversation_metrics
        WHERE  clinic_id  = p_clinic_id
          AND  created_at >= v_period_start
          AND  intent IS NOT NULL
          AND  intent <> 'UNKNOWN'
        GROUP  BY intent
        ORDER  BY cnt DESC
        LIMIT  8
    ) t;

    RETURN QUERY
    SELECT
        COUNT(DISTINCT cm.conversation_id),
        COUNT(DISTINCT cm.conversation_id) FILTER (WHERE cm.bot_handled = true),
        COUNT(DISTINCT cm.conversation_id) FILTER (WHERE cm.bot_handled = false),
        ROUND(
            COUNT(DISTINCT cm.conversation_id) FILTER (WHERE cm.bot_handled = false)::numeric
            / NULLIF(COUNT(DISTINCT cm.conversation_id), 0) * 100, 1
        ),
        COALESCE(SUM(cm.slots_offered), 0)::BIGINT,
        COUNT(*) FILTER (WHERE cm.slot_confirmed = true),
        ROUND(
            COUNT(*) FILTER (WHERE cm.slot_confirmed = true)::numeric
            / NULLIF(SUM(cm.slots_offered), 0) * 100, 1
        ),
        ROUND(AVG(cm.response_time_ms), 0),
        COALESCE(v_top_intents, '{}'::jsonb)
    FROM   public.conversation_metrics cm
    WHERE  cm.clinic_id  = p_clinic_id
      AND  cm.created_at >= v_period_start;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_bot_performance(UUID, INT) TO authenticated, service_role;
