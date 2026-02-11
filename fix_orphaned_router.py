#!/usr/bin/env python3
"""
Remove orphaned 'Check INFO Intent' node from Phase 1 workflow
This node is bypassed by the new Router and causes validation errors
"""

import json

# Load Phase 1 Manual workflow
with open('wf_PHASE1_MANUAL.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

print(f"Loaded workflow with {len(wf['nodes'])} nodes\n")

# Remove the orphaned "Check INFO Intent" node
original_count = len(wf['nodes'])
wf['nodes'] = [n for n in wf['nodes'] if n['name'] != 'Check INFO Intent']
new_count = len(wf['nodes'])

if new_count < original_count:
    print(f"[REMOVED] 'Check INFO Intent' node (orphaned)")
    print(f"  Nodes: {original_count} -> {new_count}")
else:
    print("[WARNING] 'Check INFO Intent' not found")

# Remove its connections
if 'Check INFO Intent' in wf['connections']:
    del wf['connections']['Check INFO Intent']
    print(f"[REMOVED] Outgoing connections from 'Check INFO Intent'")

# Save
with open('wf_PHASE1_ROUTER_CLEAN.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print(f"\n[SUCCESS] Saved to wf_PHASE1_ROUTER_CLEAN.json")
print(f"   - Total nodes: {new_count}")
print(f"   - Connection groups: {len(wf['connections'])}")
print(f"\n[READY] Workflow cleaned and ready for testing")
