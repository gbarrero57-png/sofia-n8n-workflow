#!/usr/bin/env node
/**
 * patch_returning_user_greeting.mjs
 *
 * Patches "Generar Texto Menu" to show a short greeting for returning users.
 *
 * Logic:
 *   - New user (messages_count <= 3): full pitch/intro
 *   - Returning user (messages_count > 3): "¡Hola de nuevo, [name]! ¿En qué te ayudo hoy?"
 *
 * Source of truth for "returning": Chatwoot raw_payload.conversation.messages_count
 * (already in ctx — no extra API call needed).
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

// ── New Generar Texto Menu code ───────────────────────────────────────────────
const NEW_CODE = `const ctx = $input.first().json;
const botConfig = ctx.bot_config || {};
const menu = botConfig.menu || {};
const clinicName = ctx.clinic_name || "la clinica";
const nl = String.fromCharCode(10);

// Detect returning user: Chatwoot tracks messages_count on the conversation object.
// We threshold at > 3 so the first exchange (bot intro + user reply) doesn't count.
const _messagesCount = (ctx.raw_payload && ctx.raw_payload.conversation && ctx.raw_payload.conversation.messages_count) || 0;
const _senderName    = (ctx.sender_name || "").split(" ")[0].trim();   // first name only
const _isReturning   = _messagesCount > 3;

// Build header: short for returning, full pitch for new
let header;
if (menu.header) {
  // Custom header from bot_config always wins
  header = menu.header.replace("{clinic_name}", clinicName);
} else if (_isReturning) {
  const _nameGreet = _senderName ? (", " + _senderName + "!") : "!";
  header = "\\u00a1Hola de nuevo" + _nameGreet + " \\u00bfEn qu\\u00e9 te ayudo hoy? \\ud83d\\ude0a";
} else {
  header = (
    "\\u00a1Hola! \\ud83d\\udc4b Soy *SofIA*, tu asistente de *" + clinicName + "* \\ud83e\\uddb7" + nl +
    "\\u00bfEn qu\\u00e9 te puedo ayudar hoy?"
  );
}

const footer = menu.footer || (nl + nl + "Responde con el *n\\u00famero* de tu opci\\u00f3n \\ud83d\\udc47");

const options = menu.options || [
  { id: "1", emoji: "\\ud83d\\udcc5", label: "Agendar una cita",          intent: "CREATE_EVENT" },
  { id: "2", emoji: "\\ud83d\\udcb0", label: "Precios y servicios",       intent: "INFO",  query: "precios servicios tratamientos de la clinica" },
  { id: "3", emoji: "\\ud83d\\udccd", label: "Horarios y ubicaci\\u00f3n", intent: "INFO",  query: "horarios de atencion ubicacion direccion como llegar" },
  { id: "4", emoji: "\\ud83d\\udccb", label: "Ver o cancelar mi cita",    intent: "APPOINTMENT_STATUS" },
  { id: "5", emoji: "\\ud83d\\udc69\\u200d\\u2695\\ufe0f", label: "Hablar con un asesor", intent: "HUMAN" }
];

const optionLines = options.map(function(o) { const em = o.emoji ? o.emoji + " " : ""; return em + "*" + o.id + ".* " + o.label; }).join(nl);
const menuText = header + nl + nl + optionLines + footer;

// Reset slot confirmation state — clear awaiting_slot label
try {
  await this.helpers.httpRequest({
    method: "POST",
    url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/labels",
    headers: { "api_access_token": $node["Merge Clinic Data"].json.chatwoot_api_token, "Content-Type": "application/json" },
    body: { labels: [] },
    json: true
  });
} catch(e) { /* non-fatal — continue showing menu */ }

// Reset conversation_state to idle (single source of truth)
try {
  await this.helpers.httpRequest({
    method: "PATCH",
    url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id,
    headers: { "api_access_token": $node["Merge Clinic Data"].json.chatwoot_api_token, "Content-Type": "application/json" },
    body: { custom_attributes: { conversation_state: "idle" } },
    json: true
  });
} catch(e) { /* non-fatal */ }

return [{ json: Object.assign({}, ctx, { menu_text: menuText, menu_options: options, _last_message_was_menu: true }) }];`;

async function main() {
  console.log('Fetching workflow', WORKFLOW_ID, '...');
  const wf = await fetchWorkflow();

  const nodeIdx = wf.nodes.findIndex(n => n.name === 'Generar Texto Menu');
  if (nodeIdx === -1) throw new Error('"Generar Texto Menu" not found');

  const oldCode = wf.nodes[nodeIdx].parameters.jsCode;
  writeFileSync(join(__dirname, '../saas/generar_menu_backup.txt'), oldCode);
  console.log('Backup saved to saas/generar_menu_backup.txt');

  if (oldCode.includes('_isReturning')) {
    console.log('✅ Already patched — _isReturning already present');
    return;
  }

  wf.nodes[nodeIdx] = { ...wf.nodes[nodeIdx], parameters: { ...wf.nodes[nodeIdx].parameters, jsCode: NEW_CODE } };

  console.log('Pushing patched workflow...');
  await putWorkflow(wf);
  console.log('✅ Generar Texto Menu patched!');
  console.log('   Returning users (messages_count > 3) get short greeting.');
  console.log('   New users get full intro.');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
