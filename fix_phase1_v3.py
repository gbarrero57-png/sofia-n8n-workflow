#!/usr/bin/env python3
"""
Fase 3 Phase 1 - Version 3: Simplified WhatsApp Safe Check without raw_payload dependency
"""

import json

# Load workflow
with open('wf_http_fixed.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

print(f"Loaded workflow with {len(wf['nodes'])} nodes")

# =========================================
# 1. ADD MISSING ROUTER NODE
# =========================================

router_node = {
    "parameters": {
        "mode": "expression",
        "output": "input",
        "rules": {
            "rules": [
                {
                    "id": "1",
                    "outputKey": "0",
                    "conditions": [{
                        "leftValue": "={{ $json.intent }}",
                        "rightValue": "CREATE_EVENT",
                        "operator": {
                            "type": "string",
                            "operation": "equals"
                        }
                    }]
                },
                {
                    "id": "2",
                    "outputKey": "1",
                    "conditions": [{
                        "leftValue": "={{ $json.intent }}",
                        "rightValue": "INFO",
                        "operator": {
                            "type": "string",
                            "operation": "equals"
                        }
                    }]
                },
                {
                    "id": "3",
                    "outputKey": "2",
                    "conditions": [{
                        "leftValue": "={{ $json.intent }}",
                        "rightValue": "PAYMENT",
                        "operator": {
                            "type": "string",
                            "operation": "equals"
                        }
                    }]
                }
            ],
            "options": {
                "fallbackOutput": "3"
            }
        }
    },
    "id": "switch-router",
    "name": "Router de Intención",
    "type": "n8n-nodes-base.switch",
    "typeVersion": 3,
    "position": [1904, 288]
}

# Insert Router after "Normalizar Intent" (index 5)
wf['nodes'].insert(6, router_node)
print("[OK] Added Router de Intencion node")

# =========================================
# 2. MODIFY VALIDAR INPUT TO INCLUDE AWAITING FLAG
# =========================================

# Find Validar Input node
validar_idx = next(i for i, n in enumerate(wf['nodes']) if n['name'] == 'Validar Input')

# Get current code and add awaiting_slot_confirmation extraction
old_validar_code = wf['nodes'][validar_idx]['parameters']['jsCode']

# Add extraction of awaiting_slot_confirmation before the return statement
new_validar_code = old_validar_code.replace(
    'const has_contact_inbox = !!contact_inboxes;',
    '''const has_contact_inbox = !!contact_inboxes;
const awaiting_slot_confirmation = payload.conversation?.custom_attributes?.awaiting_slot_confirmation || false;'''
).replace(
    'raw_payload: payload',
    '''raw_payload: payload,
    awaiting_slot_confirmation: awaiting_slot_confirmation'''
)

wf['nodes'][validar_idx]['parameters']['jsCode'] = new_validar_code
print("[OK] Modified Validar Input to extract awaiting_slot_confirmation")

# =========================================
# 3. REPLACE WHATSAPP SAFE CHECK - SIMPLIFIED
# =========================================

# Find WhatsApp Safe Check node
whatsapp_node_idx = next(i for i, n in enumerate(wf['nodes']) if n['id'] == 'code-whatsapp-safe')

# NEW simplified code using extracted fields
new_whatsapp_code = """// ============================================
// WHATSAPP SAFE RULES - FASE 3 (Dynamic Limit)
// ============================================
const bot_count = $json.bot_interaction_count || 0;
const message_lower = ($json.message_text || '').toLowerCase();
const awaiting_slot = $json.awaiting_slot_confirmation || false;

// Regla 1: Limite dinamico de interacciones (Fase 3)
// - Fase 1/2 (INFO, etc.): 1 interaccion maxima
// - Fase 3 (CREATE_EVENT con awaiting_slot_confirmation): 3 interacciones
const max_interactions = awaiting_slot ? 3 : 1;

if (bot_count >= max_interactions) {
  return [{
    json: {
      ...$json,
      should_escalate: true,
      escalation_reason: awaiting_slot ? 'MAX_INTERACTIONS_PHASE3' : 'MAX_INTERACTIONS_PHASE1',
      debug_rule: 'RULE_1_MAX_INTERACTIONS',
      debug_bot_count: bot_count,
      debug_max_allowed: max_interactions,
      escalation_message: awaiting_slot ?
        'Te conecto con un agente para completar tu agendamiento.' :
        'Te conecto con un agente de inmediato.'
    }
  }];
}

// Regla 2: Mensaje > 24h
const message_age_hours = (Date.now() - ($json.message_timestamp * 1000)) / (1000 * 60 * 60);
if (message_age_hours > 24) {
  return [{
    json: {
      ...$json,
      should_escalate: true,
      escalation_reason: 'MESSAGE_TOO_OLD',
      debug_rule: 'RULE_2_MESSAGE_AGE',
      debug_age_hours: message_age_hours,
      escalation_message: 'Disculpa, este mensaje es muy antiguo. Te conecto con un agente.'
    }
  }];
}

// Regla 3: Emergencias
const emergency_keywords = ['urgente', 'emergencia', 'dolor', 'sangr', 'accidente'];
if (emergency_keywords.some(kw => message_lower.includes(kw))) {
  return [{
    json: {
      ...$json,
      should_escalate: true,
      escalation_reason: 'EMERGENCY_KEYWORDS',
      debug_rule: 'RULE_3_EMERGENCY',
      escalation_message: 'Entiendo que es urgente. Te conecto con un agente de inmediato.'
    }
  }];
}

// Regla 4: Escalado explicito
const escalate_keywords = ['hablar con', 'quiero hablar', 'agente', 'operador', 'persona'];
if (escalate_keywords.some(kw => message_lower.includes(kw))) {
  return [{
    json: {
      ...$json,
      should_escalate: true,
      escalation_reason: 'EXPLICIT_ESCALATION',
      debug_rule: 'RULE_4_EXPLICIT',
      escalation_message: 'Por supuesto. Te conecto con un agente.'
    }
  }];
}

// Regla 5: Mensajes vacios o muy cortos
if (!$json.message_text || $json.message_text.trim().length < 3) {
  return [{
    json: {
      ...$json,
      should_escalate: true,
      escalation_reason: 'INVALID_MESSAGE',
      debug_rule: 'RULE_5_INVALID',
      escalation_message: 'No pude entender tu mensaje. Te conecto con un agente.'
    }
  }];
}

// Si pasa todas las reglas, continuar flujo normal
return [{
  json: {
    ...$json,
    should_escalate: false
  }
}];"""

# Replace the code
wf['nodes'][whatsapp_node_idx]['parameters']['jsCode'] = new_whatsapp_code
print("[OK] Modified WhatsApp Safe Check with simplified dynamic limit")

# =========================================
# 4. UPDATE CONNECTIONS
# =========================================

# Change "Normalizar Intent" to connect to Router instead of "Check INFO Intent"
for node_name, connections in wf['connections'].items():
    if node_name == "Normalizar Intent":
        wf['connections'][node_name] = {
            "main": [[{
                "node": "Router de Intención",
                "type": "main",
                "index": 0
            }]]
        }
        print("[OK] Updated Normalizar Intent -> Router de Intencion")

# Update "IsUserMessage" to connect to WhatsApp Safe Check instead of directly to Knowledge Base
# TRUE -> WhatsApp Safe Check, FALSE -> Responder OK
wf['connections']['IsUserMessage'] = {
    "main": [
        [{"node": "WhatsApp Safe Check", "type": "main", "index": 0}],
        [{"node": "Responder OK", "type": "main", "index": 0}]
    ]
}
print("[OK] Updated IsUserMessage -> WhatsApp Safe Check")

# Save
with open('wf_fase3_phase1_v3.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print(f"\nSUCCESS Phase 1 v3 Complete!")
print(f"   - Total nodes: {len(wf['nodes'])}")
print(f"   - Output: wf_fase3_phase1_v3.json")
print(f"\nChanges:")
print(f"   1. Added Router de Intencion node")
print(f"   2. Modified Validar Input to extract awaiting_slot_confirmation")
print(f"   3. Modified WhatsApp Safe Check to use extracted field")
print(f"   4. Updated connections")
