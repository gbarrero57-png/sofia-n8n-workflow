/**
 * create_appt_notify_workflow.mjs
 * Crea el workflow "SofIA - Appt Notify" en n8n.
 *
 * Recibe: { appointment_id, clinic_id, patient_name, patient_phone,
 *           start_time, service, doctor_name, source }
 * Hace:
 *   1. Fetch clinic → admin_notify_phone + bot_config SIDs
 *   2. Formatear variables del template T12
 *   3. Enviar T12 al admin via Twilio
 *   4. INSERT admin_notifications en Supabase
 *
 * Run: node scripts/ops/create_appt_notify_workflow.mjs
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const N8N_URL = process.env.N8N_API_URL || 'https://workflows.n8n.redsolucionesti.com';
const API_KEY = (() => {
  try { return readFileSync(join(__dirname, '../../n8n-mcp/.env'), 'utf8').match(/N8N_API_KEY=(.+)/)?.[1]?.trim(); }
  catch { return ''; }
})();

const SUPABASE_KEY = (() => {
  try { return readFileSync(join(__dirname, '../../saas/.env'), 'utf8').match(/SUPABASE_SERVICE_KEY=(.+)/)?.[1]?.trim(); }
  catch { return ''; }
})();

async function createWorkflow(payload) {
  const r = await fetch(`${N8N_URL}/api/v1/workflows`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(`POST ${r.status}: ${await r.text()}`);
  return r.json();
}

async function activateWorkflow(id) {
  const r = await fetch(`${N8N_URL}/api/v1/workflows/${id}/activate`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': API_KEY }
  });
  return r.ok;
}

// ── Workflow definition ───────────────────────────────────────────────────────

const workflow = {
  name: 'SofIA - Appt Notify',
  nodes: [

    // ── 0. Webhook ────────────────────────────────────────────────────────────
    {
      id: 'webhook-appt-notify',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 1,
      position: [240, 300],
      parameters: {
        path: 'appt-notify',
        httpMethod: 'POST',
        responseMode: 'responseNode',
        options: {}
      }
    },

    // ── 1. Respond immediately ────────────────────────────────────────────────
    {
      id: 'respond-ok',
      name: 'Respond OK',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1,
      position: [440, 200],
      parameters: {
        respondWith: 'json',
        responseBody: '={ "ok": true }'
      }
    },

    // ── 2. Fetch clinic data ──────────────────────────────────────────────────
    {
      id: 'fetch-clinic',
      name: 'Fetch Clinic',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4,
      position: [440, 400],
      parameters: {
        method: 'GET',
        url: '=https://inhyrrjidhzrbqecnptn.supabase.co/rest/v1/clinics?select=id,name,admin_notify_phone,bot_config&id=eq.{{ $json.body.clinic_id }}',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'apikey',         value: SUPABASE_KEY },
            { name: 'Authorization',  value: `Bearer ${SUPABASE_KEY}` }
          ]
        },
        options: {}
      }
    },

    // ── 3. Build & Send T12 to admin ──────────────────────────────────────────
    {
      id: 'send-t12-admin',
      name: 'Send T12 Admin',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [640, 400],
      parameters: {
        jsCode: `
const webhookBody = $node["Webhook"].json.body;
const clinicArr   = $input.first().json;
// clinicArr is the raw array from Supabase
const clinic  = Array.isArray(clinicArr) ? clinicArr[0] : clinicArr;
const botConfig = clinic.bot_config || {};

const adminPhone = clinic.admin_notify_phone;
if (!adminPhone) {
  return [{ json: { skipped: true, reason: 'no admin_notify_phone' } }];
}

const startTime = new Date(webhookBody.start_time);
const dateStr = startTime.toLocaleDateString('es-PE', {
  weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima'
});
const timeStr = startTime.toLocaleTimeString('es-PE', {
  hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima'
});
const refId = (webhookBody.appointment_id || '').slice(0, 8);

const contentVars = {
  "1": webhookBody.patient_name || 'Paciente',
  "2": webhookBody.patient_phone || 'N/A',
  "3": dateStr,
  "4": timeStr,
  "5": webhookBody.service || 'Consulta',
  "6": webhookBody.doctor_name || 'Sin asignar',
  "7": webhookBody.source === 'manual' ? 'Cita manual (admin)' : 'Vía bot WhatsApp',
  "8": refId
};

return [{
  json: {
    to:            'whatsapp:' + adminPhone,
    from:          botConfig.twilio_from || 'whatsapp:+51977588512',
    content_sid:   botConfig.twilio_admin_new_appt_sid,
    content_vars:  JSON.stringify(contentVars),
    account_sid:   botConfig.twilio_account_sid || 'AC4080780a4b4a7d8e7b107a39f01abad3',
    // Pass through for next node
    appointment_id: webhookBody.appointment_id,
    clinic_id:      webhookBody.clinic_id,
    admin_phone:    adminPhone,
    patient_phone:  webhookBody.patient_phone,
    source:         webhookBody.source || 'bot'
  }
}];
`
      }
    },

    // ── 4. Twilio HTTP ────────────────────────────────────────────────────────
    {
      id: 'twilio-send',
      name: 'Twilio Send',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4,
      position: [840, 400],
      parameters: {
        method: 'POST',
        url: `=https://api.twilio.com/2010-04-01/Accounts/{{ $json.account_sid }}/Messages.json`,
        authentication: 'genericCredentialType',
        genericAuthType: 'httpBasicAuth',
        sendBody: true,
        contentType: 'form-urlencoded',
        bodyParameters: {
          parameters: [
            { name: 'To',               value: '={{ $json.to }}' },
            { name: 'From',             value: '={{ $json.from }}' },
            { name: 'ContentSid',       value: '={{ $json.content_sid }}' },
            { name: 'ContentVariables', value: '={{ $json.content_vars }}' }
          ]
        },
        options: {}
      },
      credentials: {
        httpBasicAuth: { id: '9LrTFjDd3dnEZJA7', name: 'Twilio API' }
      }
    },

    // ── 5. Insert admin_notifications ─────────────────────────────────────────
    {
      id: 'insert-notification',
      name: 'Insert Notification',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4,
      position: [1040, 400],
      parameters: {
        method: 'POST',
        url: 'https://inhyrrjidhzrbqecnptn.supabase.co/rest/v1/admin_notifications',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={
  "appointment_id":    "{{ $node["Send T12 Admin"].json.appointment_id }}",
  "clinic_id":         "{{ $node["Send T12 Admin"].json.clinic_id }}",
  "admin_phone":       "{{ $node["Send T12 Admin"].json.admin_phone }}",
  "patient_phone":     "{{ $node["Send T12 Admin"].json.patient_phone }}",
  "source":            "{{ $node["Send T12 Admin"].json.source }}",
  "twilio_message_sid":"{{ $json.sid }}"
}`,
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'apikey',        value: SUPABASE_KEY },
            { name: 'Authorization', value: `Bearer ${SUPABASE_KEY}` },
            { name: 'Prefer',        value: 'return=minimal' }
          ]
        },
        options: {}
      }
    }
  ],

  connections: {
    'Webhook': {
      main: [[
        { node: 'Respond OK',  type: 'main', index: 0 },
        { node: 'Fetch Clinic', type: 'main', index: 0 }
      ]]
    },
    'Fetch Clinic':    { main: [[{ node: 'Send T12 Admin',    type: 'main', index: 0 }]] },
    'Send T12 Admin':  { main: [[{ node: 'Twilio Send',        type: 'main', index: 0 }]] },
    'Twilio Send':     { main: [[{ node: 'Insert Notification', type: 'main', index: 0 }]] }
  },

  settings: { executionOrder: 'v1' },
  staticData: null
};

// ── Create & activate ─────────────────────────────────────────────────────────

console.log('\n=== Creando workflow SofIA - Appt Notify ===\n');

const wf = await createWorkflow(workflow);
console.log('✅ Workflow creado:', wf.id, '-', wf.name);

const activated = await activateWorkflow(wf.id);
console.log(activated ? '✅ Activado' : '⚠️  No se pudo activar (activar manualmente en n8n)');

console.log('\nWebhook URL:');
console.log(`  https://workflows.n8n.redsolucionesti.com/webhook/appt-notify`);
console.log('\nID para guardar en n8n-mcp/.env o scripts:');
console.log(`  APPT_NOTIFY_WF_ID=${wf.id}`);
console.log('');
