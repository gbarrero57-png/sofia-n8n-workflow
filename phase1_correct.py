#!/usr/bin/env python3
"""
PHASE 1 - CORRECT VERSION
Carefully add Router while preserving all existing nodes
"""

import json

# Load working baseline
with open('wf_http_WORKING.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

print(f"Starting from wf_http_WORKING.json with {len(wf['nodes'])} nodes\n")

#  1: ADD ROUTER NODE
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
print(f"[1] Added Router de Intención node ({len(wf['nodes'])} nodes now)")

# 2: MODIFY VALIDAR INPUT
validar_idx = next(i for i, n in enumerate(wf['nodes']) if n['name'] == 'Validar Input')
validar_code = wf['nodes'][validar_idx]['parameters']['jsCode']

if 'awaiting_slot_confirmation' not in validar_code:
    new_code = validar_code.replace(
        'const has_contact_inbox = !!contact_inboxes;',
        '''const has_contact_inbox = !!contact_inboxes;
const awaiting_slot_confirmation = payload.conversation?.custom_attributes?.awaiting_slot_confirmation || false;'''
    ).replace(
        'raw_payload: payload',
        '''raw_payload: payload,
    awaiting_slot_confirmation: awaiting_slot_confirmation'''
    )
    wf['nodes'][validar_idx]['parameters']['jsCode'] = new_code
    print(f"[2] Modified Validar Input to extract awaiting_slot_confirmation")

# 3: MODIFY WHATSAPP SAFE CHECK
whatsapp_idx = next(i for i, n in enumerate(wf['nodes']) if n['id'] == 'code-whatsapp-safe')
new_whatsapp_code = """// WHATSAPP SAFE RULES - FASE 3 (Dynamic Limit)
const bot_count = $json.bot_interaction_count || 0;
const message_lower = ($json.message_text || '').toLowerCase();
const awaiting_slot = $json.awaiting_slot_confirmation || false;

// Regla 1: Limite dinamico
const max_interactions = awaiting_slot ? 3 : 1;
if (bot_count >= max_interactions) {
  return [{json: {...$json, should_escalate: true, escalation_reason: awaiting_slot ? 'MAX_INTERACTIONS_PHASE3' : 'MAX_INTERACTIONS_PHASE1', escalation_message: awaiting_slot ? 'Te conecto con un agente para completar tu agendamiento.' : 'Te conecto con un agente de inmediato.'}}];
}

// Regla 2: Mensaje > 24h
const message_age_hours = (Date.now() - ($json.message_timestamp * 1000)) / (1000 * 60 * 60);
if (message_age_hours > 24) {
  return [{json: {...$json, should_escalate: true, escalation_reason: 'MESSAGE_TOO_OLD', escalation_message: 'Disculpa, este mensaje es muy antiguo. Te conecto con un agente.'}}];
}

// Regla 3: Emergencias
const emergency_keywords = ['urgente', 'emergencia', 'dolor', 'sangr', 'accidente'];
if (emergency_keywords.some(kw => message_lower.includes(kw))) {
  return [{json: {...$json, should_escalate: true, escalation_reason: 'EMERGENCY_KEYWORDS', escalation_message: 'Entiendo que es urgente. Te conecto con un agente de inmediato.'}}];
}

// Regla 4: Escalado explicito
const escalate_keywords = ['hablar con', 'quiero hablar', 'agente', 'operador', 'persona'];
if (escalate_keywords.some(kw => message_lower.includes(kw))) {
  return [{json: {...$json, should_escalate: true, escalation_reason: 'EXPLICIT_ESCALATION', escalation_message: 'Por supuesto. Te conecto con un agente.'}}];
}

// Regla 5: Mensajes vacios
if (!$json.message_text || $json.message_text.trim().length < 3) {
  return [{json: {...$json, should_escalate: true, escalation_reason: 'INVALID_MESSAGE', escalation_message: 'No pude entender tu mensaje. Te conecto con un agente.'}}];
}

// Continuar flujo
return [{json: {...$json, should_escalate: false}}];"""

wf['nodes'][whatsapp_idx]['parameters']['jsCode'] = new_whatsapp_code
print(f"[3] Modified WhatsApp Safe Check with dynamic limit")

# 4: UPDATE NORMALIZAR INTENT CONNECTION
wf['connections']['Normalizar Intent'] = {
    "main": [[{"node": "Router de Intención", "type": "main", "index": 0}]]
}
print(f"[4] Updated Normalizar Intent -> Router de Intención")

# 5: CREATE ROUTER CONNECTIONS
wf['connections']['Router de Intención'] = {
    "main": [
        [{"node": "Preparar Escalado", "type": "main", "index": 0}],  # CREATE_EVENT
        [{"node": "Knowledge Base", "type": "main", "index": 0}],     # INFO
        [{"node": "Preparar Escalado", "type": "main", "index": 0}],  # PAYMENT
        [{"node": "Preparar Escalado", "type": "main", "index": 0}]   # HUMAN
    ]
}
print(f"[5] Created Router de Intención connections (4 outputs)")

# Save
with open('wf_PHASE1_FINAL.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print(f"\n[SUCCESS] PHASE 1 COMPLETE")
print(f"   - Output: wf_PHASE1_FINAL.json")
print(f"   - Nodes: {len(wf['nodes'])}")
print(f"   - Connection groups: {len(wf['connections'])}")
print(f"\n   Note: Check INFO Intent preserved but not used (replaced by Router)")
