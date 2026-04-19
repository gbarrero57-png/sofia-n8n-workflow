// patch_v26_menu.js — Patch Enviar Menu Chatwoot:
// When demo_mode=true AND demo_flow config exists, send LP4 bienvenida instead of T01
// This ensures "hola"/GREETING shows the demo flow bienvenida for demo clinics

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

const NEW_CODE = `// ── ENVIAR MENU: Demo Flow bienvenida | Twilio T01 | Chatwoot fallback ──────
const ctx = $input.first().json;
const botConfig = ctx.bot_config || {};

const persistMenuFlag = async function() {
  try {
    await this.helpers.httpRequest({
      method: "PATCH",
      url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id,
      headers: { "api_access_token": botConfig.chatwoot_api_token || ctx.chatwoot_api_token, "Content-Type": "application/json" },
      body: JSON.stringify({ custom_attributes: { last_message_was_menu: true } }),
      json: false
    });
  } catch(e) {}
};

// ── DEMO MODE: send LP4 bienvenida (interactive flow) ────────────────────
const demoFlow = botConfig.demo_flow || null;
const isDemoMode = botConfig.demo_mode === true && demoFlow && demoFlow.nodes && demoFlow.start_node;
const lp4Sid = botConfig.twilio_lp4_sid || null;

if (isDemoMode && lp4Sid && ctx.contact_phone) {
  const bienvenidaNode = demoFlow.nodes[demoFlow.start_node];
  if (bienvenidaNode) {
    // Clear all df_* labels (fresh start)
    try {
      const convLabels = (ctx.raw_payload && ctx.raw_payload.conversation && ctx.raw_payload.conversation.labels) || [];
      const cleanLabels = convLabels.filter(function(l) { return !l.startsWith("df_"); });
      cleanLabels.push("df_" + demoFlow.start_node);
      await this.helpers.httpRequest({
        method: "POST",
        url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/labels",
        headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
        body: JSON.stringify({ labels: cleanLabels }),
        json: false
      });
    } catch(e) {}

    // Build ContentVariables: {1: body, 2..N: option labels}
    var vars = { "1": bienvenidaNode.body };
    for (var vi = 0; vi < bienvenidaNode.options.length; vi++) {
      vars[String(vi + 2)] = bienvenidaNode.options[vi].label;
    }

    let toNumber = ctx.contact_phone;
    if (!toNumber.startsWith("whatsapp:")) toNumber = "whatsapp:" + toNumber;
    const basicAuth = Buffer.from(botConfig.twilio_account_sid + ":" + botConfig.twilio_auth_token).toString("base64");
    const body = [
      "From=" + encodeURIComponent(botConfig.twilio_from),
      "To=" + encodeURIComponent(toNumber),
      "ContentSid=" + encodeURIComponent(lp4Sid),
      "ContentVariables=" + encodeURIComponent(JSON.stringify(vars))
    ].join("&");

    const resp = await this.helpers.httpRequest({
      method: "POST",
      url: "https://api.twilio.com/2010-04-01/Accounts/" + botConfig.twilio_account_sid + "/Messages.json",
      headers: { "Authorization": "Basic " + basicAuth, "Content-Type": "application/x-www-form-urlencoded" },
      body: body
    });

    await persistMenuFlag.call(this);
    return [{ json: Object.assign({}, ctx, { menu_sent_via: "demo_lp4_bienvenida", twilio_sid: resp.sid || "", _last_message_was_menu: true }) }];
  }
}

// ── STANDARD: Twilio T01 or Chatwoot text ────────────────────────────────
const isTwilio = !!botConfig.twilio_account_sid && !!botConfig.twilio_menu_content_sid && !!ctx.contact_phone;

if (isTwilio) {
  const accountSid = botConfig.twilio_account_sid;
  const authToken  = botConfig.twilio_auth_token;
  const fromNumber = botConfig.twilio_from;
  const contentSid = botConfig.twilio_menu_content_sid;
  const clinicName = ctx.clinic_name || "la clinica";

  let toNumber = ctx.contact_phone;
  if (!toNumber.startsWith("whatsapp:")) toNumber = "whatsapp:" + toNumber;

  const basicAuth = Buffer.from(accountSid + ":" + authToken).toString("base64");
  const contentVars = JSON.stringify({ "1": clinicName });
  const body = [
    "From=" + encodeURIComponent(fromNumber),
    "To=" + encodeURIComponent(toNumber),
    "ContentSid=" + encodeURIComponent(contentSid),
    "ContentVariables=" + encodeURIComponent(contentVars)
  ].join("&");

  const resp = await this.helpers.httpRequest({
    method: "POST",
    url: "https://api.twilio.com/2010-04-01/Accounts/" + accountSid + "/Messages.json",
    headers: { "Authorization": "Basic " + basicAuth, "Content-Type": "application/x-www-form-urlencoded" },
    body: body
  });

  await persistMenuFlag.call(this);
  return [{ json: Object.assign({}, ctx, { menu_sent_via: "twilio_interactive", twilio_sid: resp.sid || "", _last_message_was_menu: true }) }];

} else {
  await this.helpers.httpRequest({
    method: "POST",
    url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/messages",
    headers: { "api_access_token": ctx.chatwoot_api_token || botConfig.chatwoot_api_token, "Content-Type": "application/json" },
    body: JSON.stringify({ content: ctx.menu_text, message_type: "outgoing", private: false }),
    json: false
  });

  return [{ json: Object.assign({}, ctx, { menu_sent_via: "chatwoot_text" }) }];
}`;

async function main() {
  const wf = await apiRequest('GET', `/api/v1/workflows/${WF_ID}`);
  const emc = wf.nodes.find(n => n.name === 'Enviar Menu Chatwoot');

  if (emc.parameters.jsCode !== undefined) emc.parameters.jsCode = NEW_CODE;
  else emc.parameters.functionCode = NEW_CODE;

  const payload = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings || {}, staticData: wf.staticData || null };
  const putResp = await apiRequest('PUT', `/api/v1/workflows/${WF_ID}`, payload);
  if (putResp.id) console.log('patch_v26_menu: OK | Enviar Menu Chatwoot now handles demo_mode | Nodes:', putResp.nodes.length);
  else console.log('ERROR:', JSON.stringify(putResp).substring(0, 400));
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
