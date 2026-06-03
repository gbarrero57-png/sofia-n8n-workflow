/**
 * apply_migration_061.mjs — Lock atómico para dispatch REMAJU
 * node scripts/ops/apply_migration_061.mjs
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SUP_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkanBrZmN6dG5vdXJpaHFwZmZlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODY0MTU0NCwiZXhwIjoyMDk0MjE3NTQ0fQ.UhX4I_06RIoqPVx9Gyw0W1U_ABobWUDlkYl16waZGjs'
const SUP_REF  = 'rdjpkfcztnourihqpffe'
const SUP_URL  = `https://${SUP_REF}.supabase.co`

const SQL = readFileSync(
  join(__dirname, '../../supabase/migrations/061_remaju_dispatch_lock.sql'),
  'utf8'
)

async function tryManagementApi (sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${SUP_REF}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + SUP_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql })
  })
  const data = await r.json().catch(() => ({}))
  if (r.ok) { console.log('  ✅ Aplicada via Management API'); return true }
  console.log(`  ⚠️  Management API (${r.status}): ${data.message || JSON.stringify(data).substring(0, 100)}`)
  return false
}

async function verify () {
  const r = await fetch(`${SUP_URL}/rest/v1/remaju_dispatch_lock?limit=1`, {
    headers: { apikey: SUP_KEY, Authorization: 'Bearer ' + SUP_KEY }
  })
  return r.status === 200
}

console.log('\n=== Aplicando Migración 061: remaju_dispatch_lock ===\n')
const ok = await tryManagementApi(SQL)

if (ok) {
  console.log('\n✅ Migración 061 aplicada. Lock atómico para dispatch listo.\n')
} else {
  const already = await verify()
  if (already) {
    console.log('\n  ✅ La tabla remaju_dispatch_lock ya existe.\n')
  } else {
    console.log('\n  ❌ Aplica manualmente en:')
    console.log(`  https://supabase.com/dashboard/project/${SUP_REF}/sql/new\n`)
    console.log('─'.repeat(60))
    console.log(SQL)
    console.log('─'.repeat(60))
  }
}
