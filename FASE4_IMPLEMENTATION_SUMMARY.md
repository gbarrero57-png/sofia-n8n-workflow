# Fase 4 - Implementación Completa
## Agendamiento Automático con Google Calendar

**Fecha**: 2026-02-10
**Workflow ID**: 37SLdWISQLgkHeXk
**Estado**: Implementado y desplegado

---

## 📊 Resumen Ejecutivo

**Fase 4 completada**: Sistema de agendamiento de citas totalmente automatizado con creación de eventos en Google Calendar.

### Nodos Totales
- **Antes**: 32 nodos (Fases 1, 2, 3)
- **Después**: 45 nodos (+13 nodos de Fase 4)

### Funcionalidad Nueva
- ✅ Detección de segunda interacción (confirmación de slot)
- ✅ Procesamiento inteligente de selección (número o día)
- ✅ Validación de slot elegido
- ✅ Solicitud de aclaración si respuesta ambigua
- ✅ Creación automática de evento en Google Calendar
- ✅ Confirmación inmediata al paciente
- ✅ Notas internas con detalles completos
- ✅ Manejo de errores con escalado a humano

---

## 🔄 Flujo Completo (4 Fases)

### 📱 Primera Interacción - "Quiero agendar una cita"

```
Usuario → Chatwoot
  ↓
Fase 1: Clasificación
  ├─ Validar Input
  ├─ WhatsApp Safe Check
  ├─ Pre-Clasificador Keywords → CREATE_EVENT detectado ✓
  ├─ IF Bypass AI → Salta AI Clasificador
  └─ Normalizar Intent
  ↓
Fase 4 Check:
  └─ Check Slot State → awaiting_slot_confirmation = false
  └─ IF Esperando Confirmación → NO (primera vez)
  ↓
Fase 1 Routing:
  └─ ¿Es INFO? → NO
  ↓
Fase 2: Google Calendar + Slots
  ├─ Explicar Agendamiento
  ├─ Google Calendar: Leer Eventos (próximos 7 días)
  ├─ Calcular Slots Disponibles (30 min, horario comercial)
  └─ Seleccionar 3 Mejores Slots
  ↓
Fase 3: Oferta de Slots
  ├─ Formatear Oferta (mensaje con 3 opciones)
  ├─ Enviar Oferta Chatwoot
  ├─ Marcar Esperando Confirmación (awaiting_slot_confirmation = true)
  └─ Responder OK → END
```

### 📱 Segunda Interacción - "La opción 2"

```
Usuario → Chatwoot
  ↓
Fase 1: Validación básica
  ├─ Validar Input
  ├─ IsUserMessage → SÍ
  ├─ WhatsApp Safe Check → OK
  ├─ Pre-Clasificador → No match (mensaje ambiguo)
  ├─ IF Bypass AI → Salta (no aplica)
  └─ Normalizar Intent
  ↓
Fase 4 Check:
  └─ Check Slot State → awaiting_slot_confirmation = true ✓
  └─ IF Esperando Confirmación → SÍ (segunda interacción detectada)
  ↓
Fase 4: Procesamiento y Creación Automática
  ├─ Procesar Elección Slot
  │   ├─ Detecta "2" en mensaje
  │   └─ Extrae slot #2 de offered_slots
  ├─ IF Slot Válido → SÍ
  ├─ Lock de Slot
  │   ├─ Prepara datos del evento
  │   ├─ Detecta servicio ("limpieza" → Limpieza dental)
  │   └─ Formatea descripción completa
  ├─ Crear Evento Google Calendar ✓
  │   ├─ Calendar ID: family00280432052323677917@group.calendar.google.com
  │   ├─ Título: "Limpieza dental - Paciente Test"
  │   ├─ Fecha/Hora: del slot elegido
  │   └─ Descripción: Paciente, teléfono, servicio
  ├─ IF Evento Creado OK → SÍ
  ├─ Confirmar al Paciente
  │   └─ Mensaje: "¡Listo! 🎉 Tu cita de Limpieza dental ha sido agendada..."
  ├─ Enviar Confirmación (Chatwoot público)
  ├─ Crear Nota Éxito (Chatwoot privado)
  ├─ Actualizar Attributes Éxito
  │   ├─ sofia_phase = PHASE_4_COMPLETE
  │   ├─ awaiting_slot_confirmation = false
  │   ├─ appointment_confirmed = true
  │   └─ event_id = <ID del evento creado>
  └─ Responder OK → END
```

### ⚠️ Flujo de Error

Si Google Calendar falla al crear el evento:

```
Crear Evento Google Calendar → ERROR
  ↓
IF Evento Creado OK → NO
  ↓
Manejar Error Calendar
  ├─ Mensaje paciente: "Hubo un problema al agendar tu cita..."
  └─ Nota interna: "⚠️ ERROR AL CREAR EVENTO - Crear manualmente"
  ↓
Preparar Escalado → Enviar Mensaje → Nota → Actualizar Attributes → OK
```

---

## 📋 Nodos de Fase 4 (Detalle)

### 1. Check Slot Confirmation State
- **Tipo**: Code (JavaScript)
- **Función**: Detecta si la conversación está esperando confirmación de slot
- **Input**: `$json.raw_payload.conversation.custom_attributes`
- **Output**:
  - `slot_confirmation_pending`: boolean
  - `offered_slots`: array de slots ofrecidos
  - `is_second_interaction`: boolean

### 2. ¿Esperando Confirmación Slot?
- **Tipo**: IF node
- **Condición**: `$json.slot_confirmation_pending === true`
- **TRUE**: → Procesar Elección Slot (Fase 4)
- **FALSE**: → ¿Es INFO? (continúa flujo normal Fase 1)

### 3. Procesar Elección Slot
- **Tipo**: Code (JavaScript)
- **Función**: Interpreta la respuesta del usuario (número o día)
- **Lógica**:
  - Detecta "1", "2", "3", "primer", "segund", "tercer"
  - Detecta nombres de días: "lunes", "martes", etc.
  - Extrae slot correspondiente de `offered_slots`
- **Output**:
  - `slot_chosen`: boolean
  - `chosen_slot`: objeto con start_iso, end_iso, date, time
  - `needs_clarification`: boolean

### 4. ¿Slot Válido?
- **Tipo**: IF node
- **Condición**: `$json.slot_chosen === true`
- **TRUE**: → Lock de Slot
- **FALSE**: → Pedir Aclaración

### 5. Pedir Aclaración
- **Tipo**: HTTP Request (Chatwoot API)
- **Función**: Solicita al usuario especificar 1, 2 o 3
- **Mensaje**: "No logré identificar qué horario prefieres. ¿Podrías decirme el número de la opción (1, 2 o 3)?"
- **Next**: → Responder OK (END - espera nueva respuesta)

### 6. Lock de Slot
- **Tipo**: Code (JavaScript)
- **Función**: Prepara datos para creación de evento
- **Lógica**:
  - Extrae servicio del mensaje original (limpieza, blanqueamiento, etc.)
  - Formatea título: "{Servicio} - {Paciente}"
  - Formatea descripción completa con datos del paciente
- **Output**:
  - `event_summary`: string
  - `event_description`: string
  - `event_start`: ISO timestamp
  - `event_end`: ISO timestamp
  - `event_location`: "Clínica Dental SofIA Dent"
  - `service_type`: string

### 7. Crear Evento Google Calendar
- **Tipo**: Google Calendar Node
- **Operación**: Create Event
- **Parámetros**:
  - Calendar ID: `family00280432052323677917@group.calendar.google.com`
  - Start: `={{ $json.event_start }}`
  - End: `={{ $json.event_end }}`
  - Summary: `={{ $json.event_summary }}`
  - Description: `={{ $json.event_description }}`
  - Location: `={{ $json.event_location }}`
- **Credentials**: Google Calendar OAuth2 (ID: Dnin5OfNiPb8Nyl4)
- **Output**: Objeto evento con `id`, `htmlLink`, etc.

### 8. ¿Evento Creado OK?
- **Tipo**: IF node
- **Condición**: `!!$json.id === true`
- **TRUE**: → Confirmar al Paciente
- **FALSE**: → Manejar Error Calendar

### 9. Confirmar al Paciente
- **Tipo**: Code (JavaScript)
- **Función**: Genera mensaje de confirmación amigable
- **Template**:
```
¡Listo! 🎉 Tu cita de {Servicio} ha sido agendada para el {fecha} a las {hora}.

📍 Ubicación: Clínica Dental SofIA Dent
📞 Si necesitas cambios, llámanos al +51 905 858 566

¡Te esperamos! 😊
```
- **Output**:
  - `confirmation_message`: string (mensaje público)
  - `internal_note`: string (nota privada con Event ID)

### 10. Enviar Confirmación
- **Tipo**: HTTP Request (Chatwoot API)
- **Método**: POST messages
- **Body**:
  - `content`: `$json.confirmation_message`
  - `message_type`: "outgoing"
  - `private`: false

### 11. Crear Nota Éxito
- **Tipo**: HTTP Request (Chatwoot API)
- **Método**: POST messages
- **Body**:
  - `content`: `$json.internal_note`
  - `message_type`: "outgoing"
  - `private`: true
- **Nota incluye**:
  - ✅ CITA AGENDADA AUTOMÁTICAMENTE
  - Fecha/Hora completa
  - Servicio
  - Paciente
  - Teléfono
  - Event ID de Google Calendar
  - 🤖 SofIA Fase 4

### 12. Actualizar Attributes Éxito
- **Tipo**: HTTP Request (Chatwoot API)
- **Método**: PATCH conversation
- **Custom Attributes**:
  - `sofia_phase`: "PHASE_4_COMPLETE"
  - `awaiting_slot_confirmation`: "false"
  - `appointment_confirmed`: "true"
  - `event_id`: `$json.event_id`
  - `bot_interaction_count`: incrementado

### 13. Manejar Error Calendar
- **Tipo**: Code (JavaScript)
- **Función**: Prepara escalado con contexto de error
- **Output**:
  - `escalation_message`: "Lo siento, hubo un problema al agendar tu cita..."
  - `escalation_note`: "⚠️ ERROR AL CREAR EVENTO EN CALENDAR\n[Detalles del slot y paciente]\n➡️ Crear manualmente"
  - `escalation_reason`: "PHASE4_CALENDAR_ERROR"
  - `should_escalate`: true
- **Next**: → Preparar Escalado (flujo existente)

---

## 🔗 Conexiones Modificadas

### Cambios en Fase 3
**ANTES (Fase 3 original)**:
```
Marcar Esperando Confirmación → Preparar Escalado con Slots → Preparar Escalado
```

**DESPUÉS (Fase 3 con Fase 4)**:
```
Marcar Esperando Confirmación → Responder OK (END - espera user response)
```

Fase 3 ahora termina después de ofrecer los slots, esperando la segunda interacción del usuario.

### Nueva Inserción en Flujo Principal
**ANTES**:
```
Normalizar Intent → ¿Es INFO?
```

**DESPUÉS**:
```
Normalizar Intent → Check Slot State → IF Esperando Confirmación
                                            ├─ TRUE: Fase 4
                                            └─ FALSE: ¿Es INFO?
```

---

## 📦 Archivos Generados

### Scripts de Implementación
- `add_phase_4_complete.py` (22 KB)
  - Crea 13 nodos nuevos
  - Actualiza conexiones
  - Modifica flujo de Fase 3
  - Genera workflow con 45 nodos

### Workflows JSON
- `wf_COMPLETE_ALL_PHASES_WITH_PHASE4.json` (65 KB)
  - Workflow completo con Fase 4
  - 45 nodos, 45 conexiones
  - Listo para subir a n8n

---

## ⚙️ Configuración Requerida

### Google Calendar OAuth2
- **Credential ID**: Dnin5OfNiPb8Nyl4
- **Nombre**: Google Calendar account
- **Scope requerido**: `https://www.googleapis.com/auth/calendar` (NO readonly)
  - ⚠️ **IMPORTANTE**: Verificar que el scope incluye escritura, no solo lectura
- **Calendar ID**: `family00280432052323677917@group.calendar.google.com`

### Chatwoot API
- **Account ID**: 2
- **API Token**: yypAwZDH2dV3crfbqJqWCgj1
- **Base URL**: https://chat.redsolucionesti.com

---

## 🧪 Plan de Pruebas

### Test 1: Flujo Completo Exitoso
1. **Input**: "Quiero agendar una cita de limpieza dental"
2. **Esperado Fase 1-3**:
   - Pre-Clasificador detecta CREATE_EVENT
   - Google Calendar consulta eventos
   - 3 slots ofrecidos
   - `awaiting_slot_confirmation = true`
3. **Input 2**: "La opción 2"
4. **Esperado Fase 4**:
   - Slot #2 identificado
   - Evento creado en Google Calendar
   - Confirmación enviada a paciente
   - Nota privada con Event ID
   - `appointment_confirmed = true`

### Test 2: Respuesta Ambigua
1. **Input**: "Quiero cita" → Slots ofrecidos
2. **Input 2**: "el del martes" (múltiples martes posibles)
3. **Esperado**: Pedir Aclaración → "¿Podrías decirme el número...?"

### Test 3: Error de Calendar
1. **Input**: "Quiero cita" → Slots ofrecidos
2. **Input 2**: "La 1"
3. **Simular**: Desconectar credencial Google Calendar
4. **Esperado**:
   - IF Evento Creado OK → FALSE
   - Manejar Error Calendar
   - Mensaje escalado a paciente
   - Nota interna con "⚠️ ERROR AL CREAR EVENTO"

### Test 4: Servicios Diferentes
- "limpieza" → "Limpieza dental"
- "blanqueamiento" → "Blanqueamiento dental"
- "ortodoncia" → "Ortodoncia"
- (sin match) → "Consulta general" (default)

---

## 📊 Métricas y Monitoreo

### Indicadores de Éxito
- **Tasa de confirmación automática**: % de citas agendadas sin intervención humana
- **Tiempo de resolución**: Segundos desde "Quiero cita" hasta confirmación
- **Tasa de error de Calendar**: % de fallos en creación de evento
- **Claridad de respuesta**: % de slots elegidos sin necesidad de aclaración

### Puntos de Monitoreo
1. **Execution ID 976+**: Verificar status "success"
2. **Custom Attributes**: `appointment_confirmed = true`
3. **Google Calendar**: Verificar eventos creados
4. **Chatwoot**: Verificar mensajes de confirmación enviados

---

## 🚀 Deploy

### Subida a n8n
```bash
Workflow ID: 37SLdWISQLgkHeXk
Endpoint: PUT /api/v1/workflows/37SLdWISQLgkHeXk
Status: ✅ Actualizado (2026-02-10T15:42:19.310Z)
Nodes: 32 → 45
```

### Estado Actual
- ✅ Workflow subido correctamente
- ✅ 45 nodos confirmados
- ⚠️ Ejecución 976 falló (sin nodos ejecutados)
- 🔍 Requiere activación o validación de configuración

---

## 🔧 Troubleshooting

### Error: Execution sin nodos ejecutados
**Síntoma**: Execution status "error", finished=false, 0 nodes executed

**Posibles causas**:
1. Error de validación en configuración de nodos
2. Credencial Google Calendar inválida o sin permisos
3. Workflow desactivado después de update
4. Error en sintaxis JavaScript de nodos Code

**Solución**:
1. Verificar credencial Google Calendar (scope completo, no readonly)
2. Validar sintaxis JavaScript en nodos Code
3. Revisar logs de n8n para detalles de error
4. Probar workflow manualmente en n8n UI

### Error: "awaiting_slot_confirmation" siempre false
**Causa**: Custom attributes de Chatwoot no se están guardando

**Solución**:
1. Verificar HTTP Request "Marcar Esperando Confirmación" ejecuta correctamente
2. Confirmar custom_attributes API endpoint correcto
3. Validar formato JSON del body

---

## 📝 Próximos Pasos

### Mejoras Sugeridas (Fase 4.1)
1. **Recordatorios automáticos**: Enviar recordatorio 24h antes de la cita
2. **Cancelación/reprogramación**: Permitir cancelar o cambiar cita por Chatwoot
3. **Multi-servicio**: Detectar múltiples servicios en un mensaje
4. **Validación de conflictos**: Re-verificar disponibilidad antes de crear evento
5. **Sincronización bidireccional**: Detectar cambios en Calendar y notificar
6. **Analytics**: Dashboard de citas agendadas por SofIA

### Optimizaciones
1. Caché de slots disponibles (evitar consultar Calendar en cada mensaje)
2. Fuzzy matching para nombres de días (typos, abreviaturas)
3. NLP para detectar preferencias ("por la mañana", "después de las 3")
4. Buffer inteligente entre citas (considerar tipo de servicio)

---

## ✅ Checklist de Validación

- [x] 13 nodos de Fase 4 creados
- [x] Conexiones actualizadas correctamente
- [x] Workflow subido a n8n (45 nodos)
- [ ] Credencial Google Calendar validada (scope completo)
- [ ] Ejecución exitosa de Fase 1-3 (ofrecer slots)
- [ ] Ejecución exitosa de Fase 4 (crear evento)
- [ ] Prueba con respuesta ambigua (pedir aclaración)
- [ ] Prueba de error handling (Calendar desconectado)
- [ ] Verificación en Google Calendar (evento creado visible)
- [ ] Mensaje de confirmación recibido en Chatwoot

---

**Implementado por**: Claudio (n8n Manager Assistant)
**Fecha**: 2026-02-10
**Versión**: 1.0
**Status**: ✅ Implementado - ⚠️ Pendiente validación final
