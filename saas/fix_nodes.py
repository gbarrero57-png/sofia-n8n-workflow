#!/usr/bin/env python3
"""Fix all Supabase Code nodes with correct $json references"""
import json, requests

N8N_BASE_URL = "https://workflows.n8n.redsolucionesti.com"
N8N_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNzY4NTgyLCJleHAiOjE3NzMyODgwMDF9.Z3vHmfdFzKFXzVgGVxoxIuX9VDsuepcFC_9wJiK7EyM"
WORKFLOW_ID = "37SLdWISQLgkHeXk"

SUPABASE_URL = "https://inhyrrjidhzrbqecnptn.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluaHlycmppZGh6cmJxZWNucHRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwNzU3NSwiZXhwIjoyMDg2NTgzNTc1fQ.-YwX0Qf4Gn8MdjFbLxCYuCJV1OzWl2qWWk4hKuU6z7k"
CLINIC_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"

# Download workflow
wf = requests.get(f"{N8N_BASE_URL}/api/v1/workflows/{WORKFLOW_ID}",
    headers={"X-N8N-API-KEY": N8N_API_KEY}).json()

# ============================================================
# Node code definitions (using raw strings to preserve $json)
# ============================================================

RESOLVER_CODE = (
    '// Resolve clinic from Chatwoot inbox\n'
    'const SUPABASE_URL = "' + SUPABASE_URL + '";\n'
    'const SERVICE_KEY = "' + SERVICE_KEY + '";\n'
    '\n'
    'const inboxId = $json.inbox_id || 2;\n'
    'const accountId = $json.account_id || 2;\n'
    '\n'
    'const response = await fetch(SUPABASE_URL + "/rest/v1/rpc/resolve_clinic", {\n'
    '    method: "POST",\n'
    '    headers: {\n'
    '        "apikey": SERVICE_KEY,\n'
    '        "Authorization": "Bearer " + SERVICE_KEY,\n'
    '        "Content-Type": "application/json"\n'
    '    },\n'
    '    body: JSON.stringify({\n'
    '        p_inbox_id: inboxId,\n'
    '        p_account_id: accountId\n'
    '    })\n'
    '});\n'
    '\n'
    'const results = await response.json();\n'
    'const input = $input.item.json;\n'
    'return [{ json: Object.assign({}, input, { _clinic_response: results }) }];'
)

MERGE_CODE = (
    '// Merge clinic data into conversation flow\n'
    'const clinicResponse = $json._clinic_response;\n'
    'const clinicData = Array.isArray(clinicResponse) ? clinicResponse[0] : clinicResponse;\n'
    '\n'
    'const data = Object.assign({}, $json);\n'
    'delete data._clinic_response;\n'
    '\n'
    'if (!clinicData || !clinicData.clinic_id) {\n'
    '    data.clinic_id = "' + CLINIC_ID + '";\n'
    '    data.clinic_name = "Default Clinic";\n'
    '    data.calendar_id = "family00280432052323677917@group.calendar.google.com";\n'
    '    data.timezone = "America/Lima";\n'
    '    data.bot_config = {};\n'
    '    return [{ json: data }];\n'
    '}\n'
    '\n'
    'data.clinic_id = clinicData.clinic_id;\n'
    'data.clinic_name = clinicData.clinic_name;\n'
    'data.calendar_id = clinicData.calendar_id;\n'
    'data.timezone = clinicData.timezone || "America/Lima";\n'
    'data.bot_config = clinicData.bot_config || {};\n'
    'return [{ json: data }];'
)

BUSCAR_KB_CODE = (
    '// Search Knowledge Base in Supabase\n'
    'const SUPABASE_URL = "' + SUPABASE_URL + '";\n'
    'const SERVICE_KEY = "' + SERVICE_KEY + '";\n'
    '\n'
    'const clinicId = $json.clinic_id || "' + CLINIC_ID + '";\n'
    'const query = $json.message_text || "";\n'
    '\n'
    'const response = await fetch(SUPABASE_URL + "/rest/v1/rpc/search_knowledge_base", {\n'
    '    method: "POST",\n'
    '    headers: {\n'
    '        "apikey": SERVICE_KEY,\n'
    '        "Authorization": "Bearer " + SERVICE_KEY,\n'
    '        "Content-Type": "application/json"\n'
    '    },\n'
    '    body: JSON.stringify({\n'
    '        p_clinic_id: clinicId,\n'
    '        p_query: query,\n'
    '        p_limit: 5\n'
    '    })\n'
    '});\n'
    '\n'
    'const results = await response.json();\n'
    'const data = Object.assign({}, $json, { kb_results: results, kb_status: response.status });\n'
    'return [{ json: data }];'
)

CONTEXTO_KB_CODE = (
    '// Format KB results for LLM\n'
    'const prevData = Object.assign({}, $json);\n'
    'const results = prevData.kb_results || [];\n'
    '\n'
    'if (!results || results.length === 0) {\n'
    '    prevData.kb_context = "No se encontro informacion especifica. Sugiere contactar directamente a la clinica.";\n'
    '    prevData.kb_found = false;\n'
    '    return [{ json: prevData }];\n'
    '}\n'
    '\n'
    'const context = results\n'
    '    .map(r => "P: " + r.question + "\\nR: " + r.answer)\n'
    '    .join("\\n\\n");\n'
    '\n'
    'prevData.kb_context = context;\n'
    'prevData.kb_found = true;\n'
    'prevData.kb_results_count = results.length;\n'
    'return [{ json: prevData }];'
)

GUARDAR_CITA_CODE = (
    '// Save appointment to Supabase\n'
    'const SUPABASE_URL = "' + SUPABASE_URL + '";\n'
    'const SERVICE_KEY = "' + SERVICE_KEY + '";\n'
    '\n'
    'const body = {\n'
    '    clinic_id: $json.clinic_id || "' + CLINIC_ID + '",\n'
    '    conversation_id: $json.conversation_id || 0,\n'
    '    patient_name: $json.sender_name || "Paciente",\n'
    '    phone: $json.contact_phone || "",\n'
    '    service: "Consulta dental",\n'
    '    start_time: $json.start || new Date().toISOString(),\n'
    '    end_time: $json.end || new Date(Date.now() + 3600000).toISOString(),\n'
    '    calendar_event_id: $json.id || "unknown",\n'
    '    status: "scheduled"\n'
    '};\n'
    '\n'
    'try {\n'
    '    const response = await fetch(SUPABASE_URL + "/rest/v1/appointments", {\n'
    '        method: "POST",\n'
    '        headers: {\n'
    '            "apikey": SERVICE_KEY,\n'
    '            "Authorization": "Bearer " + SERVICE_KEY,\n'
    '            "Content-Type": "application/json",\n'
    '            "Prefer": "return=representation"\n'
    '        },\n'
    '        body: JSON.stringify(body)\n'
    '    });\n'
    '    const result = await response.json();\n'
    '    return [{ json: Object.assign({}, $json, { appointment_saved: true }) }];\n'
    '} catch(e) {\n'
    '    return [{ json: Object.assign({}, $json, { appointment_saved: false, appointment_error: e.message }) }];\n'
    '}'
)

METRICA_CODE = (
    '// Log conversation metric to Supabase\n'
    'const SUPABASE_URL = "' + SUPABASE_URL + '";\n'
    'const SERVICE_KEY = "' + SERVICE_KEY + '";\n'
    '\n'
    'try {\n'
    '    await fetch(SUPABASE_URL + "/rest/v1/rpc/upsert_conversation_metric", {\n'
    '        method: "POST",\n'
    '        headers: {\n'
    '            "apikey": SERVICE_KEY,\n'
    '            "Authorization": "Bearer " + SERVICE_KEY,\n'
    '            "Content-Type": "application/json"\n'
    '        },\n'
    '        body: JSON.stringify({\n'
    '            p_clinic_id: $json.clinic_id || "' + CLINIC_ID + '",\n'
    '            p_conversation_id: $json.conversation_id || 0,\n'
    '            p_intent: $json.intent || "UNKNOWN",\n'
    '            p_escalated: $json.should_escalate || false,\n'
    '            p_booked: $json.booked || false,\n'
    '            p_phase_reached: $json.phase_reached || 1\n'
    '        })\n'
    '    });\n'
    '} catch(e) {\n'
    '    // Silent fail - dont block conversation flow\n'
    '}\n'
    '\n'
    'return [{ json: $json }];'
)

# ============================================================
# Apply fixes
# ============================================================

node_fixes = {
    'Resolver Clinica': RESOLVER_CODE,
    'Merge Clinic Data': MERGE_CODE,
    'Buscar Knowledge Base': BUSCAR_KB_CODE,
    'Preparar Contexto KB': CONTEXTO_KB_CODE,
    'Guardar Cita Supabase': GUARDAR_CITA_CODE,
    'Registrar Metrica': METRICA_CODE,
}

fixed = 0
for i, node in enumerate(wf['nodes']):
    if node['name'] in node_fixes:
        wf['nodes'][i]['parameters']['jsCode'] = node_fixes[node['name']]
        print(f"[OK] Fixed: {node['name']}")
        fixed += 1

print(f"\nFixed {fixed} nodes")

# Upload
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
    print(f"\n[OK] Workflow updated: {len(r.json().get('nodes', []))} nodes")
else:
    print(f"\n[ERROR] {r.status_code}: {r.text[:500]}")
