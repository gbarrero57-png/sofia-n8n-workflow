# n8n Workflow Modifications for SaaS Architecture

## Overview

The current SofIA workflow (48 nodes) needs these modifications:
1. Add clinic resolution at the start
2. Replace hardcoded Knowledge Base with Supabase query
3. Add appointment tracking after Google Calendar creation
4. Add metrics logging at conversation end
5. New separate workflow: 24h Reminder

---

## MODIFICATION 1: Clinic Resolution (New Node After Validar Input)

### Current Flow
```
Chatwoot Webhook → Validar Input → IsUserMessage
```

### New Flow
```
Chatwoot Webhook → Validar Input → Resolver Clinica → IsUserMessage
```

### New Node: "Resolver Clinica" (HTTP Request)

**Type:** n8n-nodes-base.httpRequest

**Configuration:**
```json
{
  "method": "POST",
  "url": "https://YOUR_PROJECT.supabase.co/rest/v1/rpc/resolve_clinic",
  "headers": {
    "apikey": "={{ $env.SUPABASE_ANON_KEY }}",
    "Authorization": "Bearer {{ $env.SUPABASE_SERVICE_KEY }}",
    "Content-Type": "application/json"
  },
  "body": {
    "p_inbox_id": "={{ $json.inbox_id }}",
    "p_account_id": "={{ $json.account_id }}"
  }
}
```

**Output enrichment (Code node after HTTP):**
```javascript
// Merge clinic data into the flow
const clinicData = $input.item.json;
const previousData = $node['Validar Input'].json;

return [{
  json: {
    ...previousData,
    clinic_id: clinicData.clinic_id,
    clinic_name: clinicData.clinic_name,
    calendar_id: clinicData.calendar_id,
    timezone: clinicData.timezone,
    bot_config: clinicData.bot_config,
    // Override hardcoded values with clinic-specific ones
    max_bot_interactions: clinicData.bot_config?.max_bot_interactions || 3,
    business_hours_start: clinicData.bot_config?.business_hours_start || 8,
    business_hours_end: clinicData.bot_config?.business_hours_end || 22
  }
}];
```

### Impact
- `$json.clinic_id` is now available in ALL downstream nodes
- `$json.calendar_id` replaces hardcoded Google Calendar ID
- `$json.bot_config` replaces hardcoded bot behavior

---

## MODIFICATION 2: Replace Knowledge Base Code Node

### Current Node: "Knowledge Base" (Code)
Currently hardcoded FAQ responses.

### Replace With: "Buscar Knowledge Base" (HTTP Request)

**Type:** n8n-nodes-base.httpRequest

**Configuration:**
```json
{
  "method": "POST",
  "url": "https://YOUR_PROJECT.supabase.co/rest/v1/rpc/search_knowledge_base",
  "headers": {
    "apikey": "={{ $env.SUPABASE_ANON_KEY }}",
    "Authorization": "Bearer {{ $env.SUPABASE_SERVICE_KEY }}",
    "Content-Type": "application/json"
  },
  "body": {
    "p_clinic_id": "={{ $json.clinic_id }}",
    "p_query": "={{ $json.message_text }}",
    "p_limit": 5
  }
}
```

### New Node: "Preparar Contexto KB" (Code)
After the Supabase query, format results for the LLM prompt:

```javascript
const results = $input.all();
const message = $node['Validar Input'].json.message_text;

if (!results || results.length === 0) {
  return [{
    json: {
      kb_context: 'No se encontró información específica sobre esa consulta.',
      kb_found: false,
      message_text: message
    }
  }];
}

// Build context from top KB matches
const context = results
  .map(r => `P: ${r.json.question}\nR: ${r.json.answer}`)
  .join('\n\n');

return [{
  json: {
    kb_context: context,
    kb_found: true,
    kb_results_count: results.length,
    message_text: message
  }
}];
```

### Modify: "Preparar Prompt INFO"
Change the prompt to use dynamic context:

```javascript
const context = $json.kb_context;
const message = $json.message_text;
const clinicName = $json.clinic_name || 'la clínica';

const prompt = `Eres SofIA, asistente virtual de ${clinicName}.
Responde la pregunta del paciente usando SOLO la información proporcionada.
Si no tienes la información, indica que un agente puede ayudar.

INFORMACIÓN DISPONIBLE:
${context}

PREGUNTA DEL PACIENTE:
${message}

RESPUESTA (concisa, amable, profesional):`;

return [{ json: { prompt, message_text: message } }];
```

---

## MODIFICATION 3: Appointment Tracking

### Current Flow (Phase 4)
```
Crear Evento Google Calendar → ¿Evento Creado OK? → Confirmar al Paciente
```

### New Flow
```
Crear Evento Google Calendar → ¿Evento Creado OK? → Guardar Cita en Supabase → Confirmar al Paciente
```

### New Node: "Guardar Cita en Supabase" (HTTP Request)

**Type:** n8n-nodes-base.httpRequest

**Configuration:**
```json
{
  "method": "POST",
  "url": "https://YOUR_PROJECT.supabase.co/rest/v1/appointments",
  "headers": {
    "apikey": "={{ $env.SUPABASE_ANON_KEY }}",
    "Authorization": "Bearer {{ $env.SUPABASE_SERVICE_KEY }}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
  },
  "body": {
    "clinic_id": "={{ $json.clinic_id }}",
    "conversation_id": "={{ $json.conversation_id }}",
    "patient_name": "={{ $json.sender_name }}",
    "phone": "={{ $json.contact_phone }}",
    "service": "={{ $json.chosen_slot?.service || 'Consulta general' }}",
    "start_time": "={{ $json.chosen_slot?.start }}",
    "end_time": "={{ $json.chosen_slot?.end }}",
    "calendar_event_id": "={{ $json.id }}",
    "status": "scheduled"
  }
}
```

---

## MODIFICATION 4: Metrics Logging

### Add Before: "Responder OK" (at every exit point)

Each path that reaches "Responder OK" should first pass through metrics logging.

### New Node: "Registrar Metrica" (HTTP Request)

**Type:** n8n-nodes-base.httpRequest

**Configuration:**
```json
{
  "method": "POST",
  "url": "https://YOUR_PROJECT.supabase.co/rest/v1/rpc/upsert_conversation_metric",
  "headers": {
    "apikey": "={{ $env.SUPABASE_ANON_KEY }}",
    "Authorization": "Bearer {{ $env.SUPABASE_SERVICE_KEY }}",
    "Content-Type": "application/json"
  },
  "body": {
    "p_clinic_id": "={{ $json.clinic_id }}",
    "p_conversation_id": "={{ $json.conversation_id }}",
    "p_intent": "={{ $json.intent || 'UNKNOWN' }}",
    "p_escalated": "={{ $json.escalated || false }}",
    "p_booked": "={{ $json.booked || false }}",
    "p_phase_reached": "={{ $json.phase_reached || 1 }}",
    "p_response_time_ms": "={{ Date.now() - ($json.message_timestamp * 1000) }}"
  }
}
```

### Where to Add Metrics
Add "Registrar Metrica" before "Responder OK" on these paths:

| Path | intent | escalated | booked | phase_reached |
|------|--------|-----------|--------|---------------|
| WhatsApp Safe → Escalado | HUMAN | true | false | 1 |
| Router → PAYMENT → Escalado | PAYMENT | true | false | 1 |
| Router → HUMAN → Escalado | HUMAN | true | false | 1 |
| Router → INFO → Knowledge Base → Respond | INFO | false | false | 2 |
| Router → CREATE_EVENT → Calendar → Booked | CREATE_EVENT | false | true | 4 |
| Router → CREATE_EVENT → Calendar → Failed | CREATE_EVENT | false | false | 3 |

---

## MODIFICATION 5: Google Calendar Dynamic

### Current: Hardcoded Calendar ID
The "Google Calendar: Leer Eventos" node has a hardcoded calendar ID.

### Change To: Dynamic from clinic data
```
Calendar ID: {{ $json.calendar_id }}
```

Same for "Crear Evento Google Calendar":
```
Calendar ID: {{ $json.calendar_id }}
```

---

## NEW WORKFLOW: 24h Appointment Reminder

Create a separate n8n workflow for reminders.

### Trigger: Schedule (every hour)
```json
{
  "rule": { "interval": [{ "field": "hours", "triggerAtHour": 1 }] }
}
```

### Flow:
```
Schedule Trigger
    → Fetch Pending Reminders (Supabase RPC)
    → SplitInBatches (one per appointment)
    → Build Reminder Message (Code)
    → Send via Chatwoot API (HTTP Request)
    → Mark Reminder Sent (Supabase RPC)
```

### Node: "Fetch Pending Reminders"
```json
{
  "method": "POST",
  "url": "https://YOUR_PROJECT.supabase.co/rest/v1/rpc/get_pending_reminders",
  "headers": {
    "apikey": "{{ $env.SUPABASE_ANON_KEY }}",
    "Authorization": "Bearer {{ $env.SUPABASE_SERVICE_KEY }}"
  }
}
```

### Node: "Build Reminder Message" (Code)
```javascript
const apt = $json;
const startDate = new Date(apt.start_time);
const day = startDate.toLocaleDateString('es-PE', {
  weekday: 'long', day: 'numeric', month: 'long',
  timeZone: 'America/Lima'
});
const time = startDate.toLocaleTimeString('es-PE', {
  hour: '2-digit', minute: '2-digit',
  timeZone: 'America/Lima'
});

return [{
  json: {
    ...apt,
    reminder_message: `Hola ${apt.patient_name}! Te recordamos que tienes una cita de ${apt.service} manana ${day} a las ${time} en ${apt.clinic_name}. Si necesitas cancelar o reprogramar, respondenos a este mensaje.`
  }
}];
```

### Node: "Send via Chatwoot" (HTTP Request)
```json
{
  "method": "POST",
  "url": "=https://chat.redsolucionesti.com/api/v1/accounts/{{ $json.chatwoot_account_id }}/conversations/{{ $json.conversation_id }}/messages",
  "headers": {
    "api_access_token": "={{ $env.CHATWOOT_API_TOKEN }}",
    "Content-Type": "application/json"
  },
  "body": {
    "content": "={{ $json.reminder_message }}",
    "message_type": "outgoing"
  }
}
```

### Node: "Mark Reminder Sent" (HTTP Request)
```json
{
  "method": "POST",
  "url": "https://YOUR_PROJECT.supabase.co/rest/v1/rpc/mark_reminder_sent",
  "headers": {
    "apikey": "={{ $env.SUPABASE_ANON_KEY }}",
    "Authorization": "Bearer {{ $env.SUPABASE_SERVICE_KEY }}"
  },
  "body": {
    "p_appointment_id": "={{ $json.appointment_id }}",
    "p_status": "sent"
  }
}
```

---

## Environment Variables Required in n8n

Add these to n8n environment:

```
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...  (for backend RPC calls)
CHATWOOT_API_TOKEN=yypAwZDH2dV3crfbqJqWCgj1
```

---

## Migration Sequence

Execute in this order:
1. Create Supabase project and run SQL migrations
2. Add environment variables to n8n
3. Add "Resolver Clinica" node (Modification 1)
4. Replace Knowledge Base node (Modification 2)
5. Add appointment tracking (Modification 3)
6. Add metrics logging (Modification 4)
7. Make Calendar IDs dynamic (Modification 5)
8. Create Reminder workflow (New Workflow)
9. Run tests after each modification
