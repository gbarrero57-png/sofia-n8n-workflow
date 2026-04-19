/**
 * e2e_demo_flow.mjs — End-to-end test del flujo demo de SofIA
 * Testea navegación completa: bienvenida → como_funciona (LP5) →
 *   info_historia_clinica → info_seguridad → precios → INFO libre
 * Run: node scripts/tests/e2e_demo_flow.mjs
 */

const N8N_BASE      = 'https://workflows.n8n.redsolucionesti.com';
const N8N_API_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const WEBHOOK_URL   = N8N_BASE + '/webhook/chatwoot-sofia';
const CHATWOOT_BASE = 'https://chat.redsolucionesti.com';
const CW_TOKEN      = 'yypAwZDH2dV3crfbqJqWCgj1';
const ACCOUNT_ID    = 2;
const INBOX_ID      = 10;
const TEST_PHONE    = '+51977000099';
const TEST_NAME     = 'Test E2E Flow v2';
const WF_ID         = '37SLdWISQLgkHeXk';

const sleep   = ms => new Promise(r => setTimeout(r, ms));
const cw      = (method, path, body) => fetch(CHATWOOT_BASE + path, {
  method,
  headers: { api_access_token: CW_TOKEN, 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined
}).then(r => r.json());
const n8nGet  = path => fetch(N8N_BASE + path, { headers: { 'X-N8N-API-KEY': N8N_API_KEY } }).then(r => r.json());

let convId = null;
let passed = 0, failed = 0;

const check = (label, ok, detail) => {
  if (ok) { console.log('  \u2705 ' + label); passed++; }
  else     { console.log('  \u274C ' + label + (detail ? ' \u2014 ' + detail : '')); failed++; }
};

const latestExec = async () => {
  const d = await n8nGet('/api/v1/executions?workflowId=' + WF_ID + '&limit=1');
  return (d.data || d)[0] || null;
};

const botMsgs = async (n) => {
  const r = await cw('GET', '/api/v1/accounts/' + ACCOUNT_ID + '/conversations/' + convId + '/messages');
  return (r.payload || []).filter(m => m.message_type === 1 && !m.private).slice(-(n || 5)).map(m => m.content || '');
};

const clearLabels = async () => {
  await cw('POST', '/api/v1/accounts/' + ACCOUNT_ID + '/conversations/' + convId + '/labels', { labels: [] });
  await sleep(400);
};

const mkPayload = (text) => ({
  event: 'message_created', content: text, message_type: 'incoming',
  created_at: Math.floor(Date.now() / 1000),
  account: { id: ACCOUNT_ID },
  sender: { id: 88099, name: TEST_NAME, phone_number: TEST_PHONE },
  conversation: {
    id: convId, inbox_id: INBOX_ID, status: 'open', labels: [],
    contact_inbox: { source_id: TEST_PHONE, inbox: { channel_type: 'Channel::TwilioSms' } },
    custom_attributes: { bot_interaction_count: 0, awaiting_slot_confirmation: 'false' }
  }
});

const send = async (text, waitMs) => {
  await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-chatwoot-signature': 'sha256=e2e-test' },
    body: JSON.stringify(mkPayload(text))
  });
  await sleep(waitMs || 5000);
};

// ── SETUP ─────────────────────────────────────────────────────────────────
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
const cr = await cw('POST', '/api/v1/accounts/' + ACCOUNT_ID + '/conversations', { inbox_id: INBOX_ID, contact_id: contactId });
convId = cr.id;
console.log('Conversacion: ' + convId + '\n');

// ══════════════════════════════════════════════════════════════════════════
// T01: Saludo → bienvenida (LP4)
// ══════════════════════════════════════════════════════════════════════════
console.log('\u2501\u2501 T01: Saludo \u2192 Bienvenida \u2501\u2501');
const e0 = await latestExec();
await send('Hola', 8000);
const e1 = await latestExec();
const msgs1 = await botMsgs(3);
check('Workflow ejecutado', e1 && e0 && e1.id !== e0.id);
check('Ejecucion exitosa', e1 && e1.status === 'success');
check('Bot respondio bienvenida', msgs1.length > 0);
const last1 = msgs1[msgs1.length - 1] || '';
check('Respuesta menciona SofIA o clinica', /sofia|clinic|agenda|cita|automatiz/i.test(last1), last1.slice(0, 100));
console.log('  Bot: ' + last1.slice(0, 150));

// ══════════════════════════════════════════════════════════════════════════
// T02: pos_1 → como_funciona (LP5 — 5 opciones)
// ══════════════════════════════════════════════════════════════════════════
console.log('\n\u2501\u2501 T02: pos_1 \u2192 como_funciona (LP5) \u2501\u2501');
const e1b = await latestExec();
await send('pos_1', 5000);
const e2 = await latestExec();
const msgs2 = await botMsgs(3);
check('Workflow proceso pos_1', e2 && e1b && e2.id !== e1b.id);
check('Ejecucion exitosa', e2 && e2.status === 'success');
const last2 = msgs2[msgs2.length - 1] || '';
check('Respuesta como_funciona coherente', /paciente|cita|agend|duerme|automatiz|funciona/i.test(last2), last2.slice(0, 100));
console.log('  Bot: ' + last2.slice(0, 200));

// ══════════════════════════════════════════════════════════════════════════
// T03: pos_4 → info_historia_clinica (NUEVO NODO)
// ══════════════════════════════════════════════════════════════════════════
console.log('\n\u2501\u2501 T03: pos_4 \u2192 info_historia_clinica \u2501\u2501');
const e2b = await latestExec();
await send('pos_4', 5000);
const e3 = await latestExec();
const msgs3 = await botMsgs(3);
check('Workflow proceso pos_4', e3 && e2b && e3.id !== e2b.id);
check('Ejecucion exitosa', e3 && e3.status === 'success');
const last3 = msgs3[msgs3.length - 1] || '';
check('Respuesta menciona historia o expediente', /historia|clinica|expediente|diagn|paciente|alergia|panel|papel/i.test(last3), last3.slice(0, 100));
console.log('  Bot: ' + last3.slice(0, 250));

// ══════════════════════════════════════════════════════════════════════════
// T04: pos_2 desde info_historia_clinica → info_seguridad
// ══════════════════════════════════════════════════════════════════════════
console.log('\n\u2501\u2501 T04: pos_2 (desde historia_clinica) \u2192 info_seguridad \u2501\u2501');
const e3b = await latestExec();
await send('pos_2', 5000);
const e4 = await latestExec();
const msgs4 = await botMsgs(3);
check('Workflow proceso pos_2', e4 && e3b && e4.id !== e3b.id);
check('Ejecucion exitosa', e4 && e4.status === 'success');
const last4 = msgs4[msgs4.length - 1] || '';
check('Respuesta menciona seguridad o datos', /seguridad|cifrad|datos|RLS|privacidad|aislad|ISO/i.test(last4), last4.slice(0, 100));
console.log('  Bot: ' + last4.slice(0, 250));

// ══════════════════════════════════════════════════════════════════════════
// T05: Reset → pos_1 → pos_5 → info_seguridad (desde como_funciona)
// ══════════════════════════════════════════════════════════════════════════
console.log('\n\u2501\u2501 T05: Reset \u2192 como_funciona \u2192 pos_5 (seguridad directa) \u2501\u2501');
await clearLabels();
await send('Hola', 7000);
await send('pos_1', 5000);  // → como_funciona
const e4b = await latestExec();
await send('pos_5', 5000);  // → info_seguridad
const e5 = await latestExec();
const msgs5 = await botMsgs(3);
check('Workflow proceso pos_5', e5 && e4b && e5.id !== e4b.id);
check('Ejecucion exitosa', e5 && e5.status === 'success');
const last5 = msgs5[msgs5.length - 1] || '';
check('Respuesta seguridad coherente', /seguridad|cifrad|datos|RLS|privacidad|aislad|ISO/i.test(last5), last5.slice(0, 100));
console.log('  Bot: ' + last5.slice(0, 200));

// ══════════════════════════════════════════════════════════════════════════
// T06: Reset → pos_2 (precios) → pos_1 (Plan Basico) — detalle incluido
// ══════════════════════════════════════════════════════════════════════════
console.log('\n\u2501\u2501 T06: Reset \u2192 precios \u2192 Plan Basico (con detalle) \u2501\u2501');
await clearLabels();
await send('Hola', 7000);
await send('pos_2', 5000);   // → precios
const e5b = await latestExec();
await send('pos_1', 5000);   // → precio_basico
const e6 = await latestExec();
const msgs6 = await botMsgs(3);
check('Workflow proceso precio_basico', e6 && e5b && e6.id !== e5b.id);
check('Ejecucion exitosa', e6 && e6.status === 'success');
const last6 = msgs6[msgs6.length - 1] || '';
check('Respuesta contiene Plan Basico y precio', /290|B.sico|conversacion|WhatsApp|panel/i.test(last6), last6.slice(0, 100));
console.log('  Bot: ' + last6.slice(0, 250));

// ══════════════════════════════════════════════════════════════════════════
// T07: Reset → pos_2 (precios) → pos_2 (Plan Pro) — detalle incluido
// ══════════════════════════════════════════════════════════════════════════
console.log('\n\u2501\u2501 T07: Reset \u2192 precios \u2192 Plan Pro (con detalle) \u2501\u2501');
await clearLabels();
await send('Hola', 7000);
await send('pos_2', 5000);   // → precios
const e6b = await latestExec();
await send('pos_2', 5000);   // → precio_pro
const e7 = await latestExec();
const msgs7 = await botMsgs(3);
check('Workflow proceso precio_pro', e7 && e6b && e7.id !== e6b.id);
check('Ejecucion exitosa', e7 && e7.status === 'success');
const last7 = msgs7[msgs7.length - 1] || '';
check('Respuesta contiene Plan Pro y diferenciadores', /490|Pro|recordatorio|reporte|popular/i.test(last7), last7.slice(0, 100));
console.log('  Bot: ' + last7.slice(0, 250));

// ══════════════════════════════════════════════════════════════════════════
// T08: INFO libre — limpieza dental (IA responde con KB)
// ══════════════════════════════════════════════════════════════════════════
console.log('\n\u2501\u2501 T08: INFO libre \u2192 cuanto cuesta limpieza dental \u2501\u2501');
await clearLabels();
await send('cuanto cuesta la limpieza dental', 8000);
const msgs8 = await botMsgs(2);
const last8 = msgs8[msgs8.length - 1] || '';
check('Bot respondio', last8.length > 20);
check('Respuesta coherente (sin basura)', !/pos_[0-9]|undefined|null|\[object|DEMO_FLOW/i.test(last8), last8.slice(0, 100));
check('Respuesta sobre precio o servicio', /precio|costo|dental|limpieza|S\//i.test(last8), last8.slice(0, 100));
console.log('  Bot: ' + last8.slice(0, 250));

// ══════════════════════════════════════════════════════════════════════════
// T09: INFO libre — doctores disponibles
// ══════════════════════════════════════════════════════════════════════════
console.log('\n\u2501\u2501 T09: INFO libre \u2192 que doctores tienen \u2501\u2501');
await send('que doctores tienen disponibles?', 7000);
const msgs9 = await botMsgs(2);
const last9 = msgs9[msgs9.length - 1] || '';
check('Bot respondio', last9.length > 10);
check('Respuesta coherente', !/undefined|null|\[object|DEMO_FLOW|pos_/i.test(last9), last9.slice(0, 100));
console.log('  Bot: ' + last9.slice(0, 200));

// ══════════════════════════════════════════════════════════════════════════
// T10: Mensaje sin sentido / catch_all
// ══════════════════════════════════════════════════════════════════════════
console.log('\n\u2501\u2501 T10: Catch-all \u2192 respuesta coherente (no loop) \u2501\u2501');
await clearLabels();
await send('Hola', 7000);
await send('pos_1', 5000);   // → como_funciona
const e9b = await latestExec();
await send('xyz123nomatch', 5000);  // mensaje que no matchea ninguna pos
const e10 = await latestExec();
const msgs10 = await botMsgs(3);
check('Workflow proceso catch_all', e10 && e9b && e10.id !== e9b.id);
check('Ejecucion exitosa', e10 && e10.status === 'success');
const last10 = msgs10[msgs10.length - 1] || '';
check('Bot no silencia — responde algo', last10.length > 5);
console.log('  Bot: ' + last10.slice(0, 150));

// ══════════════════════════════════════════════════════════════════════════
// TEARDOWN
// ══════════════════════════════════════════════════════════════════════════
await cw('POST', '/api/v1/accounts/' + ACCOUNT_ID + '/conversations/' + convId + '/toggle_status', { status: 'resolved' });
console.log('\nConversacion ' + convId + ' cerrada.');

console.log('\n\u2550'.repeat(39));
console.log('  RESULTADO: ' + passed + ' / ' + (passed + failed) + ' pasados');
if (failed > 0) console.log('  FALLADOS:  ' + failed);
console.log('\u2550'.repeat(39));
