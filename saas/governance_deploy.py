#!/usr/bin/env python3
"""Deploy Bot Pause Check node to Sofia n8n workflow"""
import json, requests, sys
sys.stdout.reconfigure(encoding='utf-8')

N8N_BASE_URL = "https://workflows.n8n.redsolucionesti.com"
N8N_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNzY4NTgyLCJleHAiOjE3NzMyODgwMDF9.Z3vHmfdFzKFXzVgGVxoxIuX9VDsuepcFC_9wJiK7EyM"
WORKFLOW_ID = "37SLdWISQLgkHeXk"

SUPABASE_URL = "https://inhyrrjidhzrbqecnptn.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluaHlycmppZGh6cmJxZWNucHRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwNzU3NSwiZXhwIjoyMDg2NTgzNTc1fQ.-YwX0Qf4Gn8MdjFbLxCYuCJV1OzWl2qWWk4hKuU6z7k"

# Bot Pause Check node JavaScript code
# Uses string concatenation to preserve $json references
BOT_PAUSE_CODE = (
    '// ============================================\n'
    '// BOT PAUSE CHECK - Conversation Governance\n'
    '// Upserts conversation record, checks bot_paused.\n'
    '// If paused: returns [] to stop workflow.\n'
    '// ============================================\n'
    '\n'
    'const DEFAULT_CLINIC = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";\n'
    'const rawClinicId = $json.clinic_id;\n'
    '// Use default clinic if clinic_id is not a valid UUID\n'
    'const isUUID = rawClinicId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawClinicId);\n'
    'const clinicId = isUUID ? rawClinicId : DEFAULT_CLINIC;\n'
    'const conversationId = String($json.conversation_id || 0);\n'
    'const patientName = $json.sender_name || "Paciente";\n'
    'const messageText = ($json.message_text || "").substring(0, 500);\n'
    '\n'
    'const SUPABASE_URL = "' + SUPABASE_URL + '";\n'
    'const SERVICE_KEY = "' + SERVICE_KEY + '";\n'
    '\n'
    'let result;\n'
    'try {\n'
    '    result = await this.helpers.httpRequest({\n'
    '        method: "POST",\n'
    '        url: SUPABASE_URL + "/rest/v1/rpc/upsert_conversation",\n'
    '        headers: {\n'
    '            "apikey": SERVICE_KEY,\n'
    '            "Authorization": "Bearer " + SERVICE_KEY,\n'
    '            "Content-Type": "application/json"\n'
    '        },\n'
    '        body: {\n'
    '            p_clinic_id: clinicId,\n'
    '            p_chatwoot_conversation_id: conversationId,\n'
    '            p_patient_name: patientName,\n'
    '            p_last_message: messageText\n'
    '        },\n'
    '        json: true\n'
    '    });\n'
    '} catch(e) {\n'
    '    // On error, allow bot to continue (fail open)\n'
    '    return [{ json: { ...$json, governance_checked: false, governance_error: e.message } }];\n'
    '}\n'
    '\n'
    'const conversation = Array.isArray(result) ? result[0] : result;\n'
    '\n'
    '// If bot is paused, stop execution\n'
    'if (conversation && conversation.bot_paused === true) {\n'
    '    return [];\n'
    '}\n'
    '\n'
    '// Bot active - continue with governance data\n'
    'return [{ json: {\n'
    '    ...$json,\n'
    '    governance_conversation_id: conversation ? conversation.conversation_id : null,\n'
    '    governance_status: conversation ? conversation.status : "active",\n'
    '    governance_checked: true\n'
    '} }];\n'
)

print("=" * 60)
print("Governance Deploy - Bot Pause Check Node")
print("=" * 60)

# 1. Download workflow
print("\n1. Downloading workflow...")
wf = requests.get(f"{N8N_BASE_URL}/api/v1/workflows/{WORKFLOW_ID}",
    headers={"X-N8N-API-KEY": N8N_API_KEY}).json()
print(f"   {wf['name']}: {len(wf['nodes'])} nodes")

# 2. Backup
backup_file = "workflow_backup_pre_governance.json"
with open(backup_file, 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)
print(f"   Backup: {backup_file}")

# 3. Check if node already exists
existing = [n for n in wf['nodes'] if n['name'] == 'Bot Pause Check']
if existing:
    print("\n   Bot Pause Check node already exists - updating code...")
    for i, node in enumerate(wf['nodes']):
        if node['name'] == 'Bot Pause Check':
            wf['nodes'][i]['parameters']['jsCode'] = BOT_PAUSE_CODE
            break
else:
    # Find Resolver Clinica position to place new node nearby
    resolver = None
    for n in wf['nodes']:
        if n['name'] == 'Resolver Clinica':
            resolver = n
            break

    pos_x = resolver['position'][0] + 220 if resolver else 656
    pos_y = resolver['position'][1] if resolver else 376

    new_node = {
        "parameters": {
            "jsCode": BOT_PAUSE_CODE
        },
        "name": "Bot Pause Check",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [pos_x, pos_y]
    }
    wf['nodes'].append(new_node)
    print(f"\n2. Added Bot Pause Check node at [{pos_x}, {pos_y}]")

# 4. Update connections: insert between Resolver Clinica and its next node
print("\n3. Updating connections...")
conns = wf['connections']

# Find what Resolver Clinica currently connects to
resolver_conns = conns.get('Resolver Clinica', {}).get('main', [[]])
if resolver_conns and resolver_conns[0]:
    next_node = resolver_conns[0][0]['node']
    print(f"   Current: Resolver Clinica -> {next_node}")

    # Resolver Clinica -> Bot Pause Check
    conns['Resolver Clinica'] = {
        'main': [[{'node': 'Bot Pause Check', 'type': 'main', 'index': 0}]]
    }

    # Bot Pause Check -> original next node
    conns['Bot Pause Check'] = {
        'main': [[{'node': next_node, 'type': 'main', 'index': 0}]]
    }

    print(f"   New: Resolver Clinica -> Bot Pause Check -> {next_node}")
else:
    print("   WARNING: Resolver Clinica has no connections - setting up manually")
    conns['Resolver Clinica'] = {
        'main': [[{'node': 'Bot Pause Check', 'type': 'main', 'index': 0}]]
    }
    conns['Bot Pause Check'] = {
        'main': [[{'node': 'Merge Clinic Data', 'type': 'main', 'index': 0}]]
    }

# 5. Upload
print("\n4. Uploading modified workflow...")
wf_update = {
    'name': wf['name'],
    'nodes': wf['nodes'],
    'connections': wf['connections'],
    'settings': wf.get('settings', {}),
    'staticData': wf.get('staticData')
}

r = requests.put(f"{N8N_BASE_URL}/api/v1/workflows/{WORKFLOW_ID}",
    headers={"X-N8N-API-KEY": N8N_API_KEY, "Content-Type": "application/json"},
    json=wf_update)

if r.status_code == 200:
    result = r.json()
    print(f"   [OK] Upload successful: {len(result['nodes'])} nodes")

    # Save deployed workflow
    with open("workflow_governance_deployed.json", 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
else:
    print(f"   [ERROR] {r.status_code}: {r.text[:300]}")
    sys.exit(1)

print(f"\n{'='*60}")
print("DEPLOYMENT COMPLETE")
print(f"{'='*60}")
print(f"\nWorkflow: {WORKFLOW_ID}")
print(f"Nodes: {len(result['nodes'])}")
print(f"Flow: Resolver Clinica -> Bot Pause Check -> ...")
print(f"\nRevert backup: {backup_file}")
