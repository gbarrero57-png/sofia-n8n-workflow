#!/usr/bin/env node
/**
 * patch_greeting_guard.mjs
 *
 * Fixes Pre-Clasificador Keywords so "Hola" (and other greetings) always
 * reset stale booking/day-choice state.
 *
 * Root cause: WhatsApp sometimes prefixes messages with invisible Unicode
 * characters (zero-width space \u200b etc.), which causes the GREETING_OVERRIDE
 * regex /^(hola|...)/ to fail. The awaiting_day_choice / awaiting_slot checks
 * then fire without any greeting guard, misrouting the user into the booking flow.
 *
 * Fix:
 *  1. Strip invisible Unicode chars from `message` computation (first 2 lines)
 *  2. Add !_isShortGreeting guard to awaitingDayChoice block
 *  3. Add !_isShortGreeting guard to awaitingSlot block
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
  if (!res.ok) throw new Error(`GET failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function putWorkflow(wf) {
  const res = await fetch(`${N8N_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings, staticData: wf.staticData })
  });
  if (!res.ok) throw new Error(`PUT failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Patch 1: Strip invisible chars from message computation ──────────────────
const OLD_MESSAGE_LINE = `const message = ($json.message_text || "").toLowerCase().trim();`;
const NEW_MESSAGE_LINE = `const message = ($json.message_text || "").replace(/[\\u200b-\\u200f\\u2028-\\u202f\\u00ad\\ufeff]/g, "").toLowerCase().trim();`;

// ── Patch 2: awaitingDayChoice — add !_isShortGreeting guard ─────────────────
const OLD_DAY_CHOICE = `var awaitingDayChoice = convLabels.includes("awaiting_day_choice");
if (awaitingDayChoice) {`;
const NEW_DAY_CHOICE = `var awaitingDayChoice = convLabels.includes("awaiting_day_choice");
if (awaitingDayChoice && !_isShortGreeting) {`;

// ── Patch 3: awaitingSlot — add !_isShortGreeting guard ──────────────────────
const OLD_SLOT = `const awaitingSlot = convLabels.includes("awaiting_slot");
if (awaitingSlot) {`;
const NEW_SLOT = `const awaitingSlot = convLabels.includes("awaiting_slot");
if (awaitingSlot && !_isShortGreeting) {`;

async function main() {
  console.log('Fetching workflow', WORKFLOW_ID, '...');
  const wf = await fetchWorkflow();

  const nodeIdx = wf.nodes.findIndex(n => n.name === 'Pre-Clasificador Keywords');
  if (nodeIdx === -1) throw new Error('"Pre-Clasificador Keywords" not found');

  let code = wf.nodes[nodeIdx].parameters.jsCode;
  if (!code) throw new Error('No jsCode found');

  // Backup
  writeFileSync(join(__dirname, '../saas/preclasif_backup.txt'), code);
  console.log('Backup saved to saas/preclasif_backup.txt');

  let changed = 0;

  // Patch 1
  if (code.includes(OLD_MESSAGE_LINE)) {
    code = code.replace(OLD_MESSAGE_LINE, NEW_MESSAGE_LINE);
    changed++;
    console.log('✅ Patch 1: invisible char stripping added to message computation');
  } else if (code.includes(NEW_MESSAGE_LINE)) {
    console.log('⏩ Patch 1: already applied');
  } else {
    console.warn('⚠️  Patch 1: OLD_MESSAGE_LINE not found — skipping');
  }

  // Patch 2
  if (code.includes(OLD_DAY_CHOICE)) {
    code = code.replace(OLD_DAY_CHOICE, NEW_DAY_CHOICE);
    changed++;
    console.log('✅ Patch 2: !_isShortGreeting guard added to awaitingDayChoice');
  } else if (code.includes(NEW_DAY_CHOICE)) {
    console.log('⏩ Patch 2: already applied');
  } else {
    console.warn('⚠️  Patch 2: awaitingDayChoice block not found — skipping');
  }

  // Patch 3
  if (code.includes(OLD_SLOT)) {
    code = code.replace(OLD_SLOT, NEW_SLOT);
    changed++;
    console.log('✅ Patch 3: !_isShortGreeting guard added to awaitingSlot');
  } else if (code.includes(NEW_SLOT)) {
    console.log('⏩ Patch 3: already applied');
  } else {
    console.warn('⚠️  Patch 3: awaitingSlot block not found — skipping');
  }

  if (changed === 0) {
    console.log('No changes needed.');
    return;
  }

  wf.nodes[nodeIdx] = { ...wf.nodes[nodeIdx], parameters: { ...wf.nodes[nodeIdx].parameters, jsCode: code } };
  console.log('Pushing patched workflow...');
  await putWorkflow(wf);
  console.log(`✅ Pre-Clasificador Keywords patched (${changed} change(s))`);
  console.log('   Greetings now always reset stale day/slot state.');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
