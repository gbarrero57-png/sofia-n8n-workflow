#!/usr/bin/env node
/**
 * apply_migration_034.mjs
 * Creates leads CRM table in Supabase (replaces Airtable free plan)
 * Usage: node scripts/ops/apply_migration_034.mjs
 */

const SUPABASE_URL = 'https://inhyrrjidhzrbqecnptn.supabase.co';
const SERVICE_KEY  = 'process.env.SUPABASE_SERVICE_KEY';

// Supabase REST API doesn't support DDL — print instructions
const sqlFile = new URL('../../supabase/migrations/034_leads_crm.sql', import.meta.url).pathname;

console.log('Migration 034: leads CRM table');
console.log('');
console.log('Supabase REST API no soporta DDL directo.');
console.log('Para aplicar, ve a:');
console.log('  https://supabase.com/dashboard/project/inhyrrjidhzrbqecnptn/sql');
console.log('Y ejecuta el contenido de: supabase/migrations/034_leads_crm.sql');
console.log('');
console.log('O usa el Supabase CLI:');
console.log('  supabase db push  (si tienes supabase CLI configurado)');
console.log('');

// Verify the table exists by trying a SELECT
const res = await fetch(`${SUPABASE_URL}/rest/v1/leads?select=count&limit=1`, {
  headers: {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'count=exact',
  },
});

if (res.ok) {
  const count = res.headers.get('content-range');
  console.log(`✅ Tabla leads ya existe en Supabase. Registros: ${count || '0'}`);
} else {
  const err = await res.text();
  console.log(`❌ Tabla leads NO existe aún (${res.status}): ${err.slice(0, 100)}`);
  console.log('   → Aplica la migración manualmente desde el link de arriba.');
}
