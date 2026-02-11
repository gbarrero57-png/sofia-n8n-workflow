#!/usr/bin/env python3
"""
Connect the EXISTING Calendar node (don't add new one, don't modify it)
"""

import json

# Load current workflow with Calendar already present
wf = json.load(open('wf_current_from_api.json', encoding='utf-8'))

print(f"Current workflow: {len(wf['nodes'])} nodes")

# Find the Explicar Agendamiento node
explicar = [n for n in wf['nodes'] if 'Explicar' in n.get('name','') and 'Agendamiento' in n.get('name','')]

if not explicar:
    print("\n[ERROR] No se encuentra 'Explicar Agendamiento'")
    print("Nombres de nodos disponibles:")
    for n in wf['nodes']:
        print(f"  - {n['name']}")
    exit(1)

explicar_name = explicar[0]['name']
print(f"\nEncontrado: {explicar_name}")

# Connect Explicar Agendamiento -> Get availability in a calendar
if explicar_name not in wf['connections']:
    wf['connections'][explicar_name] = {'main': [[]]}

wf['connections'][explicar_name]['main'][0] = [
    {"node": "Get availability in a calendar", "type": "main", "index": 0}
]
print("[1] Connected Explicar Agendamiento -> Get availability in a calendar")

# Connect Calendar -> Preparar Escalado
wf['connections']['Get availability in a calendar'] = {
    "main": [[{"node": "Preparar Escalado", "type": "main", "index": 0}]]
}
print("[2] Connected Get availability in a calendar -> Preparar Escalado")

# Save
with open('wf_CALENDAR_CONNECTED.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print(f"\n[DONE] wf_CALENDAR_CONNECTED.json")
print(f"  Total nodes: {len(wf['nodes'])} (sin cambios)")
print(f"  Calendar node: EXISTING, solo conectado")
print(f"\n[READY] Subiendo a n8n...")
