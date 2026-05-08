/**
 * apply_migration_049.mjs — nps_responses table + get_nps_summary()
 * node scripts/ops/apply_migration_049.mjs
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, '../../saas/.env'), 'utf8');
const KEY = env.match(/SUPABASE_SERVICE_KEY=(.+)/)?.[1]?.trim();
const REF = env.match(/SUPABASE_PROJECT_REF=(.+)/)?.[1]?.trim();

const SQL = readFileSync(
  join(__dirname, '../../supabase/migrations/049_nps_responses.sql'),
  'utf8'
);

async function tryManagementApi(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const data = await r.json().catch(() => ({}));
  if (r.ok) { console.log('  ✅ Aplicada via Management API'); return true; }
  console.log(`  ⚠️  Management API rechazó (${r.status}): ${data.message || JSON.stringify(data)}`);
  return false;
}

async function verify() {
  const BASE = 'https://inhyrrjidhzrbqecnptn.supabase.co';
  const r = await fetch(`${BASE}/rest/v1/nps_responses?limit=1`, {
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY },
  });
  return r.status !== 404;
}

console.log('\n=== Aplicando Migración 049: nps_responses ===\n');
const ok = await tryManagementApi(SQL);

if (ok) {
  console.log('\n✅ Migración 049 aplicada.\n');
  console.log('Nuevas funcionalidades:');
  console.log('  - tabla nps_responses  (score 1-5 por paciente/cita)');
  console.log('  - get_nps_summary(clinic_id, days) — promedio, distribución, NPS index');
} else {
  const already = await verify();
  console.log(already
    ? '\n  ✅ La migración ya estaba aplicada.'
    : '\n  ❌ Aplica manualmente en:\n  https://supabase.com/dashboard/project/inhyrrjidhzrbqecnptn/sql/new'
  );
  if (!already) {
    console.log('\n' + '─'.repeat(60));
    console.log(SQL);
    console.log('─'.repeat(60));
  }
}
