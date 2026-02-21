#!/usr/bin/env python3
"""
SofIA Hardening v2 — Retry Logic + Rate Limiting + Execution Logging
Actualiza nodos clave con:
  - withRetry(): exponential backoff para Supabase / OpenAI / Chatwoot
  - check_rate_limit: throttle per-clinic antes de OpenAI
  - log_execution: registra resultado al final del workflow
"""
import json, requests, sys, os
sys.stdout.reconfigure(encoding='utf-8')

N8N_BASE_URL = os.environ.get("N8N_BASE_URL", "https://workflows.n8n.redsolucionesti.com")
N8N_API_KEY  = os.environ.get("N8N_API_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNzY4NTgyLCJleHAiOjE3NzMyODgwMDF9.Z3vHmfdFzKFXzVgGVxoxIuX9VDsuepcFC_9wJiK7EyM")
WORKFLOW_ID  = os.environ.get("N8N_WORKFLOW_ID", "37SLdWISQLgkHeXk")
HEADERS_N8N  = {"X-N8N-API-KEY": N8N_API_KEY, "Content-Type": "application/json"}

# ── Librería de retry (se inyecta en cada nodo que la necesita) ─────────────
RETRY_LIB = r"""
// ── Retry Library (exponential backoff + jitter) ──────────────────────────
const withRetry = async (fn, opts = {}) => {
    const {
        attempts   = 3,
        baseMs     = 1000,      // 1s base
        maxMs      = 30000,     // 30s max wait
        noRetryOn  = [],        // status codes o strings → no reintentar
        onRetry    = null       // callback(attempt, error)
    } = opts;

    let lastError;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch(e) {
            lastError = e;
            const isLast = i === attempts - 1;
            // No reintentar si es un error de negocio (400, 409, etc.)
            const skip = noRetryOn.some(code => e.message?.includes(String(code)));
            if (isLast || skip) throw e;

            // Exponential backoff con jitter (evita thundering herd)
            const delay = Math.min(baseMs * Math.pow(2, i) + Math.random() * 1000, maxMs);
            if (onRetry) onRetry(i + 1, e, delay);
            console.warn(JSON.stringify({
                ts: new Date().toISOString(),
                event: 'RETRY',
                attempt: i + 1,
                delay_ms: Math.round(delay),
                error: e.message?.substring(0, 100)
            }));
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastError;
};

// Helper: llamada a Supabase RPC con retry automático
const supabaseRpc = async (rpcName, body, { attempts = 3 } = {}) => {
    const SUPABASE_URL  = process.env.N8N_SUPABASE_URL;
    const SERVICE_KEY   = process.env.N8N_SUPABASE_SERVICE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('CONFIG_ERROR: Supabase env vars no configuradas');

    return withRetry(async () => {
        return this.helpers.httpRequest({
            method: 'POST',
            url: `${SUPABASE_URL}/rest/v1/rpc/${rpcName}`,
            headers: {
                'apikey':        SERVICE_KEY,
                'Authorization': 'Bearer ' + SERVICE_KEY,
                'Content-Type':  'application/json'
            },
            body,
            json: true
        });
    }, {
        attempts,
        baseMs: 500,
        noRetryOn: ['400', '422', '409']  // Errores de validación → no reintentar
    });
};
// ─────────────────────────────────────────────────────────────────────────────
"""

# ── Nodo: Bot Pause Check v2 (rate limit + retry + cross-validation) ─────────
BOT_PAUSE_V2 = RETRY_LIB + r"""
// ====================================================
// BOT PAUSE CHECK v2 — Rate Limiting + Retry
// ====================================================

const ALERT_URL = process.env.N8N_ALERT_WEBHOOK_URL;
const START_TS  = Date.now();

const clinicId       = $json.clinic_id;
const conversationId = String($json.conversation_id || '');
const inboxId        = $json.inbox_id;
const patientName    = ($json.sender_name || 'Paciente').substring(0, 100);
const messageText    = ($json.message_text || '').substring(0, 500);

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!clinicId || !uuidRegex.test(clinicId)) {
    throw new Error(`SECURITY_ERROR: clinic_id inválido: "${clinicId}"`);
}

// 1. RATE LIMIT: máx 30 webhooks/min por clínica
let rlResult;
try {
    rlResult = await supabaseRpc('check_rate_limit', {
        p_clinic_id:      clinicId,
        p_operation:      'webhook',
        p_max_per_minute: 30
    }, { attempts: 2 });
} catch(e) {
    // Rate limit check fallido → continuar (fail open solo aquí, no en governance)
    console.warn(JSON.stringify({ ts: new Date().toISOString(), event: 'RATE_LIMIT_CHECK_FAILED', error: e.message }));
    rlResult = { allowed: true };
}

if (rlResult && rlResult.allowed === false) {
    console.warn(JSON.stringify({
        ts: new Date().toISOString(),
        event: 'RATE_LIMITED',
        clinic_id: clinicId,
        count: rlResult.count,
        limit: rlResult.limit
    }));
    // Loggear ejecución como rate_limited
    await supabaseRpc('log_execution', {
        p_clinic_id:      clinicId,
        p_conversation_id: conversationId,
        p_status:         'rate_limited',
        p_inbox_id:       inboxId
    }, { attempts: 1 }).catch(() => {});
    // Retornar vacío (detiene el workflow silenciosamente para el paciente)
    return [];
}

// 2. VALIDACIÓN CRUZADA inbox_id ↔ clinic_id
if (inboxId) {
    let crossValid;
    try {
        crossValid = await supabaseRpc('validate_inbox_clinic', {
            p_inbox_id:  inboxId,
            p_clinic_id: clinicId
        }, { attempts: 2 });
    } catch(e) {
        const msg = 'SECURITY_ERROR: validate_inbox_clinic falló: ' + e.message;
        if (ALERT_URL) await this.helpers.httpRequest({ method: 'POST', url: ALERT_URL,
            body: { alert: 'CROSS_VALIDATION_DOWN', clinic_id: clinicId, error: e.message, ts: new Date().toISOString() },
            json: true }).catch(() => {});
        throw new Error(msg);
    }
    if (crossValid !== true) {
        if (ALERT_URL) await this.helpers.httpRequest({ method: 'POST', url: ALERT_URL,
            body: { alert: 'TENANT_ISOLATION_VIOLATION', severity: 'CRITICAL', clinic_id: clinicId, inbox_id: inboxId, ts: new Date().toISOString() },
            json: true }).catch(() => {});
        throw new Error(`SECURITY_ERROR: inbox ${inboxId} no pertenece a clinic ${clinicId}`);
    }
}

// 3. GOVERNANCE CHECK con retry (fail-closed)
let govResult;
try {
    govResult = await supabaseRpc('upsert_conversation', {
        p_clinic_id:                clinicId,
        p_chatwoot_conversation_id: conversationId,
        p_patient_name:             patientName,
        p_last_message:             messageText
    }, { attempts: 3 });
} catch(e) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), event: 'GOVERNANCE_FAILED', error: e.message }));
    if (ALERT_URL) await this.helpers.httpRequest({ method: 'POST', url: ALERT_URL,
        body: { alert: 'BOT_PAUSE_CHECK_DOWN', severity: 'HIGH', clinic_id: clinicId, error: e.message, ts: new Date().toISOString() },
        json: true }).catch(() => {});
    throw new Error('GOVERNANCE_UNAVAILABLE: ' + e.message);
}

const conversation = Array.isArray(govResult) ? govResult[0] : govResult;

if (conversation && conversation.bot_paused === true) {
    console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'BOT_PAUSED_GATE', clinic_id: clinicId, conversation_id: conversationId }));
    return [];
}

return [{ json: {
    ...$json,
    governance_conversation_id: conversation?.conversation_id ?? null,
    governance_status:          conversation?.status ?? 'active',
    governance_checked:         true,
    _start_ts:                  START_TS   // Para calcular duration_ms al final
} }];
"""

# ── Nodo: Registrar Ejecución (NUEVO — último nodo del workflow) ─────────────
LOG_EXECUTION_CODE = RETRY_LIB + r"""
// ====================================================
// REGISTRAR EJECUCIÓN — Logging de resultado
// Último nodo del workflow. Registra en execution_log.
// ====================================================

const clinicId       = $json.clinic_id;
const conversationId = String($json.conversation_id || '');
const intent         = $json.intent || 'UNKNOWN';
const startTs        = $json._start_ts || Date.now();
const durationMs     = Date.now() - startTs;

// Determinar status según datos del flujo
const status = $json.appointment_error
    ? 'error'
    : ($json.governance_checked === false
        ? 'error'
        : 'success');

const logPayload = {
    p_clinic_id:         clinicId,
    p_conversation_id:   conversationId,
    p_workflow_id:       '37SLdWISQLgkHeXk',
    p_intent:            intent,
    p_status:            status,
    p_duration_ms:       durationMs,
    p_openai_tokens:     $json._openai_tokens || null,
    p_openai_latency_ms: $json._openai_latency || null,
    p_inbox_id:          $json.inbox_id || null
};

try {
    await supabaseRpc('log_execution', logPayload, { attempts: 2 });
    console.log(JSON.stringify({
        ts: new Date().toISOString(),
        event: 'EXECUTION_LOGGED',
        status,
        duration_ms: durationMs,
        intent,
        clinic_id: clinicId
    }));
} catch(e) {
    // Logging falla → no bloquear el flujo (best-effort)
    console.warn(JSON.stringify({ ts: new Date().toISOString(), event: 'LOG_EXECUTION_FAILED', error: e.message }));
}

// Limpiar campos internos antes de pasar al siguiente nodo
const output = Object.assign({}, $json);
delete output._start_ts;
delete output._openai_tokens;
delete output._openai_latency;

return [{ json: output }];
"""

# ── Nodo: Resolver Clinica v2 (con retry) ────────────────────────────────────
RESOLVER_V2 = RETRY_LIB + r"""
// RESOLVER CLINICA v2 — Con retry (sin DEFAULT_CLINIC)
const inboxId   = $json.inbox_id;
const accountId = $json.account_id;

if (!inboxId) throw new Error('VALIDATION_ERROR: inbox_id ausente');

let results;
try {
    results = await supabaseRpc('resolve_clinic', {
        p_inbox_id:   inboxId,
        p_account_id: accountId
    }, { attempts: 3 });
} catch(e) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), event: 'RESOLVE_CLINIC_ERROR', inbox_id: inboxId, error: e.message }));
    throw new Error('INFRA_ERROR: resolve_clinic no disponible: ' + e.message);
}

const clinicData = Array.isArray(results) ? results[0] : results;

if (!clinicData || !clinicData.clinic_id) {
    const alertUrl = process.env.N8N_ALERT_WEBHOOK_URL;
    if (alertUrl) await this.helpers.httpRequest({ method: 'POST', url: alertUrl,
        body: { alert: 'UNKNOWN_INBOX', severity: 'HIGH', inbox_id: inboxId, ts: new Date().toISOString() },
        json: true }).catch(() => {});
    console.error(JSON.stringify({ ts: new Date().toISOString(), event: 'UNKNOWN_INBOX_REJECTED', inbox_id: inboxId }));
    return [];
}

console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'CLINIC_RESOLVED', clinic_id: clinicData.clinic_id, inbox_id: inboxId }));
return [{ json: Object.assign({}, $input.item.json, { _clinic_response: clinicData }) }];
"""

# ── Nodo: Buscar Knowledge Base v2 (retry, rate limit OpenAI) ────────────────
BUSCAR_KB_V2 = RETRY_LIB + r"""
// BUSCAR KB v2 — Con retry y rate limit OpenAI
const clinicId = $json.clinic_id;
const query    = ($json.message_text || '').substring(0, 200);
if (!clinicId) throw new Error('INTERNAL_ERROR: clinic_id ausente');

// Rate limit: máx 60 llamadas OpenAI/min por clínica (estimado)
const rlRes = await supabaseRpc('check_rate_limit', {
    p_clinic_id: clinicId, p_operation: 'openai', p_max_per_minute: 60
}, { attempts: 1 }).catch(() => ({ allowed: true }));

if (rlRes && rlRes.allowed === false) {
    console.warn(JSON.stringify({ ts: new Date().toISOString(), event: 'OPENAI_RATE_LIMITED', clinic_id: clinicId }));
    // Retornar KB vacío para que el LLM responda sin contexto (aceptable)
    return [{ json: Object.assign({}, $json, { kb_results: [], kb_status: 'rate_limited' }) }];
}

let results = [];
try {
    results = await supabaseRpc('search_knowledge_base', {
        p_clinic_id: clinicId, p_query: query, p_limit: 5
    }, { attempts: 3 });
} catch(e) {
    console.warn(JSON.stringify({ ts: new Date().toISOString(), event: 'KB_FAILED', error: e.message }));
    results = [];
}

return [{ json: Object.assign({}, $json, { kb_results: results, kb_status: results.length > 0 ? 'ok' : 'empty' }) }];
"""

# ── Nodo: Guardar Cita v2 (retry con idempotency check) ─────────────────────
GUARDAR_CITA_V2 = RETRY_LIB + r"""
// GUARDAR CITA v2 — Retry + Idempotency check
const SUPABASE_URL = process.env.N8N_SUPABASE_URL;
const SERVICE_KEY  = process.env.N8N_SUPABASE_SERVICE_KEY;
const clinicId     = $json.clinic_id;

if (!clinicId || !/^[0-9a-f]{8}-/.test(clinicId)) {
    throw new Error('INTERNAL_ERROR: clinic_id inválido en Guardar Cita: ' + clinicId);
}

const calendarEventId = ($json.id || 'unknown').substring(0, 100);

// IDEMPOTENCY: verificar si ya existe una cita con este calendar_event_id
let existing;
try {
    existing = await withRetry(async () => this.helpers.httpRequest({
        method: 'GET',
        url: `${SUPABASE_URL}/rest/v1/appointments?calendar_event_id=eq.${encodeURIComponent(calendarEventId)}&clinic_id=eq.${clinicId}&select=id`,
        headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY },
        json: true
    }), { attempts: 2 });
} catch(e) { existing = []; }

if (existing && existing.length > 0) {
    console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'APPOINTMENT_ALREADY_EXISTS', calendar_event_id: calendarEventId }));
    return [{ json: Object.assign({}, $json, { appointment_saved: true, appointment_duplicate: true }) }];
}

const body = {
    clinic_id: clinicId, conversation_id: $json.conversation_id || 0,
    patient_name: ($json.sender_name || 'Paciente').substring(0, 100),
    phone: ($json.contact_phone || '').substring(0, 30),
    service: 'Consulta dental',
    start_time: $json.start || new Date().toISOString(),
    end_time:   $json.end   || new Date(Date.now() + 3600000).toISOString(),
    calendar_event_id: calendarEventId,
    status: 'scheduled'
};

try {
    await withRetry(async () => this.helpers.httpRequest({
        method: 'POST',
        url: `${SUPABASE_URL}/rest/v1/appointments`,
        headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY,
                   'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body, json: true
    }), { attempts: 3, baseMs: 500, noRetryOn: ['409'] });  // 409 = duplicado → no reintentar

    return [{ json: Object.assign({}, $json, { appointment_saved: true }) }];
} catch(e) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), event: 'APPOINTMENT_SAVE_FAILED', error: e.message }));
    return [{ json: Object.assign({}, $json, { appointment_saved: false, appointment_error: e.message }) }];
}
"""

# ── Mapping: nodo → código v2 ─────────────────────────────────────────────────
NODE_V2_CODE = {
    'Resolver Clinica':      RESOLVER_V2,
    'Bot Pause Check':       BOT_PAUSE_V2,
    'Buscar Knowledge Base': BUSCAR_KB_V2,
    'Guardar Cita Supabase': GUARDAR_CITA_V2,
}

NEW_NODES = {
    'Registrar Ejecucion': {
        'code': LOG_EXECUTION_CODE,
        'type': 'n8n-nodes-base.code',
        'description': 'Último nodo: registra resultado en execution_log'
    }
}

# ── Deploy ────────────────────────────────────────────────────────────────────
print("=" * 70)
print("SofIA Hardening v2 — Retry Logic + Rate Limiting + Execution Logging")
print("=" * 70)

r = requests.get(f"{N8N_BASE_URL}/api/v1/workflows/{WORKFLOW_ID}", headers=HEADERS_N8N)
if r.status_code != 200:
    print(f"[ERROR] {r.status_code}: {r.text[:200]}")
    sys.exit(1)
wf = r.json()
print(f"\n1. Workflow: {wf['name']} ({len(wf['nodes'])} nodos)")

# Backup
with open("workflow_backup_pre_v2.json", 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)
print(f"   Backup: workflow_backup_pre_v2.json")

# Actualizar nodos existentes
print("\n2. Actualizando nodos con retry logic v2...")
updated = 0
for i, node in enumerate(wf['nodes']):
    if node['name'] in NODE_V2_CODE:
        wf['nodes'][i]['parameters']['jsCode'] = NODE_V2_CODE[node['name']]
        print(f"   [OK] {node['name']}")
        updated += 1

# Agregar nodo Registrar Ejecucion si no existe
if not any(n['name'] == 'Registrar Ejecucion' for n in wf['nodes']):
    # Posición: después del último nodo conocido
    last_nodes = [n for n in wf['nodes'] if 'Registrar Metrica' in n['name'] or 'Enviar Respuesta' in n['name']]
    pos_x = max((n['position'][0] for n in last_nodes), default=1200) + 220
    pos_y = 376

    wf['nodes'].append({
        "parameters": {"jsCode": LOG_EXECUTION_CODE},
        "name": "Registrar Ejecucion",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [pos_x, pos_y]
    })
    print(f"\n3. Nodo 'Registrar Ejecucion' AGREGADO en [{pos_x}, {pos_y}]")

print(f"\n   Total nodos actualizados: {updated}")

# Upload
r = requests.put(f"{N8N_BASE_URL}/api/v1/workflows/{WORKFLOW_ID}",
    headers=HEADERS_N8N, json={
        'name': wf['name'], 'nodes': wf['nodes'],
        'connections': wf['connections'],
        'settings': wf.get('settings', {}),
        'staticData': wf.get('staticData')
    })

if r.status_code == 200:
    result = r.json()
    with open("workflow_v2_deployed.json", 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(f"\n4. [OK] Workflow subido: {len(result['nodes'])} nodos")
else:
    print(f"\n4. [ERROR] {r.status_code}: {r.text[:300]}")
    sys.exit(1)

print(f"""
{'='*70}
HARDENING v2 — COMPLETO
{'='*70}

Retry logic activado en:
  ✅ Resolver Clinica   (3 intentos, backoff 500ms)
  ✅ Bot Pause Check    (3 intentos governance, 2 rate limit)
  ✅ Buscar KB          (3 intentos, rate limit OpenAI)
  ✅ Guardar Cita       (3 intentos + idempotency check)

Nuevos nodos:
  ✅ Registrar Ejecucion (log_execution → execution_log)

Rate limiting (via Supabase):
  ✅ webhook:  30 req/min por clínica
  ✅ openai:   60 req/min por clínica

PENDIENTE (manual):
  ⚠️  Conectar 'Registrar Ejecucion' al final del flujo en n8n UI
  ⚠️  Configurar env vars en servidor n8n (ver HARDENING_SETUP.md)
  ⚠️  Activar Queue Mode (ver docker-compose.queue.yml)
""")
