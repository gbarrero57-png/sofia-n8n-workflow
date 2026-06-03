/**
 * e2e_demo_responses.mjs — E2E respuestas bot RST multi-producto
 *
 * Suite D — Booking SofIA completo (rst_sofia → sofia_demo → nombre → empresa → WA count → slot)
 * Suite R — REMAJU Monitor (info + prueba gratis)
 * Suite P — GeneradorPreU (info + probar bot)
 * Suite I — Flujos informativos SofIA (precios, agenda, CRM, experto)
 * Suite F — Filtros (outgoing, texto basura → RST bienvenida)
 *
 * Run: node scripts/tests/e2e_demo_responses.mjs
 */

const N8N_API_KEY    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const N8N_BASE       = 'https://workflows.n8n.redsolucionesti.com';
const WEBHOOK_URL    = N8N_BASE + '/webhook/chatwoot-sofia';
const CHATWOOT_BASE  = 'https://chat.redsolucionesti.com';
const CHATWOOT_TOKEN = 'yypAwZDH2dV3crfbqJqWCgj1';
const SUPABASE_URL   = 'https://inhyrrjidhzrbqecnptn.supabase.co';
const SUPABASE_KEY   = 'sb_secret_jpzMd6yUKtpWTUnQZb44mA_5PmOZDQ3';
const ACCOUNT_ID     = 2;
const INBOX_ID       = 19;
const TEST_PHONE     = '+51977000055';
const TEST_NAME      = 'E2E RST Demo';
const WF_ID          = '37SLdWISQLgkHeXk';
const DEMO_CLINIC_ID = 'c6c15fca-d7fc-4d98-83c1-2c5cb5a6bef1';

const sleep = ms => new Promise(r => setTimeout(r, ms));

const cw = async (method, path, body) => {
  const r = await fetch(CHATWOOT_BASE + path, {
    method,
    headers: { api_access_token: CHATWOOT_TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { _raw: text, _status: r.status }; }
};

const sb = (method, path, body) => fetch(SUPABASE_URL + path, {
  method,
  headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY,
             'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: body ? JSON.stringify(body) : undefined,
}).then(r => r.json()).catch(() => []);

let convId    = null;
let contactId = null;
let passed    = 0;
let failed    = 0;

const check = (label, ok, detail) => {
  if (ok) { console.log('  ✅ ' + label); passed++; }
  else     { console.log('  ❌ ' + label + (detail ? ' — ' + detail : '')); failed++; }
};

// ── n8n ──────────────────────────────────────────────────────────────────────
const latestRealExec = async () => {
  const d = await fetch(N8N_BASE + '/api/v1/executions?workflowId=' + WF_ID + '&limit=5', {
    headers: { 'X-N8N-API-KEY': N8N_API_KEY },
  }).then(r => r.json()).catch(() => ({ data: [] }));
  for (const e of (d.data || d)) {
    const full = await fetch(N8N_BASE + '/api/v1/executions/' + e.id + '?includeData=true', {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY },
    }).then(r => r.json()).catch(() => ({}));
    const nodes = Object.keys(full.data?.resultData?.runData || {});
    if (nodes.length > 5) {
      const demoResp = full.data?.resultData?.runData?.['Responder Demo']?.[0]
                           ?.data?.main?.[0]?.[0]?.json?.demo_response || null;
      return { id: e.id, status: e.status, nodes, demoResp };
    }
  }
  return null;
};

// ── Chatwoot ──────────────────────────────────────────────────────────────────
const getDemoState = async () => {
  if (!convId) return {};
  const msgs  = await cw('GET', `/api/v1/accounts/${ACCOUNT_ID}/conversations/${convId}/messages`);
  const notes = (msgs.payload || []).filter(m => m.private && m.content?.startsWith('DEMO_STATE:'));
  if (!notes.length) return {};
  try { return JSON.parse(notes[notes.length - 1].content.slice('DEMO_STATE:'.length)); }
  catch { return {}; }
};

const getPrivateNotes = async () => {
  if (!convId) return [];
  const msgs = await cw('GET', `/api/v1/accounts/${ACCOUNT_ID}/conversations/${convId}/messages`);
  return (msgs.payload || []).filter(m => m.private && m.content && !m.content.startsWith('DEMO_STATE:'));
};

// ── Webhook ───────────────────────────────────────────────────────────────────
const mkPayload = (text, btnId) => {
  const p = {
    event: 'message_created', content: text, message_type: 'incoming',
    created_at: Math.floor(Date.now() / 1000),
    account: { id: ACCOUNT_ID },
    sender: { id: contactId, name: TEST_NAME, phone_number: TEST_PHONE },
    conversation: {
      id: convId, inbox_id: INBOX_ID, status: 'open', labels: [],
      contact_inbox: { source_id: TEST_PHONE.replace('+',''), inbox: { channel_type: 'Channel::Whatsapp' } },
      custom_attributes: {},
    },
  };
  if (btnId) p.content_attributes = { interactive: { button_reply: { id: btnId, title: text } } };
  return p;
};

const send = async (text, btnId, waitMs = 9000) => {
  const e0 = await latestRealExec();
  await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-chatwoot-signature': 'sha256=e2e-test' },
    body: JSON.stringify(mkPayload(text, btnId)),
  }).catch(() => {});
  await sleep(waitMs);
  let e1 = await latestRealExec();
  if (e1 && e0 && e1.id === e0.id) { await sleep(5000); e1 = await latestRealExec(); }
  return { triggered: !!(e1 && e0 && e1.id !== e0.id), exec: e1 };
};

// ── Setup / Teardown ──────────────────────────────────────────────────────────
const setup = async () => {
  const sr = await cw('GET', `/api/v1/accounts/${ACCOUNT_ID}/contacts/search?q=${encodeURIComponent(TEST_PHONE)}`);
  contactId = (sr.payload || []).find(c => c.phone_number === TEST_PHONE)?.id || null;
  if (!contactId) {
    const cr = await cw('POST', `/api/v1/accounts/${ACCOUNT_ID}/contacts`, { name: TEST_NAME, phone_number: TEST_PHONE });
    contactId = cr.id || cr.payload?.id || null;
  }
  if (!contactId) throw new Error('No se pudo obtener contactId');
  const cr2 = await cw('POST', `/api/v1/accounts/${ACCOUNT_ID}/conversations`, { inbox_id: INBOX_ID, contact_id: contactId });
  convId = cr2.id || cr2.payload?.id || null;
  if (!convId) throw new Error('No se pudo crear conversación');
  console.log(`Contact: ${contactId} | Conversation: ${convId}\n`);
};

const newConv = async () => {
  await cw('POST', `/api/v1/accounts/${ACCOUNT_ID}/conversations/${convId}/toggle_status`, { status: 'resolved' });
  const cr = await cw('POST', `/api/v1/accounts/${ACCOUNT_ID}/conversations`, { inbox_id: INBOX_ID, contact_id: contactId });
  convId = cr.id || cr.payload?.id || null;
  console.log(`  (Nueva conv: ${convId})\n`);
};

const teardown = async (appointmentId) => {
  if (appointmentId) {
    await fetch(SUPABASE_URL + `/rest/v1/appointments?id=eq.${appointmentId}`, {
      method: 'DELETE', headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
    }).catch(() => {});
    console.log(`\nCita ${appointmentId} eliminada.`);
  }
  if (convId) {
    await cw('POST', `/api/v1/accounts/${ACCOUNT_ID}/conversations/${convId}/toggle_status`, { status: 'resolved' });
    console.log(`Conversación ${convId} cerrada.`);
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// SUITE D — Booking SofIA completo vía RST menu
// ══════════════════════════════════════════════════════════════════════════════
const runBookingFlow = async () => {
  let appointmentId = null;

  console.log('\n━━ D01: Texto "hola" → RST bienvenida (via Enviar Menu Chatwoot) ━━');
  const d0 = await send('hola', null, 13000);
  const d0nodes = d0.exec?.nodes || [];
  console.log(`  Exec #${d0.exec?.id} | nodes: ${d0nodes.slice(-3).join(' → ')}`);
  // "hola" → GREETING path → Generar Texto Menu → Enviar Menu Chatwoot (not Responder Demo)
  check('Ejecución exitosa',               d0.exec?.status === 'success', d0.exec?.status);
  check('Envía menú RST (Enviar Menu Chatwoot)', d0nodes.includes('Enviar Menu Chatwoot'), d0nodes.join(','));

  console.log('\n━━ D02: Botón rst_sofia → SofIA features ━━');
  const d1 = await send('SofIA Dent', 'rst_sofia', 9000);
  console.log(`  Exec #${d1.exec?.id} | demo_response: ${d1.exec?.demoResp}`);
  check('demo_response = que_es_sofia',    d1.exec?.demoResp === 'que_es_sofia', d1.exec?.demoResp);

  console.log('\n━━ D03: Botón sofia_demo → pide nombre ━━');
  const d2 = await send('Agendar demo', 'sofia_demo', 9000);
  const s2  = await getDemoState();
  console.log(`  Exec #${d2.exec?.id} | demo_response: ${d2.exec?.demoResp} | state: ${JSON.stringify(s2)}`);
  check('demo_response = ask_name',        d2.exec?.demoResp === 'ask_name', d2.exec?.demoResp);
  check('Estado = awaiting_name',          s2.demo_step === 'awaiting_name', s2.demo_step);

  console.log('\n━━ D04: Nombre ━━');
  const d3 = await send('Ana Torres', null, 9000);
  const s3  = await getDemoState();
  console.log(`  Estado: ${JSON.stringify(s3)}`);
  check('demo_response = collected_name',  d3.exec?.demoResp === 'collected_name', d3.exec?.demoResp);
  check('demo_name capturado',             s3.demo_name?.includes('Ana'), s3.demo_name);

  console.log('\n━━ D05: Empresa ━━');
  const d4 = await send('Dental San Marcos', null, 9000);
  const s4  = await getDemoState();
  check('demo_response = collected_company', d4.exec?.demoResp === 'collected_company', d4.exec?.demoResp);
  check('demo_company capturado',            s4.demo_company?.includes('San Marcos'), s4.demo_company);

  console.log('\n━━ D06: WA count → slots ━━');
  const d5 = await send('Solo 1 número', 'wa_count_1', 11000);
  const s5  = await getDemoState();
  const slots = s5.demo_slots ? s5.demo_slots.split(';;;') : [];
  console.log(`  Slots: ${slots.length} | demo_response: ${d5.exec?.demoResp}`);
  check('demo_response = show_slots',      d5.exec?.demoResp === 'show_slots', d5.exec?.demoResp);
  check('>=3 slots disponibles',           slots.length >= 3, `${slots.length}`);

  console.log('\n━━ D07: Selecciona slot → booking en Supabase ━━');
  const d6 = await send(slots[0]?.split('|||')[1] || 'slot 0', 'slot_0', 12000);
  const s6  = await getDemoState();
  appointmentId = s6.demo_appointment_id || null;
  check('demo_response = confirmed',       d6.exec?.demoResp === 'confirmed', d6.exec?.demoResp);
  check('Estado = demo_confirmed',         s6.demo_step === 'demo_confirmed', s6.demo_step);
  if (appointmentId) {
    const appt = await sb('GET', `/rest/v1/appointments?id=eq.${appointmentId}&select=service,status,clinic_id`);
    const a = Array.isArray(appt) ? appt[0] : null;
    console.log(`  Appointment: service=${a?.service} status=${a?.status}`);
    check('service = demo_sofia',          a?.service === 'demo_sofia', a?.service);
    check('status = confirmed',            a?.status === 'confirmed', a?.status);
  } else {
    check('demo_appointment_id presente',  false, 'null');
  }
  const notes = await getPrivateNotes();
  check('Nota DEMO AGENDADA en Chatwoot', notes.some(n => n.content?.includes('AGENDADA')));

  return appointmentId;
};

// ══════════════════════════════════════════════════════════════════════════════
// SUITE R — REMAJU Monitor
// ══════════════════════════════════════════════════════════════════════════════
const runREMAJU = async () => {
  await newConv();

  console.log('\n━━ R01: Botón rst_remaju → info REMAJU ━━');
  const r1 = await send('REMAJU Monitor', 'rst_remaju', 9000);
  console.log(`  Exec #${r1.exec?.id} | demo_response: ${r1.exec?.demoResp}`);
  check('demo_response = remaju_info',      r1.exec?.demoResp === 'remaju_info', r1.exec?.demoResp);

  console.log('\n━━ R02: Botón remaju_prueba → link Telegram ━━');
  const r2 = await send('Prueba gratis 7 días', 'remaju_prueba', 9000);
  console.log(`  demo_response: ${r2.exec?.demoResp}`);
  check('demo_response = remaju_prueba',    r2.exec?.demoResp === 'remaju_prueba', r2.exec?.demoResp);

  console.log('\n━━ R03: Texto "remate judicial" → REMAJU ━━');
  const r3 = await send('me interesan los remates judiciales', null, 9000);
  console.log(`  demo_response: ${r3.exec?.demoResp}`);
  check('demo_response = remaju_info',      r3.exec?.demoResp === 'remaju_info', r3.exec?.demoResp);
};

// ══════════════════════════════════════════════════════════════════════════════
// SUITE P — GeneradorPreU
// ══════════════════════════════════════════════════════════════════════════════
const runPreU = async () => {
  await newConv();

  console.log('\n━━ P01: Botón rst_preu → info GeneradorPreU ━━');
  const p1 = await send('GeneradorPreU', 'rst_preu', 9000);
  console.log(`  Exec #${p1.exec?.id} | demo_response: ${p1.exec?.demoResp}`);
  check('demo_response = preu_info',        p1.exec?.demoResp === 'preu_info', p1.exec?.demoResp);

  console.log('\n━━ P02: Botón preu_probar → link Telegram ━━');
  const p2 = await send('Probar el bot', 'preu_probar', 9000);
  console.log(`  demo_response: ${p2.exec?.demoResp}`);
  check('demo_response = preu_probar',      p2.exec?.demoResp === 'preu_probar', p2.exec?.demoResp);
};

// ══════════════════════════════════════════════════════════════════════════════
// SUITE I — Flujos informativos SofIA + escalación
// ══════════════════════════════════════════════════════════════════════════════
const runInfoFlows = async () => {
  await newConv();

  console.log('\n━━ I01: Texto "precios" → handlePrecios ━━');
  const i1 = await send('cuanto cuestan los planes', null, 9000);
  check('demo_response = precios',          i1.exec?.demoResp === 'precios', i1.exec?.demoResp);

  console.log('\n━━ I02: Botón sofia_agenda → handleAgendamiento ━━');
  const i2 = await send('Agendamiento', 'sofia_agenda', 9000);
  check('demo_response = agendamiento',     i2.exec?.demoResp === 'agendamiento', i2.exec?.demoResp);

  console.log('\n━━ I03: Botón sofia_crm → handleCRM ━━');
  const i3 = await send('CRM', 'sofia_crm', 9000);
  check('demo_response = crm',              i3.exec?.demoResp === 'crm', i3.exec?.demoResp);

  console.log('\n━━ I04: Botón rst_asesor → escalación humano ━━');
  const i4 = await send('Hablar con el equipo', 'rst_asesor', 9000);
  check('demo_response = escalated_to_human', i4.exec?.demoResp === 'escalated_to_human', i4.exec?.demoResp);
};

// ══════════════════════════════════════════════════════════════════════════════
// SUITE F — Filtros y fallback
// ══════════════════════════════════════════════════════════════════════════════
const runFilters = async () => {
  await newConv();

  console.log('\n━━ F01: Outgoing → filtrado ━━');
  const e0 = await latestRealExec();
  const outP = mkPayload('mensaje del bot', null);
  outP.message_type = 'outgoing';
  await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-chatwoot-signature': 'sha256=e2e-test' },
    body: JSON.stringify(outP),
  }).catch(() => {});
  await sleep(6000);
  const e1 = await latestRealExec();
  check('Outgoing filtrado',               !e1 || e0?.id === e1?.id || e1.nodes.length <= 3);

  console.log('\n━━ F02: Texto basura → RST bienvenida (sin crash) ━━');
  const f2 = await send('qwxzptvmnbhkjf9987', null, 9000);
  console.log(`  status: ${f2.exec?.status} | demo_response: ${f2.exec?.demoResp}`);
  check('Ejecución exitosa (sin crash)',   f2.exec?.status === 'success', f2.exec?.status);
  check('demo_response = rst_bienvenida', f2.exec?.demoResp === 'rst_bienvenida', f2.exec?.demoResp);
};

// ── MAIN ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('═══════════════════════════════════════════════════');
  console.log('  RST Multi-Producto E2E — Respuestas del bot');
  console.log('  D(booking) R(REMAJU) P(PreU) I(info) F(filtros)');
  console.log('═══════════════════════════════════════════════════');

  let appointmentId = null;
  try {
    await setup();
    appointmentId = await runBookingFlow();
    await runREMAJU();
    await runPreU();
    await runInfoFlows();
    await runFilters();
  } catch (e) {
    console.error('\nError fatal:', e.message, e.stack);
  } finally {
    await teardown(appointmentId);
  }

  const total = passed + failed;
  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  RESULTADO: ${passed} / ${total} tests pasados`);
  if (failed > 0) console.log(`  FALLADOS:  ${failed}`);
  console.log('═══════════════════════════════════════════════════');
  process.exit(failed > 0 ? 1 : 0);
})();
