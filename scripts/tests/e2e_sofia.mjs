/**
 * e2e_sofia.mjs — End-to-end test for SofIA
 * Run: node scripts/tests/e2e_sofia.mjs
 */

const N8N_API_KEY    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const N8N_BASE       = 'https://workflows.n8n.redsolucionesti.com';
const WEBHOOK_URL    = N8N_BASE + '/webhook/chatwoot-sofia';
const CHATWOOT_BASE  = 'https://chat.redsolucionesti.com';
const CHATWOOT_TOKEN = 'yypAwZDH2dV3crfbqJqWCgj1';
const ACCOUNT_ID     = 2;
const INBOX_ID       = 10;
const TEST_PHONE     = '+51977000001';
const TEST_NAME      = 'Test E2E SofIA';
const WF_ID          = '37SLdWISQLgkHeXk';

const sleep   = ms => new Promise(r => setTimeout(r, ms));
const n8nGet  = path => fetch(N8N_BASE + path, { headers: { 'X-N8N-API-KEY': N8N_API_KEY } }).then(r => r.json());
const cw      = (method, path, body) => fetch(CHATWOOT_BASE + path, {
  method,
  headers: { api_access_token: CHATWOOT_TOKEN, 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined
}).then(r => r.json());

let convId = null;
let passed = 0;
let failed = 0;

const check = (label, ok, detail) => {
  if (ok) { console.log('  \u2705 ' + label); passed++; }
  else     { console.log('  \u274C ' + label + (detail ? ' — ' + detail : '')); failed++; }
};

// Build Chatwoot webhook payload
const mkPayload = (text, labels, attrs) => ({
  event: 'message_created',
  content: text,
  message_type: 'incoming',
  created_at: Math.floor(Date.now() / 1000),
  account: { id: ACCOUNT_ID },
  sender: { id: 88001, name: TEST_NAME, phone_number: TEST_PHONE },
  conversation: {
    id: convId,
    inbox_id: INBOX_ID,
    status: 'open',
    labels: labels || [],
    contact_inbox: { source_id: TEST_PHONE, inbox: { channel_type: 'Channel::TwilioSms' } },
    custom_attributes: Object.assign({ bot_interaction_count: 0, awaiting_slot_confirmation: 'false' }, attrs || {})
  }
});

// Send message to n8n webhook
const send = async (text, labels, attrs, waitMs) => {
  await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-chatwoot-signature': 'sha256=e2e-test' },
    body: JSON.stringify(mkPayload(text, labels, attrs))
  });
  await sleep(waitMs || 5000);
};

// Get last N outgoing bot messages from Chatwoot (text)
const botMsgs = async (n) => {
  const r = await cw('GET', '/api/v1/accounts/' + ACCOUNT_ID + '/conversations/' + convId + '/messages');
  return (r.payload || []).filter(m => m.message_type === 1 && !m.private).slice(-(n || 3)).map(m => m.content || '');
};

// Get latest n8n execution for SofIA workflow
const latestExec = async () => {
  const d = await n8nGet('/api/v1/executions?workflowId=' + WF_ID + '&limit=1');
  return (d.data || d)[0] || null;
};

// ── SETUP ─────────────────────────────────────────────────────────────────────
const setup = async () => {
  const sr = await cw('GET', '/api/v1/accounts/' + ACCOUNT_ID + '/contacts/search?q=' + encodeURIComponent(TEST_PHONE));
  const contacts = Array.isArray(sr.payload) ? sr.payload : [];
  let contactId = (contacts.find(c => c.phone_number === TEST_PHONE) || {}).id;

  if (!contactId) {
    const cr = await cw('POST', '/api/v1/accounts/' + ACCOUNT_ID + '/contacts', { name: TEST_NAME, phone_number: TEST_PHONE });
    contactId = cr.id;
    if (!contactId) {
      const sr2 = await cw('GET', '/api/v1/accounts/' + ACCOUNT_ID + '/contacts/search?q=' + encodeURIComponent(TEST_PHONE));
      contactId = ((Array.isArray(sr2.payload) ? sr2.payload : []).find(c => c.phone_number === TEST_PHONE) || {}).id;
    }
  }
  console.log('Contact: ' + contactId + ' (' + TEST_NAME + ')');

  const cr = await cw('POST', '/api/v1/accounts/' + ACCOUNT_ID + '/conversations', { inbox_id: INBOX_ID, contact_id: contactId });
  convId = cr.id;
  console.log('Conversation: ' + convId + '\n');
};

// ── TEARDOWN ──────────────────────────────────────────────────────────────────
const teardown = async () => {
  if (convId) {
    await cw('POST', '/api/v1/accounts/' + ACCOUNT_ID + '/conversations/' + convId + '/toggle_status', { status: 'resolved' });
    console.log('\nConversacion ' + convId + ' cerrada.\n');
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════════
const runTests = async () => {

  // T01 — Saludo → SofIA procesa y envía menú via Twilio LP4
  console.log('\n\u2501\u2501 T01: Saludo \u2192 Menu demo (Twilio LP4) \u2501\u2501');
  const e0 = await latestExec();
  await send('Hola', [], {}, 8000);   // 8s — primer mensaje puede ser más lento (cold start)
  const e1 = await latestExec();
  console.log('  Ultima ejecucion: #' + (e1 && e1.id) + ' | ' + (e1 && e1.status));
  check('Workflow ejecuto al recibir saludo', e1 && e0 && e1.id !== e0.id);
  check('Ejecucion exitosa', e1 && e1.status === 'success');

  // T02 — pos_1 → navega demo flow
  console.log('\n\u2501\u2501 T02: pos_1 \u2192 Demo flow nav \u2501\u2501');
  await send('pos_1');
  const e2 = await latestExec();
  console.log('  Ultima ejecucion: #' + (e2 && e2.id) + ' | ' + (e2 && e2.status));
  check('Workflow proceso pos_1', e2 && e1 && e2.id !== e1.id);
  check('Ejecucion exitosa', e2 && e2.status === 'success');

  // T03 — CREATE_EVENT → lead capture (demo mode pide datos primero)
  console.log('\n\u2501\u2501 T03: Agendar cita \u2192 lead capture demo \u2501\u2501');
  await cw('POST', '/api/v1/accounts/' + ACCOUNT_ID + '/conversations/' + convId + '/labels', { labels: [] });
  await sleep(500);
  await send('quiero agendar una cita', [], {}, 6000);
  const msgs3 = await botMsgs(3);
  console.log('  Bot: ' + msgs3.map(m => m.slice(0, 90)));
  check('Bot respondio al intent de agendar', msgs3.length > 0);
  check('Respuesta inicia lead capture o demo booking', msgs3.some(m => /nombre|clinica|demo|cita|coordinar|datos|rapidos/i.test(m)));

  // T04 — INFO: pregunta sobre precios
  console.log('\n\u2501\u2501 T04: Pregunta INFO \u2192 respuesta IA \u2501\u2501');
  await cw('POST', '/api/v1/accounts/' + ACCOUNT_ID + '/conversations/' + convId + '/labels', { labels: [] });
  await sleep(500);
  await send('cuanto cuesta la limpieza dental', [], {}, 7000);
  const msgs4 = await botMsgs(2);
  console.log('  Bot: ' + msgs4.map(m => m.slice(0, 110)));
  check('Bot respondio con informacion', msgs4.length > 0);
  check('Respuesta coherente sobre precios/info', msgs4.some(m => m.length > 30));

  // T05 — HUMAN intent → escalacion SIN pausar governance (nuestro fix)
  console.log('\n\u2501\u2501 T05: Escalacion HUMAN \u2192 sin pausa governance (fix demo) \u2501\u2501');
  await cw('POST', '/api/v1/accounts/' + ACCOUNT_ID + '/conversations/' + convId + '/labels', { labels: [] });
  await sleep(500);
  await send('quiero hablar con una persona');
  const msgs5 = await botMsgs(2);
  console.log('  Bot: ' + msgs5.map(m => m.slice(0, 110)));
  check('Bot respondio al pedido de escalacion', msgs5.length > 0);

  const convCheck = await fetch(
    'https://inhyrrjidhzrbqecnptn.supabase.co/rest/v1/conversations?chatwoot_conversation_id=eq.' + convId + '&select=bot_paused',
    { headers: { apikey: 'process.env.SUPABASE_SERVICE_KEY', Authorization: 'Bearer process.env.SUPABASE_SERVICE_KEY' } }
  ).then(r => r.json());
  const botPaused = convCheck[0] && convCheck[0].bot_paused === true;
  check('Governance NO pausado en demo mode', !botPaused, botPaused ? 'bot_paused=true, fix no funciona' : '');

  // T06 — Bot sigue respondiendo despues del escalado (nuevo n8n execution)
  console.log('\n\u2501\u2501 T06: Bot responde despues de escalacion \u2501\u2501');
  const e5 = await latestExec();
  await send('Hola de nuevo', [], {}, 5000);
  const e6 = await latestExec();
  console.log('  Ejecucion: #' + (e6 && e6.id) + ' | ' + (e6 && e6.status));
  check('Bot proceso mensaje post-escalacion (no bloqueado)', e6 && e5 && e6.id !== e5.id);
  check('Ejecucion exitosa post-escalacion', e6 && e6.status === 'success');

  // T07 — outgoing message type debe ignorarse (no loop)
  console.log('\n\u2501\u2501 T07: Filtro outgoing \u2192 sin respuesta (no loop) \u2501\u2501');
  const outPayload = mkPayload('mensaje saliente', [], {});
  outPayload.message_type = 'outgoing';
  const before7 = await botMsgs(1);
  await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-chatwoot-signature': 'sha256=e2e-test' },
    body: JSON.stringify(outPayload)
  });
  await sleep(3000);
  const after7 = await botMsgs(1);
  check('Mensajes outgoing ignorados (no provoca respuesta extra)', before7[0] === after7[0]);

  // T08 — activity type ignorado
  console.log('\n\u2501\u2501 T08: Filtro activity \u2192 silencioso \u2501\u2501');
  const actPayload = mkPayload('activity msg', [], {});
  actPayload.message_type = 'activity';
  const before8 = await botMsgs(1);
  await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-chatwoot-signature': 'sha256=e2e-test' },
    body: JSON.stringify(actPayload)
  });
  await sleep(3000);
  const after8 = await botMsgs(1);
  check('Mensajes activity ignorados silenciosamente', before8[0] === after8[0]);
};

// ── MAIN ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('═══════════════════════════════════════');
  console.log('       SofIA E2E Test Suite');
  console.log('═══════════════════════════════════════');
  try {
    await setup();
    await runTests();
  } catch(e) {
    console.error('Error fatal:', e.message);
  } finally {
    await teardown();
  }
  console.log('═══════════════════════════════════════');
  console.log('  RESULTADO: ' + passed + ' / ' + (passed + failed) + ' tests pasados');
  if (failed > 0) console.log('  FALLADOS: ' + failed);
  console.log('═══════════════════════════════════════');
})();
