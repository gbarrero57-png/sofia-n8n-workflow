/**
 * apply_migration_036.mjs
 * Verifica si la migración 036 ya está aplicada.
 * Si no, imprime el SQL y las instrucciones para aplicarla.
 *
 * Run: node scripts/ops/apply_migration_036.mjs
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEY = readFileSync(join(__dirname, '../../saas/.env'), 'utf8')
  .match(/SUPABASE_SERVICE_KEY=(.+)/)?.[1]?.trim();
const BASE = 'https://inhyrrjidhzrbqecnptn.supabase.co';

async function rpc(fn, body = {}) {
  const r = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: r.status, data: await r.json() };
}

console.log('\n=== Verificando migración 036 ===\n');

// Check each function
const checks = [
  { fn: 'get_patient_history',          args: { p_clinic_id: '00000000-0000-0000-0000-000000000000', p_phone: '+00' } },
  { fn: 'add_patient_allergy',          args: { p_patient_id: '00000000-0000-0000-0000-000000000000', p_clinic_id: '00000000-0000-0000-0000-000000000000', p_allergen: 'test' } },
  { fn: 'get_patient_context_for_bot',  args: { p_clinic_id: '00000000-0000-0000-0000-000000000000', p_phone: '+00' } },
  { fn: 'edit_clinical_record',         args: { p_record_id: '00000000-0000-0000-0000-000000000000', p_clinic_id: '00000000-0000-0000-0000-000000000000', p_edit_reason: 'test' } },
];

let allOk = true;
for (const { fn, args } of checks) {
  const r = await rpc(fn, args);
  // 404 with PGRST202 = function does not exist
  // Any other status = function exists (even if it returns an error for invalid args)
  const exists = !(r.status === 404 && r.data?.code === 'PGRST202');
  const symbol = exists ? '✅' : '❌';
  console.log(`  ${symbol} ${fn}`);
  if (!exists) allOk = false;
}

if (allOk) {
  console.log('\n✅ Migración 036 ya aplicada — todas las funciones existen.\n');
  process.exit(0);
}

console.log('\n❌ Migración 036 NO está aplicada. Pasos para aplicarla:\n');
console.log('  1. Abre: https://supabase.com/dashboard/project/inhyrrjidhzrbqecnptn/sql/new');
console.log('  2. Pega y ejecuta el contenido de:');
console.log('     supabase/migrations/036_patient_history_improvements.sql');
console.log('  3. Vuelve a ejecutar este script para verificar.\n');
console.log('─'.repeat(60));
console.log('SQL a aplicar: supabase/migrations/036_patient_history_improvements.sql');
console.log('─'.repeat(60) + '\n');
process.exit(1);
