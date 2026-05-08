/**
 * apply_migration_048.mjs — pipeline_stage en patients
 * node scripts/ops/apply_migration_048.mjs
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
  join(__dirname, '../../supabase/migrations/048_pipeline_stage.sql'),
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
  const r = await fetch(`${BASE}/rest/v1/rpc/get_pipeline_funnel`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_clinic_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', p_days: 7 }),
  });
  return r.status !== 404;
}

console.log('\n=== Aplicando Migración 048: pipeline_stage ===\n');
const ok = await tryManagementApi(SQL);

if (ok) {
  console.log('\n✅ Migración 048 aplicada.\n');
  console.log('Nuevas funcionalidades:');
  console.log('  - patients.pipeline_stage  (nuevo→contactado→cita_agendada→...→ganado|perdido)');
  console.log('  - Triggers automáticos: appointment confirmed, treatment_plan, payment');
  console.log('  - advance_pipeline_stage(clinic_id, phone, stage) — llamada desde bot');
  console.log('  - get_pipeline_funnel(clinic_id, days) — métricas del embudo');
  console.log('  - get_clinic_leads() actualizada con filtro p_pipeline_stage');
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
