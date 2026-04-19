/**
 * e2e_system.mjs — System-wide E2E health check
 * Covers all active workflows + integrations
 * Run: node scripts/tests/e2e_system.mjs
 *
 * Suites:
 *   A — Infrastructure (n8n, Supabase, Chatwoot, Twilio)
 *   B — Active workflow health (active flag + last execution)
 *   C — SofIA live (greeting, INFO, escalation)
 *   D — Supabase core functions (RPCs)
 *   E — Cron history (reminders, reports)
 *   F — Libreria webhooks (W1 cotizar)
 */

// ── Constants ─────────────────────────────────────────────────────────────────
const N8N_API_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const N8N_BASE      = 'https://workflows.n8n.redsolucionesti.com';
const CW_BASE       = 'https://chat.redsolucionesti.com';
const CW_TOKEN      = 'yypAwZDH2dV3crfbqJqWCgj1';
const CW_ACCOUNT    = 2;
const CW_INBOX      = 10;
const SB_URL        = 'https://inhyrrjidhzrbqecnptn.supabase.co';
const SB_KEY        = 'process.env.SUPABASE_SERVICE_KEY';
const DEMO_CLINIC   = 'c6c15fca-d7fc-4d98-83c1-2c5cb5a6bef1';
const SOFIA_WH      = N8N_BASE + '/webhook/chatwoot-sofia';
const TEST_PHONE    = '+51977000099';
const TEST_NAME     = 'Test E2E System';
const SOFIA_WF      = '37SLdWISQLgkHeXk';

// Active workflows to health-check
const WORKFLOWS = [
  { id: SOFIA_WF,            name: 'SofIA Main',                 critical: true  },
  { id: 'FCSJrGj5bLMuytr7',  name: 'SofIA 24h Reminders',       critical: true  },
  { id: 'CwL85rI1rLFD0MS1',  name: 'SofIA Re-engagement',        critical: true  },
  { id: 'gMqpwPqPafyIEdP7',  name: 'SofIA Payment Reminders',    critical: false },
  { id: 'BhX7jZaCndAclmH2',  name: 'SofIA Auto Resume Bot',      critical: false },
  { id: 'J5aUVLsnYNNZw9Rq',  name: 'SofIA Meta Leads Capture',   critical: false },
  { id: '8mglaD5SCaFB2XWZ',  name: 'SofIA Email Inicial',        critical: false },
  { id: 'Hq0a9bBAGFBeslIP',  name: 'SofIA Monthly Reports Cron', critical: false },
  { id: 'WGnHElPWv9amUte8',  name: 'Libreria W1 Cotizar',        critical: false },
  { id: 'JbAMAmCqGTptWC5d',  name: 'Libreria W2 Confirmar',      critical: false },
  { id: 'mkoRhdwXgxx17R70',  name: 'Libreria W3 Comprobante',    critical: false },
  { id: 'f4ulTAbkVVYUp1UR',  name: 'Libreria W4 Entrega',        critical: false },
  { id: 'O784FZABOxpCkq1y',  name: 'AI News Avatar Pipeline',    critical: false },
  { id: 'uYIrhVx6RroPejWw',  name: 'SofIA Lead Gen Clinicas',    critical: false },
  { id: 'bJTjtousgBsN3xoI',  name: 'SofIA Demo Bot',             critical: false },
  { id: 'luxA2XKMXA4b6hxo',  name: 'Landing/Chat Page 1',        critical: false },
  { id: 'mNL2Pa1mVhhp1iYQ',  name: 'Landing/Chat Page 2',        critical: false },
  { id: 'pcjSqYlnURtWWAMc',  name: 'Landing/Chat Page 3',        critical: false },
  { id: 'hePACJnCY9lTAJez',  name: 'SofIA Email Blast',          critical: false },
  { id: 'q1RZvxPbZVNJKAT5',  name: 'SofIA SMS Follow-up',        critical: false },
  { id: 'nYsyOfbIUmEcJgbw',  name: 'SofIA Llamada Follow-up',    critical: false },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const sleep   = ms => new Promise(r => setTimeout(r, ms));
const n8nGet  = path => fetch(N8N_BASE + path, { headers: { 'X-N8N-API-KEY': N8N_API_KEY } }).then(r => r.json());
const sbFetch = (path, opts = {}) => fetch(SB_URL + path, {
  ...opts,
  headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', ...(opts.headers || {}) }
}).then(r => r.json().then(b => ({ status: r.status, body: b })).catch(() => ({ status: r.status, body: null })));
const cwFetch = (method, path, body) => fetch(CW_BASE + path, {
  method, headers: { api_access_token: CW_TOKEN, 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined
}).then(r => r.json().then(b => ({ status: r.status, body: b })).catch(() => ({ status: r.status, body: null })));

// ── Result tracking ───────────────────────────────────────────────────────────
const results = [];
let suiteLabel = '';

const pass = (label, detail = '') => {
  results.push({ suite: suiteLabel, label, ok: true, detail });
  console.log('  \u2705 ' + label + (detail ? '  — ' + detail : ''));
};
const fail = (label, detail = '') => {
  results.push({ suite: suiteLabel, label, ok: false, detail });
  console.log('  \u274C ' + label + (detail ? '  — ' + detail : ''));
};
const warn = (label, detail = '') => {
  results.push({ suite: suiteLabel, label, ok: null, detail });
  console.log('  \u26A0\uFE0F  ' + label + (detail ? '  — ' + detail : ''));
};
const section = (title) => {
  suiteLabel = title;
  console.log('\n\u2501'.repeat(2) + ' ' + title + ' ' + '\u2501'.repeat(2));
};

// ══════════════════════════════════════════════════════════════════════════════
// SUITE A — INFRASTRUCTURE
// ══════════════════════════════════════════════════════════════════════════════
async function suiteA() {
  console.log('\n\u2550'.repeat(60));
  console.log('SUITE A \u2014 Infrastructure Health');
  console.log('\u2550'.repeat(60));

  // A1 — n8n API
  section('A1: n8n API');
  try {
    const r = await fetch(N8N_BASE + '/api/v1/workflows?limit=1', {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY }
    });
    if (r.ok) pass('n8n API reachable', 'HTTP ' + r.status);
    else      fail('n8n API reachable', 'HTTP ' + r.status);
  } catch (e) { fail('n8n API reachable', e.message); }

  // A2 — Supabase
  section('A2: Supabase');
  try {
    const r = await sbFetch('/rest/v1/clinics?limit=1&select=id');
    if (r.status === 200 && Array.isArray(r.body)) pass('Supabase REST reachable', r.body.length + ' clinics');
    else fail('Supabase REST reachable', 'HTTP ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 80));
  } catch (e) { fail('Supabase REST reachable', e.message); }

  // A3 — Chatwoot
  section('A3: Chatwoot');
  try {
    const r = await cwFetch('GET', '/api/v1/accounts/' + CW_ACCOUNT + '/conversations?page=1');
    if (r.status === 200) pass('Chatwoot API reachable', 'account ' + CW_ACCOUNT + ' OK');
    else fail('Chatwoot API reachable', 'HTTP ' + r.status);
  } catch (e) { fail('Chatwoot API reachable', e.message); }

  // A4 — Twilio (use demo clinic bot_config credentials)
  section('A4: Twilio');
  try {
    const cr = await sbFetch('/rest/v1/clinics?id=eq.' + DEMO_CLINIC + '&select=bot_config');
    const bc = (cr.body[0] && cr.body[0].bot_config) || {};
    const sid = bc.twilio_account_sid;
    const tok = bc.twilio_auth_token;
    if (!sid || !tok) { fail('Twilio API reachable', 'no credentials in demo clinic bot_config'); }
    else {
      const auth = Buffer.from(sid + ':' + tok).toString('base64');
      const r = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + sid + '.json', {
        headers: { Authorization: 'Basic ' + auth }
      });
      if (r.ok) {
        const d = await r.json();
        pass('Twilio API reachable', 'status=' + d.status + ' type=' + d.type + ' sid=...' + sid.slice(-4));
      } else {
        fail('Twilio API reachable', 'HTTP ' + r.status);
      }
    }
  } catch (e) { fail('Twilio API reachable', e.message); }

  // A5 — n8n webhook (SofIA endpoint responds)
  section('A5: SofIA Webhook endpoint');
  try {
    // OPTIONS/HEAD not supported — send minimal payload and just check it doesn't 404
    const r = await fetch(SOFIA_WH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-chatwoot-signature': 'sha256=e2e-ping' },
      body: JSON.stringify({ event: 'ping', message_type: 'activity' })
    });
    // n8n may return 200 or process it; just check reachable (not 404)
    if (r.status !== 404 && r.status !== 502 && r.status !== 503) {
      pass('SofIA webhook reachable', 'HTTP ' + r.status);
    } else {
      fail('SofIA webhook reachable', 'HTTP ' + r.status);
    }
  } catch (e) { fail('SofIA webhook reachable', e.message); }
}

// ══════════════════════════════════════════════════════════════════════════════
// SUITE B — WORKFLOW HEALTH
// ══════════════════════════════════════════════════════════════════════════════
async function suiteB() {
  console.log('\n\u2550'.repeat(60));
  console.log('SUITE B \u2014 Active Workflow Health');
  console.log('\u2550'.repeat(60));
  section('B: Workflow status + last execution');

  let notFoundCount = 0;

  for (const wf of WORKFLOWS) {
    try {
      // Get workflow status
      const wfData = await n8nGet('/api/v1/workflows/' + wf.id);
      if (!wfData || wfData.message) {
        if (wf.critical) fail(wf.name + ' [' + wf.id + ']', 'Not found in n8n');
        else             warn(wf.name + ' [' + wf.id + ']', 'Not found (may not exist yet)');
        notFoundCount++;
        continue;
      }

      const isActive = wfData.active === true;

      // Get last execution
      let lastExec = null;
      try {
        const execs = await n8nGet('/api/v1/executions?workflowId=' + wf.id + '&limit=1');
        const list = Array.isArray(execs) ? execs : (execs.data || []);
        lastExec = list[0] || null;
      } catch (_) {}

      const execInfo = lastExec
        ? 'last=' + (lastExec.status || '?') + ' at ' + (lastExec.startedAt || lastExec.createdAt || '?').slice(0, 16)
        : 'no executions';

      if (isActive) {
        if (!lastExec || lastExec.status === 'success') {
          pass(wf.name, (isActive ? 'active' : 'INACTIVE') + ' | ' + execInfo);
        } else if (lastExec.status === 'error') {
          if (wf.critical) fail(wf.name, 'active but last exec ERRORED | ' + execInfo);
          else             warn(wf.name, 'active but last exec errored | ' + execInfo);
        } else {
          pass(wf.name, 'active | ' + execInfo);
        }
      } else {
        if (wf.critical) fail(wf.name, 'INACTIVE — critical workflow is off!');
        else             warn(wf.name, 'inactive | ' + execInfo);
      }
    } catch (e) {
      if (wf.critical) fail(wf.name, 'fetch error: ' + e.message);
      else             warn(wf.name, 'fetch error: ' + e.message);
    }
  }

  if (notFoundCount > 0) {
    console.log('\n  (' + notFoundCount + ' workflows not found — may not be deployed yet)');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SUITE C — SofIA LIVE (abbreviated)
// ══════════════════════════════════════════════════════════════════════════════
let convId = null;

const mkPayload = (text, labels, attrs) => ({
  event: 'message_created',
  content: text,
  message_type: 'incoming',
  created_at: Math.floor(Date.now() / 1000),
  account: { id: CW_ACCOUNT },
  sender: { id: 88099, name: TEST_NAME, phone_number: TEST_PHONE },
  conversation: {
    id: convId,
    inbox_id: CW_INBOX,
    status: 'open',
    labels: labels || [],
    contact_inbox: { source_id: TEST_PHONE, inbox: { channel_type: 'Channel::TwilioSms' } },
    custom_attributes: Object.assign({ bot_interaction_count: 0, awaiting_slot_confirmation: 'false' }, attrs || {})
  }
});

const sendMsg = async (text, labels, attrs, waitMs) => {
  await fetch(SOFIA_WH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-chatwoot-signature': 'sha256=e2e-test' },
    body: JSON.stringify(mkPayload(text, labels, attrs))
  });
  await sleep(waitMs || 5000);
};

const latestExec = async () => {
  const d = await n8nGet('/api/v1/executions?workflowId=' + SOFIA_WF + '&limit=1');
  const list = Array.isArray(d) ? d : (d.data || []);
  return list[0] || null;
};

const botMsgs = async (n) => {
  if (!convId) return [];
  const r = await cwFetch('GET', '/api/v1/accounts/' + CW_ACCOUNT + '/conversations/' + convId + '/messages');
  return ((r.body && r.body.payload) || []).filter(m => m.message_type === 1 && !m.private).slice(-(n || 3)).map(m => m.content || '');
};

async function suiteC() {
  console.log('\n\u2550'.repeat(60));
  console.log('SUITE C \u2014 SofIA Live (abbreviated)');
  console.log('\u2550'.repeat(60));

  // Setup: create or reuse test contact + conversation
  section('C0: Setup test conversation');
  try {
    const sr = await cwFetch('GET', '/api/v1/accounts/' + CW_ACCOUNT + '/contacts/search?q=' + encodeURIComponent(TEST_PHONE));
    const contacts = Array.isArray(sr.body && sr.body.payload) ? sr.body.payload : [];
    let contactId = (contacts.find(c => c.phone_number === TEST_PHONE) || {}).id;

    if (!contactId) {
      const cr = await cwFetch('POST', '/api/v1/accounts/' + CW_ACCOUNT + '/contacts', { name: TEST_NAME, phone_number: TEST_PHONE });
      contactId = cr.body && cr.body.id;
      if (!contactId) {
        const sr2 = await cwFetch('GET', '/api/v1/accounts/' + CW_ACCOUNT + '/contacts/search?q=' + encodeURIComponent(TEST_PHONE));
        const c2 = Array.isArray(sr2.body && sr2.body.payload) ? sr2.body.payload : [];
        contactId = (c2.find(c => c.phone_number === TEST_PHONE) || {}).id;
      }
    }

    if (!contactId) { fail('Create test contact', 'contactId missing'); return; }

    const cr = await cwFetch('POST', '/api/v1/accounts/' + CW_ACCOUNT + '/conversations', { inbox_id: CW_INBOX, contact_id: contactId });
    convId = cr.body && cr.body.id;
    if (!convId) { fail('Create test conversation', 'convId missing'); return; }
    pass('Setup conversation', 'contact=' + contactId + ' conv=' + convId);
  } catch (e) { fail('Setup conversation', e.message); return; }

  // C1 — Greeting triggers workflow execution
  section('C1: Greeting → workflow executes');
  try {
    const e0 = await latestExec();
    await sendMsg('Hola');
    const e1 = await latestExec();
    if (e1 && e0 && e1.id !== e0.id) pass('Workflow triggered on greeting', 'exec #' + e1.id + ' ' + e1.status);
    else fail('Workflow triggered on greeting', 'exec ID unchanged');
    if (e1 && e1.status === 'success') pass('Greeting exec successful', e1.status);
    else fail('Greeting exec successful', (e1 && e1.status) || 'no exec');
  } catch (e) { fail('C1 greeting', e.message); }

  // C2 — INFO query gets AI response
  section('C2: INFO query → AI responds');
  try {
    await cwFetch('POST', '/api/v1/accounts/' + CW_ACCOUNT + '/conversations/' + convId + '/labels', { labels: [] });
    await sleep(500);
    const e1 = await latestExec();
    await sendMsg('cuanto cuesta la limpieza dental', [], {}, 7000);
    const e2 = await latestExec();
    const msgs = await botMsgs(2);
    const responded = msgs.length > 0 || (e2 && e1 && e2.id !== e1.id);
    if (responded) pass('INFO query processed', 'exec=' + (e2 && e2.status));
    else           fail('INFO query processed', 'no execution change');
    // Check Chatwoot for reply (may be Twilio, not Chatwoot text)
    if (msgs.length > 0 && msgs.some(m => m.length > 20)) {
      pass('INFO response has content', msgs[msgs.length - 1].slice(0, 80));
    } else {
      warn('INFO response in Chatwoot', 'may be Twilio-only — check exec status: ' + (e2 && e2.status));
    }
  } catch (e) { fail('C2 INFO query', e.message); }

  // C3 — HUMAN escalation does NOT pause bot (demo mode fix)
  section('C3: HUMAN escalation → bot_paused stays false');
  try {
    await cwFetch('POST', '/api/v1/accounts/' + CW_ACCOUNT + '/conversations/' + convId + '/labels', { labels: [] });
    await sleep(500);
    await sendMsg('quiero hablar con una persona', [], {}, 5000);
    const sbR = await sbFetch(
      '/rest/v1/conversations?chatwoot_conversation_id=eq.' + convId + '&select=bot_paused'
    );
    if (sbR.status === 200 && Array.isArray(sbR.body) && sbR.body.length > 0) {
      const paused = sbR.body[0].bot_paused === true;
      if (!paused) pass('Governance: bot NOT paused after HUMAN (demo fix OK)', 'bot_paused=false');
      else         fail('Governance: bot paused after HUMAN', 'bot_paused=true — demo fix broken!');
    } else {
      warn('Governance check', 'conv not in Supabase yet (may not have upserted) HTTP=' + sbR.status);
    }
  } catch (e) { fail('C3 HUMAN escalation', e.message); }

  // C4 — Outgoing message filter (no loop)
  section('C4: Outgoing message ignored (no loop)');
  try {
    const before = await botMsgs(1);
    const outPayload = mkPayload('mensaje saliente test', [], {});
    outPayload.message_type = 'outgoing';
    await fetch(SOFIA_WH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-chatwoot-signature': 'sha256=e2e-test' },
      body: JSON.stringify(outPayload)
    });
    await sleep(3000);
    const after = await botMsgs(1);
    if (before[0] === after[0]) pass('Outgoing messages silently ignored', 'no new bot reply');
    else                         fail('Outgoing filter broken', 'bot replied to outgoing message!');
  } catch (e) { fail('C4 outgoing filter', e.message); }

  // Teardown
  if (convId) {
    try {
      await cwFetch('POST', '/api/v1/accounts/' + CW_ACCOUNT + '/conversations/' + convId + '/toggle_status', { status: 'resolved' });
      console.log('\n  (Test conversation ' + convId + ' resolved)');
    } catch (_) {}
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SUITE D — SUPABASE CORE FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════
async function suiteD() {
  console.log('\n\u2550'.repeat(60));
  console.log('SUITE D \u2014 Supabase Core Functions');
  console.log('\u2550'.repeat(60));

  // D1 — Clinics table
  section('D1: Clinics table');
  try {
    const r = await sbFetch('/rest/v1/clinics?select=id,name,active&limit=5');
    if (r.status === 200 && Array.isArray(r.body)) {
      const active = r.body.filter(c => c.active);
      pass('Clinics table accessible', r.body.length + ' rows, ' + active.length + ' active');
    } else {
      fail('Clinics table accessible', 'HTTP ' + r.status);
    }
  } catch (e) { fail('Clinics table', e.message); }

  // D2 — get_conversations_to_reengage RPC
  section('D2: get_conversations_to_reengage RPC');
  try {
    const r = await sbFetch('/rest/v1/rpc/get_conversations_to_reengage', {
      method: 'POST',
      body: JSON.stringify({})
    });
    if (r.status === 200) {
      const count = Array.isArray(r.body) ? r.body.length : '?';
      pass('get_conversations_to_reengage OK', count + ' conversations to reengage');
    } else {
      fail('get_conversations_to_reengage', 'HTTP ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 80));
    }
  } catch (e) { fail('get_conversations_to_reengage', e.message); }

  // D3 — upsert_conversation RPC (correct signature)
  section('D3: upsert_conversation RPC');
  try {
    const r = await sbFetch('/rest/v1/rpc/upsert_conversation', {
      method: 'POST',
      body: JSON.stringify({
        p_chatwoot_conversation_id: 99999,
        p_clinic_id: DEMO_CLINIC,
        p_last_message: 'Test System E2E',
        p_patient_name: 'Test System E2E'
      })
    });
    if (r.status === 200 || r.status === 204) {
      pass('upsert_conversation RPC OK', 'HTTP ' + r.status + ' returned=' + JSON.stringify(r.body).slice(0, 60));
    } else {
      fail('upsert_conversation RPC', 'HTTP ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 80));
    }
  } catch (e) { fail('upsert_conversation RPC', e.message); }

  // D4 — get_conversations_to_reengage (verify it returns current state)
  section('D4: Conversations governance columns');
  try {
    const r = await sbFetch('/rest/v1/conversations?limit=5&select=id,clinic_id,bot_paused,last_activity_at&order=last_activity_at.desc');
    if (r.status === 200 && Array.isArray(r.body)) {
      const paused = r.body.filter(c => c.bot_paused).length;
      pass('Conversations governance columns OK', r.body.length + ' rows, ' + paused + ' paused, cols: id,clinic_id,bot_paused,last_activity_at');
    } else {
      fail('Conversations governance columns', 'HTTP ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 80));
    }
  } catch (e) { fail('Conversations governance columns', e.message); }

  // D5 — conversations table (governance)
  section('D5: Conversations table (governance)');
  try {
    const r = await sbFetch('/rest/v1/conversations?limit=5&select=id,clinic_id,bot_paused,status');
    if (r.status === 200 && Array.isArray(r.body)) {
      const paused = r.body.filter(c => c.bot_paused).length;
      pass('Conversations table accessible', r.body.length + ' recent, ' + paused + ' paused');
    } else {
      fail('Conversations table', 'HTTP ' + r.status);
    }
  } catch (e) { fail('Conversations table', e.message); }

  // D6 — appointments table
  section('D6: Appointments table');
  try {
    const r = await sbFetch('/rest/v1/appointments?limit=3&select=id,clinic_id,start_time,status&order=created_at.desc');
    if (r.status === 200 && Array.isArray(r.body)) {
      pass('Appointments table accessible', r.body.length + ' recent appointments');
    } else {
      fail('Appointments table', 'HTTP ' + r.status);
    }
  } catch (e) { fail('Appointments table', e.message); }

  // D7 — knowledge_base table
  section('D7: Knowledge base table');
  try {
    const r = await sbFetch('/rest/v1/knowledge_base?limit=3&select=id,clinic_id,category,active');
    if (r.status === 200 && Array.isArray(r.body)) {
      pass('Knowledge base table accessible', r.body.length + ' entries');
    } else {
      fail('Knowledge base table', 'HTTP ' + r.status);
    }
  } catch (e) { fail('Knowledge base table', e.message); }

  // D8 — reminder_log table
  section('D8: Reminder log table');
  try {
    const r = await sbFetch('/rest/v1/reminder_log?limit=5&select=*');
    if (r.status === 200 && Array.isArray(r.body)) {
      pass('Reminder log accessible', r.body.length + ' entries' + (r.body[0] ? ' cols=' + Object.keys(r.body[0]).join(',') : ' (empty — no reminders sent yet)'));
    } else {
      fail('Reminder log', 'HTTP ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 80));
    }
  } catch (e) { fail('Reminder log', e.message); }
}

// ══════════════════════════════════════════════════════════════════════════════
// SUITE E — CRON JOB HISTORY
// ══════════════════════════════════════════════════════════════════════════════
async function suiteE() {
  console.log('\n\u2550'.repeat(60));
  console.log('SUITE E \u2014 Cron Job Execution History');
  console.log('\u2550'.repeat(60));
  section('E: Recent cron executions');

  const cronWfs = [
    { id: 'FCSJrGj5bLMuytr7', name: '24h Reminders',       maxHours: 2,  warnHours: 6  },
    { id: 'CwL85rI1rLFD0MS1', name: 'Re-engagement',       maxHours: 2,  warnHours: 6  },
    { id: 'gMqpwPqPafyIEdP7', name: 'Payment Reminders',   maxHours: 25, warnHours: 50 },
    { id: 'BhX7jZaCndAclmH2', name: 'Auto Resume Bot',     maxHours: 1,  warnHours: 3  },
    { id: 'Hq0a9bBAGFBeslIP', name: 'Monthly Reports',     maxHours: 800,warnHours: 800 },
  ];

  const now = Date.now();

  for (const wf of cronWfs) {
    try {
      const execs = await n8nGet('/api/v1/executions?workflowId=' + wf.id + '&limit=5');
      const list = Array.isArray(execs) ? execs : (execs.data || []);
      if (!list.length) { warn(wf.name + ' — no executions', 'never ran or no history'); continue; }

      const last = list[0];
      const lastStatus = last.status || '?';
      const lastTime = last.startedAt || last.createdAt || null;
      const ageHours = lastTime ? (now - new Date(lastTime).getTime()) / 3600000 : 999;
      const ageStr = ageHours < 1 ? Math.round(ageHours * 60) + 'min ago'
                   : ageHours < 48 ? ageHours.toFixed(1) + 'h ago'
                   : Math.round(ageHours / 24) + 'd ago';

      // Count recent successes
      const recentOk = list.filter(e => e.status === 'success').length;
      const detail = lastStatus + ' | ' + ageStr + ' | ' + recentOk + '/' + list.length + ' ok';

      if (lastStatus === 'error') {
        fail(wf.name + ' last exec', detail);
      } else if (ageHours > wf.warnHours) {
        warn(wf.name + ' stale', detail);
      } else {
        pass(wf.name + ' last exec', detail);
      }
    } catch (e) { warn(wf.name, 'error fetching: ' + e.message); }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SUITE F — LIBRERIA WEBHOOK
// ══════════════════════════════════════════════════════════════════════════════
async function suiteF() {
  console.log('\n\u2550'.repeat(60));
  console.log('SUITE F \u2014 Libreria Webhook Connectivity');
  console.log('\u2550'.repeat(60));
  section('F1: Libreria W1 webhook endpoint');

  try {
    // Send a test request to libreria/cotizar — it expects multipart but just
    // check the endpoint is reachable (not 404/502/503)
    const r = await fetch(N8N_BASE + '/webhook/libreria/cotizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true })
    });
    if (r.status === 404 || r.status === 502 || r.status === 503) {
      fail('Libreria W1 webhook reachable', 'HTTP ' + r.status + ' — endpoint down');
    } else {
      pass('Libreria W1 webhook reachable', 'HTTP ' + r.status + ' (endpoint active)');
    }
  } catch (e) { fail('Libreria W1 webhook', e.message); }

  // Check last execution for Libreria workflows
  // Note: W1 is probed in F1 which intentionally creates an error exec (JSON to multipart endpoint)
  // so W1 last exec is excluded — endpoint reachability is already confirmed above
  section('F2: Libreria W2-W4 last executions');
  const libWfs = [
    { id: 'JbAMAmCqGTptWC5d', name: 'W2 Confirmar'  },
    { id: 'mkoRhdwXgxx17R70', name: 'W3 Comprobante' },
    { id: 'f4ulTAbkVVYUp1UR', name: 'W4 Entrega'    },
  ];
  for (const wf of libWfs) {
    try {
      const execs = await n8nGet('/api/v1/executions?workflowId=' + wf.id + '&limit=3');
      const list = Array.isArray(execs) ? execs : (execs.data || []);
      if (!list.length) { warn(wf.name, 'no executions (never triggered — OK for on-demand workflow)'); continue; }
      const last = list[0];
      const ok = list.filter(e => e.status === 'success').length;
      const detail = last.status + ' | ' + ok + '/' + list.length + ' ok';
      if (last.status === 'error') fail(wf.name + ' last exec', detail);
      else                          pass(wf.name + ' last exec', detail);
    } catch (e) { warn(wf.name, e.message); }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const startTime = Date.now();
  console.log('\u2550'.repeat(60));
  console.log('  SISTEMA SofIA \u2014 E2E System Health Check');
  console.log('  ' + new Date().toISOString());
  console.log('\u2550'.repeat(60));

  await suiteA();
  await suiteB();
  await suiteC();
  await suiteD();
  await suiteE();
  await suiteF();

  // ── Final report ─────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const passed  = results.filter(r => r.ok === true).length;
  const failed  = results.filter(r => r.ok === false).length;
  const warned  = results.filter(r => r.ok === null).length;

  console.log('\n' + '\u2550'.repeat(60));
  console.log('  RESULTADO FINAL');
  console.log('\u2550'.repeat(60));

  // Group by suite
  const bySuite = {};
  for (const r of results) {
    if (!bySuite[r.suite]) bySuite[r.suite] = [];
    bySuite[r.suite].push(r);
  }
  for (const [suite, items] of Object.entries(bySuite)) {
    const p = items.filter(i => i.ok === true).length;
    const f = items.filter(i => i.ok === false).length;
    const w = items.filter(i => i.ok === null).length;
    const icon = f > 0 ? '\u274C' : (w > 0 ? '\u26A0\uFE0F ' : '\u2705');
    console.log('  ' + icon + '  ' + suite.padEnd(42) + ' \u2713' + p + ' \u2717' + f + ' \u26A0' + w);
  }

  console.log('\n' + '\u2500'.repeat(60));
  console.log('  \u2705 PASSED:  ' + passed);
  console.log('  \u274C FAILED:  ' + failed);
  console.log('  \u26A0\uFE0F  WARNINGS: ' + warned);
  console.log('  Total:   ' + (passed + failed + warned) + ' checks in ' + elapsed + 's');
  console.log('\u2550'.repeat(60));

  if (failed > 0) {
    console.log('\nFALLOS CRITICOS:');
    results.filter(r => r.ok === false).forEach(r => {
      console.log('  \u274C [' + r.suite + '] ' + r.label + ': ' + r.detail);
    });
  }
  if (warned > 0) {
    console.log('\nADVERTENCIAS:');
    results.filter(r => r.ok === null).forEach(r => {
      console.log('  \u26A0\uFE0F  [' + r.suite + '] ' + r.label + ': ' + r.detail);
    });
  }
})();
