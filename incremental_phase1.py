#!/usr/bin/env python3
"""
Incremental Phase 1 - Add changes one at a time
"""
import json
import subprocess
import time

API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwMzk4NTcxLCJleHAiOjE3NzI5NDYwMDB9.7IrAZwg1Q4I3nwv0Ww1QBkXrR24EE0Oc_UMRu8v1z5g"
WORKFLOW_ID = "37SLdWISQLgkHeXk"
BASE_URL = "https://workflows.n8n.redsolucionesti.com"

def upload_and_test(filename, description):
    """Upload workflow and test if it works"""
    print(f"\n[TEST] {description}")

    # Upload
    cmd = f'curl -s -X PUT "{BASE_URL}/api/v1/workflows/{WORKFLOW_ID}" -H "X-N8N-API-KEY: {API_KEY}" -H "Content-Type: application/json" -d @{filename}'
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)

    if "unauthorized" in result.stdout:
        print("  [ERROR] API unauthorized")
        return False

    try:
        data = json.loads(result.stdout)
        nodes = len(data.get('nodes', []))
        print(f"  Uploaded: {nodes} nodes")
    except:
        print(f"  [ERROR] Upload failed")
        return False

    # Test with a simple webhook call
    time.sleep(2)
    test_cmd = f'curl -s -X POST "{BASE_URL}/webhook/chatwoot-sofia" -H "Content-Type: application/json" -d @test_a_precios_real.json'
    subprocess.run(test_cmd, shell=True, capture_output=True)

    time.sleep(5)

    # Check execution
    exec_cmd = f'curl -s "{BASE_URL}/api/v1/executions?workflowId={WORKFLOW_ID}&limit=1" -H "X-N8N-API-KEY: {API_KEY}"'
    exec_result = subprocess.run(exec_cmd, shell=True, capture_output=True, text=True)

    try:
        exec_data = json.loads(exec_result.stdout)
        latest = exec_data['data'][0]
        status = latest['status']

        if status == 'error':
            # Check if it's validation error
            exec_id = latest["id"]
            exec_detail_cmd = f'curl -s "{BASE_URL}/api/v1/executions/{exec_id}?includeData=true" -H "X-N8N-API-KEY: {API_KEY}"'
            detail_result = subprocess.run(exec_detail_cmd, shell=True, capture_output=True, text=True)
            detail_data = json.loads(detail_result.stdout)
            error_msg = detail_data.get('data', {}).get('resultData', {}).get('error', {}).get('message', '')

            if 'workflow has issues' in error_msg:
                print(f"  [FAIL] Validation error")
                return False
            else:
                print(f"  [PASS] Executes (runtime error: {error_msg[:50]}...)")
                return True
        else:
            print(f"  [PASS] Status: {status}")
            return True
    except:
        print(f"  [ERROR] Could not check execution")
        return False

# Load baseline
with open('wf_http_WORKING.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

print("Starting incremental Phase 1 build...")
print(f"Baseline: {len(wf['nodes'])} nodes")

# STEP 1: Add Router node only (no connections yet)
router_node = {
    "parameters": {
        "mode": "expression",
        "output": "input",
        "rules": {
            "rules": [
                {"id": "1", "outputKey": "0", "conditions": [{"leftValue": "={{ $json.intent }}", "rightValue": "CREATE_EVENT", "operator": {"type": "string", "operation": "equals"}}]},
                {"id": "2", "outputKey": "1", "conditions": [{"leftValue": "={{ $json.intent }}", "rightValue": "INFO", "operator": {"type": "string", "operation": "equals"}}]},
                {"id": "3", "outputKey": "2", "conditions": [{"leftValue": "={{ $json.intent }}", "rightValue": "PAYMENT", "operator": {"type": "string", "operation": "equals"}}]}
            ],
            "options": {"fallbackOutput": "3"}
        }
    },
    "id": "switch-router",
    "name": "Router de Intención",
    "type": "n8n-nodes-base.switch",
    "typeVersion": 3,
    "position": [1904, 288]
}

wf['nodes'].append(router_node)

with open('step1_router_only.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

if not upload_and_test('step1_router_only.json', 'Router node added (no connections)'):
    print("\n[CRITICAL] Router node itself causes validation error!")
    print("Investigating Router node structure...")
    exit(1)

print("\n[SUCCESS] Router node is valid!")
print("Proceeding with connection changes...")
