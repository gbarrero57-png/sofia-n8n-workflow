#!/usr/bin/env python3
"""Governance Test Suite - SofIA SaaS"""
import requests, json, time, sys, uuid
sys.stdout.reconfigure(encoding='utf-8')

N8N_BASE_URL = "https://workflows.n8n.redsolucionesti.com"
N8N_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNzY4NTgyLCJleHAiOjE3NzMyODgwMDF9.Z3vHmfdFzKFXzVgGVxoxIuX9VDsuepcFC_9wJiK7EyM"
WORKFLOW_ID = "37SLdWISQLgkHeXk"
WEBHOOK_URL = f"{N8N_BASE_URL}/webhook/chatwoot-sofia"

SUPABASE_URL = "https://inhyrrjidhzrbqecnptn.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluaHlycmppZGh6cmJxZWNucHRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwNzU3NSwiZXhwIjoyMDg2NTgzNTc1fQ.-YwX0Qf4Gn8MdjFbLxCYuCJV1OzWl2qWWk4hKuU6z7k"
CLINIC_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"


def rpc(fn, params):
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/{fn}",
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json"
        },
        json=params
    )
    if r.status_code in [200, 201]:
        return r.json()
    raise Exception(f"{fn}: {r.status_code} {r.text[:200]}")


def query(table, filters=None):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    params = {}
    if filters:
        for k, v in filters.items():
            params[k] = f"eq.{v}"
    r = requests.get(url, headers={
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}"
    }, params=params)
    return r.json()


def send_webhook(conv_id, content):
    return requests.post(WEBHOOK_URL, json={
        "event": "message_created",
        "message_type": "incoming",
        "inbox": {"id": 1},
        "account": {"id": 1},
        "conversation": {"id": conv_id, "status": "open"},
        "sender": {"id": conv_id, "name": f"Test {conv_id}"},
        "content": content
    }, timeout=30)


def get_execution(wait=18):
    time.sleep(wait)
    execs = requests.get(
        f"{N8N_BASE_URL}/api/v1/executions",
        headers={"X-N8N-API-KEY": N8N_API_KEY},
        params={"workflowId": WORKFLOW_ID, "limit": 1}
    ).json()
    if not execs.get("data"):
        return None
    exec_id = execs["data"][0]["id"]
    detail = requests.get(
        f"{N8N_BASE_URL}/api/v1/executions/{exec_id}",
        headers={"X-N8N-API-KEY": N8N_API_KEY},
        params={"includeData": "true"}
    ).json()
    return detail


# ============================================================
# DATABASE TESTS
# ============================================================

print("=" * 60)
print("GOVERNANCE TEST SUITE")
print("=" * 60)

results = []
test_chatwoot_id = f"gov-test-{uuid.uuid4().hex[:8]}"
conv_db_id = None

# TEST 1: upsert_conversation - create new
print("\n[TEST 1] upsert_conversation - create new")
try:
    r = rpc("upsert_conversation", {
        "p_clinic_id": CLINIC_ID,
        "p_chatwoot_conversation_id": test_chatwoot_id,
        "p_patient_name": "Test Governance Patient",
        "p_last_message": "Hello governance test"
    })
    assert len(r) == 1, f"Expected 1 row, got {len(r)}"
    assert r[0]["bot_paused"] == False, f"Expected bot_paused=false, got {r[0]['bot_paused']}"
    assert r[0]["status"] == "active", f"Expected status=active, got {r[0]['status']}"
    conv_db_id = r[0]["conversation_id"]
    print(f"  [PASS] Created: {conv_db_id}, bot_paused=false, status=active")
    results.append(True)
except Exception as e:
    print(f"  [FAIL] {e}")
    results.append(False)

# TEST 2: list_conversations
print("\n[TEST 2] list_conversations - paginated")
try:
    r = rpc("list_conversations", {
        "p_clinic_id": CLINIC_ID,
        "p_status": "active",
        "p_limit": 10,
        "p_offset": 0
    })
    assert isinstance(r, list), f"Expected list, got {type(r)}"
    found = any(c["id"] == conv_db_id for c in r)
    assert found, "Created conversation not found in list"
    print(f"  [PASS] Found {len(r)} active conversations")
    results.append(True)
except Exception as e:
    print(f"  [FAIL] {e}")
    results.append(False)

# TEST 3: pause_conversation - admin
print("\n[TEST 3] pause_conversation - admin")
try:
    r = rpc("pause_conversation", {
        "p_conversation_id": conv_db_id,
        "p_clinic_id": CLINIC_ID,
        "p_user_role": "admin"
    })
    assert r["success"] == True, f"Expected success=true, got {r}"
    assert r["bot_paused"] == True
    assert r["status"] == "human"
    print(f"  [PASS] Paused: bot_paused=true, status=human")
    results.append(True)
except Exception as e:
    print(f"  [FAIL] {e}")
    results.append(False)

# TEST 4: pause_conversation - staff (should fail)
print("\n[TEST 4] pause_conversation - staff denied")
try:
    r = rpc("pause_conversation", {
        "p_conversation_id": conv_db_id,
        "p_clinic_id": CLINIC_ID,
        "p_user_role": "staff"
    })
    assert r["success"] == False, f"Expected success=false, got {r}"
    assert r["error_code"] == "PERMISSION_DENIED"
    print(f"  [PASS] Staff correctly denied: {r['error_code']}")
    results.append(True)
except Exception as e:
    print(f"  [FAIL] {e}")
    results.append(False)

# TEST 5: resume_conversation - admin
print("\n[TEST 5] resume_conversation - admin")
try:
    r = rpc("resume_conversation", {
        "p_conversation_id": conv_db_id,
        "p_clinic_id": CLINIC_ID,
        "p_user_role": "admin"
    })
    assert r["success"] == True
    assert r["bot_paused"] == False
    assert r["status"] == "active"
    print(f"  [PASS] Resumed: bot_paused=false, status=active")
    results.append(True)
except Exception as e:
    print(f"  [FAIL] {e}")
    results.append(False)

# TEST 6: assign_conversation - admin
print("\n[TEST 6] assign_conversation - admin")
try:
    user_id = str(uuid.uuid4())
    r = rpc("assign_conversation", {
        "p_conversation_id": conv_db_id,
        "p_clinic_id": CLINIC_ID,
        "p_assigned_user_id": user_id,
        "p_user_role": "admin"
    })
    assert r["success"] == True
    assert r["assigned_user_id"] == user_id
    print(f"  [PASS] Assigned to: {user_id[:8]}...")
    results.append(True)
except Exception as e:
    print(f"  [FAIL] {e}")
    results.append(False)

# TEST 7: close_conversation - admin
print("\n[TEST 7] close_conversation - admin")
try:
    r = rpc("close_conversation", {
        "p_conversation_id": conv_db_id,
        "p_clinic_id": CLINIC_ID,
        "p_user_role": "admin"
    })
    assert r["success"] == True
    assert r["status"] == "closed"
    print(f"  [PASS] Closed: status=closed")
    results.append(True)
except Exception as e:
    print(f"  [FAIL] {e}")
    results.append(False)

# TEST 8: conversation_events audit log
print("\n[TEST 8] conversation_events audit log")
try:
    events = query("conversation_events", {"conversation_id": conv_db_id})
    assert len(events) >= 4, f"Expected >=4 events, got {len(events)}"
    event_actions = [e.get("metadata", {}).get("action") for e in events]
    print(f"  [PASS] {len(events)} events: {event_actions}")
    results.append(True)
except Exception as e:
    print(f"  [FAIL] {e}")
    results.append(False)

# ============================================================
# N8N INTEGRATION TESTS
# ============================================================

print("\n" + "=" * 60)
print("N8N INTEGRATION TESTS")
print("=" * 60)

# TEST 9: Normal flow - bot active
print("\n[TEST 9] Normal flow - bot NOT paused")
try:
    test_conv = 88801
    send_webhook(test_conv, "Que servicios ofrecen?")
    exec_data = get_execution(18)
    assert exec_data is not None, "No execution found"

    run_data = exec_data.get("data", {}).get("resultData", {}).get("runData", {})
    bot_check_ran = any("Bot Pause Check" in n for n in run_data)
    classifier_ran = any("Clasificador" in n or "Pre-Clasificador" in n for n in run_data)

    assert bot_check_ran, "Bot Pause Check did not run"
    assert classifier_ran, "Classifier did not run - workflow stopped unexpectedly"

    # Verify no errors in Bot Pause Check
    for n in run_data:
        if "Bot Pause Check" in n:
            err = run_data[n][-1].get("error")
            assert err is None, f"Bot Pause Check error: {err}"

    print(f"  [PASS] Bot active - workflow continued ({len(run_data)} nodes)")
    results.append(True)
except Exception as e:
    print(f"  [FAIL] {e}")
    results.append(False)

# TEST 10: Paused flow - bot paused
print("\n[TEST 10] Paused flow - bot paused, workflow stops")
try:
    test_conv_paused = 88800 + int(time.time()) % 10000
    paused_chatwoot_id = str(test_conv_paused)

    # Create and pause the conversation
    conv_r = rpc("upsert_conversation", {
        "p_clinic_id": CLINIC_ID,
        "p_chatwoot_conversation_id": paused_chatwoot_id,
        "p_patient_name": "Paused Test",
        "p_last_message": "Initial"
    })
    paused_conv_id = conv_r[0]["conversation_id"]

    pause_r = rpc("pause_conversation", {
        "p_conversation_id": paused_conv_id,
        "p_clinic_id": CLINIC_ID,
        "p_user_role": "admin"
    })
    assert pause_r["success"] == True, f"Failed to pause: {pause_r}"

    # Send message to paused conversation
    send_webhook(test_conv_paused, "Quiero una cita")
    exec_data = get_execution(18)
    assert exec_data is not None, "No execution found"

    run_data = exec_data.get("data", {}).get("resultData", {}).get("runData", {})
    bot_check_ran = any("Bot Pause Check" in n for n in run_data)
    classifier_ran = any("Clasificador" in n or "Pre-Clasificador" in n for n in run_data)

    assert bot_check_ran, "Bot Pause Check did not run"
    assert not classifier_ran, f"Classifier ran but should have stopped! Nodes: {list(run_data.keys())}"

    print(f"  [PASS] Bot paused - workflow stopped ({len(run_data)} nodes executed)")
    results.append(True)
except Exception as e:
    print(f"  [FAIL] {e}")
    results.append(False)

# ============================================================
# SUMMARY
# ============================================================

print("\n" + "=" * 60)
print("TEST SUMMARY")
print("=" * 60)

passed = sum(results)
total = len(results)
pct = (passed / total * 100) if total > 0 else 0

for i, (passed_test, label) in enumerate(zip(results, [
    "upsert_conversation", "list_conversations",
    "pause (admin)", "pause (staff denied)",
    "resume (admin)", "assign (admin)",
    "close (admin)", "audit log",
    "n8n: bot active", "n8n: bot paused"
])):
    mark = "PASS" if passed_test else "FAIL"
    print(f"  [{mark}] Test {i+1}: {label}")

print(f"\nResults: {passed}/{total} ({pct:.0f}%)")
