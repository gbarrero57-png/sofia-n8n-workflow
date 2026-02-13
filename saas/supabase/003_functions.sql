-- ============================================================
-- SOFIA SaaS - Database Functions
-- Migration 003: Metrics aggregation, cancellation, reminders
-- ============================================================

-- ============================================================
-- FUNCTION: get_dashboard_metrics
-- Called by: GET /dashboard/metrics?clinic_id=xxx&period=7d
-- Returns all dashboard KPIs in a single query.
-- ============================================================

CREATE OR REPLACE FUNCTION get_dashboard_metrics(
    p_clinic_id UUID,
    p_period_days INTEGER DEFAULT 7
)
RETURNS JSON AS $$
DECLARE
    v_start TIMESTAMPTZ;
    v_result JSON;
BEGIN
    v_start := now() - (p_period_days || ' days')::interval;

    SELECT json_build_object(
        'period_days', p_period_days,
        'period_start', v_start,
        'period_end', now(),

        'total_conversations', (
            SELECT COUNT(*)
            FROM conversation_metrics
            WHERE clinic_id = p_clinic_id AND created_at >= v_start
        ),

        'total_bookings', (
            SELECT COUNT(*)
            FROM conversation_metrics
            WHERE clinic_id = p_clinic_id AND created_at >= v_start AND booked = true
        ),

        'conversion_rate', (
            SELECT COALESCE(
                ROUND(
                    COUNT(*) FILTER (WHERE booked = true)::numeric /
                    NULLIF(COUNT(*), 0) * 100, 1
                ), 0
            )
            FROM conversation_metrics
            WHERE clinic_id = p_clinic_id AND created_at >= v_start
        ),

        'escalation_rate', (
            SELECT COALESCE(
                ROUND(
                    COUNT(*) FILTER (WHERE escalated = true)::numeric /
                    NULLIF(COUNT(*), 0) * 100, 1
                ), 0
            )
            FROM conversation_metrics
            WHERE clinic_id = p_clinic_id AND created_at >= v_start
        ),

        'cancellation_rate', (
            SELECT COALESCE(
                ROUND(
                    COUNT(*) FILTER (WHERE cancelled = true)::numeric /
                    NULLIF(COUNT(*) FILTER (WHERE booked = true), 0) * 100, 1
                ), 0
            )
            FROM conversation_metrics
            WHERE clinic_id = p_clinic_id AND created_at >= v_start
        ),

        'avg_response_time_ms', (
            SELECT COALESCE(ROUND(AVG(response_time_ms)), 0)
            FROM conversation_metrics
            WHERE clinic_id = p_clinic_id AND created_at >= v_start
                AND response_time_ms IS NOT NULL
        ),

        'intent_distribution', (
            SELECT COALESCE(json_object_agg(intent, cnt), '{}'::json)
            FROM (
                SELECT intent, COUNT(*) as cnt
                FROM conversation_metrics
                WHERE clinic_id = p_clinic_id AND created_at >= v_start
                GROUP BY intent
            ) sub
        ),

        'phase_distribution', (
            SELECT COALESCE(json_object_agg(phase_reached, cnt), '{}'::json)
            FROM (
                SELECT phase_reached, COUNT(*) as cnt
                FROM conversation_metrics
                WHERE clinic_id = p_clinic_id AND created_at >= v_start
                GROUP BY phase_reached
            ) sub
        ),

        'daily_conversations', (
            SELECT COALESCE(json_agg(row_to_json(sub)), '[]'::json)
            FROM (
                SELECT
                    created_at::date as date,
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE booked = true) as booked,
                    COUNT(*) FILTER (WHERE escalated = true) as escalated
                FROM conversation_metrics
                WHERE clinic_id = p_clinic_id AND created_at >= v_start
                GROUP BY created_at::date
                ORDER BY created_at::date
            ) sub
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: cancel_appointment
-- Called by: POST /appointments/:id/cancel
-- Cancels appointment, frees slot, updates metrics.
-- ============================================================

CREATE OR REPLACE FUNCTION cancel_appointment(
    p_appointment_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_appointment appointments%ROWTYPE;
    v_result JSON;
BEGIN
    -- Get appointment with lock
    SELECT * INTO v_appointment
    FROM appointments
    WHERE id = p_appointment_id
    FOR UPDATE;

    -- Validate
    IF v_appointment.id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Appointment not found');
    END IF;

    IF v_appointment.status NOT IN ('scheduled', 'confirmed') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Cannot cancel appointment with status: ' || v_appointment.status
        );
    END IF;

    -- Cancel the appointment (frees the slot via EXCLUDE constraint)
    UPDATE appointments SET
        status = 'cancelled',
        cancellation_reason = p_reason,
        updated_at = now()
    WHERE id = p_appointment_id;

    -- Update conversation metrics
    UPDATE conversation_metrics SET
        cancelled = true,
        updated_at = now()
    WHERE clinic_id = v_appointment.clinic_id
        AND conversation_id = v_appointment.conversation_id;

    RETURN json_build_object(
        'success', true,
        'appointment_id', p_appointment_id,
        'calendar_event_id', v_appointment.calendar_event_id,
        'clinic_id', v_appointment.clinic_id,
        'patient_name', v_appointment.patient_name,
        'service', v_appointment.service,
        'start_time', v_appointment.start_time
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: get_pending_reminders
-- Called by: n8n scheduled job (every hour)
-- Returns appointments that need a 24h reminder.
-- ============================================================

CREATE OR REPLACE FUNCTION get_pending_reminders()
RETURNS TABLE (
    appointment_id UUID,
    clinic_id UUID,
    conversation_id INTEGER,
    patient_name TEXT,
    phone TEXT,
    service TEXT,
    start_time TIMESTAMPTZ,
    clinic_name TEXT,
    chatwoot_account_id INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.id as appointment_id,
        a.clinic_id,
        a.conversation_id,
        a.patient_name,
        a.phone,
        a.service,
        a.start_time,
        c.name as clinic_name,
        c.chatwoot_account_id
    FROM appointments a
    JOIN clinics c ON c.id = a.clinic_id
    WHERE a.status IN ('scheduled', 'confirmed')
        AND a.reminder_sent = false
        AND a.start_time BETWEEN now() + interval '23 hours'
                              AND now() + interval '25 hours'
    ORDER BY a.start_time;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: mark_reminder_sent
-- Called by: n8n after sending reminder through Chatwoot
-- ============================================================

CREATE OR REPLACE FUNCTION mark_reminder_sent(
    p_appointment_id UUID,
    p_status TEXT DEFAULT 'sent',
    p_error TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_clinic_id UUID;
BEGIN
    -- Update appointment
    UPDATE appointments SET
        reminder_sent = true,
        reminder_sent_at = now()
    WHERE id = p_appointment_id
    RETURNING clinic_id INTO v_clinic_id;

    -- Log the reminder
    INSERT INTO reminder_log (appointment_id, clinic_id, status, error_message)
    VALUES (p_appointment_id, v_clinic_id, p_status, p_error);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: upsert_conversation_metric
-- Called by: n8n at end of each conversation processing
-- Creates or updates the metric for a conversation.
-- ============================================================

CREATE OR REPLACE FUNCTION upsert_conversation_metric(
    p_clinic_id UUID,
    p_conversation_id INTEGER,
    p_intent TEXT DEFAULT 'UNKNOWN',
    p_escalated BOOLEAN DEFAULT false,
    p_booked BOOLEAN DEFAULT false,
    p_phase_reached INTEGER DEFAULT 1,
    p_response_time_ms INTEGER DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO conversation_metrics (
        clinic_id, conversation_id, intent, escalated,
        booked, phase_reached, response_time_ms
    )
    VALUES (
        p_clinic_id, p_conversation_id, p_intent::intent_type,
        p_escalated, p_booked, p_phase_reached, p_response_time_ms
    )
    ON CONFLICT (clinic_id, conversation_id) DO UPDATE SET
        intent = EXCLUDED.intent,
        escalated = GREATEST(conversation_metrics.escalated::int, EXCLUDED.escalated::int)::boolean,
        booked = GREATEST(conversation_metrics.booked::int, EXCLUDED.booked::int)::boolean,
        phase_reached = GREATEST(conversation_metrics.phase_reached, EXCLUDED.phase_reached),
        response_time_ms = COALESCE(EXCLUDED.response_time_ms, conversation_metrics.response_time_ms),
        message_count = conversation_metrics.message_count + 1,
        updated_at = now()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: search_knowledge_base
-- Fuzzy search + keyword matching for n8n INFO flow.
-- Returns top answers ranked by relevance.
-- ============================================================

CREATE OR REPLACE FUNCTION search_knowledge_base(
    p_clinic_id UUID,
    p_query TEXT,
    p_category kb_category DEFAULT NULL,
    p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    category kb_category,
    question TEXT,
    answer TEXT,
    relevance REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        kb.id,
        kb.category,
        kb.question,
        kb.answer,
        similarity(kb.question, p_query) as relevance
    FROM knowledge_base kb
    WHERE kb.clinic_id = p_clinic_id
        AND kb.active = true
        AND (p_category IS NULL OR kb.category = p_category)
        AND (
            similarity(kb.question, p_query) > 0.1
            OR kb.keywords && string_to_array(lower(p_query), ' ')
        )
    ORDER BY
        similarity(kb.question, p_query) DESC,
        kb.priority DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: resolve_clinic_from_chatwoot
-- Maps a Chatwoot inbox_id to a clinic_id.
-- Called at the start of every n8n execution.
-- ============================================================

CREATE OR REPLACE FUNCTION resolve_clinic(
    p_inbox_id INTEGER DEFAULT NULL,
    p_account_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
    clinic_id UUID,
    clinic_name TEXT,
    calendar_id TEXT,
    timezone TEXT,
    bot_config JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id as clinic_id,
        c.name as clinic_name,
        c.calendar_id,
        c.timezone,
        c.bot_config
    FROM clinics c
    WHERE c.active = true
        AND (p_inbox_id IS NULL OR c.chatwoot_inbox_id = p_inbox_id)
        AND (p_account_id IS NULL OR c.chatwoot_account_id = p_account_id)
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
