#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FIX INFO HEADERS
Copia la configuración de headers de los nodos de escalado a los nodos INFO
"""

import json

print("FIX INFO HEADERS - Configurar URLs y headers")
print("=" * 60)

# Cargar workflow
print("\n[1] Cargando workflow...")
with open('workflow_info_nodes_fixed.json', 'r', encoding='utf-8') as f:
    workflow = json.load(f)

nodes = workflow['nodes']
fixed_count = 0

# Headers y auth que funcionan (de los nodos de escalado)
working_headers = [{'name': 'api_access_token', 'value': 'yypAwZDH2dV3crfbqJqWCgj1'}]

# 1. Fix "Enviar Respuesta INFO"
print("\n[2] Configurando 'Enviar Respuesta INFO'...")
for node in nodes:
    if node['id'] == 'http-send-info-response':
        print(f"   Nodo: {node['name']}")
        # Mantener el body que ya configuramos
        # Agregar headers y URL
        node['parameters']['sendHeaders'] = True
        node['parameters']['headerParameters'] = {'parameters': working_headers}
        # Remover authentication que no funciona
        if 'authentication' in node['parameters']:
            del node['parameters']['authentication']
        if 'genericAuthType' in node['parameters']:
            del node['parameters']['genericAuthType']
        print("   [OK] Headers y URL configurados")
        fixed_count += 1
        break

# 2. Fix "Crear Nota Interna INFO"
print("\n[3] Configurando 'Crear Nota Interna INFO'...")
for node in nodes:
    if node['id'] == 'http-create-note-info':
        print(f"   Nodo: {node['name']}")
        node['parameters']['sendHeaders'] = True
        node['parameters']['headerParameters'] = {'parameters': working_headers}
        if 'authentication' in node['parameters']:
            del node['parameters']['authentication']
        if 'genericAuthType' in node['parameters']:
            del node['parameters']['genericAuthType']
        print("   [OK] Headers y URL configurados")
        fixed_count += 1
        break

# 3. Fix "Actualizar Attributes INFO"
print("\n[4] Configurando 'Actualizar Attributes INFO'...")
for node in nodes:
    if node['id'] == 'http-update-attributes-info':
        print(f"   Nodo: {node['name']}")
        # Este es PATCH en lugar de POST
        node['parameters']['sendHeaders'] = True
        node['parameters']['headerParameters'] = {'parameters': working_headers}
        if 'authentication' in node['parameters']:
            del node['parameters']['authentication']
        if 'genericAuthType' in node['parameters']:
            del node['parameters']['genericAuthType']
        print("   [OK] Headers y URL configurados")
        fixed_count += 1
        break

print(f"\n[OK] Total de nodos configurados: {fixed_count}/3")

# 4. Guardar
print("\n[5] Guardando workflow...")
clean = {
    'name': workflow['name'],
    'nodes': workflow['nodes'],
    'connections': workflow['connections'],
    'settings': workflow.get('settings', {}),
    'staticData': workflow.get('staticData')
}

with open('workflow_info_headers_fixed.json', 'w', encoding='utf-8') as f:
    json.dump(clean, f, indent=2, ensure_ascii=False)

print("   Guardado en: workflow_info_headers_fixed.json")

print("\n[DONE] FIX COMPLETADO")
print("=" * 60)
print("\nNodos configurados con headers directos:")
print("  [OK] Enviar Respuesta INFO")
print("  [OK] Crear Nota Interna INFO")
print("  [OK] Actualizar Attributes INFO")
print("\nSe removio authentication y se agrego sendHeaders con token directo")
