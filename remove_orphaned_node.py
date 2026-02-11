#!/usr/bin/env python3
"""
Remove orphaned 'Check INFO Intent' node from Phase 1 workflow
"""

import json

# Load Phase 1 workflow
with open('wf_PHASE1_FIXED.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

print(f"Loaded workflow with {len(wf['nodes'])} nodes\n")

# Remove the orphaned "Check INFO Intent" node
original_count = len(wf['nodes'])
wf['nodes'] = [n for n in wf['nodes'] if n['name'] != 'Check INFO Intent']
new_count = len(wf['nodes'])

if new_count < original_count:
    print(f"[REMOVED] 'Check INFO Intent' node (orphaned)")
else:
    print("[WARNING] 'Check INFO Intent' not found")

# Also remove its connections
if 'Check INFO Intent' in wf['connections']:
    del wf['connections']['Check INFO Intent']
    print(f"[REMOVED] Connections from 'Check INFO Intent'")

# Save
with open('wf_PHASE1_CLEAN.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print(f"\n[SUCCESS] Saved to wf_PHASE1_CLEAN.json")
print(f"   - Nodes: {original_count} -> {new_count}")
print(f"   - Connection groups: {len(wf['connections'])}")
print(f"\n[READY] Workflow cleaned and ready for testing")
