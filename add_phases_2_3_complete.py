#!/usr/bin/env python3
"""
Add complete Phase 2 & 3 nodes:
- Calculate available slots
- Select 3 best slots
- Format offer message
- Send to Chatwoot
- Mark conversation awaiting confirmation
- Prepare escalation with slot context
"""

import json

wf = json.load(open('wf_COMPLETE_WITH_BYPASS.json', encoding='utf-8'))

print(f"Current: {len(wf['nodes'])} nodes\n")

# Phase 2 Node 1: Calculate Available Slots
calculate_slots = {
    "parameters": {
        "jsCode": """// ============================================
// CALCULATE AVAILABLE 30-MIN SLOTS
// ============================================
const busy_events = $input.all();

// Business hours
const business_hours = {
  1: { start: 9, end: 19 },  // Monday
  2: { start: 9, end: 19 },  // Tuesday
  3: { start: 9, end: 19 },  // Wednesday
  4: { start: 9, end: 19 },  // Thursday
  5: { start: 9, end: 19 },  // Friday
  6: { start: 9, end: 14 },  // Saturday
  0: null,  // Sunday - closed
  7: null
};

// Extract busy times from calendar events
const busy_times = [];
for (const item of busy_events) {
  const event = item.json;
  if (event.start && event.end) {
    const start_time = event.start.dateTime || event.start.date;
    const end_time = event.end.dateTime || event.end.date;
    busy_times.push({
      start: new Date(start_time),
      end: new Date(end_time)
    });
  }
}

// Generate all possible slots for next 7 days
const slots = [];
const now = new Date();
const slot_duration = 30; // minutes

for (let day = 0; day < 7; day++) {
  const date = new Date(now);
  date.setDate(date.getDate() + day);
  date.setHours(0, 0, 0, 0);

  const day_of_week = date.getDay();
  const hours = business_hours[day_of_week];

  if (!hours) continue; // Closed day

  // Generate slots for this day
  for (let hour = hours.start; hour < hours.end; hour++) {
    for (let minute = 0; minute < 60; minute += slot_duration) {
      const slot_start = new Date(date);
      slot_start.setHours(hour, minute, 0, 0);

      const slot_end = new Date(slot_start);
      slot_end.setMinutes(slot_end.getMinutes() + slot_duration);

      // Skip past slots
      if (slot_start < now) continue;

      // Check if slot conflicts with busy times
      let is_available = true;
      for (const busy of busy_times) {
        if (slot_start < busy.end && slot_end > busy.start) {
          is_available = false;
          break;
        }
      }

      if (is_available) {
        slots.push({
          start: slot_start.toISOString(),
          end: slot_end.toISOString(),
          date: slot_start.toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
          time: slot_start.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
        });
      }
    }
  }
}

// Limit to first 20 available slots
const available_slots = slots.slice(0, 20);

return [{
  json: {
    ...$json,
    available_slots: available_slots,
    total_available: available_slots.length,
    busy_events_count: busy_times.length,
    calculated_at: new Date().toISOString()
  }
}];"""
    },
    "id": "code-calculate-slots",
    "name": "Calcular Slots Disponibles",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [2352, 160]
}

# Phase 2 Node 2: Select 3 Best Slots
select_slots = {
    "parameters": {
        "jsCode": """// ============================================
// SELECT 3 BEST SLOTS TO OFFER
// ============================================
const all_slots = $json.available_slots || [];

if (all_slots.length === 0) {
  return [{
    json: {
      ...$json,
      selected_slots: [],
      no_slots_available: true,
      should_escalate: true,
      escalation_reason: 'NO_SLOTS_AVAILABLE',
      escalation_message: 'Lo siento, no hay horarios disponibles en los próximos 7 días. Te conecto con un agente.'
    }
  }];
}

// Take first 3 available slots
const selected = all_slots.slice(0, 3);

// Format for patient message
const slot_options = selected.map((slot, idx) => {
  return {
    option_number: idx + 1,
    date: slot.date,
    time: slot.time,
    start_iso: slot.start,
    end_iso: slot.end
  };
});

return [{
  json: {
    ...$json,
    selected_slots: slot_options,
    has_slots: true,
    total_offered: slot_options.length
  }
}];"""
    },
    "id": "code-select-slots",
    "name": "Seleccionar 3 Mejores Slots",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [2576, 160]
}

# Phase 3 Node 1: Format Offer Message
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

// Format message with 3 options
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

# Phase 3 Node 2: Send Offer to Chatwoot
send_offer = {
    "parameters": {
        "method": "POST",
        "url": "=https://chat.redsolucionesti.com/api/v1/accounts/{{ $json.account_id }}/conversations/{{ $json.conversation_id }}/messages",
        "authentication": "none",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ content: $json.offer_message, message_type: 'outgoing', private: false }) }}",
        "options": {
            "headerParameters": {
                "parameters": [
                    {
                        "name": "api_access_token",
                        "value": "yypAwZDH2dV3crfbqJqWCgj1"
                    }
                ]
            }
        }
    },
    "id": "http-send-offer",
    "name": "Enviar Oferta Chatwoot",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [3024, 160]
}

# Phase 3 Node 3: Mark Awaiting Confirmation
set_flag = {
    "parameters": {
        "method": "POST",
        "url": "=https://chat.redsolucionesti.com/api/v1/accounts/{{ $json.account_id }}/conversations/{{ $json.conversation_id }}/custom_attributes",
        "authentication": "none",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ custom_attributes: { awaiting_slot_confirmation: 'true', offered_slots: JSON.stringify($json.offered_slots), bot_interaction_count: 1 } }) }}",
        "options": {
            "headerParameters": {
                "parameters": [
                    {
                        "name": "api_access_token",
                        "value": "yypAwZDH2dV3crfbqJqWCgj1"
                    }
                ]
            }
        }
    },
    "id": "http-set-flag",
    "name": "Marcar Esperando Confirmación",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [3248, 160]
}

# Phase 3 Node 4: Prepare Escalation with Slot Info
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

# Add all Phase 2 & 3 nodes
new_nodes = [calculate_slots, select_slots, format_offer, send_offer, set_flag, prepare_slot_escalation]
wf['nodes'].extend(new_nodes)
print(f"[1] Added Phase 2 & 3 nodes: {len(wf['nodes'])} total nodes")

# Update connections
# Google Calendar -> Calcular Slots
wf['connections']['Google Calendar: Leer Eventos']['main'][0] = [
    {"node": "Calcular Slots Disponibles", "type": "main", "index": 0}
]
print("[2] Connected Google Calendar -> Calcular Slots")

# Calcular Slots -> Seleccionar 3
wf['connections']['Calcular Slots Disponibles'] = {
    "main": [[{"node": "Seleccionar 3 Mejores Slots", "type": "main", "index": 0}]]
}
print("[3] Connected Calcular Slots -> Seleccionar 3")

# Seleccionar 3 -> Formatear
wf['connections']['Seleccionar 3 Mejores Slots'] = {
    "main": [[{"node": "Formatear Oferta de Slots", "type": "main", "index": 0}]]
}
print("[4] Connected Seleccionar 3 -> Formatear Oferta")

# Formatear -> Enviar
wf['connections']['Formatear Oferta de Slots'] = {
    "main": [[{"node": "Enviar Oferta Chatwoot", "type": "main", "index": 0}]]
}
print("[5] Connected Formatear -> Enviar Oferta")

# Enviar -> Marcar
wf['connections']['Enviar Oferta Chatwoot'] = {
    "main": [[{"node": "Marcar Esperando Confirmación", "type": "main", "index": 0}]]
}
print("[6] Connected Enviar -> Marcar Esperando")

# Marcar -> Preparar Escalado con Slots
wf['connections']['Marcar Esperando Confirmación'] = {
    "main": [[{"node": "Preparar Escalado con Slots", "type": "main", "index": 0}]]
}
print("[7] Connected Marcar -> Preparar Escalado con Slots")

# Preparar Escalado con Slots -> Preparar Escalado (existing)
wf['connections']['Preparar Escalado con Slots'] = {
    "main": [[{"node": "Preparar Escalado", "type": "main", "index": 0}]]
}
print("[8] Connected Preparar Escalado con Slots -> Preparar Escalado")

# Save
with open('wf_COMPLETE_ALL_PHASES.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print(f"\n[DONE] wf_COMPLETE_ALL_PHASES.json")
print(f"  Total nodes: {len(wf['nodes'])}")
print(f"\n[COMPLETE] Phases 1, 2, 3 fully integrated!")
print("  Phase 1: Classification + Routing")
print("  Phase 2: Google Calendar + Slot calculation")
print("  Phase 3: Offer slots + Confirmation + Escalation")
