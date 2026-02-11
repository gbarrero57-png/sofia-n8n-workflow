#!/usr/bin/env python3
"""
PHASE 1 - Fase 3: Add Router and Dynamic Limit
Starting from the WORKING base (wf_http_WORKING.json)
"""

import json

# Load working workflow
with open('wf_http_WORKING.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

print(f"Loaded wf_http_WORKING.json with {len(wf['nodes'])} nodes\n")

changes = []

# =========================================
# 1. ADD ROUTER DE INTENCION NODE
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

# Find index of "Normalizar Intent" to insert Router after it
normalizar_idx = next(i for i, n in enumerate(wf['nodes']) if n['name'] == 'Normalizar Intent')
wf['nodes'].insert(normalizar_idx + 1, router_node)
changes.append(f"Added 'Router de Intención' node after 'Normalizar Intent'")

# =========================================
# 2. MODIFY VALIDAR INPUT - Extract awaiting_slot_confirmation
# =========================================

validar_idx = next(i for i, n in enumerate(wf['nodes']) if n['name'] == 'Validar Input')
validar_code = wf['nodes'][validar_idx]['parameters']['jsCode']

# Add awaiting_slot_confirmation extraction
if 'awaiting_slot_confirmation' not in validar_code:
    # Insert before the return statement
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
    changes.append("Modified 'Validar Input' to extract awaiting_slot_confirmation")

# =========================================
# 3. MODIFY WHATSAPP SAFE CHECK - Dynamic limit
# =========================================

whatsapp_idx = next(i for i, n in enumerate(wf['nodes']) if n['id'] == 'code-whatsapp-safe')

# New code with dynamic limit
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

wf['nodes'][whatsapp_idx]['parameters']['jsCode'] = new_whatsapp_code
changes.append("Modified 'WhatsApp Safe Check' with dynamic limit (1 for INFO, 3 for appointments)")

# =========================================
# 4. UPDATE CONNECTIONS
# =========================================

# Normalizar Intent -> Router de Intención
wf['connections']['Normalizar Intent'] = {
    "main": [[{
        "node": "Router de Intención",
        "type": "main",
        "index": 0
    }]]
}
changes.append("Updated connection: 'Normalizar Intent' -> 'Router de Intención'")

# Router de Intención -> 4 outputs
wf['connections']['Router de Intención'] = {
    "main": [
        # Output 0: CREATE_EVENT -> Preparar Escalado (placeholder until Phase 2-4)
        [{"node": "Preparar Escalado", "type": "main", "index": 0}],
        # Output 1: INFO -> Knowledge Base
        [{"node": "Knowledge Base", "type": "main", "index": 0}],
        # Output 2: PAYMENT -> Preparar Escalado
        [{"node": "Preparar Escalado", "type": "main", "index": 0}],
        # Output 3: HUMAN (fallback) -> Preparar Escalado
        [{"node": "Preparar Escalado", "type": "main", "index": 0}]
    ]
}
changes.append("Created 'Router de Intención' connections (4 outputs)")

# Save
with open('wf_PHASE1_COMPLETE.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print(f"Applied {len(changes)} changes:\n")
for change in changes:
    print(f"  - {change}")

print(f"\n=== PHASE 1 COMPLETE ===")
print(f"   - Input: wf_http_WORKING.json (22 nodes)")
print(f"   - Output: wf_PHASE1_COMPLETE.json ({len(wf['nodes'])} nodes)")
print(f"   - Ready for testing INFO flow with Router")
print(f"\nNext steps:")
print(f"   1. Upload wf_PHASE1_COMPLETE.json")
print(f"   2. Test INFO flow (should work same as before)")
print(f"   3. Verify Router routes INFO correctly")
print(f"   4. Proceed to Phase 2 (Google Calendar integration)")
