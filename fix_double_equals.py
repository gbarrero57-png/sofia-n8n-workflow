#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FIX DOUBLE EQUALS
Quita el = extra de {{ expression }} en los nodos INFO
"""

import json
import re

print("FIX DOUBLE EQUALS - Corregir sintaxis ={{ }} a {{ }}")
print("=" * 70)

# Cargar workflow
print("\n[1] Cargando workflow...")
with open('workflow_extract_fixed.json', 'r', encoding='utf-8') as f:
    workflow = json.load(f)

nodes = workflow['nodes']
fixed_count = 0

# Función para corregir el jsonBody
def fix_json_body(json_body):
    """Quita el = extra de ={{ expression }} convirtiendolo a {{ expression }}"""
    # Patrón: ={{ seguido de algo hasta }}
    pattern = r'=\{\{\s*(\$[^}]+)\s*\}\}'
    replacement = r'{{ \1 }}'
    fixed = re.sub(pattern, replacement, json_body)
    return fixed

# Fix nodos INFO
info_node_ids = ['http-send-info-response', 'http-create-note-info', 'http-update-attributes-info']

for nid in info_node_ids:
    for node in nodes:
        if node['id'] == nid:
            print(f"\n[{fixed_count+2}] Corrigiendo '{node['name']}'...")

            if 'jsonBody' in node['parameters']:
                old_body = node['parameters']['jsonBody']
                new_body = fix_json_body(old_body)

                if old_body != new_body:
                    node['parameters']['jsonBody'] = new_body
                    print(f"   [OK] Corregido: ={{{{ -> {{{{")
                    fixed_count += 1
                else:
                    print(f"   [SKIP] Ya estaba correcto")
            break

print(f"\n[OK] Total de nodos corregidos: {fixed_count}/3")

# Guardar
print("\n[5] Guardando workflow...")
clean = {
    'name': workflow['name'],
    'nodes': workflow['nodes'],
    'connections': workflow['connections'],
    'settings': workflow.get('settings', {}),
    'staticData': workflow.get('staticData')
}

with open('workflow_syntax_fixed.json', 'w', encoding='utf-8') as f:
    json.dump(clean, f, indent=2, ensure_ascii=False)

print("   Guardado en: workflow_syntax_fixed.json")

print("\n[DONE] FIX COMPLETADO")
print("=" * 70)
print("\nCorrección aplicada:")
print("  ANTES: ={{ $json.llm_response }}")
print("  AHORA: {{ $json.llm_response }}")
