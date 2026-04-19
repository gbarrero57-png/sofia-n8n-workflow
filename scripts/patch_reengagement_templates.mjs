/**
 * patch_reengagement_templates.mjs
 * Activa las 3 plantillas de re-engagement aprobadas por Meta en el workflow
 * SofIA - Re-engagement Reminders (CwL85rI1rLFD0MS1)
 */

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const BASE   = 'https://workflows.n8n.redsolucionesti.com';
const WF_ID  = 'CwL85rI1rLFD0MS1';

// ── New "Fetch Slots & Build Message" — sends via Twilio approved templates ──
const NEW_FETCH_CODE = [
  "// Fetch Slots & Build Message v2 — Twilio templates aprobados por Meta",
  "// R1+slots:  sofia_reengagement_slots_v1   HXc62107b182cbaefffb98844a60f52de6",
  "// R1 gen:    sofia_reengagement_generic_v1  HX9c958e4363ddec3ae45d30269043833b",
  "// R2 final:  sofia_reengagement_final_v1    HXa782b941e8de93c53e48936f605a2aca",
  "// {{1}}=first_name  {{2}}=clinic_name",
  "",
  "const item = $input.first().json;",
  "const SUPABASE_URL  = $env.N8N_SUPABASE_URL || 'https://inhyrrjidhzrbqecnptn.supabase.co';",
  "const SERVICE_KEY   = $env.N8N_SUPABASE_SERVICE_KEY;",
  "const CHATWOOT_BASE = 'https://chat.redsolucionesti.com';",
  "",
  "const reminder_type            = item.reminder_type;",
  "const clinic_id                = item.clinic_id;",
  "const clinic_name              = item.clinic_name || '';",
  "const patient_name             = item.patient_name || '';",
  "const first_name               = patient_name.split(' ')[0].trim() || 'amigo';",
  "const chatwoot_conversation_id = item.chatwoot_conversation_id;",
  "const chatwoot_account_id      = item.chatwoot_account_id || 2;",
  "",
  "// 1. Fetch bot_config from Supabase (Twilio credentials)",
  "let botConfig = {};",
  "try {",
  "  const cr = await this.helpers.httpRequest({",
  "    method: 'GET',",
  "    url: SUPABASE_URL + '/rest/v1/clinics?id=eq.' + clinic_id + '&select=bot_config',",
  "    headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY }",
  "  });",
  "  botConfig = (Array.isArray(cr) && cr[0] && cr[0].bot_config) || {};",
  "} catch(e) { console.warn('bot_config fetch err: ' + e.message); }",
  "",
  "const hasTwilio = !!(botConfig.twilio_account_sid && botConfig.twilio_auth_token && botConfig.twilio_from);",
  "const apiToken  = botConfig.chatwoot_api_token || 'yypAwZDH2dV3crfbqJqWCgj1';",
  "",
  "// 2. Fetch contact phone from Chatwoot",
  "let contactPhone = item.phone || '';",
  "if (!contactPhone && hasTwilio) {",
  "  try {",
  "    const convR = await this.helpers.httpRequest({",
  "      method: 'GET',",
  "      url: CHATWOOT_BASE + '/api/v1/accounts/' + chatwoot_account_id + '/conversations/' + chatwoot_conversation_id,",
  "      headers: { api_access_token: apiToken }",
  "    });",
  "    const ph = (convR.meta && convR.meta.sender && convR.meta.sender.phone_number) || '';",
  "    if (ph) contactPhone = ph.replace(/[^+0-9]/g, '');",
  "  } catch(e) { console.warn('phone fetch err: ' + e.message); }",
  "}",
  "",
  "// 3. Choose template SID based on reminder_type and slot availability",
  "let templateSid = null;",
  "if (reminder_type === 'R1') {",
  "  let hasSlots = false;",
  "  try {",
  "    const mr = await this.helpers.httpRequest({",
  "      method: 'GET',",
  "      url: CHATWOOT_BASE + '/api/v1/accounts/' + chatwoot_account_id + '/conversations/' + chatwoot_conversation_id + '/messages',",
  "      headers: { api_access_token: apiToken }",
  "    });",
  "    hasSlots = (mr.payload || []).some(function(m) {",
  "      return m.private && typeof m.content === 'string' && m.content.startsWith('SOFIA_SLOTS:');",
  "    });",
  "  } catch(e) {}",
  "  // slots -> reengagement_slots, no slots -> reengagement_generic",
  "  templateSid = hasSlots",
  "    ? 'HXc62107b182cbaefffb98844a60f52de6'",
  "    : 'HX9c958e4363ddec3ae45d30269043833b';",
  "} else {",
  "  // R2: last attempt template",
  "  templateSid = 'HXa782b941e8de93c53e48936f605a2aca';",
  "}",
  "",
  "// 4. Send via Twilio Content API",
  "let sent_via = 'pending';",
  "if (hasTwilio && contactPhone && templateSid) {",
  "  let toPhone = contactPhone;",
  "  if (!toPhone.startsWith('whatsapp:')) toPhone = 'whatsapp:' + toPhone;",
  "  const auth  = Buffer.from(botConfig.twilio_account_sid + ':' + botConfig.twilio_auth_token).toString('base64');",
  "  const cvars = JSON.stringify({ '1': first_name, '2': clinic_name });",
  "  const body  = [",
  "    'From='             + encodeURIComponent(botConfig.twilio_from),",
  "    'To='               + encodeURIComponent(toPhone),",
  "    'ContentSid='       + encodeURIComponent(templateSid),",
  "    'ContentVariables=' + encodeURIComponent(cvars)",
  "  ].join('&');",
  "  try {",
  "    await this.helpers.httpRequest({",
  "      method: 'POST',",
  "      url: 'https://api.twilio.com/2010-04-01/Accounts/' + botConfig.twilio_account_sid + '/Messages.json',",
  "      headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },",
  "      body: body",
  "    });",
  "    sent_via = 'twilio';",
  "    console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'REENG_TWILIO_SENT',",
  "      conv: chatwoot_conversation_id, type: reminder_type, sid: templateSid, to: toPhone }));",
  "  } catch(e) {",
  "    console.error(JSON.stringify({ ts: new Date().toISOString(), event: 'TWILIO_SEND_ERR', error: e.message }));",
  "    sent_via = 'twilio_failed';",
  "  }",
  "}",
  "",
  "// 5. Chatwoot plain text fallback (when no Twilio or Twilio failed)",
  "if (sent_via !== 'twilio') {",
  "  var gr  = first_name ? ('Hola ' + first_name + '! \\uD83D\\uDC4B') : 'Hola! \\uD83D\\uDC4B';",
  "  var msg = reminder_type === 'R1'",
  "    ? gr + '\\n\\nNotamos que no terminaste de agendar tu cita en ' + clinic_name + '. \\u00BFSeguimos con eso? Tenemos horarios esta semana \\uD83D\\uDCC5'",
  "    : gr + '\\n\\n\\u00DAltimo aviso de ' + clinic_name + ' \\uD83D\\uDE0A Si en alg\\u00FAn momento quieres tu cita dental, aqu\\u00ED estamos. \\uD83E\\uDDB7';",
  "  try {",
  "    await this.helpers.httpRequest({",
  "      method: 'POST',",
  "      url: CHATWOOT_BASE + '/api/v1/accounts/' + chatwoot_account_id + '/conversations/' + chatwoot_conversation_id + '/messages',",
  "      headers: { api_access_token: apiToken, 'Content-Type': 'application/json' },",
  "      body: JSON.stringify({ content: msg, message_type: 'outgoing' }),",
  "      json: false",
  "    });",
  "    sent_via = 'chatwoot';",
  "  } catch(e) {",
  "    console.error(JSON.stringify({ ts: new Date().toISOString(), event: 'CHATWOOT_SEND_ERR', error: e.message }));",
  "    sent_via = 'failed';",
  "  }",
  "}",
  "",
  "return [{ json: Object.assign({}, item, { sent_via: sent_via, template_sid: templateSid, contact_phone: contactPhone }) }];"
].join('\n');

const PASSTHROUGH_CODE = [
  "// Sending already done in 'Fetch Slots & Build Message' (Twilio templates v2)",
  "return [{ json: $input.first().json }];"
].join('\n');

// ── Fetch and patch workflow ──────────────────────────────────────────────────
const wf = await fetch(`${BASE}/api/v1/workflows/${WF_ID}`, {
  headers: { 'X-N8N-API-KEY': API_KEY }
}).then(r => r.json());

// Update code node
const fetchNode = wf.nodes.find(n => n.name === 'Fetch Slots & Build Message');
fetchNode.parameters.jsCode = NEW_FETCH_CODE;

// Convert HTTP Request "Send via Chatwoot" → passthrough Code node
const sendNode = wf.nodes.find(n => n.name === 'Send via Chatwoot');
sendNode.type        = 'n8n-nodes-base.code';
sendNode.typeVersion = 2;
sendNode.parameters  = { jsCode: PASSTHROUGH_CODE };

const r = await fetch(`${BASE}/api/v1/workflows/${WF_ID}`, {
  method: 'PUT',
  headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings, staticData: null })
});
console.log(r.ok ? '✅ Re-engagement workflow updated' : '❌ Failed: ' + r.status);
if (!r.ok) console.log(await r.text());
