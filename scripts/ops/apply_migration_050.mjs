/**
 * apply_migration_050.mjs — métricas y analytics dashboard
 * node scripts/ops/apply_migration_050.mjs
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
  join(__dirname, '../../supabase/migrations/050_metrics.sql'),
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
  const r = await fetch(`${BASE}/rest/v1/rpc/get_clinic_dashboard`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_clinic_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', p_days: 7 }),
  });
  return r.status !== 404;
}

console.log('\n=== Aplicando Migración 050: Métricas & Analytics ===\n');
const ok = await tryManagementApi(SQL);

if (ok) {
  console.log('\n✅ Migración 050 aplicada.\n');
  console.log('Nuevas funciones disponibles:');
  console.log('  - get_clinic_dashboard(clinic_id, days)   — KPIs ejecutivos (leads, citas, NPS, revenue)');
  console.log('  - get_conversion_funnel(clinic_id, days)  — embudo con % conversión entre etapas');
  console.log('  - get_revenue_metrics(clinic_id, days)    — ingresos, LTV, ticket promedio, cobranza');
  console.log('  - get_bot_performance(clinic_id, days)    — bot stats, intents, slot conversion');
  console.log('  - get_leads_timeline(clinic_id, days)     — leads por día para gráficos');
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
