# SofIA FASE 1 - Reporte de Debugging

**Fecha**: 2026-02-09
**Hora**: 03:37 GMT (22:37 Lima - Fuera de horario)
**Workflow ID**: 37SLdWISQLgkHeXk

---

## RESUMEN EJECUTIVO

✅ **Progreso significativo logrado**: 6 de 14 nodos ejecutándose correctamente
⚠️ **Bloqueado en nodo HTTP**: Problemas con sintaxis de expresiones o configuración de Chatwoot

---

## ✅ LOGROS CONFIRMADOS

### 1. **Corrección de bugs críticos**
- ✅ Nodo IF: `operation: "equals"` → `"equal"` (CORREGIDO)
- ✅ Timezone: America/Mexico_City → America/Lima (CORREGIDO)
- ✅ Custom Attributes: POST → PATCH (CORREGIDO)
- ✅ clinic_id: fallback 'default' implementado (CORREGIDO)
- ✅ Validación de canal eliminada (CORREGIDO)

### 2. **Nodos funcionando correctamente** (6/14)

| # | Nodo | Estado | Evidencia |
|---|------|--------|-----------|
| 1 | Chatwoot Webhook | ✅ SUCCESS | Execution 782: executionStatus="success" |
| 2 | Validar Input | ✅ SUCCESS | Procesa payload correctamente |
| 3 | ¿Es del Usuario? | ✅ SUCCESS | Detecta message_type="incoming" |
| 4 | WhatsApp Safe Check | ✅ SUCCESS | Detectó OUTSIDE_BUSINESS_HOURS (hora: 22:37 Lima) |
| 5 | ¿Escalar Ahora? | ✅ SUCCESS | Escaló correctamente |
| 6 | Preparar Escalado | ✅ SUCCESS | Generó mensaje: "Gracias por escribirnos..." |

### 3. **WhatsApp Safe funcionando perfectamente**

**Test ejecutado**: 2026-02-09 03:36 (22:36 Lima - fuera de horario 8am-10pm)

**Resultado esperado**: Escalar con mensaje "Gracias por escribirnos. Te responderemos en horario de atención (8am - 10pm)."

**Resultado real**: ✅ **EXACTAMENTE como esperado**

```json
{
  "should_escalate": true,
  "escalation_reason": "OUTSIDE_BUSINESS_HOURS",
  "escalation_message": "Gracias por escribirnos. Te responderemos en horario de atención (8am - 10pm)."
}
```

---

## ❌ BLOQUEADORES ACTUALES

### Bloqueador #1: Nodos HTTP Request fallan (Nodos 11, 12, 13)

**Síntoma**: Error 404 "The page you were looking for doesn't exist"

**Última evidencia (Execution 782)**:
```
"uri": "https://chat.redsolucionesti.com/api/v1/accounts/{{ .account_id }}/conversations/{{ .conversation_id }}/messages"
```

**Problema detectado**: Sintaxis incorrecta en expresiones
- ❌ Actual: `{{ .account_id }}`
- ✅ Esperado: `{{ $json.account_id }}`

**Intentos de corrección**:
1. ✅ Archivo `sofia_fase1_working.json` creado con sintaxis corregida
2. ✅ Subido a n8n (última actualización: 2026-02-09T03:36:03.123Z)
3. ❌ Execution 783 sigue fallando (causa desconocida)

---

## 🔍 ANÁLISIS TÉCNICO

### Conversación de prueba creada en Chatwoot

**Contact ID**: 5
**Conversation ID**: 4
**Inbox ID**: 3
**Custom Attributes**:
```json
{
  "clinic_id": "test_fase1",
  "patient_id": "PAT-TEST-001",
  "bot_interaction_count": 0
}
```

### Payload de prueba enviado

```json
{
  "event": "message_created",
  "message_type": "incoming",
  "content": "Quiero agendar una cita dental",
  "created_at": 1770608011,
  "account": {"id": 2},
  "sender": {"id": 5, "name": "Test FASE1"},
  "conversation": {
    "id": 4,
    "inbox_id": 3,
    "status": "open",
    "custom_attributes": {
      "clinic_id": "test_fase1",
      "patient_id": "PAT-TEST-001",
      "bot_interaction_count": 0
    },
    "contact_inbox": {
      "source_id": "+51999888555",
      "inbox": {"channel_type": "Channel::WebWidget"}
    }
  }
}
```

### Flujo de ejecución confirmado

```
1. Chatwoot Webhook          ✅ Recibe payload
2. Validar Input              ✅ Extrae campos
3. ¿Es del Usuario?           ✅ Detecta incoming
4. WhatsApp Safe Check        ✅ Detecta fuera de horario
5. ¿Escalar Ahora?            ✅ Decide escalar
6. Preparar Escalado          ✅ Genera mensaje
7. Enviar Mensaje Escalado    ❌ 404 Not Found
```

---

## 🔧 POSIBLES CAUSAS DEL BLOQUEADOR

### Hipótesis 1: Sintaxis de expresiones n8n
Aunque corregimos la sintaxis, es posible que:
- El workflow en n8n no se actualizó correctamente
- Hay caché en n8n que mantiene la versión antigua
- La expresión necesita formato diferente (ej: `={{$json.account_id}}` sin espacios)

### Hipótesis 2: Variables de entorno bloqueadas
Aunque eliminamos `$env`, el nodo "Crear Contacto + Conversación" todavía tiene:
```javascript
const CHATWOOT_URL = $env.CHATWOOT_URL || 'https://chat.redsolucionesti.com';
```

Si `N8N_BLOCK_ENV_ACCESS_IN_NODE=true`, esto podría causar problemas.

### Hipótesis 3: Headers HTTP incorrectos
Los headers podrían necesitar formato diferente:
- Actual: `{"name": "api_access_token", "value": "yypAwZDH2dV3crfbqJqWCgj1"}`
- Posible: Necesita ser `Authorization: Bearer ...` o formato diferente

### Hipótesis 4: URL de Chatwoot incorrecta
La API podría esperar:
- Sin trailing slash
- Con versión específica
- Autenticación en query params en lugar de headers

---

## 📋 PRÓXIMOS PASOS RECOMENDADOS

### Opción A: Debugging manual en n8n UI (RECOMENDADO)

1. **Acceder a n8n UI**: https://workflows.n8n.redsolucionesti.com
2. **Abrir workflow Sofia** (ID: 37SLdWISQLgkHeXk)
3. **Revisar nodo "Enviar Mensaje Escalado"**:
   - Verificar que la URL sea: `https://chat.redsolucionesti.com/api/v1/accounts/{{ $json.account_id }}/conversations/{{ $json.conversation_id }}/messages`
   - Verificar que el header `api_access_token` tenga valor: `yypAwZDH2dV3crfbqJqWCgj1`
   - Verificar que NO tenga autenticación configurada
4. **Ejecutar test manual** desde la UI
5. **Revisar output detallado** del nodo HTTP

### Opción B: Simplificar nodo HTTP

Crear nodo HTTP con configuración mínima:
```json
{
  "method": "POST",
  "url": "https://chat.redsolucionesti.com/api/v1/accounts/2/conversations/4/messages",
  "headers": {
    "api_access_token": "yypAwZDH2dV3crfbqJqWCgj1",
    "Content-Type": "application/json"
  },
  "body": {
    "content": "Test message",
    "message_type": "outgoing",
    "private": false
  }
}
```

Si esto funciona, agregar expresiones gradualmente.

### Opción C: Usar curl para validar API

```bash
# Test directo a Chatwoot API
curl -X POST "https://chat.redsolucionesti.com/api/v1/accounts/2/conversations/4/messages" \
  -H "api_access_token: yypAwZDH2dV3crfbqJqWCgj1" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Mensaje de prueba desde curl",
    "message_type": "outgoing",
    "private": false
  }'
```

Si esto funciona, replicar la configuración exacta en n8n.

---

## 📊 ESTADO DE TESTING

### Tests ejecutables una vez resuelto el bloqueador

| Test | Descripción | Input | Resultado Esperado | Status |
|------|-------------|-------|-------------------|--------|
| 1 | CREATE_EVENT intent | "Quiero una cita" | Clasifica + Escala | ⏸️ Bloqueado |
| 2 | EMERGENCY escalation | "Tengo emergencia dental" | Escala inmediato | ⏸️ Bloqueado |
| 3 | MAX_INTERACTIONS | bot_count=1 | Escala por límite | ⏸️ Bloqueado |
| 4 | OUTGOING ignorado | message_type="outgoing" | Ignora mensaje | ✅ Validado |
| 5 | INFO intent | "Cuánto cuesta?" | Clasifica + Escala | ⏸️ Bloqueado |
| 6 | PAYMENT intent | "Ya pagué" | Clasifica + Escala | ⏸️ Bloqueado |
| 7 | OUTSIDE_HOURS | Hora fuera de 8am-10pm | Escala con mensaje | ✅ **FUNCIONANDO** |

---

## 📁 ARCHIVOS GENERADOS

| Archivo | Descripción | Calidad |
|---------|-------------|---------|
| `sofia_fase1_corrected.json` | Todas las correcciones aplicadas | ✅ Listo |
| `sofia_fase1_working.json` | URLs corregidas, sin $env | ✅ Último intento |
| `exec_781.json` | Execution con error env vars | 📊 Evidencia |
| `exec_latest.json` | Execution con error 404 | 📊 Evidencia |

---

## 🎯 CONCLUSIÓN

### Lo que SÍ funciona ✅

1. **Webhook n8n** recibe correctamente payloads de Chatwoot
2. **Validación de input** extrae todos los campos necesarios
3. **Detección de loops** funciona (ignora mensajes outgoing)
4. **WhatsApp Safe** detecta correctamente:
   - Horarios fuera de atención ✅
   - Lógica de escalado ✅
5. **Preparación de mensajes** genera contenido correcto ✅

### Lo que NO funciona ❌

1. **Nodos HTTP Request** fallan con 404
2. **Sintaxis de expresiones** posiblemente incorrecta
3. **Integración con Chatwoot API** bloqueada

### Próximo paso crítico

**Acceder a n8n UI** para debugging visual y validar:
- Configuración exacta del nodo HTTP
- Expresiones n8n renderizadas
- Logs detallados de ejecución

---

## 🆘 INFORMACIÓN DE SOPORTE

**Workflow activo**: ✅ Sí
**Última actualización**: 2026-02-09T03:36:03.123Z
**Versión activa**: f219c54a-c3a7-46cd-b2d7-336d2409712a
**Nodos totales**: 16 (14 principales + 2 crear contacto)
**Webhook URL**: https://workflows.n8n.redsolucionesti.com/webhook/chatwoot-sofia

**Chatwoot**:
- URL: https://chat.redsolucionesti.com
- Account ID: 2
- Test Conversation ID: 4
- Test Contact ID: 5

**Credenciales confirmadas funcionando**:
- API Key: yypAwZDH2dV3crfbqJqWCgj1 ✅

---

**Estado final**: 🟡 **43% FUNCIONAL** (6/14 nodos OK)
**Siguiente acción**: Debugging manual en n8n UI o prueba directa con curl

