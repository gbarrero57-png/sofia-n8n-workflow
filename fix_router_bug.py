#!/usr/bin/env python3
"""
Fix Router de Intención bug - remove non-existent node from connections
"""

import json

# Load current workflow
wf = json.load(open('wf_status.json', 'r', encoding='utf-8'))

print(f"Current nodes: {len(wf['nodes'])}")
print(f"Current connections: {len(wf['connections'])}")

# Check if Router de Intención node exists
router_exists = 'Router de Intención' in [n['name'] for n in wf['nodes']]
print(f"\n'Router de Intención' node exists: {router_exists}")

# Remove Router de Intención from connections if node doesn't exist
if not router_exists and 'Router de Intención' in wf['connections']:
    print("\n[FIX] Removing 'Router de Intención' from connections...")
    del wf['connections']['Router de Intención']
    print(f"[OK] Removed. New connection count: {len(wf['connections'])}")

# Clean workflow for API
clean_wf = {
    'name': wf['name'],
    'nodes': wf['nodes'],
    'connections': wf['connections'],
    'settings': wf.get('settings', {}),
    'staticData': wf.get('staticData', None)
}

# Save fixed workflow
with open('wf_phase4_fixed.json', 'w', encoding='utf-8') as f:
    json.dump(clean_wf, f, indent=2, ensure_ascii=False)

print(f"\n[DONE] Fixed workflow saved: wf_phase4_fixed.json")
print(f"  Nodes: {len(clean_wf['nodes'])}")
print(f"  Connections: {len(clean_wf['connections'])}")
