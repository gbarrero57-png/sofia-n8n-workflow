#!/usr/bin/env python3
"""
Add complete Phase 4: Automatic Google Calendar Event Creation

Flow:
1. Check if awaiting slot confirmation
2. Process user's slot selection (1, 2, 3)
3. Validate slot chosen
4. Create Google Calendar event automatically
5. Confirm to patient OR escalate on error
"""

import json

wf = json.load(open('wf_COMPLETE_ALL_PHASES.json', encoding='utf-8'))

print(f"Current: {len(wf['nodes'])} nodes\n")

# ==================================================
# PHASE 4 NODE 1: Check Slot Confirmation State
# ==================================================
check_slot_confirmation = {
    "parameters": {
        "jsCode": """// ============================================
// CHECK IF AWAITING SLOT CONFIRMATION
// ============================================
const custom_attrs = $json.raw_payload?.conversation?.custom_attributes;
const awaiting = custom_attrs?.awaiting_slot_confirmation === 'true';
const offered_slots = custom_attrs?.offered_slots;

// Parse offered_slots if string
let slots = [];
if (typeof offered_slots === 'string') {
    try {
        slots = JSON.parse(offered_slots);
    } catch (e) {
        slots = [];
    }
} else if (Array.isArray(offered_slots)) {
    slots = offered_slots;
}

return [{
    json: {
        ...$json,
        slot_confirmation_pending: awaiting,
        offered_slots: slots,
        is_second_interaction: awaiting
    }
}];"""
    },
    "id": "code-check-slot-state",
    "name": "Check Slot Confirmation State",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [1456, 160]
}

# ==================================================
# PHASE 4 NODE 2: IF - Is Awaiting Slot Confirmation?
# ==================================================
if_awaiting_slot = {
    "parameters": {
        "conditions": {
            "options": {
                "caseSensitive": True,
                "leftValue": "",
                "typeValidation": "strict"
            },
            "conditions": [
                {
                    "id": "awaiting-slot-check",
                    "leftValue": "={{ $json.slot_confirmation_pending }}",
                    "rightValue": True,
                    "operator": {
                        "type": "boolean",
                        "operation": "equals"
                    }
                }
            ],
            "combinator": "and"
        }
    },
    "id": "if-awaiting-confirmation",
    "name": "¿Esperando Confirmación Slot?",
    "type": "n8n-nodes-base.if",
    "typeVersion": 2,
    "position": [1568, 160]
}

# ==================================================
# PHASE 4 NODE 3: Process Slot Choice
# ==================================================
process_slot_choice = {
    "parameters": {
        "jsCode": """// ============================================
// PROCESS USER'S SLOT SELECTION
// ============================================
const message = ($json.message_text || '').toLowerCase();
const slots = $json.offered_slots || [];

if (slots.length === 0) {
    return [{
        json: {
            ...$json,
            slot_chosen: false,
            needs_clarification: true,
            error_reason: 'NO_SLOTS_IN_CONTEXT'
        }
    }];
}

// Try to match by number (1, 2, 3)
let chosen_slot = null;
let chosen_index = -1;

if (message.match(/\\b1\\b/) || message.includes('primer') || message.includes('primera')) {
    chosen_slot = slots[0];
    chosen_index = 0;
} else if (message.match(/\\b2\\b/) || message.includes('segund')) {
    chosen_slot = slots[1];
    chosen_index = 1;
} else if (message.match(/\\b3\\b/) || message.includes('tercer')) {
    chosen_slot = slots[2];
    chosen_index = 2;
}

// Try to match by day name
if (!chosen_slot) {
    const days = ['lunes', 'martes', 'miércoles', 'miercoles', 'jueves', 'viernes', 'sábado', 'sabado'];
    for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const slot_text = (slot.date || '').toLowerCase();
        for (const day of days) {
            if (message.includes(day) && slot_text.includes(day)) {
                chosen_slot = slot;
                chosen_index = i;
                break;
            }
        }
        if (chosen_slot) break;
    }
}

if (!chosen_slot) {
    return [{
        json: {
            ...$json,
            slot_chosen: false,
            needs_clarification: true,
            error_reason: 'SLOT_NOT_IDENTIFIED'
        }
    }];
}

return [{
    json: {
        ...$json,
        slot_chosen: true,
        chosen_slot: chosen_slot,
        chosen_slot_index: chosen_index + 1,
        needs_clarification: false
    }
}];"""
    },
    "id": "code-process-slot-choice",
    "name": "Procesar Elección Slot",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [1680, 80]
}

# ==================================================
# PHASE 4 NODE 4: IF - Slot Valid?
# ==================================================
if_slot_valid = {
    "parameters": {
        "conditions": {
            "boolean": [
                {
                    "value1": "={{ $json.slot_chosen }}",
                    "value2": True
                }
            ]
        },
        "options": {}
    },
    "id": "if-slot-chosen-valid",
    "name": "¿Slot Válido?",
    "type": "n8n-nodes-base.if",
    "typeVersion": 2,
    "position": [1792, 80]
}

# ==================================================
# PHASE 4 NODE 5: Ask Clarification
# ==================================================
ask_clarification = {
    "parameters": {
        "method": "POST",
        "url": "=https://chat.redsolucionesti.com/api/v1/accounts/{{ $json.account_id }}/conversations/{{ $json.conversation_id }}/messages",
        "sendHeaders": True,
        "headerParameters": {
            "parameters": [
                {
                    "name": "api_access_token",
                    "value": "yypAwZDH2dV3crfbqJqWCgj1"
                }
            ]
        },
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ content: 'No logré identificar qué horario prefieres. ¿Podrías decirme el número de la opción (1, 2 o 3)?', message_type: 'outgoing', private: false }) }}",
        "options": {}
    },
    "id": "http-ask-clarification",
    "name": "Pedir Aclaración",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [1904, 192]
}

# ==================================================
# PHASE 4 NODE 6: Lock Slot (prevent conflicts)
# ==================================================
lock_slot = {
    "parameters": {
        "jsCode": """// ============================================
// LOCK SLOT - Prepare event data
// ============================================
const slot = $json.chosen_slot;
const patient = $json.sender_name || 'Paciente';
const phone = $json.contact_phone || 'No disponible';

// Extract service type from original message (basic extraction)
const original_msg = ($json.message_text || '').toLowerCase();
let service = 'Consulta general';

if (original_msg.includes('limpieza')) {
    service = 'Limpieza dental';
} else if (original_msg.includes('blanqueamiento')) {
    service = 'Blanqueamiento dental';
} else if (original_msg.includes('ortodoncia')) {
    service = 'Ortodoncia';
} else if (original_msg.includes('extracción') || original_msg.includes('extraccion')) {
    service = 'Extracción';
} else if (original_msg.includes('endodoncia') || original_msg.includes('conducto')) {
    service = 'Endodoncia';
} else if (original_msg.includes('implante')) {
    service = 'Implante dental';
}

return [{
    json: {
        ...$json,
        event_summary: `${service} - ${patient}`,
        event_description: `Paciente: ${patient}\\nTeléfono: ${phone}\\nServicio: ${service}\\n\\nAgendado automáticamente por SofIA Bot`,
        event_start: slot.start_iso,
        event_end: slot.end_iso,
        event_location: 'Clínica Dental SofIA Dent',
        service_type: service
    }
}];"""
    },
    "id": "code-lock-slot",
    "name": "Lock de Slot",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [1904, 0]
}

# ==================================================
# PHASE 4 NODE 7: Create Google Calendar Event
# ==================================================
create_calendar_event = {
    "parameters": {
        "calendar": {
            "__rl": True,
            "value": "family00280432052323677917@group.calendar.google.com",
            "mode": "list",
            "cachedResultName": "Familia"
        },
        "operation": "create",
        "start": "={{ $json.event_start }}",
        "end": "={{ $json.event_end }}",
        "summary": "={{ $json.event_summary }}",
        "additionalFields": {
            "description": "={{ $json.event_description }}",
            "location": "={{ $json.event_location }}"
        }
    },
    "type": "n8n-nodes-base.googleCalendar",
    "typeVersion": 1.3,
    "position": [2016, 0],
    "id": "google-calendar-create-event",
    "name": "Crear Evento Google Calendar",
    "credentials": {
        "googleCalendarOAuth2Api": {
            "id": "Dnin5OfNiPb8Nyl4",
            "name": "Google Calendar account"
        }
    }
}

# ==================================================
# PHASE 4 NODE 8: IF - Event Created OK?
# ==================================================
if_event_created = {
    "parameters": {
        "conditions": {
            "boolean": [
                {
                    "value1": "={{ !!$json.id }}",
                    "value2": True
                }
            ]
        },
        "options": {}
    },
    "id": "if-event-created-ok",
    "name": "¿Evento Creado OK?",
    "type": "n8n-nodes-base.if",
    "typeVersion": 2,
    "position": [2128, 0]
}

# ==================================================
# PHASE 4 NODE 9: Confirm to Patient
# ==================================================
confirm_to_patient = {
    "parameters": {
        "jsCode": """// ============================================
// CONFIRM APPOINTMENT TO PATIENT
// ============================================
// Get original data from Lock de Slot
const original_data = $node["Lock de Slot"].json;
const slot = original_data.chosen_slot;
const service = original_data.service_type;

const confirmation_message = `¡Listo! 🎉 Tu cita de ${service} ha sido agendada para el ${slot.date} a las ${slot.time}.

📍 Ubicación: Clínica Dental SofIA Dent
📞 Si necesitas cambios, llámanos al +51 905 858 566

¡Te esperamos! 😊`;

const internal_note = `✅ CITA AGENDADA AUTOMÁTICAMENTE

📅 Fecha/Hora: ${slot.date} a las ${slot.time}
📋 Servicio: ${service}
👤 Paciente: ${original_data.sender_name}
📱 Teléfono: ${original_data.contact_phone}
🆔 Event ID: ${$json.id}

🤖 SofIA Fase 4 - Confirmación automática`;

return [{
    json: {
        ...original_data,
        confirmation_message: confirmation_message,
        internal_note: internal_note,
        event_id: $json.id,
        event_created: true
    }
}];"""
    },
    "id": "code-confirm-to-patient",
    "name": "Confirmar al Paciente",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [2240, -80]
}

# ==================================================
# PHASE 4 NODE 10: Send Confirmation Message
# ==================================================
send_confirmation = {
    "parameters": {
        "method": "POST",
        "url": "=https://chat.redsolucionesti.com/api/v1/accounts/{{ $json.account_id }}/conversations/{{ $json.conversation_id }}/messages",
        "sendHeaders": True,
        "headerParameters": {
            "parameters": [
                {
                    "name": "api_access_token",
                    "value": "yypAwZDH2dV3crfbqJqWCgj1"
                }
            ]
        },
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ content: $json.confirmation_message, message_type: 'outgoing', private: false }) }}",
        "options": {}
    },
    "id": "http-send-confirmation",
    "name": "Enviar Confirmación",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [2352, -80]
}

# ==================================================
# PHASE 4 NODE 11: Create Success Note
# ==================================================
create_success_note = {
    "parameters": {
        "method": "POST",
        "url": "=https://chat.redsolucionesti.com/api/v1/accounts/{{ $json.account_id }}/conversations/{{ $json.conversation_id }}/messages",
        "sendHeaders": True,
        "headerParameters": {
            "parameters": [
                {
                    "name": "api_access_token",
                    "value": "yypAwZDH2dV3crfbqJqWCgj1"
                }
            ]
        },
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ content: $json.internal_note, message_type: 'outgoing', private: true }) }}",
        "options": {}
    },
    "id": "http-success-note",
    "name": "Crear Nota Éxito",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [2464, -80]
}

# ==================================================
# PHASE 4 NODE 12: Update Attributes Success
# ==================================================
update_success_attrs = {
    "parameters": {
        "method": "PATCH",
        "url": "=https://chat.redsolucionesti.com/api/v1/accounts/{{ $json.account_id }}/conversations/{{ $json.conversation_id }}",
        "sendHeaders": True,
        "headerParameters": {
            "parameters": [
                {
                    "name": "api_access_token",
                    "value": "yypAwZDH2dV3crfbqJqWCgj1"
                }
            ]
        },
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ custom_attributes: { sofia_phase: 'PHASE_4_COMPLETE', awaiting_slot_confirmation: 'false', event_id: $json.event_id, appointment_confirmed: 'true', bot_interaction_count: ($json.bot_interaction_count || 0) + 1 } }) }}",
        "options": {}
    },
    "id": "http-update-success-attrs",
    "name": "Actualizar Attributes Éxito",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [2576, -80]
}

# ==================================================
# PHASE 4 NODE 13: Handle Calendar Error
# ==================================================
handle_calendar_error = {
    "parameters": {
        "jsCode": """// ============================================
// HANDLE CALENDAR CREATION ERROR
// ============================================
const original_data = $node["Lock de Slot"].json;
const slot = original_data.chosen_slot;

const error_message = 'Lo siento, hubo un problema al agendar tu cita. Te conecto con un agente que te ayudará de inmediato.';

const internal_note = `⚠️ ERROR AL CREAR EVENTO EN CALENDAR

📅 Slot elegido: ${slot.date} a las ${slot.time}
👤 Paciente: ${original_data.sender_name}
📋 Servicio: ${original_data.service_type}

❌ Error: No se pudo crear el evento en Google Calendar
➡️ Acción: Crear manualmente y confirmar al paciente

🤖 SofIA Fase 4 - Error de creación`;

return [{
    json: {
        ...original_data,
        escalation_message: error_message,
        escalation_note: internal_note,
        escalation_reason: 'PHASE4_CALENDAR_ERROR',
        should_escalate: true,
        event_created: false
    }
}];"""
    },
    "id": "code-handle-error",
    "name": "Manejar Error Calendar",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [2240, 80]
}

# ==================================================
# Add all Phase 4 nodes
# ==================================================
new_nodes = [
    check_slot_confirmation,
    if_awaiting_slot,
    process_slot_choice,
    if_slot_valid,
    ask_clarification,
    lock_slot,
    create_calendar_event,
    if_event_created,
    confirm_to_patient,
    send_confirmation,
    create_success_note,
    update_success_attrs,
    handle_calendar_error
]

wf['nodes'].extend(new_nodes)
print(f"[1] Added Phase 4 nodes: {len(wf['nodes'])} total nodes")

# ==================================================
# Update connections for Phase 4 integration
# ==================================================

# Insert Check Slot State between Normalizar Intent and ¿Es INFO?
# First, add the check node
wf['connections']['Normalizar Intent']['main'][0] = [
    {"node": "Check Slot Confirmation State", "type": "main", "index": 0}
]
print("[2] Connected Normalizar Intent -> Check Slot Confirmation State")

# Check Slot State -> IF Awaiting
wf['connections']['Check Slot Confirmation State'] = {
    "main": [[{"node": "¿Esperando Confirmación Slot?", "type": "main", "index": 0}]]
}
print("[3] Connected Check Slot State -> ¿Esperando Confirmación Slot?")

# IF Awaiting -> TRUE: Process Slot Choice, FALSE: Continue to ¿Es INFO?
wf['connections']['¿Esperando Confirmación Slot?'] = {
    "main": [
        [{"node": "Procesar Elección Slot", "type": "main", "index": 0}],  # TRUE
        [{"node": "¿Es INFO?", "type": "main", "index": 0}]  # FALSE
    ]
}
print("[4] Connected IF Awaiting -> Procesar Elección (TRUE) / ¿Es INFO? (FALSE)")

# Process Slot Choice -> ¿Slot Válido?
wf['connections']['Procesar Elección Slot'] = {
    "main": [[{"node": "¿Slot Válido?", "type": "main", "index": 0}]]
}
print("[5] Connected Procesar Elección -> ¿Slot Válido?")

# ¿Slot Válido? -> TRUE: Lock Slot, FALSE: Ask Clarification
wf['connections']['¿Slot Válido?'] = {
    "main": [
        [{"node": "Lock de Slot", "type": "main", "index": 0}],  # TRUE
        [{"node": "Pedir Aclaración", "type": "main", "index": 0}]  # FALSE
    ]
}
print("[6] Connected ¿Slot Válido? -> Lock (TRUE) / Aclaración (FALSE)")

# Ask Clarification -> Responder OK (end)
wf['connections']['Pedir Aclaración'] = {
    "main": [[{"node": "Responder OK", "type": "main", "index": 0}]]
}
print("[7] Connected Pedir Aclaración -> Responder OK")

# Lock Slot -> Create Calendar Event
wf['connections']['Lock de Slot'] = {
    "main": [[{"node": "Crear Evento Google Calendar", "type": "main", "index": 0}]]
}
print("[8] Connected Lock de Slot -> Crear Evento Google Calendar")

# Create Event -> ¿Evento Creado OK?
wf['connections']['Crear Evento Google Calendar'] = {
    "main": [[{"node": "¿Evento Creado OK?", "type": "main", "index": 0}]]
}
print("[9] Connected Crear Evento -> ¿Evento Creado OK?")

# ¿Evento Creado OK? -> TRUE: Confirm, FALSE: Handle Error
wf['connections']['¿Evento Creado OK?'] = {
    "main": [
        [{"node": "Confirmar al Paciente", "type": "main", "index": 0}],  # TRUE
        [{"node": "Manejar Error Calendar", "type": "main", "index": 0}]  # FALSE
    ]
}
print("[10] Connected ¿Evento Creado OK? -> Confirmar (TRUE) / Error (FALSE)")

# Confirm to Patient -> Send Confirmation
wf['connections']['Confirmar al Paciente'] = {
    "main": [[{"node": "Enviar Confirmación", "type": "main", "index": 0}]]
}
print("[11] Connected Confirmar -> Enviar Confirmación")

# Send Confirmation -> Create Success Note
wf['connections']['Enviar Confirmación'] = {
    "main": [[{"node": "Crear Nota Éxito", "type": "main", "index": 0}]]
}
print("[12] Connected Enviar Confirmación -> Crear Nota Éxito")

# Create Success Note -> Update Success Attrs
wf['connections']['Crear Nota Éxito'] = {
    "main": [[{"node": "Actualizar Attributes Éxito", "type": "main", "index": 0}]]
}
print("[13] Connected Crear Nota Éxito -> Actualizar Attributes Éxito")

# Update Success Attrs -> Responder OK
wf['connections']['Actualizar Attributes Éxito'] = {
    "main": [[{"node": "Responder OK", "type": "main", "index": 0}]]
}
print("[14] Connected Actualizar Attributes Éxito -> Responder OK")

# Handle Error -> Preparar Escalado (existing escalation flow)
wf['connections']['Manejar Error Calendar'] = {
    "main": [[{"node": "Preparar Escalado", "type": "main", "index": 0}]]
}
print("[15] Connected Manejar Error Calendar -> Preparar Escalado")

# ==================================================
# IMPORTANT: Remove old Phase 3 escalation flow
# ==================================================
# The old flow was: Marcar Esperando Confirmación -> Preparar Escalado con Slots -> Preparar Escalado
# Now Phase 3 should end after Marcar Esperando Confirmación and wait for user response
wf['connections']['Marcar Esperando Confirmación'] = {
    "main": [[{"node": "Responder OK", "type": "main", "index": 0}]]
}
print("[16] Updated: Marcar Esperando Confirmación -> Responder OK (Phase 3 ends, waits for user)")

# Save
with open('wf_COMPLETE_ALL_PHASES_WITH_PHASE4.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print(f"\n✅ [DONE] wf_COMPLETE_ALL_PHASES_WITH_PHASE4.json")
print(f"  Total nodes: {len(wf['nodes'])}")
print(f"\n🎯 [PHASE 4 COMPLETE]")
print("  Phase 1: Classification + Routing ✓")
print("  Phase 2: Google Calendar + Slot calculation ✓")
print("  Phase 3: Offer slots + Mark awaiting confirmation ✓")
print("  Phase 4: Process selection + Auto-create Calendar event ✓✓✓")
print(f"\n📊 Flow:")
print("  1️⃣ User: 'Quiero cita' → Phase 1-3: Offer 3 slots")
print("  2️⃣ User: 'La opción 2' → Phase 4: Create event + Confirm")
print("  3️⃣ Done! 🎉")
