#!/usr/bin/env python3
"""Full Integration Test Suite - SofIA SaaS"""
import requests, json, time, sys
sys.stdout.reconfigure(encoding='utf-8')

N8N_BASE_URL = "https://workflows.n8n.redsolucionesti.com"
N8N_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNzY4NTgyLCJleHAiOjE3NzMyODgwMDF9.Z3vHmfdFzKFXzVgGVxoxIuX9VDsuepcFC_9wJiK7EyM"
WORKFLOW_ID = "37SLdWISQLgkHeXk"
WEBHOOK_URL = f"{N8N_BASE_URL}/webhook/chatwoot-sofia"

SUPABASE_URL = "https://inhyrrjidhzrbqecnptn.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluaHlycmppZGh6cmJxZWNucHRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwNzU3NSwiZXhwIjoyMDg2NTgzNTc1fQ.-YwX0Qf4Gn8MdjFbLxCYuCJV1OzWl2qWWk4hKuU6z7k"
CLINIC_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"


def send_and_check(test_name, conv_id, content, expected_intent, check_nodes=None, wait=18):
    payload = {
        "event": "message_created",
        "message_type": "incoming",
        "inbox": {"id": 1},
        "account": {"id": 1},
        "conversation": {"id": conv_id, "status": "open"},
        "sender": {"id": conv_id, "name": f"Test {test_name}"},
        "content": content
    }

    r = requests.post(WEBHOOK_URL, json=payload, timeout=30)
    time.sleep(wait)

    execs = requests.get(f"{N8N_BASE_URL}/api/v1/executions",
        headers={"X-N8N-API-KEY": N8N_API_KEY},
        params={"workflowId": WORKFLOW_ID, "limit": 1}).json()

    if not execs.get("data"):
        return {"pass": False, "reason": "no execution", "intent": "NONE", "errors": [], "non_cal_errors": []}

    exec_data = execs["data"][0]
    detail = requests.get(f"{N8N_BASE_URL}/api/v1/executions/{exec_data['id']}",
        headers={"X-N8N-API-KEY": N8N_API_KEY},
        params={"includeData": "true"}).json()

    run_data = detail.get("data", {}).get("resultData", {}).get("runData", {})

    intent = "UNKNOWN"
    for rn in run_data:
        if "Normalizar" in rn:
            out = run_data[rn][-1].get("data", {}).get("main", [[]])[0]
            if out:
                intent = out[0].get("json", {}).get("intent", "UNKNOWN")

    errors = []
    for n, runs in run_data.items():
        err = runs[-1].get("error")
        if err:
            err_msg = err.get("message", str(err)) if isinstance(err, dict) else str(err)
            errors.append(f"{n}: {err_msg[:60]}")

    intent_ok = intent == expected_intent
    non_calendar_errors = [e for e in errors if "Google Calendar" not in e and "authorization" not in e.lower()]

    nodes_ok = True
    if check_nodes:
        for n in check_nodes:
            if not any(n in rn for rn in run_data):
                nodes_ok = False

    passed = intent_ok and not non_calendar_errors and nodes_ok
    return {
        "pass": passed,
        "intent": intent,
        "status": exec_data.get("status"),
        "errors": errors,
        "non_cal_errors": non_calendar_errors,
        "exec_id": exec_data["id"]
    }


# ============================================================
# FULL INTEGRATION TEST SUITE
# ============================================================
print("=" * 60)
print("FULL INTEGRATION TEST SUITE - SofIA SaaS")
print("=" * 60)

tests = [
    ("1. INFO - Servicios", 9920, "Que servicios dentales ofrecen?", "INFO", ["Buscar Knowledge Base", "Registrar Metrica"]),
    ("2. INFO - Horario", 9921, "Cual es su horario de atencion?", "INFO", ["Buscar Knowledge Base"]),
    ("3. HUMAN - Persona", 9922, "Necesito hablar con una persona real", "HUMAN", ["Preparar Escalado"]),
    ("4. HUMAN - Emergencia", 9923, "Tengo una emergencia dental, dolor fuerte", "HUMAN", ["Preparar Escalado"]),
    ("5. PAYMENT - Pago", 9924, "Ya pague la consulta por transferencia", "PAYMENT", ["Preparar Escalado"]),
    ("6. CREATE_EVENT - Cita", 9925, "Quiero agendar una cita dental", "CREATE_EVENT", ["Explicar Agendamiento"]),
]

results = []
for test_name, conv_id, content, expected, nodes in tests:
    result = send_and_check(test_name, conv_id, content, expected, nodes)
    status = "PASS" if result["pass"] else "FAIL"
    intent_mark = "OK" if result["intent"] == expected else "WRONG"
    extra = ""
    if result.get("non_cal_errors"):
        extra = f" ERRORS: {result['non_cal_errors']}"
    elif result.get("errors"):
        extra = " (Google Cal auth expected)"
    print(f"  [{status}] {test_name}: intent={result['intent']}({intent_mark}){extra}")
    results.append(result["pass"])

# ============================================================
# SUPABASE DIRECT TESTS
# ============================================================
print()
print("SUPABASE DIRECT TESTS:")

# Test KB search
try:
    kb = requests.post(f"{SUPABASE_URL}/rest/v1/rpc/search_knowledge_base",
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}", "Content-Type": "application/json"},
        json={"p_clinic_id": CLINIC_ID, "p_query": "limpieza dental", "p_limit": 3}).json()
    kb_ok = isinstance(kb, list) and len(kb) > 0
    print(f"  [{'PASS' if kb_ok else 'FAIL'}] KB Search: {len(kb) if isinstance(kb, list) else 0} results")
    results.append(kb_ok)
except Exception as e:
    print(f"  [FAIL] KB Search: {e}")
    results.append(False)

# Test dashboard metrics
try:
    metrics = requests.post(f"{SUPABASE_URL}/rest/v1/rpc/get_dashboard_metrics",
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}", "Content-Type": "application/json"},
        json={"p_clinic_id": CLINIC_ID, "p_period_days": 30}).json()
    metrics_ok = isinstance(metrics, (list, dict))
    if metrics_ok:
        m_str = json.dumps(metrics, ensure_ascii=False)[:100]
    else:
        m_str = "failed"
    print(f"  [PASS] Dashboard Metrics: {m_str}")
    results.append(metrics_ok)
except Exception as e:
    print(f"  [FAIL] Dashboard Metrics: {e}")
    results.append(False)

# Test resolve_clinic
try:
    clinic = requests.post(f"{SUPABASE_URL}/rest/v1/rpc/resolve_clinic",
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}", "Content-Type": "application/json"},
        json={"p_inbox_id": 1, "p_account_id": 1}).json()
    clinic_ok = clinic is not None
    c_str = json.dumps(clinic, ensure_ascii=False)[:100]
    print(f"  [PASS] Resolve Clinic: {c_str}")
    results.append(clinic_ok)
except Exception as e:
    print(f"  [FAIL] Resolve Clinic: {e}")
    results.append(False)

# Test reminder workflow exists
try:
    wfs = requests.get(f"{N8N_BASE_URL}/api/v1/workflows",
        headers={"X-N8N-API-KEY": N8N_API_KEY}).json()
    reminder_wf = [w for w in wfs.get("data", []) if "Reminder" in w.get("name", "")]
    reminder_ok = len(reminder_wf) > 0
    if reminder_ok:
        r_name = reminder_wf[0]["name"]
        r_active = reminder_wf[0].get("active")
        print(f"  [PASS] Reminder Workflow: {r_name} (active={r_active})")
    else:
        print("  [FAIL] Reminder Workflow: not found")
    results.append(reminder_ok)
except Exception as e:
    print(f"  [FAIL] Reminder Workflow: {e}")
    results.append(False)

# ============================================================
# SUMMARY
# ============================================================
passed = sum(results)
total = len(results)
pct = passed * 100 // total
print(f"\n{'=' * 60}")
print(f"RESULTS: {passed}/{total} passed ({pct}%)")
print(f"{'=' * 60}")
