/**
 * patch_bot_upsert_early.mjs
 * Patches the SofIA workflow "Bot Pause Check" node to add an early call to
 * bot_upsert_patient right after the governance check, so every inbound
 * message creates/updates the patient record — not just booking intents.
 *
 * - Reads N8N_API_KEY from n8n-mcp/.env
 * - Backs up original workflow to saas/sofia_before_early_upsert.json
 * - Skips if already patched (marker: early_upsert_done)
 *
 * Run: node scripts/patch_bot_upsert_early.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────

const ENV_PATH      = join(__dirname, '../n8n-mcp/.env');
const BACKUP_PATH   = join(__dirname, '../saas/sofia_before_early_upsert.json');
const N8N_URL       = 'https://workflows.n8n.redsolucionesti.com';
const WORKFLOW_ID   = '37SLdWISQLgkHeXk';
const NODE_NAME     = 'Bot Pause Check';
const PATCH_MARKER  = 'early_upsert_done';

// Read API key from n8n-mcp/.env
const envContent = readFileSync(ENV_PATH, 'utf8');
const apiKeyMatch = envContent.match(/N8N_API_KEY=(.+)/);
if (!apiKeyMatch) {
  console.error('❌ N8N_API_KEY not found in n8n-mcp/.env');
  process.exit(1);
}
const API_KEY = apiKeyMatch[1].trim();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function n8nGet(path) {
  const res = await fetch(`${N8N_URL}/api/v1${path}`, {
    headers: { 'X-N8N-API-KEY': API_KEY }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET ${path} → ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function n8nPut(path, body) {
  const res = await fetch(`${N8N_URL}/api/v1${path}`, {
    method: 'PUT',
    headers: {
      'X-N8N-API-KEY': API_KEY,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PUT ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

// ── Patch code to inject ──────────────────────────────────────────────────────

const PATCH_CODE = `
// ── EARLY PATIENT CAPTURE — any contact creates/updates patient record ────────
// ${PATCH_MARKER}
if (!conversation?.bot_paused) {
  const rawPhoneForUpsert = ($json.contact_phone || '').replace(/^whatsapp:/i, '').trim();
  if (rawPhoneForUpsert) {
    try {
      await supabaseRpc('bot_upsert_patient', {
        p_clinic_id: clinicId,
        p_phone:     rawPhoneForUpsert,
        p_full_name: patientName !== 'Paciente' ? patientName : null
      }, { attempts: 1 });
    } catch(e) {
      // Non-critical — log and continue
      console.warn(JSON.stringify({ ts: new Date().toISOString(), event: 'EARLY_UPSERT_FAILED', error: e.message }));
    }
  }
}
// ─────────────────────────────────────────────────────────────────────────────
`;

// The exact anchor line right before the bot_paused check
const ANCHOR = `if (conversation && conversation.bot_paused === true) {`;

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════');
console.log('  SofIA — patch_bot_upsert_early');
console.log('══════════════════════════════════════════════════════\n');

// Step 1: Fetch current workflow
console.log(`Step 1: Fetching workflow ${WORKFLOW_ID}...`);
const workflow = await n8nGet(`/workflows/${WORKFLOW_ID}`);
console.log(`  ✅ Got "${workflow.name}" (${workflow.nodes?.length ?? 0} nodes)`);

// Step 2: Backup original
console.log(`\nStep 2: Saving backup to ${BACKUP_PATH}...`);
writeFileSync(BACKUP_PATH, JSON.stringify(workflow, null, 2), 'utf8');
console.log('  ✅ Backup saved');

// Step 3: Find the Bot Pause Check node
console.log(`\nStep 3: Locating "${NODE_NAME}" node...`);
const nodeIndex = workflow.nodes.findIndex(n => n.name === NODE_NAME);
if (nodeIndex === -1) {
  console.error(`❌ Node "${NODE_NAME}" not found in workflow`);
  process.exit(1);
}
const node = workflow.nodes[nodeIndex];
console.log(`  ✅ Found at index ${nodeIndex} (id: ${node.id})`);

// Step 4: Check if already patched
const currentCode = node.parameters?.jsCode ?? '';
if (currentCode.includes(PATCH_MARKER)) {
  console.log('\n⚠️  Already patched — marker "early_upsert_done" found in node code.');
  console.log('   No changes made.\n');
  process.exit(0);
}

// Step 5: Inject patch
console.log('\nStep 4: Injecting early upsert code...');
if (!currentCode.includes(ANCHOR)) {
  console.error(`❌ Anchor line not found in node code:`);
  console.error(`   "${ANCHOR}"`);
  console.error('   The node code may have changed. Inspect the node manually.');
  process.exit(1);
}

const patchedCode = currentCode.replace(ANCHOR, PATCH_CODE + ANCHOR);
console.log(`  ✅ Patch injected (${currentCode.length} → ${patchedCode.length} chars)`);

// Step 6: Build PUT payload (only allowed fields)
workflow.nodes[nodeIndex].parameters.jsCode = patchedCode;

const putPayload = {
  name:        workflow.name,
  nodes:       workflow.nodes,
  connections: workflow.connections,
  settings:    workflow.settings ?? {},
  staticData:  workflow.staticData ?? null
};

// Step 7: PUT the modified workflow
console.log('\nStep 5: Uploading patched workflow via API...');
const updated = await n8nPut(`/workflows/${WORKFLOW_ID}`, putPayload);
console.log(`  ✅ Workflow updated (updatedAt: ${updated.updatedAt})`);

// Step 8: Summary
console.log('\n══════════════════════════════════════════════════════');
console.log('  PATCH APPLIED SUCCESSFULLY');
console.log('══════════════════════════════════════════════════════\n');
console.log(`  Workflow:  ${WORKFLOW_ID} — "${workflow.name}"`);
console.log(`  Node:      "${NODE_NAME}"`);
console.log(`  Marker:    ${PATCH_MARKER}`);
console.log(`  Backup:    ${BACKUP_PATH}`);
console.log(`  Updated:   ${updated.updatedAt}`);
console.log('\nWhat was patched:');
console.log('  After governance upsert_conversation returns "conversation",');
console.log('  bot_upsert_patient is called (attempts:1, non-fatal) for any');
console.log('  inbound message with a phone number — not just booking intents.');
console.log('  This ensures every contact auto-creates a patient record.\n');
