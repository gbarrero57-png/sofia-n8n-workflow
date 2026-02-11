#!/usr/bin/env python3
"""
Deep comparison between WORKING and PHASE1_FINAL to find validation issue
"""
import json

with open('wf_http_WORKING.json', 'r', encoding='utf-8') as f:
    working = json.load(f)

with open('wf_PHASE1_FINAL.json', 'r', encoding='utf-8') as f:
    phase1 = json.load(f)

print("=== DEEP COMPARISON ===\n")

# Compare each node
working_nodes = {n['id']: n for n in working['nodes']}
phase1_nodes = {n['id']: n for n in phase1['nodes']}

# Find new nodes
new_node_ids = set(phase1_nodes.keys()) - set(working_nodes.keys())
if new_node_ids:
    print(f"New nodes in Phase1:")
    for nid in new_node_ids:
        node = phase1_nodes[nid]
        print(f"  {nid}: {node['name']} ({node['type']})")
        # Check if it has all required fields
        if 'parameters' not in node:
            print(f"    [ERROR] Missing 'parameters'")
        if 'position' not in node:
            print(f"    [WARNING] Missing 'position'")
        if 'typeVersion' not in node:
            print(f"    [ERROR] Missing 'typeVersion'")

# Check modified nodes
print(f"\nChecking modified nodes...")
for nid in working_nodes:
    if nid in phase1_nodes:
        w_node = working_nodes[nid]
        p_node = phase1_nodes[nid]

        # Check if jsCode changed
        if 'jsCode' in w_node.get('parameters', {}):
            w_code = w_node['parameters']['jsCode']
            p_code = p_node.get('parameters', {}).get('jsCode', '')
            if w_code != p_code:
                print(f"  {w_node['name']}: jsCode modified ({len(p_code)} chars)")

# Compare connection structures
print(f"\nConnection comparison:")
print(f"  Working: {len(working['connections'])} groups")
print(f"  Phase1: {len(phase1['connections'])} groups")

# Check for connection structure issues
for source, targets in phase1['connections'].items():
    for conn_type, output_lists in targets.items():
        for output_list in output_lists:
            for target in output_list:
                # Verify target node exists
                target_node = target['node']
                if not any(n['name'] == target_node for n in phase1['nodes']):
                    print(f"  [ERROR] Connection to non-existent node: {source} -> {target_node}")

print("\nValidation complete.")
