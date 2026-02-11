"""
Script para configurar las conexiones de Fase 2
"""
import json

# Cargar workflow con nodos
with open('workflow_fase2_nodos.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

print('=== CONFIGURANDO CONEXIONES FASE 2 ===\n')

# Las conexiones actuales del workflow
connections = wf.get('connections', {})

print('Conexiones antes:', len(connections))

# Configurar nuevas conexiones para el flujo INFO
# Router de Intención (salida 1 - INFO) → Knowledge Base
connections['Router de Intención'] = connections.get('Router de Intención', {})
connections['Router de Intención']['main'] = connections['Router de Intención'].get('main', [[], [], [], []])

# Asegurar que la salida 1 (INFO) conecte a Knowledge Base
if len(connections['Router de Intención']['main']) < 2:
    connections['Router de Intención']['main'].append([])

connections['Router de Intención']['main'][1] = [
    {
        "node": "Knowledge Base",
        "type": "main",
        "index": 0
    }
]

print('[OK] Router -> Knowledge Base')

# Knowledge Base → Preparar Prompt INFO
connections['Knowledge Base'] = {
    "main": [
        [
            {
                "node": "Preparar Prompt INFO",
                "type": "main",
                "index": 0
            }
        ]
    ]
}

print('[OK] Knowledge Base -> Preparar Prompt INFO')

# Preparar Prompt INFO → Llamar OpenAI API
connections['Preparar Prompt INFO'] = {
    "main": [
        [
            {
                "node": "Llamar OpenAI API",
                "type": "main",
                "index": 0
            }
        ]
    ]
}

print('[OK] Preparar Prompt INFO -> Llamar OpenAI API')

# Llamar OpenAI API → Extraer Respuesta LLM
connections['Llamar OpenAI API'] = {
    "main": [
        [
            {
                "node": "Extraer Respuesta LLM",
                "type": "main",
                "index": 0
            }
        ]
    ]
}

print('[OK] Llamar OpenAI API -> Extraer Respuesta LLM')

# Extraer Respuesta LLM → Validar Respuesta
connections['Extraer Respuesta LLM'] = {
    "main": [
        [
            {
                "node": "Validar Respuesta",
                "type": "main",
                "index": 0
            }
        ]
    ]
}

print('[OK] Extraer Respuesta LLM -> Validar Respuesta')

# Validar Respuesta → ¿Respuesta Válida?
connections['Validar Respuesta'] = {
    "main": [
        [
            {
                "node": "\u00bfRespuesta V\u00e1lida?",
                "type": "main",
                "index": 0
            }
        ]
    ]
}

print('[OK] Validar Respuesta -> ¿Respuesta Valida?')

# ¿Respuesta Válida? → TRUE: Enviar Respuesta INFO
# ¿Respuesta Válida? → FALSE: Preparar Escalado
connections['\u00bfRespuesta V\u00e1lida?'] = {
    "main": [
        [
            {
                "node": "Enviar Respuesta INFO",
                "type": "main",
                "index": 0
            }
        ],
        [
            {
                "node": "Preparar Escalado",
                "type": "main",
                "index": 0
            }
        ]
    ]
}

print('[OK] ¿Respuesta Valida? -> Enviar Respuesta INFO (TRUE)')
print('[OK] ¿Respuesta Valida? -> Preparar Escalado (FALSE)')

# Enviar Respuesta INFO → Crear Nota Interna INFO
connections['Enviar Respuesta INFO'] = {
    "main": [
        [
            {
                "node": "Crear Nota Interna INFO",
                "type": "main",
                "index": 0
            }
        ]
    ]
}

print('[OK] Enviar Respuesta INFO -> Crear Nota Interna INFO')

# Crear Nota Interna INFO → Actualizar Attributes INFO
connections['Crear Nota Interna INFO'] = {
    "main": [
        [
            {
                "node": "Actualizar Attributes INFO",
                "type": "main",
                "index": 0
            }
        ]
    ]
}

print('[OK] Crear Nota Interna INFO -> Actualizar Attributes INFO')

# Actualizar Attributes INFO → Responder OK
connections['Actualizar Attributes INFO'] = {
    "main": [
        [
            {
                "node": "Responder OK",
                "type": "main",
                "index": 0
            }
        ]
    ]
}

print('[OK] Actualizar Attributes INFO -> Responder OK')

# Actualizar las conexiones en el workflow
wf['connections'] = connections

print(f'\nConexiones despues: {len(connections)}')

# También necesitamos agregar credenciales HTTP para los nodos que hacen requests a Chatwoot
# Buscar una credencial HTTP existente
http_credential = None
for node in wf['nodes']:
    if node['type'] == 'n8n-nodes-base.httpRequest' and 'credentials' in node:
        if 'httpHeaderAuth' in node['credentials']:
            http_credential = node['credentials']['httpHeaderAuth']
            break

print(f'\nCredencial HTTP encontrada: {http_credential is not None}')

# Aplicar credencial a nuevos nodos HTTP
if http_credential:
    for node in wf['nodes']:
        if node['name'] in ['Llamar OpenAI API', 'Enviar Respuesta INFO', 'Crear Nota Interna INFO', 'Actualizar Attributes INFO']:
            if 'credentials' not in node:
                node['credentials'] = {}
            if node['name'] == 'Llamar OpenAI API':
                # Este nodo usa OpenAI API, necesita credencial diferente
                # Buscar credencial OpenAI
                for n in wf['nodes']:
                    if 'OpenAI' in n['name'] and 'credentials' in n and 'openAiApi' in n['credentials']:
                        node['credentials']['openAiApi'] = n['credentials']['openAiApi']
                        print(f'[OK] Credencial OpenAI aplicada a {node["name"]}')
                        break
            else:
                # Nodos de Chatwoot usan HTTP Header Auth
                node['credentials']['httpHeaderAuth'] = http_credential
                print(f'[OK] Credencial HTTP aplicada a {node["name"]}')

# Guardar workflow con conexiones
with open('workflow_fase2_completo.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print('\n[OK] Workflow completo guardado: workflow_fase2_completo.json')
print('\nProximo paso: Subir a n8n')
