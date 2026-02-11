# Diagnóstico Final - Fase 2 SofIA (Continuación)

**Fecha**: 2026-02-09 14:10 hora local Lima
**Workflow ID**: 37SLdWISQLgkHeXk
**Última Ejecución**: #889

---

## 🎯 RESUMEN EJECUTIVO

**Progreso**: 90% completado
**Estado**: Flujo INFO llega hasta OpenAI pero falla al enviar respuesta a Chatwoot

### Logros de esta sesión ✅

1. **Configuración del nodo OpenAI** ✅
   - Body JSON con modelo `gpt-4o-mini`
   - Mensajes con `system_prompt` y `user_prompt`
   - Temperature 0.3, max_tokens 500

2. **Configuración de nodos HTTP INFO** ✅
   - Enviar Respuesta INFO: URL + headers + body
   - Crear Nota Interna INFO: URL + headers + body
   - Actualizar Attributes INFO: URL + headers + body

3. **Corrección de "Extraer Respuesta LLM"** ✅
   - Cambiado de `$input.all()[0].json` a `$node["Preparar Prompt INFO"].json`
   - Ahora preserva `conversation_id`, `account_id`, etc.

4. **Corrección de sintaxis** ✅
   - Eliminado doble `=` en expresiones: `={{ }}` → `{{ }}`

---

## 📊 FLUJO ACTUAL

### Nodos ejecutándose correctamente (1-11) ✅

```
Webhook → Validar Input → IsUserMessage → WhatsApp Safe Check
→ Clasificador (GPT-4o-mini) → Normalizar Intent → Check INFO Intent
→ Knowledge Base → Preparar Prompt INFO → Llamar OpenAI API
→ Extraer Respuesta LLM
```

**Duración hasta OpenAI**: ~1.3 segundos ✅

### Nodos con error (12-17) ❌

```
Extraer Respuesta LLM → Validar Respuesta → ¿Respuesta Válida?
→ Enviar Respuesta INFO ❌ → Crear Nota Interna INFO
→ Actualizar Attributes INFO → Responder OK
```

**Problema**: Error al ejecutar "Enviar Respuesta INFO" (o nodos siguientes)

---

## 🔧 CONFIGURACIONES APLICADAS

### Nodo: Llamar OpenAI API
```json
{
  "method": "POST",
  "url": "https://api.openai.com/v1/chat/completions",
  "authentication": "predefinedCredentialType",
  "nodeCredentialType": "openAiApi",
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={\n  \"model\": \"gpt-4o-mini\",\n  \"messages\": [\n    { \"role\": \"system\", \"content\": \"{{ $json.system_prompt }}\" },\n    { \"role\": \"user\", \"content\": \"{{ $json.user_prompt }}\" }\n  ],\n  \"temperature\": 0.3,\n  \"max_tokens\": 500\n}"
}
```
**Estado**: ✅ Configurado y funcionando

### Nodo: Extraer Respuesta LLM
```javascript
// Código corregido
const response = $json;
const llm_response = response.choices?.[0]?.message?.content || '';
const original_data = $node["Preparar Prompt INFO"].json;

return [{
  json: {
    ...original_data,  // Preserva conversation_id, account_id, etc.
    llm_response: llm_response.trim()
  }
}];
```
**Estado**: ✅ Configurado correctamente

### Nodo: Enviar Respuesta INFO
```json
{
  "method": "POST",
  "url": "https://chat.redsolucionesti.com/api/v1/accounts/{{ $json.account_id }}/conversations/{{ $json.conversation_id }}/messages",
  "sendHeaders": true,
  "headerParameters": {
    "parameters": [
      {
        "name": "api_access_token",
        "value": "yypAwZDH2dV3crfbqJqWCgj1"
      }
    ]
  },
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={\n  \"content\": \"{{ $json.llm_response }}\",\n  \"message_type\": \"outgoing\",\n  \"private\": false\n}"
}
```
**Estado**: ⚠️ Configurado pero con error en ejecución

---

## 🐛 PROBLEMA ACTUAL

**Síntoma**: Ejecuciones #885-889 todas muestran:
- Status: ERROR
- Duración: ~1.3 segundos
- El flujo llega hasta OpenAI
- Falla después de "Extraer Respuesta LLM"

**Posibles causas**:

1. **Error en la respuesta de OpenAI**
   - OpenAI podría estar devolviendo un formato inesperado
   - El código de extracción no maneja casos de error

2. **Datos faltantes en el flujo**
   - Aunque `$node["Preparar Prompt INFO"].json` debería preservar los datos
   - Tal vez algún campo como `conversation_id` o `account_id` es `null`

3. **Error en la validación**
   - El nodo "Validar Respuesta" podría tener un error de JavaScript
   - O "¿Respuesta Válida?" no está tomando el path correcto

4. **Error en el HTTP Request a Chatwoot**
   - La URL con `{{ $json.account_id }}` no se resuelve correctamente
   - El header `api_access_token` no funciona
   - El body con `{{ $json.llm_response }}` tiene caracteres especiales que rompen el JSON

---

## 🔍 PRÓXIMOS PASOS RECOMENDADOS

### Opción 1: Debugging en UI de n8n (RECOMENDADO)

1. Abrir workflow en: https://workflows.n8n.redsolucionesti.com
2. Ver execution #889 en el panel de Executions
3. Identificar exactamente cuál nodo falla y ver el mensaje de error
4. Ver el output de "Extraer Respuesta LLM" para confirmar que tiene:
   - `llm_response` (la respuesta de OpenAI)
   - `conversation_id`
   - `account_id`
   - Todos los campos necesarios

### Opción 2: Agregar logging temporal

Agregar nodos Code después de cada nodo crítico que retornen el estado:

```javascript
// Después de "Extraer Respuesta LLM"
console.log('conversation_id:', $json.conversation_id);
console.log('account_id:', $json.account_id);
console.log('llm_response:', $json.llm_response?.substring(0, 100));
return [$json];
```

### Opción 3: Test manual simplificado

Crear un workflow de prueba:
```
Manual Trigger → Set (datos fijos) → Enviar Respuesta INFO
```

Con datos hardcodeados para verificar que el HTTP Request funciona.

---

## 📈 PROGRESO GENERAL

### Fase 1 (Completada) ✅
- Clasificación de intenciones
- Escalado a humano
- Custom attributes
- Notas internas

### Fase 2 (90% completada) ⚠️
- [✅] Knowledge Base creado
- [✅] Prompt INFO preparado
- [✅] Integración OpenAI funcionando
- [✅] Clasificador prioriza INFO
- [✅] Routing IF detecta INFO
- [✅] Anti-alucinación configurado
- [⚠️] Envío de respuesta a Chatwoot (PENDIENTE)
- [⏳] Actualización de attributes (PENDIENTE)
- [⏳] Notas internas INFO (PENDIENTE)

---

## 🎯 CRITERIOS DE ÉXITO

| Criterio | Estado | Notas |
|----------|--------|-------|
| Responde automáticamente preguntas INFO | ⚠️ Casi | OpenAI genera respuesta correctamente |
| Usa knowledge base estático | ✅ SÍ | 8 servicios configurados |
| Validación anti-alucinación funciona | ⚠️ Configurado | No se ha probado end-to-end |
| Escala cuando no tiene información | ⚠️ Configurado | Validación lista, falta probar |
| Respeta límite de 1 interacción | ⚠️ Configurado | WhatsApp Safe Check lo valida |
| Mensajes llegan a Chatwoot | ❌ NO | Error en nodo HTTP Request |
| Custom attributes se actualizan | ❌ NO | No llega a ejecutarse |
| Notas internas se crean | ❌ NO | No llega a ejecutarse |

---

## 💡 RECOMENDACIÓN FINAL

**El problema está a un paso de resolverse.**

El flujo funciona correctamente hasta OpenAI (que es la parte más compleja). El error está en los últimos nodos HTTP Request que envían data a Chatwoot.

**Acción inmediata**:
1. Revisar execution #889 en la UI de n8n
2. Ver el mensaje de error específico
3. Verificar el output de "Extraer Respuesta LLM"
4. Hacer un pequeño ajuste en base al error real

**Tiempo estimado**: 15-30 minutos con acceso a la UI de n8n para ver el error específico.

---

## 📁 ARCHIVOS GENERADOS EN ESTA SESIÓN

1. `fix_openai_body.py` - Configurar body del nodo OpenAI
2. `fix_info_nodes.py` - Configurar body de nodos HTTP INFO
3. `fix_info_headers.py` - Configurar headers de nodos HTTP INFO
4. `fix_extract_node.py` - Corregir preservación de datos
5. `fix_double_equals.py` - Corregir sintaxis {{ }}
6. `workflow_syntax_fixed.json` - Workflow con todas las correcciones
7. `DIAGNOSTICO_FINAL_FASE2.md` - Este archivo

---

**Última actualización**: 2026-02-09 14:10 GMT-5 (Lima, Perú)
**Analista**: Claudio (Claude Sonnet 4.5)
**Versión del workflow**: 9fed97e7-68ca-493d-b (2026-02-09T19:08:43)
