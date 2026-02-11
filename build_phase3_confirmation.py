#!/usr/bin/env python3
"""
Build Phase 3: Slot Confirmation Flow
- Offer 3 slots to patient via Chatwoot
- Set awaiting_slot_confirmation flag
- Wait for patient response (handled by Fase 3 separate flow)
- Escalate to human with chosen slot
"""

import json

# Load Phase 2
with open('wf_PHASE2_CALENDAR.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

print(f"Phase 2 loaded: {len(wf['nodes'])} nodes\n")

# NODE 1: Format Slot Offer Message
format_offer = {
    "parameters": {
        "jsCode": """// ============================================
// FORMAT SLOT OFFER MESSAGE
// ============================================
const slots = $json.selected_slots || [];

if (slots.length === 0) {
  return [{
    json: {
      ...$json,
      offer_message: 'Lo siento, no hay horarios disponibles en los próximos 7 días.',
      should_escalate: true,
      escalation_reason: 'NO_SLOTS_AVAILABLE'
    }
  }];
}

// Formatear mensaje con las 3 opciones
let message = '¡Perfecto! Tengo estos horarios disponibles para tu cita:\\n\\n';

slots.forEach(slot => {
  message += `${slot.option_number}. ${slot.date} a las ${slot.time}\\n`;
});

message += '\\nPor favor responde con el número de la opción que prefieres (1, 2 o 3).';

return [{
  json: {
    ...$json,
    offer_message: message,
    offered_slots: slots,
    awaiting_slot_confirmation: true,
    should_escalate: false
  }
}];"""
    },
    "id": "code-format-offer",
    "name": "Formatear Oferta de Slots",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [2800, 160]
}

# NODE 2: Send Offer to Chatwoot
send_offer = {
    "parameters": {
        "method": "POST",
        "url": "=https://chat.redsolucionesti.com/api/v1/accounts/{{ $json.account_id }}/conversations/{{ $json.conversation_id }}/messages",
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "chatwootApi",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ content: $json.offer_message, message_type: 'outgoing', private: false }) }}",
        "options": {}
    },
    "id": "http-send-offer",
    "name": "Enviar Oferta Chatwoot",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [3024, 160],
    "credentials": {
        "chatwootApi": {
            "id": "CHATWOOT_API_CREDENTIAL_ID",
            "name": "Chatwoot API"
        }
    }
}

# NODE 3: Set awaiting_slot_confirmation flag
set_flag = {
    "parameters": {
        "method": "POST",
        "url": "=https://chat.redsolucionesti.com/api/v1/accounts/{{ $json.account_id }}/conversations/{{ $json.conversation_id }}/custom_attributes",
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "chatwootApi",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ custom_attributes: { awaiting_slot_confirmation: 'true', offered_slots: JSON.stringify($json.offered_slots), bot_interaction_count: 1 } }) }}",
        "options": {}
    },
    "id": "http-set-flag",
    "name": "Marcar Esperando Confirmación",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [3248, 160],
    "credentials": {
        "chatwootApi": {
            "id": "CHATWOOT_API_CREDENTIAL_ID",
            "name": "Chatwoot API"
        }
    }
}

# NODE 4: Prepare Escalation with Slot Info
prepare_slot_escalation = {
    "parameters": {
        "jsCode": """// ============================================
// PREPARE ESCALATION WITH SLOT CONTEXT
// ============================================
const slots = $json.offered_slots || [];

let escalation_note = 'Paciente solicitó agendar cita.\\n\\n';
escalation_note += 'Horarios ofrecidos:\\n';

slots.forEach(slot => {
  escalation_note += `${slot.option_number}. ${slot.date} a las ${slot.time}\\n`;
});

escalation_note += '\\nEsperando respuesta del paciente para confirmar el horario.';

return [{
  json: {
    ...$json,
    escalation_message: 'Gracias. Un agente se pondrá en contacto contigo pronto para confirmar tu cita.',
    escalation_note: escalation_note,
    escalation_reason: 'PHASE3_SLOTS_OFFERED',
    should_escalate: true
  }
}];"""
    },
    "id": "code-prepare-slot-escalation",
    "name": "Preparar Escalado con Slots",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [3472, 160]
}

# Add Phase 3 nodes
wf['nodes'].extend([format_offer, send_offer, set_flag, prepare_slot_escalation])
print(f"[1] Added Phase 3 nodes: {len(wf['nodes'])} nodes")

# Update connections
# Seleccionar 3 Mejores Slots -> Formatear Oferta
wf['connections']['Seleccionar 3 Mejores Slots']['main'][0] = [
    {"node": "Formatear Oferta de Slots", "type": "main", "index": 0}
]

# Connect Phase 3 nodes
wf['connections']['Formatear Oferta de Slots'] = {
    "main": [[{"node": "Enviar Oferta Chatwoot", "type": "main", "index": 0}]]
}
wf['connections']['Enviar Oferta Chatwoot'] = {
    "main": [[{"node": "Marcar Esperando Confirmación", "type": "main", "index": 0}]]
}
wf['connections']['Marcar Esperando Confirmación'] = {
    "main": [[{"node": "Preparar Escalado con Slots", "type": "main", "index": 0}]]
}
wf['connections']['Preparar Escalado con Slots'] = {
    "main": [[{"node": "Preparar Escalado", "type": "main", "index": 0}]]
}
print("[2] Connected Phase 3 nodes")

# Save
with open('wf_COMPLETE_PHASES123.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print(f"\n[DONE] wf_COMPLETE_PHASES123.json created")
print(f"  Nodes: {len(wf['nodes'])}")
print(f"  Connections: {len(wf['connections'])}")
print(f"\n✅ All 3 phases integrated:")
print(f"   Phase 1: IF-based routing (INFO vs non-INFO)")
print(f"   Phase 2: Google Calendar slots calculation")
print(f"   Phase 3: Slot offer + confirmation flow")
