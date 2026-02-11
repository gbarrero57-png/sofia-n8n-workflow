#!/usr/bin/env python3
"""
Analyze how typeVersion 1 Switch node works
"""

import json

wf = json.load(open('wf_bypass.json', encoding='utf-8'))
router = [n for n in wf['nodes'] if n['type'] == 'n8n-nodes-base.switch'][0]

print('=== ROUTER NODE ===')
print(json.dumps(router, indent=2, ensure_ascii=False))

print('\n\n=== CONNECTIONS TO ROUTER ===')
for src, conns in wf['connections'].items():
    for output_type, conn_lists in conns.items():
        for conn_list in conn_lists:
            for conn in conn_list:
                if conn.get('node') == 'Router de Intención':
                    print(f'  {src} ({output_type}) -> Router')

print('\n\n=== NODE BEFORE ROUTER ===')
# Find the node that connects to Router
for src, conns in wf['connections'].items():
    for output_type, conn_lists in conns.items():
        for conn_list in conn_lists:
            for conn in conn_list:
                if conn.get('node') == 'Router de Intención':
                    prev_node = [n for n in wf['nodes'] if n['name'] == src][0]
                    print(f'Node: {prev_node["name"]}')
                    print(f'Type: {prev_node["type"]}')
                    if 'jsCode' in prev_node.get('parameters', {}):
                        code = prev_node['parameters']['jsCode']
                        print(f'\nCode preview (first 500 chars):')
                        print(code[:500])
