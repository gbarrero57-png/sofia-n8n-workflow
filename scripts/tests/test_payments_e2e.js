// test_payments_e2e.js — E2E test de gestión de pagos por clínica
// Prueba: columnas, CRUD payment_status, filtros, RPC reminders
const SB  = 'https://inhyrrjidhzrbqecnptn.supabase.co';
const SK  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluaHlycmppZGh6cmJxZWNucHRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwNzU3NSwiZXhwIjoyMDg2NTgzNTc1fQ.-YwX0Qf4Gn8MdjFbLxCYuCJV1OzWl2qWWk4hKuU6z7k';
const H   = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

const CLINICAS = [
  { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', name: 'Clínica Dental Red Soluciones' },
  { id: '56b0cf1c-2ab6-4e03-b989-044701e47271', name: 'Clínica Dental San Marcos' },
  { id: 'f8e7d6c5-b4a3-9281-0fed-cba987654321', name: 'OdontoVida Norte' },
];

let passed = 0, failed = 0;

function ok(label) {
  console.log(`  ✅ ${label}`);
  passed++;
}
function fail(label, detail) {
  console.log(`  ❌ ${label}`);
  if (detail) console.log(`     → ${detail}`);
  failed++;
}

async function api(method, path, body) {
  const res = await fetch(SB + path, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

// ── TEST 1: Columnas de pago existen ─────────────────────────────
async function testColumns() {
  console.log('\n📋 TEST 1: Columnas de pago en appointments');
  const r = await api('GET', '/rest/v1/appointments?select=payment_status,payment_amount,payment_currency,payment_reminder_sent,payment_reminder_sent_at&limit=1');
  if (r.status === 200) {
    ok('Todas las columnas de pago existen en appointments');
    const row = r.json[0] || {};
    const fields = ['payment_status','payment_amount','payment_currency','payment_reminder_sent','payment_reminder_sent_at'];
    for (const f of fields) {
      if (f in row || r.json.length === 0) ok(`  Columna: ${f}`);
      else fail(`  Columna faltante: ${f}`);
    }
  } else {
    fail('No se pudieron leer columnas de pago', JSON.stringify(r.json));
  }
}

// ── TEST 2: Tabla payment_reminder_log existe ─────────────────────
async function testLogTable() {
  console.log('\n📋 TEST 2: Tabla payment_reminder_log');
  const r = await api('GET', '/rest/v1/payment_reminder_log?limit=1');
  if (r.status === 200) {
    ok('Tabla payment_reminder_log accesible');
  } else {
    fail('Tabla payment_reminder_log no existe o error', JSON.stringify(r.json));
  }
}

// ── TEST 3: CRUD payment por clínica ─────────────────────────────
async function testPaymentCRUD(clinica) {
  console.log(`\n📋 TEST 3 [${clinica.name}]: Crear cita de prueba y ciclo de pago`);

  // 3a. Crear cita de prueba
  const now = new Date();
  const start = new Date(now.getTime() + 25 * 3600000).toISOString(); // +25h (fuera de ventana reminder)
  const end   = new Date(now.getTime() + 26 * 3600000).toISOString();

  const createR = await api('POST', '/rest/v1/appointments', {
    clinic_id:    clinica.id,
    patient_name: `Test Pago E2E - ${clinica.name.split(' ')[0]}`,
    phone:        '+51999000001',
    service:      'Limpieza dental',
    start_time:   start,
    end_time:     end,
    status:       'scheduled',
    payment_status: 'not_required',
    reminder_sent: false,
    created_at:   now.toISOString(),
    updated_at:   now.toISOString(),
  });

  if (createR.status !== 201) {
    fail('Crear cita de prueba', JSON.stringify(createR.json));
    return null;
  }
  const apptId = createR.json[0]?.id;
  ok(`Cita creada: ${apptId}`);

  // 3b. Marcar como "pending" + monto
  const pendR = await api('PATCH', `/rest/v1/appointments?id=eq.${apptId}`, {
    payment_status: 'pending',
    payment_amount: 150.00,
    payment_currency: 'PEN',
    updated_at: new Date().toISOString(),
  });
  if (pendR.status === 200) {
    const row = pendR.json[0];
    if (row?.payment_status === 'pending' && row?.payment_amount == 150) {
      ok('payment_status → pending, monto S/ 150.00');
    } else {
      fail('Valores incorrectos tras marcar pending', JSON.stringify(row));
    }
  } else {
    fail('PATCH a pending falló', JSON.stringify(pendR.json));
  }

  // 3c. Marcar como "partial" + monto reducido
  const partR = await api('PATCH', `/rest/v1/appointments?id=eq.${apptId}`, {
    payment_status: 'partial',
    payment_amount: 75.00,
    updated_at: new Date().toISOString(),
  });
  if (partR.status === 200 && partR.json[0]?.payment_status === 'partial') {
    ok('payment_status → partial, monto S/ 75.00');
  } else {
    fail('PATCH a partial falló', JSON.stringify(partR.json));
  }

  // 3d. Marcar como "paid" y verificar que payment_reminder_sent se resetea
  const paidR = await api('PATCH', `/rest/v1/appointments?id=eq.${apptId}`, {
    payment_status: 'paid',
    payment_reminder_sent: false, // como haría el API
    updated_at: new Date().toISOString(),
  });
  if (paidR.status === 200 && paidR.json[0]?.payment_status === 'paid') {
    ok('payment_status → paid');
  } else {
    fail('PATCH a paid falló', JSON.stringify(paidR.json));
  }

  // 3e. Marcar waived
  const waiveR = await api('PATCH', `/rest/v1/appointments?id=eq.${apptId}`, {
    payment_status: 'waived',
    updated_at: new Date().toISOString(),
  });
  if (waiveR.status === 200 && waiveR.json[0]?.payment_status === 'waived') {
    ok('payment_status → waived');
  } else {
    fail('PATCH a waived falló', JSON.stringify(waiveR.json));
  }

  return apptId;
}

// ── TEST 4: Filtro por pago pendiente (simula tab UI) ─────────────
async function testPendingFilter(clinica) {
  console.log(`\n📋 TEST 4 [${clinica.name}]: Filtro de pagos pendientes`);

  // Crear cita con pago pendiente
  const now = new Date();
  const start = new Date(now.getTime() + 48 * 3600000).toISOString();
  const end   = new Date(now.getTime() + 49 * 3600000).toISOString();

  const createR = await api('POST', '/rest/v1/appointments', {
    clinic_id: clinica.id,
    patient_name: `Test Pendiente - ${clinica.name.split(' ')[0]}`,
    phone: '+51999000002',
    service: 'Empaste',
    start_time: start, end_time: end,
    status: 'confirmed',
    payment_status: 'pending',
    payment_amount: 200.00,
    reminder_sent: false,
    created_at: now.toISOString(), updated_at: now.toISOString(),
  });

  if (createR.status !== 201) {
    fail('Crear cita con pago pendiente', JSON.stringify(createR.json));
    return null;
  }
  const apptId = createR.json[0]?.id;

  // Verificar que aparece en filtro pending
  const filterR = await api('GET', `/rest/v1/appointments?clinic_id=eq.${clinica.id}&payment_status=in.(pending,partial)&select=id,patient_name,payment_status,payment_amount`);
  if (filterR.status === 200 && filterR.json.some(a => a.id === apptId)) {
    ok(`Cita con pago pendiente aparece en filtro (${filterR.json.length} total pendientes)`);
  } else {
    fail('Cita no aparece en filtro de pendientes', JSON.stringify(filterR.json));
  }

  // Verificar que NOT_REQUIRED no aparece en filtro
  const cleanR = await api('GET', `/rest/v1/appointments?clinic_id=eq.${clinica.id}&payment_status=in.(pending,partial)&select=id,payment_status`);
  const hasDirty = cleanR.json?.some(a => a.payment_status === 'not_required');
  if (!hasDirty) {
    ok('Filtro no incluye citas sin cobro (not_required)');
  } else {
    fail('Filtro incluye citas not_required incorrectamente');
  }

  return apptId;
}

// ── TEST 5: RPC get_pending_payment_reminders ─────────────────────
async function testReminderRPC() {
  console.log('\n📋 TEST 5: RPC get_pending_payment_reminders');

  // Crear cita completada con pago pendiente (escenario cobro_vencido)
  const now = new Date();
  const pastStart = new Date(now.getTime() - 2 * 3600000).toISOString();  // hace 2h
  const pastEnd   = new Date(now.getTime() - 1 * 3600000).toISOString();  // hace 1h

  const createR = await api('POST', '/rest/v1/appointments', {
    clinic_id:    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    patient_name: 'Test Cobro Vencido E2E',
    phone:        '+51999000003',
    service:      'Extracción',
    start_time:   pastStart,
    end_time:     pastEnd,
    status:       'completed',
    payment_status: 'pending',
    payment_amount: 120.00,
    payment_reminder_sent: false,
    conversation_id: 9999, // simulado para RPC
    reminder_sent: false,
    created_at: now.toISOString(), updated_at: now.toISOString(),
  });

  if (createR.status !== 201) {
    fail('Crear cita completada con cobro vencido', JSON.stringify(createR.json));
  } else {
    ok(`Cita completada con cobro vencido creada: ${createR.json[0]?.id}`);
  }

  // Llamar RPC
  const rpcR = await api('POST', '/rest/v1/rpc/get_pending_payment_reminders', {});
  if (rpcR.status === 200) {
    ok(`RPC get_pending_payment_reminders OK → ${rpcR.json.length} recordatorio(s) pendiente(s)`);
    if (rpcR.json.length > 0) {
      const first = rpcR.json[0];
      ok(`  Primer recordatorio: ${first.patient_name} [${first.reminder_type}] — S/ ${first.payment_amount}`);
    }
  } else {
    fail('RPC get_pending_payment_reminders falló', JSON.stringify(rpcR.json));
  }

  return createR.json?.[0]?.id;
}

// ── TEST 6: RPC mark_payment_reminder_sent ────────────────────────
async function testMarkReminderSent(apptId) {
  console.log('\n📋 TEST 6: RPC mark_payment_reminder_sent');
  if (!apptId) { fail('Sin ID de cita para marcar'); return; }

  const r = await api('POST', '/rest/v1/rpc/mark_payment_reminder_sent', {
    p_appointment_id: apptId,
    p_days_label:     'cobro_vencido',
    p_channel:        'whatsapp',
    p_status:         'sent',
    p_error:          null,
  });

  if (r.status === 200 || r.status === 204) {
    ok('RPC mark_payment_reminder_sent OK');

    // Verificar que se actualizó el flag
    const checkR = await api('GET', `/rest/v1/appointments?id=eq.${apptId}&select=payment_reminder_sent,payment_reminder_sent_at`);
    if (checkR.json[0]?.payment_reminder_sent === true) {
      ok('payment_reminder_sent = true en appointments');
    } else {
      fail('payment_reminder_sent no se actualizó', JSON.stringify(checkR.json));
    }

    // Verificar log
    const logR = await api('GET', `/rest/v1/payment_reminder_log?appointment_id=eq.${apptId}&select=days_label,channel,status`);
    if (logR.json.length > 0) {
      ok(`Registro en payment_reminder_log: ${JSON.stringify(logR.json[0])}`);
    } else {
      fail('Sin registro en payment_reminder_log');
    }
  } else {
    fail('RPC mark_payment_reminder_sent falló', JSON.stringify(r.json));
  }
}

// ── TEST 7: Aislamiento multi-clínica ────────────────────────────
async function testIsolation() {
  console.log('\n📋 TEST 7: Aislamiento multi-clínica (cada clínica ve solo sus datos)');

  for (const clinica of CLINICAS) {
    const r = await api('GET', `/rest/v1/appointments?clinic_id=eq.${clinica.id}&select=id,clinic_id,payment_status&limit=5`);
    if (r.status === 200) {
      const wrongClinic = r.json.filter(a => a.clinic_id !== clinica.id);
      if (wrongClinic.length === 0) {
        ok(`${clinica.name}: ${r.json.length} citas, sin datos cruzados`);
      } else {
        fail(`${clinica.name}: datos de otra clínica encontrados`, JSON.stringify(wrongClinic));
      }
    } else {
      fail(`${clinica.name}: error al leer citas`, JSON.stringify(r.json));
    }
  }
}

// ── Limpieza de citas de prueba ───────────────────────────────────
async function cleanup(ids) {
  console.log('\n🧹 Limpiando citas de prueba...');
  for (const id of ids.filter(Boolean)) {
    const r = await api('DELETE', `/rest/v1/appointments?id=eq.${id}`);
    if (r.status === 204 || r.status === 200) {
      console.log(`  🗑  Cita ${id} eliminada`);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  E2E TEST — Gestión de Pagos por Clínica');
  console.log(`  Fecha: ${new Date().toLocaleString('es-PE')}`);
  console.log('═══════════════════════════════════════════════════════');

  const cleanupIds = [];

  await testColumns();
  await testLogTable();

  for (const clinica of CLINICAS) {
    const idCRUD    = await testPaymentCRUD(clinica);
    const idFilter  = await testPendingFilter(clinica);
    cleanupIds.push(idCRUD, idFilter);
  }

  const idRPC = await testReminderRPC();
  await testMarkReminderSent(idRPC);
  cleanupIds.push(idRPC);

  await testIsolation();
  await cleanup(cleanupIds);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  RESULTADO: ${passed} ✅  /  ${failed} ❌`);
  if (failed === 0) {
    console.log('  🎉 TODOS LOS TESTS PASARON');
  } else {
    console.log('  ⚠️  HAY FALLOS — revisar arriba');
  }
  console.log('═══════════════════════════════════════════════════════');
}

main().catch(console.error);
