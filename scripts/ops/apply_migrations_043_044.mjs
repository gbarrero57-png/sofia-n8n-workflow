/**
 * apply_migrations_043_044.mjs
 * Applies migrations 043 (fix bot_upsert_patient source) and 044 (add source='staff' constraint).
 * Tries Supabase Management API first; falls back to exec_sql helper if available.
 *
 * Run: node scripts/ops/apply_migrations_043_044.mjs
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, '../../saas/.env'), 'utf8');
const KEY  = env.match(/SUPABASE_SERVICE_KEY=(.+)/)?.[1]?.trim();
const REF  = env.match(/SUPABASE_PROJECT_REF=(.+)/)?.[1]?.trim();
const BASE = `https://inhyrrjidhzrbqecnptn.supabase.co`;

// ── SQL content ──────────────────────────────────────────────────────────────

const SQL_043 = readFileSync(
  join(__dirname, '../../supabase/migrations/043_fix_bot_upsert_source.sql'),
  'utf8'
);

const SQL_044 = readFileSync(
  join(__dirname, '../../supabase/migrations/044_appointment_source_staff.sql'),
  'utf8'
);

// ── Helper: try Management API ────────────────────────────────────────────────

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

// ── Helper: verify constraint ─────────────────────────────────────────────────

async function checkConstraint() {
  const url = `${BASE}/rest/v1/rpc/get_patient_context_for_bot`;
  // We'll check if source='staff' would be allowed by inserting & rolling back via SQL
  // Since we can't run DDL via PostgREST, we verify by checking pg_constraint
  const checkSql = `
    SELECT cc.check_clause
    FROM information_schema.check_constraints cc
    JOIN information_schema.constraint_column_usage ccu
      ON cc.constraint_name = ccu.constraint_name
    WHERE ccu.table_name = 'appointments'
      AND ccu.column_name = 'source'
  `;
  // Can't run arbitrary SQL via PostgREST easily — skip, verify differently
  return null;
}

// ── Helper: verify bot_upsert_patient has source fix ─────────────────────────

async function checkBotUpsertFixed() {
  // Call with a non-existent phone+clinic — if it returns MISSING_CLINIC_ID it works
  // The new version should handle source correctly
  const r = await fetch(`${BASE}/rest/v1/rpc/bot_upsert_patient`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_clinic_id: null, p_phone: '+test' }),
  });
  const data = await r.json().catch(() => null);
  // If function exists and returns MISSING_CLINIC_ID, it's the updated version
  // (old version would also return this, so we can't distinguish easily)
  return r.status !== 404;
}

// ── Helper: try inserting appointment with source='staff' (dry-run check) ─────

async function checkStaffSourceAllowed() {
  // We'll try to call get_patient_timeline to see if the schema is accessible
  // Then attempt a constraint check by trying to insert and catching the error
  // Actually we just need to verify the constraint exists
  const r = await fetch(
    `${BASE}/rest/v1/appointments?select=source&limit=1&order=created_at.desc`,
    {
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY },
    }
  );
  if (!r.ok) return null;
  // Try inserting with source='staff' into a temp-like scenario is not safe
  // Instead, check via system catalog RPC if available
  return 'unknown';
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('\n=== Aplicando Migraciones 043 + 044 ===\n');
console.log(`Project: ${REF}`);
console.log(`Key: ${KEY?.slice(0, 20)}...\n`);

// Try Migration 043
console.log('── Migración 043: fix bot_upsert_patient source ──');
const ok043 = await tryManagementApi(SQL_043, 'Migration 043');

// Try Migration 044
console.log('\n── Migración 044: add source=staff constraint ──');
const ok044 = await tryManagementApi(SQL_044, 'Migration 044');

console.log('\n─────────────────────────────────────────────────');

if (ok043 && ok044) {
  console.log('\n✅ Ambas migraciones aplicadas exitosamente.\n');
  console.log('Próximos pasos:');
  console.log('  - Los pacientes del bot con source="manual" ahora muestran "WhatsApp Bot"');
  console.log('  - Los doctores pueden crear citas de seguimiento (source="staff") desde historial clínico');
} else {
  console.log('\n⚠️  No se pudieron aplicar las migraciones automáticamente.');
  console.log('    El Management API requiere un Personal Access Token (PAT), no el service key.\n');
  console.log('Por favor aplica manualmente en el SQL Editor de Supabase:');
  console.log('  https://supabase.com/dashboard/project/inhyrrjidhzrbqecnptn/sql/new\n');

  if (!ok043) {
    console.log('── SQL para Migración 043 ──────────────────────');
    console.log(SQL_043);
  }
  if (!ok044) {
    console.log('\n── SQL para Migración 044 ──────────────────────');
    console.log(SQL_044);
  }
}
