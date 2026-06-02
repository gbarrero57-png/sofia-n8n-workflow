/**
 * patch_link_appointment_patient.mjs
 * Patches "Guardar Cita Supabase" in the SofIA workflow to call
 * bot_upsert_patient after creating the appointment and then PATCH
 * the appointment row with the resulting patient_id.
 *
 * Without this, appointments are created without a patient_id reference,
 * breaking the patient lifecycle trigger (trg_activate_patient_on_appointment)
 * and the prospectos lead dashboard.
 *
 * Run: node scripts/patch_link_appointment_patient.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ENV_PATH     = join(__dirname, '../n8n-mcp/.env');
const BACKUP_PATH  = join(__dirname, '../saas/sofia_before_patient_link.json');
const N8N_URL      = 'https://workflows.n8n.redsolucionesti.com';
const WORKFLOW_ID  = '37SLdWISQLgkHeXk';
const NODE_NAME    = 'Guardar Cita Supabase';
const PATCH_MARKER = 'patient_link_v1';

const envContent = readFileSync(ENV_PATH, 'utf8');
const apiKeyMatch = envContent.match(/N8N_API_KEY=(.+)/);
if (!apiKeyMatch) { console.error('❌ N8N_API_KEY not found in n8n-mcp/.env'); process.exit(1); }
const API_KEY = apiKeyMatch[1].trim();

async function n8nGet(path) {
  const res = await fetch(`${N8N_URL}/api/v1${path}`, {
    headers: { 'X-N8N-API-KEY': API_KEY }
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function n8nPut(path, body) {
  const res = await fetch(`${N8N_URL}/api/v1${path}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// ── Patch to inject ───────────────────────────────────────────────────────────
// The node already calls bot_upsert_patient and has pid027.
// We insert a PATCH call right after getting pid027 to link appointment.patient_id,
// then update the return to expose patient_id.

const PATCH_CODE = `
    // ── LINK appointment.patient_id — ${PATCH_MARKER} ──────────────────────
    if (pid027 && apptId) {
      try {
        await this.helpers.httpRequest({
          method: 'PATCH',
          url: SUPABASE_URL + '/rest/v1/appointments?id=eq.' + apptId,
          headers: supH,
          body: { patient_id: pid027 },
          json: true
        });
        console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'PATIENT_LINKED', appointment_id: apptId, patient_id: pid027 }));
      } catch(patchErr) {
        console.warn(JSON.stringify({ ts: new Date().toISOString(), event: 'PATIENT_LINK_SKIP', reason: patchErr.message.slice(0,80) }));
      }
    }
    // ─────────────────────────────────────────────────────────────────────────
`;

// Anchor: the line right after getting pid027, before log_clinical_event
const ANCHOR = `    const pid027 = upsertR && upsertR.patient_id;`;

// The final return statement to update (expose patient_id)
const OLD_RETURN = `return [{ json: Object.assign({}, ctx, { appointment_id: apptId, appointment_saved: true }) }];`;
const NEW_RETURN  = `const linkedPatientId = typeof pid027 !== 'undefined' ? pid027 : null;\nreturn [{ json: Object.assign({}, ctx, { appointment_id: apptId, appointment_saved: true, patient_id: linkedPatientId }) }];`;

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════');
console.log('  SofIA — patch_link_appointment_patient');
console.log('══════════════════════════════════════════════════════\n');

console.log(`Step 1: Fetching workflow ${WORKFLOW_ID}...`);
const workflow = await n8nGet(`/workflows/${WORKFLOW_ID}`);
console.log(`  ✅ Got "${workflow.name}" (${workflow.nodes?.length ?? 0} nodes)`);

console.log(`\nStep 2: Saving backup to ${BACKUP_PATH}...`);
writeFileSync(BACKUP_PATH, JSON.stringify(workflow, null, 2), 'utf8');
console.log('  ✅ Backup saved');

console.log(`\nStep 3: Locating "${NODE_NAME}" node...`);
const nodeIndex = workflow.nodes.findIndex(n => n.name === NODE_NAME);
if (nodeIndex === -1) { console.error(`❌ Node "${NODE_NAME}" not found`); process.exit(1); }
const node = workflow.nodes[nodeIndex];
console.log(`  ✅ Found at index ${nodeIndex} (id: ${node.id})`);

const currentCode = node.parameters?.jsCode ?? '';
if (currentCode.includes(PATCH_MARKER)) {
  console.log('\n⚠️  Already patched — marker found. No changes made.\n');
  process.exit(0);
}

console.log('\nStep 4: Injecting patient link code...');
if (!currentCode.includes(ANCHOR)) {
  console.error('❌ Anchor line not found — node code may have changed. Inspect manually.');
  process.exit(1);
}
if (!currentCode.includes(OLD_RETURN)) {
  console.error('❌ Return statement not found — node code may have changed. Inspect manually.');
  process.exit(1);
}

const patchedCode = currentCode
  .replace(ANCHOR, ANCHOR + '\n' + PATCH_CODE)
  .replace(OLD_RETURN, NEW_RETURN);

console.log(`  ✅ Patch injected (${currentCode.length} → ${patchedCode.length} chars)`);

workflow.nodes[nodeIndex].parameters.jsCode = patchedCode;

const putPayload = {
  name:        workflow.name,
  nodes:       workflow.nodes,
  connections: workflow.connections,
  settings:    workflow.settings ?? {},
  staticData:  workflow.staticData ?? null
};

console.log('\nStep 5: Uploading patched workflow...');
const updated = await n8nPut(`/workflows/${WORKFLOW_ID}`, putPayload);
console.log(`  ✅ Workflow updated (updatedAt: ${updated.updatedAt})`);

console.log('\n══════════════════════════════════════════════════════');
console.log('  PATCH APPLIED SUCCESSFULLY');
console.log('══════════════════════════════════════════════════════\n');
console.log(`  Workflow: ${WORKFLOW_ID}`);
console.log(`  Node:     "${NODE_NAME}"`);
console.log(`  Backup:   ${BACKUP_PATH}\n`);
console.log('What was patched:');
console.log('  After saving an appointment, calls bot_upsert_patient(clinic_id, phone)');
console.log('  to get/create the patient record, then PATCHes appointment.patient_id.');
console.log('  This activates trg_activate_patient_on_appointment when status=confirmed.\n');
console.log('For existing orphaned appointments, run:');
console.log('  SELECT link_orphan_appointments(\'<clinic_id>\') in Supabase SQL editor.\n');
