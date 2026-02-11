"""
Script para crear los nodos de Fase 2: Respuestas INFO automáticas
"""
import json

# Cargar workflow actual
with open('workflow_fase1_fixed.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

print('=== CREANDO NODOS FASE 2 ===\n')

# Obtener posición del nodo Router para ubicar nuevos nodos
router_node = None
for node in wf['nodes']:
    if 'Router' in node['name'] and 'Intención' in node['name']:
        router_node = node
        break

if not router_node:
    print('[ERROR] No se encontró el nodo Router')
    exit(1)

router_x, router_y = router_node['position']

# ============================================
# NODO 1: Knowledge Base
# ============================================

knowledge_base_node = {
    "parameters": {
        "jsCode": '''// ============================================
// KNOWLEDGE BASE - FASE 2
// Base de conocimiento estática de la clínica
// ============================================

const KNOWLEDGE_BASE = {
  "clinic_info": {
    "name": "Clínica Dental SofIA Dent (Test)",
    "address": "Av. Principal 123, San Isidro, Lima, Perú",
    "phone": "+51 905 858 566",
    "email": "info@redsolucionesti.com",
    "website": "https://sofia-test.redsolucionesti.com"
  },
  "hours": {
    "weekdays": "Lunes a Viernes: 9:00 AM - 7:00 PM",
    "saturday": "Sábados: 9:00 AM - 2:00 PM",
    "sunday": "Domingos: Cerrado"
  },
  "services": [
    {
      "name": "Limpieza dental",
      "price_range": "S/ 80 - S/ 150",
      "duration": "30-45 minutos",
      "description": "Limpieza profesional con ultrasonido"
    },
    {
      "name": "Blanqueamiento dental",
      "price_range": "S/ 300 - S/ 500",
      "duration": "60 minutos",
      "description": "Blanqueamiento LED profesional"
    },
    {
      "name": "Consulta general",
      "price_range": "S/ 50 - S/ 80",
      "duration": "30 minutos",
      "description": "Evaluación completa con radiografía panorámica"
    },
    {
      "name": "Ortodoncia",
      "price_range": "S/ 2,500 - S/ 5,000",
      "duration": "12-24 meses",
      "description": "Brackets metálicos o estéticos. Incluye controles mensuales."
    },
    {
      "name": "Extracción simple",
      "price_range": "S/ 100 - S/ 200",
      "duration": "30 minutos",
      "description": "Extracción de piezas dentales no complicadas"
    },
    {
      "name": "Endodoncia (tratamiento de conducto)",
      "price_range": "S/ 300 - S/ 600",
      "duration": "60-90 minutos",
      "description": "Tratamiento de conducto por pieza dental"
    },
    {
      "name": "Implante dental",
      "price_range": "S/ 2,000 - S/ 3,500",
      "duration": "3-6 meses (proceso completo)",
      "description": "Implante de titanio + corona. Requiere evaluación previa."
    },
    {
      "name": "Carillas dentales",
      "price_range": "S/ 400 - S/ 800 por pieza",
      "duration": "2-3 citas",
      "description": "Carillas de resina o porcelana"
    }
  ],
  "payment_methods": [
    "Efectivo",
    "Tarjeta de crédito/débito (Visa, Mastercard)",
    "Transferencia bancaria (BCP, Interbank, BBVA)",
    "Yape / Plin"
  ],
  "faq": [
    {
      "question": "¿Tienen estacionamiento?",
      "answer": "Sí, contamos con estacionamiento gratuito para pacientes."
    },
    {
      "question": "¿Atienden emergencias?",
      "answer": "Sí, atendemos emergencias dentales en horario de atención. Fuera de horario, comunícate al +51 905 858 566."
    },
    {
      "question": "¿Trabajan con seguros?",
      "answer": "Trabajamos con Rímac, Pacífico y Mapfre. Consulta cobertura específica con nuestro equipo."
    },
    {
      "question": "¿Primera cita tiene costo?",
      "answer": "La primera consulta de evaluación tiene un costo de S/ 50, que se descuenta si inicias tu tratamiento con nosotros."
    }
  ]
};

// Pasar datos al siguiente nodo
return [{
  json: {
    ...($json || {}),
    knowledge_base: KNOWLEDGE_BASE,
    clinic_name: KNOWLEDGE_BASE.clinic_info.name,
    knowledge_base_json: JSON.stringify(KNOWLEDGE_BASE, null, 2)
  }
}];
'''
    },
    "id": "code-knowledge-base",
    "name": "Knowledge Base",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [router_x + 300, router_y + 100]
}

print('OK Nodo Knowledge Base creado')

# ============================================
# NODO 2: Preparar Prompt para LLM
# ============================================

prepare_prompt_node = {
    "parameters": {
        "jsCode": '''// Preparar prompt para LLM
const knowledge_base_json = $json.knowledge_base_json;
const message_text = $json.message_text;
const clinic_name = $json.clinic_name;

const system_prompt = `Eres SofIA, asistente virtual de la clínica dental ${clinic_name}.
Tu tarea es responder la pregunta del paciente usando ÚNICAMENTE la información proporcionada.

INFORMACIÓN DE LA CLÍNICA:
${knowledge_base_json}

REGLAS:
1. Responde SOLO con información que esté en la base de conocimiento
2. Si la información no está disponible, di EXACTAMENTE: "No tengo esa información disponible. Te conecto con un agente para ayudarte mejor."
3. Sé amable, conciso y profesional
4. No inventes precios, horarios ni servicios
5. Si el paciente pregunta algo que requiere evaluación médica, sugiere agendar una cita
6. Máximo 3 oraciones
7. Responde en español
8. Al final de tu respuesta, siempre pregunta: "¿Hay algo más en lo que pueda ayudarte?"`;

const user_prompt = `PREGUNTA DEL PACIENTE:\n${message_text}`;

return [{
  json: {
    ...($json || {}),
    system_prompt: system_prompt,
    user_prompt: user_prompt
  }
}];
'''
    },
    "id": "code-prepare-prompt",
    "name": "Preparar Prompt INFO",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [router_x + 500, router_y + 100]
}

print('OK Nodo Preparar Prompt INFO creado')

# ============================================
# NODO 3: Generar Respuesta con OpenAI
# ============================================

# Primero necesito encontrar el nodo OpenAI Chat Model existente para usar la misma credencial
openai_credential_id = None
for node in wf['nodes']:
    if node['type'] == '@n8n/n8n-nodes-langchain.lmChatOpenAi':
        # Obtener la credencial
        if 'credentials' in node:
            openai_credential_id = node['credentials']
        break

# Nodo OpenAI Chat Model para INFO
openai_info_node = {
    "parameters": {
        "model": {
            "__rl": True,
            "value": "gpt-4o-mini",
            "mode": "list",
            "cachedResultName": "gpt-4o-mini"
        },
        "options": {
            "maxTokens": 200,
            "temperature": 0.3
        }
    },
    "id": "openai-info-responder",
    "name": "OpenAI Responder INFO",
    "type": "@n8n/n8n-nodes-langchain.lmChatOpenAi",
    "typeVersion": 1,
    "position": [router_x + 700, router_y + 100]
}

# Agregar credenciales si se encontraron
if openai_credential_id:
    openai_info_node['credentials'] = openai_credential_id

print('OK Nodo OpenAI Responder INFO creado')

# ============================================
# NODO 4: Llamar a OpenAI (HTTP Request)
# ============================================

# Necesitamos un nodo que haga el request a OpenAI API directamente
# porque el nodo LangChain necesita estar dentro de un Agent

call_openai_node = {
    "parameters": {
        "url": "https://api.openai.com/v1/chat/completions",
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "openAiApi",
        "method": "POST",
        "jsonBody": '''={
  "model": "gpt-4o-mini",
  "messages": [
    {
      "role": "system",
      "content": {{ JSON.stringify($json.system_prompt) }}
    },
    {
      "role": "user",
      "content": {{ JSON.stringify($json.user_prompt) }}
    }
  ],
  "max_tokens": 200,
  "temperature": 0.3
}''',
        "options": {}
    },
    "id": "http-call-openai",
    "name": "Llamar OpenAI API",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4,
    "position": [router_x + 700, router_y + 100]
}

# Agregar credenciales OpenAI
if openai_credential_id and 'openAiApi' in str(openai_credential_id):
    call_openai_node['credentials'] = {'openAiApi': openai_credential_id.get('openAiApi')}

print('OK Nodo Llamar OpenAI API creado')

# ============================================
# NODO 5: Extraer Respuesta
# ============================================

extract_response_node = {
    "parameters": {
        "jsCode": '''// Extraer respuesta del LLM
const response = $json;

// La respuesta de OpenAI viene en response.choices[0].message.content
const llm_response = response.choices?.[0]?.message?.content || '';

return [{
  json: {
    ...($input.all()[0].json || {}),  // Mantener todos los datos anteriores
    llm_response: llm_response.trim()
  }
}];
'''
    },
    "id": "code-extract-response",
    "name": "Extraer Respuesta LLM",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [router_x + 900, router_y + 100]
}

print('OK Nodo Extraer Respuesta LLM creado')

# ============================================
# NODO 6: Validar Respuesta (Anti-Alucinación)
# ============================================

validate_response_node = {
    "parameters": {
        "jsCode": '''// ============================================
// VALIDACION ANTI-ALUCINACION
// ============================================

const llm_response = $json.llm_response || '';

// Flags de validación
let should_escalate = false;
let escalation_reason = '';

// Regla 1: Respuesta muy larga (>500 chars)
if (llm_response.length > 500) {
  should_escalate = true;
  escalation_reason = 'Respuesta LLM muy larga (>500 chars)';
}

// Regla 2: LLM dice que no tiene información
const no_info_keywords = [
  'no tengo esa información',
  'no dispongo',
  'no cuento con',
  'no tengo información',
  'no está disponible',
  'te conecto con un agente'
];

for (const keyword of no_info_keywords) {
  if (llm_response.toLowerCase().includes(keyword)) {
    should_escalate = true;
    escalation_reason = 'LLM indica falta de información';
    break;
  }
}

// Regla 3: Respuesta vacía o muy corta
if (llm_response.length < 10) {
  should_escalate = true;
  escalation_reason = 'Respuesta LLM vacía o muy corta';
}

return [{
  json: {
    ...($json || {}),
    should_escalate_info: should_escalate,
    escalation_reason_info: escalation_reason,
    validation_passed: !should_escalate
  }
}];
'''
    },
    "id": "code-validate-response",
    "name": "Validar Respuesta",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [router_x + 1100, router_y + 100]
}

print('OK Nodo Validar Respuesta creado')

# ============================================
# NODO 7: IF - ¿Respuesta Válida?
# ============================================

if_valid_response_node = {
    "parameters": {
        "conditions": {
            "boolean": [
                {
                    "value1": "{{ $json.validation_passed }}",
                    "value2": True
                }
            ]
        }
    },
    "id": "if-valid-response",
    "name": "¿Respuesta Válida?",
    "type": "n8n-nodes-base.if",
    "typeVersion": 2,
    "position": [router_x + 1300, router_y + 100]
}

print('OK Nodo ¿Respuesta Válida? creado')

# ============================================
# NODO 8: Enviar Respuesta INFO
# ============================================

send_info_response_node = {
    "parameters": {
        "url": "https://chat.redsolucionesti.com/api/v1/accounts/{{ $json.account_id }}/conversations/{{ $json.conversation_id }}/messages",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "method": "POST",
        "jsonBody": '''={
  "content": {{ JSON.stringify($json.llm_response) }},
  "message_type": "outgoing",
  "private": false
}''',
        "options": {}
    },
    "id": "http-send-info-response",
    "name": "Enviar Respuesta INFO",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4,
    "position": [router_x + 1500, router_y]
}

print('OK Nodo Enviar Respuesta INFO creado')

# ============================================
# NODO 9: Crear Nota Interna INFO
# ============================================

create_note_info_node = {
    "parameters": {
        "url": "https://chat.redsolucionesti.com/api/v1/accounts/{{ $json.account_id }}/conversations/{{ $json.conversation_id }}/messages",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "method": "POST",
        "jsonBody": '''={
  "content": "SofIA Bot - Fase 2 (INFO)\\n\\nPregunta: {{ $json.message_text }}\\n\\nRespuesta automática:\\n{{ $json.llm_response }}\\n\\nIntent: INFO\\nValidación: PASSED",
  "message_type": "outgoing",
  "private": true
}''',
        "options": {}
    },
    "id": "http-create-note-info",
    "name": "Crear Nota Interna INFO",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4,
    "position": [router_x + 1700, router_y]
}

print('OK Nodo Crear Nota Interna INFO creado')

# ============================================
# NODO 10: Actualizar Attributes INFO
# ============================================

update_attributes_info_node = {
    "parameters": {
        "url": "https://chat.redsolucionesti.com/api/v1/accounts/{{ $json.account_id }}/conversations/{{ $json.conversation_id }}",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "method": "PATCH",
        "jsonBody": '''={
  "custom_attributes": {
    "bot_handled": true,
    "intent_detected": "INFO",
    "bot_interaction_count": {{ ($json.bot_interaction_count || 0) + 1 }},
    "last_bot_message_at": {{ Math.floor(Date.now() / 1000) }},
    "sofia_phase": "PHASE_2_INFO",
    "last_response_type": "auto_info"
  }
}''',
        "options": {}
    },
    "id": "http-update-attributes-info",
    "name": "Actualizar Attributes INFO",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4,
    "position": [router_x + 1900, router_y]
}

print('OK Nodo Actualizar Attributes INFO creado')

# Agregar todos los nuevos nodos al workflow
new_nodes = [
    knowledge_base_node,
    prepare_prompt_node,
    call_openai_node,
    extract_response_node,
    validate_response_node,
    if_valid_response_node,
    send_info_response_node,
    create_note_info_node,
    update_attributes_info_node
]

wf['nodes'].extend(new_nodes)

print(f'\nOK Total de {len(new_nodes)} nodos agregados')
print(f'OK Total de nodos en workflow: {len(wf["nodes"])}')

# Guardar workflow con nuevos nodos
with open('workflow_fase2_nodos.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print('\nOK Workflow guardado: workflow_fase2_nodos.json')
print('\nPróximo paso: Configurar conexiones entre nodos')
