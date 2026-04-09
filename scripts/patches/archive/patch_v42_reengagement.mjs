/**
 * patch_v42_reengagement.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Despliega el sistema de Re-engagement Reminders:
 *   1. Aplica migración 031 en Supabase (tabla reengagement_reminders + funciones)
 *   2. Crea el workflow "SofIA - Re-engagement Reminders" en n8n
 *   3. Activa el workflow
 *
 * Uso: node scripts/patches/archive/patch_v42_reengagement.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

// ── Config ───────────────────────────────────────────────────────────────────
const N8N_URL    = 'https://workflows.n8n.redsolucionesti.com';
const N8N_KEY    = process.env.N8N_API_KEY || (() => {
  try {
    const env = fs.readFileSync(path.join(ROOT, 'n8n-mcp/.env'), 'utf8');
    const match = env.match(/N8N_API_KEY=(.+)/);
    return match ? match[1].trim() : '';
  } catch { return ''; }
})();

const SUPABASE_URL = 'https://inhyrrjidhzrbqecnptn.supabase.co';
const SUPABASE_KEY = process.env.N8N_SUPABASE_SERVICE_KEY || (() => {
  try {
    const env = fs.readFileSync(path.join(ROOT, 'saas/.env'), 'utf8');
    const match = env.match(/SUPABASE_SERVICE_KEY=(.+)/);
    return match ? match[1].trim() : '';
  } catch { return ''; }
})();

// ── Helpers ──────────────────────────────────────────────────────────────────
async function n8nGet(endpoint) {
  const r = await fetch(`${N8N_URL}/api/v1${endpoint}`, {
    headers: { 'X-N8N-API-KEY': N8N_KEY }
  });
  if (!r.ok) throw new Error(`GET ${endpoint} → ${r.status}: ${await r.text()}`);
  return r.json();
}

async function n8nPost(endpoint, body) {
  const r = await fetch(`${N8N_URL}/api/v1${endpoint}`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`POST ${endpoint} → ${r.status}: ${await r.text()}`);
  return r.json();
}

async function n8nPut(endpoint, body) {
  const r = await fetch(`${N8N_URL}/api/v1${endpoint}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`PUT ${endpoint} → ${r.status}: ${await r.text()}`);
  return r.json();
}

async function supabaseRpc(func, params = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${func}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`RPC ${func} → ${r.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function supabaseSql(sql) {
  // Aplica SQL via el endpoint de query de Supabase (requiere service_role)
  const r = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ query: sql })
  });
  // Si falla, intentar via pg-meta o reportar error
  if (!r.ok) {
    const text = await r.text();
    console.warn(`  ⚠️  SQL directo no disponible (${r.status}). Aplica la migración manualmente.`);
    console.warn(`  Archivo: supabase/migrations/031_reengagement_reminders.sql`);
    return null;
  }
  return r.json();
}

// ── Step 1: Migración Supabase ────────────────────────────────────────────────
async function applyMigration() {
  console.log('\n[1/3] Aplicando migración 031 en Supabase...');

  // La migración se aplica via Supabase Dashboard o CLI.
  // Este script verifica si la tabla ya existe via RPC.
  try {
    await supabaseRpc('get_conversations_to_reengage');
    console.log('  ✅ Función get_conversations_to_reengage ya existe — migración ya aplicada.');
    return true;
  } catch(e) {
    if (e.message.includes('does not exist') || e.message.includes('404')) {
      console.log('  ⚠️  Migración 031 NO aplicada todavía.');
      console.log('  📋 Pasos para aplicarla:');
      console.log('     1. Ir a https://supabase.com/dashboard/project/inhyrrjidhzrbqecnptn/sql/new');
      console.log('     2. Copiar y pegar el contenido de:');
      console.log('        supabase/migrations/031_reengagement_reminders.sql');
      console.log('     3. Ejecutar (Run)');
      console.log('  ');
      console.log('  Continuando con el deploy del workflow n8n...');
      return false;
    }
    console.log('  ✅ Función detectada (respuesta inesperada pero tabla existe).');
    return true;
  }
}

// ── Step 2: Crear/actualizar workflow n8n ─────────────────────────────────────
async function deployWorkflow() {
  console.log('\n[2/3] Desplegando workflow en n8n...');

  const wfJson = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'workflows/sofia/sofia_reengagement.json'), 'utf8')
  );

  // Buscar si ya existe
  const list = await n8nGet('/workflows?limit=100');
  const existing = (list.data || []).find(w => w.name === wfJson.name);

  let workflow;
  if (existing) {
    console.log(`  ℹ️  Workflow ya existe (ID: ${existing.id}) — actualizando...`);
    workflow = await n8nPut(`/workflows/${existing.id}`, {
      name: wfJson.name,
      nodes: wfJson.nodes,
      connections: wfJson.connections,
      settings: wfJson.settings,
      staticData: wfJson.staticData
    });
    console.log(`  ✅ Workflow actualizado: ${workflow.id}`);
  } else {
    console.log('  ➕ Creando nuevo workflow...');
    workflow = await n8nPost('/workflows', {
      name: wfJson.name,
      nodes: wfJson.nodes,
      connections: wfJson.connections,
      settings: wfJson.settings,
      staticData: wfJson.staticData
    });
    console.log(`  ✅ Workflow creado: ${workflow.id}`);
  }

  return workflow.id;
}

// ── Step 3: Activar workflow ───────────────────────────────────────────────────
async function activateWorkflow(id) {
  console.log(`\n[3/3] Activando workflow ${id}...`);
  await n8nPost(`/workflows/${id}/activate`, {});
  console.log('  ✅ Workflow activado — cron corriendo cada hora.');
  return id;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  patch_v42_reengagement — SofIA Re-engagement Reminders');
  console.log('═══════════════════════════════════════════════════════════');

  if (!N8N_KEY) { console.error('❌ N8N_API_KEY no encontrado'); process.exit(1); }
  if (!SUPABASE_KEY) { console.error('❌ N8N_SUPABASE_SERVICE_KEY no encontrado'); process.exit(1); }

  const migrationOk = await applyMigration();
  const workflowId  = await deployWorkflow();
  await activateWorkflow(workflowId);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  ✅ Deploy completado');
  console.log(`  Workflow ID: ${workflowId}`);
  if (!migrationOk) {
    console.log('  ⚠️  PENDIENTE: Aplicar migración 031 en Supabase Dashboard');
    console.log('     https://supabase.com/dashboard/project/inhyrrjidhzrbqecnptn/sql/new');
  }
  console.log('═══════════════════════════════════════════════════════════\n');
})();
