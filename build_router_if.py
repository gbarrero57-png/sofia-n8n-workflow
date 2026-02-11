#!/usr/bin/env python3
"""
Build Phase 1 using IF nodes instead of Switch for reliable routing
"""

import json

# Load working baseline
with open('wf_http_WORKING.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

print(f"Baseline loaded: {len(wf['nodes'])} nodes\n")

# CREATE IF NODE: Check if INFO intent
if_info = {
    "parameters": {
        "conditions": {
            "options": {
                "caseSensitive": True,
                "leftValue": "",
                "typeValidation": "strict"
            },
            "conditions": [
                {
                    "id": "info-condition",
                    "leftValue": "={{ $json.intent }}",
                    "rightValue": "INFO",
                    "operator": {
                        "type": "string",
                        "operation": "equals",
                        "rightType": "any"
                    }
                }
            ],
            "combinator": "and"
        }
    },
    "id": "if-info",
    "name": "¿Es INFO?",
    "type": "n8n-nodes-base.if",
    "typeVersion": 2,
    "position": [1904, 288]
}

# Add IF node
wf['nodes'].append(if_info)
print(f"[1] Added IF node: {len(wf['nodes'])} nodes")

# Remove orphaned "Check INFO Intent" node
wf['nodes'] = [n for n in wf['nodes'] if n['name'] != 'Check INFO Intent']
print(f"[2] Removed Check INFO Intent: {len(wf['nodes'])} nodes")

# Remove its connections
if 'Check INFO Intent' in wf['connections']:
    del wf['connections']['Check INFO Intent']
    print(f"[3] Removed Check INFO Intent connections")

# Update Normalizar Intent connection to IF
wf['connections']['Normalizar Intent'] = {
    "main": [[{"node": "¿Es INFO?", "type": "main", "index": 0}]]
}
print("[4] Updated Normalizar Intent -> ¿Es INFO?")

# IF node connections (true=Knowledge Base, false=Preparar Escalado)
wf['connections']['¿Es INFO?'] = {
    "main": [
        [{"node": "Knowledge Base", "type": "main", "index": 0}],      # true
        [{"node": "Preparar Escalado", "type": "main", "index": 0}]    # false
    ]
}
print("[5] Created IF connections (true=Knowledge Base, false=Escalate)")

# Save
with open('wf_PHASE1_IF.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print(f"\n[DONE] wf_PHASE1_IF.json created")
print(f"  Nodes: {len(wf['nodes'])}")
print(f"  Connections: {len(wf['connections'])}")
print(f"\n[READY] Phase 1 with IF-based routing (simpler and reliable)")
