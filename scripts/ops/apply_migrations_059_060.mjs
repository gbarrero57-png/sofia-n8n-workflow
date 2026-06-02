/**
 * apply_migrations_059_060.mjs
 * Fixes nightly test failures:
 *   059 — upsert_conversation overloads (PGRST203 "function is not unique")
 *   060 — search_patients accent-insensitive (Simulacion != Simulación)
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SUP_KEY = 'sb_secret_jpzMd6yUKtpWTUnQZb44mA_5PmOZDQ3'
const SUP_REF = 'inhyrrjidhzrbqecnptn'
const SUP_URL = `https://${SUP_REF}.supabase.co`

async function applyMigration(label, sqlFile) {
  const sql = readFileSync(join(__dirname, '../../supabase/migrations', sqlFile), 'utf8')

  console.log(`\n── ${label} ──`)
  const r = await fetch(`https://api.supabase.com/v1/projects/${SUP_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + SUP_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql })
  })
  const data = await r.json().catch(() => ({}))
  if (r.ok) {
    console.log('  ✅ Aplicada')
    return true
  }
  console.log(`  ❌ Error ${r.status}: ${data.message || JSON.stringify(data).slice(0, 120)}`)
  return false
}

async function verify059() {
  // Check only one overload of upsert_conversation exists
  const r = await fetch(`${SUP_URL}/rest/v1/rpc/upsert_conversation`, {
    method: 'POST',
    headers: {
      apikey: SUP_KEY, Authorization: 'Bearer ' + SUP_KEY, 'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_clinic_id: 'c6c15fca-d7fc-4d98-83c1-2c5cb5a6bef1',
      p_chatwoot_conversation_id: 'verify_059_' + Date.now(),
      p_patient_name: 'Test 059',
      p_last_message: 'verify'
    })
  })
  return r.status === 200
}

console.log('\n══════════════════════════════════════════════')
console.log('  Aplicando Migraciones 059 + 060')
console.log('  Fixes: governance overloads + search accents')
console.log('══════════════════════════════════════════════')

const ok059 = await applyMigration('059 — fix upsert_conversation overloads', '059_fix_upsert_conversation_overloads.sql')
const ok060 = await applyMigration('060 — fix search_patients accents', '060_fix_search_patients_accents.sql')

console.log('\n── Verificación ──')
if (ok059) {
  const works = await verify059()
  console.log(works ? '  ✅ upsert_conversation responde sin ambigüedad' : '  ❌ upsert_conversation sigue fallando')
}

if (ok059 && ok060) {
  console.log('\n✅ Listo. Corre el test para confirmar:')
  console.log('   node scripts/tests/test_patients_full.js\n')
} else {
  console.log('\n⚠️  Aplica manualmente en SQL Editor:')
  console.log(`   https://supabase.com/dashboard/project/${SUP_REF}/sql/new\n`)
}
