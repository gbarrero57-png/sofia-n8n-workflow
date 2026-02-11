#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FIX EXTRACT NODE
Corrige el nodo "Extraer Respuesta LLM" para preservar datos anteriores
"""

import json

print("FIX EXTRACT NODE - Preservar datos conversation_id y account_id")
print("=" * 70)

# Cargar workflow
print("\n[1] Cargando workflow...")
with open('workflow_info_headers_fixed.json', 'r', encoding='utf-8') as f:
    workflow = json.load(f)

nodes = workflow['nodes']

# Fix "Extraer Respuesta LLM"
print("\n[2] Corrigiendo 'Extraer Respuesta LLM'...")
for node in nodes:
    if node['id'] == 'code-extract-response':
        print(f"   Nodo: {node['name']}")
        print("   Codigo anterior usa: $input.all()[0].json")
        print("   Problema: Pierde datos de conversation_id, account_id, etc.")
        print()

        # Nuevo código que referencia explícitamente el nodo "Preparar Prompt INFO"
        new_code = '''// Extraer respuesta del LLM
const response = $json;

// La respuesta de OpenAI viene en response.choices[0].message.content
const llm_response = response.choices?.[0]?.message?.content || '';

// Obtener datos originales del nodo "Preparar Prompt INFO"
const original_data = $node["Preparar Prompt INFO"].json;

return [{
  json: {
    ...original_data,  // Todos los datos originales (conversation_id, account_id, etc.)
    llm_response: llm_response.trim()
  }
}];'''

        node['parameters']['jsCode'] = new_code
        print("   Codigo nuevo usa: $node['Preparar Prompt INFO'].json")
        print("   [OK] Preserva conversation_id, account_id, y todos los datos")
        break

# Guardar
print("\n[3] Guardando workflow...")
clean = {
    'name': workflow['name'],
    'nodes': workflow['nodes'],
    'connections': workflow['connections'],
    'settings': workflow.get('settings', {}),
    'staticData': workflow.get('staticData')
}

with open('workflow_extract_fixed.json', 'w', encoding='utf-8') as f:
    json.dump(clean, f, indent=2, ensure_ascii=False)

print("   Guardado en: workflow_extract_fixed.json")

print("\n[DONE] FIX COMPLETADO")
print("=" * 70)
print("\nAhora el nodo 'Extraer Respuesta LLM' preserva correctamente:")
print("  - conversation_id")
print("  - account_id")
print("  - intent")
print("  - confidence")
print("  - message_text")
print("  - knowledge_base")
print("  - Y agrega: llm_response")
