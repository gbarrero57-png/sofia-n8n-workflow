#!/usr/bin/env python3
"""
Upload Phase 4 workflow to n8n
"""

import json
import requests
import sys

# Load workflow
wf = json.load(open('wf_COMPLETE_ALL_PHASES_WITH_PHASE4.json', 'r', encoding='utf-8'))

# Clean for API (only 5 allowed fields)
clean_wf = {
    'name': wf['name'],
    'nodes': wf['nodes'],
    'connections': wf['connections'],
    'settings': wf.get('settings', {}),
    'staticData': wf.get('staticData', None)
}

print(f"Uploading workflow: {clean_wf['name']}")
print(f"  Nodes: {len(clean_wf['nodes'])}")
print(f"  Connections: {len(clean_wf['connections'])}")

# Get existing workflow ID
response = requests.get(
    'https://workflows.n8n.redsolucionesti.com/api/v1/workflows',
    headers={'X-N8N-API-KEY': 'n8n_api_b4d3c2a1e5f6g7h8i9j0k1l2m3n4o5p6'}
)

if response.status_code != 200:
    print(f"Error getting workflows: {response.status_code}")
    print(response.text)
    sys.exit(1)

workflows = response.json()['data']
sofia_wf = next((w for w in workflows if w['name'] == 'Sofia'), None)

if not sofia_wf:
    print("Error: Sofia workflow not found")
    sys.exit(1)

workflow_id = sofia_wf['id']
print(f"\nFound workflow ID: {workflow_id}")

# Update workflow
response = requests.put(
    f'https://workflows.n8n.redsolucionesti.com/api/v1/workflows/{workflow_id}',
    headers={
        'X-N8N-API-KEY': 'n8n_api_b4d3c2a1e5f6g7h8i9j0k1l2m3n4o5p6',
        'Content-Type': 'application/json'
    },
    json=clean_wf
)

if response.status_code == 200:
    print("\n[SUCCESS] Workflow updated!")
    print(f"  ID: {workflow_id}")
    print(f"  Nodes: {len(clean_wf['nodes'])}")
    print("\n[PHASE 4 DEPLOYED]")
    print("  Complete appointment booking automation enabled!")
else:
    print(f"\n[ERROR] {response.status_code}")
    print(response.text)
    sys.exit(1)
