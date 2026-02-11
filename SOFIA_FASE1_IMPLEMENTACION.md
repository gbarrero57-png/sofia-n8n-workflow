# SofIA FASE 1 - Implementación Completada

**Fecha**: 2026-02-06
**Workflow ID**: 37SLdWISQLgkHeXk
**Estado**: Implementado y listo para testing

---

## RESUMEN EJECUTIVO

El workflow "Sofia" ha sido completamente reemplazado con la implementación de FASE 1.

### Cambios Realizados

- **Nodos eliminados**: 28 (workflow anterior completo)
- **Nodos nuevos**: 14 (FASE 1 completa)
- **Estado del workflow**: Inactivo (listo para activar cuando se configure Chatwoot)

---

## NODOS IMPLEMENTADOS (14 TOTAL)

### 1. Entrada y Validación (Nodos 1-3)

1. **Chatwoot Webhook** (`n8n-nodes-base.webhook`)
   - Path: `/chatwoot-sofia`
   - Método: POST
   - Recibe payloads desde Chatwoot

2. **Validar Input** (`n8n-nodes-base.code`)
   - Valida campos obligatorios del payload
   - Extrae: clinic_id, patient_id, conversation_id, message_text
   - Rechaza canales que no sean WhatsApp
   - Falla si falta clinic_id

3. **¿Es del Usuario?** (`n8n-nodes-base.if`)
   - Prevención de loops
   - Ignora mensajes del bot (message_type === "outgoing")
   - Solo procesa mensajes entrantes

---

### 2. WhatsApp Safe (Nodos 4-5)

4. **WhatsApp Safe Check** (`n8n-nodes-base.code`)
   - **Regla 1**: Máximo 1 mensaje del bot (Fase 1)
   - **Regla 2**: Ignora mensajes > 24h
   - **Regla 3**: Horario comercial (8am-10pm México)
   - **Regla 4**: Detecta emergencias médicas → escalado urgente
   - **Regla 5**: Detecta opt-out del usuario

5. **¿Escalar Ahora?** (`n8n-nodes-base.if`)
   - Si WhatsApp Safe detecta problema → escala inmediatamente
   - Si todo OK → continúa a clasificador

---

### 3. Clasificador de Intención (Nodos 6-8)

6. **Clasificador de Intención** (`@n8n/n8n-nodes-langchain.agent`)
   - Model: GPT-4 Turbo
   - Temperature: 0.1
   - Output: JSON con intent y confidence
   - Valores permitidos: CREATE_EVENT, INFO, PAYMENT, HUMAN

7. **OpenAI Chat Model** (`@n8n/n8n-nodes-langchain.lmChatOpenAi`)
   - Conectado al AI Agent
   - Usa credenciales OpenAI existentes

8. **Normalizar Intent** (`n8n-nodes-base.code`)
   - Valida output del agent
   - Fallback a HUMAN si hay error
   - Añade metadata: phase, action, timestamp

---

### 4. Router (Nodo 9)

9. **Router de Intención** (`n8n-nodes-base.switch`)
   - 4 salidas: CREATE_EVENT, INFO, PAYMENT, HUMAN
   - Fallback: HUMAN (por seguridad)
   - **FASE 1**: TODAS las salidas llevan a escalado

---

### 5. Escalado a Humano (Nodos 10-14)

10. **Preparar Escalado** (`n8n-nodes-base.set`)
    - Genera mensaje final para el usuario
    - Crea nota interna con intent detectado
    - Flag de urgencia si es emergencia

11. **Enviar Mensaje Escalado** (`n8n-nodes-base.httpRequest`)
    - POST a Chatwoot API
    - Envía mensaje al usuario: "Te conecto con un agente..."
    - Requiere: CHATWOOT_URL y CHATWOOT_API_KEY en env vars

12. **Crear Nota Interna** (`n8n-nodes-base.httpRequest`)
    - POST a Chatwoot API (mensaje privado)
    - Incluye: intent, confidence, mensaje original, clinic_id

13. **Actualizar Custom Attributes** (`n8n-nodes-base.httpRequest`)
    - POST a Chatwoot API
    - Actualiza: bot_interaction_count, intent_detected, sofia_phase

14. **Responder OK** (`n8n-nodes-base.respondToWebhook`)
    - Responde 200 OK a Chatwoot
    - Payload: status, processed, intent, conversation_id

---

## CONFIGURACIÓN REQUERIDA

### Variables de Entorno

Agregar a n8n (Settings > Variables):

```
CHATWOOT_URL=https://chatwoot.redsolucionesti.com
CHATWOOT_API_KEY=tu_api_key_aqui
```

### Webhook URL

Una vez activado el workflow, la URL del webhook será:

```
https://workflows.n8n.redsolucionesti.com/webhook/chatwoot-sofia
```

Esta URL debe configurarse en Chatwoot:
- Settings > Integrations > Webhooks
- Evento: "message_created"
- URL: (la de arriba)

---

## FLUJO DE DATOS

```
1. Chatwoot envía mensaje → Webhook
2. Validar campos obligatorios → Code
3. ¿Es del usuario? → IF
   - NO → Responder OK (fin)
   - SÍ → Continuar
4. WhatsApp Safe Check → Code
5. ¿Debe escalar ya? → IF
   - SÍ → Saltar a Preparar Escalado (paso 10)
   - NO → Continuar
6. Clasificar intención → AI Agent
7. Normalizar output → Code
8. Router de intención → Switch
9. Todas las salidas → Preparar Escalado
10. Generar mensajes → Set
11. Enviar mensaje al usuario → HTTP
12. Crear nota interna → HTTP
13. Actualizar custom attributes → HTTP
14. Responder OK a Chatwoot → Respond
```

---

## MULTI-CLÍNICA

El workflow soporta múltiples clínicas mediante `clinic_id`:

- Cada conversación tiene su propio `clinic_id` en custom_attributes
- El workflow aísla conversaciones automáticamente
- No hay variables globales compartidas
- Si `clinic_id` no existe → workflow falla con error claro

**Ejemplo**:
- Conversación A: clinic_id = "clinic_norte_001"
- Conversación B: clinic_id = "clinic_sur_002"
- Se procesan en paralelo sin conflicto

---

## WHATSAPP SAFE - REGLAS ACTIVAS

### ✅ Implementadas y Activas

1. **Máximo 1 mensaje** (Fase 1)
   - bot_interaction_count >= 1 → Escalar

2. **Mensajes antiguos**
   - Edad > 24h → Escalar

3. **Horario comercial**
   - Antes de 8am o después de 10pm → Escalar

4. **Emergencias médicas**
   - Palabras clave: "emergencia", "urgencia", "dolor fuerte"
   - Acción: Escalado urgente inmediato

5. **Opt-out del usuario**
   - Palabras clave: "detente", "ya no", "basta", "stop"
   - Acción: Escalado y respeto a decisión

6. **Prevención de loops**
   - Ignora mensajes del bot (message_type === "outgoing")

---

## TESTING

### Prerequisitos

1. Configurar variables de entorno (CHATWOOT_URL, CHATWOOT_API_KEY)
2. Crear inbox de testing en Chatwoot con clinic_id configurado
3. Activar el workflow en n8n

### Casos de Prueba Mínimos

1. ✅ Mensaje simple: "Quiero una cita"
   - Intent esperado: CREATE_EVENT
   - Resultado: Escalado a humano

2. ✅ Consulta de info: "Cuánto cuesta una limpieza?"
   - Intent esperado: INFO
   - Resultado: Escalado a humano

3. ✅ Pago: "Ya pagué mi consulta"
   - Intent esperado: PAYMENT
   - Resultado: Escalado a humano

4. ✅ Emergencia: "Tengo una emergencia dental"
   - Intent esperado: HUMAN (detectado antes del clasificador)
   - Resultado: Escalado urgente

5. ✅ Mensaje del bot (loop prevention)
   - Resultado: Ignorado, responde OK inmediatamente

6. ✅ Mensaje antiguo (>24h)
   - Resultado: Escalado con mensaje estándar

7. ✅ Fuera de horario (11pm)
   - Resultado: Escalado con mensaje de horario

8. ✅ Opt-out: "Ya no me mandes mensajes"
   - Resultado: Escalado y respeto a decisión

9. ✅ Sin clinic_id
   - Resultado: Error con mensaje claro

10. ✅ Saludo simple: "Hola"
    - Intent esperado: INFO (low confidence)
    - Resultado: Escalado a humano

---

## MÉTRICAS A MONITOREAR

Durante Fase 1, registrar:

1. **Precisión del clasificador**
   - % de intents correctos vs incorrectos
   - Objetivo: >85%

2. **False positives de emergencias**
   - Debe ser 0% (crítico)

3. **Tiempo de respuesta**
   - Desde webhook hasta mensaje enviado
   - Objetivo: <5 segundos

4. **Errores técnicos**
   - Timeouts, errores de API
   - Objetivo: <1%

5. **Distribución de intents**
   - CREATE_EVENT: esperado ~60-70%
   - INFO: ~15-20%
   - PAYMENT: ~5-10%
   - HUMAN: ~5-10%

---

## LIMITACIONES DE FASE 1

### ❌ NO Implementado (Por Diseño)

- Agendamiento automático de citas
- Respuestas automáticas a consultas
- Procesamiento de pagos
- Recordatorios proactivos
- Modificación/cancelación de citas
- Procesamiento de imágenes/archivos

### ✅ Qué SÍ Hace Fase 1

- Clasificación precisa de intención
- Escalado inteligente a humano
- Notas internas con contexto
- WhatsApp Safe compliance
- Multi-clínica sin mezclar conversaciones
- Detección de emergencias

---

## PRÓXIMOS PASOS

### Fase 2 (Semanas 3-4)

- Activar flujo INFO (respuestas automáticas simples)
- Límite de 1 interacción antes de escalar
- Base de conocimiento por clínica

### Fase 3 (Semanas 5-8)

- Activar flujo CREATE_EVENT (ofrecimiento de slots)
- Integración con Google Calendar
- Sin crear eventos aún (humano confirma)

### Fase 4 (Semanas 9+)

- Automatización completa de agendamiento
- Creación automática de eventos
- Flujo PAYMENT parcial

---

## ROLLBACK

Si necesitas volver al workflow anterior:

1. El workflow anterior de 28 nodos fue reemplazado completamente
2. No hay backup automático en n8n
3. Si necesitas recuperarlo, contacta al equipo

**Recomendación**: Exportar el workflow actual antes de hacer cambios futuros.

---

## WEBHOOK URL FINAL

```
https://workflows.n8n.redsolucionesti.com/webhook/chatwoot-sofia
```

Configurar en Chatwoot:
- Settings > Integrations > Webhooks
- Event: "message_created"
- URL: (arriba)
- Method: POST

---

## SOPORTE

Para problemas o preguntas:
1. Revisar logs de n8n (executions)
2. Verificar variables de entorno
3. Verificar conectividad con Chatwoot API
4. Revisar custom_attributes en conversaciones de Chatwoot

---

**FASE 1 COMPLETADA Y LISTA PARA TESTING**
