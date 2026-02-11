#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FIX INFO NODES
Configura el body JSON para los 3 nodos HTTP de Fase 2 INFO
"""

import json

print("FIX INFO NODES - Configurar body JSON")
print("=" * 60)

# Cargar workflow actual
print("\n[1] Cargando workflow...")
with open('workflow_actual_jwt.json', 'r', encoding='utf-8') as f:
    workflow = json.load(f)

nodes = workflow['nodes']
fixed_count = 0

# 2. Configurar "Enviar Respuesta INFO"
print("\n[2] Configurando 'Enviar Respuesta INFO'...")
for node in nodes:
    if node['id'] == 'http-send-info-response':
        print(f"   Nodo encontrado: {node['name']}")
        node['parameters']['sendBody'] = True
        node['parameters']['specifyBody'] = 'json'
        node['parameters']['jsonBody'] = '''={
  "content": "={{ $json.llm_response }}",
  "message_type": "outgoing",
  "private": false
}'''
        print("   [OK] Body configurado")
        fixed_count += 1
        break

# 3. Configurar "Crear Nota Interna INFO"
print("\n[3] Configurando 'Crear Nota Interna INFO'...")
for node in nodes:
    if node['id'] == 'http-create-note-info':
        print(f"   Nodo encontrado: {node['name']}")
        node['parameters']['sendBody'] = True
        node['parameters']['specifyBody'] = 'json'
        node['parameters']['jsonBody'] = r'''={
  "content": "SofIA (Fase 2 - INFO)\n\nPregunta: \"={{ $json.message_text }}\"\nRespuesta: \"={{ $json.llm_response }}\"\nValidacion: {{ $json.validation_passed ? 'PASSED' : 'FAILED' }}\nConfianza: {{ $json.confidence }}",
  "message_type": "outgoing",
  "private": true
}'''
        print("   [OK] Body configurado")
        fixed_count += 1
        break

# 4. Configurar "Actualizar Attributes INFO"
print("\n[4] Configurando 'Actualizar Attributes INFO'...")
for node in nodes:
    if node['id'] == 'http-update-attributes-info':
        print(f"   Nodo encontrado: {node['name']}")
        node['parameters']['sendBody'] = True
        node['parameters']['specifyBody'] = 'json'
        node['parameters']['jsonBody'] = '''={
  "custom_attributes": {
    "bot_handled": true,
    "intent_detected": "={{ $json.intent }}",
    "confidence": "={{ $json.confidence }}",
    "bot_interaction_count": {{ ($json.bot_interaction_count || 0) + 1 }},
    "last_bot_message_at": "={{ $now.toISO() }}",
    "sofia_phase": "PHASE_2_INFO",
    "info_response_sent": true
  }
}'''
        print("   [OK] Body configurado")
        fixed_count += 1
        break

print(f"\n[OK] Total de nodos configurados: {fixed_count}/3")

# 5. Guardar workflow limpio
print("\n[5] Guardando workflow...")
clean = {
    'name': workflow['name'],
    'nodes': workflow['nodes'],
    'connections': workflow['connections'],
    'settings': workflow.get('settings', {}),
    'staticData': workflow.get('staticData')
}

with open('workflow_info_nodes_fixed.json', 'w', encoding='utf-8') as f:
    json.dump(clean, f, indent=2, ensure_ascii=False)

print("   Guardado en: workflow_info_nodes_fixed.json")

print("\n[DONE] FIX COMPLETADO")
print("=" * 60)
print("\nNodos configurados:")
print("  [OK] Enviar Respuesta INFO - body con llm_response")
print("  [OK] Crear Nota Interna INFO - body con nota de debug")
print("  [OK] Actualizar Attributes INFO - body con custom_attributes")
