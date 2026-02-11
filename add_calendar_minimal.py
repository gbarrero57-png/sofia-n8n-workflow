#!/usr/bin/env python3
"""
Add Calendar minimally - just read events and show in escalation
"""

import json

# Load Phase 1 working
wf = json.load(open('wf_PHASE1_COMPLETE_WORKING.json', encoding='utf-8'))

print(f"Phase 1 loaded: {len(wf['nodes'])} nodes\n")

# Add JUST Google Calendar node
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
        "limit": 50,
        "options": {
            "timeMin": "={{ $now.toISO() }}",
            "timeMax": "={{ $now.plus({days: 7}).toISO() }}",
            "singleEvents": True,
            "orderBy": "startTime"
        }
    },
    "id": "calendar-get-events",
    "name": "Google Calendar Eventos",
    "type": "n8n-nodes-base.googleCalendar",
    "typeVersion": 1.3,
    "position": [2352, 416],
    "credentials": {
        "googleCalendarOAuth2Api": {
            "id": "Dnin5OfNiPb8Nyl4",
            "name": "Google Calendar account"
        }
    }
}

wf['nodes'].append(calendar_node)
print(f"[1] Added Calendar node: {len(wf['nodes'])} nodes")

# Connect: Explicar Agendamiento -> Calendar
wf['connections']['Explicar Agendamiento']['main'][0] = [
    {"node": "Google Calendar Eventos", "type": "main", "index": 0}
]
print("[2] Connected Explicar Agendamiento -> Calendar")

# Calendar -> Preparar Escalado
wf['connections']['Google Calendar Eventos'] = {
    "main": [[{"node": "Preparar Escalado", "type": "main", "index": 0}]]
}
print("[3] Connected Calendar -> Preparar Escalado")

# Save
with open('wf_WITH_CALENDAR_MINIMAL.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print(f"\n[DONE] wf_WITH_CALENDAR_MINIMAL.json")
print(f"  Nodes: {len(wf['nodes'])}")
print(f"  Calendar: Configured with real credential")
