-- ============================================================
-- SofIA SaaS - Governance Functions JWT Refactor
-- Migration 008: Remove falsifiable parameters, use JWT claims
--
-- SECURITY FIX: Previously p_clinic_id and p_user_role were
-- sent by the frontend and trusted blindly. Now they are
-- extracted from auth.jwt() making them unfalsifiable.
--
-- Two auth paths:
--   1. Frontend (anon key + user JWT) → clinic_id + user_role from JWT claims
--   2. n8n backend (service_role key) → passes p_clinic_id, role='service'
--
-- Security guarantees:
--   - JWT user_role ALWAYS wins over p_user_role param (frontend safe)
--   - JWT clinic_id ALWAYS wins over p_clinic_id param (tenant isolation safe)
--   - service_role has no JWT claims → uses params → defaults to 'service' role
-- ============================================================

-- ============================================================
-- HELPER: Extract clinic_id from JWT or fallback to parameter
-- JWT wins (frontend) - param only for service_role (n8n)
-- ============================================================

CREATE OR REPLACE FUNCTION _resolve_clinic_id(p_clinic_id UUID DEFAULT NULL)
RETURNS UUID AS $fn$
DECLARE
    jwt_clinic UUID;
BEGIN
    -- JWT first (frontend path - unfalsifiable)
    BEGIN
        jwt_clinic := (auth.jwt() ->> 'clinic_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
        jwt_clinic := NULL;
    END;
    IF jwt_clinic IS NOT NULL THEN
        RETURN jwt_clinic;
    END IF;
    -- No JWT clinic_id = service_role (n8n) - use parameter
    IF p_clinic_id IS NOT NULL THEN
        RETURN p_clinic_id;
    END IF;
    RAISE EXCEPTION 'No clinic_id: not in JWT and not provided as parameter';
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- HELPER: Extract user_role from JWT
-- JWT wins (frontend, unfalsifiable).
-- For service_role (n8n): no JWT claim -> use param -> 'service'
-- ============================================================

CREATE OR REPLACE FUNCTION _resolve_user_role(p_user_role TEXT DEFAULT NULL)
RETURNS TEXT AS $fn$
DECLARE
    jwt_role TEXT;
BEGIN
    -- JWT always wins (frontend path - unfalsifiable)
    BEGIN
        jwt_role := auth.jwt() ->> 'user_role';
    EXCEPTION WHEN OTHERS THEN
        jwt_role := NULL;
    END;
    IF jwt_role IS NOT NULL AND jwt_role <> '' THEN
        RETURN jwt_role;
    END IF;
    -- No JWT user_role = service_role (n8n) - param allowed (trusted caller)
    IF p_user_role IS NOT NULL AND p_user_role <> '' THEN
        RETURN p_user_role;
    END IF;
    RETURN 'service';
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- REFACTORED: list_conversations
-- Frontend: no params needed (clinic_id from JWT)
-- n8n: passes p_clinic_id (service_role)
-- ============================================================

CREATE OR REPLACE FUNCTION list_conversations(
    p_clinic_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    chatwoot_conversation_id TEXT,
    patient_name TEXT,
    status TEXT,
    bot_paused BOOLEAN,
    assigned_user_id UUID,
    last_message TEXT,
    last_activity_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
) AS $fn$
DECLARE
    v_clinic_id UUID;
BEGIN
    v_clinic_id := _resolve_clinic_id(p_clinic_id);
    RETURN QUERY
    SELECT c.id, c.chatwoot_conversation_id, c.patient_name,
           c.status::TEXT, c.bot_paused, c.assigned_user_id,
           c.last_message, c.last_activity_at, c.created_at
    FROM conversations c
    WHERE c.clinic_id = v_clinic_id
        AND (p_status IS NULL OR c.status::TEXT = p_status)
    ORDER BY c.last_activity_at DESC
    LIMIT LEAST(p_limit, 50) OFFSET p_offset;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- REFACTORED: pause_conversation
-- Frontend sends only p_conversation_id (JWT provides clinic+role)
-- n8n sends p_conversation_id + p_clinic_id (service_role)
-- ============================================================

CREATE OR REPLACE FUNCTION pause_conversation(
    p_conversation_id UUID,
    p_clinic_id UUID DEFAULT NULL,
    p_user_role TEXT DEFAULT NULL
) RETURNS JSON AS $fn$
DECLARE
    v_clinic_id UUID;
    v_role TEXT;
    v_conv conversations%ROWTYPE;
BEGIN
    v_clinic_id := _resolve_clinic_id(p_clinic_id);
    v_role := _resolve_user_role(p_user_role);
    IF v_role NOT IN ('admin', 'service') THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized: admin role required', 'error_code', 'PERMISSION_DENIED');
    END IF;
    SELECT * INTO v_conv FROM conversations WHERE id = p_conversation_id AND clinic_id = v_clinic_id FOR UPDATE;
    IF v_conv.id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Conversation not found', 'error_code', 'NOT_FOUND');
    END IF;
    IF v_conv.bot_paused = true THEN
        RETURN json_build_object('success', false, 'error', 'Conversation already paused', 'error_code', 'ALREADY_PAUSED');
    END IF;
    UPDATE conversations SET bot_paused = true, status = 'human' WHERE id = p_conversation_id;
    INSERT INTO conversation_events (conversation_id, clinic_id, type, source, metadata)
    VALUES (p_conversation_id, v_clinic_id, 'escalation', 'human',
        json_build_object('action', 'pause', 'by_role', v_role, 'timestamp', now())::jsonb);
    RETURN json_build_object('success', true, 'conversation_id', p_conversation_id, 'bot_paused', true, 'status', 'human');
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- REFACTORED: resume_conversation
-- ============================================================

CREATE OR REPLACE FUNCTION resume_conversation(
    p_conversation_id UUID,
    p_clinic_id UUID DEFAULT NULL,
    p_user_role TEXT DEFAULT NULL
) RETURNS JSON AS $fn$
DECLARE
    v_clinic_id UUID;
    v_role TEXT;
    v_conv conversations%ROWTYPE;
BEGIN
    v_clinic_id := _resolve_clinic_id(p_clinic_id);
    v_role := _resolve_user_role(p_user_role);
    IF v_role NOT IN ('admin', 'service') THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized: admin role required', 'error_code', 'PERMISSION_DENIED');
    END IF;
    SELECT * INTO v_conv FROM conversations WHERE id = p_conversation_id AND clinic_id = v_clinic_id FOR UPDATE;
    IF v_conv.id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Conversation not found', 'error_code', 'NOT_FOUND');
    END IF;
    IF v_conv.bot_paused = false THEN
        RETURN json_build_object('success', false, 'error', 'Conversation already active', 'error_code', 'ALREADY_ACTIVE');
    END IF;
    UPDATE conversations SET bot_paused = false, status = 'active' WHERE id = p_conversation_id;
    INSERT INTO conversation_events (conversation_id, clinic_id, type, source, metadata)
    VALUES (p_conversation_id, v_clinic_id, 'escalation', 'bot',
        json_build_object('action', 'resume', 'by_role', v_role, 'timestamp', now())::jsonb);
    RETURN json_build_object('success', true, 'conversation_id', p_conversation_id, 'bot_paused', false, 'status', 'active');
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- REFACTORED: assign_conversation
-- ============================================================

CREATE OR REPLACE FUNCTION assign_conversation(
    p_conversation_id UUID,
    p_assigned_user_id UUID,
    p_clinic_id UUID DEFAULT NULL,
    p_user_role TEXT DEFAULT NULL
) RETURNS JSON AS $fn$
DECLARE
    v_clinic_id UUID;
    v_role TEXT;
    v_conv conversations%ROWTYPE;
BEGIN
    v_clinic_id := _resolve_clinic_id(p_clinic_id);
    v_role := _resolve_user_role(p_user_role);
    IF v_role NOT IN ('admin', 'service') THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized: admin role required', 'error_code', 'PERMISSION_DENIED');
    END IF;
    SELECT * INTO v_conv FROM conversations WHERE id = p_conversation_id AND clinic_id = v_clinic_id FOR UPDATE;
    IF v_conv.id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Conversation not found', 'error_code', 'NOT_FOUND');
    END IF;
    UPDATE conversations SET assigned_user_id = p_assigned_user_id WHERE id = p_conversation_id;
    INSERT INTO conversation_events (conversation_id, clinic_id, type, source, metadata)
    VALUES (p_conversation_id, v_clinic_id, 'escalation', 'human',
        json_build_object('action', 'assign', 'assigned_user_id', p_assigned_user_id, 'by_role', v_role, 'timestamp', now())::jsonb);
    RETURN json_build_object('success', true, 'conversation_id', p_conversation_id, 'assigned_user_id', p_assigned_user_id);
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- REFACTORED: close_conversation
-- ============================================================

CREATE OR REPLACE FUNCTION close_conversation(
    p_conversation_id UUID,
    p_clinic_id UUID DEFAULT NULL,
    p_user_role TEXT DEFAULT NULL
) RETURNS JSON AS $fn$
DECLARE
    v_clinic_id UUID;
    v_role TEXT;
    v_conv conversations%ROWTYPE;
BEGIN
    v_clinic_id := _resolve_clinic_id(p_clinic_id);
    v_role := _resolve_user_role(p_user_role);
    IF v_role NOT IN ('admin', 'service') THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized: admin role required', 'error_code', 'PERMISSION_DENIED');
    END IF;
    SELECT * INTO v_conv FROM conversations WHERE id = p_conversation_id AND clinic_id = v_clinic_id FOR UPDATE;
    IF v_conv.id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Conversation not found', 'error_code', 'NOT_FOUND');
    END IF;
    IF v_conv.status = 'closed' THEN
        RETURN json_build_object('success', false, 'error', 'Conversation already closed', 'error_code', 'ALREADY_CLOSED');
    END IF;
    UPDATE conversations SET status = 'closed', bot_paused = true WHERE id = p_conversation_id;
    INSERT INTO conversation_events (conversation_id, clinic_id, type, source, metadata)
    VALUES (p_conversation_id, v_clinic_id, 'cancel', 'human',
        json_build_object('action', 'close', 'by_role', v_role, 'timestamp', now())::jsonb);
    RETURN json_build_object('success', true, 'conversation_id', p_conversation_id, 'status', 'closed');
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- upsert_conversation: NO CHANGE needed
-- This is called by n8n (service_role) which always sends
-- p_clinic_id. Frontend never calls this function.
-- ============================================================
-- (kept as-is from migration 007)
