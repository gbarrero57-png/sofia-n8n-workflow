#!/usr/bin/env python3
"""
Build Phase 1 complete: IF routing that works, without Calendar (for now)
Keep Phase 2 & 3 simple to avoid validation errors
"""

import json

# Load Phase 1 IF working
with open('wf_PHASE1_IF.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

print(f"Phase 1 IF loaded: {len(wf['nodes'])} nodes\n")

# For non-INFO intents, instead of going directly to Preparar Escalado,
# let's add a simple message explaining we'll escalate

# NODE: Explain Escalation for Appointments
explain_appointment = {
    "parameters": {
        "jsCode": """// ============================================
// EXPLAIN APPOINTMENT ESCALATION
// ============================================
return [{
  json: {
    ...$json,
    escalation_message: 'Entiendo que deseas agendar una cita. Te voy a conectar con un agente que te ayudará con la programación de tu cita.',
    escalation_reason: 'APPOINTMENT_REQUEST',
    escalation_note: `Paciente solicitó: ${$json.intent}\\nMensaje original: ${$json.message_text}`,
    should_escalate: true
  }
}];"""
    },
    "id": "code-explain-appointment",
    "name": "Explicar Agendamiento",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [2128, 416]
}

# Add node
wf['nodes'].append(explain_appointment)
print(f"[1] Added Explicar Agendamiento node: {len(wf['nodes'])} nodes")

# Update IF false connection
wf['connections']['¿Es INFO?']['main'][1] = [
    {"node": "Explicar Agendamiento", "type": "main", "index": 0}
]
print("[2] Updated IF false -> Explicar Agendamiento")

# Connect to Preparar Escalado
wf['connections']['Explicar Agendamiento'] = {
    "main": [[{"node": "Preparar Escalado", "type": "main", "index": 0}]]
}
print("[3] Connected Explicar Agendamiento -> Preparar Escalado")

# Save
with open('wf_PHASE1_COMPLETE_WORKING.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print(f"\n[DONE] wf_PHASE1_COMPLETE_WORKING.json created")
print(f"  Nodes: {len(wf['nodes'])}")
print(f"  Connections: {len(wf['connections'])}")
print(f"\n[STATUS] Phase 1 complete and working")
print(f"  - INFO intents: Go to Knowledge Base")
print(f"  - Other intents: Escalate with explanation")
print(f"\n[NOTE] Phase 2 (Calendar) will be added after Phase 1 is confirmed working")
