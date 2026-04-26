/**
 * patch_admin_reply_handler.mjs
 *
 * Patches SofIA workflow (37SLdWISQLgkHeXk) to handle admin WhatsApp replies.
 *
 * When admin presses ✅ Confirmar or ❌ Cancelar on the T12 notification:
 *   Bot Pause Check → detects admin_phone match → sets is_admin_reply=true + action
 *   IsUserMessage  → admin reply passes through (new branch)
 *   Admin Reply Handler (new Code node) → resolves notification + sends T13/T14
 *
 * Changes:
 *   1. Bot Pause Check: detect if contact_phone matches any clinic's admin_notify_phone
 *   2. Add node "Admin Reply Handler" (Code)
 *   3. Add node "Twilio Patient Notify" (HTTP) — sends T13 or T14 to patient
 *   4. Wire new branch: IsUserMessage → ¿Es Admin Reply? → Admin Reply Handler → Twilio Patient Notify
 *
 * Run: node scripts/patch_admin_reply_handler.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const N8N_URL = process.env.N8N_API_URL || 'https://workflows.n8n.redsolucionesti.com';
const API_KEY = (() => {
  try { return readFileSync(join(__dirname, '../n8n-mcp/.env'), 'utf8').match(/N8N_API_KEY=(.+)/)?.[1]?.trim(); }
  catch { return ''; }
})();
const SUPABASE_KEY = (() => {
  try { return readFileSync(join(__dirname, '../saas/.env'), 'utf8').match(/SUPABASE_SERVICE_KEY=(.+)/)?.[1]?.trim(); }
  catch { return ''; }
})();

const WF_ID = '37SLdWISQLgkHeXk';

async function getWf() {
  const r = await fetch(`${N8N_URL}/api/v1/workflows/${WF_ID}`, {
    headers: { 'X-N8N-API-KEY': API_KEY }
  });
  if (!r.ok) throw new Error(`GET ${r.status}: ${await r.text()}`);
  return r.json();
}

async function putWf(wf) {
  const r = await fetch(`${N8N_URL}/api/v1/workflows/${WF_ID}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings, staticData: wf.staticData })
  });
  if (!r.ok) throw new Error(`PUT ${r.status}: ${await r.text()}`);
  return r.json();
}

// ── Patch 1: Bot Pause Check — detectar admin_phone ──────────────────────────

const BPC_ADMIN_ANCHOR = `return [{ json: {
    ...$json,
    governance_conversation_id: conversation?.conversation_id ?? null,
    governance_status:          conversation?.status ?? 'active',
    governance_checked:         true,
    _start_ts:                  START_TS,
    patient_ctx:                patientCtx
} }];`;

const BPC_ADMIN_NEW = `// 5. ADMIN REPLY DETECTION — check if sender is the clinic admin
// If admin pressed Confirmar/Cancelar on T12 notification, handle separately
let isAdminReply = false;
let adminAction  = null;
const rawPhone = patientPhone || '';

// Fetch clinic's admin_notify_phone to compare
try {
  const adminCheck = await supabaseRpc('get_clinic_admin_phone', {
    p_clinic_id: clinicId
  }, { attempts: 1 });
  const adminPhone = Array.isArray(adminCheck) ? adminCheck[0]?.admin_notify_phone : adminCheck?.admin_notify_phone;
  if (adminPhone) {
    const normalizedRaw   = rawPhone.replace(/^whatsapp:/, '').replace(/^\\+/, '');
    const normalizedAdmin = adminPhone.replace(/^\\+/, '');
    if (normalizedRaw === normalizedAdmin) {
      isAdminReply = true;
      const msgLower = ($json.message_text || '').toLowerCase().trim();
      if (msgLower.includes('confirmar') || msgLower === 'admin_confirm') adminAction = 'confirmed';
      if (msgLower.includes('cancelar')  || msgLower === 'admin_cancel')  adminAction = 'cancelled';
    }
  }
} catch(e) {
  console.warn(JSON.stringify({ ts: new Date().toISOString(), event: 'ADMIN_CHECK_WARN', error: e.message }));
}

return [{ json: {
    ...$json,
    governance_conversation_id: conversation?.conversation_id ?? null,
    governance_status:          conversation?.status ?? 'active',
    governance_checked:         true,
    _start_ts:                  START_TS,
    patient_ctx:                patientCtx,
    is_admin_reply:             isAdminReply,
    admin_action:               adminAction
} }];`;

// ── New node: ¿Es Admin Reply? (IF) ──────────────────────────────────────────

const IS_ADMIN_REPLY_NODE = {
  id: 'is-admin-reply',
  name: '¿Es Admin Reply?',
  type: 'n8n-nodes-base.if',
  typeVersion: 2,
  position: [1200, 500],  // After IsUserMessage
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{
        id: 'admin-reply-cond',
        leftValue: '={{ $json.is_admin_reply }}',
        rightValue: true,
        operator: { type: 'boolean', operation: 'equals' }
      }],
      combinator: 'and'
    }
  }
};

// ── New node: Admin Reply Handler (Code) ─────────────────────────────────────

const ADMIN_REPLY_HANDLER_NODE = {
  id: 'admin-reply-handler',
  name: 'Admin Reply Handler',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [1400, 500],
  parameters: {
    jsCode: `
const ctx        = $input.first().json;
const clinicId   = ctx.clinic_id || ctx.resolved_clinic_id;
const adminPhone = ctx.contact_phone || '';
const action     = ctx.admin_action; // 'confirmed' | 'cancelled' | null
const botConfig  = ctx.bot_config || {};

if (!action) {
  // Admin wrote something unrecognized — send hint
  const hint = '❓ No entendí. Responde con el botón *✅ Confirmar* o *❌ Cancelar* del mensaje de la cita.';
  await supabaseRpc('send_chatwoot_message', {
    p_conversation_id: ctx.governance_conversation_id,
    p_message: hint,
    p_private: false
  }, { attempts: 1 }).catch(() => {});
  return [{ json: { ...ctx, admin_handled: true, action: 'unknown' } }];
}

// Get pending notification
let notification = null;
try {
  const result = await supabaseRpc('get_pending_admin_notification', {
    p_admin_phone: adminPhone
  }, { attempts: 2 });
  notification = Array.isArray(result) ? result[0] : result;
} catch(e) {
  console.error(JSON.stringify({ event: 'ADMIN_REPLY_GET_NOTIF_ERR', error: e.message }));
}

if (!notification || !notification.notification_id) {
  const msg = '⚠️ No encontré ninguna cita pendiente de confirmación.';
  await supabaseRpc('send_chatwoot_message', {
    p_conversation_id: ctx.governance_conversation_id,
    p_message: msg,
    p_private: false
  }, { attempts: 1 }).catch(() => {});
  return [{ json: { ...ctx, admin_handled: true, action: 'no_pending' } }];
}

// Resolve notification (updates appointment status)
let resolveResult = null;
try {
  resolveResult = await supabaseRpc('resolve_admin_notification', {
    p_notification_id: notification.notification_id,
    p_action:          action
  }, { attempts: 2 });
} catch(e) {
  console.error(JSON.stringify({ event: 'ADMIN_REPLY_RESOLVE_ERR', error: e.message }));
}

// Build patient notification data
const startTime = new Date(notification.start_time);
const dateStr = startTime.toLocaleDateString('es-PE', {
  weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima'
});
const timeStr = startTime.toLocaleTimeString('es-PE', {
  hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima'
});
const firstName = (notification.patient_name || 'Paciente').split(' ')[0];
const clinicName = ctx.clinic_name || 'la clínica';

return [{ json: {
  ...ctx,
  admin_handled:          true,
  action,
  resolved_appointment_id: resolveResult?.appointment_id,
  patient_phone:           notification.patient_phone,
  // T13 vars (confirmed)
  t13_vars: JSON.stringify({ "1": firstName, "2": dateStr, "3": timeStr, "4": clinicName }),
  t13_sid:  botConfig.twilio_patient_confirmed_sid || '',
  // T14 vars (cancelled) - slots will be calculated next
  patient_name:  notification.patient_name,
  start_time_iso: notification.start_time,
  t14_sid:  botConfig.twilio_patient_cancelled_sid || '',
  // Admin ACK
  admin_ack: action === 'confirmed'
    ? '✅ Cita confirmada. El paciente fue notificado.'
    : '❌ Cita cancelada. El paciente recibirá nuevos horarios disponibles.',
  twilio_from:      botConfig.twilio_from || 'whatsapp:+51977588512',
  twilio_account_sid: botConfig.twilio_account_sid || 'AC4080780a4b4a7d8e7b107a39f01abad3'
} }];
`
  }
};

// ── New node: ¿Confirmar o Cancelar? (IF) ────────────────────────────────────

const IS_CONFIRM_NODE = {
  id: 'is-confirm',
  name: '¿Confirmar o Cancelar?',
  type: 'n8n-nodes-base.if',
  typeVersion: 2,
  position: [1600, 500],
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{
        id: 'confirm-cond',
        leftValue: '={{ $json.action }}',
        rightValue: 'confirmed',
        operator: { type: 'string', operation: 'equals', rightType: 'any' }
      }],
      combinator: 'and'
    }
  }
};

// ── New node: Send T13 to patient (confirmed) ────────────────────────────────

const SEND_T13_NODE = {
  id: 'send-t13-patient',
  name: 'Send T13 Patient Confirmed',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4,
  position: [1800, 380],
  parameters: {
    method: 'POST',
    url: '=https://api.twilio.com/2010-04-01/Accounts/{{ $json.twilio_account_sid }}/Messages.json',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpBasicAuth',
    sendBody: true,
    contentType: 'form-urlencoded',
    bodyParameters: {
      parameters: [
        { name: 'To',               value: '=whatsapp:{{ $json.patient_phone }}' },
        { name: 'From',             value: '={{ $json.twilio_from }}' },
        { name: 'ContentSid',       value: '={{ $json.t13_sid }}' },
        { name: 'ContentVariables', value: '={{ $json.t13_vars }}' }
      ]
    },
    options: {}
  },
  credentials: { httpBasicAuth: { id: '9LrTFjDd3dnEZJA7', name: 'Twilio API' } }
};

// ── New node: Calcular Slots para Reagendar (cancelled) ──────────────────────

const CALC_REBOOK_SLOTS_NODE = {
  id: 'calc-rebook-slots',
  name: 'Calc Rebook Slots',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [1800, 620],
  parameters: {
    jsCode: `
// Calcular 3 slots disponibles para reagendar al paciente
const ctx      = $input.first().json;
const clinicId = ctx.clinic_id || ctx.resolved_clinic_id;

// Buscar citas existentes para los próximos 7 días
const now     = new Date();
const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

let existingAppts = [];
try {
  existingAppts = await supabaseRpc('get_clinic_appointments_range', {
    p_clinic_id: clinicId,
    p_from: now.toISOString(),
    p_to:   weekOut.toISOString()
  }, { attempts: 1 });
  if (!Array.isArray(existingAppts)) existingAppts = [];
} catch(e) {}

// Generar slots: L-V 9am-6pm cada 30min, saltando ocupados
const bookedTimes = new Set(existingAppts.map(a => a.start_time));
const slots = [];
const cursor = new Date(now);
cursor.setMinutes(0, 0, 0);
if (cursor.getHours() >= 18) { cursor.setDate(cursor.getDate() + 1); cursor.setHours(9); }
else if (cursor.getHours() < 9) cursor.setHours(9);
else cursor.setHours(cursor.getHours() + 1);

while (slots.length < 3 && cursor < weekOut) {
  const dow = cursor.getDay(); // 0=Sun 6=Sat
  const h   = cursor.getHours();
  if (dow !== 0 && dow !== 6 && h >= 9 && h < 18) {
    const isoStr = cursor.toISOString();
    if (!bookedTimes.has(isoStr)) {
      const label = cursor.toLocaleString('es-PE', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima'
      });
      slots.push({ label, iso: isoStr });
    }
  }
  cursor.setMinutes(cursor.getMinutes() + 30);
  if (cursor.getHours() >= 18) {
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(9); cursor.setMinutes(0);
  }
}

// Fill missing slots with generic labels
while (slots.length < 3) slots.push({ label: 'Consultar horario', iso: null });

const firstName = (ctx.patient_name || 'Paciente').split(' ')[0];
const cancelledDate = new Date(ctx.start_time_iso).toLocaleDateString('es-PE', {
  weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima'
});

const t14Vars = JSON.stringify({
  "1": firstName,
  "2": cancelledDate,
  "3": slots[0].label,
  "4": slots[1].label,
  "5": slots[2].label
});

return [{ json: { ...ctx, t14_vars: t14Vars, rebook_slots: slots } }];
`
  }
};

// ── New node: Send T14 to patient (cancelled + rebook) ───────────────────────

const SEND_T14_NODE = {
  id: 'send-t14-patient',
  name: 'Send T14 Patient Cancelled',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4,
  position: [2000, 620],
  parameters: {
    method: 'POST',
    url: '=https://api.twilio.com/2010-04-01/Accounts/{{ $json.twilio_account_sid }}/Messages.json',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpBasicAuth',
    sendBody: true,
    contentType: 'form-urlencoded',
    bodyParameters: {
      parameters: [
        { name: 'To',               value: '=whatsapp:{{ $json.patient_phone }}' },
        { name: 'From',             value: '={{ $json.twilio_from }}' },
        { name: 'ContentSid',       value: '={{ $json.t14_sid }}' },
        { name: 'ContentVariables', value: '={{ $json.t14_vars }}' }
      ]
    },
    options: {}
  },
  credentials: { httpBasicAuth: { id: '9LrTFjDd3dnEZJA7', name: 'Twilio API' } }
};

// ── New node: ACK to admin ────────────────────────────────────────────────────

const ACK_ADMIN_NODE = {
  id: 'ack-admin',
  name: 'ACK Admin',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4,
  position: [2200, 500],
  parameters: {
    method: 'POST',
    url: '=https://api.twilio.com/2010-04-01/Accounts/{{ $json.twilio_account_sid }}/Messages.json',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpBasicAuth',
    sendBody: true,
    contentType: 'form-urlencoded',
    bodyParameters: {
      parameters: [
        { name: 'To',   value: '=whatsapp:{{ $json.contact_phone }}' },
        { name: 'From', value: '={{ $json.twilio_from }}' },
        { name: 'Body', value: '={{ $json.admin_ack }}' }
      ]
    },
    options: {}
  },
  credentials: { httpBasicAuth: { id: '9LrTFjDd3dnEZJA7', name: 'Twilio API' } }
};

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching workflow', WF_ID, '...');
  const wf = await getWf();

  // Backup
  const bkPath = join(__dirname, '../saas/sofia_before_admin_patch.json');
  writeFileSync(bkPath, JSON.stringify(wf, null, 2));
  console.log('Backup saved to', bkPath);

  // ── Patch 1: Bot Pause Check ─────────────────────────────────────────────
  const bpcIdx = wf.nodes.findIndex(n => n.name === 'Bot Pause Check');
  if (bpcIdx === -1) throw new Error('"Bot Pause Check" not found');

  const bpcCode = wf.nodes[bpcIdx].parameters.jsCode;
  if (bpcCode.includes('is_admin_reply')) {
    console.log('[SKIP] Bot Pause Check already has admin detection');
  } else if (bpcCode.includes(BPC_ADMIN_ANCHOR)) {
    wf.nodes[bpcIdx].parameters.jsCode = bpcCode.replace(BPC_ADMIN_ANCHOR, BPC_ADMIN_NEW);
    console.log('[OK]   Bot Pause Check patched with admin detection');
  } else {
    throw new Error('BPC_ADMIN_ANCHOR not found in Bot Pause Check. Run patch_patient_context.mjs first.');
  }

  // ── Patch 2: Add new nodes ───────────────────────────────────────────────
  const newNodes = [
    IS_ADMIN_REPLY_NODE,
    ADMIN_REPLY_HANDLER_NODE,
    IS_CONFIRM_NODE,
    SEND_T13_NODE,
    CALC_REBOOK_SLOTS_NODE,
    SEND_T14_NODE,
    ACK_ADMIN_NODE
  ];

  for (const node of newNodes) {
    if (wf.nodes.find(n => n.name === node.name)) {
      console.log(`[SKIP] Node "${node.name}" already exists`);
    } else {
      wf.nodes.push(node);
      console.log(`[OK]   Added node "${node.name}"`);
    }
  }

  // ── Patch 3: Wire connections ────────────────────────────────────────────
  // IsUserMessage → true branch → WhatsApp Safe Check (existing)
  //                             → ¿Es Admin Reply? (new, parallel)
  // Actually: ¿Es Admin Reply? branches BEFORE WhatsApp Safe Check
  // We wire: IsUserMessage true → ¿Es Admin Reply? → false → existing WhatsApp Safe Check
  //                                                 → true  → Admin Reply Handler → ...

  // Find IsUserMessage node connections
  if (!wf.connections['IsUserMessage']) {
    console.log('[WARN] IsUserMessage connections not found, check workflow manually');
  } else {
    // The existing true branch from IsUserMessage
    const existingTrue = wf.connections['IsUserMessage'].main[0] || [];

    // New: IsUserMessage true → ¿Es Admin Reply?
    wf.connections['IsUserMessage'].main[0] = [
      { node: '¿Es Admin Reply?', type: 'main', index: 0 }
    ];

    // ¿Es Admin Reply? false (0) → existing downstream (WhatsApp Safe Check etc.)
    wf.connections['¿Es Admin Reply?'] = {
      main: [
        existingTrue,  // false branch (0) = not admin, continue normal flow
        [{ node: 'Admin Reply Handler', type: 'main', index: 0 }]  // true branch (1) = admin
      ]
    };

    // Admin Reply Handler → ¿Confirmar o Cancelar?
    wf.connections['Admin Reply Handler'] = {
      main: [[{ node: '¿Confirmar o Cancelar?', type: 'main', index: 0 }]]
    };

    // ¿Confirmar o Cancelar? → T13 (true) | Calc Rebook Slots (false)
    wf.connections['¿Confirmar o Cancelar?'] = {
      main: [
        [{ node: 'Send T13 Patient Confirmed', type: 'main', index: 0 }],  // true = confirmed
        [{ node: 'Calc Rebook Slots',           type: 'main', index: 0 }]   // false = cancelled
      ]
    };

    // T13 → ACK Admin
    wf.connections['Send T13 Patient Confirmed'] = {
      main: [[{ node: 'ACK Admin', type: 'main', index: 0 }]]
    };

    // Calc Rebook Slots → T14
    wf.connections['Calc Rebook Slots'] = {
      main: [[{ node: 'Send T14 Patient Cancelled', type: 'main', index: 0 }]]
    };

    // T14 → ACK Admin
    wf.connections['Send T14 Patient Cancelled'] = {
      main: [[{ node: 'ACK Admin', type: 'main', index: 0 }]]
    };

    console.log('[OK]   Connections wired for admin reply branch');
  }

  // ── Push ─────────────────────────────────────────────────────────────────
  console.log('\nPushing patched workflow...');
  await putWf(wf);
  console.log('✅ Workflow patched successfully!');
  console.log('');
  console.log('⚠️  PENDIENTE: aplicar migración 037 en Supabase SQL Editor:');
  console.log('   https://supabase.com/dashboard/project/inhyrrjidhzrbqecnptn/sql/new');
  console.log('   Archivo: supabase/migrations/037_admin_notifications.sql');
  console.log('');
  console.log('⚠️  PENDIENTE: agregar función get_clinic_admin_phone en Supabase');
  console.log('   (incluida en la migración 037)');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
