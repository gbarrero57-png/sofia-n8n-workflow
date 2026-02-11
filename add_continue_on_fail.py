#!/usr/bin/env python3
"""
Add continueOnFail to Chatwoot HTTP nodes for testing
This allows the workflow to complete even if conversation IDs don't exist
"""

import json

# Load fixed workflow
wf = json.load(open('wf_phase4_fixed.json', 'r', encoding='utf-8'))

print(f"Nodes: {len(wf['nodes'])}")

# Find all HTTP nodes that connect to Chatwoot
chatwoot_nodes = [
    "Enviar Oferta Chatwoot",
    "Marcar Esperando Confirmación",
    "Enviar Mensaje Escalado",
    "Crear Nota Interna",
    "Actualizar Custom Attributes",
    "Enviar Respuesta INFO",
    "Crear Nota Interna INFO",
    "Actualizar Attributes INFO",
    "Pedir Aclaración",
    "Enviar Confirmación",
    "Crear Nota Éxito",
    "Actualizar Attributes Éxito"
]

updated_count = 0
for node in wf['nodes']:
    if node['name'] in chatwoot_nodes:
        # Add continueOnFail to node settings
        if 'continueOnFail' not in node:
            node['continueOnFail'] = True
            updated_count += 1
            print(f"  [OK] Added continueOnFail to: {node['name']}")

print(f"\n[UPDATED] {updated_count} nodes with continueOnFail")

# Clean workflow for API
clean_wf = {
    'name': wf['name'],
    'nodes': wf['nodes'],
    'connections': wf['connections'],
    'settings': wf.get('settings', {}),
    'staticData': wf.get('staticData', None)
}

# Save
with open('wf_phase4_testing.json', 'w', encoding='utf-8') as f:
    json.dump(clean_wf, f, indent=2, ensure_ascii=False)

print(f"\n[DONE] wf_phase4_testing.json")
print("  Workflow will now continue even if Chatwoot returns 404")
print("  This allows testing the complete logic flow")
