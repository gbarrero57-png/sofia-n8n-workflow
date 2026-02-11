#!/usr/bin/env python3
"""
Fix Phase 3 authentication to match baseline (API token in header)
"""

import json

wf = json.load(open('wf_COMPLETE_PHASES123.json', encoding='utf-8'))

# Find and update Phase 3 HTTP nodes
for node in wf['nodes']:
    if node['name'] in ['Enviar Oferta Chatwoot', 'Marcar Esperando Confirmación']:
        # Remove credential authentication
        if 'credentials' in node:
            del node['credentials']

        # Set to no authentication (API token will be in header)
        node['parameters']['authentication'] = 'none'

        # Add API token header
        node['parameters']['options'] = {
            'headerParameters': {
                'parameters': [
                    {
                        'name': 'api_access_token',
                        'value': 'yypAwZDH2dV3crfbqJqWCgj1'
                    }
                ]
            }
        }

        print(f'Fixed auth for: {node["name"]}')

# Save
with open('wf_COMPLETE_PHASES123.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print('\nPhase 3 authentication updated')
