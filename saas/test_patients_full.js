#!/usr/bin/env node
/**
 * SofIA Full Test Suite
 * Prueba funciones nuevas (patients) + funciones antiguas (governance, appointments)
 */
const https = require('https');

const SUPABASE_URL     = process.env.SUPABASE_URL     || 'https://inhyrrjidhzrbqecnptn.supabase.co';
const SERVICE_KEY      = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluaHlycmppZGh6cmJxZWNucHRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwNzU3NSwiZXhwIjoyMDg2NTgzNTc1fQ.-YwX0Qf4Gn8MdjFbLxCYuCJV1OzWl2qWWk4hKuU6z7k';
const CLINIC_ID        = process.env.CLINIC_ID        || '56b0cf1c-2ab6-4e03-b989-044701e47271';
const ADMIN_USER_ID    = process.env.ADMIN_USER_ID    || '88c478fc-1733-4184-a912-955e67794031';
const PORTAL_URL       = process.env.PORTAL_URL       || 'sofia.redsolucionesti.com';
const ADMIN_EMAIL      = process.env.ADMIN_EMAIL      || 'admin@clinicasanmarcos.com';
const ADMIN_PASS       = process.env.ADMIN_PASS       || 'Admin2024!';

const HDR = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

let passed = 0, failed = 0;
const failures = [];

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function req(method, path, body, customHeaders) {
  return new Promise((resolve) => {
    const isSupabase = !path.startsWith('http');
    const url = isSupabase ? `${SUPABASE_URL}${path}` : path;
    const parsed = new URL(url);
    const headers = { ...(customHeaders || HDR) };
    const bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const opts = { hostname: parsed.hostname, path: parsed.pathname + parsed.search, method, headers };
    const r = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d), headers: res.headers }); }
        catch { resolve({ status: res.statusCode, data: d, headers: res.headers }); }
      });
    });
    r.on('error', e => resolve({ status: 0, data: { error: e.message } }));
    if (bodyStr) r.write(bodyStr);
    r.end();
  });
}

function rpc(fn, params) {
  return req('POST', `/rest/v1/rpc/${fn}`, params);
}

function supaRest(method, table, params = '') {
  return req(method, `/rest/v1/${table}${params}`);
}

// ── Test runner ──────────────────────────────────────────────────────────────

function test(name, fn) {
  return fn().then(result => {
    if (result.ok) {
      console.log(`  ✅ ${name}`);
      if (result.info) console.log(`     ${result.info}`);
      passed++;
    } else {
      console.log(`  ❌ ${name}`);
      console.log(`     ${result.reason}`);
      failed++;
      failures.push({ name, reason: result.reason });
    }
    return result;
  }).catch(e => {
    console.log(`  ❌ ${name} → EXCEPTION: ${e.message}`);
    failed++;
    failures.push({ name, reason: e.message });
    return { ok: false };
  });
}

const ok  = (info)   => ({ ok: true,  info });
const fail = (reason) => ({ ok: false, reason });

// ── Auth: get Supabase session for portal tests ──────────────────────────────

let sbToken = null;

async function loginSupabase() {
  const r = await req('POST', `/auth/v1/token?grant_type=password`, {
    email: ADMIN_EMAIL, password: ADMIN_PASS
  });
  if (r.status === 200 && r.data.access_token) {
    sbToken = r.data.access_token;
    return true;
  }
  return false;
}

function portalReq(method, path, body) {
  const headers = {
    'Cookie': `sb-token=${sbToken}`,
    'Content-Type': 'application/json',
    'Host': PORTAL_URL,
  };
  const bodyStr = body ? JSON.stringify(body) : null;
  if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

  return new Promise((resolve) => {
    const opts = { hostname: PORTAL_URL, path, method, headers };
    const r = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, data: d }); }
      });
    });
    r.on('error', e => resolve({ status: 0, data: e.message }));
    if (bodyStr) r.write(bodyStr);
    r.end();
  });
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  SofIA Full Test Suite — ' + new Date().toLocaleString('es-PE'));
  console.log('══════════════════════════════════════════════════\n');

  // ── 0. LOGIN — obtener token para funciones con JWT claims ───────────────
  console.log('━━━ 0. AUTH — Obtener sesión con custom claims ━━━━');
  const loggedIn = await loginSupabase();
  if (!loggedIn) {
    console.log('  ❌ No se pudo autenticar — abortando tests de patients');
    process.exit(1);
  }
  console.log(`  🔑 Sesión obtenida para ${ADMIN_EMAIL}\n`);

  // Headers con JWT del usuario (que tiene clinic_id claim)
  const USER_HDR = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${sbToken}`,
    'Content-Type': 'application/json',
  };
  const userRpc = (fn, params) => req('POST', `/rest/v1/rpc/${fn}`, params, USER_HDR);

  // ── 1. PATIENTS: create / upsert ─────────────────────────────────────────
  console.log('━━━ 1. PATIENTS — Creación y búsqueda ━━━━━━━━━━━━');

  let patientId = null;

  await test('create_or_update_patient (nuevo)', async () => {
    const r = await userRpc('create_or_update_patient', {
      p_clinic_id: CLINIC_ID,
      p_dni: '87654321',
      p_full_name: 'Prueba Simulación García',
      p_birth_date: '1985-06-15',
      p_gender: 'M',
      p_phone: '+51999888777',
      p_email: 'test.simulacion@sofia.test',
      p_address: 'Av. Test 123, Lima',
      p_blood_type: 'O+',
      p_emergency_contact_name: 'María García',
      p_emergency_contact_phone: '+51999111222',
    });
    if (r.status !== 200 && r.status !== 201) return fail(`status ${r.status}: ${JSON.stringify(r.data).substring(0, 100)}`);
    const row = Array.isArray(r.data) ? r.data[0] : r.data;
    patientId = row?.patient_id;
    if (!patientId) return fail(`No patient_id returned: ${JSON.stringify(r.data).substring(0, 100)}`);
    return ok(`patient_id=${patientId.substring(0, 8)}...`);
  });

  await test('create_or_update_patient (upsert: mismo DNI)', async () => {
    const r = await userRpc('create_or_update_patient', {
      p_clinic_id: CLINIC_ID,
      p_dni: '87654321',
      p_full_name: 'Prueba Simulación García (actualizado)',
      p_phone: '+51999000000',
      p_blood_type: 'O+',
    });
    if (r.status !== 200 && r.status !== 201) return fail(`status ${r.status}`);
    const row = Array.isArray(r.data) ? r.data[0] : r.data;
    if (!row?.patient_id) return fail('No patient_id en upsert');
    return ok('DNI duplicado → paciente actualizado, no duplicado');
  });

  await test('get_patient_by_dni', async () => {
    const r = await userRpc('get_patient_by_dni', { p_clinic_id: CLINIC_ID, p_dni: '87654321' });
    if (r.status !== 200) return fail(`status ${r.status}`);
    const row = Array.isArray(r.data) ? r.data[0] : r.data;
    if (!row?.id) return fail('No se encontró el paciente por DNI');
    return ok(`Encontrado: ${row.full_name} (${row.total_visits} visitas)`);
  });

  await test('search_patients (por nombre)', async () => {
    const r = await userRpc('search_patients', { p_clinic_id: CLINIC_ID, p_query: 'Simulacion', p_limit: 5 });
    if (r.status !== 200) return fail(`status ${r.status}`);
    const rows = Array.isArray(r.data) ? r.data : [];
    if (rows.length === 0) return fail('No se encontraron resultados');
    return ok(`${rows.length} resultado(s): ${rows.map(r => r.full_name).join(', ')}`);
  });

  await test('search_patients (por DNI parcial)', async () => {
    const r = await userRpc('search_patients', { p_clinic_id: CLINIC_ID, p_query: '87654', p_limit: 5 });
    if (r.status !== 200) return fail(`status ${r.status}`);
    const rows = Array.isArray(r.data) ? r.data : [];
    if (rows.length === 0) return fail('Búsqueda por DNI parcial no retornó resultados');
    return ok(`${rows.length} resultado(s) por DNI parcial`);
  });

  // ── 2. PATIENT ALLERGIES ──────────────────────────────────────────────────
  console.log('\n━━━ 2. ALLERGIES — Registro de alergias ━━━━━━━━━━');

  let allergyId = null;

  await test('Insertar alergia (anafilaxis)', async () => {
    if (!patientId) return fail('patientId no disponible');
    const r = await req('POST', '/rest/v1/patient_allergies', {
      patient_id: patientId,
      clinic_id: CLINIC_ID,
      allergen: 'Penicilina',
      severity: 'anafilaxis',
      reaction: 'Shock anafiláctico',
      confirmed: true,
    });
    if (r.status !== 201) return fail(`status ${r.status}: ${JSON.stringify(r.data).substring(0, 100)}`);
    allergyId = r.headers?.['content-range'] || 'unknown';
    return ok('Alergia crítica insertada');
  });

  await test('Insertar alergia (leve)', async () => {
    if (!patientId) return fail('patientId no disponible');
    const r = await req('POST', '/rest/v1/patient_allergies', {
      patient_id: patientId,
      clinic_id: CLINIC_ID,
      allergen: 'Ibuprofeno',
      severity: 'leve',
      reaction: 'Urticaria',
      confirmed: false,
    });
    if (r.status !== 201) return fail(`status ${r.status}`);
    return ok('Alergia leve insertada');
  });

  await test('get_patient_by_dni incluye alergias', async () => {
    const r = await userRpc('get_patient_by_dni', { p_clinic_id: CLINIC_ID, p_dni: '87654321' });
    const row = Array.isArray(r.data) ? r.data[0] : r.data;
    const allergies = row?.allergies || [];
    if (allergies.length < 2) return fail(`Solo ${allergies.length} alergia(s) en el resultado`);
    const critical = allergies.find((a) => a.severity === 'anafilaxis');
    if (!critical) return fail('Alergia crítica (anafilaxis) no aparece en resultado');
    return ok(`${allergies.length} alergias, incluyendo Penicilina (anafilaxis)`);
  });

  // ── 3. CLINICAL RECORDS ───────────────────────────────────────────────────
  console.log('\n━━━ 3. CLINICAL RECORDS — Consultas médicas ━━━━━━');

  let recordId = null;

  await test('add_clinical_record (consulta completa)', async () => {
    if (!patientId) return fail('patientId no disponible');
    const r = await userRpc('add_clinical_record', {
      p_patient_id: patientId,
      p_clinic_id: CLINIC_ID,
      p_consultation_date: new Date().toISOString().split('T')[0],
      p_reason: 'Control de presión arterial y chequeo general de rutina',
      p_diagnosis: 'Hipertensión arterial leve (HTA grado 1)',
      p_treatment: 'Dieta baja en sodio, ejercicio aeróbico 30 min/día',
      p_medications: 'Enalapril 10mg — 1 tableta — cada 24 horas\nAmlodipino 5mg — 1 tableta — cada 24 horas',
      p_observations: 'Paciente refiere cefalea ocasional. Control en 30 días.',
      p_next_appointment_rec: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      p_weight_kg: 82.5,
      p_height_cm: 175.0,
      p_blood_pressure: '145/90 mmHg',
      p_temperature_c: 36.8,
      p_appointment_id: null,
    });
    if (r.status !== 200 && r.status !== 201) return fail(`status ${r.status}: ${JSON.stringify(r.data).substring(0, 150)}`);
    const row = Array.isArray(r.data) ? r.data[0] : r.data;
    recordId = row?.record_id;
    if (!recordId) return fail('No record_id retornado');
    return ok(`record_id=${recordId.substring(0, 8)}...`);
  });

  await test('add_clinical_record (consulta mínima)', async () => {
    if (!patientId) return fail('patientId no disponible');
    const r = await userRpc('add_clinical_record', {
      p_patient_id: patientId,
      p_clinic_id: CLINIC_ID,
      p_consultation_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      p_reason: 'Dolor de cabeza',
      p_diagnosis: 'Cefalea tensional',
      p_treatment: null,
      p_medications: 'Paracetamol 500mg — SOS',
      p_observations: null,
      p_next_appointment_rec: null,
      p_weight_kg: null,
      p_height_cm: null,
      p_blood_pressure: null,
      p_temperature_c: null,
      p_appointment_id: null,
    });
    if (r.status !== 200 && r.status !== 201) return fail(`status ${r.status}`);
    return ok('Consulta mínima (solo motivo + diagnóstico) guardada');
  });

  await test('get_patient_timeline (paginado)', async () => {
    if (!patientId) return fail('patientId no disponible');
    const r = await userRpc('get_patient_timeline', {
      p_patient_id: patientId,
      p_clinic_id: CLINIC_ID,
      p_limit: 10,
      p_offset: 0,
    });
    if (r.status !== 200) return fail(`status ${r.status}`);
    const rows = Array.isArray(r.data) ? r.data : [];
    if (rows.length < 2) return fail(`Solo ${rows.length} consulta(s) en el timeline`);
    const total = rows[0]?.total_count;
    return ok(`${rows.length} consultas, total_count=${total}`);
  });

  await test('get_patient_timeline aislamiento por clínica', async () => {
    const r = await userRpc('get_patient_timeline', {
      p_patient_id: patientId,
      p_clinic_id: '00000000-0000-0000-0000-000000000000', // clinic ajena
      p_limit: 10,
      p_offset: 0,
    });
    const rows = Array.isArray(r.data) ? r.data : [];
    if (rows.length > 0) return fail(`Filtro clinic_id falló — retornó ${rows.length} registros de otra clínica`);
    return ok('Aislamiento correcto: 0 registros con clinic_id ajeno');
  });

  await test('get_today_appointments_with_status', async () => {
    const r = await userRpc('get_today_appointments_with_status', { p_clinic_id: CLINIC_ID });
    if (r.status !== 200) return fail(`status ${r.status}: ${JSON.stringify(r.data).substring(0, 100)}`);
    const rows = Array.isArray(r.data) ? r.data : [];
    return ok(`${rows.length} cita(s) hoy — campos: ${rows.length > 0 ? Object.keys(rows[0]).join(', ') : 'N/A'}`);
  });

  // ── 4. GOVERNANCE (funciones existentes) ─────────────────────────────────
  console.log('\n━━━ 4. GOVERNANCE — Funciones existentes ━━━━━━━━━');

  const testConvId = 'sim_test_' + Date.now();
  let internalConvId = null;

  await test('upsert_conversation (crear nueva)', async () => {
    const r = await rpc('upsert_conversation', {
      p_clinic_id: CLINIC_ID,
      p_chatwoot_conversation_id: testConvId,
      p_patient_name: 'Paciente Test Governance',
      p_last_message: 'Hola, quiero una cita',
    });
    if (r.status !== 200) return fail(`status ${r.status}: ${JSON.stringify(r.data).substring(0, 100)}`);
    const row = Array.isArray(r.data) ? r.data[0] : r.data;
    internalConvId = row?.conversation_id;
    if (!internalConvId) return fail('No conversation_id retornado');
    if (row.bot_paused !== false) return fail(`bot_paused debe ser false, es ${row.bot_paused}`);
    return ok(`conv_id=${internalConvId.substring(0, 8)}..., bot_paused=false, status=${row.status}`);
  });

  await test('upsert_conversation (idempotente — mismo chatwoot_id)', async () => {
    const r = await rpc('upsert_conversation', {
      p_clinic_id: CLINIC_ID,
      p_chatwoot_conversation_id: testConvId,
      p_patient_name: 'Paciente Test Governance',
      p_last_message: 'Segundo mensaje',
    });
    if (r.status !== 200) return fail(`status ${r.status}`);
    const row = Array.isArray(r.data) ? r.data[0] : r.data;
    if (row?.conversation_id !== internalConvId) return fail('Upsert creó ID diferente — no fue idempotente');
    return ok('Mismo conversation_id — no duplicó registro');
  });

  await test('list_conversations (activas)', async () => {
    const r = await rpc('list_conversations', {
      p_clinic_id: CLINIC_ID,
      p_status: 'active',
      p_limit: 20,
      p_offset: 0,
    });
    if (r.status !== 200) return fail(`status ${r.status}`);
    const rows = Array.isArray(r.data) ? r.data : [];
    const found = rows.find(c => c.chatwoot_conversation_id === testConvId);
    if (!found) return fail('Conversación de test no aparece en lista');
    return ok(`${rows.length} conversación(es) activa(s), test encontrada`);
  });

  await test('pause_conversation (admin OK)', async () => {
    if (!internalConvId) return fail('internalConvId no disponible');
    const r = await rpc('pause_conversation', {
      p_conversation_id: internalConvId,
      p_clinic_id: CLINIC_ID,
      p_user_role: 'admin',
    });
    if (r.status !== 200) return fail(`status ${r.status}`);
    const result = r.data;
    if (!result?.success) return fail(`No success: ${JSON.stringify(result)}`);
    return ok('Bot pausado, status=human');
  });

  await test('pause_conversation (staff DENIED)', async () => {
    if (!internalConvId) return fail('internalConvId no disponible');
    const r = await rpc('pause_conversation', {
      p_conversation_id: internalConvId,
      p_clinic_id: CLINIC_ID,
      p_user_role: 'staff',
    });
    if (r.status !== 200) return fail(`status ${r.status}`);
    const result = r.data;
    if (result?.success) return fail('Staff no debería poder pausar — devolvió success=true');
    return ok(`Staff denegado correctamente: ${result?.error_code}`);
  });

  await test('resume_conversation (admin OK)', async () => {
    if (!internalConvId) return fail('internalConvId no disponible');
    const r = await rpc('resume_conversation', {
      p_conversation_id: internalConvId,
      p_clinic_id: CLINIC_ID,
      p_user_role: 'admin',
    });
    if (r.status !== 200) return fail(`status ${r.status}`);
    const result = r.data;
    if (!result?.success) return fail(`No success: ${JSON.stringify(result)}`);
    return ok('Bot reanudado, status=active');
  });

  await test('assign_conversation', async () => {
    if (!internalConvId) return fail('internalConvId no disponible');
    const r = await rpc('assign_conversation', {
      p_conversation_id: internalConvId,
      p_clinic_id: CLINIC_ID,
      p_assigned_user_id: ADMIN_USER_ID,
      p_user_role: 'admin',
    });
    if (r.status !== 200) return fail(`status ${r.status}`);
    const result = r.data;
    if (!result?.success) return fail(`No success: ${JSON.stringify(result)}`);
    return ok(`Asignada a ${ADMIN_USER_ID.substring(0, 8)}...`);
  });

  await test('close_conversation', async () => {
    if (!internalConvId) return fail('internalConvId no disponible');
    const r = await rpc('close_conversation', {
      p_conversation_id: internalConvId,
      p_clinic_id: CLINIC_ID,
      p_user_role: 'admin',
    });
    if (r.status !== 200) return fail(`status ${r.status}`);
    const result = r.data;
    if (!result?.success) return fail(`No success: ${JSON.stringify(result)}`);
    return ok('Conversación cerrada');
  });

  await test('conversation_events audit log (≥4 eventos)', async () => {
    if (!internalConvId) return fail('internalConvId no disponible');
    const r = await req('GET', `/rest/v1/conversation_events?conversation_id=eq.${internalConvId}&select=type,source`);
    if (r.status !== 200) return fail(`status ${r.status}`);
    const events = Array.isArray(r.data) ? r.data : [];
    if (events.length < 4) return fail(`Solo ${events.length} evento(s) — esperaba ≥4`);
    return ok(`${events.length} eventos: ${events.map(e => e.type).join(', ')}`);
  });

  // ── 5. PORTAL API ROUTES ──────────────────────────────────────────────────
  console.log('\n━━━ 5. PORTAL API — Next.js routes autenticadas ━━');

  {

    await test('GET /api/admin/patients?today=1', async () => {
      const r = await portalReq('GET', '/api/admin/patients?today=1');
      if (r.status !== 200) return fail(`status ${r.status}: ${JSON.stringify(r.data).substring(0, 100)}`);
      const rows = Array.isArray(r.data) ? r.data : [];
      return ok(`${rows.length} cita(s) hoy vía API`);
    });

    await test('GET /api/admin/patients?q=Simulacion', async () => {
      const r = await portalReq('GET', '/api/admin/patients?q=Simulacion');
      if (r.status !== 200) return fail(`status ${r.status}: ${JSON.stringify(r.data).substring(0, 100)}`);
      const rows = Array.isArray(r.data) ? r.data : [];
      if (rows.length === 0) return fail('Búsqueda vía API no retornó resultados');
      return ok(`${rows.length} resultado(s) vía API route`);
    });

    await test('GET /api/admin/clinical-records', async () => {
      if (!patientId) return fail('patientId no disponible');
      const r = await portalReq('GET', `/api/admin/clinical-records?patient_id=${patientId}`);
      if (r.status !== 200) return fail(`status ${r.status}: ${JSON.stringify(r.data).substring(0, 100)}`);
      if (typeof r.data.total !== 'number') return fail('Respuesta no tiene campo total');
      return ok(`${r.data.records?.length} registros, total=${r.data.total}`);
    });

    await test('GET /api/admin/appointments', async () => {
      const today = new Date().toISOString().split('T')[0];
      const r = await portalReq('GET', `/api/admin/appointments?from=${today}T00:00:00&to=${today}T23:59:59`);
      if (r.status !== 200) return fail(`status ${r.status}: ${JSON.stringify(r.data).substring(0, 100)}`);
      const rows = Array.isArray(r.data) ? r.data : [];
      return ok(`${rows.length} cita(s) hoy vía appointments API`);
    });

    await test('GET /api/admin/conversations', async () => {
      const r = await portalReq('GET', '/api/admin/conversations?status=active&limit=10');
      if (r.status !== 200) return fail(`status ${r.status}: ${JSON.stringify(r.data).substring(0, 100)}`);
      const rows = Array.isArray(r.data) ? r.data : [];
      return ok(`${rows.length} conversación(es) activa(s) vía API`);
    });
  }

  // ── 6. CLEANUP ────────────────────────────────────────────────────────────
  console.log('\n━━━ 6. CLEANUP — Datos de prueba ━━━━━━━━━━━━━━━━━');

  await test('Eliminar alergias de prueba', async () => {
    if (!patientId) return ok('N/A (sin patientId)');
    const r = await req('DELETE', `/rest/v1/patient_allergies?patient_id=eq.${patientId}`);
    if (![200, 204].includes(r.status)) return fail(`status ${r.status}`);
    return ok('Alergias eliminadas');
  });

  await test('Eliminar registros clínicos de prueba', async () => {
    if (!patientId) return ok('N/A (sin patientId)');
    const r = await req('DELETE', `/rest/v1/clinical_records?patient_id=eq.${patientId}`);
    if (![200, 204].includes(r.status)) return fail(`status ${r.status}`);
    return ok('Registros clínicos eliminados');
  });

  await test('Soft-delete paciente de prueba', async () => {
    if (!patientId) return ok('N/A (sin patientId)');
    const r = await req('PATCH', `/rest/v1/patients?id=eq.${patientId}`, {
      deleted_at: new Date().toISOString()
    });
    if (![200, 204].includes(r.status)) return fail(`status ${r.status}`);
    return ok('Paciente marcado como eliminado (soft delete)');
  });

  await test('Eliminar conversación de prueba', async () => {
    if (!internalConvId) return ok('N/A');
    await req('DELETE', `/rest/v1/conversation_events?conversation_id=eq.${internalConvId}`);
    const r = await req('DELETE', `/rest/v1/conversations?id=eq.${internalConvId}`);
    if (![200, 204].includes(r.status)) return fail(`status ${r.status}`);
    return ok('Conversación y eventos eliminados');
  });

  // ── RESULTADO FINAL ───────────────────────────────────────────────────────
  const total = passed + failed;
  console.log('\n══════════════════════════════════════════════════');
  console.log(`  RESULTADO: ${passed}/${total} ✅ pasaron  |  ${failed} ❌ fallaron`);
  if (failures.length > 0) {
    console.log('\n  Fallos:');
    failures.forEach(f => console.log(`  • ${f.name}: ${f.reason}`));
  }
  console.log('══════════════════════════════════════════════════\n');

  // Write machine-readable results for CI
  const fs = require('fs');
  const results = { passed, failed, total, failures, date: new Date().toISOString() };
  fs.writeFileSync('test_results.json', JSON.stringify(results, null, 2));

  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
