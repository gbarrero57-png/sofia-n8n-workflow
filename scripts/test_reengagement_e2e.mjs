/**
 * test_reengagement_e2e.mjs
 * E2E test del sistema de Re-engagement Reminders
 *
 * Pasos:
 *   1. Obtener datos reales (clínica, account_id)
 *   2. Insertar conversación de prueba con last_activity_at = 2h atrás
 *   3. Insertar conversation_metrics con CREATE_EVENT, booked=false
 *   4. Llamar get_conversations_to_reengage() → debe devolver la conv como R1
 *   5. Simular build de mensaje (lógica del Code node)
 *   6. Llamar mark_reengagement_sent() → verificar fila creada
 *   7. Llamar stop_reengagement() → verificar stopped=true
 *   8. Limpiar datos de prueba
 */

import fs from 'fs';

const KEY = fs.readFileSync('saas/.env', 'utf8').match(/SUPABASE_SERVICE_KEY=(.+)/)[1].trim();
const BASE = 'https://inhyrrjidhzrbqecnptn.supabase.co';

const TEST_CONV_ID = '99991';  // ID Chatwoot ficticio (no existe en producción)
const PASS = '\x1b[32m✅ PASS\x1b[0m';
const FAIL = '\x1b[31m❌ FAIL\x1b[0m';
const INFO = '\x1b[36mℹ\x1b[0m ';

let passed = 0;
let failed = 0;

function assert(condition, label, detail = '') {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

async function sb(path, method = 'GET', body = null, prefer = '') {
  const headers = {
    'apikey': KEY,
    'Authorization': `Bearer ${KEY}`,
    'Content-Type': 'application/json'
  };
  if (prefer) headers['Prefer'] = prefer;
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  return { status: r.status, data: text ? JSON.parse(text) : null };
}

async function rpc(func, params = {}) {
  const r = await fetch(`${BASE}/rest/v1/rpc/${func}`, {
    method: 'POST',
    headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  const text = await r.text();
  return { status: r.status, data: text ? JSON.parse(text) : null };
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n\x1b[1m══════════════════════════════════════════════════════\x1b[0m');
console.log('\x1b[1m  SofIA Re-engagement — Test E2E\x1b[0m');
console.log('\x1b[1m══════════════════════════════════════════════════════\x1b[0m\n');

// ── Paso 1: Obtener clínica real ──────────────────────────────────────────────
console.log('[1/8] Obteniendo clínica de prueba...');
const clinicRes = await sb('/rest/v1/clinics?select=id,name,chatwoot_account_id,chatwoot_inbox_id&active=eq.true&limit=1');
assert(clinicRes.status === 200 && clinicRes.data?.length > 0, 'Clínica obtenida');
const clinic = clinicRes.data[0];
console.log(`  ${INFO} Usando: ${clinic.name} (${clinic.id})`);

// ── Paso 2: Insertar conversación de prueba ───────────────────────────────────
console.log('\n[2/8] Insertando conversación de prueba...');

// Borrar si ya existe de un test anterior
await sb(`/rest/v1/conversations?clinic_id=eq.${clinic.id}&chatwoot_conversation_id=eq.${TEST_CONV_ID}`, 'DELETE');
await sb(`/rest/v1/conversation_metrics?clinic_id=eq.${clinic.id}&conversation_id=eq.${TEST_CONV_ID}`, 'DELETE');
await sb(`/rest/v1/reengagement_reminders?clinic_id=eq.${clinic.id}&chatwoot_conversation_id=eq.${TEST_CONV_ID}`, 'DELETE');

const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

const convRes = await sb('/rest/v1/conversations', 'POST',
  {
    clinic_id: clinic.id,
    chatwoot_conversation_id: TEST_CONV_ID,
    patient_name: 'Paciente Test E2E',
    status: 'active',
    bot_paused: false,
    last_message: 'Quiero agendar una cita',
    last_activity_at: twoHoursAgo
  },
  'return=representation'
);
assert(convRes.status === 201, 'Conversación insertada', convRes.status);

// ── Paso 3: Insertar conversation_metrics ─────────────────────────────────────
console.log('\n[3/8] Insertando conversation_metrics...');
const metricsRes = await sb('/rest/v1/conversation_metrics', 'POST',
  {
    clinic_id: clinic.id,
    conversation_id: parseInt(TEST_CONV_ID),
    intent: 'CREATE_EVENT',
    booked: false,
    escalated: false,
    message_count: 4,
    phase_reached: 3
  },
  'return=representation'
);
assert(metricsRes.status === 201, 'conversation_metrics insertado', metricsRes.status);

// ── Paso 4: get_conversations_to_reengage() ────────────────────────────────────
console.log('\n[4/8] Llamando get_conversations_to_reengage()...');
const reengageRes = await rpc('get_conversations_to_reengage');
assert(reengageRes.status === 200, `RPC responde 200`, reengageRes.status);

const found = Array.isArray(reengageRes.data)
  ? reengageRes.data.find(c => c.chatwoot_conversation_id === TEST_CONV_ID)
  : null;
assert(!!found, 'Conversación de prueba detectada como abandonada');
if (found) {
  assert(found.reminder_type === 'R1', `reminder_type = R1 (got: ${found.reminder_type})`);
  assert(found.chatwoot_account_id === clinic.chatwoot_account_id, `chatwoot_account_id correcto (${found.chatwoot_account_id})`);
  assert(found.clinic_name === clinic.name, `clinic_name correcto (${found.clinic_name})`);
  console.log(`  ${INFO} Total conversaciones detectadas: ${reengageRes.data.length}`);
}

// ── Paso 5: Simular build de mensaje ─────────────────────────────────────────
console.log('\n[5/8] Simulando construcción del mensaje R1...');
const patientName = found?.patient_name || 'Paciente Test E2E';
const firstName = patientName.split(' ')[0];

// Simular slots (como si vinieran de nota privada SOFIA_SLOTS en Chatwoot)
const mockSlots = [
  { label: 'Martes 9 de abril — 10:00am' },
  { label: 'Miércoles 10 de abril — 3:00pm' },
  { label: 'Jueves 11 de abril — 11:30am' }
];
const slotLines = mockSlots.map((s, i) => `⏰ Opción ${i+1}: ${s.label}`).join('\n');
const message = `Hola ${firstName}! 👋\n\nNotamos que no terminaste de elegir tu horario para tu cita 🦷\n\nAquí están las opciones que tenías disponibles:\n${slotLines}\n\nResponde con el número de tu opción preferida y listo 😊`;

assert(message.includes('Hola Paciente'), 'Mensaje incluye nombre del paciente');
assert(message.includes('Opción 1'), 'Mensaje incluye slots re-ofrecidos');
assert(message.length > 50 && message.length < 1024, `Longitud del mensaje OK (${message.length} chars)`);
console.log(`  ${INFO} Mensaje generado:\n\x1b[90m${message.split('\n').map(l=>'      '+l).join('\n')}\x1b[0m`);

// ── Paso 6: mark_reengagement_sent() ──────────────────────────────────────────
console.log('\n[6/8] Llamando mark_reengagement_sent(R1)...');
const markRes = await rpc('mark_reengagement_sent', {
  p_clinic_id: clinic.id,
  p_chatwoot_conversation_id: TEST_CONV_ID,
  p_chatwoot_account_id: clinic.chatwoot_account_id,
  p_chatwoot_inbox_id: clinic.chatwoot_inbox_id,
  p_patient_name: 'Paciente Test E2E',
  p_phone: '+51999999999',
  p_reminder_type: 'R1'
});
assert(markRes.status === 200, `mark_reengagement_sent R1 responde 200`, markRes.status);

// Verificar fila creada
const rowRes = await sb(`/rest/v1/reengagement_reminders?clinic_id=eq.${clinic.id}&chatwoot_conversation_id=eq.${TEST_CONV_ID}&select=*`);
const row = rowRes.data?.[0];
assert(!!row, 'Fila reengagement_reminders creada');
if (row) {
  assert(row.reminder_1_sent === true, `reminder_1_sent = true (got: ${row.reminder_1_sent})`);
  assert(row.reminder_2_sent === false, `reminder_2_sent = false (got: ${row.reminder_2_sent})`);
  assert(row.stopped === false, `stopped = false todavía (got: ${row.stopped})`);
  assert(!!row.reminder_1_sent_at, `reminder_1_sent_at seteado`);
}

// Verificar que ya NO aparece en R1 pero sí en R2 si aplicara
console.log('\n[7/8] Verificando que R1 ya no se re-envía...');
const reengageRes2 = await rpc('get_conversations_to_reengage');
const foundAgain = Array.isArray(reengageRes2.data)
  ? reengageRes2.data.find(c => c.chatwoot_conversation_id === TEST_CONV_ID)
  : null;
assert(!foundAgain, 'Conversación ya NO aparece para R1 después de marcar enviado');

// ── Paso 7: stop_reengagement() ───────────────────────────────────────────────
console.log('\n[7/8] Llamando stop_reengagement(booked)...');
const stopRes = await rpc('stop_reengagement', {
  p_clinic_id: clinic.id,
  p_chatwoot_conversation_id: TEST_CONV_ID,
  p_reason: 'booked'
});
assert(stopRes.status === 200 || stopRes.status === 204, `stop_reengagement responde 200/204 (got: ${stopRes.status})`);

const rowAfterStop = (await sb(`/rest/v1/reengagement_reminders?clinic_id=eq.${clinic.id}&chatwoot_conversation_id=eq.${TEST_CONV_ID}&select=*`)).data?.[0];
assert(rowAfterStop?.stopped === true, `stopped = true después de stop_reengagement`);
assert(rowAfterStop?.stopped_reason === 'booked', `stopped_reason = 'booked' (got: ${rowAfterStop?.stopped_reason})`);
assert(!!rowAfterStop?.stopped_at, `stopped_at seteado`);

// ── Paso 8: Limpieza ───────────────────────────────────────────────────────────
console.log('\n[8/8] Limpiando datos de prueba...');
await sb(`/rest/v1/reengagement_reminders?clinic_id=eq.${clinic.id}&chatwoot_conversation_id=eq.${TEST_CONV_ID}`, 'DELETE');
await sb(`/rest/v1/conversation_metrics?clinic_id=eq.${clinic.id}&conversation_id=eq.${TEST_CONV_ID}`, 'DELETE');
await sb(`/rest/v1/conversations?clinic_id=eq.${clinic.id}&chatwoot_conversation_id=eq.${TEST_CONV_ID}`, 'DELETE');

// Verificar limpieza
const leftover = await sb(`/rest/v1/conversations?clinic_id=eq.${clinic.id}&chatwoot_conversation_id=eq.${TEST_CONV_ID}&select=id`);
assert(leftover.data?.length === 0, 'Datos de prueba eliminados correctamente');

// ── Resultado ─────────────────────────────────────────────────────────────────
console.log('\n\x1b[1m══════════════════════════════════════════════════════\x1b[0m');
const total = passed + failed;
if (failed === 0) {
  console.log(`\x1b[32m\x1b[1m  ✅ ${passed}/${total} tests pasaron — Sistema OK\x1b[0m`);
} else {
  console.log(`\x1b[31m\x1b[1m  ❌ ${failed} fallo(s) / ${passed} ok — Revisar arriba\x1b[0m`);
}
console.log('\x1b[1m══════════════════════════════════════════════════════\x1b[0m\n');

process.exit(failed > 0 ? 1 : 0);
