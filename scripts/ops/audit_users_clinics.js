// audit_users_clinics.js — Full audit: auth users, staff table, clinic assignments
const https = require('https');

const HOST = 'inhyrrjidhzrbqecnptn.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluaHlycmppZGh6cmJxZWNucHRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwNzU3NSwiZXhwIjoyMDg2NTgzNTc1fQ.-YwX0Qf4Gn8MdjFbLxCYuCJV1OzWl2qWWk4hKuU6z7k';

function get(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: HOST, path, method: 'GET',
      headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(d) }));
    });
    req.on('error', reject); req.end();
  });
}

// Supabase Admin API (auth.users) — uses /auth/v1/admin/users endpoint
function adminGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: HOST, path, method: 'GET',
      headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(d) }));
    });
    req.on('error', reject); req.end();
  });
}

async function run() {
  // 1. Get all clinics
  const { data: clinics } = await get('/rest/v1/clinics?select=id,name,subdomain,is_active&order=name.asc');

  // 2. Get all staff records
  const { data: staff } = await get('/rest/v1/staff?select=*&order=created_at.asc');

  // 3. Get auth users via admin endpoint
  const { status: authStatus, data: authData } = await adminGet('/auth/v1/admin/users?page=1&per_page=50');

  const authUsers = authData.users || authData || [];

  // Build lookup maps
  const clinicMap = {};
  clinics.forEach(c => { clinicMap[c.id] = c; });

  const userMap = {};
  authUsers.forEach(u => { userMap[u.id] = u; });

  // ── REPORT ─────────────────────────────────────────────────────────────

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  AUDIT: USUARIOS POR CLÍNICA');
  console.log('  Fecha:', new Date().toISOString().slice(0,16), 'UTC');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Section 1: Clinics overview
  console.log('CLÍNICAS REGISTRADAS (' + clinics.length + ')');
  console.log('───────────────────────────────────────────────────────────');
  clinics.forEach(c => {
    const staffCount = staff.filter(s => s.clinic_id === c.id).length;
    console.log(`  [${c.is_active ? 'ACTIVA' : 'INACT.'}] ${c.name}`);
    console.log(`           ID: ${c.id}`);
    console.log(`           Staff registrados: ${staffCount}`);
    console.log('');
  });

  // Section 2: Staff per clinic
  console.log('STAFF POR CLÍNICA');
  console.log('───────────────────────────────────────────────────────────');
  clinics.forEach(c => {
    const clinicStaff = staff.filter(s => s.clinic_id === c.id);
    console.log(`\n  ► ${c.name}`);
    if (clinicStaff.length === 0) {
      console.log('    (sin usuarios asignados)');
    } else {
      clinicStaff.forEach(s => {
        const u = userMap[s.user_id];
        const email = u ? u.email : '(usuario no encontrado en auth)';
        const lastLogin = u && u.last_sign_in_at ? u.last_sign_in_at.slice(0,16) : 'nunca';
        const confirmed = u && u.email_confirmed_at ? '✓' : '✗ no confirmado';
        console.log(`    • ${s.full_name || '(sin nombre)'}`);
        console.log(`      Email: ${email}`);
        console.log(`      Rol: ${s.role}  |  Activo: ${s.active}  |  Email: ${confirmed}`);
        console.log(`      Último login: ${lastLogin}`);
        console.log(`      user_id: ${s.user_id}`);
      });
    }
  });

  // Section 3: Auth users without staff record (orphaned)
  console.log('\n\nUSUARIOS AUTH SIN REGISTRO STAFF (huérfanos)');
  console.log('───────────────────────────────────────────────────────────');
  const staffUserIds = new Set(staff.map(s => s.user_id));
  const orphans = authUsers.filter(u => !staffUserIds.has(u.id));
  if (orphans.length === 0) {
    console.log('  ✅ Ninguno. Todos los usuarios auth tienen registro staff.');
  } else {
    orphans.forEach(u => {
      console.log(`  ⚠️  ${u.email}`);
      console.log(`      user_id: ${u.id}`);
      console.log(`      Creado: ${u.created_at ? u.created_at.slice(0,10) : 'N/A'}`);
      console.log(`      → No tiene clinic_id en JWT. No verá datos en el dashboard.`);
    });
  }

  // Section 4: Staff with wrong/missing clinic
  console.log('\n\nVALIDACIÓN INTEGRIDAD');
  console.log('───────────────────────────────────────────────────────────');
  let issues = 0;
  staff.forEach(s => {
    const clinic = clinicMap[s.clinic_id];
    const user = userMap[s.user_id];
    if (!clinic) {
      console.log(`  ❌ Staff ${s.full_name || s.user_id}: clinic_id ${s.clinic_id} NO EXISTE en clinics`);
      issues++;
    }
    if (!user) {
      console.log(`  ❌ Staff ${s.full_name || s.id}: user_id ${s.user_id} NO EXISTE en auth.users`);
      issues++;
    }
    if (clinic && !clinic.is_active) {
      console.log(`  ⚠️  Staff ${s.full_name || s.user_id}: asignado a clínica INACTIVA "${clinic.name}"`);
      issues++;
    }
  });
  if (issues === 0) {
    console.log('  ✅ Sin problemas de integridad detectados.');
  }

  // Section 5: Summary
  console.log('\n\nRESUMEN');
  console.log('───────────────────────────────────────────────────────────');
  console.log(`  Clínicas:     ${clinics.length}`);
  console.log(`  Auth users:   ${authUsers.length}`);
  console.log(`  Staff records: ${staff.length}`);
  console.log(`  Huérfanos:    ${orphans.length}`);
  console.log(`  Problemas:    ${issues}`);
  console.log('═══════════════════════════════════════════════════════════');
}

run().catch(console.error);
