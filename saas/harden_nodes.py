#!/usr/bin/env python3
"""
SofIA Hardening Layer 1 - Deploy
Reemplaza todos los nodos con código endurecido:
  - Credenciales desde process.env (no hardcoded)
  - Webhook con verificación de token + replay protection
  - Bot Pause Check fail-closed
  - Sin DEFAULT_CLINIC fallback
  - Logging estructurado
  - Validación cruzada inbox_id <-> clinic_id
"""
import json, requests, sys, os
sys.stdout.reconfigure(encoding='utf-8')

# ============================================================
# CREDENCIALES DE DEPLOY (leídas de env vars, NO hardcoded)
# ============================================================
N8N_BASE_URL = os.environ.get("N8N_BASE_URL", "https://workflows.n8n.redsolucionesti.com")
N8N_API_KEY  = os.environ.get("N8N_API_KEY", "")
WORKFLOW_ID  = os.environ.get("N8N_WORKFLOW_ID", "37SLdWISQLgkHeXk")

if not N8N_API_KEY:
    # Fallback para uso local durante transición — leer de .env
    try:
        from dotenv import load_dotenv
        load_dotenv(".env.deploy")
        N8N_API_KEY = os.environ.get("N8N_API_KEY", "")
    except ImportError:
        pass

if not N8N_API_KEY:
    print("[ERROR] N8N_API_KEY no configurada. Exportar como variable de entorno.")
    sys.exit(1)

HEADERS_N8N = {"X-N8N-API-KEY": N8N_API_KEY, "Content-Type": "application/json"}

# ============================================================
# NODO 1: Verificar Webhook Token (NUEVO - primer nodo de seguridad)
# Posición: entre el Webhook trigger y Validar Input
# ============================================================

WEBHOOK_SECURITY_CODE = r"""
// ====================================================
// WEBHOOK SECURITY GATE — SofIA Hardened v1
// Verifica autenticidad del webhook de Chatwoot.
// Rechaza: token inválido, payload viejo (replay).
// ====================================================

const headers = $input.item.json.headers || {};

// 1. VERIFICAR TOKEN DE CHATWOOT
// n8n pasa los headers en lowercase
const token = (
    headers['x-chatwoot-webhook-token'] ||
    headers['X-Chatwoot-Webhook-Token'] ||
    ''
);

const expectedToken = process.env.N8N_CHATWOOT_WEBHOOK_TOKEN;

if (!expectedToken) {
    // Si la env var no está configurada, el sistema no puede validar
    // Esto es un error de configuración — fallar siempre
    throw new Error('CONFIG_ERROR: N8N_CHATWOOT_WEBHOOK_TOKEN no configurada en el servidor n8n');
}

if (!token || token !== expectedToken) {
    // Posible ataque o request inválido
    // Lanzar error hace que n8n retorne 500 (no continúa el workflow)
    throw new Error(`SECURITY: Token de webhook inválido. IP: ${headers['x-real-ip'] || headers['x-forwarded-for'] || 'unknown'}`);
}

// 2. PROTECCIÓN CONTRA REPLAY ATTACK
// Chatwoot incluye created_at en el payload
const payload = $input.item.json.body || $input.item.json;
const createdAt = payload.created_at || payload.timestamp;

if (createdAt) {
    const eventTime = new Date(createdAt).getTime();
    const now = Date.now();
    const maxAgeMs = parseInt(process.env.N8N_WEBHOOK_MAX_AGE_SECONDS || '300') * 1000;

    if (isNaN(eventTime) || Math.abs(now - eventTime) > maxAgeMs) {
        throw new Error(
            `SECURITY: Payload fuera de ventana temporal. ` +
            `Event: ${createdAt}, Delta: ${Math.round((now - eventTime)/1000)}s, Max: ${maxAgeMs/1000}s`
        );
    }
}

// 3. LOG ESTRUCTURADO DE ACCESO LEGÍTIMO
const logEntry = {
    ts: new Date().toISOString(),
    event: 'WEBHOOK_ACCEPTED',
    conversation_id: payload.conversation?.id,
    inbox_id: payload.inbox?.id,
    account_id: payload.account?.id,
    message_type: payload.message_type,
};
console.log(JSON.stringify(logEntry));

// Pasar datos al siguiente nodo
return [$input.item];
"""

# ============================================================
# NODO 2: Resolver Clinica (hardened — sin DEFAULT_CLINIC)
# ============================================================

RESOLVER_CODE_HARDENED = r"""
// ====================================================
// RESOLVER CLINICA — Hardened v1
// - Lee credenciales desde process.env
// - Sin DEFAULT_CLINIC fallback
// - Rechaza inbox no registrado con error explícito
// - Valida account_id para doble aislamiento
// ====================================================

const SUPABASE_URL = process.env.N8N_SUPABASE_URL;
const SERVICE_KEY  = process.env.N8N_SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('CONFIG_ERROR: N8N_SUPABASE_URL o N8N_SUPABASE_SERVICE_KEY no configuradas');
}

const inboxId   = $json.inbox_id;
const accountId = $json.account_id;

// inbox_id es requerido — si no existe, el payload es inválido
if (!inboxId) {
    throw new Error('VALIDATION_ERROR: inbox_id ausente en payload de Chatwoot');
}

let results;
try {
    results = await this.helpers.httpRequest({
        method: 'POST',
        url: SUPABASE_URL + '/rest/v1/rpc/resolve_clinic',
        headers: {
            'apikey':        SERVICE_KEY,
            'Authorization': 'Bearer ' + SERVICE_KEY,
            'Content-Type':  'application/json'
        },
        body: {
            p_inbox_id:   inboxId,
            p_account_id: accountId
        },
        json: true
    });
} catch(e) {
    // Error de red/DB — loggear y fallar (no silenciar)
    console.error(JSON.stringify({
        ts: new Date().toISOString(),
        event: 'RESOLVE_CLINIC_ERROR',
        inbox_id: inboxId,
        error: e.message
    }));
    throw new Error('INFRA_ERROR: No se pudo consultar resolve_clinic: ' + e.message);
}

// results es un array. Si está vacío = inbox no registrado.
const clinicData = Array.isArray(results) ? results[0] : results;

if (!clinicData || !clinicData.clinic_id) {
    // El inbox llegó pero no está registrado. La función resolve_clinic
    // ya lo registró en unknown_inbox_log. Ahora notificamos y rechazamos.
    const alertUrl = process.env.N8N_ALERT_WEBHOOK_URL;
    if (alertUrl) {
        await this.helpers.httpRequest({
            method: 'POST',
            url: alertUrl,
            body: {
                alert: 'UNKNOWN_INBOX',
                severity: 'HIGH',
                inbox_id: inboxId,
                account_id: accountId,
                ts: new Date().toISOString(),
                message: `Inbox ${inboxId} no registrado en SofIA. Configurar clínica o bloquear.`
            },
            json: true
        }).catch(() => {}); // No fallar si la alerta falla
    }

    console.error(JSON.stringify({
        ts: new Date().toISOString(),
        event: 'UNKNOWN_INBOX_REJECTED',
        inbox_id: inboxId,
        account_id: accountId
    }));

    // Retornar array vacío DETIENE el workflow (n8n: no hay items para procesar)
    return [];
}

// Clínica encontrada — log de audit
console.log(JSON.stringify({
    ts: new Date().toISOString(),
    event: 'CLINIC_RESOLVED',
    clinic_id: clinicData.clinic_id,
    inbox_id: inboxId
}));

// Pasar datos resoltos al siguiente nodo
const input = $input.item.json;
return [{ json: Object.assign({}, input, { _clinic_response: clinicData }) }];
"""

# ============================================================
# NODO 3: Merge Clinic Data (hardened — sin DEFAULT_CLINIC)
# ============================================================

MERGE_CODE_HARDENED = r"""
// ====================================================
// MERGE CLINIC DATA — Hardened v1
// - Sin DEFAULT_CLINIC fallback
// - Si _clinic_response ausente = error de lógica interna
// ====================================================

const clinicData = $json._clinic_response;

// En la versión hardened, Resolver Clinica ya rechazó si no había clínica.
// Si llegamos aquí sin clinicData es un bug interno — fallar explícitamente.
if (!clinicData || !clinicData.clinic_id) {
    throw new Error('INTERNAL_ERROR: clinic_data ausente en Merge. Resolver Clinica debió rechazar antes.');
}

const data = Object.assign({}, $json);
delete data._clinic_response;

data.clinic_id   = clinicData.clinic_id;
data.clinic_name = clinicData.clinic_name || 'Clínica';
data.calendar_id = clinicData.calendar_id;
data.timezone    = clinicData.timezone || 'America/Lima';
data.bot_config  = clinicData.bot_config || {};

// VALIDACIÓN CRUZADA: confirmar que el inbox_id corresponde a esta clínica
// (el resolve_clinic ya lo hizo, pero documentamos el contrato)
data._inbox_validated = true;

return [{ json: data }];
"""

# ============================================================
# NODO 4: Bot Pause Check (fail-closed + logging + cross-validation)
# ============================================================

BOT_PAUSE_CODE_HARDENED = r"""
// ====================================================
// BOT PAUSE CHECK — Hardened v1
// - Credenciales desde process.env
// - FAIL-CLOSED: error = workflow se detiene
// - Validación cruzada inbox_id <-> clinic_id
// - Log estructurado de cada decisión
// - Sin DEFAULT_CLINIC
// ====================================================

const SUPABASE_URL = process.env.N8N_SUPABASE_URL;
const SERVICE_KEY  = process.env.N8N_SUPABASE_SERVICE_KEY;
const ALERT_URL    = process.env.N8N_ALERT_WEBHOOK_URL;

if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('CONFIG_ERROR: Variables de entorno Supabase no configuradas');
}

// clinic_id viene de Resolver Clinica (ya validado)
const clinicId       = $json.clinic_id;
const conversationId = String($json.conversation_id || '');
const inboxId        = $json.inbox_id;
const patientName    = ($json.sender_name || 'Paciente').substring(0, 100);
const messageText    = ($json.message_text || '').substring(0, 500);

// Verificar que tenemos clinic_id válido (Merge debió garantizarlo)
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!clinicId || !uuidRegex.test(clinicId)) {
    throw new Error(`SECURITY_ERROR: clinic_id inválido en Bot Pause Check: "${clinicId}"`);
}

// VALIDACIÓN CRUZADA inbox_id <-> clinic_id en DB
// Previene manipulación de clinic_id en el payload
if (inboxId) {
    let crossValidResult;
    try {
        crossValidResult = await this.helpers.httpRequest({
            method: 'POST',
            url: SUPABASE_URL + '/rest/v1/rpc/validate_inbox_clinic',
            headers: {
                'apikey':        SERVICE_KEY,
                'Authorization': 'Bearer ' + SERVICE_KEY,
                'Content-Type':  'application/json'
            },
            body: {
                p_inbox_id:  inboxId,
                p_clinic_id: clinicId
            },
            json: true
        });
    } catch(e) {
        // Error de validación cruzada = FAIL CLOSED
        if (ALERT_URL) {
            await this.helpers.httpRequest({
                method: 'POST', url: ALERT_URL,
                body: { alert: 'CROSS_VALIDATION_FAILED', clinic_id: clinicId, inbox_id: inboxId, error: e.message, ts: new Date().toISOString() },
                json: true
            }).catch(() => {});
        }
        throw new Error('SECURITY_ERROR: Validación cruzada inbox↔clinic falló: ' + e.message);
    }

    // crossValidResult = true/false
    if (crossValidResult !== true) {
        console.error(JSON.stringify({
            ts: new Date().toISOString(),
            event: 'CROSS_VALIDATION_MISMATCH',
            inbox_id: inboxId,
            clinic_id_claimed: clinicId
        }));
        if (ALERT_URL) {
            await this.helpers.httpRequest({
                method: 'POST', url: ALERT_URL,
                body: { alert: 'TENANT_ISOLATION_VIOLATION', severity: 'CRITICAL', clinic_id: clinicId, inbox_id: inboxId, ts: new Date().toISOString() },
                json: true
            }).catch(() => {});
        }
        throw new Error(`SECURITY_ERROR: inbox ${inboxId} no pertenece a clinic ${clinicId}. Posible manipulación.`);
    }
}

// GOVERNANCE CHECK — FAIL CLOSED
let result;
try {
    result = await this.helpers.httpRequest({
        method: 'POST',
        url: SUPABASE_URL + '/rest/v1/rpc/upsert_conversation',
        headers: {
            'apikey':        SERVICE_KEY,
            'Authorization': 'Bearer ' + SERVICE_KEY,
            'Content-Type':  'application/json'
        },
        body: {
            p_clinic_id:                clinicId,
            p_chatwoot_conversation_id: conversationId,
            p_patient_name:             patientName,
            p_last_message:             messageText
        },
        json: true
    });
} catch(e) {
    // FAIL CLOSED: no silenciar, no continuar, alertar
    console.error(JSON.stringify({
        ts: new Date().toISOString(),
        event: 'GOVERNANCE_CHECK_FAILED',
        clinic_id: clinicId,
        conversation_id: conversationId,
        error: e.message
    }));

    if (ALERT_URL) {
        await this.helpers.httpRequest({
            method: 'POST', url: ALERT_URL,
            body: {
                alert: 'BOT_PAUSE_CHECK_DOWN',
                severity: 'HIGH',
                message: 'Governance no disponible — bot detenido por seguridad',
                clinic_id: clinicId,
                conversation_id: conversationId,
                error: e.message,
                ts: new Date().toISOString()
            },
            json: true
        }).catch(() => {});
    }

    // FAIL CLOSED: lanzar error en vez de return []
    // Esto hace que n8n marque la ejecución como fallida y genere alerta nativa
    throw new Error('GOVERNANCE_UNAVAILABLE: ' + e.message);
}

const conversation = Array.isArray(result) ? result[0] : result;

if (conversation && conversation.bot_paused === true) {
    // Bot explícitamente pausado — log y detener
    console.log(JSON.stringify({
        ts: new Date().toISOString(),
        event: 'BOT_PAUSED_GATE_HIT',
        clinic_id: clinicId,
        conversation_id: conversationId,
        governance_id: conversation.conversation_id
    }));
    // return [] detiene el workflow limpiamente (no es un error)
    return [];
}

// Bot activo — continuar con datos de governance
console.log(JSON.stringify({
    ts: new Date().toISOString(),
    event: 'BOT_ACTIVE_PROCEED',
    clinic_id: clinicId,
    conversation_id: conversationId
}));

return [{ json: {
    ...$json,
    governance_conversation_id: conversation?.conversation_id ?? null,
    governance_status: conversation?.status ?? 'active',
    governance_checked: true
} }];
"""

# ============================================================
# NODO 5: Buscar Knowledge Base (hardened — env vars)
# ============================================================

BUSCAR_KB_CODE_HARDENED = r"""
// Buscar Knowledge Base — Hardened v1
const SUPABASE_URL = process.env.N8N_SUPABASE_URL;
const SERVICE_KEY  = process.env.N8N_SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('CONFIG_ERROR: Variables Supabase no configuradas');
}

const clinicId = $json.clinic_id;
const query    = ($json.message_text || '').substring(0, 200); // limit query length

if (!clinicId) {
    throw new Error('INTERNAL_ERROR: clinic_id ausente en Buscar KB');
}

let results = [];
try {
    results = await this.helpers.httpRequest({
        method: 'POST',
        url: SUPABASE_URL + '/rest/v1/rpc/search_knowledge_base',
        headers: {
            'apikey':        SERVICE_KEY,
            'Authorization': 'Bearer ' + SERVICE_KEY,
            'Content-Type':  'application/json'
        },
        body: { p_clinic_id: clinicId, p_query: query, p_limit: 5 },
        json: true
    });
} catch(e) {
    // KB failure no es crítico — continuar sin contexto KB
    console.warn(JSON.stringify({ ts: new Date().toISOString(), event: 'KB_SEARCH_FAILED', error: e.message }));
    results = [];
}

return [{ json: Object.assign({}, $json, { kb_results: results, kb_status: results.length > 0 ? 'ok' : 'empty' }) }];
"""

# ============================================================
# NODO 6: Guardar Cita Supabase (hardened — env vars, sin DEFAULT_CLINIC)
# ============================================================

GUARDAR_CITA_CODE_HARDENED = r"""
// Guardar Cita Supabase — Hardened v1
const SUPABASE_URL = process.env.N8N_SUPABASE_URL;
const SERVICE_KEY  = process.env.N8N_SUPABASE_SERVICE_KEY;

const clinicId = $json.clinic_id;

// Sin DEFAULT_CLINIC: si no hay clinic_id real, fallar
if (!clinicId || !/^[0-9a-f]{8}-/.test(clinicId)) {
    throw new Error('INTERNAL_ERROR: clinic_id inválido en Guardar Cita: ' + clinicId);
}

const body = {
    clinic_id:        clinicId,
    conversation_id:  $json.conversation_id || 0,
    patient_name:     ($json.sender_name || 'Paciente').substring(0, 100),
    phone:            ($json.contact_phone || '').substring(0, 30),
    service:          'Consulta dental',
    start_time:       $json.start || new Date().toISOString(),
    end_time:         $json.end   || new Date(Date.now() + 3600000).toISOString(),
    calendar_event_id: ($json.id  || 'unknown').substring(0, 100),
    status:           'scheduled'
};

try {
    await this.helpers.httpRequest({
        method: 'POST',
        url: SUPABASE_URL + '/rest/v1/appointments',
        headers: {
            'apikey':        SERVICE_KEY,
            'Authorization': 'Bearer ' + SERVICE_KEY,
            'Content-Type':  'application/json',
            'Prefer':        'return=representation'
        },
        body: body,
        json: true
    });
    return [{ json: Object.assign({}, $json, { appointment_saved: true }) }];
} catch(e) {
    console.error(JSON.stringify({
        ts: new Date().toISOString(),
        event: 'APPOINTMENT_SAVE_FAILED',
        clinic_id: clinicId,
        error: e.message
    }));
    return [{ json: Object.assign({}, $json, { appointment_saved: false, appointment_error: e.message }) }];
}
"""

# ============================================================
# NODO 7: Registrar Metrica (hardened — env vars)
# ============================================================

METRICA_CODE_HARDENED = r"""
// Registrar Metrica — Hardened v1
const SUPABASE_URL = process.env.N8N_SUPABASE_URL;
const SERVICE_KEY  = process.env.N8N_SUPABASE_SERVICE_KEY;

const clinicId = $json.clinic_id;

// Métricas son best-effort pero deben tener clinic_id real
if (!clinicId || !/^[0-9a-f]{8}-/.test(clinicId)) {
    console.warn(JSON.stringify({
        ts: new Date().toISOString(),
        event: 'METRIC_SKIPPED',
        reason: 'clinic_id inválido',
        clinic_id: clinicId
    }));
    return [{ json: $json }];
}

try {
    await this.helpers.httpRequest({
        method: 'POST',
        url: SUPABASE_URL + '/rest/v1/rpc/upsert_conversation_metric',
        headers: {
            'apikey':        SERVICE_KEY,
            'Authorization': 'Bearer ' + SERVICE_KEY,
            'Content-Type':  'application/json'
        },
        body: {
            p_clinic_id:       clinicId,
            p_conversation_id: $json.conversation_id || 0,
            p_intent:          ($json.intent || 'UNKNOWN').substring(0, 20),
            p_escalated:       $json.should_escalate || false,
            p_booked:          $json.booked || false,
            p_phase_reached:   $json.phase_reached || 1
        },
        json: true
    });
} catch(e) {
    // Métricas son best-effort — no bloquear flujo de conversación
    console.warn(JSON.stringify({
        ts: new Date().toISOString(),
        event: 'METRIC_SAVE_FAILED',
        error: e.message
    }));
}

return [{ json: $json }];
"""

# ============================================================
# MAP: nodo nombre → código hardened
# ============================================================

NODE_HARDENED_CODE = {
    'Verificar Webhook Token': WEBHOOK_SECURITY_CODE,  # Nodo NUEVO
    'Resolver Clinica':        RESOLVER_CODE_HARDENED,
    'Merge Clinic Data':       MERGE_CODE_HARDENED,
    'Bot Pause Check':         BOT_PAUSE_CODE_HARDENED,
    'Buscar Knowledge Base':   BUSCAR_KB_CODE_HARDENED,
    'Guardar Cita Supabase':   GUARDAR_CITA_CODE_HARDENED,
    'Registrar Metrica':       METRICA_CODE_HARDENED,
}

# ============================================================
# DEPLOY
# ============================================================

print("=" * 70)
print("SofIA Hardening Layer 1 — Deploy")
print("=" * 70)

# 1. Descargar workflow actual
print("\n1. Descargando workflow...")
r = requests.get(f"{N8N_BASE_URL}/api/v1/workflows/{WORKFLOW_ID}", headers=HEADERS_N8N)
if r.status_code != 200:
    print(f"[ERROR] No se pudo descargar workflow: {r.status_code} {r.text[:200]}")
    sys.exit(1)
wf = r.json()
print(f"   {wf['name']}: {len(wf['nodes'])} nodos")

# 2. Backup
backup_file = "workflow_backup_pre_hardening.json"
with open(backup_file, 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)
print(f"   Backup: {backup_file}")

# 3. Verificar si existe nodo "Verificar Webhook Token"
has_security_node = any(n['name'] == 'Verificar Webhook Token' for n in wf['nodes'])
if not has_security_node:
    # Encontrar posición del webhook trigger para colocar el nodo de seguridad justo después
    webhook_node = next((n for n in wf['nodes'] if 'webhook' in n.get('type', '').lower()), None)
    pos_x = (webhook_node['position'][0] + 200) if webhook_node else 250
    pos_y = (webhook_node['position'][1]) if webhook_node else 376

    new_security_node = {
        "parameters": {"jsCode": WEBHOOK_SECURITY_CODE},
        "name": "Verificar Webhook Token",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [pos_x, pos_y]
    }
    wf['nodes'].append(new_security_node)
    print(f"\n2. Nodo 'Verificar Webhook Token' AGREGADO en [{pos_x}, {pos_y}]")

    # Reinsertar en el flujo: Webhook -> Verificar Token -> Validar Input
    conns = wf['connections']
    # Buscar qué conecta el webhook
    webhook_name = webhook_node['name'] if webhook_node else 'Chatwoot Webhook'
    webhook_conns = conns.get(webhook_name, {}).get('main', [[]])
    if webhook_conns and webhook_conns[0]:
        next_after_webhook = webhook_conns[0][0]['node']
        conns[webhook_name] = {'main': [[{'node': 'Verificar Webhook Token', 'type': 'main', 'index': 0}]]}
        conns['Verificar Webhook Token'] = {'main': [[{'node': next_after_webhook, 'type': 'main', 'index': 0}]]}
        print(f"   Flujo: {webhook_name} → Verificar Webhook Token → {next_after_webhook}")
else:
    print("\n2. 'Verificar Webhook Token' ya existe — actualizando código")

# 4. Actualizar nodos existentes con código hardened
print("\n3. Actualizando nodos con código hardened...")
updated = 0
for i, node in enumerate(wf['nodes']):
    if node['name'] in NODE_HARDENED_CODE and node['name'] != 'Verificar Webhook Token':
        old_code = node.get('parameters', {}).get('jsCode', '')
        # Detectar si ya tiene hardened code (evitar dobles deploys innecesarios)
        if 'process.env.N8N_SUPABASE_URL' in old_code:
            print(f"   [SKIP] {node['name']} — ya está hardened")
        else:
            wf['nodes'][i]['parameters']['jsCode'] = NODE_HARDENED_CODE[node['name']]
            print(f"   [OK] {node['name']} — hardened")
            updated += 1
    elif node['name'] == 'Verificar Webhook Token':
        wf['nodes'][i]['parameters']['jsCode'] = NODE_HARDENED_CODE['Verificar Webhook Token']
        print(f"   [OK] Verificar Webhook Token — hardened")
        updated += 1

print(f"\n   Nodos actualizados: {updated}")

# 5. Upload
print("\n4. Subiendo workflow hardened...")
wf_update = {
    'name': wf['name'],
    'nodes': wf['nodes'],
    'connections': wf['connections'],
    'settings': wf.get('settings', {}),
    'staticData': wf.get('staticData')
}

r = requests.put(
    f"{N8N_BASE_URL}/api/v1/workflows/{WORKFLOW_ID}",
    headers=HEADERS_N8N,
    json=wf_update
)

if r.status_code == 200:
    result = r.json()
    # Guardar workflow desplegado (sin secrets ya que el código referencia env vars)
    with open("workflow_hardened_deployed.json", 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(f"   [OK] Workflow subido: {len(result['nodes'])} nodos")
    print(f"   Guardado: workflow_hardened_deployed.json")
else:
    print(f"   [ERROR] {r.status_code}: {r.text[:300]}")
    sys.exit(1)

print(f"\n{'='*70}")
print("HARDENING LAYER 1 — DEPLOY COMPLETO")
print(f"{'='*70}")
print(f"""
Cambios aplicados:
  ✅ Verificar Webhook Token (nuevo nodo)
  ✅ Resolver Clinica sin DEFAULT_CLINIC
  ✅ Merge Clinic Data sin fallback
  ✅ Bot Pause Check fail-closed
  ✅ Buscar Knowledge Base con env vars
  ✅ Guardar Cita con env vars
  ✅ Registrar Metrica con env vars

PENDIENTE (manual):
  ⚠️  Configurar N8N_SUPABASE_URL en servidor n8n
  ⚠️  Configurar N8N_SUPABASE_SERVICE_KEY en servidor n8n
  ⚠️  Configurar N8N_CHATWOOT_WEBHOOK_TOKEN en servidor n8n
  ⚠️  Configurar N8N_ALERT_WEBHOOK_URL en servidor n8n
  ⚠️  Reiniciar proceso n8n para que tome las env vars
  ⚠️  Configurar Nginx rate limiting (ver HARDENING_SETUP.md)
  ⚠️  Rotar todas las credenciales expuestas en git
""")
