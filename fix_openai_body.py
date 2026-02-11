#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FIX OPENAI BODY
Agrega la configuración del body al nodo "Llamar OpenAI API"
"""

import json
import requests
import os

# Configuración
N8N_URL = "https://workflows.n8n.redsolucionesti.com"
N8N_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwMzk4NTcxLCJleHAiOjE3NzI5NDYwMDB9.7IrAZwg1Q4I3nwv0Ww1QBkXrR24EE0Oc_UMRu8v1z5g"
WORKFLOW_ID = "37SLdWISQLgkHeXk"

headers = {"X-N8N-API-KEY": N8N_API_KEY}

print("🔧 FIX OPENAI BODY")
print("=" * 50)

# 1. Descargar workflow
print("\n1️⃣ Descargando workflow...")
response = requests.get(f"{N8N_URL}/api/v1/workflows/{WORKFLOW_ID}", headers=headers)
workflow = response.json()

# 2. Encontrar el nodo "Llamar OpenAI API"
print("2️⃣ Buscando nodo 'Llamar OpenAI API'...")
nodes = workflow['nodes']
openai_node = None
openai_index = None

for i, node in enumerate(nodes):
    if node['id'] == 'http-call-openai':
        openai_node = node
        openai_index = i
        break

if not openai_node:
    print("❌ ERROR: Nodo 'Llamar OpenAI API' no encontrado")
    exit(1)

print(f"✅ Nodo encontrado en index {openai_index}")
print(f"   Config actual: {openai_node['parameters']}")

# 3. Agregar configuración del body
print("\n3️⃣ Agregando configuración del body...")

# La configuración correcta del body para OpenAI
openai_node['parameters']['sendBody'] = True
openai_node['parameters']['specifyBody'] = 'json'

# Usar raw string para evitar problemas de escapado
json_body = r'''{
  "model": "gpt-4o-mini",
  "messages": [
    { "role": "system", "content": "={{ $json.system_prompt }}" },
    { "role": "user", "content": "={{ $json.user_prompt }}" }
  ],
  "temperature": 0.3,
  "max_tokens": 500
}'''

openai_node['parameters']['jsonBody'] = '=' + json_body

print("✅ Body agregado:")
print(f"   sendBody: True")
print(f"   specifyBody: json")
print(f"   jsonBody: {json_body[:100]}...")

# 4. Actualizar workflow
print("\n4️⃣ Actualizando workflow...")

# Remover propiedades read-only
clean_workflow = {
    'name': workflow['name'],
    'nodes': workflow['nodes'],
    'connections': workflow['connections'],
    'settings': workflow.get('settings', {}),
    'staticData': workflow.get('staticData')
}

response = requests.put(
    f"{N8N_URL}/api/v1/workflows/{WORKFLOW_ID}",
    headers={**headers, "Content-Type": "application/json"},
    json=clean_workflow
)

if response.status_code == 200:
    print("✅ Workflow actualizado correctamente")
    result = response.json()
    print(f"   Version ID: {result.get('versionId', 'N/A')}")
else:
    print(f"❌ ERROR al actualizar: {response.status_code}")
    print(f"   Response: {response.text}")
    exit(1)

print("\n✅ FIX COMPLETADO")
print("=" * 50)
print("\nEl nodo 'Llamar OpenAI API' ahora tiene configurado:")
print("  ✓ Body JSON con modelo gpt-4o-mini")
print("  ✓ Mensajes con system_prompt y user_prompt")
print("  ✓ Temperature 0.3 y max_tokens 500")
