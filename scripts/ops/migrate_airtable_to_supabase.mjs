#!/usr/bin/env node
/**
 * migrate_airtable_to_supabase.mjs
 * Migrates all leads from Airtable → Supabase leads table.
 * Safe to re-run: uses airtable_id for conflict resolution (upsert).
 *
 * Usage: node scripts/ops/migrate_airtable_to_supabase.mjs
 *
 * Prerequisites:
 *   1. Apply migration 034 in Supabase dashboard first
 *   2. Table 'leads' must exist in Supabase
 */

const AT_TOKEN    = process.env.AIRTABLE_PAT;
const AT_BASE     = 'app6a4u9dvXMxwOnY';
const AT_TABLE    = 'tblBuVcKITk5GFoqk';
const AT_URL      = `https://api.airtable.com/v0/${AT_BASE}/${AT_TABLE}`;

const SB_URL      = 'https://inhyrrjidhzrbqecnptn.supabase.co';
const SERVICE_KEY = 'process.env.SUPABASE_SERVICE_KEY';

const AT_FIELDS = [
  'nombre','email','telefono','website','direccion',
  'ciudad','distrito','score_relevancia','rating','total_resenas',
  'status','fuente','whatsapp_enviado','sms_enviado',
  'fecha_envio','fecha_followup','email_asunto','email_cuerpo','citas_semana',
];

// ── 1. Fetch all records from Airtable ────────────────────────────────────────
console.log('📥 Leyendo leads de Airtable...');

const allRecords = [];
let offset = '';
let page = 0;

async function fetchPageWithRetry(params, attempt = 1) {
  const res = await fetch(`${AT_URL}?${params}`, {
    headers: { Authorization: `Bearer ${AT_TOKEN}` },
  });
  if (res.status === 429 || res.status >= 500) {
    if (attempt > 5) throw new Error(`Airtable error ${res.status} after 5 retries`);
    const wait = attempt * 3000;
    process.stdout.write(`\n  ⚠️  HTTP ${res.status}, reintento ${attempt} en ${wait/1000}s...`);
    await new Promise(r => setTimeout(r, wait));
    return fetchPageWithRetry(params, attempt + 1);
  }
  if (!res.ok) throw new Error(`Airtable error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

do {
  const params = new URLSearchParams();
  AT_FIELDS.forEach(f => params.append('fields[]', f));
  params.set('pageSize', '100');
  if (offset) params.set('offset', offset);

  const data = await fetchPageWithRetry(params);
  allRecords.push(...(data.records || []));
  offset = data.offset || '';
  page++;
  process.stdout.write(`\r  Página ${page} — ${allRecords.length} registros leídos...`);

  // Small delay to avoid rate limiting
  await new Promise(r => setTimeout(r, 200));
} while (offset);

console.log(`\n✅ ${allRecords.length} registros leídos de Airtable`);

// ── 2. Transform records ───────────────────────────────────────────────────────
function toSbRow(rec) {
  const f = rec.fields;
  return {
    airtable_id:      rec.id,
    nombre:           f.nombre      || 'Sin nombre',
    email:            f.email       || null,
    telefono:         f.telefono    || null,
    website:          f.website     || null,
    direccion:        f.direccion   || null,
    ciudad:           f.ciudad      || null,
    distrito:         f.distrito    || null,
    score_relevancia: f.score_relevancia ? parseInt(f.score_relevancia) : 0,
    rating:           f.rating      ? parseFloat(f.rating) : null,
    total_resenas:    f.total_resenas ? parseInt(f.total_resenas) : 0,
    status:           f.status      || 'nuevo',
    fuente:           Array.isArray(f.fuente) ? f.fuente : (f.fuente ? [f.fuente] : []),
    whatsapp_enviado: !!f.whatsapp_enviado,
    sms_enviado:      !!f.sms_enviado,
    fecha_envio:      f.fecha_envio    || null,
    fecha_followup:   f.fecha_followup || null,
    email_asunto:     f.email_asunto   || null,
    email_cuerpo:     f.email_cuerpo   || null,
    citas_semana:     f.citas_semana   || null,
  };
}

const rows = allRecords.map(toSbRow);
console.log(`   ${rows.filter(r => r.email).length} con email`);
console.log(`   ${rows.filter(r => r.status === 'nuevo').length} status=nuevo`);
console.log(`   ${rows.filter(r => ['enviado','email_enviado','follow_up_enviado'].includes(r.status)).length} ya enviados`);

// ── 3. Upsert to Supabase in batches of 500 ───────────────────────────────────
console.log('\n📤 Insertando en Supabase...');

const BATCH = 500;
let inserted = 0;
let errors   = 0;

for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const res = await fetch(`${SB_URL}/rest/v1/leads`, {
    method: 'POST',
    headers: {
      'apikey':        SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(batch),
  });

  if (res.ok) {
    inserted += batch.length;
    process.stdout.write(`\r  ${inserted}/${rows.length} insertados...`);
  } else {
    const err = await res.text();
    console.error(`\n❌ Batch ${i}-${i+BATCH} falló: ${err.slice(0, 200)}`);
    errors += batch.length;
  }
}

console.log(`\n\n✅ Migración completa`);
console.log(`   Insertados: ${inserted}`);
console.log(`   Errores:    ${errors}`);

// ── 4. Verify count in Supabase ───────────────────────────────────────────────
const countRes = await fetch(`${SB_URL}/rest/v1/leads?select=id`, {
  headers: {
    'apikey':        SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Prefer':        'count=exact',
    'Range':         '0-0',
  },
});
const total = countRes.headers.get('content-range')?.split('/')[1] || '?';
console.log(`   Total en Supabase: ${total} leads`);

console.log('\n📋 Próximos pasos:');
console.log('   1. Verificar en Supabase dashboard que todos los registros llegaron');
console.log('   2. Actualizar n8n workflows para escribir a Supabase en vez de Airtable');
console.log('   3. Actualizar /api/admin/leads-metrics para leer de Supabase');
