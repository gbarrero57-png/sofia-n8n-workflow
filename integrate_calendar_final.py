#!/usr/bin/env python3
"""
Integrate real Google Calendar credential into complete workflow
"""

import json

# Load complete workflow
wf = json.load(open('wf_COMPLETE_PHASES123.json', encoding='utf-8'))

# Real credential from user's existing node
real_credential = {
    "id": "Dnin5OfNiPb8Nyl4",
    "name": "Google Calendar account"
}

print(f"Workflow loaded: {len(wf['nodes'])} nodes\n")

# Update Google Calendar node with real credential
for node in wf['nodes']:
    if node['name'] == 'Google Calendar: Leer Eventos':
        node['credentials']['googleCalendarOAuth2Api'] = real_credential

        # Also set calendar ID to primary
        node['parameters']['calendarId'] = {
            "__rl": True,
            "value": "primary",
            "mode": "list"
        }

        print(f"[UPDATED] {node['name']}")
        print(f"  Credential ID: {real_credential['id']}")
        print(f"  Calendar: primary")
        break

# Save final integrated workflow
with open('wf_FINAL_INTEGRATED.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print(f"\n[DONE] wf_FINAL_INTEGRATED.json created")
print(f"  Total nodes: {len(wf['nodes'])}")
print(f"  Google Calendar: CONFIGURED")
print(f"\n[READY] Uploading to n8n...")
