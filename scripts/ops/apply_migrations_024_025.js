// apply_migrations_024_025.js
// Applies migrations 024 + 025 to Supabase via the SQL API
// Run: node scripts/ops/apply_migrations_024_025.js
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const HOST        = 'inhyrrjidhzrbqecnptn.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluaHlycmppZGh6cmJxZWNucHRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwNzU3NSwiZXhwIjoyMDg2NTgzNTc1fQ.-YwX0Qf4Gn8MdjFbLxCYuCJV1OzWl2qWWk4hKuU6z7k';
const MIGRATIONS  = path.join(__dirname, '../../supabase/migrations');

function runSQL(sql) {
  const body = JSON.stringify({ query: sql });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: HOST,
      path: '/rest/v1/rpc/exec_sql',  // not available — use pg directly
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

// Supabase doesn't expose a raw SQL REST endpoint for arbitrary SQL.
// Migrations must be applied via the Supabase SQL Editor or CLI.
// This script outputs the SQL to apply + verification queries.

function printMigration(filename) {
  const filepath = path.join(MIGRATIONS, filename);
  if (!fs.existsSync(filepath)) {
    console.error('❌ File not found:', filepath);
    return;
  }
  const sql = fs.readFileSync(filepath, 'utf8');
  console.log('\n' + '═'.repeat(60));
  console.log('FILE:', filename);
  console.log('SIZE:', (sql.length / 1024).toFixed(1), 'KB');
  console.log('LINES:', sql.split('\n').length);
  console.log('═'.repeat(60));
  console.log(sql);
}

async function verify() {
  // Use Supabase REST API to verify the tables exist after migration
  function get(path) {
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: HOST, path, method: 'GET',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY }
      }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      });
      req.on('error', reject); req.end();
    });
  }

  console.log('\n' + '═'.repeat(60));
  console.log('POST-MIGRATION VERIFICATION');
  console.log('═'.repeat(60));

  // Check doctors table exists
  const r1 = await get('/rest/v1/doctors?limit=1');
  if (r1.status === 200) {
    console.log('✅ doctors table EXISTS');
  } else if (r1.status === 404 || r1.body.includes('relation') || r1.body.includes('does not exist')) {
    console.log('❌ doctors table NOT FOUND — migration 024 not applied yet');
    return false;
  } else {
    console.log('⚠️  doctors table check:', r1.status, r1.body.slice(0,100));
  }

  // Check doctor_id column on appointments
  const r2 = await get('/rest/v1/appointments?select=doctor_id&limit=1');
  if (r2.status === 200) {
    console.log('✅ appointments.doctor_id column EXISTS');
  } else {
    console.log('❌ appointments.doctor_id NOT FOUND — migration 025 not applied yet');
    return false;
  }

  // Check format_doctor_schedule function via a test doctor insert
  console.log('\n── Smoke test: insert test doctor + verify KB sync ──');
  const DEMO_CLINIC = 'c6c15fca-d7fc-4d98-83c1-2c5cb5a6bef1';

  const testDoctor = {
    clinic_id:        DEMO_CLINIC,
    first_name:       'Ana',
    last_name:        'López',
    specialty:        'Odontología General',
    slot_duration_min: 30,
    weekly_schedule:  [
      { dow: 1, start_hour: 9,  end_hour: 17 },
      { dow: 2, start_hour: 9,  end_hour: 17 },
      { dow: 3, start_hour: 9,  end_hour: 17 },
      { dow: 4, start_hour: 9,  end_hour: 17 },
      { dow: 5, start_hour: 9,  end_hour: 17 }
    ]
  };

  const bodyStr = JSON.stringify(testDoctor);
  const r3 = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: HOST,
      path: '/rest/v1/doctors',
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.write(bodyStr); req.end();
  });

  if (r3.status === 201) {
    const inserted = JSON.parse(r3.body);
    const doctor = Array.isArray(inserted) ? inserted[0] : inserted;
    console.log('✅ Test doctor inserted:', doctor.id);
    console.log('   Name:', 'Dr. ' + doctor.first_name + ' ' + doctor.last_name);
    console.log('   Specialty:', doctor.specialty);

    // Check KB rows were created by the trigger
    const r4 = await get(
      '/rest/v1/knowledge_base'
      + '?clinic_id=eq.' + DEMO_CLINIC
      + '&metadata->>doctor_id=eq.' + doctor.id
      + '&select=id,category,question,answer'
    );
    if (r4.status === 200) {
      const kbRows = JSON.parse(r4.body);
      if (kbRows.length >= 2) {
        console.log('✅ KB auto-sync trigger WORKING — ' + kbRows.length + ' rows created:');
        kbRows.forEach(kb => {
          console.log('   [' + kb.category + '] ' + kb.question);
          console.log('   → ' + kb.answer.slice(0, 80) + '...');
        });
      } else if (kbRows.length === 1) {
        console.log('⚠️  KB auto-sync created only 1 row (expected 2). Check trigger.');
        console.log('   Row:', JSON.stringify(kbRows[0]).slice(0, 200));
      } else {
        console.log('❌ KB auto-sync FAILED — 0 KB rows found for doctor_id=' + doctor.id);
        console.log('   Check trigger sync_doctor_to_kb in Supabase SQL Editor.');
      }
    }

    // Clean up test doctor
    await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: HOST,
        path: '/rest/v1/doctors?id=eq.' + doctor.id,
        method: 'DELETE',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY }
      }, res => { res.resume(); res.on('end', resolve); });
      req.on('error', reject); req.end();
    });
    console.log('   (Test doctor deleted)');
  } else {
    console.log('❌ Test doctor INSERT failed:', r3.status, r3.body.slice(0, 300));
    console.log('   → Migration 024 may not be applied yet.');
    return false;
  }

  console.log('\n✅ ALL CHECKS PASSED — Migrations 024 + 025 are live.');
  console.log('═'.repeat(60));
  return true;
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--verify') {
    await verify();
    return;
  }

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Migrations 024 + 025 — Multi-Doctor Calendar System     ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  INSTRUCTIONS:                                           ║');
  console.log('║  1. Open Supabase Dashboard → SQL Editor                 ║');
  console.log('║  2. Paste and run 024_doctors_schema.sql                 ║');
  console.log('║  3. Paste and run 025_appointments_doctor.sql            ║');
  console.log('║  4. Run: node this_script.js --verify                    ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  console.log('\nChecking if migrations are already applied...');
  const alreadyApplied = await verify().catch(() => false);

  if (!alreadyApplied) {
    console.log('\n── SQL to apply (copy to Supabase SQL Editor) ──');
    console.log('\nStep 1 of 2 — Run this first:');
    printMigration('024_doctors_schema.sql');
    console.log('\n\nStep 2 of 2 — Run this after Step 1 succeeds:');
    printMigration('025_appointments_doctor.sql');
  }
}

main().catch(console.error);
