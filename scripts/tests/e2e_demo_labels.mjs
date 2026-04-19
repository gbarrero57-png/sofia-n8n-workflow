/**
 * e2e_demo_labels.mjs — Test con labels reales de Chatwoot
 * Simula exactamente lo que Chatwoot envia en produccion:
 * lee los labels actuales de la conversacion antes de cada mensaje.
 * Run: node scripts/tests/e2e_demo_labels.mjs
 */

const N8N_BASE    = 'https://workflows.n8n.redsolucionesti.com';
const N8N_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const WEBHOOK_URL = N8N_BASE + '/webhook/chatwoot-sofia';
const CW_BASE     = 'https://chat.redsolucionesti.com';
const CW_TOKEN    = 'yypAwZDH2dV3crfbqJqWCgj1';
const ACCOUNT_ID  = 2;
const INBOX_ID    = 10;
const TEST_PHONE  = '+51977000077';
const WF_ID       = '37SLdWISQLgkHeXk';

const sleep   = ms => new Promise(r => setTimeout(r, ms));
const cw      = (method, path, body) => fetch(CW_BASE + path, {
  method,
  headers: { api_access_token: CW_TOKEN, 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined
}).then(r => r.json());
const n8nGet  = path => fetch(N8N_BASE + path, { headers: { 'X-N8N-API-KEY': N8N_API_KEY } }).then(r => r.json());

let convId = null;
let passed = 0, failed = 0;
const ok   = (l)    => { console.log('  \u2705 ' + l); passed++; };
const fail = (l, d) => { console.log('  \u274C ' + l + (d ? ' \u2014 ' + String(d).slice(0, 120) : '')); failed++; };

const latestExec = async () => {
  const d = await n8nGet('/api/v1/executions?workflowId=' + WF_ID + '&limit=1');
  return (d.data || d)[0] || null;
};

// Lee el estado REAL de la conversacion en Chatwoot
const getConvState = async () => {
  const c = await cw('GET', '/api/v1/accounts/' + ACCOUNT_ID + '/conversations/' + convId);
  return {
    labels: c.labels || [],
    attrs: c.custom_attributes || {}
  };
};

const botMsgs = async (n) => {
  const r = await cw('GET', '/api/v1/accounts/' + ACCOUNT_ID + '/conversations/' + convId + '/messages');
  return (r.payload || []).filter(m => m.message_type === 1 && !m.private).slice(-(n || 5)).map(m => m.content || '');
};

// Envia con labels/attrs REALES — igual que Chatwoot en produccion
const send = async (text, waitMs) => {
  const s = await getConvState();
  console.log('    [send "' + text + '" | labels=' + JSON.stringify(s.labels) + ']');
  const payload = {
    event: 'message_created', content: text, message_type: 'incoming',
    created_at: Math.floor(Date.now() / 1000),
    account: { id: ACCOUNT_ID },
    sender: { id: 88077, name: 'Test Labels', phone_number: TEST_PHONE },
    conversation: {
      id: convId, inbox_id: INBOX_ID, status: 'open',
      labels: s.labels,
      contact_inbox: { source_id: TEST_PHONE, inbox: { channel_type: 'Channel::TwilioSms' } },
      custom_attributes: Object.assign(
        { bot_interaction_count: 0, awaiting_slot_confirmation: 'false' },
        s.attrs
      )
    }
  };
  await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-chatwoot-signature': 'sha256=e2e-test' },
    body: JSON.stringify(payload)
  });
  await sleep(waitMs || 5500);
};

// ── SETUP ─────────────────────────────────────────────────────────────────
const sr = await cw('GET', '/api/v1/accounts/' + ACCOUNT_ID + '/contacts/search?q=' + encodeURIComponent(TEST_PHONE));
let contactId = ((Array.isArray(sr.payload) ? sr.payload : []).find(c => c.phone_number === TEST_PHONE) || {}).id;
if (!contactId) {
  const cr = await cw('POST', '/api/v1/accounts/' + ACCOUNT_ID + '/contacts', { name: 'Test Labels', phone_number: TEST_PHONE });
  contactId = cr.id;
  if (!contactId) {
    const sr2 = await cw('GET', '/api/v1/accounts/' + ACCOUNT_ID + '/contacts/search?q=' + encodeURIComponent(TEST_PHONE));
    contactId = ((Array.isArray(sr2.payload) ? sr2.payload : []).find(c => c.phone_number === TEST_PHONE) || {}).id;
  }
}
const crr = await cw('POST', '/api/v1/accounts/' + ACCOUNT_ID + '/conversations', { inbox_id: INBOX_ID, contact_id: contactId });
convId = crr.id;
console.log('Conversacion: ' + convId + '\n');

// ══════════════════════════════════════════════════════════════════════════
// T01 — Saludo → bienvenida LP4 — verifica label df_bienvenida
// ══════════════════════════════════════════════════════════════════════════
console.log('\u2501\u2501 T01: Hola \u2192 bienvenida (LP4) \u2501\u2501');
const e0 = await latestExec();
await send('Hola', 8000);
const e1 = await latestExec();
const s1 = await getConvState();
(e1 && e1.id !== e0.id)       ? ok('Workflow ejecutado')         : fail('Workflow no ejecuto');
(e1?.status === 'success')    ? ok('Ejecucion exitosa')           : fail('Fallo ejecucion', e1?.status);
const df1 = (s1.labels.find(l => l.startsWith('df_')) || '').replace('df_', '');
df1 ? ok('Label df_* seteada: ' + df1) : fail('Sin label df_* (estado no guardado)', JSON.stringify(s1.labels));

// ══════════════════════════════════════════════════════════════════════════
// T02 — pos_1 → como_funciona LP5 (5 opciones reales)
// ══════════════════════════════════════════════════════════════════════════
console.log('\n\u2501\u2501 T02: pos_1 \u2192 como_funciona (LP5) \u2501\u2501');
const e1b = await latestExec();
await send('pos_1', 5500);
const e2 = await latestExec();
const s2 = await getConvState();
(e2 && e2.id !== e1b.id)    ? ok('Workflow proceso pos_1') : fail('Workflow no ejecuto');
(e2?.status === 'success')  ? ok('Ejecucion exitosa')      : fail('Fallo', e2?.status);
const df2 = (s2.labels.find(l => l.startsWith('df_')) || '').replace('df_', '');
df2 === 'como_funciona' ? ok('Estado correcto: df_como_funciona') : fail('Estado incorrecto, esperado df_como_funciona', 'actual: df_' + df2 + ' labels=' + JSON.stringify(s2.labels));

// ══════════════════════════════════════════════════════════════════════════
// T03 — pos_4 desde como_funciona → info_historia_clinica
// ══════════════════════════════════════════════════════════════════════════
console.log('\n\u2501\u2501 T03: pos_4 \u2192 info_historia_clinica \u2501\u2501');
const e2b = await latestExec();
await send('pos_4', 5500);
const e3 = await latestExec();
const s3 = await getConvState();
(e3 && e3.id !== e2b.id)   ? ok('Workflow proceso pos_4') : fail('Workflow no ejecuto');
(e3?.status === 'success') ? ok('Ejecucion exitosa')       : fail('Fallo', e3?.status);
const df3 = (s3.labels.find(l => l.startsWith('df_')) || '').replace('df_', '');
df3 === 'info_historia_clinica' ? ok('Estado correcto: df_info_historia_clinica') : fail('Estado incorrecto', 'actual: df_' + df3 + ' labels=' + JSON.stringify(s3.labels));
const msgs3 = await botMsgs(3);
const last3 = msgs3[msgs3.length - 1] || '';
console.log('  Bot: ' + last3.slice(0, 220));
/historia|clinica|expediente|diagn|paciente|alergia|panel|papel/i.test(last3) ? ok('Contenido correcto sobre historia clinica') : fail('Respuesta no menciona historia clinica', last3.slice(0, 100));

// ══════════════════════════════════════════════════════════════════════════
// T04 — pos_2 desde historia_clinica → info_seguridad
// ══════════════════════════════════════════════════════════════════════════
console.log('\n\u2501\u2501 T04: pos_2 (desde historia) \u2192 info_seguridad \u2501\u2501');
const e3b = await latestExec();
await send('pos_2', 5500);
const e4 = await latestExec();
const s4 = await getConvState();
(e4 && e4.id !== e3b.id)   ? ok('Workflow proceso pos_2') : fail('Workflow no ejecuto');
(e4?.status === 'success') ? ok('Ejecucion exitosa')       : fail('Fallo', e4?.status);
const df4 = (s4.labels.find(l => l.startsWith('df_')) || '').replace('df_', '');
df4 === 'info_seguridad' ? ok('Estado correcto: df_info_seguridad') : fail('Estado incorrecto', 'actual: df_' + df4);
const msgs4 = await botMsgs(3);
const last4 = msgs4[msgs4.length - 1] || '';
console.log('  Bot: ' + last4.slice(0, 220));
/seguridad|cifrad|datos|RLS|privacidad|aislad|ISO/i.test(last4) ? ok('Contenido correcto sobre seguridad') : fail('Respuesta no menciona seguridad', last4.slice(0, 100));

// ══════════════════════════════════════════════════════════════════════════
// T05 — pos_3 desde info_seguridad → volver a como_funciona
// ══════════════════════════════════════════════════════════════════════════
console.log('\n\u2501\u2501 T05: pos_3 (volver) \u2192 como_funciona \u2501\u2501');
const e4b = await latestExec();
await send('pos_3', 5500);
const e5 = await latestExec();
const s5 = await getConvState();
(e5 && e5.id !== e4b.id)   ? ok('Workflow proceso pos_3') : fail('Workflow no ejecuto');
(e5?.status === 'success') ? ok('Ejecucion exitosa')       : fail('Fallo', e5?.status);
const df5 = (s5.labels.find(l => l.startsWith('df_')) || '').replace('df_', '');
df5 === 'como_funciona' ? ok('Volvio a df_como_funciona correctamente') : fail('Estado incorrecto', 'actual: df_' + df5 + ' labels=' + JSON.stringify(s5.labels));

// ══════════════════════════════════════════════════════════════════════════
// T06 — pos_5 desde como_funciona → info_seguridad (ruta directa LP5)
// ══════════════════════════════════════════════════════════════════════════
console.log('\n\u2501\u2501 T06: pos_5 (desde como_funciona) \u2192 info_seguridad \u2501\u2501');
const e5b = await latestExec();
await send('pos_5', 5500);
const e6 = await latestExec();
const s6 = await getConvState();
(e6 && e6.id !== e5b.id)   ? ok('Workflow proceso pos_5') : fail('Workflow no ejecuto');
(e6?.status === 'success') ? ok('Ejecucion exitosa')       : fail('Fallo', e6?.status);
const df6 = (s6.labels.find(l => l.startsWith('df_')) || '').replace('df_', '');
df6 === 'info_seguridad' ? ok('pos_5 navego a df_info_seguridad') : fail('Estado incorrecto para pos_5', 'actual: df_' + df6 + ' labels=' + JSON.stringify(s6.labels));

// ══════════════════════════════════════════════════════════════════════════
// T07 — Reset → precios → pos_1 → precio_basico con detalle
// ══════════════════════════════════════════════════════════════════════════
console.log('\n\u2501\u2501 T07: Reset \u2192 precios \u2192 pos_1 \u2192 precio_basico \u2501\u2501');
await send('Hola', 7000);
const e6b = await latestExec();
await send('pos_2', 5500);   // bienvenida → precios
const e7a = await latestExec();
const s7a = await getConvState();
const df7a = (s7a.labels.find(l => l.startsWith('df_')) || '').replace('df_', '');
df7a === 'precios' ? ok('Estado df_precios') : fail('Estado incorrecto', 'actual: df_' + df7a);
await send('pos_1', 5500);   // precios → precio_basico
const e7 = await latestExec();
const s7 = await getConvState();
(e7 && e7.id !== e7a.id)   ? ok('Workflow proceso pos_1 (precio_basico)') : fail('Workflow no ejecuto');
(e7?.status === 'success') ? ok('Ejecucion exitosa')                       : fail('Fallo', e7?.status);
const df7 = (s7.labels.find(l => l.startsWith('df_')) || '').replace('df_', '');
df7 === 'precio_basico' ? ok('Estado df_precio_basico') : fail('Estado incorrecto', 'actual: df_' + df7);
const msgs7 = await botMsgs(3);
const last7 = msgs7[msgs7.length - 1] || '';
console.log('  Bot: ' + last7.slice(0, 250));
/290|B.sico|conversacion|WhatsApp|panel|historia/i.test(last7) ? ok('Contenido Plan Basico con detalle') : fail('Respuesta no menciona Plan Basico', last7.slice(0, 100));

// ══════════════════════════════════════════════════════════════════════════
// T08 — texto libre en medio del demo → INFO coherente (no rompe estado)
// ══════════════════════════════════════════════════════════════════════════
console.log('\n\u2501\u2501 T08: Texto libre INFO (no botones) \u2192 respuesta coherente \u2501\u2501');
await send('Hola', 7000);   // reset
await send('pos_1', 5500);  // como_funciona
await send('cuanto cuesta la limpieza dental', 7000);
const msgs8 = await botMsgs(2);
const last8 = msgs8[msgs8.length - 1] || '';
console.log('  Bot: ' + last8.slice(0, 200));
last8.length > 15                                             ? ok('Bot respondio a INFO libre')         : fail('Sin respuesta');
!/pos_[0-9]|undefined|null|\[object|DEMO_FLOW/i.test(last8) ? ok('Respuesta coherente (sin basura)')    : fail('Basura en respuesta', last8.slice(0, 80));

// ══════════════════════════════════════════════════════════════════════════
// TEARDOWN
// ══════════════════════════════════════════════════════════════════════════
await cw('POST', '/api/v1/accounts/' + ACCOUNT_ID + '/conversations/' + convId + '/toggle_status', { status: 'resolved' });
console.log('\nConversacion ' + convId + ' cerrada.\n');

const line = '\u2550'.repeat(39);
console.log(line);
console.log('  RESULTADO: ' + passed + ' / ' + (passed + failed) + ' pasados');
if (failed > 0) console.log('  FALLADOS:  ' + failed);
console.log(line);
