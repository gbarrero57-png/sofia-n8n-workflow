#!/usr/bin/env python3
"""
Build Phase 1 with Router using typeVersion 1 (simpler structure)
"""

import json

# Load working baseline
with open('wf_http_WORKING.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

print(f"Baseline loaded: {len(wf['nodes'])} nodes\n")

# CREATE ROUTER NODE with typeVersion 1
router = {
    "parameters": {
        "rules": {
            "rules": [
                {},  # First rule is empty for output 0
                {"output": 1},
                {"output": 2},
                {"output": 3}
            ]
        },
        "fallbackOutput": 3
    },
    "id": "switch-router",
    "name": "Router de Intención",
    "type": "n8n-nodes-base.switch",
    "typeVersion": 1,
    "position": [1904, 288]
}

# Add router
wf['nodes'].append(router)
print(f"[1] Added Router (typeVersion 1): {len(wf['nodes'])} nodes")

# Remove orphaned "Check INFO Intent" node
wf['nodes'] = [n for n in wf['nodes'] if n['name'] != 'Check INFO Intent']
print(f"[2] Removed Check INFO Intent: {len(wf['nodes'])} nodes")

# Remove its connections
if 'Check INFO Intent' in wf['connections']:
    del wf['connections']['Check INFO Intent']
    print(f"[3] Removed Check INFO Intent connections")

# Update Normalizar Intent connection
wf['connections']['Normalizar Intent'] = {
    "main": [[{"node": "Router de Intención", "type": "main", "index": 0}]]
}
print("[4] Updated Normalizar Intent -> Router de Intención")

# Router -> multiple outputs
wf['connections']['Router de Intención'] = {
    "main": [
        [{"node": "Preparar Escalado", "type": "main", "index": 0}],  # CREATE_EVENT
        [{"node": "Knowledge Base", "type": "main", "index": 0}],     # INFO
        [{"node": "Preparar Escalado", "type": "main", "index": 0}],  # PAYMENT
        [{"node": "Preparar Escalado", "type": "main", "index": 0}]   # HUMAN
    ]
}
print("[5] Created Router connections (4 outputs)")

# Save
with open('wf_PHASE1_V1.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print(f"\n[DONE] wf_PHASE1_V1.json created")
print(f"  Nodes: {len(wf['nodes'])}")
print(f"  Connections: {len(wf['connections'])}")
print(f"\nNote: Using Switch typeVersion 1 (simpler structure)")
