#!/usr/bin/env python3
"""Deploy governance functions to Supabase"""
import requests, sys
sys.stdout.reconfigure(encoding='utf-8')

SUPABASE_REF = "inhyrrjidhzrbqecnptn"
ACCESS_TOKEN = "sbp_6173188bf253e74928c0a3129f8c747cfe7ab627"

def run_sql(sql, label):
    r = requests.post(
        f"https://api.supabase.com/v1/projects/{SUPABASE_REF}/database/query",
        headers={"Authorization": f"Bearer {ACCESS_TOKEN}", "Content-Type": "application/json"},
        json={"query": sql}
    )
    if r.status_code in [200, 201]:
        print(f"[OK] {label}")
        return r.json()
    else:
        print(f"[ERROR] {label}: {r.status_code} - {r.text[:300]}")
        return None


# ============================================================
# Deploy each function separately for better error handling
# ============================================================

print("=" * 60)
print("Deploying Governance Functions")
print("=" * 60)

# 1. list_conversations
run_sql("""
CREATE OR REPLACE FUNCTION list_conversations(
    p_clinic_id UUID,
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
BEGIN
    RETURN QUERY
    SELECT c.id, c.chatwoot_conversation_id, c.patient_name,
           c.status, c.bot_paused, c.assigned_user_id,
           c.last_message, c.last_activity_at, c.created_at
    FROM conversations c
    WHERE c.clinic_id = p_clinic_id
        AND (p_status IS NULL OR c.status = p_status)
    ORDER BY c.last_activity_at DESC
    LIMIT LEAST(p_limit, 50) OFFSET p_offset;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;
""", "list_conversations")

# 2. upsert_conversation
run_sql("""
CREATE OR REPLACE FUNCTION upsert_conversation(
    p_clinic_id UUID,
    p_chatwoot_conversation_id TEXT,
    p_patient_name TEXT DEFAULT NULL,
    p_last_message TEXT DEFAULT NULL
)
RETURNS TABLE (conversation_id UUID, bot_paused BOOLEAN, status TEXT) AS $fn$
DECLARE v_id UUID; v_paused BOOLEAN; v_status TEXT;
BEGIN
    INSERT INTO conversations (clinic_id, chatwoot_conversation_id, patient_name, last_message, last_activity_at)
    VALUES (p_clinic_id, p_chatwoot_conversation_id, p_patient_name, p_last_message, now())
    ON CONFLICT (clinic_id, chatwoot_conversation_id) DO UPDATE SET
        last_message = COALESCE(EXCLUDED.last_message, conversations.last_message),
        patient_name = COALESCE(EXCLUDED.patient_name, conversations.patient_name),
        last_activity_at = now()
    RETURNING conversations.id, conversations.bot_paused, conversations.status
    INTO v_id, v_paused, v_status;
    RETURN QUERY SELECT v_id, v_paused, v_status;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;
""", "upsert_conversation")

# 3. pause_conversation
run_sql("""
CREATE OR REPLACE FUNCTION pause_conversation(
    p_conversation_id UUID, p_clinic_id UUID, p_user_role TEXT DEFAULT 'staff'
) RETURNS JSON AS $fn$
DECLARE v_conv conversations%ROWTYPE;
BEGIN
    IF p_user_role != 'admin' THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized: admin role required', 'error_code', 'PERMISSION_DENIED');
    END IF;
    SELECT * INTO v_conv FROM conversations WHERE id = p_conversation_id AND clinic_id = p_clinic_id FOR UPDATE;
    IF v_conv.id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Conversation not found', 'error_code', 'NOT_FOUND');
    END IF;
    IF v_conv.bot_paused = true THEN
        RETURN json_build_object('success', false, 'error', 'Conversation already paused', 'error_code', 'ALREADY_PAUSED');
    END IF;
    UPDATE conversations SET bot_paused = true, status = 'human' WHERE id = p_conversation_id;
    INSERT INTO conversation_events (conversation_id, clinic_id, type, source, metadata)
    VALUES (p_conversation_id, p_clinic_id, 'escalation', 'human', json_build_object('action', 'pause', 'timestamp', now())::jsonb);
    RETURN json_build_object('success', true, 'conversation_id', p_conversation_id, 'bot_paused', true, 'status', 'human');
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;
""", "pause_conversation")

# 4. resume_conversation
run_sql("""
CREATE OR REPLACE FUNCTION resume_conversation(
    p_conversation_id UUID, p_clinic_id UUID, p_user_role TEXT DEFAULT 'staff'
) RETURNS JSON AS $fn$
DECLARE v_conv conversations%ROWTYPE;
BEGIN
    IF p_user_role != 'admin' THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized: admin role required', 'error_code', 'PERMISSION_DENIED');
    END IF;
    SELECT * INTO v_conv FROM conversations WHERE id = p_conversation_id AND clinic_id = p_clinic_id FOR UPDATE;
    IF v_conv.id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Conversation not found', 'error_code', 'NOT_FOUND');
    END IF;
    IF v_conv.bot_paused = false THEN
        RETURN json_build_object('success', false, 'error', 'Conversation already active', 'error_code', 'ALREADY_ACTIVE');
    END IF;
    UPDATE conversations SET bot_paused = false, status = 'active' WHERE id = p_conversation_id;
    INSERT INTO conversation_events (conversation_id, clinic_id, type, source, metadata)
    VALUES (p_conversation_id, p_clinic_id, 'escalation', 'bot', json_build_object('action', 'resume', 'timestamp', now())::jsonb);
    RETURN json_build_object('success', true, 'conversation_id', p_conversation_id, 'bot_paused', false, 'status', 'active');
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;
""", "resume_conversation")

# 5. assign_conversation
run_sql("""
CREATE OR REPLACE FUNCTION assign_conversation(
    p_conversation_id UUID, p_clinic_id UUID, p_assigned_user_id UUID, p_user_role TEXT DEFAULT 'staff'
) RETURNS JSON AS $fn$
DECLARE v_conv conversations%ROWTYPE;
BEGIN
    IF p_user_role != 'admin' THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized: admin role required', 'error_code', 'PERMISSION_DENIED');
    END IF;
    SELECT * INTO v_conv FROM conversations WHERE id = p_conversation_id AND clinic_id = p_clinic_id FOR UPDATE;
    IF v_conv.id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Conversation not found', 'error_code', 'NOT_FOUND');
    END IF;
    UPDATE conversations SET assigned_user_id = p_assigned_user_id WHERE id = p_conversation_id;
    INSERT INTO conversation_events (conversation_id, clinic_id, type, source, metadata)
    VALUES (p_conversation_id, p_clinic_id, 'escalation', 'human',
        json_build_object('action', 'assign', 'assigned_user_id', p_assigned_user_id, 'timestamp', now())::jsonb);
    RETURN json_build_object('success', true, 'conversation_id', p_conversation_id, 'assigned_user_id', p_assigned_user_id);
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;
""", "assign_conversation")

# 6. close_conversation
run_sql("""
CREATE OR REPLACE FUNCTION close_conversation(
    p_conversation_id UUID, p_clinic_id UUID, p_user_role TEXT DEFAULT 'staff'
) RETURNS JSON AS $fn$
DECLARE v_conv conversations%ROWTYPE;
BEGIN
    IF p_user_role != 'admin' THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized: admin role required', 'error_code', 'PERMISSION_DENIED');
    END IF;
    SELECT * INTO v_conv FROM conversations WHERE id = p_conversation_id AND clinic_id = p_clinic_id FOR UPDATE;
    IF v_conv.id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Conversation not found', 'error_code', 'NOT_FOUND');
    END IF;
    IF v_conv.status = 'closed' THEN
        RETURN json_build_object('success', false, 'error', 'Conversation already closed', 'error_code', 'ALREADY_CLOSED');
    END IF;
    UPDATE conversations SET status = 'closed', bot_paused = true WHERE id = p_conversation_id;
    INSERT INTO conversation_events (conversation_id, clinic_id, type, source, metadata)
    VALUES (p_conversation_id, p_clinic_id, 'cancel', 'human', json_build_object('action', 'close', 'timestamp', now())::jsonb);
    RETURN json_build_object('success', true, 'conversation_id', p_conversation_id, 'status', 'closed');
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;
""", "close_conversation")

# Verify
print("\n" + "=" * 60)
result = run_sql("""
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name IN (
    'list_conversations', 'upsert_conversation', 'pause_conversation',
    'resume_conversation', 'assign_conversation', 'close_conversation'
) ORDER BY routine_name;
""", "Verify functions")
if result:
    print(f"Functions found: {[f['routine_name'] for f in result]}")
