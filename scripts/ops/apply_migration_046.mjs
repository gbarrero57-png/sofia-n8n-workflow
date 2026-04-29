/**
 * apply_migration_046.mjs
 * Applies migration 046: CRM enhancement (notes, reminders, NPS, tags, recall, LTV)
 *
 * Run: node scripts/ops/apply_migration_046.mjs
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, '../../saas/.env'), 'utf8');
const KEY = env.match(/SUPABASE_SERVICE_KEY=(.+)/)?.[1]?.trim();
const REF = env.match(/SUPABASE_PROJECT_REF=(.+)/)?.[1]?.trim();
const BASE = 'https://inhyrrjidhzrbqecnptn.supabase.co';

const SQL = readFileSync(
  join(__dirname, '../../supabase/migrations/046_crm_enhancement.sql'),
  'utf8'
);

async function tryManagementApi(sql, label) {
  const url = `https://api.supabase.com/v1/projects/${REF}/database/query`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      console.log(`  ✅ ${label} aplicada via Management API`);
      return true;
    } else {
      console.log(`  ⚠️  Management API rechazó (${r.status}): ${data.message || JSON.stringify(data)}`);
      return false;
    }
  } catch (e) {
    console.log(`  ⚠️  Management API error: ${e.message}`);
    return false;
  }
}

async function verifyMigration() {
  const r = await fetch(`${BASE}/rest/v1/rpc/get_clinic_nps_stats`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_clinic_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', p_days: 30 }),
  });
  return r.status !== 404;
}

console.log('\n=== Aplicando Migración 046: CRM Enhancement ===\n');
console.log(`Project: ${REF}`);
console.log(`Key: ${KEY?.slice(0, 20)}...\n`);

const ok = await tryManagementApi(SQL, 'Migration 046');

if (ok) {
  console.log('\n✅ Migración 046 aplicada exitosamente.\n');
  console.log('Nuevas funcionalidades:');
  console.log('  - Columnas en patients: tags, is_vip, insurance_*, recall, birthday_msg_sent_year');
  console.log('  - Tablas: patient_notes, patient_reminders, nps_responses');
  console.log('  - Funciones SQL: get_patient_ltv, get_patients_for_birthday,');
  console.log('    get_patients_for_recall, get_appointments_for_nps,');
  console.log('    get_clinic_nps_stats, update_patient_recall, get_clinic_reminders_today');
  console.log('  - Trigger: trg_appointment_update_recall (auto-computa recall al completar cita)');
} else {
  console.log('\n⚠️  No se pudo aplicar automáticamente (requiere PAT, no service key).');
  console.log('Aplica manualmente en:');
  console.log('  https://supabase.com/dashboard/project/inhyrrjidhzrbqecnptn/sql/new\n');
  console.log('Verificando si ya fue aplicada...');
  const already = await verifyMigration();
  if (already) {
    console.log('  ✅ La migración ya estaba aplicada (get_clinic_nps_stats existe).');
  } else {
    console.log('  ❌ La migración NO está aplicada. Debes aplicarla manualmente.');
    console.log('\nSQL a ejecutar:');
    console.log('─'.repeat(60));
    console.log(SQL);
    console.log('─'.repeat(60));
  }
}
