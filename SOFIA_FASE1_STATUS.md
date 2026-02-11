# SofIA FASE 1 - Estado de Implementación

**Fecha**: 2026-02-08
**Workflow ID**: 37SLdWISQLgkHeXk
**Estado**: 🟡 **BLOQUEADO - Requiere configuración manual**

---

## RESUMEN EJECUTIVO

El workflow de FASE 1 ha sido **corregido y subido a n8n**, pero **NO puede ejecutarse correctamente** debido a restricciones de seguridad en la instancia n8n.

---

## ✅ CORRECCIONES APLICADAS

### 1. **Bug en nodo IF** - ✅ Corregido
   - **Problema**: `"operation": "equals"` (incorrecto)
   - **Solución**: Cambiado a `"operation": "equal"` (correcto)
   - **Archivo**: [sofia_fase1_corrected.json](./sofia_fase1_corrected.json)

### 2. **Timezone** - ✅ Corregido
   - **Problema**: `America/Mexico_City`
   - **Solución**: Cambiado a `America/Lima`

### 3. **Custom Attributes HTTP method** - ✅ Corregido
   - **Problema**: `POST`
   - **Solución**: Cambiado a `PATCH`

### 4. **clinic_id fallback** - ✅ Implementado
   - Ahora usa `'default'` si no existe

### 5. **Validación de canal** - ✅ Eliminada
   - Ya no rechaza `Channel::WebWidget`

### 6. **Campos obligatorios** - ✅ Corregido
   - Solo requiere: `event`, `content`, `conversation_id`, `account_id`

---

## ❌ BLOQUEADORES ACTUALES

### **Bloqueador #1: Variables de entorno bloqueadas**

La instancia n8n tiene configurado `N8N_BLOCK_ENV_ACCESS_IN_NODE=true`, lo que **bloquea el acceso a variables de entorno** (`$env.CHATWOOT_URL`, `$env.CHATWOOT_API_KEY`).

**Error exacto:**
```
ExpressionError: access to env vars denied
Context: If you need access please contact the administrator to remove the environment variable 'N8N_BLOCK_ENV_ACCESS_IN_NODE'
```

**Impacto:**
- Los nodos HTTP Request no pueden acceder a `$env.CHATWOOT_URL`
- Los nodos HTTP Request no pueden acceder a `$env.CHATWOOT_API_KEY`

**Soluciones intentadas:**
1. ❌ Hardcodear valores en parámetros → n8n sigue evaluando expresiones
2. ❌ Usar headers manuales → Sigue intentando autenticación con credenciales
3. ✅ **Solución final implementada**: Archivo [sofia_fase1_prod.json](./sofia_fase1_prod.json) con URLs y API Keys completamente hardcodeadas

**Estado actual del archivo prod:**
- ✅ URLs completamente hardcodeadas: `https://chat.redsolucionesti.com`
- ✅ API Key hardcodeada: `yypAwZDH2dV3crfbqJqWCgj1`
- ✅ Sin referencias a `$env`

---

### **Bloqueador #2: Conversaciones de test no existen**

Los tests enviados usan `conversation_id`: 999, 1000, 2000, 3000, 4000, etc., que **NO existen en Chatwoot**.

**Impacto:**
- Las llamadas HTTP a Chatwoot API fallan con **404 Not Found**
- No se pueden completar los nodos: "Enviar Mensaje Escalado", "Crear Nota Interna", "Actualizar Custom Attributes"

**Solución:**
- Usar el webhook `/sofia-create-contact` para crear conversaciones reales ANTES de probar
- Usar conversation_ids existentes en Chatwoot

---

## 📊 ESTADO DE LOS NODOS (14 total)

| # | Nodo | Estado | Notas |
|---|------|--------|-------|
| 1 | Chatwoot Webhook | ✅ OK | Registrado correctamente |
| 2 | Validar Input | ✅ OK | Ejecuta sin errores |
| 3 | ¿Es del Usuario? | ✅ **CORREGIDO** | Era el bug del `operation: "equals"` |
| 4 | WhatsApp Safe Check | ⚠️ No probado | Depende de nodo #3 |
| 5 | ¿Escalar Ahora? | ⚠️ No probado | Depende de nodo #4 |
| 6 | Clasificador de Intención | ⚠️ No probado | Requiere credenciales OpenAI |
| 7 | OpenAI Chat Model | ⚠️ Credenciales | ID: SeCPLJI4mV6p2hJR (existe pero no verificada) |
| 8 | Normalizar Intent | ⚠️ No probado | Depende de nodo #6 |
| 9 | Router de Intención | ⚠️ No probado | Depende de nodo #8 |
| 10 | Preparar Escalado | ⚠️ No probado | Depende de nodo #9 |
| 11 | Enviar Mensaje Escalado | ❌ **BLOQUEADO** | Requiere desbloqueo de $env o hardcodeo |
| 12 | Crear Nota Interna | ❌ **BLOQUEADO** | Requiere desbloqueo de $env o hardcodeo |
| 13 | Actualizar Custom Attributes | ❌ **BLOQUEADO** | Requiere desbloqueo de $env o hardcodeo |
| 14 | Responder OK | ⚠️ No probado | Depende de nodo #13 |

---

## 🔧 SOLUCIONES DISPONIBLES

### **Opción 1: Desbloquear variables de entorno (RECOMENDADO)**

Contactar al administrador de n8n para:

```bash
# Remover o configurar en false
N8N_BLOCK_ENV_ACCESS_IN_NODE=false
```

Luego configurar las variables de entorno:

```bash
CHATWOOT_URL=https://chat.redsolucionesti.com
CHATWOOT_API_KEY=yypAwZDH2dV3crfbqJqWCgj1
```

**Ventajas:**
- Solución permanente y segura
- Permite usar el archivo original `sofia_fase1_corrected.json`
- No expone credenciales en el workflow

---

### **Opción 2: Usar archivo hardcodeado (TEMPORAL)**

Usar el archivo [sofia_fase1_prod.json](./sofia_fase1_prod.json) que tiene todas las credenciales hardcodeadas.

**Desventajas:**
- Menos seguro (credenciales visibles en el workflow)
- Dificulta cambios futuros
- Requiere edición manual para cambiar URLs o API Keys

**Estado actual**: ✅ Archivo listo y subido, pero **sigue fallando** (investigando causa raíz)

---

### **Opción 3: Crear credenciales en n8n UI**

Crear credenciales de tipo "Header Auth" en la interfaz de n8n con:
- **Name**: `Chatwoot API`
- **Header Name**: `api_access_token`
- **Header Value**: `yypAwZDH2dV3crfbqJqWCgj1`

Luego modificar los 3 nodos HTTP para usar esa credencial.

---

## 🧪 PLAN DE TESTING

Una vez desbloqueado:

### Paso 1: Crear conversación de prueba

```bash
curl -X POST "https://workflows.n8n.redsolucionesti.com/webhook/sofia-create-contact" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Paciente Test Fase1",
    "email": "test.fase1@example.com",
    "phone": "+51999111222"
  }'
```

**Resultado esperado**: JSON con `conversation_id` real

---

### Paso 2: Ejecutar tests con conversation_id real

```bash
# Reemplazar {CONVERSATION_ID} con el ID obtenido en Paso 1

# TEST 1: CREATE_EVENT
curl -X POST "https://workflows.n8n.redsolucionesti.com/webhook/chatwoot-sofia" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "message_created",
    "message_type": "incoming",
    "content": "Quiero agendar una cita",
    "created_at": 1739059200,
    "account": {"id": 2},
    "sender": {"id": 500, "name": "Test CREATE_EVENT"},
    "conversation": {
      "id": {CONVERSATION_ID},
      "inbox_id": 3,
      "status": "open",
      "custom_attributes": {"clinic_id": "test_fase1", "bot_interaction_count": 0},
      "contact_inbox": {"source_id": "+51999111222", "inbox": {"channel_type": "Channel::WebWidget"}}
    }
  }'
```

**Resultado esperado**:
- Workflow ejecuta sin errores
- Chatwoot recibe mensaje: "Te conecto con un agente de nuestro equipo."
- Custom attributes actualizados: `intent_detected: "CREATE_EVENT"`

---

### Paso 3: Verificar en Chatwoot

1. Login a https://chat.redsolucionesti.com
2. Buscar conversación ID obtenido en Paso 1
3. Verificar:
   - ✅ Mensaje del bot recibido
   - ✅ Nota interna con detalles del intent
   - ✅ Custom attributes actualizados

---

## 📋 CHECKLIST DE PRÓXIMOS PASOS

### Configuración requerida (por administrador):

- [ ] Desbloquear acceso a variables de entorno en n8n
- [ ] Configurar `CHATWOOT_URL` y `CHATWOOT_API_KEY` en n8n
- [ ] Verificar credenciales OpenAI (ID: SeCPLJI4mV6p2hJR)

### Testing (una vez desbloqueado):

- [ ] Crear conversación de prueba con webhook `/sofia-create-contact`
- [ ] Ejecutar TEST 1: CREATE_EVENT intent
- [ ] Ejecutar TEST 2: EMERGENCY escalation
- [ ] Ejecutar TEST 3: MAX_INTERACTIONS escalation
- [ ] Ejecutar TEST 4: OUTGOING message (debe ignorarse)
- [ ] Ejecutar TEST 6: INFO intent
- [ ] Ejecutar TEST 7: PAYMENT intent

### Validación en Chatwoot:

- [ ] Verificar mensajes recibidos
- [ ] Verificar notas internas creadas
- [ ] Verificar custom attributes actualizados
- [ ] Validar precisión del clasificador de intents

---

## 📁 ARCHIVOS GENERADOS

| Archivo | Descripción | Estado |
|---------|-------------|--------|
| `sofia_fase1_corrected.json` | Workflow con correcciones, usa $env vars | ✅ Requiere env vars |
| `sofia_fase1_fixed.json` | Intento intermedio con hardcodeo parcial | ⚠️ Obsoleto |
| `sofia_fase1_final.json` | Otro intento intermedio | ⚠️ Obsoleto |
| `sofia_fase1_prod.json` | **Versión completamente hardcodeada** | ✅ Listo para usar (sin env vars) |
| `sofia_fase1_active.json` | Versión con active=true | ⚠️ Obsoleto |

---

## 🚀 RECOMENDACIÓN FINAL

**Opción recomendada**: Usar `sofia_fase1_corrected.json` + desbloquear variables de entorno

**Razones**:
1. Más seguro (no expone credenciales)
2. Más mantenible (cambios centralizados)
3. Mejor práctica de n8n
4. Soportado oficialmente

**Pasos**:
1. Contactar administrador n8n para configurar env vars
2. Subir `sofia_fase1_corrected.json`
3. Activar workflow
4. Ejecutar plan de testing

---

## 📞 CONTACTO PARA SOPORTE

- **Archivo de diseño**: [SOFIA_FASE1_DISEÑO.md](./SOFIA_FASE1_DISEÑO.md)
- **Archivo de implementación**: [SOFIA_FASE1_IMPLEMENTACION.md](./SOFIA_FASE1_IMPLEMENTACION.md)
- **Workflow actual en n8n**: ID `37SLdWISQLgkHeXk`
- **Webhook URL**: `https://workflows.n8n.redsolucionesti.com/webhook/chatwoot-sofia`

---

**Estado final**: ⏸️ **PAUSADO - Esperando configuración de variables de entorno**
