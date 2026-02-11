#!/usr/bin/env python3
"""
Fix missing ai_languageModel connection in wf_PHASE1_COMPLETE.json
"""

import json

# Load Phase 1 workflow
with open('wf_PHASE1_COMPLETE.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

print(f"Loaded wf_PHASE1_COMPLETE.json with {len(wf['nodes'])} nodes\n")

# Add the missing ai_languageModel connection from OpenAI Chat Model to Clasificador
if "OpenAI Chat Model" not in wf['connections']:
    wf['connections']["OpenAI Chat Model"] = {}

wf['connections']["OpenAI Chat Model"]["ai_languageModel"] = [[{
    "node": "Clasificador de Intención",
    "type": "ai_languageModel",
    "index": 0
}]]

print("[FIX] Added ai_languageModel connection: OpenAI Chat Model -> Clasificador de Intención")

# Save
with open('wf_PHASE1_FIXED.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print(f"\n[SUCCESS] Saved to wf_PHASE1_FIXED.json")
print(f"   - Total nodes: {len(wf['nodes'])}")
print(f"   - Total connection groups: {len(wf['connections'])}")
print(f"\n[READY] Workflow should now pass n8n validation")
