#!/usr/bin/env python3
"""
Build Phase 1 with Router typeVersion 1 + numeric output mapping
"""

import json

# Load working baseline
with open('wf_http_WORKING.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

print(f"Baseline loaded: {len(wf['nodes'])} nodes\n")

# MODIFY NORMALIZAR INTENT to add numeric output field
norm_idx = next(i for i, n in enumerate(wf['nodes']) if n['name'] == 'Normalizar Intent')
new_normalizar_code = """// ============================================
// NORMALIZAR OUTPUT DEL CLASIFICADOR
// ============================================
let intent_data = $json.output || $json;

if (typeof intent_data === 'string') {
  try {
    intent_data = JSON.parse(intent_data);
  } catch (e) {
    const text = intent_data.toLowerCase();
    if (text.includes('create_event')) {
      intent_data = { intent: 'CREATE_EVENT', confidence: 'low' };
    } else if (text.includes('info')) {
      intent_data = { intent: 'INFO', confidence: 'low' };
    } else if (text.includes('payment')) {
      intent_data = { intent: 'PAYMENT', confidence: 'low' };
    } else {
      intent_data = { intent: 'HUMAN', confidence: 'low' };
    }
  }
}

let intent = (intent_data.intent || 'HUMAN').trim().toUpperCase();
let confidence = (intent_data.confidence || 'low').toLowerCase();

const valid_intents = ['CREATE_EVENT', 'INFO', 'PAYMENT', 'HUMAN'];
if (!valid_intents.includes(intent)) {
  intent = 'HUMAN';
  confidence = 'low';
}

// Map intent to numeric output for Switch node
const output_map = {
  'CREATE_EVENT': 0,
  'INFO': 1,
  'PAYMENT': 2,
  'HUMAN': 3
};

return [{
  json: {
    ...$json,
    intent: intent,
    confidence: confidence,
    output: output_map[intent],  // ADD THIS FOR SWITCH NODE
    classified_at: new Date().toISOString(),
    phase: 'PHASE_1_ROUTER_TESTING'
  }
}];"""

wf['nodes'][norm_idx]['parameters']['jsCode'] = new_normalizar_code
print(f"[1] Modified Normalizar Intent to add numeric output field")

# CREATE ROUTER NODE with typeVersion 1
router = {
    "parameters": {
        "rules": {
            "rules": [
                {},  # Output 0
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
print(f"[2] Added Router (typeVersion 1): {len(wf['nodes'])} nodes")

# Remove orphaned "Check INFO Intent" node
wf['nodes'] = [n for n in wf['nodes'] if n['name'] != 'Check INFO Intent']
print(f"[3] Removed Check INFO Intent: {len(wf['nodes'])} nodes")

# Remove its connections
if 'Check INFO Intent' in wf['connections']:
    del wf['connections']['Check INFO Intent']
    print(f"[4] Removed Check INFO Intent connections")

# Update Normalizar Intent connection
wf['connections']['Normalizar Intent'] = {
    "main": [[{"node": "Router de Intención", "type": "main", "index": 0}]]
}
print("[5] Updated Normalizar Intent -> Router de Intención")

# Router -> multiple outputs
wf['connections']['Router de Intención'] = {
    "main": [
        [{"node": "Preparar Escalado", "type": "main", "index": 0}],  # 0: CREATE_EVENT
        [{"node": "Knowledge Base", "type": "main", "index": 0}],     # 1: INFO
        [{"node": "Preparar Escalado", "type": "main", "index": 0}],  # 2: PAYMENT
        [{"node": "Preparar Escalado", "type": "main", "index": 0}]   # 3: HUMAN
    ]
}
print("[6] Created Router connections (4 outputs)")

# Save
with open('wf_PHASE1_WORKING.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print(f"\n[DONE] wf_PHASE1_WORKING.json created")
print(f"  Nodes: {len(wf['nodes'])}")
print(f"  Connections: {len(wf['connections'])}")
print(f"\n[READY] Phase 1 Router with numeric output mapping")
