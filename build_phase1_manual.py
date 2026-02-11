#!/usr/bin/env python3
"""
Manual careful build of Phase 1 workflow
"""
import json
import copy

# Load proven working baseline
with open('wf_http_WORKING.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

print(f"Baseline loaded: {len(wf['nodes'])} nodes\n")

# CREATE ROUTER NODE - exact structure from n8n docs
router = {
    "parameters": {
        "mode": "expression",
        "output": "input",
        "rules": {
            "rules": [
                {
                    "id": "1",
                    "outputKey": "0",
                    "conditions": [
                        {
                            "leftValue": "={{ $json.intent }}",
                            "rightValue": "CREATE_EVENT",
                            "operator": {
                                "type": "string",
                                "operation": "equals"
                            }
                        }
                    ]
                },
                {
                    "id": "2",
                    "outputKey": "1",
                    "conditions": [
                        {
                            "leftValue": "={{ $json.intent }}",
                            "rightValue": "INFO",
                            "operator": {
                                "type": "string",
                                "operation": "equals"
                            }
                        }
                    ]
                },
                {
                    "id": "3",
                    "outputKey": "2",
                    "conditions": [
                        {
                            "leftValue": "={{ $json.intent }}",
                            "rightValue": "PAYMENT",
                            "operator": {
                                "type": "string",
                                "operation": "equals"
                            }
                        }
                    ]
                }
            ],
            "options": {
                "fallbackOutput": "3"
            }
        }
    },
    "id": "switch-router",
    "name": "Router de Intención",
    "type": "n8n-nodes-base.switch",
    "typeVersion": 3,
    "position": [1904, 288]
}

# Add router
wf['nodes'].append(router)
print(f"[1] Added Router: {len(wf['nodes'])} nodes")

# Update connections
# Normalizar Intent -> Router
wf['connections']['Normalizar Intent'] = {
    "main": [[{"node": "Router de Intención", "type": "main", "index": 0}]]
}
print("[2] Updated Normalizar Intent connection")

# Router -> multiple outputs
wf['connections']['Router de Intención'] = {
    "main": [
        [{"node": "Preparar Escalado", "type": "main", "index": 0}],
        [{"node": "Knowledge Base", "type": "main", "index": 0}],
        [{"node": "Preparar Escalado", "type": "main", "index": 0}],
        [{"node": "Preparar Escalado", "type": "main", "index": 0}]
    ]
}
print("[3] Created Router connections")

# Save
with open('wf_PHASE1_MANUAL.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print(f"\n[DONE] wf_PHASE1_MANUAL.json created")
print(f"  Nodes: {len(wf['nodes'])}")
print(f"  Connections: {len(wf['connections'])}")
