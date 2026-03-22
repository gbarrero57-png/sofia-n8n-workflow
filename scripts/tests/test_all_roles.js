/**
 * test_all_roles.js — Comprehensive role permission & isolation tests
 *
 * Creates temporary test users for each role, hits every API endpoint,
 * verifies correct access control, then cleans up.
 *
 * Roles tested:
 *   superadmin  — gbarrero57@gmail.com (identified by SUPERADMIN_EMAIL env var)
 *   admin       — full CRUD within own clinic
 *   staff       — read-only, blocked from write operations
 *   cross-clinic — admin of clinic B cannot see clinic A data
 *
 * Usage:
 *   node saas/test_all_roles.js
 */

const SUPABASE_URL = 'https://inhyrrjidhzrbqecnptn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluaHlycmppZGh6cmJxZWNucHRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwNzU3NSwiZXhwIjoyMDg2NTgzNTc1fQ.-YwX0Qf4Gn8MdjFbLxCYuCJV1OzWl2qWWk4hKuU6z7k';
const PANEL_URL   = 'https://sofia-admin-theta.vercel.app';
const CLINIC1_ID  = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const CLINIC2_ID  = '56b0cf1c-2ab6-4e03-b989-044701e47271'; // San Marcos

const SB = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

const TEST_PASSWORD = 'TestPass2024!';

const created_users = [];
let passed = 0, failed = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pass(label) { console.log(`  ✅ ${label}`); passed++; }
function fail(label, got) { console.log(`  ❌ ${label} — got: ${JSON.stringify(got)?.slice(0,120)}`); failed++; }
function check(label, condition, got) { condition ? pass(label) : fail(label, got); }

async function sbCreateUser(email, clinicId, role) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST', headers: SB,
    body: JSON.stringify({ email, password: TEST_PASSWORD, email_confirm: true }),
  });
  const u = await r.json();
  if (!u.id) throw new Error(`Failed to create auth user ${email}: ${JSON.stringify(u)}`);

  await fetch(`${SUPABASE_URL}/rest/v1/staff`, {
    method: 'POST',
    headers: { ...SB, Prefer: 'return=representation' },
    body: JSON.stringify({ user_id: u.id, clinic_id: clinicId, role, full_name: `Test ${role}`, active: true }),
  });

  created_users.push(u.id);
  return u.id;
}

async function sbDeleteUser(userId) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: SB });
}

async function login(email, password = TEST_PASSWORD) {
  const r = await fetch(`${PANEL_URL}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const cookie = r.headers.get('set-cookie');
  const body = await r.json();
  return { ok: r.ok, status: r.status, body, cookie };
}

async function api(method, path, cookie, body) {
  const opts = { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${PANEL_URL}${path}`, opts);
  return { status: r.status, body: await r.json().catch(() => null) };
}

const delay = ms => new Promise(r => setTimeout(r, ms));

// ─── Test suites ──────────────────────────────────────────────────────────────

async function testLogin(label, email, password, expectOk) {
  const { ok, status, body } = await login(email, password);
  check(`${label} login ${expectOk ? 'succeeds' : 'fails'}`, expectOk ? ok : !ok, { status, body });
  return ok;
}

async function testMe(label, cookie, expectedRole, expectedSuperadmin) {
  const { status, body } = await api('GET', '/api/auth/me', cookie);
  check(`${label} /me returns 200`, status === 200, status);
  if (expectedRole) check(`${label} role=${expectedRole}`, body?.role === expectedRole, body?.role);
  if (expectedSuperadmin !== undefined) check(`${label} is_superadmin=${expectedSuperadmin}`, body?.is_superadmin === expectedSuperadmin, body?.is_superadmin);
  return body;
}

async function testMetrics(label, cookie, expectOk = true) {
  const { status, body } = await api('GET', '/api/admin/metrics?days=30', cookie);
  check(`${label} can read metrics`, expectOk ? status === 200 : status === 401, { status, has_data: !!body?.total_conversations_all });
}

async function testKnowledgeRead(label, cookie, expectOk = true) {
  const { status, body } = await api('GET', '/api/admin/knowledge', cookie);
  check(`${label} can read KB`, expectOk ? status === 200 : status === 401, status);
  return body;
}

async function testKnowledgeWrite(label, cookie, expectOk = true) {
  const { status, body } = await api('POST', '/api/admin/knowledge', cookie, {
    question: `[TEST] Pregunta de prueba ${Date.now()}`,
    answer: 'Respuesta de prueba',
    category: 'general',
  });
  check(`${label} KB write ${expectOk ? 'allowed' : 'blocked'}`, expectOk ? status === 200 : status >= 401, { status });
  if (status === 200 && body?.id) {
    // Clean up
    await api('DELETE', `/api/admin/knowledge?id=${body.id}`, cookie);
  }
}

async function testAppointmentsRead(label, cookie, expectOk = true) {
  const { status } = await api('GET', '/api/admin/appointments', cookie);
  check(`${label} can read appointments`, expectOk ? status === 200 : status === 401, status);
}

async function testAppointmentsWrite(label, cookie, expectOk = true) {
  // Get first appointment to update
  const { body: appts } = await api('GET', '/api/admin/appointments', cookie);
  if (!Array.isArray(appts) || appts.length === 0) {
    console.log(`  ⚪ ${label} appointment write — no appointments to test`);
    return;
  }
  const appt = appts[0];
  const { status } = await api('PATCH', '/api/admin/appointments', cookie, {
    id: appt.id, status: appt.status, // update with same status (no-op)
  });
  check(`${label} appointment write ${expectOk ? 'allowed' : 'blocked'}`, expectOk ? status === 200 : status >= 401, status);
}

async function testUsersRead(label, cookie, expectOk = true) {
  const { status } = await api('GET', '/api/admin/users', cookie);
  check(`${label} can read users`, expectOk ? status === 200 : status >= 401, status);
}

async function testUsersWrite(label, cookie, expectOk = true) {
  const { status } = await api('POST', '/api/admin/users', cookie, {
    email: `noop_${Date.now()}@test.com`, password: 'Noop1234!', full_name: 'Test', role: 'staff',
  });
  // If created, immediately delete
  check(`${label} user create ${expectOk ? 'allowed' : 'blocked'}`, expectOk ? status === 201 : status >= 401, status);
  if (status === 201) {
    const { body: users } = await api('GET', '/api/admin/users', cookie);
    const newUser = Array.isArray(users) ? users.find(u => u.email?.includes('noop_')) : null;
    if (newUser) await api('DELETE', `/api/admin/users?id=${newUser.id}`, cookie);
  }
}

async function testOnboardAccess(label, cookie, expectOk = true) {
  const { status } = await api('GET', '/api/admin/onboard', cookie);
  check(`${label} onboard access ${expectOk ? 'allowed' : 'blocked'}`, expectOk ? status === 200 : status === 403, status);
}

async function testCrossClinicIsolation(label, cookie, ownClinicId) {
  // Read metrics — should reflect only own clinic data
  const { status, body } = await api('GET', '/api/admin/metrics?days=30', cookie);
  check(`${label} metrics accessible`, status === 200, status);

  // Read KB — should only return own clinic's KB
  const { body: kb } = await api('GET', '/api/admin/knowledge', cookie);
  if (Array.isArray(kb) && kb.length > 0) {
    const allOwnClinic = kb.every(entry => entry.clinic_id === ownClinicId);
    check(`${label} KB only shows own clinic data`, allOwnClinic, kb.map(e => e.clinic_id));
  } else {
    console.log(`  ⚪ ${label} KB isolation — empty KB`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '═'.repeat(65));
  console.log('SofIA — Comprehensive Role Permission Tests');
  console.log('═'.repeat(65));

  // Create test users
  console.log('\n[SETUP] Creating test users...');
  let testAdminId, testStaffId;
  try {
    testAdminId = await sbCreateUser(`test_admin_${Date.now()}@sofiadent.com`, CLINIC1_ID, 'admin');
    testStaffId = await sbCreateUser(`test_staff_${Date.now()}@sofiadent.com`, CLINIC1_ID, 'staff');
    console.log(`  ✓ test_admin created`);
    console.log(`  ✓ test_staff created`);
  } catch (err) {
    console.error('[FATAL] Cannot create test users:', err.message);
    process.exit(1);
  }

  // Re-fetch emails (we need them to login)
  const testAdminEmail = `test_admin_${created_users[0] ? '' : ''}`;
  // Use created user IDs to get emails
  const [adminUser, staffUser] = await Promise.all([
    fetch(`${SUPABASE_URL}/auth/v1/admin/users/${testAdminId}`, { headers: SB }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/auth/v1/admin/users/${testStaffId}`, { headers: SB }).then(r => r.json()),
  ]);

  const adminEmail = adminUser.email;
  const staffEmail = staffUser.email;

  console.log(`  admin: ${adminEmail}`);
  console.log(`  staff: ${staffEmail}`);
  console.log(`  clinic2 admin: admin@clinicasanmarcos.com`);

  // Wait for Supabase user propagation
  await delay(2000);

  // Login all users
  console.log('\n[SETUP] Logging in test users...');
  const adminLogin   = await login(adminEmail);
  const staffLogin   = await login(staffEmail);
  const clinic2Login = await login('admin@clinicasanmarcos.com', TEST_PASSWORD);

  if (!adminLogin.cookie) { console.error('[FATAL] Admin login failed:', JSON.stringify(adminLogin.body)); process.exit(1); }
  if (!staffLogin.cookie) { console.error('[FATAL] Staff login failed:', JSON.stringify(staffLogin.body)); process.exit(1); }
  if (!clinic2Login.cookie) { console.error('[FATAL] Clinic2 login failed:', JSON.stringify(clinic2Login.body)); process.exit(1); }

  const adminCookie   = adminLogin.cookie;
  const staffCookie   = staffLogin.cookie;
  const clinic2Cookie = clinic2Login.cookie;
  console.log('  ✓ All test users logged in');

  // ─── Suite 1: Login security ─────────────────────────────────────────────
  console.log('\n[SUITE 1] Login security');
  await testLogin('Wrong password', adminEmail, 'WrongPass!', false);
  await testLogin('Non-existent user', 'nobody@nowhere.com', 'Test1234!', false);
  await testLogin('Empty password', adminEmail, '', false);

  // ─── Suite 2: /api/auth/me ────────────────────────────────────────────────
  console.log('\n[SUITE 2] /api/auth/me — role detection');
  await testMe('Admin user', adminCookie, 'admin', false);
  await testMe('Staff user', staffCookie, 'staff', false);
  await testMe('Clinic2 admin', clinic2Cookie, 'admin', false);

  const { status: unauthStatus } = await api('GET', '/api/auth/me', 'sb-token=invalid');
  check('Unauthenticated /me returns 401', unauthStatus === 401, unauthStatus);

  // ─── Suite 3: Metrics ─────────────────────────────────────────────────────
  console.log('\n[SUITE 3] Metrics access');
  await testMetrics('Admin', adminCookie, true);
  await testMetrics('Staff', staffCookie, true);
  await testMetrics('Clinic2 admin', clinic2Cookie, true);
  const { status: metricsUnauth } = await api('GET', '/api/admin/metrics?days=30', 'sb-token=bad');
  check('Unauthenticated metrics returns 401', metricsUnauth === 401, metricsUnauth);

  // ─── Suite 4: Knowledge base ──────────────────────────────────────────────
  console.log('\n[SUITE 4] Knowledge base (CRUD)');
  await testKnowledgeRead('Admin', adminCookie, true);
  await testKnowledgeRead('Staff', staffCookie, true);
  await testKnowledgeWrite('Admin', adminCookie, true);
  await testKnowledgeWrite('Staff', staffCookie, true); // staff can also write KB in current design

  // ─── Suite 5: Appointments ────────────────────────────────────────────────
  console.log('\n[SUITE 5] Appointments');
  await testAppointmentsRead('Admin', adminCookie, true);
  await testAppointmentsRead('Staff', staffCookie, true);
  await testAppointmentsWrite('Admin', adminCookie, true);

  // Invalid status value
  const { body: appts } = await api('GET', '/api/admin/appointments', adminCookie);
  if (Array.isArray(appts) && appts.length > 0) {
    const { status } = await api('PATCH', '/api/admin/appointments', adminCookie, { id: appts[0].id, status: 'INVALID_STATUS' });
    check('Invalid status value rejected', status === 400, status);
  }

  // ─── Suite 6: Users management ────────────────────────────────────────────
  console.log('\n[SUITE 6] Users management');
  await testUsersRead('Admin', adminCookie, true);
  await testUsersRead('Staff', staffCookie, true); // staff can read users
  await testUsersWrite('Admin', adminCookie, true);
  await testUsersWrite('Staff', staffCookie, false); // staff blocked from creating users

  // ─── Suite 7: Onboarding (superadmin only) ────────────────────────────────
  console.log('\n[SUITE 7] Onboarding — superadmin gate');
  await testOnboardAccess('Admin', adminCookie, false);
  await testOnboardAccess('Staff', staffCookie, false);
  await testOnboardAccess('Clinic2 admin', clinic2Cookie, false);

  // Clinic 2 admin can't POST onboard either
  const { status: onboardPostStatus } = await api('POST', '/api/admin/onboard', clinic2Cookie, {
    clinic: { name: 'Hack Clinic', subdomain: 'hack' },
    admin: { email: 'hack@test.com', password: 'Hack1234!' },
  });
  check('Non-superadmin cannot POST onboard', onboardPostStatus === 403, onboardPostStatus);

  // ─── Suite 8: Cross-clinic data isolation ─────────────────────────────────
  console.log('\n[SUITE 8] Cross-clinic data isolation');
  await testCrossClinicIsolation('Clinic1 admin', adminCookie, CLINIC1_ID);
  await testCrossClinicIsolation('Clinic2 admin', clinic2Cookie, CLINIC2_ID);

  // Clinic2 admin should see 0 conversations from Clinic1
  const { body: c2metrics } = await api('GET', '/api/admin/metrics?days=30', clinic2Cookie);
  const { body: c1metrics } = await api('GET', '/api/admin/metrics?days=30', adminCookie);
  check('Clinic2 sees 0 conversations (own data)', c2metrics?.total_conversations_all === 0, c2metrics?.total_conversations_all);
  check('Clinic1 sees >0 conversations (own data)', (c1metrics?.total_conversations_all || 0) > 0, c1metrics?.total_conversations_all);

  // Verify Clinic2 KB is only its own (31 entries)
  const { body: c2kb } = await api('GET', '/api/admin/knowledge', clinic2Cookie);
  check('Clinic2 KB = 31 entries (own only)', Array.isArray(c2kb) && c2kb.length === 31, c2kb?.length);

  // ─── Suite 9: Conversations API ───────────────────────────────────────────
  console.log('\n[SUITE 9] Conversations governance');
  const { status: convStatus, body: convs } = await api('GET', '/api/admin/conversations', adminCookie);
  check('Admin can list conversations', convStatus === 200, convStatus);
  check('Conversations is array', Array.isArray(convs), typeof convs);

  if (Array.isArray(convs) && convs.length > 0) {
    // Try pause action on a non-paused conversation
    const active = convs.find(c => !c.bot_paused && c.status !== 'closed');
    if (active) {
      const { status: pauseStatus } = await api('POST', '/api/admin/conversations', adminCookie, {
        action: 'pause', conversation_id: active.id,
      });
      check('Admin can pause conversation', pauseStatus === 200, pauseStatus);

      // Resume it back
      await delay(500);
      await api('POST', '/api/admin/conversations', adminCookie, { action: 'resume', conversation_id: active.id });
    }
  }

  // Invalid action rejected
  const { status: badAction } = await api('POST', '/api/admin/conversations', adminCookie, {
    action: 'delete_everything', conversation_id: 'fake-id',
  });
  check('Invalid conversation action rejected', badAction === 400, badAction);

  // Staff can read conversations
  const { status: staffConvStatus } = await api('GET', '/api/admin/conversations', staffCookie);
  check('Staff can read conversations', staffConvStatus === 200, staffConvStatus);

  // ─── Suite 10: Input validation ───────────────────────────────────────────
  console.log('\n[SUITE 10] Input validation & injection prevention');

  // KB question too long (>500 chars)
  const longStr = 'A'.repeat(501);
  const { body: longKb } = await api('POST', '/api/admin/knowledge', adminCookie, { question: longStr, answer: 'ok' });
  // Should succeed but truncate (our implementation slices)
  check('Long KB question gets truncated (not error)', longKb?.question?.length <= 500, longKb?.question?.length);

  // Missing required fields
  const { status: noQuestion } = await api('POST', '/api/admin/knowledge', adminCookie, { answer: 'test' });
  check('Missing question returns 400', noQuestion === 400, noQuestion);

  const { status: noId } = await api('PATCH', '/api/admin/appointments', adminCookie, { status: 'confirmed' });
  check('Missing id returns 400', noId === 400, noId);

  // ─── Summary ──────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log('\n' + '═'.repeat(65));
  console.log(`RESULTS: ${passed}/${total} passed, ${failed} failed`);
  console.log('═'.repeat(65));

  if (failed === 0) console.log('✅ All tests passed!');
  else console.log(`⚠  ${failed} test(s) failed — review above`);

  // ─── Cleanup ──────────────────────────────────────────────────────────────
  console.log('\n[CLEANUP] Deleting test users...');
  for (const uid of created_users) {
    await sbDeleteUser(uid);
  }
  console.log(`  ✓ ${created_users.length} test users deleted`);
}

main().catch(err => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
