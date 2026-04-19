#!/usr/bin/env node
/**
 * patch_reengagement_activity.mjs
 *
 * Patches "Bot Pause Check" in SofIA workflow (37SLdWISQLgkHeXk) to pass
 * p_update_activity: false when the webhook event is NOT an incoming message.
 *
 * Root cause fixed: Chatwoot fires webhooks for every outgoing SofIA message.
 * Bot Pause Check ran upsert_conversation on ALL webhooks → last_activity_at
 * was reset constantly → re-engagement cron never found conversations in R1/R2.
 *
 * Fix: only update last_activity_at when message_type === 'incoming'.
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const N8N_URL = process.env.N8N_API_URL || 'https://workflows.n8n.redsolucionesti.com';
const API_KEY = process.env.N8N_API_KEY || (() => {
  try {
    const env = readFileSync(join(__dirname, '../n8n-mcp/.env'), 'utf8');
    return env.match(/N8N_API_KEY=(.+)/)?.[1]?.trim() || '';
  } catch { return ''; }
})();

const WORKFLOW_ID = '37SLdWISQLgkHeXk';

async function fetchWorkflow() {
  const res = await fetch(`${N8N_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
    headers: { 'X-N8N-API-KEY': API_KEY }
  });
  if (!res.ok) throw new Error(`GET workflow failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function putWorkflow(wf) {
  const payload = {
    name:        wf.name,
    nodes:       wf.nodes,
    connections: wf.connections,
    settings:    wf.settings,
    staticData:  wf.staticData
  };
  const res = await fetch(`${N8N_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
    method:  'PUT',
    headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`PUT workflow failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Patch: the new upsert_conversation call block ──────────────────────────
const OLD_UPSERT = `    govResult = await supabaseRpc('upsert_conversation', {
        p_clinic_id:                clinicId,
        p_chatwoot_conversation_id: conversationId,
        p_patient_name:             patientName,
        p_last_message:             messageText
    }, { attempts: 3 });`;

const NEW_UPSERT = `    // Only update last_activity_at for INCOMING messages.
    // Chatwoot fires webhooks for outgoing SofIA messages too — if we reset
    // last_activity_at on those, the re-engagement timer never stays idle.
    const isIncomingMessage = $json.message_type === 'incoming';

    govResult = await supabaseRpc('upsert_conversation', {
        p_clinic_id:                clinicId,
        p_chatwoot_conversation_id: conversationId,
        p_patient_name:             patientName,
        p_last_message:             messageText,
        p_update_activity:          isIncomingMessage
    }, { attempts: 3 });`;

// ───────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching workflow', WORKFLOW_ID, '...');
  const wf = await fetchWorkflow();

  const nodeIdx = wf.nodes.findIndex(n => n.name === 'Bot Pause Check');
  if (nodeIdx === -1) throw new Error('Node "Bot Pause Check" not found');

  const node = wf.nodes[nodeIdx];
  const code = node.parameters.jsCode;
  if (!code) throw new Error('"Bot Pause Check" has no jsCode parameter');

  if (!code.includes(OLD_UPSERT.trim().split('\n')[0])) {
    // Check if already patched
    if (code.includes('p_update_activity')) {
      console.log('✅ Already patched — p_update_activity already present in Bot Pause Check');
      process.exit(0);
    }
    throw new Error('Could not find expected upsert_conversation call in Bot Pause Check. Manual review needed.');
  }

  const patched = code.replace(OLD_UPSERT, NEW_UPSERT);
  if (patched === code) throw new Error('Replacement had no effect — string not found exactly');

  // Save backup
  const backupPath = join(__dirname, '../saas/bot_pause_check_backup.txt');
  writeFileSync(backupPath, code);
  console.log('Backup saved to', backupPath);

  wf.nodes[nodeIdx] = { ...node, parameters: { ...node.parameters, jsCode: patched } };

  console.log('Pushing patched workflow...');
  await putWorkflow(wf);
  console.log('✅ Bot Pause Check patched successfully!');
  console.log('   outgoing messages will no longer reset last_activity_at.');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
