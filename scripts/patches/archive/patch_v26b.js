// patch_v26b.js — Fix Demo Flow Engine: _CREATE_EVENT and _HUMAN actions
// Root cause: Responder Demo output goes directly to Registrar Metrica,
// so returning {intent: "CREATE_EVENT"} doesn't trigger the booking IF chain.
// Fix: handle _CREATE_EVENT by sending T02 service picker directly.
//      handle _HUMAN by sending handoff message + setting pending status.

const https = require('https');
const fs = require('fs');
const env = fs.readFileSync('c:/Users/Barbara/Documents/n8n_workflow_claudio/n8n-mcp/.env', 'utf8');
const API_KEY = env.match(/N8N_API_KEY=(.+)/)[1].trim();
const WF_ID = '37SLdWISQLgkHeXk';

function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://workflows.n8n.redsolucionesti.com');
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname, port: 443, path, method,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(d); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const wf = await apiRequest('GET', `/api/v1/workflows/${WF_ID}`);
  const responderNode = wf.nodes.find(n => n.name === 'Responder Demo');
  let code = responderNode.parameters.jsCode || responderNode.parameters.functionCode;

  // Find and replace the _CREATE_EVENT and _HUMAN action handlers
  const OLD_CREATE_EVENT = `  if (action === "_CREATE_EVENT") {
    await transitionToNode.call(this, null); // clear df_* state
    return [{ json: Object.assign({}, ctx, { intent: "CREATE_EVENT", classified_by: "DF_ACTION_CREATE_EVENT", skip_ai: false }) }];
  }

  if (action === "_HUMAN") {
    return [{ json: Object.assign({}, ctx, { intent: "HUMAN", classified_by: "DF_ACTION_HUMAN", skip_ai: true }) }];
  }`;

  const NEW_CREATE_EVENT = `  if (action === "_CREATE_EVENT") {
    await transitionToNode.call(this, null); // clear df_* state
    // Send T02 service picker directly (booking funnel cannot be re-routed via IF chain)
    const t02Sid = botConfig.twilio_booking_service_sid;
    if (t02Sid && ctx.contact_phone) {
      let to = ctx.contact_phone;
      if (!to.startsWith("whatsapp:")) to = "whatsapp:" + to;
      const auth = Buffer.from(botConfig.twilio_account_sid + ":" + botConfig.twilio_auth_token).toString("base64");
      const parts = ["From=" + encodeURIComponent(botConfig.twilio_from), "To=" + encodeURIComponent(to), "ContentSid=" + encodeURIComponent(t02Sid)];
      try {
        await this.helpers.httpRequest({ method: "POST", url: "https://api.twilio.com/2010-04-01/Accounts/" + botConfig.twilio_account_sid + "/Messages.json", headers: { "Authorization": "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" }, body: parts.join("&") });
      } catch(e) {}
    } else {
      // Fallback: Chatwoot text
      await sendText.call(this, "\\ud83d\\udcc5 \\u00bfQu\\u00e9 tipo de servicio necesitas?\\n\\n1. Limpieza dental\\n2. Consulta general\\n3. Ortodoncia\\n4. Blanqueamiento\\n5. Implante\\n6. Urgencia");
    }
    // Set awaiting_service state (booking funnel state machine)
    try {
      await this.helpers.httpRequest({ method: "PATCH", url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id, headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" }, body: JSON.stringify({ custom_attributes: { booking_funnel_state: "awaiting_service" } }), json: false });
      var curLabels = convLabels.filter(function(l) { return !l.startsWith("df_") && l !== "awaiting_service" && l !== "awaiting_slot"; });
      curLabels.push("awaiting_service");
      await setLabels.call(this, curLabels);
    } catch(e) {}
    return [{ json: Object.assign({}, ctx, { intent: "SUBMENU_AWAIT", classified_by: "DF_ACTION_CREATE_EVENT_SENT", skip_ai: true }) }];
  }

  if (action === "_HUMAN") {
    await transitionToNode.call(this, null); // clear df_* state
    // Send handoff message + set Chatwoot conversation to pending
    await sendText.call(this, "\\ud83e\\udd1d Perfecto, te conecto ahora con un asesor de SofIA AI.\\n\\nEn un momento te atenderemos. Si tienes alguna pregunta mientras esperas, \\u00a1no dudes en escribir!");
    try {
      await this.helpers.httpRequest({ method: "PATCH", url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id, headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" }, body: JSON.stringify({ status: "pending" }), json: false });
    } catch(e) {}
    return [{ json: Object.assign({}, ctx, { intent: "SUBMENU_AWAIT", classified_by: "DF_ACTION_HUMAN_SENT", skip_ai: true }) }];
  }`;

  if (!code.includes(OLD_CREATE_EVENT.substring(0, 60))) {
    console.log('ERROR: _CREATE_EVENT anchor not found. Showing current code around that area...');
    const lines = code.split('\n');
    const idx = lines.findIndex(l => l.includes('_CREATE_EVENT'));
    for (let i = Math.max(0, idx - 1); i < Math.min(idx + 10, lines.length); i++) {
      console.log(i+1+':', lines[i]);
    }
    return;
  }

  code = code.replace(OLD_CREATE_EVENT, NEW_CREATE_EVENT);
  console.log('Fix: _CREATE_EVENT and _HUMAN handlers replaced');

  if (responderNode.parameters.jsCode !== undefined) responderNode.parameters.jsCode = code;
  else responderNode.parameters.functionCode = code;

  // Parse test
  try {
    new Function('async function t(){' + code + '}');
    console.log('Parse test: ✅');
  } catch(e) {
    console.log('Parse test: ❌', e.message);
    return;
  }

  const payload = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings || {}, staticData: wf.staticData || null };
  const putResp = await apiRequest('PUT', `/api/v1/workflows/${WF_ID}`, payload);
  if (putResp.id) console.log('n8n PUT: OK | Nodes:', putResp.nodes.length);
  else console.log('n8n PUT ERROR:', JSON.stringify(putResp).substring(0, 400));
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
