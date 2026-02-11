#!/usr/bin/env python3
"""
Build Phase 2: Google Calendar Integration
- Read calendar events (next 7 days)
- Calculate available 30-min slots
- Respect business hours (Mon-Fri 9-19, Sat 9-14)
"""

import json

# Load Phase 1 working baseline
with open('wf_PHASE1_IF.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

print(f"Phase 1 loaded: {len(wf['nodes'])} nodes\n")

# NODE 1: Google Calendar - Get Events
calendar_node = {
    "parameters": {
        "resource": "event",
        "operation": "getAll",
        "calendarId": {
            "__rl": True,
            "value": "primary",
            "mode": "list"
        },
        "returnAll": False,
        "limit": 100,
        "options": {
            "timeMin": "={{ $now.plus({days: 0}).toISO() }}",
            "timeMax": "={{ $now.plus({days: 7}).toISO() }}",
            "singleEvents": True,
            "orderBy": "startTime"
        }
    },
    "id": "calendar-get-events",
    "name": "Google Calendar: Leer Eventos",
    "type": "n8n-nodes-base.googleCalendar",
    "typeVersion": 1,
    "position": [2128, 160],
    "credentials": {
        "googleCalendarOAuth2Api": {
            "id": "CALENDAR_OAUTH2_CREDENTIAL_ID",
            "name": "Google Calendar OAuth2"
        }
    }
}

# NODE 2: Calculate Available Slots
calculate_slots = {
    "parameters": {
        "jsCode": """// ============================================
// CALCULATE AVAILABLE 30-MIN SLOTS
// ============================================
const busy_events = $input.all();

// Horarios de negocio
const business_hours = {
  1: { start: 9, end: 19 },  // Lunes
  2: { start: 9, end: 19 },  // Martes
  3: { start: 9, end: 19 },  // Miércoles
  4: { start: 9, end: 19 },  // Jueves
  5: { start: 9, end: 19 },  // Viernes
  6: { start: 9, end: 14 },  // Sábado
  0: null,                    // Domingo - cerrado
  7: null
};

// Extraer eventos ocupados
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

// Generar todos los slots posibles para los próximos 7 días
const slots = [];
const now = new Date();
const slot_duration = 30; // minutos

for (let day = 0; day < 7; day++) {
  const date = new Date(now);
  date.setDate(date.getDate() + day);
  date.setHours(0, 0, 0, 0);

  const day_of_week = date.getDay();
  const hours = business_hours[day_of_week];

  if (!hours) continue; // Día cerrado

  // Generar slots para este día
  for (let hour = hours.start; hour < hours.end; hour++) {
    for (let minute = 0; minute < 60; minute += slot_duration) {
      const slot_start = new Date(date);
      slot_start.setHours(hour, minute, 0, 0);

      const slot_end = new Date(slot_start);
      slot_end.setMinutes(slot_end.getMinutes() + slot_duration);

      // Skip slots in the past
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

// Limitar a primeros 20 slots disponibles
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

# NODE 3: Pick 3 Best Slots
pick_slots = {
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

// Tomar los primeros 3 slots disponibles
const selected = all_slots.slice(0, 3);

// Formatear para mensaje al paciente
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
    "id": "code-pick-slots",
    "name": "Seleccionar 3 Mejores Slots",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [2576, 160]
}

# Add Phase 2 nodes
wf['nodes'].extend([calendar_node, calculate_slots, pick_slots])
print(f"[1] Added Phase 2 nodes: {len(wf['nodes'])} nodes")

# Update connections: IF false path -> Google Calendar
# Currently: ¿Es INFO? false -> Preparar Escalado
# Change to: ¿Es INFO? false -> Google Calendar
wf['connections']['¿Es INFO?']['main'][1] = [
    {"node": "Google Calendar: Leer Eventos", "type": "main", "index": 0}
]
print("[2] Updated IF false path -> Google Calendar")

# Connect Phase 2 nodes
wf['connections']['Google Calendar: Leer Eventos'] = {
    "main": [[{"node": "Calcular Slots Disponibles", "type": "main", "index": 0}]]
}
wf['connections']['Calcular Slots Disponibles'] = {
    "main": [[{"node": "Seleccionar 3 Mejores Slots", "type": "main", "index": 0}]]
}
print("[3] Connected Phase 2 nodes")

# Seleccionar 3 Mejores Slots -> Preparar Escalado (temporary, will be Phase 3 later)
wf['connections']['Seleccionar 3 Mejores Slots'] = {
    "main": [[{"node": "Preparar Escalado", "type": "main", "index": 0}]]
}
print("[4] Connected Phase 2 -> Preparar Escalado (temporary)")

# Save
with open('wf_PHASE2_CALENDAR.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print(f"\n[DONE] wf_PHASE2_CALENDAR.json created")
print(f"  Nodes: {len(wf['nodes'])}")
print(f"  Connections: {len(wf['connections'])}")
print(f"\n[INFO] Phase 2 reads calendar and calculates slots")
print(f"[TODO] Replace CALENDAR_OAUTH2_CREDENTIAL_ID with actual credential")
