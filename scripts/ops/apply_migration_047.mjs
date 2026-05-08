/**
 * apply_migration_047.mjs
 * Applies migration 047: acquisition_source en patients
 *
 * Run: node scripts/ops/apply_migration_047.mjs
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
  join(__dirname, '../../supabase/migrations/047_acquisition_source.sql'),
  'utf8'
);

async function tryManagementApi(sql, label) {
  const url = `https://api.supabase.com/v1/projects/${REF}/database/query`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      console.log(`  ✅ ${label} aplicada via Management API`);
      return true;
    }
    console.log(`  ⚠️  Management API rechazó (${r.status}): ${data.message || JSON.stringify(data)}`);
    return false;
  } catch (e) {
    console.log(`  ⚠️  Management API error: ${e.message}`);
    return false;
  }
}

async function verifyMigration() {
  // Check 1: column exists
  const colCheck = await fetch(
    `${BASE}/rest/v1/rpc/get_acquisition_summary`,
    {
      method: 'POST',
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_clinic_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', p_days: 7 }),
    }
  );
  return colCheck.status !== 404;
}

console.log('\n=== Aplicando Migración 047: acquisition_source ===\n');
console.log(`Project: ${REF}`);
console.log(`Key: ${KEY?.slice(0, 20)}...\n`);

const ok = await tryManagementApi(SQL, 'Migration 047');

if (ok) {
  console.log('\n✅ Migración 047 aplicada exitosamente.\n');
  console.log('Cambios aplicados:');
  console.log('  - patients.acquisition_source  (TEXT, default "organic")');
  console.log('  - bot_upsert_patient()  actualizada (acepta p_acquisition_source)');
  console.log('  - get_clinic_leads()    actualizada (filtra y devuelve acquisition_source)');
  console.log('  - get_acquisition_summary()  NUEVA (distribución de fuentes + tasa conversión)');
} else {
  console.log('\n⚠️  No se pudo aplicar automáticamente (requiere PAT, no service key).');
  console.log('Aplica manualmente en:');
  console.log('  https://supabase.com/dashboard/project/inhyrrjidhzrbqecnptn/sql/new\n');

  const already = await verifyMigration();
  if (already) {
    console.log('  ✅ La migración ya estaba aplicada (get_acquisition_summary existe).');
  } else {
    console.log('  ❌ La migración NO está aplicada todavía.');
    console.log('\nSQL a ejecutar en el dashboard:');
    console.log('─'.repeat(60));
    console.log(SQL);
    console.log('─'.repeat(60));
  }
}
