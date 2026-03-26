// fix_user_clinic_assignments.js
// Corrige las asignaciones de usuarios por clínica
const https = require('https');

const HOST = 'inhyrrjidhzrbqecnptn.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Clinic IDs
const CLINICS = {
  RED_SOLUCIONES: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  SAN_MARCOS:     '56b0cf1c-2ab6-4e03-b989-044701e47271',
  ODONTOVIDA:     'f8e7d6c5-b4a3-9281-0fed-cba987654321',
  SAN_JOSE:       '78dd31da-74da-41ad-b1bc-d7143cb4bc82',
  SOFIA_DEMO:     'c6c15fca-d7fc-4d98-83c1-2c5cb5a6bef1',
};

// User IDs (from audit)
const USERS = {
  BARBARA:        '36a7e2e3-6ca4-471b-9ee7-0adff03258dc',  // barbara11.10.10@gmail.com
  GABRIEL:        '682ec1bb-ec22-444a-80df-a4de8a08e4fc',  // gbarrero57@gmail.com
  ADMIN_TEST:     '3f7ff973-dcff-44d2-8684-3ff72b7824e2',  // admin@test.sofia
  STAFF_TEST:     'f32aeffb-7288-4da3-baae-c51e13e5866c',  // staff@test.sofia
};

function request(method, path, body) {
  const b = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: HOST, path, method,
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        ...(b ? { 'Content-Length': Buffer.byteLength(b) } : {})
      }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    if (b) req.write(b);
    req.end();
  });
}

function patch(path, body) { return request('PATCH', path, body); }
function del(path)          { return request('DELETE', path, null); }
function get(path)          { return request('GET', path, null); }
function post(path, body)   { return request('POST', path, body); }

function ok(label, res) {
  const ok = res.status >= 200 && res.status < 300;
  console.log(`  ${ok ? '✅' : '❌'} ${label}: HTTP ${res.status}`);
  if (!ok) console.log('     ', res.body.slice(0, 200));
  return ok;
}

async function run() {
  console.log('══════════════════════════════════════════════════════════');
  console.log('  FIX: ASIGNACIONES USUARIO → CLÍNICA');
  console.log('══════════════════════════════════════════════════════════\n');

  // ── FIX 1: Barbara → Sofia Demo (admin) ──────────────────────────────
  console.log('FIX 1: barbara11.10.10@gmail.com → Sofia Assistant Demo (admin)');
  console.log('  Era: Clínica Dental San José con nombre "dr. carlos peres"');
  {
    const res = await patch(
      '/rest/v1/staff?user_id=eq.' + USERS.BARBARA,
      { clinic_id: CLINICS.SOFIA_DEMO, role: 'admin', full_name: 'Barbara', active: true }
    );
    ok('PATCH staff barbara → Sofia Demo', res);
  }

  // ── FIX 2: admin@test.sofia → Sofia Demo (admin test) ────────────────
  console.log('\nFIX 2: admin@test.sofia → Sofia Assistant Demo (admin de prueba)');
  console.log('  Era: Clínica Dental Red Soluciones (causaba que se viera mal el calendario)');
  {
    const res = await patch(
      '/rest/v1/staff?user_id=eq.' + USERS.ADMIN_TEST,
      { clinic_id: CLINICS.SOFIA_DEMO, role: 'admin', full_name: 'Admin Demo', active: true }
    );
    ok('PATCH staff admin@test.sofia → Sofia Demo', res);
  }

  // ── FIX 3: staff@test.sofia → Sofia Demo (staff test) ────────────────
  console.log('\nFIX 3: staff@test.sofia → Sofia Assistant Demo (staff de prueba)');
  {
    const res = await patch(
      '/rest/v1/staff?user_id=eq.' + USERS.STAFF_TEST,
      { clinic_id: CLINICS.SOFIA_DEMO, role: 'staff', full_name: 'Staff Demo', active: true }
    );
    ok('PATCH staff staff@test.sofia → Sofia Demo', res);
  }

  // ── FIX 4: Gabriel Barrero → full_name correcto ───────────────────────
  console.log('\nFIX 4: Gabriel Barrero (gbarrero57@gmail.com) → full_name corregido');
  {
    const res = await patch(
      '/rest/v1/staff?user_id=eq.' + USERS.GABRIEL,
      { full_name: 'Gabriel Barrero' }
    );
    ok('PATCH staff gabriel full_name', res);
  }

  // ── FIX 5: San José — Sin admin real, desactivar el registro erróneo ──
  // Barbara ya no está en San José. La clínica queda sin admin por ahora.
  // (No borramos, dejamos la FK limpia para cuando se asigne un admin real)
  console.log('\nINFO: San José queda sin admin. Se asignará cuando haya un admin real.');

  // ── VERIFICACIÓN FINAL ────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('VERIFICACIÓN FINAL');
  console.log('══════════════════════════════════════════════════════════');

  const { body } = await get('/rest/v1/staff?select=user_id,clinic_id,role,full_name,active&order=clinic_id.asc,role.asc');
  const rows = JSON.parse(body);

  const clinicNames = {
    [CLINICS.RED_SOLUCIONES]: 'Red Soluciones',
    [CLINICS.SAN_MARCOS]:     'San Marcos',
    [CLINICS.ODONTOVIDA]:     'OdontoVida Norte',
    [CLINICS.SAN_JOSE]:       'San José',
    [CLINICS.SOFIA_DEMO]:     'Sofia Demo',
  };

  const byClinic = {};
  rows.forEach(r => {
    const name = clinicNames[r.clinic_id] || r.clinic_id;
    if (!byClinic[name]) byClinic[name] = [];
    byClinic[name].push(r);
  });

  Object.entries(byClinic).forEach(([clinic, members]) => {
    console.log(`\n  ► ${clinic} (${members.length} usuarios)`);
    members.forEach(m => {
      console.log(`    [${m.role}] ${m.full_name || '(sin nombre)'}  |  activo: ${m.active}`);
    });
  });

  // Check Sofia Demo specifically
  const demoUsers = rows.filter(r => r.clinic_id === CLINICS.SOFIA_DEMO);
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`✅ Sofia Demo ahora tiene ${demoUsers.length} usuario(s) asignado(s).`);
  console.log('   Inicia sesión con admin@test.sofia o barbara11.10.10@gmail.com');
  console.log('   para ver el Calendario de Citas de Sofia Demo correctamente.');
  console.log('══════════════════════════════════════════════════════════');
}

run().catch(console.error);
