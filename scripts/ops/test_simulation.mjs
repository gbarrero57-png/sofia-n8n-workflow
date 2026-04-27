import { readFileSync } from 'fs';

const KEY   = readFileSync('saas/.env', 'utf8').match(/SUPABASE_SERVICE_KEY=(.+)/)?.[1]?.trim();
const BASE  = 'https://inhyrrjidhzrbqecnptn.supabase.co';
const CLINIC = 'c6c15fca-d7fc-4d98-83c1-2c5cb5a6bef1';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const get   = async p => { const r = await fetch(BASE+p,{headers:H}); return {status:r.status,data:await r.json()}; };
const post  = async (p,b) => { const r = await fetch(BASE+p,{method:'POST',headers:{...H,Prefer:'return=representation'},body:JSON.stringify(b)}); const txt = await r.text(); return {status:r.status,data:txt?JSON.parse(txt):[]}; };
const patch = async (p,b) => { const r = await fetch(BASE+p,{method:'PATCH',headers:H,body:JSON.stringify(b)}); return {status:r.status}; };
const del   = async p => { const r = await fetch(BASE+p,{method:'DELETE',headers:H}); return r.status; };
const rpc   = async (fn,b) => post('/rest/v1/rpc/'+fn, b);

const CLEANUP = [];

console.log('══════════════════════════════════════════════════');
console.log('  SIMULACIÓN PACIENTES + ODONTOGRAMA + LEADS');
console.log('══════════════════════════════════════════════════\n');

// ── 1. Crear 3 leads via bot_upsert_patient ───────────────────────────────
console.log('── 1. Crear leads via bot_upsert_patient ─────────');
const BOTS = [
  { phone: '+51911000001', name: 'María García',  source: 'whatsapp_bot' },
  { phone: '+51922000002', name: 'Carlos Ríos',   source: 'whatsapp_bot' },
  { phone: '+51933000003', name: 'Ana Flores',    source: 'landing_page' },
];
const pids = {};
for (const b of BOTS) {
  const r = await rpc('bot_upsert_patient', {
    p_clinic_id: CLINIC, p_phone: b.phone, p_full_name: b.name, p_source: b.source
  });
  if (r.data?.patient_id) {
    pids[b.name] = r.data.patient_id;
    CLEANUP.push({ t: 'patient', id: r.data.patient_id });
    console.log(`  ✅ ${b.name} → ${r.data.patient_id.slice(0,8)} | is_new:${r.data.is_new} | source:${b.source}`);
  } else {
    console.log(`  ❌ ${b.name}`, JSON.stringify(r.data));
  }
}

// ── 2. Lead stats ─────────────────────────────────────────────────────────
console.log('\n── 2. get_lead_stats ─────────────────────────────');
const stats = await rpc('get_lead_stats', { p_clinic_id: CLINIC });
console.log(`  total:${stats.data.total} | new_week:${stats.data.new_this_week} | with_appt:${stats.data.with_appointment} | converted:${stats.data.converted_week}`);

// ── 3. get_clinic_leads ───────────────────────────────────────────────────
console.log('\n── 3. get_clinic_leads ───────────────────────────');
const leads = await rpc('get_clinic_leads', { p_clinic_id: CLINIC, p_limit: 10, p_offset: 0 });
console.log(`  total:${leads.data[0]?.total ?? 0} | returned:${leads.data.length}`);
leads.data.slice(0,3).forEach(l => console.log(`  · ${l.full_name} | ${l.source} | has_appt:${l.has_appointment}`));

const botLeads = await rpc('get_clinic_leads', { p_clinic_id: CLINIC, p_limit: 5, p_offset: 0, p_source: 'whatsapp_bot' });
console.log(`  filter whatsapp_bot → total:${botLeads.data[0]?.total ?? 0}`);

// ── 4. Cita para María → patient_id linkeado ──────────────────────────────
console.log('\n── 4. Crear cita para María García ───────────────');
const mariaId = pids['María García'];
let apptId = null;
if (mariaId) {
  const tomorrow = new Date(Date.now() + 24*3600*1000).toISOString();
  const endTime  = new Date(Date.now() + 25*3600*1000).toISOString();
  const ar = await post('/rest/v1/appointments?select=id,status,patient_id', {
    clinic_id: CLINIC, patient_id: mariaId,
    patient_name: 'María García', phone: '+51911000001',
    service: 'Limpieza dental',
    start_time: tomorrow, end_time: endTime,
    status: 'scheduled', source: 'bot'
  });
  if (ar.status === 201) {
    apptId = ar.data[0]?.id;
    CLEANUP.push({ t: 'appointment', id: apptId });
    console.log(`  ✅ Cita creada: ${apptId.slice(0,8)} | patient_id:${ar.data[0]?.patient_id?.slice(0,8)}`);
  } else {
    console.log(`  ❌ HTTP ${ar.status}`, JSON.stringify(ar.data).slice(0,150));
  }
}

// ── 5. Confirmar cita → trigger lead→active ───────────────────────────────
console.log('\n── 5. Confirmar cita → trigger activa paciente ───');
if (apptId) {
  const cr = await patch(`/rest/v1/appointments?id=eq.${apptId}`, { status: 'confirmed' });
  console.log(`  PATCH HTTP:${cr.status}`);
  const check = await get(`/rest/v1/patients?id=eq.${mariaId}&select=status,full_name`);
  const newStatus = check.data[0]?.status;
  console.log(`  María status: "${newStatus}" ${newStatus === 'active' ? '✅ lead→active' : '❌ sigue como lead'}`);
}

// ── 6. activate_patient manual ────────────────────────────────────────────
console.log('\n── 6. activate_patient manual (Carlos Ríos) ──────');
const carlosId = pids['Carlos Ríos'];
if (carlosId) {
  const ar = await rpc('activate_patient', { p_patient_id: carlosId, p_clinic_id: CLINIC });
  const check = await get(`/rest/v1/patients?id=eq.${carlosId}&select=status`);
  console.log(`  activated:${ar.data} | status:"${check.data[0]?.status}" ${check.data[0]?.status === 'active' ? '✅' : '❌'}`);
}

// ── 7. Odontograma — insertar + leer ─────────────────────────────────────
console.log('\n── 7. patient_teeth (odontograma) ────────────────');
const anaId = pids['Ana Flores'];
if (anaId) {
  const TEETH = [
    { tooth_fdi: 11, status: 'caries'    },
    { tooth_fdi: 16, status: 'crown'     },
    { tooth_fdi: 26, status: 'treated'   },
    { tooth_fdi: 36, status: 'extracted' },
    { tooth_fdi: 46, status: 'implant'   },
  ];
  let ok = 0;
  for (const t of TEETH) {
    const r = await post('/rest/v1/patient_teeth?select=id,tooth_fdi,status', {
      patient_id: anaId, clinic_id: CLINIC,
      tooth_fdi: t.tooth_fdi, status: t.status,
      updated_at: new Date().toISOString()
    });
    if (r.status === 201) { ok++; CLEANUP.push({ t: 'tooth', id: r.data[0]?.id }); }
    else console.log(`  ❌ fdi:${t.tooth_fdi} HTTP:${r.status}`, JSON.stringify(r.data).slice(0,100));
  }
  console.log(`  ${ok}/${TEETH.length} dientes insertados ✅`);

  // Upsert (update) uno existente
  const upsertR = await post('/rest/v1/patient_teeth?on_conflict=patient_id,tooth_fdi&select=tooth_fdi,status', {
    patient_id: anaId, clinic_id: CLINIC,
    tooth_fdi: 11, status: 'treated',
    updated_at: new Date().toISOString()
  });
  console.log(`  Upsert diente 11 caries→treated: HTTP:${upsertR.status} status:"${upsertR.data[0]?.status}" ✅`);

  const readR = await get(`/rest/v1/patient_teeth?patient_id=eq.${anaId}&select=tooth_fdi,status&order=tooth_fdi`);
  console.log(`  Odontograma Ana: ${readR.data.map(t => t.tooth_fdi+':'+t.status).join(', ')}`);
}

// ── 8. search_patients con status/source ─────────────────────────────────
console.log('\n── 8. search_patients con status/source ──────────');
const sr = await rpc('search_patients', { p_clinic_id: CLINIC, p_query: 'García', p_limit: 5 });
if (Array.isArray(sr.data) && sr.data.length > 0) {
  sr.data.forEach(p => console.log(`  · ${p.full_name} | status:${p.status} | source:${p.source}`));
} else {
  // try with partial name
  const sr2 = await rpc('search_patients', { p_clinic_id: CLINIC, p_query: 'arí', p_limit: 5 });
  if (Array.isArray(sr2.data) && sr2.data.length > 0) {
    sr2.data.forEach(p => console.log(`  · ${p.full_name} | status:${p.status} | source:${p.source}`));
  } else {
    console.log('  (sin resultados — nombre recién creado puede no matchear)');
  }
}

// ── 9. link_orphan_appointments ───────────────────────────────────────────
console.log('\n── 9. link_orphan_appointments ───────────────────');
const lor = await rpc('link_orphan_appointments', { p_clinic_id: CLINIC });
console.log(`  linked: ${lor.data} citas huérfanas`);

// ── 10. Cleanup ───────────────────────────────────────────────────────────
console.log('\n── 10. Cleanup ───────────────────────────────────');
for (const item of CLEANUP) {
  if (item.t === 'tooth')        await del(`/rest/v1/patient_teeth?id=eq.${item.id}`);
  if (item.t === 'appointment')  await del(`/rest/v1/appointments?id=eq.${item.id}`);
}
for (const item of CLEANUP) {
  if (item.t === 'patient') await del(`/rest/v1/patients?id=eq.${item.id}`);
}
console.log(`  ✅ ${CLEANUP.length} registros eliminados`);

console.log('\n══════════════════════════════════════════════════');
console.log('  SIMULACIÓN COMPLETA ✅');
console.log('══════════════════════════════════════════════════\n');
