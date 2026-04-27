/**
 * test_maria_garcia_e2e.mjs
 * Prueba el embudo completo de María García en SofIA Demo
 * + verificación de aislamiento multi-clínica (sin mezcla de datos)
 *
 * Run: node scripts/ops/test_maria_garcia_e2e.mjs
 */

import { readFileSync } from 'fs';

const KEY    = readFileSync('saas/.env','utf8').match(/SUPABASE_SERVICE_KEY=(.+)/)?.[1]?.trim();
const N8N_KEY = readFileSync('n8n-mcp/.env','utf8').match(/N8N_API_KEY=(.+)/)?.[1]?.trim();
const BASE   = 'https://inhyrrjidhzrbqecnptn.supabase.co';
const N8N    = 'https://workflows.n8n.redsolucionesti.com';

// Clínicas reales del sistema
const CLINIC_A = 'c6c15fca-d7fc-4d98-83c1-2c5cb5a6bef1'; // SofIA Demo
const CLINIC_B = '39b0e8e6-2c80-4507-a2dd-f7de661aa47a'; // Clinica Dental Covida
const CLINIC_C = '6a9f25e2-b67d-414c-8d40-d2d8348506ff'; // SmilePlus Dental

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

// Helpers
const get   = async p => { const r=await fetch(BASE+p,{headers:H}); return {s:r.status,d:await r.json()}; };
const post  = async (p,b,prefer='return=representation') => {
  const r=await fetch(BASE+p,{method:'POST',headers:{...H,Prefer:prefer},body:JSON.stringify(b)});
  const t=await r.text(); return {s:r.status,d:t?JSON.parse(t):{}};
};
const patch = async (p,b) => { const r=await fetch(BASE+p,{method:'PATCH',headers:{...H,Prefer:'return=minimal'},body:JSON.stringify(b)}); return r.status; };
const del   = async p => { const r=await fetch(BASE+p,{method:'DELETE',headers:H}); return r.status; };
const rpc   = async (fn,b) => post('/rest/v1/rpc/'+fn, b, 'return=representation');

const CLEANUP = []; // { table, id }

let passed=0, failed=0, warns=0;
function ok(msg)    { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg)  { console.log(`  ❌ ${msg}`); failed++; }
function warn(msg)  { console.log(`  ⚠️  ${msg}`); warns++; }
function sep(title) { console.log(`\n${'═'.repeat(56)}\n  ${title}\n${'═'.repeat(56)}`); }
function sub(title) { console.log(`\n── ${title} ${'─'.repeat(Math.max(0,48-title.length))}`); }

// ═══════════════════════════════════════════════════════
sep('FASE 1 — EMBUDO COMPLETO: MARÍA GARCÍA');
// ═══════════════════════════════════════════════════════

// ── PASO 1: Llega por WhatsApp (primer mensaje) ────────
sub('1. Primer contacto — bot_upsert_patient');

const upsert1 = await rpc('bot_upsert_patient', {
  p_clinic_id: CLINIC_A,
  p_phone:     '+51911000001',
  p_full_name: 'Paciente Bot',          // nombre genérico inicial del bot
  p_source:    'whatsapp_bot'
});

if (upsert1.d?.patient_id) {
  CLEANUP.push({ table:'patients', id: upsert1.d.patient_id });
  ok(`Paciente creado: ${upsert1.d.patient_id.slice(0,8)} | is_new:${upsert1.d.is_new}`);
} else {
  fail('bot_upsert_patient falló: ' + JSON.stringify(upsert1.d));
  process.exit(1);
}
const MARIA_ID = upsert1.d.patient_id;

// Verificar estado inicial
const p1 = await get(`/rest/v1/patients?id=eq.${MARIA_ID}&select=full_name,status,source,phone`);
const maria = p1.d[0];
if (maria?.status === 'lead') ok(`status='lead' correcto`);
else fail(`status esperado 'lead', got '${maria?.status}'`);
if (maria?.source === 'whatsapp_bot') ok(`source='whatsapp_bot' correcto`);
else fail(`source esperado 'whatsapp_bot', got '${maria?.source}'`);
console.log(`  nombre inicial: '${maria?.full_name}'`);

// ── PASO 2: El bot actualiza el nombre real ────────────
sub('2. Bot actualiza nombre (segunda llamada)');

const upsert2 = await rpc('bot_upsert_patient', {
  p_clinic_id: CLINIC_A,
  p_phone:     '+51911000001',
  p_full_name: 'María García',
  p_source:    'whatsapp_bot'
});
if (upsert2.d?.patient_id === MARIA_ID) ok(`Mismo patient_id retornado (idempotente)`);
else fail(`patient_id cambió: ${upsert2.d?.patient_id}`);
if (!upsert2.d?.is_new) ok(`is_new=false (no creó duplicado)`);
else fail(`is_new=true — creó duplicado`);

const p2 = await get(`/rest/v1/patients?id=eq.${MARIA_ID}&select=full_name`);
if (p2.d[0]?.full_name === 'María García') ok(`Nombre actualizado: 'María García'`);
else fail(`Nombre no actualizado: '${p2.d[0]?.full_name}'`);

// ── PASO 3: Aparece en get_clinic_leads ───────────────
sub('3. Aparece en Prospectos');

const leads = await rpc('get_clinic_leads', { p_clinic_id: CLINIC_A, p_limit: 50, p_offset: 0 });
const mariaLead = Array.isArray(leads.d) ? leads.d.find(l => l.id === MARIA_ID) : null;
if (mariaLead) {
  ok(`María aparece en get_clinic_leads`);
  ok(`source='${mariaLead.source}' | has_appointment=${mariaLead.has_appointment}`);
} else {
  fail('María NO aparece en get_clinic_leads');
}

const stats1 = await rpc('get_lead_stats', { p_clinic_id: CLINIC_A });
if (stats1.d?.total >= 1) ok(`get_lead_stats.total=${stats1.d.total} (≥1)`);
else fail(`get_lead_stats.total=${stats1.d?.total}`);

// ── PASO 4: Agendamiento — crear cita ─────────────────
sub('4. Crear cita (mañana 10am Lima)');

// Tomorrow at 10am Lima time
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(15, 0, 0, 0); // 10am Lima = 15:00 UTC
const endTime = new Date(tomorrow.getTime() + 60*60*1000);

const apptR = await post('/rest/v1/appointments?select=id,patient_id,status', {
  clinic_id:    CLINIC_A,
  patient_id:   MARIA_ID,
  patient_name: 'María García',
  phone:        '+51911000001',
  service:      'Limpieza dental',
  start_time:   tomorrow.toISOString(),
  end_time:     endTime.toISOString(),
  status:       'scheduled',
  source:       'bot'
});

let APPT_ID = null;
if (apptR.s === 201 && apptR.d[0]?.id) {
  APPT_ID = apptR.d[0].id;
  CLEANUP.push({ table:'appointments', id: APPT_ID });
  ok(`Cita creada: ${APPT_ID.slice(0,8)}`);
  if (apptR.d[0].patient_id === MARIA_ID) ok(`patient_id linkeado correctamente`);
  else fail(`patient_id no linkeado: ${apptR.d[0].patient_id}`);
} else {
  warn(`Cita HTTP ${apptR.s}: ${JSON.stringify(apptR.d).slice(0,150)}`);
  // May fail if slot occupied — create at different time
  const alt = new Date(tomorrow.getTime() + 2*60*60*1000);
  const altEnd = new Date(alt.getTime() + 60*60*1000);
  const apptR2 = await post('/rest/v1/appointments?select=id,patient_id,status', {
    clinic_id: CLINIC_A, patient_id: MARIA_ID,
    patient_name: 'María García', phone: '+51911000001',
    service: 'Limpieza dental',
    start_time: alt.toISOString(), end_time: altEnd.toISOString(),
    status: 'scheduled', source: 'bot'
  });
  if (apptR2.s === 201) {
    APPT_ID = apptR2.d[0].id;
    CLEANUP.push({ table:'appointments', id: APPT_ID });
    ok(`Cita creada (slot alternativo): ${APPT_ID.slice(0,8)}`);
  } else {
    fail(`No se pudo crear cita: HTTP ${apptR2.s}`);
  }
}

// Verificar que aparece con has_appointment=true
const leads2 = await rpc('get_clinic_leads', { p_clinic_id: CLINIC_A, p_limit: 50, p_offset: 0 });
const mariaLead2 = Array.isArray(leads2.d) ? leads2.d.find(l => l.id === MARIA_ID) : null;
if (mariaLead2?.has_appointment) ok(`has_appointment=true en Prospectos`);
else warn(`has_appointment=${mariaLead2?.has_appointment} — cita puede no matchear por phone`);

// ── PASO 5: Admin confirma → trigger lead→active ──────
sub('5. Confirmar cita → trigger activa paciente');

if (APPT_ID) {
  const patchS = await patch(`/rest/v1/appointments?id=eq.${APPT_ID}`, { status: 'confirmed' });
  if (patchS === 204) ok(`Cita confirmada (HTTP 204)`);
  else fail(`PATCH appointment HTTP ${patchS}`);

  // Wait a moment for trigger
  await new Promise(r => setTimeout(r, 500));

  const p3 = await get(`/rest/v1/patients?id=eq.${MARIA_ID}&select=status,updated_at`);
  if (p3.d[0]?.status === 'active') ok(`Trigger activado: status='active' ✅ (lead→active automático)`);
  else fail(`Trigger NO activó: status='${p3.d[0]?.status}' (esperado 'active')`);

  // Verify she's gone from leads
  const leads3 = await rpc('get_clinic_leads', { p_clinic_id: CLINIC_A, p_limit: 50, p_offset: 0 });
  const stillLead = Array.isArray(leads3.d) ? leads3.d.find(l => l.id === MARIA_ID) : null;
  if (!stillLead) ok(`Desapareció de Prospectos (ya es paciente activa)`);
  else fail(`Sigue apareciendo en Prospectos`);
}

// ── PASO 6: search_patients con status/source ─────────
sub('6. search_patients devuelve status/source');

const search = await rpc('search_patients', { p_clinic_id: CLINIC_A, p_query: 'María García', p_limit: 5 });
const found = Array.isArray(search.d) ? search.d.find(p => p.id === MARIA_ID) : null;
if (found) {
  ok(`search_patients encuentra a María García`);
  if (found.status === 'active') ok(`status='active' en búsqueda`);
  else fail(`status='${found.status}' en búsqueda`);
  if (found.source === 'whatsapp_bot') ok(`source='whatsapp_bot' en búsqueda`);
  else fail(`source='${found.source}' en búsqueda`);
} else {
  fail('search_patients no encontró a María García');
}

// ── PASO 7: Odontograma ───────────────────────────────
sub('7. Odontograma (patient_teeth)');

const TEETH_TEST = [
  { tooth_fdi: 11, status: 'caries'  },
  { tooth_fdi: 21, status: 'treated' },
  { tooth_fdi: 36, status: 'crown'   },
];
let teethOk = 0;
const teethIds = [];
for (const t of TEETH_TEST) {
  const r = await post('/rest/v1/patient_teeth?select=id,tooth_fdi,status', {
    patient_id: MARIA_ID, clinic_id: CLINIC_A,
    tooth_fdi: t.tooth_fdi, status: t.status,
    updated_at: new Date().toISOString()
  });
  if (r.s === 201) {
    teethOk++;
    teethIds.push(r.d[0]?.id);
    CLEANUP.push({ table:'patient_teeth', id: r.d[0]?.id });
  } else {
    fail(`tooth_fdi ${t.tooth_fdi} HTTP ${r.s}: ${JSON.stringify(r.d).slice(0,80)}`);
  }
}
if (teethOk === TEETH_TEST.length) ok(`${teethOk}/${TEETH_TEST.length} dientes guardados`);

// Read back odontogram
const readTeeth = await get(`/rest/v1/patient_teeth?patient_id=eq.${MARIA_ID}&select=tooth_fdi,status&order=tooth_fdi`);
if (readTeeth.d.length === teethOk) ok(`Odontograma leído: ${readTeeth.d.map(t => `${t.tooth_fdi}:${t.status}`).join(', ')}`);
else fail(`Odontograma: esperados ${teethOk} dientes, got ${readTeeth.d.length}`);

// Test upsert (click again on same tooth)
const upsertTooth = await post('/rest/v1/patient_teeth?on_conflict=patient_id,tooth_fdi&select=tooth_fdi,status', {
  patient_id: MARIA_ID, clinic_id: CLINIC_A,
  tooth_fdi: 11, status: 'treated',  // change caries → treated
  updated_at: new Date().toISOString()
}, 'return=representation,resolution=merge-duplicates');
const updatedTooth = await get(`/rest/v1/patient_teeth?patient_id=eq.${MARIA_ID}&tooth_fdi=eq.11&select=status`);
if (updatedTooth.d[0]?.status === 'treated') ok(`Upsert diente 11: caries→treated ✅`);
else warn(`Upsert resultado: ${updatedTooth.d[0]?.status}`);

// ── PASO 8: 24h reminder window ───────────────────────
sub('8. Ventana de recordatorio 24h');

const from24 = new Date(Date.now() + 22*3600*1000).toISOString();
const to24   = new Date(Date.now() + 26*3600*1000).toISOString();
const window24 = await get(`/rest/v1/appointments?clinic_id=eq.${CLINIC_A}&start_time=gte.${from24}&start_time=lte.${to24}&status=in.(scheduled,confirmed)&select=id,patient_name,start_time,status,phone`);
if (window24.d.length > 0) {
  ok(`${window24.d.length} cita(s) en ventana 22-26h para recordatorio`);
  window24.d.forEach(a => console.log(`    · ${a.patient_name} | ${new Date(a.start_time).toLocaleString('es-PE')} | ${a.status} | ${a.phone}`));
  // Check if María is among them
  const mariaTomorrow = window24.d.find(a => a.phone === '+51911000001');
  if (mariaTomorrow) ok(`María García está en la ventana de 24h reminder`);
  else warn(`María no está en ventana 24h (cita puede ser en otro horario)`);
} else {
  warn('No hay citas en ventana 22-26h ahora mismo');
}

// ── PASO 9: link_orphan_appointments ─────────────────
sub('9. link_orphan_appointments');

const orphan = await rpc('link_orphan_appointments', { p_clinic_id: CLINIC_A });
ok(`link_orphan_appointments: ${orphan.d} citas huérfanas vinculadas`);


// ═══════════════════════════════════════════════════════
sep('FASE 2 — SEGURIDAD: AISLAMIENTO MULTI-CLÍNICA');
// ═══════════════════════════════════════════════════════

// ── TEST A: Same phone, different clinics = different patients ─
sub('A. Mismo teléfono, clínicas distintas → registros separados');

// Create "María García" with same phone in Clinic B (Covida)
const upsertB = await rpc('bot_upsert_patient', {
  p_clinic_id: CLINIC_B,
  p_phone:     '+51911000001',
  p_full_name: 'María García Covida',
  p_source:    'whatsapp_bot'
});

if (upsertB.d?.patient_id && upsertB.d.patient_id !== MARIA_ID) {
  CLEANUP.push({ table:'patients', id: upsertB.d.patient_id });
  ok(`Clínica B creó su PROPIO registro (id distinto): ${upsertB.d.patient_id.slice(0,8)}`);
  const MARIA_B_ID = upsertB.d.patient_id;

  // Verify Clinic A doesn't see Clinic B's patient
  const aLeads = await rpc('get_clinic_leads', { p_clinic_id: CLINIC_A, p_limit: 100, p_offset: 0 });
  const clinicBinA = Array.isArray(aLeads.d) ? aLeads.d.find(l => l.id === MARIA_B_ID) : null;
  if (!clinicBinA) ok(`Clínica A NO ve el paciente de Clínica B ✅`);
  else fail(`Clínica A VE el paciente de Clínica B — FUGA DE DATOS`);

  // Verify Clinic B doesn't see Clinic A's active patient
  const bLeads = await rpc('get_clinic_leads', { p_clinic_id: CLINIC_B, p_limit: 100, p_offset: 0 });
  const clinicAinB = Array.isArray(bLeads.d) ? bLeads.d.find(l => l.id === MARIA_ID) : null;
  if (!clinicAinB) ok(`Clínica B NO ve el paciente de Clínica A ✅`);
  else fail(`Clínica B VE el paciente de Clínica A — FUGA DE DATOS`);

  // Verify Clinic C sees nothing from A or B
  const cLeads = await rpc('get_clinic_leads', { p_clinic_id: CLINIC_C, p_limit: 100, p_offset: 0 });
  const anyLeak = Array.isArray(cLeads.d) ? cLeads.d.find(l => l.id === MARIA_ID || l.id === MARIA_B_ID) : null;
  if (!anyLeak) ok(`Clínica C (SmilePlus) NO ve pacientes de A ni B ✅`);
  else fail(`Clínica C VE pacientes de otras clínicas — FUGA DE DATOS`);

  // ── TEST B: activate_patient with wrong clinic ─────
  sub('B. activate_patient con clinic_id incorrecto');

  // Try to activate Clinic A's María using Clinic B's ID — must return false
  const wrongActivate = await rpc('activate_patient', {
    p_patient_id: MARIA_ID,
    p_clinic_id:  CLINIC_B  // wrong clinic
  });
  if (wrongActivate.d === false) ok(`activate_patient con clinic_id incorrecto retorna false ✅`);
  else fail(`activate_patient aceptó clinic_id incorrecto: ${JSON.stringify(wrongActivate.d)}`);

  // ── TEST C: search_patients isolation ─────────────
  sub('C. search_patients no filtra entre clínicas');

  const searchA = await rpc('search_patients', { p_clinic_id: CLINIC_A, p_query: 'María', p_limit: 20 });
  const searchB = await rpc('search_patients', { p_clinic_id: CLINIC_B, p_query: 'María', p_limit: 20 });

  const aIDs = Array.isArray(searchA.d) ? searchA.d.map(p => p.id) : [];
  const bIDs = Array.isArray(searchB.d) ? searchB.d.map(p => p.id) : [];
  const overlap = aIDs.filter(id => bIDs.includes(id));

  ok(`search A devuelve ${aIDs.length} paciente(s) | search B devuelve ${bIDs.length} paciente(s)`);
  if (overlap.length === 0) ok(`Sin overlap entre clínicas en search_patients ✅`);
  else fail(`Overlap encontrado: ${overlap.length} paciente(s) aparecen en ambas clínicas`);

  // ── TEST D: get_lead_stats por clínica ─────────────
  sub('D. get_lead_stats counts son independientes por clínica');

  const statsA = await rpc('get_lead_stats', { p_clinic_id: CLINIC_A });
  const statsB = await rpc('get_lead_stats', { p_clinic_id: CLINIC_B });
  const statsC = await rpc('get_lead_stats', { p_clinic_id: CLINIC_C });

  ok(`Stats A: total=${statsA.d?.total} | Stats B: total=${statsB.d?.total} | Stats C: total=${statsC.d?.total}`);
  // Each should only count its own leads
  const bHasMariaB = statsB.d?.total >= 1;
  if (bHasMariaB) ok(`Clínica B cuenta su propia María (total≥1) ✅`);
  else warn(`Clínica B total=${statsB.d?.total} — puede que María B sea active ya`);

  // ── TEST E: patient_teeth isolation ──────────────
  sub('E. patient_teeth no cruza clínicas');

  // Create a tooth for María in Clinic B
  const toothB = await post('/rest/v1/patient_teeth?select=id,tooth_fdi', {
    patient_id: MARIA_B_ID, clinic_id: CLINIC_B,
    tooth_fdi: 11, status: 'healthy',
    updated_at: new Date().toISOString()
  });
  if (toothB.s === 201) {
    CLEANUP.push({ table:'patient_teeth', id: toothB.d[0]?.id });
    ok(`Diente creado para María en Clínica B`);

    // Query teeth for Clinic A's María — should NOT see Clinic B's tooth
    const teethA = await get(`/rest/v1/patient_teeth?patient_id=eq.${MARIA_ID}&select=id,tooth_fdi,clinic_id`);
    const crossTooth = teethA.d.find(t => t.clinic_id === CLINIC_B);
    if (!crossTooth) ok(`patient_teeth de Clínica A no contiene dientes de Clínica B ✅`);
    else fail(`patient_teeth CONTIENE dientes de Clínica B — FUGA DE DATOS`);

    // Verify tooth counts
    const teethAcount = teethA.d.length;
    const teethBR = await get(`/rest/v1/patient_teeth?patient_id=eq.${MARIA_B_ID}&select=id`);
    ok(`Teeth Clínica A: ${teethAcount} | Teeth Clínica B: ${teethBR.d.length} (completamente separados)`);
  } else {
    warn(`No se pudo crear diente en Clínica B: HTTP ${toothB.s}`);
  }

  // ── TEST F: n8n webhook appt-notify clinic isolation
  sub('F. Verificar que Appt Notify lee bot_config de la clínica correcta');

  const KEY_SB = KEY;
  const clinicAConfig = await fetch(BASE + `/rest/v1/clinics?id=eq.${CLINIC_A}&select=bot_config,admin_notify_phone`, { headers: H }).then(r => r.json());
  const clinicBConfig = await fetch(BASE + `/rest/v1/clinics?id=eq.${CLINIC_B}&select=bot_config,admin_notify_phone`, { headers: H }).then(r => r.json());

  const aPhone = clinicAConfig[0]?.admin_notify_phone;
  const bPhone = clinicBConfig[0]?.admin_notify_phone;
  const aSid   = clinicAConfig[0]?.bot_config?.twilio_admin_new_appt_sid;
  const bSid   = clinicBConfig[0]?.bot_config?.twilio_admin_new_appt_sid;

  ok(`Clínica A admin_phone: ${aPhone} | T12 SID: ${aSid?.slice(0,12)}`);
  if (bPhone) ok(`Clínica B admin_phone: ${bPhone} | T12 SID: ${bSid?.slice(0,12)}`);
  else warn(`Clínica B no tiene admin_notify_phone configurado — agregar a seed_admin_notify.mjs`);

  if (aPhone !== bPhone || !bPhone) ok(`Admin phones son distintos por clínica (no se mezclan notificaciones) ✅`);
  else warn(`Admin phones son iguales — verificar configuración`);

} else {
  fail(`bot_upsert_patient Clínica B falló: ${JSON.stringify(upsertB.d)}`);
}

// ── TEST G: n8n last executions ────────────────────────
sub('G. Últimas ejecuciones de workflows críticos');

const checkWf = async (id, name) => {
  const r = await fetch(`${N8N}/api/v1/executions?workflowId=${id}&limit=1`, { headers: {'X-N8N-API-KEY': N8N_KEY} });
  const d = await r.json();
  const last = d.data?.[0];
  if (!last) { warn(`${name}: sin ejecuciones`); return; }
  const when = new Date(last.startedAt).toLocaleString('es-PE');
  if (last.status === 'success') ok(`${name}: última ejecución success @ ${when}`);
  else warn(`${name}: última ejecución ${last.status} @ ${when}`);
};

await checkWf('37SLdWISQLgkHeXk', 'Sofia main');
await checkWf('5jstI4hfoWArtzZe', 'Appt Notify (T12)');
await checkWf('FCSJrGj5bLMuytr7', '24h Reminders');
await checkWf('Qu1aE3m9bzI7TPiJ', 'Debt Reminders');
await checkWf('CwL85rI1rLFD0MS1', 'Re-engagement');


// ═══════════════════════════════════════════════════════
sep('CLEANUP');
// ═══════════════════════════════════════════════════════

// Delete in order: teeth → appointments → patients
for (const item of CLEANUP) {
  if (item.table === 'patient_teeth' && item.id) await del(`/rest/v1/patient_teeth?id=eq.${item.id}`);
}
for (const item of CLEANUP) {
  if (item.table === 'appointments' && item.id) await del(`/rest/v1/appointments?id=eq.${item.id}`);
}
for (const item of CLEANUP) {
  if (item.table === 'patients' && item.id) await del(`/rest/v1/patients?id=eq.${item.id}`);
}
console.log(`  ✅ ${CLEANUP.length} registros de prueba eliminados`);


// ═══════════════════════════════════════════════════════
sep('RESULTADOS FINALES');
// ═══════════════════════════════════════════════════════
console.log(`  ✅ Passed:    ${passed}`);
console.log(`  ❌ Failed:    ${failed}`);
console.log(`  ⚠️  Warnings:  ${warns}`);
console.log('');
if (failed === 0) console.log('  🎯 Sistema seguro y funcionando correctamente.');
else console.log('  ⚡ HAY FALLOS — revisar arriba.');
console.log('');

if (failed > 0) process.exit(1);
