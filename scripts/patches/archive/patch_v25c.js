// patch_v25c.js — Fix SyntaxError in Responder Demo: multi-line strings with literal newlines
// Root cause: strings like "text\n\nmore text" were stored with actual newlines inside double quotes

const https = require('https');
const fs = require('fs');
const env = fs.readFileSync('c:/Users/Barbara/Documents/n8n_workflow_claudio/n8n-mcp/.env', 'utf8');
const API_KEY = env.match(/N8N_API_KEY=(.+)/)[1].trim();
const API_URL = env.match(/N8N_API_URL=(.+)/)[1].trim();
const WF_ID = '37SLdWISQLgkHeXk';

function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_URL);
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname, port: url.port || 443, path, method,
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

// Fixed Responder Demo code with all newlines properly escaped inside strings
const FIXED_CODE = `const ctx = $input.first().json;
const botConfig = ctx.bot_config || {};
const intent = ctx.intent || "";

const sendChatwoot = async function(text) {
  await this.helpers.httpRequest({
    method: "POST",
    url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/messages",
    headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
    body: JSON.stringify({ content: text, message_type: "outgoing", private: false }),
    json: false
  });
};

const sendTwilio = async function(contentSid) {
  if (!botConfig.twilio_account_sid || !contentSid || !ctx.contact_phone) return;
  let to = ctx.contact_phone;
  if (!to.startsWith("whatsapp:")) to = "whatsapp:" + to;
  const auth = Buffer.from(botConfig.twilio_account_sid + ":" + botConfig.twilio_auth_token).toString("base64");
  const body = ["From=" + encodeURIComponent(botConfig.twilio_from), "To=" + encodeURIComponent(to), "ContentSid=" + encodeURIComponent(contentSid)].join("&");
  try {
    await this.helpers.httpRequest({ method: "POST", url: "https://api.twilio.com/2010-04-01/Accounts/" + botConfig.twilio_account_sid + "/Messages.json", headers: { "Authorization": "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" }, body: body });
  } catch(e) {}
};

// ── DEMO FEATURE INFO: respuestas predefinidas por función ────────────────
if (intent === "DEMO_FEATURE_INFO") {
  const query = ctx._demo_query || "";
  var respText = "";

  if (query.includes("agendamiento")) {
    respText = "\\uD83D\\uDCC5 *Agendamiento autom\\u00E1tico*\\n\\nCuando tu paciente escribe que quiere una cita, SofIA revisa tu calendario en tiempo real, ofrece 3 horarios disponibles como botones y confirma la reserva sin que tu equipo intervenga. 0 llamadas, 0 formularios.\\n\\n\\u00BFQuieres probarlo ahora mismo? \\uD83D\\uDC47";
  } else if (query.includes("recordatorio")) {
    respText = "\\uD83D\\uDD14 *Recordatorios autom\\u00E1ticos*\\n\\nSofIA env\\u00EDa un recordatorio 24h antes de cada cita con el nombre del paciente, d\\u00EDa, hora y doctor. Esto reduce hasta *40% las cancelaciones*. Funciona solo, sin configuraci\\u00F3n manual.\\n\\n\\u00BFTe interesa saber sobre los planes? \\uD83D\\uDCB0";
  } else if (query.includes("reporte")) {
    respText = "\\uD83D\\uDCCA *Reportes mensuales*\\n\\nCada mes recibes en tu correo: total de conversaciones, citas agendadas, preguntas m\\u00E1s frecuentes y tasa de resoluci\\u00F3n autom\\u00E1tica. Te ayuda a entender qu\\u00E9 quieren tus pacientes y optimizar tu servicio.\\n\\n\\u00BFQuieres saber m\\u00E1s funciones? \\u26A1";
  } else if (query.includes("escalaci") || query.includes("humano")) {
    respText = "\\uD83D\\uDC64 *Escalaci\\u00F3n a humano*\\n\\nCuando SofIA no puede resolver algo o el paciente pide hablar con alguien, escala autom\\u00E1ticamente a tu equipo con alerta inmediata. El agente ve toda la conversaci\\u00F3n previa y toma control en segundos.\\n\\n\\u00BFQuieres ver los planes? \\uD83D\\uDCB0";
  } else if (query.includes("multi")) {
    respText = "\\uD83C\\uDFE2 *Multi-cl\\u00EDnica*\\n\\nPuedes tener 5, 10 o 50 cl\\u00EDnicas en la misma plataforma. Cada una con su WhatsApp, calendario y configuraci\\u00F3n propia. Ideal para grupos dentales. Administras todo desde un solo panel.\\n\\n\\u00BFTe interesa el Plan Enterprise? \\uD83D\\uDFE3";
  } else if (query.includes("integracion") || query.includes("whatsapp")) {
    respText = "\\uD83D\\uDD17 *Integraciones*\\n\\nSofIA se conecta con WhatsApp Business v\\u00EDa Twilio, funciona con tu CRM y se puede integrar con sistemas de gesti\\u00F3n cl\\u00EDnica v\\u00EDa API. Configuraci\\u00F3n inicial en menos de 24 horas.\\n\\n\\u00BFQuieres ver los planes? \\uD83D\\uDCB0";
  } else {
    respText = "\\u26A1 *Funciones de SofIA*\\n\\nSofIA hace todo lo que har\\u00EDa tu recepcionista m\\u00E1s eficiente: agenda citas 24/7, responde preguntas con IA, env\\u00EDa recordatorios y escala a humano cuando es necesario.\\n\\n\\u00BFQuieres ver los planes y precios? \\uD83D\\uDCB0";
  }
  await sendChatwoot.call(this, respText);
  await sendTwilio.call(this, botConfig.twilio_followup_content_sid);
  return [{ json: Object.assign({}, ctx, { intent: "SUBMENU_AWAIT", classified_by: "DEMO_FEATURE_RESPONSE_SENT" }) }];
}

// ── DEMO PLAN INFO: respuestas predefinidas por plan ─────────────────────
if (intent === "DEMO_PLAN_INFO") {
  const plan = ctx._demo_plan || "";
  var planText = "";

  if (plan === "basico") {
    planText = "\\uD83D\\uDFE2 *Plan B\\u00E1sico \\u2014 S/.299/mes*\\n\\n\\u2705 Agendamiento autom\\u00E1tico\\n\\u2705 Respuestas con IA a preguntas frecuentes\\n\\u2705 Base de conocimiento personalizada\\n\\u2705 1 n\\u00FAmero de WhatsApp\\n\\u2705 Panel Chatwoot incluido\\n\\u2705 Hasta 500 conversaciones/mes\\n\\nIdeal para cl\\u00EDnicas que est\\u00E1n empezando con automatizaci\\u00F3n.\\n\\n\\u00BFQuieres una demo personalizada? \\uD83E\\uDD1D";
  } else if (plan === "pro") {
    planText = "\\uD83D\\uDD35 *Plan Pro \\u2014 S/.499/mes* \\u2B50 (m\\u00E1s popular)\\n\\nTodo del B\\u00E1sico, m\\u00E1s:\\n\\u2705 Recordatorios autom\\u00E1ticos 24h antes\\n\\u2705 Reportes mensuales por email\\n\\u2705 Soporte prioritario v\\u00EDa WhatsApp\\n\\u2705 Hasta 1,500 conversaciones/mes\\n\\u2705 M\\u00E9tricas avanzadas\\n\\n\\u00BFTe agendamos una demo del Plan Pro? \\uD83D\\uDCC5";
  } else if (plan === "enterprise") {
    planText = "\\uD83D\\uDFE3 *Plan Enterprise \\u2014 desde S/.799/mes*\\n\\nPara grupos y cadenas dentales:\\n\\u2705 M\\u00FAltiples cl\\u00EDnicas en un panel\\n\\u2705 M\\u00FAltiples n\\u00FAmeros de WhatsApp\\n\\u2705 API para integraci\\u00F3n con tu sistema\\n\\u2705 Onboarding dedicado + capacitaci\\u00F3n\\n\\u2705 Soporte 24/7\\n\\u2705 Conversaciones ilimitadas\\n\\nCont\\u00E1ctanos para cotizaci\\u00F3n personalizada \\uD83E\\uDD1D";
  } else if (plan === "comparar") {
    planText = "\\uD83D\\uDCCB *Comparativa de planes*\\n\\n\\uD83D\\uDFE2 B\\u00E1sico \\u2192 S/.299/mes \\u2192 500 conversaciones\\n\\uD83D\\uDD35 Pro \\u2192 S/.499/mes \\u2192 1,500 conversaciones\\n\\uD83D\\uDFE3 Enterprise \\u2192 desde S/.799 \\u2192 Ilimitadas\\n\\n\\u2728 Sin contrato de permanencia. Cancela cuando quieras.\\n\\uD83D\\uDCA1 Descuento 15% pagando 6 meses | 25% pagando 1 a\\u00F1o\\n\\n\\u00BFHablamos con un asesor para elegir el mejor? \\uD83E\\uDD1D";
  } else {
    planText = "\\uD83D\\uDCB0 *Planes de SofIA AI*\\n\\n\\uD83D\\uDFE2 Plan B\\u00E1sico: S/.299/mes \\u2014 500 conversaciones\\n\\uD83D\\uDD35 Plan Pro: S/.499/mes \\u2014 1,500 conversaciones \\u2B50\\n\\uD83D\\uDFE3 Enterprise: desde S/.799/mes \\u2014 ilimitadas\\n\\nSin contrato. Cancela cuando quieras.\\n\\n\\u00BFQuieres hablar con un asesor para elegir el mejor plan? \\uD83E\\uDD1D";
  }
  await sendChatwoot.call(this, planText);
  await sendTwilio.call(this, botConfig.twilio_followup_content_sid);
  return [{ json: Object.assign({}, ctx, { intent: "SUBMENU_AWAIT", classified_by: "DEMO_PLAN_RESPONSE_SENT" }) }];
}

// Fallback — no deberia llegar aqui
return [{ json: ctx }];`;

async function main() {
  const wf = await apiRequest('GET', `/api/v1/workflows/${WF_ID}`);
  const node = wf.nodes.find(n => n.name === 'Responder Demo');
  if (!node) { console.error('Responder Demo node not found'); process.exit(1); }

  // Verify it has the syntax error
  const code = node.parameters.jsCode || node.parameters.functionCode || '';
  const hasLiteralNewlines = /respText = "[^"]*\n/.test(code) || /planText = "[^"]*\n/.test(code);
  console.log('Has literal newlines in strings:', hasLiteralNewlines);

  if (node.parameters.jsCode !== undefined) node.parameters.jsCode = FIXED_CODE;
  else node.parameters.functionCode = FIXED_CODE;

  const payload = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings || {}, staticData: wf.staticData || null };
  const putResp = await apiRequest('PUT', `/api/v1/workflows/${WF_ID}`, payload);
  if (putResp.id) console.log('patch_v25c: OK | Responder Demo fixed | Nodes:', putResp.nodes.length);
  else console.log('ERROR:', JSON.stringify(putResp).substring(0, 500));
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
