import json

# Load Phase 1 workflow
with open('wf_PHASE1_COMPLETE.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

print('=== VALIDATION CHECK ===\n')

# Check 1: Duplicate node IDs
node_ids = [n['id'] for n in wf['nodes']]
duplicates = [id for id in node_ids if node_ids.count(id) > 1]
if duplicates:
    print(f'[ERROR] Duplicate node IDs: {set(duplicates)}')
else:
    print('[OK] No duplicate node IDs')

# Check 2: All connections reference existing nodes
all_node_names = [n['name'] for n in wf['nodes']]
print(f'\n[OK] Total nodes: {len(all_node_names)}')

missing_refs = []
for source, targets in wf['connections'].items():
    if source not in all_node_names:
        missing_refs.append(f'Source node "{source}" in connections but not in nodes')
    for output_list in targets.get('main', []):
        for target in output_list:
            if target['node'] not in all_node_names:
                missing_refs.append(f'Target "{target["node"]}" referenced from "{source}" does not exist')

if missing_refs:
    print(f'\n[ERROR] Invalid connections:')
    for ref in missing_refs:
        print(f'  - {ref}')
else:
    print('[OK] All connections valid')

# Check 3: Check for nodes without required fields
print('\n[CHECK] Node completeness:')
for node in wf['nodes']:
    if 'id' not in node:
        print(f'  [ERROR] Node "{node.get("name", "unnamed")}" missing id')
    if 'name' not in node:
        print(f'  [ERROR] Node with id "{node.get("id", "no-id")}" missing name')
    if 'type' not in node:
        print(f'  [ERROR] Node "{node.get("name", "unnamed")}" missing type')
    if 'position' not in node:
        print(f'  [WARNING] Node "{node.get("name", "unnamed")}" missing position')

print('\nAll node names:')
for i, name in enumerate(all_node_names, 1):
    print(f'  {i}. {name}')
