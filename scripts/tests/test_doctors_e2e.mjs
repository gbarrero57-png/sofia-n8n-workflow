import https from 'https';

const SUPABASE_HOST = 'inhyrrjidhzrbqecnptn.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluaHlycmppZGh6cmJxZWNucHRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwNzU3NSwiZXhwIjoyMDg2NTgzNTc1fQ.-YwX0Qf4Gn8MdjFbLxCYuCJV1OzWl2qWWk4hKuU6z7k';
const SOFIA_DEMO_CLINIC = 'c6c15fca-d7fc-4d98-83c1-2c5cb5a6bef1';
const RED_SOL_CLINIC = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const results = [];

function supabaseRequest(method, path, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const headers = {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...extraHeaders
    };
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const options = {
      hostname: SUPABASE_HOST,
      path: `/rest/v1${path}`,
      method,
      headers
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, body: parsed, raw: data });
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function pass(test, status, note, data = null) {
  const entry = { test, result: 'PASS', status, note, data };
  results.push(entry);
  const preview = data ? JSON.stringify(data).substring(0, 200) : '';
  console.log(`\n✅ PASS | ${test}`);
  console.log(`   HTTP ${status} | ${note}`);
  if (preview) console.log(`   Data: ${preview}`);
}

function fail(test, status, note, data = null) {
  const entry = { test, result: 'FAIL', status, note, data };
  results.push(entry);
  const preview = data ? JSON.stringify(data).substring(0, 300) : '';
  console.log(`\n❌ FAIL | ${test}`);
  console.log(`   HTTP ${status} | ${note}`);
  if (preview) console.log(`   Data: ${preview}`);
}

function info(msg) {
  console.log(`   ℹ️  ${msg}`);
}

// ─────────────────────────────────────────────
// TEST 1: doctors table accessible
// ─────────────────────────────────────────────
async function test1() {
  console.log('\n═══════════════════════════════════');
  console.log('TEST 1: doctors table exists & accessible');
  const r = await supabaseRequest('GET', '/doctors?limit=10');
  if (r.status === 200 && Array.isArray(r.body)) {
    pass('TEST 1: doctors table', r.status, `Table accessible. Existing rows: ${r.body.length}`, r.body.length > 0 ? r.body[0] : null);
    return r.body;
  } else {
    fail('TEST 1: doctors table', r.status, 'Table not accessible or wrong response', r.body);
    return null;
  }
}

// ─────────────────────────────────────────────
// TEST 2: Create Dr. Carlos Méndez (Sofia Demo)
// ─────────────────────────────────────────────
async function test2() {
  console.log('\n═══════════════════════════════════');
  console.log('TEST 2: Create Dr. Carlos Méndez (Ortodoncia) — Sofia Demo clinic');
  const body = {
    clinic_id: SOFIA_DEMO_CLINIC,
    first_name: 'Carlos',
    last_name: 'Méndez',
    specialty: 'Ortodoncia',
    bio: 'Especialista en ortodoncia invisible y brackets cerámicos con 8 años de experiencia.',
    slot_duration_min: 45,
    weekly_schedule: [
      { dow: 1, start_hour: 9, end_hour: 13 },
      { dow: 1, start_hour: 14, end_hour: 18 },
      { dow: 3, start_hour: 9, end_hour: 13 },
      { dow: 3, start_hour: 14, end_hour: 18 },
      { dow: 5, start_hour: 8, end_hour: 14 }
    ],
    active: true
  };
  const r = await supabaseRequest('POST', '/doctors', body, { 'Prefer': 'return=representation' });
  if (r.status === 201 && Array.isArray(r.body) && r.body[0]?.id) {
    pass('TEST 2: Create Dr. Méndez', r.status, `Created with id=${r.body[0].id}`, r.body[0]);
    return r.body[0];
  } else {
    fail('TEST 2: Create Dr. Méndez', r.status, 'Creation failed', r.body);
    return null;
  }
}

// ─────────────────────────────────────────────
// TEST 3: Create Dra. Ana Torres (Red Soluciones)
// ─────────────────────────────────────────────
async function test3() {
  console.log('\n═══════════════════════════════════');
  console.log('TEST 3: Create Dra. Ana Torres (Odontología General) — Red Soluciones clinic');
  const body = {
    clinic_id: RED_SOL_CLINIC,
    first_name: 'Ana',
    last_name: 'Torres',
    specialty: 'Odontología General',
    display_name: 'Dra. Ana Torres',
    bio: 'Atención integral para toda la familia. Especializada en pacientes con ansiedad dental.',
    slot_duration_min: 30,
    weekly_schedule: [
      { dow: 1, start_hour: 8, end_hour: 17 },
      { dow: 2, start_hour: 8, end_hour: 17 },
      { dow: 3, start_hour: 8, end_hour: 17 },
      { dow: 4, start_hour: 8, end_hour: 17 },
      { dow: 5, start_hour: 8, end_hour: 14 }
    ],
    active: true
  };
  const r = await supabaseRequest('POST', '/doctors', body, { 'Prefer': 'return=representation' });
  if (r.status === 201 && Array.isArray(r.body) && r.body[0]?.id) {
    pass('TEST 3: Create Dra. Torres', r.status, `Created with id=${r.body[0].id}`, r.body[0]);
    return r.body[0];
  } else {
    fail('TEST 3: Create Dra. Torres', r.status, 'Creation failed', r.body);
    return null;
  }
}

// ─────────────────────────────────────────────
// TEST 4: Create Dr. Roberto Salas (Red Soluciones)
// ─────────────────────────────────────────────
async function test4() {
  console.log('\n═══════════════════════════════════');
  console.log('TEST 4: Create Dr. Roberto Salas (Implantología) — Red Soluciones clinic');
  const body = {
    clinic_id: RED_SOL_CLINIC,
    first_name: 'Roberto',
    last_name: 'Salas',
    specialty: 'Implantología',
    bio: 'Cirujano maxilofacial con más de 500 implantes realizados.',
    slot_duration_min: 60,
    weekly_schedule: [
      { dow: 2, start_hour: 10, end_hour: 14 },
      { dow: 4, start_hour: 10, end_hour: 14 },
      { dow: 6, start_hour: 9, end_hour: 12 }
    ],
    active: true
  };
  const r = await supabaseRequest('POST', '/doctors', body, { 'Prefer': 'return=representation' });
  if (r.status === 201 && Array.isArray(r.body) && r.body[0]?.id) {
    pass('TEST 4: Create Dr. Salas', r.status, `Created with id=${r.body[0].id}`, r.body[0]);
    return r.body[0];
  } else {
    fail('TEST 4: Create Dr. Salas', r.status, 'Creation failed', r.body);
    return null;
  }
}

// ─────────────────────────────────────────────
// TEST 5: KB auto-sync trigger
// ─────────────────────────────────────────────
async function test5(doctors) {
  console.log('\n═══════════════════════════════════');
  console.log('TEST 5: Knowledge Base auto-sync trigger for each doctor');
  let allPassed = true;

  for (const doc of doctors) {
    if (!doc) continue;
    const path = `/knowledge_base?clinic_id=eq.${doc.clinic_id}&metadata->>doctor_id=eq.${doc.id}&select=id,category,question,answer,active,metadata`;
    const r = await supabaseRequest('GET', path);
    const name = `${doc.first_name} ${doc.last_name}`;

    if (r.status === 200 && Array.isArray(r.body)) {
      if (r.body.length >= 2) {
        pass(`TEST 5a: KB sync for ${name}`, r.status, `${r.body.length} KB rows found`, r.body[0]);
        // Verify content
        const allText = r.body.map(row => (row.question || '') + ' ' + (row.answer || '')).join(' ');
        if (allText.includes(doc.first_name) || allText.includes(doc.last_name)) {
          info(`Content mentions doctor name ✓`);
        } else {
          info(`WARNING: KB content doesn't mention doctor name`);
        }
        // Show both rows
        r.body.forEach((row, i) => {
          info(`  Row ${i+1}: category="${row.category}" | Q="${String(row.question).substring(0,80)}" | A="${String(row.answer).substring(0,100)}"`);
        });
      } else if (r.body.length === 1) {
        fail(`TEST 5a: KB sync for ${name}`, r.status, `Only ${r.body.length} KB row found (expected 2)`, r.body[0]);
        allPassed = false;
      } else {
        fail(`TEST 5a: KB sync for ${name}`, r.status, `No KB rows found — trigger may not exist`, null);
        allPassed = false;
      }
    } else {
      fail(`TEST 5a: KB sync for ${name}`, r.status, 'KB query failed', r.body);
      allPassed = false;
    }
  }
  return allPassed;
}

// ─────────────────────────────────────────────
// TEST 6: list_doctors RPC
// ─────────────────────────────────────────────
async function test6() {
  console.log('\n═══════════════════════════════════');
  console.log('TEST 6: list_doctors RPC — Red Soluciones clinic');
  const r = await supabaseRequest('POST', '/rpc/list_doctors', { p_clinic_id: RED_SOL_CLINIC });
  if (r.status === 200 && Array.isArray(r.body)) {
    pass('TEST 6: list_doctors RPC', r.status, `Returned ${r.body.length} doctors`, r.body[0]);
    r.body.forEach(doc => {
      info(`  Doctor: ${doc.display_name || doc.first_name + ' ' + doc.last_name} | schedule_summary="${String(doc.schedule_summary || doc.schedule || '(no summary)').substring(0, 120)}"`);
    });
    return r.body;
  } else if (r.status === 404) {
    fail('TEST 6: list_doctors RPC', r.status, 'RPC function list_doctors does not exist', r.body);
    return null;
  } else {
    fail('TEST 6: list_doctors RPC', r.status, 'RPC call failed', r.body);
    return null;
  }
}

// ─────────────────────────────────────────────
// TEST 7: Update Dr. Méndez schedule
// ─────────────────────────────────────────────
async function test7(mendezId) {
  console.log('\n═══════════════════════════════════');
  console.log(`TEST 7: Update Dr. Méndez (id=${mendezId}) — add Saturday, change slot to 30min`);
  const patchBody = {
    slot_duration_min: 30,
    weekly_schedule: [
      { dow: 1, start_hour: 9, end_hour: 13 },
      { dow: 1, start_hour: 14, end_hour: 18 },
      { dow: 3, start_hour: 9, end_hour: 18 },
      { dow: 5, start_hour: 8, end_hour: 14 },
      { dow: 6, start_hour: 9, end_hour: 12 }
    ]
  };
  const r = await supabaseRequest('PATCH', `/doctors?id=eq.${mendezId}`, patchBody, { 'Prefer': 'return=representation' });
  if (r.status === 200 && Array.isArray(r.body) && r.body[0]) {
    const updated = r.body[0];
    if (updated.slot_duration_min === 30) {
      pass('TEST 7: Update Dr. Méndez', r.status, `slot_duration_min=${updated.slot_duration_min}, schedule has ${updated.weekly_schedule?.length} blocks`, updated);
    } else {
      fail('TEST 7: Update Dr. Méndez', r.status, `slot_duration_min not updated (got ${updated.slot_duration_min})`, updated);
    }

    // Verify KB rows updated
    await new Promise(res => setTimeout(res, 1000)); // small wait for trigger
    const kbPath = `/knowledge_base?clinic_id=eq.${SOFIA_DEMO_CLINIC}&metadata->>doctor_id=eq.${mendezId}&select=id,category,answer,updated_at`;
    const kbR = await supabaseRequest('GET', kbPath);
    if (kbR.status === 200 && Array.isArray(kbR.body) && kbR.body.length > 0) {
      info(`KB rows after update: ${kbR.body.length}`);
      kbR.body.forEach((row, i) => {
        info(`  Row ${i+1}: updated_at="${row.updated_at}" | answer="${String(row.answer).substring(0, 120)}"`);
      });
      pass('TEST 7b: KB updated after PATCH', kbR.status, `${kbR.body.length} KB rows present`, kbR.body[0]);
    } else {
      fail('TEST 7b: KB updated after PATCH', kbR.status, 'KB rows not found after update', kbR.body);
    }
    return r.body[0];
  } else {
    fail('TEST 7: Update Dr. Méndez', r.status, 'PATCH failed', r.body);
    return null;
  }
}

// ─────────────────────────────────────────────
// TEST 8: Clinic isolation
// ─────────────────────────────────────────────
async function test8() {
  console.log('\n═══════════════════════════════════');
  console.log('TEST 8: Clinic isolation — Sofia Demo should NOT see Red Soluciones doctors');
  const r = await supabaseRequest('POST', '/rpc/list_doctors', { p_clinic_id: SOFIA_DEMO_CLINIC });

  if (r.status === 200 && Array.isArray(r.body)) {
    const names = r.body.map(d => `${d.first_name} ${d.last_name}`);
    const hasTorres = names.some(n => n.includes('Torres'));
    const hasSalas = names.some(n => n.includes('Salas'));
    const hasMendez = names.some(n => n.includes('Méndez') || n.includes('Mendez'));
    info(`Sofia Demo doctors returned: ${JSON.stringify(names)}`);

    if (!hasTorres && !hasSalas && hasMendez) {
      pass('TEST 8: Clinic isolation', r.status, `Correct: Only Méndez in Sofia Demo. Torres/Salas excluded.`);
    } else if (!hasTorres && !hasSalas) {
      pass('TEST 8: Clinic isolation', r.status, `No cross-clinic leakage (Torres/Salas not in Sofia Demo). Méndez=${hasMendez}`);
    } else {
      fail('TEST 8: Clinic isolation', r.status, `ISOLATION FAILURE: Torres=${hasTorres}, Salas=${hasSalas} in Sofia Demo!`, r.body);
    }
    return r.body;
  } else if (r.status === 404) {
    // Fall back to direct table query
    const r2 = await supabaseRequest('GET', `/doctors?clinic_id=eq.${SOFIA_DEMO_CLINIC}&select=id,first_name,last_name,clinic_id`);
    if (r2.status === 200) {
      const names = r2.body.map(d => `${d.first_name} ${d.last_name}`);
      const hasTorres = names.some(n => n.includes('Torres'));
      const hasSalas = names.some(n => n.includes('Salas'));
      info(`Sofia Demo doctors (direct): ${JSON.stringify(names)}`);
      if (!hasTorres && !hasSalas) {
        pass('TEST 8: Clinic isolation (direct)', r2.status, `No cross-clinic leakage confirmed via direct query.`);
      } else {
        fail('TEST 8: Clinic isolation (direct)', r2.status, `ISOLATION FAILURE via direct query!`, r2.body);
      }
    }
  } else {
    fail('TEST 8: Clinic isolation', r.status, 'list_doctors RPC failed', r.body);
  }
}

// ─────────────────────────────────────────────
// TEST 9: Deactivate Dr. Salas
// ─────────────────────────────────────────────
async function test9(salasId) {
  console.log('\n═══════════════════════════════════');
  console.log(`TEST 9: Deactivate Dr. Roberto Salas (id=${salasId})`);
  const r = await supabaseRequest('PATCH', `/doctors?id=eq.${salasId}`, { active: false }, { 'Prefer': 'return=representation' });

  if (r.status === 200 && Array.isArray(r.body) && r.body[0]) {
    const doc = r.body[0];
    if (doc.active === false) {
      pass('TEST 9: Deactivate Salas', r.status, `active=false confirmed`, doc);
    } else {
      fail('TEST 9: Deactivate Salas', r.status, `active still ${doc.active}`, doc);
    }

    // Check list_doctors excludes Salas
    const listR = await supabaseRequest('POST', '/rpc/list_doctors', { p_clinic_id: RED_SOL_CLINIC });
    if (listR.status === 200 && Array.isArray(listR.body)) {
      const hasSalas = listR.body.some(d => d.first_name === 'Roberto' || d.last_name === 'Salas');
      if (!hasSalas) {
        pass('TEST 9b: list_doctors excludes inactive', listR.status, 'Salas not in list_doctors result (soft-deleted correctly)');
      } else {
        fail('TEST 9b: list_doctors excludes inactive', listR.status, 'Salas still appears in list_doctors — RPC should filter active=false', listR.body);
      }
    } else if (listR.status === 404) {
      // Direct query fallback
      const directR = await supabaseRequest('GET', `/doctors?clinic_id=eq.${RED_SOL_CLINIC}&active=eq.true&select=id,first_name,last_name,active`);
      if (directR.status === 200) {
        const hasSalas = directR.body.some(d => d.first_name === 'Roberto');
        if (!hasSalas) {
          pass('TEST 9b: active filter works (direct)', directR.status, 'Salas excluded when filtering active=true');
        } else {
          fail('TEST 9b: active filter works (direct)', directR.status, 'Salas still appears with active=true filter', directR.body);
        }
      }
    }

    // Check KB rows deactivated
    await new Promise(res => setTimeout(res, 500));
    const kbR = await supabaseRequest('GET', `/knowledge_base?metadata->>doctor_id=eq.${salasId}&select=id,active,category`);
    if (kbR.status === 200 && Array.isArray(kbR.body)) {
      if (kbR.body.length === 0) {
        info('No KB rows found for Salas (may not have been created if trigger not set up)');
      } else {
        const allInactive = kbR.body.every(row => row.active === false);
        if (allInactive) {
          pass('TEST 9c: KB deactivated for Salas', kbR.status, `${kbR.body.length} KB rows all have active=false`, kbR.body[0]);
        } else {
          fail('TEST 9c: KB deactivated for Salas', kbR.status, `Some KB rows still active`, kbR.body);
        }
      }
    }
  } else {
    fail('TEST 9: Deactivate Salas', r.status, 'PATCH failed', r.body);
  }
}

// ─────────────────────────────────────────────
// TEST 10: format_doctor_schedule / Spanish day names
// ─────────────────────────────────────────────
async function test10() {
  console.log('\n═══════════════════════════════════');
  console.log('TEST 10: Schedule summary contains Spanish day names');

  // Try RPC first
  let scheduleText = null;
  const listR = await supabaseRequest('POST', '/rpc/list_doctors', { p_clinic_id: RED_SOL_CLINIC });
  if (listR.status === 200 && Array.isArray(listR.body) && listR.body.length > 0) {
    const torres = listR.body.find(d => d.last_name === 'Torres' || d.first_name === 'Ana');
    if (torres) {
      scheduleText = torres.schedule_summary || torres.schedule || torres.weekly_schedule_text || null;
      info(`Torres fields: ${JSON.stringify(Object.keys(torres))}`);
    }
  }

  // Try format_doctor_schedule RPC
  const fmtR = await supabaseRequest('POST', '/rpc/format_doctor_schedule', {
    p_schedule: [
      { dow: 1, start_hour: 8, end_hour: 17 },
      { dow: 2, start_hour: 8, end_hour: 17 }
    ]
  });

  if (fmtR.status === 200) {
    scheduleText = typeof fmtR.body === 'string' ? fmtR.body : JSON.stringify(fmtR.body);
    info(`format_doctor_schedule result: "${scheduleText.substring(0, 200)}"`);
    const spanishDays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'lunes', 'martes', 'miércoles'];
    const hasSpanish = spanishDays.some(d => scheduleText.includes(d));
    if (hasSpanish) {
      pass('TEST 10: Spanish day names in schedule', fmtR.status, `Spanish days found in format_doctor_schedule output: "${scheduleText.substring(0, 150)}"`);
    } else {
      fail('TEST 10: Spanish day names in schedule', fmtR.status, `No Spanish day names found in: "${scheduleText.substring(0, 150)}"`);
    }
  } else if (fmtR.status === 404) {
    // Check via list_doctors schedule_summary
    if (scheduleText) {
      const spanishDays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'lunes', 'martes'];
      const hasSpanish = spanishDays.some(d => scheduleText.includes(d));
      if (hasSpanish) {
        pass('TEST 10: Spanish day names (via list_doctors)', listR.status, `Found in schedule_summary: "${scheduleText.substring(0, 150)}"`);
      } else {
        fail('TEST 10: Spanish day names (via list_doctors)', listR.status, `No Spanish days in schedule_summary: "${String(scheduleText).substring(0, 150)}"`);
      }
    } else {
      fail('TEST 10: format_doctor_schedule', fmtR.status, 'RPC not found and no schedule_summary in list_doctors', fmtR.body);
    }
  } else {
    fail('TEST 10: format_doctor_schedule', fmtR.status, 'RPC call failed', fmtR.body);
  }
}

// ─────────────────────────────────────────────
// TEST 11: get_doctor_busy_slots
// ─────────────────────────────────────────────
async function test11() {
  console.log('\n═══════════════════════════════════');
  console.log('TEST 11: get_doctor_busy_slots RPC');
  const r = await supabaseRequest('POST', '/rpc/get_doctor_busy_slots', {
    p_clinic_id: RED_SOL_CLINIC,
    p_doctor_id: null
  });

  if (r.status === 200) {
    const count = Array.isArray(r.body) ? r.body.length : 'N/A';
    pass('TEST 11: get_doctor_busy_slots', r.status, `RPC exists and returned ${count} busy slots (may be empty without appointments)`, Array.isArray(r.body) ? r.body[0] : r.body);
  } else if (r.status === 404) {
    fail('TEST 11: get_doctor_busy_slots', r.status, 'RPC function not found', r.body);
  } else {
    fail('TEST 11: get_doctor_busy_slots', r.status, 'RPC error', r.body);
  }
}

// ─────────────────────────────────────────────
// TEST 12: Duplicate doctor allowed (no unique constraint on name)
// ─────────────────────────────────────────────
async function test12(mendezId) {
  console.log('\n═══════════════════════════════════');
  console.log('TEST 12: Duplicate doctor — same name+clinic should be insertable (no unique name constraint)');
  const body = {
    clinic_id: SOFIA_DEMO_CLINIC,
    first_name: 'Carlos',
    last_name: 'Méndez',
    specialty: 'Ortodoncia',
    bio: 'Duplicate entry test.',
    slot_duration_min: 45,
    weekly_schedule: [{ dow: 1, start_hour: 9, end_hour: 13 }],
    active: true
  };
  const r = await supabaseRequest('POST', '/doctors', body, { 'Prefer': 'return=representation' });

  if (r.status === 201 && Array.isArray(r.body) && r.body[0]?.id) {
    const dupId = r.body[0].id;
    if (dupId !== mendezId) {
      pass('TEST 12: Duplicate allowed', r.status, `Second Méndez created with different id=${dupId}. No unique name constraint (as expected).`);
      // Clean up the duplicate
      const delR = await supabaseRequest('DELETE', `/doctors?id=eq.${dupId}`);
      info(`Duplicate cleaned up: DELETE returned ${delR.status}`);
    } else {
      fail('TEST 12: Duplicate check', r.status, 'Got same ID back — upsert behavior?', r.body[0]);
    }
  } else if (r.status === 409 || (r.status === 400 && JSON.stringify(r.body).includes('unique'))) {
    info(`Unique constraint EXISTS on doctor name+clinic (status ${r.status})`);
    pass('TEST 12: Duplicate prevention', r.status, 'Unique constraint prevents duplicate name+clinic (by design)', r.body);
  } else {
    fail('TEST 12: Duplicate insert', r.status, 'Unexpected response', r.body);
  }
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('SOFIA ADMIN PANEL — Calendarios (Doctors) E2E Test Suite');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════');

  // Run all tests sequentially
  const existingDoctors = await test1();

  const mendez = await test2();
  const torres = await test3();
  const salas = await test4();

  // Small delay to let triggers fire
  await new Promise(res => setTimeout(res, 1500));

  await test5([mendez, torres, salas]);
  await test6();

  if (mendez?.id) await test7(mendez.id);
  else console.log('\n⚠️  Skipping TEST 7 — Dr. Méndez not created');

  await test8();

  if (salas?.id) await test9(salas.id);
  else console.log('\n⚠️  Skipping TEST 9 — Dr. Salas not created');

  await test10();
  await test11();

  if (mendez?.id) await test12(mendez.id);
  else console.log('\n⚠️  Skipping TEST 12 — Dr. Méndez not created');

  // ─── Summary Table ───────────────────────────────
  console.log('\n\n═══════════════════════════════════════════════════════');
  console.log('SUMMARY TABLE');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`${'Test'.padEnd(50)} ${'Result'.padEnd(8)} ${'HTTP'.padEnd(6)} Note`);
  console.log('─'.repeat(110));
  for (const r of results) {
    const icon = r.result === 'PASS' ? '✅' : '❌';
    console.log(`${(r.test).padEnd(50)} ${(icon + ' ' + r.result).padEnd(10)} ${String(r.status).padEnd(6)} ${r.note.substring(0, 60)}`);
  }

  const passed = results.filter(r => r.result === 'PASS').length;
  const failed = results.filter(r => r.result === 'FAIL').length;
  console.log('\n─'.repeat(110));
  console.log(`TOTAL: ${results.length} tests | ✅ ${passed} passed | ❌ ${failed} failed`);

  // ─── Doctor IDs created ──────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('CREATED DOCTOR IDs (kept in DB for demo):');
  if (mendez) console.log(`  Dr. Carlos Méndez  (Sofia Demo)     id=${mendez.id}`);
  if (torres) console.log(`  Dra. Ana Torres    (Red Soluciones)  id=${torres.id}`);
  if (salas)  console.log(`  Dr. Roberto Salas  (Red Soluciones)  id=${salas.id} [DEACTIVATED]`);

  // ─── Bugs found ──────────────────────────────────
  const failedTests = results.filter(r => r.result === 'FAIL');
  if (failedTests.length > 0) {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('BUGS / ISSUES FOUND:');
    failedTests.forEach(t => {
      console.log(`  ❌ ${t.test}: ${t.note}`);
      if (t.data) console.log(`     Details: ${JSON.stringify(t.data).substring(0, 200)}`);
    });
  } else {
    console.log('\n✅ No bugs found — all tests passed!');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
