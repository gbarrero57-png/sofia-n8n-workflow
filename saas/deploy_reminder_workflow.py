#!/usr/bin/env python3
"""Deploy 24h Reminder Workflow to n8n"""
import json, requests, sys
sys.stdout.reconfigure(encoding='utf-8')

N8N_BASE_URL = "https://workflows.n8n.redsolucionesti.com"
N8N_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNzY4NTgyLCJleHAiOjE3NzMyODgwMDF9.Z3vHmfdFzKFXzVgGVxoxIuX9VDsuepcFC_9wJiK7EyM"

SUPABASE_URL = "https://inhyrrjidhzrbqecnptn.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluaHlycmppZGh6cmJxZWNucHRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwNzU3NSwiZXhwIjoyMDg2NTgzNTc1fQ.-YwX0Qf4Gn8MdjFbLxCYuCJV1OzWl2qWWk4hKuU6z7k"

# Code for fetching pending reminders
FETCH_REMINDERS_CODE = (
    '// Fetch pending reminders from Supabase\n'
    'const SUPABASE_URL = "' + SUPABASE_URL + '";\n'
    'const SERVICE_KEY = "' + SERVICE_KEY + '";\n'
    '\n'
    'let reminders;\n'
    'try {\n'
    '    reminders = await this.helpers.httpRequest({\n'
    '        method: "POST",\n'
    '        url: SUPABASE_URL + "/rest/v1/rpc/get_pending_reminders",\n'
    '        headers: {\n'
    '            "apikey": SERVICE_KEY,\n'
    '            "Authorization": "Bearer " + SERVICE_KEY,\n'
    '            "Content-Type": "application/json"\n'
    '        },\n'
    '        body: {},\n'
    '        json: true\n'
    '    });\n'
    '} catch(e) {\n'
    '    reminders = [];\n'
    '}\n'
    '\n'
    'if (!Array.isArray(reminders) || reminders.length === 0) {\n'
    '    return [{ json: { no_reminders: true, count: 0 } }];\n'
    '}\n'
    '\n'
    '// Return each reminder as separate item for split processing\n'
    'return reminders.map(r => ({\n'
    '    json: {\n'
    '        appointment_id: r.appointment_id,\n'
    '        clinic_id: r.clinic_id,\n'
    '        clinic_name: r.clinic_name,\n'
    '        patient_name: r.patient_name,\n'
    '        phone: r.phone,\n'
    '        service: r.service,\n'
    '        start_time: r.start_time,\n'
    '        chatwoot_inbox_id: r.chatwoot_inbox_id\n'
    '    }\n'
    '}));'
)

# Code for formatting reminder message
FORMAT_REMINDER_CODE = (
    '// Format reminder message for WhatsApp\n'
    'const startTime = new Date($json.start_time);\n'
    'const options = { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: true };\n'
    'const formattedDate = startTime.toLocaleDateString("es-PE", options);\n'
    '\n'
    'const message = "Hola " + ($json.patient_name || "paciente") + "! "\n'
    '    + "Le recordamos que tiene una cita programada en "\n'
    '    + ($json.clinic_name || "nuestra clinica") + " "\n'
    '    + "para manana " + formattedDate + ". "\n'
    '    + "Servicio: " + ($json.service || "Consulta") + ". "\n'
    '    + "Si necesita reprogramar, responda a este mensaje. "\n'
    '    + "Le esperamos!";\n'
    '\n'
    'return [{ json: { ...$json, reminder_message: message } }];'
)

# Code for marking reminder as sent
MARK_SENT_CODE = (
    '// Mark reminder as sent in Supabase\n'
    'const SUPABASE_URL = "' + SUPABASE_URL + '";\n'
    'const SERVICE_KEY = "' + SERVICE_KEY + '";\n'
    '\n'
    'try {\n'
    '    await this.helpers.httpRequest({\n'
    '        method: "POST",\n'
    '        url: SUPABASE_URL + "/rest/v1/rpc/mark_reminder_sent",\n'
    '        headers: {\n'
    '            "apikey": SERVICE_KEY,\n'
    '            "Authorization": "Bearer " + SERVICE_KEY,\n'
    '            "Content-Type": "application/json"\n'
    '        },\n'
    '        body: {\n'
    '            p_appointment_id: $json.appointment_id,\n'
    '            p_status: "sent",\n'
    '            p_error: null\n'
    '        },\n'
    '        json: true\n'
    '    });\n'
    '} catch(e) {\n'
    '    // Log error but continue\n'
    '}\n'
    '\n'
    'return [{ json: { ...$json, reminder_sent: true } }];'
)

# Build the workflow
workflow = {
    "name": "SofIA - 24h Reminders",
    "nodes": [
        {
            "parameters": {
                "rule": {
                    "interval": [{"field": "hours", "hoursInterval": 1}]
                }
            },
            "name": "Cron Trigger",
            "type": "n8n-nodes-base.scheduleTrigger",
            "typeVersion": 1.2,
            "position": [0, 0]
        },
        {
            "parameters": {
                "jsCode": FETCH_REMINDERS_CODE
            },
            "name": "Fetch Pending Reminders",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [220, 0]
        },
        {
            "parameters": {
                "conditions": {
                    "options": {"caseSensitive": True, "leftValue": ""},
                    "conditions": [
                        {
                            "id": "check-reminders",
                            "leftValue": "={{ $json.no_reminders }}",
                            "rightValue": True,
                            "operator": {
                                "type": "boolean",
                                "operation": "notTrue"
                            }
                        }
                    ],
                    "combinator": "and"
                }
            },
            "name": "Has Reminders?",
            "type": "n8n-nodes-base.if",
            "typeVersion": 2.2,
            "position": [440, 0]
        },
        {
            "parameters": {
                "jsCode": FORMAT_REMINDER_CODE
            },
            "name": "Format Reminder Message",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [660, -100]
        },
        {
            "parameters": {
                "method": "POST",
                "url": "=https://app.chatwoot.com/api/v1/accounts/{{ $json.chatwoot_account_id || 2 }}/conversations/{{ $json.conversation_id }}/messages",
                "authentication": "genericCredentialType",
                "genericAuthType": "httpHeaderAuth",
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": "={\"content\": {{ JSON.stringify($json.reminder_message) }}, \"message_type\": \"outgoing\"}"
            },
            "name": "Send WhatsApp Reminder",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [880, -100]
        },
        {
            "parameters": {
                "jsCode": MARK_SENT_CODE
            },
            "name": "Mark Reminder Sent",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1100, -100]
        },
        {
            "parameters": {},
            "name": "No Reminders",
            "type": "n8n-nodes-base.noOp",
            "typeVersion": 1,
            "position": [660, 100]
        }
    ],
    "connections": {
        "Cron Trigger": {
            "main": [[{"node": "Fetch Pending Reminders", "type": "main", "index": 0}]]
        },
        "Fetch Pending Reminders": {
            "main": [[{"node": "Has Reminders?", "type": "main", "index": 0}]]
        },
        "Has Reminders?": {
            "main": [
                [{"node": "Format Reminder Message", "type": "main", "index": 0}],
                [{"node": "No Reminders", "type": "main", "index": 0}]
            ]
        },
        "Format Reminder Message": {
            "main": [[{"node": "Send WhatsApp Reminder", "type": "main", "index": 0}]]
        },
        "Send WhatsApp Reminder": {
            "main": [[{"node": "Mark Reminder Sent", "type": "main", "index": 0}]]
        }
    },
    "settings": {
        "executionOrder": "v1"
    }
}

# Create the workflow
r = requests.post(f"{N8N_BASE_URL}/api/v1/workflows",
    headers={"X-N8N-API-KEY": N8N_API_KEY, "Content-Type": "application/json"},
    json=workflow)

if r.status_code in [200, 201]:
    result = r.json()
    wf_id = result.get('id', 'unknown')
    print(f"[OK] Reminder workflow created: ID={wf_id}")
    print(f"     Name: {result.get('name')}")
    print(f"     Nodes: {len(result.get('nodes', []))}")

    # Activate it
    r2 = requests.patch(f"{N8N_BASE_URL}/api/v1/workflows/{wf_id}",
        headers={"X-N8N-API-KEY": N8N_API_KEY, "Content-Type": "application/json"},
        json={"active": True})

    if r2.status_code == 200:
        print(f"[OK] Workflow activated")
    else:
        print(f"[WARN] Could not activate: {r2.status_code} - {r2.text[:200]}")
        print("     (May need Chatwoot credentials configured in n8n UI)")
else:
    print(f"[ERROR] {r.status_code}: {r.text[:500]}")
