#!/usr/bin/env python3
"""
Fase 3 Phase 1: Fix Critical Issues
1. Add missing Router de Intención node
2. Modify WhatsApp Safe Check for dynamic bot_count limit
3. Update connections to use Router
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
print("[OK] Added Router de Intenci" + "on node")

# =========================================
# 2. MODIFY WHATSAPP SAFE CHECK
# =========================================

# Find WhatsApp Safe Check node
whatsapp_node_idx = next(i for i, n in enumerate(wf['nodes']) if n['id'] == 'code-whatsapp-safe')

# Get current code
old_code = wf['nodes'][whatsapp_node_idx]['parameters']['jsCode']

# Replace Rule 1 with dynamic limit
new_rule_1 = '''// Regla 1: Límite dinámico de interacciones (Fase 3)
// - Fase 1/2 (INFO, etc.): 1 interacción máxima
// - Fase 3 (CREATE_EVENT con awaiting_slot_confirmation): 3 interacciones
const custom_attrs = $json.raw_payload?.conversation?.custom_attributes;
const awaiting_slot = custom_attrs?.awaiting_slot_confirmation === true;
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
}'''

# Replace the old Rule 1 section
old_rule_1_pattern = "// Regla 1: MÃƒÆ'Ã†â€™Ãƒâ€šÃ‚Â¡ximo 1 interacciÃƒÆ'Ã†â€™Ãƒâ€šÃ‚Â³n automÃƒÆ'Ã†â€™Ãƒâ€šÃ‚Â¡tica en Fase 1\nif (bot_count >= 1) {\n  return [{\n    json: {\n      ...$json,\n      should_escalate: true,\n      escalation_reason: 'MAX_INTERACTIONS_PHASE1',\n      debug_rule: 'RULE_1_MAX_INTERACTIONS',\n      debug_bot_count: bot_count,\n      escalation_message: 'Te conecto con un agente de inmediato.'\n    }\n  }];\n}"

new_code = old_code.replace(old_rule_1_pattern, new_rule_1)

wf['nodes'][whatsapp_node_idx]['parameters']['jsCode'] = new_code
print("OK Modified WhatsApp Safe Check for dynamic limit")

# =========================================
# 3. UPDATE CONNECTIONS
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
        print("OK Updated Normalizar Intent -> Router de Intención")

# Update "IsUserMessage" to connect to WhatsApp Safe Check instead of directly to Knowledge Base
# TRUE -> WhatsApp Safe Check, FALSE -> Responder OK
wf['connections']['IsUserMessage'] = {
    "main": [
        [{"node": "WhatsApp Safe Check", "type": "main", "index": 0}],
        [{"node": "Responder OK", "type": "main", "index": 0}]
    ]
}
print("OK Updated IsUserMessage -> WhatsApp Safe Check")

# Save
with open('wf_fase3_phase1.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print(f"\nSUCCESS Phase 1 Complete!")
print(f"   - Total nodes: {len(wf['nodes'])}")
print(f"   - Output: wf_fase3_phase1.json")
print(f"\nNext: Upload, activate, and test INFO flow")
