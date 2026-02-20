#!/usr/bin/env python3
"""
SofIA SaaS - Workflow Deployer
Modifies the existing n8n workflow to integrate Supabase multi-clinic architecture.
"""

import json
import requests
import sys
import os
import copy

# ============================================================
# CONFIGURATION
# ============================================================

N8N_BASE_URL = "https://workflows.n8n.redsolucionesti.com"
N8N_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNzY4NTgyLCJleHAiOjE3NzMyODgwMDF9.Z3vHmfdFzKFXzVgGVxoxIuX9VDsuepcFC_9wJiK7EyM"
WORKFLOW_ID = "37SLdWISQLgkHeXk"

SUPABASE_URL = "https://inhyrrjidhzrbqecnptn.supabase.co"
SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluaHlycmppZGh6cmJxZWNucHRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwNzU3NSwiZXhwIjoyMDg2NTgzNTc1fQ.-YwX0Qf4Gn8MdjFbLxCYuCJV1OzWl2qWWk4hKuU6z7k"

CLINIC_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"


def get_workflow():
    """Download current workflow from n8n"""
    r = requests.get(
        f"{N8N_BASE_URL}/api/v1/workflows/{WORKFLOW_ID}",
        headers={"X-N8N-API-KEY": N8N_API_KEY}
    )
    if r.status_code == 200:
        return r.json()
    raise Exception(f"Failed to get workflow: {r.status_code} {r.text}")


def upload_workflow(wf):
    """Upload modified workflow to n8n"""
    wf_update = {
        'name': wf['name'],
        'nodes': wf['nodes'],
        'connections': wf['connections'],
        'settings': wf.get('settings', {}),
        'staticData': wf.get('staticData')
    }
    r = requests.put(
        f"{N8N_BASE_URL}/api/v1/workflows/{WORKFLOW_ID}",
        headers={"X-N8N-API-KEY": N8N_API_KEY, "Content-Type": "application/json"},
        json=wf_update
    )
    if r.status_code == 200:
        return r.json()
    raise Exception(f"Failed to upload workflow: {r.status_code} {r.text}")


def find_node(wf, name):
    """Find a node by name"""
    for node in wf['nodes']:
        if node['name'] == name:
            return node
    return None


def add_node(wf, node):
    """Add a node to the workflow"""
    existing = find_node(wf, node['name'])
    if existing:
        # Replace existing
        wf['nodes'] = [n for n in wf['nodes'] if n['name'] != node['name']]
    wf['nodes'].append(node)


def set_connection(wf, from_node, to_node, from_output=0, to_input=0):
    """Set a connection between nodes"""
    conns = wf['connections']
    if from_node not in conns:
        conns[from_node] = {'main': []}

    # Ensure enough output slots
    while len(conns[from_node]['main']) <= from_output:
        conns[from_node]['main'].append([])

    # Replace connections at this output
    conns[from_node]['main'][from_output] = [{
        'node': to_node,
        'type': 'main',
        'index': to_input
    }]


def append_connection(wf, from_node, to_node, from_output=0, to_input=0):
    """Append a connection without removing existing ones"""
    conns = wf['connections']
    if from_node not in conns:
        conns[from_node] = {'main': []}

    while len(conns[from_node]['main']) <= from_output:
        conns[from_node]['main'].append([])

    conns[from_node]['main'][from_output].append({
        'node': to_node,
        'type': 'main',
        'index': to_input
    })


# ============================================================
# NEW NODES
# ============================================================

def create_resolver_clinica_node(pos):
    """Node: Resolve clinic from Chatwoot inbox_id"""
    return {
        "parameters": {
            "method": "POST",
            "url": f"{SUPABASE_URL}/rest/v1/rpc/resolve_clinic",
            "sendHeaders": True,
            "headerParameters": {
                "parameters": [
                    {"name": "apikey", "value": SUPABASE_SERVICE_KEY},
                    {"name": "Authorization", "value": f"Bearer {SUPABASE_SERVICE_KEY}"},
                    {"name": "Content-Type", "value": "application/json"}
                ]
            },
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": '={{ JSON.stringify({ "p_inbox_id": $json.inbox_id, "p_account_id": $json.account_id }) }}',
            "options": {}
        },
        "id": "http-resolve-clinic",
        "name": "Resolver Clinica",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [pos[0], pos[1]]
    }


def create_merge_clinic_node(pos):
    """Node: Merge clinic data into flow"""
    code = """// Merge clinic data into conversation flow
const clinicResponse = $input.item.json;
const clinicData = Array.isArray(clinicResponse) ? clinicResponse[0] : clinicResponse;
const prevData = $node['Validar Input'].json;

if (!clinicData || !clinicData.clinic_id) {
    // Fallback: use default clinic
    return [{
        json: {
            ...prevData,
            clinic_id: '""" + CLINIC_ID + """',
            clinic_name: 'Default Clinic',
            calendar_id: prevData.calendar_id || 'family00280432052323677917@group.calendar.google.com',
            timezone: 'America/Lima',
            bot_config: { max_bot_interactions: 3, business_hours_start: 8, business_hours_end: 22 }
        }
    }];
}

return [{
    json: {
        ...prevData,
        clinic_id: clinicData.clinic_id,
        clinic_name: clinicData.clinic_name,
        calendar_id: clinicData.calendar_id,
        timezone: clinicData.timezone || 'America/Lima',
        bot_config: clinicData.bot_config || {}
    }
}];"""

    return {
        "parameters": {"jsCode": code},
        "id": "code-merge-clinic",
        "name": "Merge Clinic Data",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [pos[0], pos[1]]
    }


def create_buscar_kb_node(pos):
    """Node: Search knowledge base in Supabase"""
    return {
        "parameters": {
            "method": "POST",
            "url": f"{SUPABASE_URL}/rest/v1/rpc/search_knowledge_base",
            "sendHeaders": True,
            "headerParameters": {
                "parameters": [
                    {"name": "apikey", "value": SUPABASE_SERVICE_KEY},
                    {"name": "Authorization", "value": f"Bearer {SUPABASE_SERVICE_KEY}"},
                    {"name": "Content-Type", "value": "application/json"}
                ]
            },
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": '={{ JSON.stringify({ "p_clinic_id": $json.clinic_id, "p_query": $json.message_text, "p_limit": 5 }) }}',
            "options": {}
        },
        "id": "http-search-kb",
        "name": "Buscar Knowledge Base",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [pos[0], pos[1]]
    }


def create_preparar_contexto_kb_node(pos):
    """Node: Format KB results for LLM prompt"""
    code = """// Format KB results for LLM
const items = $input.all();
const prevData = $('Merge Clinic Data').first().json;
const message = prevData.message_text;

// Handle array response from Supabase
let results = [];
if (items.length === 1 && Array.isArray(items[0].json)) {
    results = items[0].json;
} else {
    results = items.map(i => i.json).filter(r => r.question);
}

if (!results || results.length === 0) {
    return [{
        json: {
            ...prevData,
            kb_context: 'No se encontro informacion especifica sobre esa consulta. Sugiere contactar directamente a la clinica.',
            kb_found: false
        }
    }];
}

const context = results
    .map(r => `P: ${r.question}\\nR: ${r.answer}`)
    .join('\\n\\n');

return [{
    json: {
        ...prevData,
        kb_context: context,
        kb_found: true,
        kb_results_count: results.length
    }
}];"""

    return {
        "parameters": {"jsCode": code},
        "id": "code-preparar-kb",
        "name": "Preparar Contexto KB",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [pos[0], pos[1]]
    }


def create_guardar_cita_node(pos):
    """Node: Save appointment to Supabase after Google Calendar event"""
    return {
        "parameters": {
            "method": "POST",
            "url": f"{SUPABASE_URL}/rest/v1/appointments",
            "sendHeaders": True,
            "headerParameters": {
                "parameters": [
                    {"name": "apikey", "value": SUPABASE_SERVICE_KEY},
                    {"name": "Authorization", "value": f"Bearer {SUPABASE_SERVICE_KEY}"},
                    {"name": "Content-Type", "value": "application/json"},
                    {"name": "Prefer", "value": "return=representation"}
                ]
            },
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": '={{ JSON.stringify({ "clinic_id": $json.clinic_id || "' + CLINIC_ID + '", "conversation_id": $json.conversation_id, "patient_name": $json.sender_name || "Paciente", "phone": $json.contact_phone || "", "service": "Consulta dental", "start_time": $json.start || $json.iCalUID ? undefined : new Date().toISOString(), "end_time": $json.end || new Date(Date.now() + 3600000).toISOString(), "calendar_event_id": $json.id || "unknown", "status": "scheduled" }) }}',
            "options": {}
        },
        "id": "http-guardar-cita",
        "name": "Guardar Cita Supabase",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [pos[0], pos[1]]
    }


def create_registrar_metrica_node(pos, node_id, name):
    """Node: Log conversation metric to Supabase"""
    return {
        "parameters": {
            "method": "POST",
            "url": f"{SUPABASE_URL}/rest/v1/rpc/upsert_conversation_metric",
            "sendHeaders": True,
            "headerParameters": {
                "parameters": [
                    {"name": "apikey", "value": SUPABASE_SERVICE_KEY},
                    {"name": "Authorization", "value": f"Bearer {SUPABASE_SERVICE_KEY}"},
                    {"name": "Content-Type", "value": "application/json"}
                ]
            },
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": '={{ JSON.stringify({ "p_clinic_id": $json.clinic_id || "' + CLINIC_ID + '", "p_conversation_id": $json.conversation_id || 0, "p_intent": $json.intent || "UNKNOWN", "p_escalated": $json.should_escalate || false, "p_booked": $json.booked || false, "p_phase_reached": $json.phase_reached || 1, "p_response_time_ms": Date.now() - ($json.message_timestamp ? $json.message_timestamp * 1000 : Date.now()) }) }}',
            "options": {}
        },
        "id": node_id,
        "name": name,
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [pos[0], pos[1]]
    }


# ============================================================
# MAIN DEPLOYMENT
# ============================================================

def deploy():
    print("=" * 60)
    print("  SofIA SaaS - Workflow Deployment")
    print("=" * 60)

    # Step 1: Download current workflow
    print("\n[1/6] Downloading current workflow...")
    wf = get_workflow()
    print(f"  Nodes: {len(wf['nodes'])}")

    # Backup
    with open('workflow_backup_pre_saas.json', 'w', encoding='utf-8') as f:
        json.dump(wf, f, indent=2, ensure_ascii=False)
    print("  Backup saved: workflow_backup_pre_saas.json")

    # Step 2: Add Clinic Resolver nodes
    print("\n[2/6] Adding Clinic Resolver...")
    validar_node = find_node(wf, 'Validar Input')
    if not validar_node:
        raise Exception("Node 'Validar Input' not found!")

    base_pos = validar_node['position']

    resolver_node = create_resolver_clinica_node([base_pos[0] + 224, base_pos[1] - 120])
    merge_node = create_merge_clinic_node([base_pos[0] + 448, base_pos[1] - 120])

    add_node(wf, resolver_node)
    add_node(wf, merge_node)

    # Connect: Validar Input -> Resolver Clinica -> Merge Clinic Data -> IsUserMessage
    set_connection(wf, 'Validar Input', 'Resolver Clinica')
    set_connection(wf, 'Resolver Clinica', 'Merge Clinic Data')
    set_connection(wf, 'Merge Clinic Data', 'IsUserMessage')

    print("  Added: Resolver Clinica -> Merge Clinic Data")

    # Step 3: Replace Knowledge Base with Supabase search
    print("\n[3/6] Replacing Knowledge Base with Supabase...")
    kb_node = find_node(wf, 'Knowledge Base')
    if kb_node:
        kb_pos = kb_node['position']
    else:
        kb_pos = [3000, 400]

    buscar_kb = create_buscar_kb_node([kb_pos[0], kb_pos[1]])
    contexto_kb = create_preparar_contexto_kb_node([kb_pos[0] + 224, kb_pos[1]])

    # Remove old Knowledge Base node
    wf['nodes'] = [n for n in wf['nodes'] if n['name'] != 'Knowledge Base']

    add_node(wf, buscar_kb)
    add_node(wf, contexto_kb)

    # Update connections: wherever pointed to Knowledge Base, now points to Buscar KB
    for node_name, conns in wf['connections'].items():
        for output_idx, outputs in enumerate(conns.get('main', [])):
            for conn in outputs:
                if conn['node'] == 'Knowledge Base':
                    conn['node'] = 'Buscar Knowledge Base'

    # Connect KB chain
    set_connection(wf, 'Buscar Knowledge Base', 'Preparar Contexto KB')
    set_connection(wf, 'Preparar Contexto KB', 'Preparar Prompt INFO')

    # Remove old KB -> Preparar Prompt INFO connection
    if 'Knowledge Base' in wf['connections']:
        del wf['connections']['Knowledge Base']

    print("  Replaced: Knowledge Base -> Buscar Knowledge Base -> Preparar Contexto KB")

    # Step 4: Add appointment tracking
    print("\n[4/6] Adding appointment tracking...")
    evento_ok_node = find_node(wf, '\u00bfEvento Creado OK?')
    if evento_ok_node:
        ev_pos = evento_ok_node['position']
        guardar_cita = create_guardar_cita_node([ev_pos[0] + 224, ev_pos[1] - 100])
        add_node(wf, guardar_cita)

        # Insert between Evento OK (TRUE) and Confirmar al Paciente
        # TRUE output (0) of Evento OK -> Guardar Cita -> Confirmar al Paciente
        conns = wf['connections'].get('\u00bfEvento Creado OK?', {}).get('main', [])
        if conns and len(conns) > 0 and conns[0]:
            original_target = conns[0][0]['node']
            set_connection(wf, '\u00bfEvento Creado OK?', 'Guardar Cita Supabase', from_output=0)
            set_connection(wf, 'Guardar Cita Supabase', original_target)
            print(f"  Inserted: Evento OK -> Guardar Cita Supabase -> {original_target}")
    else:
        print("  [WARN] Node 'Evento Creado OK?' not found, skipping appointment tracking")

    # Step 5: Add metrics logging
    print("\n[5/6] Adding metrics logging...")

    # Add metric node before Responder OK
    responder_ok = find_node(wf, 'Responder OK')
    if responder_ok:
        rk_pos = responder_ok['position']
        metrica_node = create_registrar_metrica_node(
            [rk_pos[0] - 224, rk_pos[1]],
            "http-log-metric",
            "Registrar Metrica"
        )
        add_node(wf, metrica_node)

        # Find all nodes that connect to Responder OK and redirect through metric
        redirected = []
        for node_name, conns in wf['connections'].items():
            if node_name == 'Registrar Metrica':
                continue
            for output_idx, outputs in enumerate(conns.get('main', [])):
                for conn in outputs:
                    if conn['node'] == 'Responder OK':
                        conn['node'] = 'Registrar Metrica'
                        redirected.append(node_name)

        set_connection(wf, 'Registrar Metrica', 'Responder OK')
        print(f"  Redirected {len(redirected)} connections through Registrar Metrica -> Responder OK")

    # Step 6: Upload
    print("\n[6/6] Uploading modified workflow...")
    result = upload_workflow(wf)
    print(f"  Nodes: {len(result.get('nodes', []))}")
    print(f"  Updated: {result.get('updatedAt')}")

    # Save the new workflow
    with open('workflow_saas_deployed.json', 'w', encoding='utf-8') as f:
        json.dump(wf, f, indent=2, ensure_ascii=False)

    print("\n" + "=" * 60)
    print("  DEPLOYMENT COMPLETE")
    print("=" * 60)
    print(f"\n  New nodes added: Resolver Clinica, Merge Clinic Data,")
    print(f"    Buscar Knowledge Base, Preparar Contexto KB,")
    print(f"    Guardar Cita Supabase, Registrar Metrica")
    print(f"  Total nodes: {len(wf['nodes'])}")

    return wf


if __name__ == "__main__":
    try:
        deploy()
    except Exception as e:
        print(f"\n[ERROR] {e}")
        sys.exit(1)
