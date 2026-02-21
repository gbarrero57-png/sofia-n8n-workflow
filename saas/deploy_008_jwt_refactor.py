#!/usr/bin/env python3
"""Deploy Migration 008: JWT Refactor for Governance Functions"""
import requests, sys
sys.stdout.reconfigure(encoding='utf-8')

SUPABASE_URL = "https://inhyrrjidhzrbqecnptn.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluaHlycmppZGh6cmJxZWNucHRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwNzU3NSwiZXhwIjoyMDg2NTgzNTc1fQ.-YwX0Qf4Gn8MdjFbLxCYuCJV1OzWl2qWWk4hKuU6z7k"

SUPABASE_PROJECT_REF = "inhyrrjidhzrbqecnptn"
SUPABASE_ACCESS_TOKEN = "sbp_6173188bf253e74928c0a3129f8c747cfe7ab627"

MGMT_URL = f"https://api.supabase.com/v1/projects/{SUPABASE_PROJECT_REF}/database/query"
MGMT_HEADERS = {
    "Authorization": f"Bearer {SUPABASE_ACCESS_TOKEN}",
    "Content-Type": "application/json"
}

def execute_sql(label, sql):
    print(f"\n  Deploying: {label}...")
    r = requests.post(MGMT_URL, headers=MGMT_HEADERS, json={"query": sql})
    if r.status_code == 201:
        print(f"  [OK] {label}")
        return True
    else:
        print(f"  [ERROR] {r.status_code}: {r.text[:300]}")
        return False

# Read the migration file
with open("supabase/008_governance_jwt_refactor.sql", "r", encoding="utf-8") as f:
    full_sql = f.read()

# Split into individual functions for better error tracking
functions = [
    ("_resolve_clinic_id", """
CREATE OR REPLACE FUNCTION _resolve_clinic_id(p_clinic_id UUID DEFAULT NULL)
RETURNS UUID AS $fn$
DECLARE
    jwt_clinic UUID;
BEGIN
    BEGIN
        jwt_clinic := (auth.jwt() ->> 'clinic_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
        jwt_clinic := NULL;
    END;
    IF jwt_clinic IS NOT NULL THEN
        RETURN jwt_clinic;
    END IF;
    IF p_clinic_id IS NOT NULL THEN
        RETURN p_clinic_id;
    END IF;
    RAISE EXCEPTION 'No clinic_id: not in JWT and not provided as parameter';
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
"""),
    ("_resolve_user_role", """
CREATE OR REPLACE FUNCTION _resolve_user_role()
RETURNS TEXT AS $fn$
DECLARE
    jwt_role TEXT;
BEGIN
    BEGIN
        jwt_role := auth.jwt() ->> 'user_role';
    EXCEPTION WHEN OTHERS THEN
        jwt_role := NULL;
    END;
    IF jwt_role IS NOT NULL THEN
        RETURN jwt_role;
    END IF;
    RETURN 'service';
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
"""),
    ("list_conversations (refactored)", """
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
"""),
    ("pause_conversation (refactored)", """
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
    v_role := COALESCE(NULLIF(p_user_role, ''), _resolve_user_role());
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
"""),
    ("resume_conversation (refactored)", """
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
    v_role := COALESCE(NULLIF(p_user_role, ''), _resolve_user_role());
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
"""),
    ("assign_conversation (refactored)", """
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
    v_role := COALESCE(NULLIF(p_user_role, ''), _resolve_user_role());
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
"""),
    ("close_conversation (refactored)", """
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
    v_role := COALESCE(NULLIF(p_user_role, ''), _resolve_user_role());
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
"""),
]

print("=" * 60)
print("Migration 008: JWT Refactor Deployment")
print("=" * 60)

success_count = 0
for label, sql in functions:
    if execute_sql(label, sql):
        success_count += 1

print(f"\n{'=' * 60}")
print(f"RESULTS: {success_count}/{len(functions)} functions deployed")
print(f"{'=' * 60}")

if success_count == len(functions):
    print("\n[SUCCESS] All governance functions refactored for JWT auth")
    print("\nAuth paths:")
    print("  Frontend: auth.jwt() -> clinic_id + user_role from claims")
    print("  n8n:      service_role -> p_clinic_id param, role='service'")
else:
    print("\n[WARNING] Some functions failed to deploy")
    sys.exit(1)
