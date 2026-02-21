-- ============================================================
-- SofIA SaaS - Conversation Governance Functions
-- Migration 007: Pause, resume, assign, close, list, upsert
-- ============================================================

-- ============================================================
-- FUNCTION: list_conversations
-- Paginated list with optional status filter.
-- ============================================================

CREATE OR REPLACE FUNCTION list_conversations(
    p_clinic_id UUID,
    p_status conversation_status DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    chatwoot_conversation_id TEXT,
    patient_name TEXT,
    status conversation_status,
    bot_paused BOOLEAN,
    assigned_user_id UUID,
    last_message TEXT,
    last_activity_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.chatwoot_conversation_id,
        c.patient_name,
        c.status,
        c.bot_paused,
        c.assigned_user_id,
        c.last_message,
        c.last_activity_at,
        c.created_at
    FROM conversations c
    WHERE c.clinic_id = p_clinic_id
        AND (p_status IS NULL OR c.status = p_status)
    ORDER BY c.last_activity_at DESC
    LIMIT LEAST(p_limit, 50)
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: upsert_conversation
-- Called by n8n on every incoming message.
-- Returns bot_paused status for governance check.
-- ============================================================

CREATE OR REPLACE FUNCTION upsert_conversation(
    p_clinic_id UUID,
    p_chatwoot_conversation_id TEXT,
    p_patient_name TEXT DEFAULT NULL,
    p_last_message TEXT DEFAULT NULL
)
RETURNS TABLE (
    conversation_id UUID,
    bot_paused BOOLEAN,
    status conversation_status
) AS $$
DECLARE
    v_id UUID;
    v_paused BOOLEAN;
    v_status conversation_status;
BEGIN
    INSERT INTO conversations (
        clinic_id, chatwoot_conversation_id, patient_name, last_message, last_activity_at
    ) VALUES (
        p_clinic_id, p_chatwoot_conversation_id, p_patient_name, p_last_message, now()
    )
    ON CONFLICT (clinic_id, chatwoot_conversation_id) DO UPDATE SET
        last_message = COALESCE(EXCLUDED.last_message, conversations.last_message),
        patient_name = COALESCE(EXCLUDED.patient_name, conversations.patient_name),
        last_activity_at = now()
    RETURNING conversations.id, conversations.bot_paused, conversations.status
    INTO v_id, v_paused, v_status;

    RETURN QUERY SELECT v_id, v_paused, v_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: pause_conversation
-- Admin only. Sets bot_paused=true, status='human'.
-- ============================================================

CREATE OR REPLACE FUNCTION pause_conversation(
    p_conversation_id UUID,
    p_clinic_id UUID,
    p_user_role TEXT DEFAULT 'staff'
)
RETURNS JSON AS $$
DECLARE
    v_conv conversations%ROWTYPE;
BEGIN
    IF p_user_role != 'admin' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Unauthorized: admin role required',
            'error_code', 'PERMISSION_DENIED'
        );
    END IF;

    SELECT * INTO v_conv
    FROM conversations
    WHERE id = p_conversation_id AND clinic_id = p_clinic_id
    FOR UPDATE;

    IF v_conv.id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Conversation not found',
            'error_code', 'NOT_FOUND'
        );
    END IF;

    IF v_conv.bot_paused = true THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Conversation already paused',
            'error_code', 'ALREADY_PAUSED'
        );
    END IF;

    UPDATE conversations SET
        bot_paused = true,
        status = 'human'
    WHERE id = p_conversation_id;

    INSERT INTO conversation_events (conversation_id, clinic_id, type, source, metadata)
    VALUES (p_conversation_id, p_clinic_id, 'escalation', 'human',
        json_build_object('action', 'pause', 'timestamp', now())::jsonb);

    RETURN json_build_object(
        'success', true,
        'conversation_id', p_conversation_id,
        'bot_paused', true,
        'status', 'human'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: resume_conversation
-- Admin only. Sets bot_paused=false, status='active'.
-- ============================================================

CREATE OR REPLACE FUNCTION resume_conversation(
    p_conversation_id UUID,
    p_clinic_id UUID,
    p_user_role TEXT DEFAULT 'staff'
)
RETURNS JSON AS $$
DECLARE
    v_conv conversations%ROWTYPE;
BEGIN
    IF p_user_role != 'admin' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Unauthorized: admin role required',
            'error_code', 'PERMISSION_DENIED'
        );
    END IF;

    SELECT * INTO v_conv
    FROM conversations
    WHERE id = p_conversation_id AND clinic_id = p_clinic_id
    FOR UPDATE;

    IF v_conv.id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Conversation not found',
            'error_code', 'NOT_FOUND'
        );
    END IF;

    IF v_conv.bot_paused = false THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Conversation already active',
            'error_code', 'ALREADY_ACTIVE'
        );
    END IF;

    UPDATE conversations SET
        bot_paused = false,
        status = 'active'
    WHERE id = p_conversation_id;

    INSERT INTO conversation_events (conversation_id, clinic_id, type, source, metadata)
    VALUES (p_conversation_id, p_clinic_id, 'escalation', 'bot',
        json_build_object('action', 'resume', 'timestamp', now())::jsonb);

    RETURN json_build_object(
        'success', true,
        'conversation_id', p_conversation_id,
        'bot_paused', false,
        'status', 'active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: assign_conversation
-- Admin only. Sets assigned_user_id.
-- ============================================================

CREATE OR REPLACE FUNCTION assign_conversation(
    p_conversation_id UUID,
    p_clinic_id UUID,
    p_assigned_user_id UUID,
    p_user_role TEXT DEFAULT 'staff'
)
RETURNS JSON AS $$
DECLARE
    v_conv conversations%ROWTYPE;
BEGIN
    IF p_user_role != 'admin' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Unauthorized: admin role required',
            'error_code', 'PERMISSION_DENIED'
        );
    END IF;

    SELECT * INTO v_conv
    FROM conversations
    WHERE id = p_conversation_id AND clinic_id = p_clinic_id
    FOR UPDATE;

    IF v_conv.id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Conversation not found',
            'error_code', 'NOT_FOUND'
        );
    END IF;

    UPDATE conversations SET
        assigned_user_id = p_assigned_user_id
    WHERE id = p_conversation_id;

    INSERT INTO conversation_events (conversation_id, clinic_id, type, source, metadata)
    VALUES (p_conversation_id, p_clinic_id, 'escalation', 'human',
        json_build_object('action', 'assign', 'assigned_user_id', p_assigned_user_id, 'timestamp', now())::jsonb);

    RETURN json_build_object(
        'success', true,
        'conversation_id', p_conversation_id,
        'assigned_user_id', p_assigned_user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: close_conversation
-- Admin only. Sets status='closed', bot_paused=true.
-- ============================================================

CREATE OR REPLACE FUNCTION close_conversation(
    p_conversation_id UUID,
    p_clinic_id UUID,
    p_user_role TEXT DEFAULT 'staff'
)
RETURNS JSON AS $$
DECLARE
    v_conv conversations%ROWTYPE;
BEGIN
    IF p_user_role != 'admin' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Unauthorized: admin role required',
            'error_code', 'PERMISSION_DENIED'
        );
    END IF;

    SELECT * INTO v_conv
    FROM conversations
    WHERE id = p_conversation_id AND clinic_id = p_clinic_id
    FOR UPDATE;

    IF v_conv.id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Conversation not found',
            'error_code', 'NOT_FOUND'
        );
    END IF;

    IF v_conv.status = 'closed' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Conversation already closed',
            'error_code', 'ALREADY_CLOSED'
        );
    END IF;

    UPDATE conversations SET
        status = 'closed',
        bot_paused = true
    WHERE id = p_conversation_id;

    INSERT INTO conversation_events (conversation_id, clinic_id, type, source, metadata)
    VALUES (p_conversation_id, p_clinic_id, 'cancel', 'human',
        json_build_object('action', 'close', 'timestamp', now())::jsonb);

    RETURN json_build_object(
        'success', true,
        'conversation_id', p_conversation_id,
        'status', 'closed'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
