#!/usr/bin/env node
/**
 * patch_demo_improvements.mjs
 *
 * Fixes 3 issues in the SofIA demo flow:
 *
 * 1. Responder Demo — save lead name/clinic to custom_attributes during capture
 *    so the final private note can include all 4 fields (name, clinic, city, plan).
 *
 * 2. Responder Demo — extend setLeadCaptureState to accept extra custom_attributes
 *    so a single PATCH saves both state + lead field value.
 *
 * 3. Enviar Menu Chatwoot — returning user greeting for LP4 demo template.
 *    Currently ignores ctx.menu_text for demo mode and always sends the full
 *    bienvenida pitch. Now checks messages_count and uses a short greeting.
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const N8N_URL = process.env.N8N_API_URL || 'https://workflows.n8n.redsolucionesti.com';
const API_KEY = process.env.N8N_API_KEY || (() => {
  try { return readFileSync(join(__dirname, '../n8n-mcp/.env'), 'utf8').match(/N8N_API_KEY=(.+)/)?.[1]?.trim() || ''; }
  catch { return ''; }
})();
const WF_ID = '37SLdWISQLgkHeXk';

async function fetchWorkflow() {
  const r = await fetch(`${N8N_URL}/api/v1/workflows/${WF_ID}`, { headers: { 'X-N8N-API-KEY': API_KEY } });
  if (!r.ok) throw new Error(`GET ${r.status}: ${await r.text()}`);
  return r.json();
}
async function putWorkflow(wf) {
  const r = await fetch(`${N8N_URL}/api/v1/workflows/${WF_ID}`, {
    method: 'PUT', headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings, staticData: wf.staticData })
  });
  if (!r.ok) throw new Error(`PUT ${r.status}: ${await r.text()}`);
  return r.json();
}

// ════════════════════════════════════════════════════════════════════════════
// PATCH A — Responder Demo
// ════════════════════════════════════════════════════════════════════════════

// A1: extend setLeadCaptureState to accept extraAttrs
const OLD_SET_LEAD_STATE = `const setLeadCaptureState = async function(state) {
  // state: 'asking_name' | 'asking_clinic' | 'asking_city' | null
  try {
    await this.helpers.httpRequest({
      method: "PATCH",
      url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id,
      headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
      body: JSON.stringify({ custom_attributes: { lead_capture_state: state } }),
      json: false
    });
  } catch(_e) { /* non-critical */ }
};`;

const NEW_SET_LEAD_STATE = `const setLeadCaptureState = async function(state, extraAttrs) {
  // state: 'asking_name' | 'asking_clinic' | 'asking_city' | null
  // extraAttrs: optional additional custom_attributes to persist alongside state
  try {
    var _attrs = Object.assign({ lead_capture_state: state }, extraAttrs || {});
    await this.helpers.httpRequest({
      method: "PATCH",
      url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id,
      headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
      body: JSON.stringify({ custom_attributes: _attrs }),
      json: false
    });
  } catch(_e) { /* non-critical */ }
};`;

// A2: save name to custom_attributes when asking for clinic
const OLD_SAVE_NAME = `    await setLeadCaptureState.call(this, "asking_clinic");
    await sendText.call(this, "\\ud83d\\udc4b \\u00a1Hola, " + name.split(" ")[0] + "! \\u00bfC\\u00f3mo se llama tu cl\\u00ednica?");`;

const NEW_SAVE_NAME = `    await setLeadCaptureState.call(this, "asking_clinic", { lead_name: name });
    await sendText.call(this, "\\ud83d\\udc4b \\u00a1Hola, " + name.split(" ")[0] + "! \\u00bfC\\u00f3mo se llama tu cl\\u00ednica?");`;

// A3: save clinic to custom_attributes when asking for city
const OLD_SAVE_CLINIC = `    await setLeadCaptureState.call(this, "asking_city");
    await sendText.call(this, "\\ud83d\\udccd \\u00bfEn qu\\u00e9 ciudad est\\u00e1 " + clinicName + "? (o tu n\\u00famero de contacto si prefieres)");`;

const NEW_SAVE_CLINIC = `    await setLeadCaptureState.call(this, "asking_city", { lead_clinic: clinicName });
    await sendText.call(this, "\\ud83d\\udccd \\u00bfEn qu\\u00e9 ciudad est\\u00e1 " + clinicName + "? (o tu n\\u00famero de contacto si prefieres)");`;

// A4: enrich private note with name + clinic from custom_attributes
const OLD_PRIVATE_NOTE = `    // Private note for the sales team
    try { await this.helpers.httpRequest({
      method: "POST",
      url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/messages",
      headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
      body: JSON.stringify({ content: "\\ud83d\\udcca LEAD CAPTURADO\\nPlan: " + plan + "\\nCiudad/contacto: " + city, message_type: "outgoing", private: true }),
      json: false
    }); } catch(e) {}`;

const NEW_PRIVATE_NOTE = `    // Private note for the sales team — includes all 4 captured fields
    var _savedName   = (ctx.raw_payload && ctx.raw_payload.conversation && ctx.raw_payload.conversation.custom_attributes && ctx.raw_payload.conversation.custom_attributes.lead_name)   || "";
    var _savedClinic = (ctx.raw_payload && ctx.raw_payload.conversation && ctx.raw_payload.conversation.custom_attributes && ctx.raw_payload.conversation.custom_attributes.lead_clinic) || "";
    var _noteLines = ["\\ud83d\\udcca NUEVO LEAD DEMO"];
    if (_savedName)   _noteLines.push("\\ud83d\\udc64 Nombre: " + _savedName);
    if (_savedClinic) _noteLines.push("\\ud83c\\udfe5 Cl\\u00ednica: " + _savedClinic);
    _noteLines.push("\\ud83d\\udccd Ciudad/contacto: " + city);
    if (plan !== "no especificado") _noteLines.push("\\ud83d\\udcb0 Plan de inter\\u00e9s: " + plan);
    try { await this.helpers.httpRequest({
      method: "POST",
      url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/messages",
      headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
      body: JSON.stringify({ content: _noteLines.join("\\n"), message_type: "outgoing", private: true }),
      json: false
    }); } catch(e) {}`;

// ════════════════════════════════════════════════════════════════════════════
// PATCH B — Enviar Menu Chatwoot: returning user greeting for LP4
// ════════════════════════════════════════════════════════════════════════════

const OLD_LP4_VARS = `    // Build ContentVariables: {1: body, 2..N: option labels}
    var vars = { "1": bienvenidaNode.body };`;

const NEW_LP4_VARS = `    // Build ContentVariables: {1: body/greeting, 2..N: option labels}
    // Returning users (messages_count > 3) get a short greeting instead of the full pitch
    var _mc = (ctx.raw_payload && ctx.raw_payload.conversation && ctx.raw_payload.conversation.messages_count) || 0;
    var _fn = (ctx.sender_name || "").split(" ")[0].trim();
    var _greetBody = _mc > 3
      ? ("\\u00a1Hola de nuevo" + (_fn ? ", " + _fn + "!" : "!") + " \\ud83d\\ude0a \\u00bfQu\\u00e9 te gustar\\u00eda explorar?")
      : bienvenidaNode.body;
    var vars = { "1": _greetBody };`;

// ════════════════════════════════════════════════════════════════════════════
// APPLY PATCHES
// ════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('Fetching workflow', WF_ID, '...');
  const wf = await fetchWorkflow();
  let totalChanged = 0;

  // ── Patch Responder Demo ─────────────────────────────────────────────────
  const rdIdx = wf.nodes.findIndex(n => n.name === 'Responder Demo');
  if (rdIdx === -1) throw new Error('Responder Demo not found');
  let rdCode = wf.nodes[rdIdx].parameters.jsCode;
  writeFileSync(join(__dirname, '../saas/responder_demo_backup.txt'), rdCode);

  const rdPatches = [
    ['A1 setLeadCaptureState extraAttrs', OLD_SET_LEAD_STATE, NEW_SET_LEAD_STATE],
    ['A2 save lead_name to custom_attributes', OLD_SAVE_NAME, NEW_SAVE_NAME],
    ['A3 save lead_clinic to custom_attributes', OLD_SAVE_CLINIC, NEW_SAVE_CLINIC],
    ['A4 enrich private note', OLD_PRIVATE_NOTE, NEW_PRIVATE_NOTE],
  ];

  for (const [label, oldStr, newStr] of rdPatches) {
    if (rdCode.includes(oldStr)) {
      rdCode = rdCode.replace(oldStr, newStr);
      totalChanged++;
      console.log('✅', label);
    } else if (rdCode.includes(newStr.split('\n')[0])) {
      console.log('⏩', label, '— already applied');
    } else {
      console.warn('⚠️ ', label, '— not found, skipping');
    }
  }
  wf.nodes[rdIdx] = { ...wf.nodes[rdIdx], parameters: { ...wf.nodes[rdIdx].parameters, jsCode: rdCode } };

  // ── Patch Enviar Menu Chatwoot ───────────────────────────────────────────
  const emIdx = wf.nodes.findIndex(n => n.name === 'Enviar Menu Chatwoot');
  if (emIdx === -1) throw new Error('Enviar Menu Chatwoot not found');
  let emCode = wf.nodes[emIdx].parameters.jsCode;
  writeFileSync(join(__dirname, '../saas/enviar_menu_backup.txt'), emCode);

  if (emCode.includes(OLD_LP4_VARS)) {
    emCode = emCode.replace(OLD_LP4_VARS, NEW_LP4_VARS);
    totalChanged++;
    console.log('✅ B: LP4 returning user greeting');
  } else if (emCode.includes('_greetBody')) {
    console.log('⏩ B: LP4 returning user greeting — already applied');
  } else {
    console.warn('⚠️  B: LP4 vars block not found');
  }
  wf.nodes[emIdx] = { ...wf.nodes[emIdx], parameters: { ...wf.nodes[emIdx].parameters, jsCode: emCode } };

  if (totalChanged === 0) { console.log('No changes needed.'); return; }

  console.log(`\nPushing ${totalChanged} change(s)...`);
  await putWorkflow(wf);
  console.log('✅ Done — demo flow improvements applied.');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
