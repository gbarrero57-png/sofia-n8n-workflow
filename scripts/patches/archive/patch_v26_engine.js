// patch_v26_engine.js — Two changes:
// 1. Extend ¿Es DEMO_INFO? to also match DEMO_FLOW, DEMO_FLOW_CATCH_ALL, DEMO_FLOW_START
// 2. Rewrite Responder Demo → full Demo Flow Engine (reads flow_config from bot_config.demo_flow)

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

// ═══════════════════════════════════════════════════════════════════════════
// DEMO FLOW ENGINE — replaces the old Responder Demo code
// Handles: DEMO_FLOW, DEMO_FLOW_CATCH_ALL, DEMO_FLOW_START,
//          DEMO_PLAN_INFO, DEMO_FEATURE_INFO (legacy, kept for backwards compat)
//          _LEAD_CAPTURE action, _CREATE_EVENT action, _HUMAN action
// ═══════════════════════════════════════════════════════════════════════════
const DEMO_FLOW_ENGINE_CODE = `const ctx = $input.first().json;
const botConfig = ctx.bot_config || {};
const intent = ctx.intent || "";
const convLabels = (ctx.raw_payload && ctx.raw_payload.conversation && ctx.raw_payload.conversation.labels) || [];

// ── Twilio template sender with ContentVariables ──────────────────────────
const sendTwilioTemplate = async function(contentSid, vars) {
  if (!botConfig.twilio_account_sid || !contentSid || !ctx.contact_phone) return;
  let to = ctx.contact_phone;
  if (!to.startsWith("whatsapp:")) to = "whatsapp:" + to;
  const auth = Buffer.from(botConfig.twilio_account_sid + ":" + botConfig.twilio_auth_token).toString("base64");
  const params = ["From=" + encodeURIComponent(botConfig.twilio_from), "To=" + encodeURIComponent(to), "ContentSid=" + encodeURIComponent(contentSid)];
  if (vars && Object.keys(vars).length > 0) {
    params.push("ContentVariables=" + encodeURIComponent(JSON.stringify(vars)));
  }
  try {
    await this.helpers.httpRequest({ method: "POST", url: "https://api.twilio.com/2010-04-01/Accounts/" + botConfig.twilio_account_sid + "/Messages.json", headers: { "Authorization": "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" }, body: params.join("&") });
  } catch(e) { /* swallow send errors */ }
};

// ── Chatwoot text message sender ─────────────────────────────────────────
const sendText = async function(text) {
  await this.helpers.httpRequest({
    method: "POST",
    url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/messages",
    headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
    body: JSON.stringify({ content: text, message_type: "outgoing", private: false }),
    json: false
  });
};

// ── Chatwoot label manager ────────────────────────────────────────────────
const setLabels = async function(labels) {
  await this.helpers.httpRequest({
    method: "POST",
    url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/labels",
    headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
    body: JSON.stringify({ labels: labels }),
    json: false
  });
};

// ── Get demo flow state from labels (df_*) ───────────────────────────────
const getDemoState = function() {
  var dfLabel = convLabels.find(function(l) { return l.startsWith("df_"); });
  return dfLabel ? dfLabel.replace("df_", "") : null;
};

// ── Remove old df_* labels and set new one ───────────────────────────────
const transitionToNode = async function(nodeId) {
  var newLabels = convLabels.filter(function(l) { return !l.startsWith("df_"); });
  if (nodeId) newLabels.push("df_" + nodeId);
  await setLabels.call(this, newLabels);
};

// ── Send a demo flow node (LP3/LP4/LP5) ─────────────────────────────────
const sendDemoNode = async function(nodeId, flowConfig) {
  var node = flowConfig.nodes[nodeId];
  if (!node) {
    await sendText.call(this, "\\u00BFEn qu\\u00E9 puedo ayudarte? Escribe *men\\u00FA* para ver las opciones.");
    return;
  }
  var templateType = node.type || "lp3";
  var sid = botConfig["twilio_" + templateType + "_sid"];
  if (!sid) {
    // Fallback: send as plain text with numbered options
    var optText = node.body + "\\n\\n";
    for (var oi = 0; oi < node.options.length; oi++) {
      optText += (oi + 1) + ". " + node.options[oi].label + "\\n";
    }
    await sendText.call(this, optText.trim());
    await transitionToNode.call(this, nodeId);
    return;
  }
  // Build ContentVariables: {1: body, 2: opt1, 3: opt2, ...}
  var vars = { "1": node.body };
  for (var vi = 0; vi < node.options.length; vi++) {
    vars[String(vi + 2)] = node.options[vi].label;
  }
  await transitionToNode.call(this, nodeId);
  await sendTwilioTemplate.call(this, sid, vars);
};

// ── Handle lead capture (multi-step form via Chatwoot labels) ─────────────
const handleLeadCapture = async function(action, selectedOption, flowConfig) {
  var leadPlan = (selectedOption && selectedOption.lead_plan) ? selectedOption.lead_plan : "";
  var leadState = convLabels.find(function(l) { return l.startsWith("df_lead_"); });

  if (!leadState) {
    // Start lead capture — ask for name
    var newLabels = convLabels.filter(function(l) { return !l.startsWith("df_"); });
    newLabels.push("df_lead_name");
    if (leadPlan) newLabels.push("lead_plan_" + leadPlan);
    await setLabels.call(this, newLabels);
    await sendText.call(this, "\\ud83d\\ude80 \\u00a1Perfecto! Para preparar tu demo personalizada necesito 3 datos r\\u00e1pidos.\\n\\nPrimero, \\u00bfc\\u00f3mo te llamas?");
    return [{ json: Object.assign({}, ctx, { intent: "SUBMENU_AWAIT", classified_by: "LEAD_CAPTURE_NAME_REQUESTED", skip_ai: true }) }];
  }
  if (leadState === "df_lead_name") {
    // Save name, ask for clinic
    var name = ctx.message_text || "";
    var newLabels2 = convLabels.filter(function(l) { return !l.startsWith("df_"); });
    newLabels2.push("df_lead_clinic");
    await setLabels.call(this, newLabels2);
    await sendText.call(this, "\\ud83d\\udc4b \\u00a1Hola, " + name.split(" ")[0] + "! \\u00bfC\\u00f3mo se llama tu cl\\u00ednica?");
    return [{ json: Object.assign({}, ctx, { intent: "SUBMENU_AWAIT", classified_by: "LEAD_CAPTURE_CLINIC_REQUESTED", lead_name: name, skip_ai: true }) }];
  }
  if (leadState === "df_lead_clinic") {
    // Save clinic, ask for phone
    var clinicName = ctx.message_text || "";
    var newLabels3 = convLabels.filter(function(l) { return !l.startsWith("df_"); });
    newLabels3.push("df_lead_phone");
    await setLabels.call(this, newLabels3);
    await sendText.call(this, "\\ud83d\\udccd \\u00bfEn qu\\u00e9 ciudad est\\u00e1 " + clinicName + "? (o tu n\\u00famero de contacto si prefieres)");
    return [{ json: Object.assign({}, ctx, { intent: "SUBMENU_AWAIT", classified_by: "LEAD_CAPTURE_CITY_REQUESTED", lead_clinic: clinicName, skip_ai: true }) }];
  }
  if (leadState === "df_lead_phone") {
    // All data collected — close lead capture, notify asesor
    var city = ctx.message_text || "";
    var planLabel = convLabels.find(function(l) { return l.startsWith("lead_plan_"); });
    var plan = planLabel ? planLabel.replace("lead_plan_", "") : "no especificado";
    var newLabels4 = convLabels.filter(function(l) { return !l.startsWith("df_") && !l.startsWith("lead_plan_"); });
    newLabels4.push("lead_captured");
    await setLabels.call(this, newLabels4);
    await sendText.call(this, "\\u2705 \\u00a1Perfecto! Un asesor de SofIA AI te contactar\\u00e1 en las pr\\u00f3ximas 24 horas para coordinar tu demo del Plan " + (plan.charAt(0).toUpperCase() + plan.slice(1)) + ".\\n\\nMientras tanto, \\u00bftienes alguna pregunta?");
    // Add private note for the team
    await this.helpers.httpRequest({
      method: "POST",
      url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/messages",
      headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
      body: JSON.stringify({ content: "\\ud83d\\udcca LEAD CAPTURADO\\nPlan: " + plan + "\\nCiudad/contacto: " + city, message_type: "outgoing", private: true }),
      json: false
    });
    return [{ json: Object.assign({}, ctx, { intent: "SUBMENU_AWAIT", classified_by: "LEAD_CAPTURED", lead_city: city, skip_ai: true }) }];
  }
  // Unknown lead state — restart
  await sendText.call(this, "\\u00bfDesde d\\u00f3nde te contactamos?");
  return [{ json: Object.assign({}, ctx, { intent: "SUBMENU_AWAIT", classified_by: "LEAD_CAPTURE_UNKNOWN", skip_ai: true }) }];
};

// ════════════════════════════════════════════════════════════════════════════
// MAIN INTENT ROUTER
// ════════════════════════════════════════════════════════════════════════════

// ── Legacy: DEMO_PLAN_INFO and DEMO_FEATURE_INFO (kept from pre-v26 flow) ─
if (intent === "DEMO_FEATURE_INFO") {
  const query = ctx._demo_query || "";
  var respText = "";
  if (query.includes("agendamiento")) { respText = "\\uD83D\\uDCC5 *Agendamiento autom\\u00E1tico*\\n\\nCuando tu paciente escribe que quiere una cita, SofIA revisa tu calendario en tiempo real, ofrece 3 horarios disponibles como botones y confirma la reserva sin que tu equipo intervenga. 0 llamadas, 0 formularios.\\n\\n\\u00BFQuieres probarlo ahora mismo? \\uD83D\\uDC47"; }
  else if (query.includes("recordatorio")) { respText = "\\uD83D\\uDD14 *Recordatorios autom\\u00E1ticos*\\n\\nSofIA env\\u00EDa un recordatorio 24h antes de cada cita con el nombre del paciente, d\\u00EDa, hora y doctor. Esto reduce hasta *40% las cancelaciones*. Funciona solo, sin configuraci\\u00F3n manual.\\n\\n\\u00BFTe interesa saber sobre los planes? \\uD83D\\uDCB0"; }
  else if (query.includes("reporte")) { respText = "\\uD83D\\uDCCA *Reportes mensuales*\\n\\nCada mes recibes en tu correo: total de conversaciones, citas agendadas, preguntas m\\u00E1s frecuentes y tasa de resoluci\\u00F3n autom\\u00E1tica. Te ayuda a entender qu\\u00E9 quieren tus pacientes y optimizar tu servicio.\\n\\n\\u00BFQuieres saber m\\u00E1s funciones? \\u26A1"; }
  else if (query.includes("escalaci") || query.includes("humano")) { respText = "\\uD83D\\uDC64 *Escalaci\\u00F3n a humano*\\n\\nCuando SofIA no puede resolver algo o el paciente pide hablar con alguien, escala autom\\u00E1ticamente a tu equipo con alerta inmediata. El agente ve toda la conversaci\\u00F3n previa y toma control en segundos.\\n\\n\\u00BFQuieres ver los planes? \\uD83D\\uDCB0"; }
  else if (query.includes("multi")) { respText = "\\uD83C\\uDFE2 *Multi-cl\\u00EDnica*\\n\\nPuedes tener 5, 10 o 50 cl\\u00EDnicas en la misma plataforma. Cada una con su WhatsApp, calendario y configuraci\\u00F3n propia. Ideal para grupos dentales. Administras todo desde un solo panel.\\n\\n\\u00BFTe interesa el Plan Enterprise? \\uD83D\\uDFE3"; }
  else if (query.includes("integracion") || query.includes("whatsapp")) { respText = "\\uD83D\\uDD17 *Integraciones*\\n\\nSofIA se conecta con WhatsApp Business v\\u00EDa Twilio, funciona con tu CRM y se puede integrar con sistemas de gesti\\u00F3n cl\\u00EDnica v\\u00EDa API. Configuraci\\u00F3n inicial en menos de 24 horas.\\n\\n\\u00BFQuieres ver los planes? \\uD83D\\uDCB0"; }
  else { respText = "\\u26A1 *Funciones de SofIA*\\n\\nSofIA hace todo lo que har\\u00EDa tu recepcionista m\\u00E1s eficiente: agenda citas 24/7, responde preguntas con IA, env\\u00EDa recordatorios y escala a humano cuando es necesario.\\n\\n\\u00BFQuieres ver los planes y precios? \\uD83D\\uDCB0"; }
  await sendText.call(this, respText);
  await sendTwilioTemplate.call(this, botConfig.twilio_followup_content_sid, {});
  return [{ json: Object.assign({}, ctx, { intent: "SUBMENU_AWAIT", classified_by: "DEMO_FEATURE_RESPONSE_SENT" }) }];
}

if (intent === "DEMO_PLAN_INFO") {
  const plan = ctx._demo_plan || "";
  var planText = "";
  if (plan === "basico") { planText = "\\uD83D\\uDFE2 *Plan B\\u00E1sico \\u2014 S/.299/mes*\\n\\n\\u2705 Agendamiento autom\\u00E1tico\\n\\u2705 Respuestas con IA a preguntas frecuentes\\n\\u2705 Base de conocimiento personalizada\\n\\u2705 1 n\\u00FAmero de WhatsApp\\n\\u2705 Panel Chatwoot incluido\\n\\u2705 Hasta 500 conversaciones/mes\\n\\nIdeal para cl\\u00EDnicas que est\\u00E1n empezando con automatizaci\\u00F3n.\\n\\n\\u00BFQuieres una demo personalizada? \\uD83E\\uDD1D"; }
  else if (plan === "pro") { planText = "\\uD83D\\uDD35 *Plan Pro \\u2014 S/.499/mes* \\u2B50 (m\\u00E1s popular)\\n\\nTodo del B\\u00E1sico, m\\u00E1s:\\n\\u2705 Recordatorios autom\\u00E1ticos 24h antes\\n\\u2705 Reportes mensuales por email\\n\\u2705 Soporte prioritario v\\u00EDa WhatsApp\\n\\u2705 Hasta 1,500 conversaciones/mes\\n\\u2705 M\\u00E9tricas avanzadas\\n\\n\\u00BFTe agendamos una demo del Plan Pro? \\uD83D\\uDCC5"; }
  else if (plan === "enterprise") { planText = "\\uD83D\\uDFE3 *Plan Enterprise \\u2014 desde S/.799/mes*\\n\\nPara grupos y cadenas dentales:\\n\\u2705 M\\u00FAltiples cl\\u00EDnicas en un panel\\n\\u2705 M\\u00FAltiples n\\u00FAmeros de WhatsApp\\n\\u2705 API para integraci\\u00F3n con tu sistema\\n\\u2705 Onboarding dedicado + capacitaci\\u00F3n\\n\\u2705 Soporte 24/7\\n\\u2705 Conversaciones ilimitadas\\n\\nCont\\u00E1ctanos para cotizaci\\u00F3n personalizada \\uD83E\\uDD1D"; }
  else if (plan === "comparar") { planText = "\\uD83D\\uDCCB *Comparativa de planes*\\n\\n\\uD83D\\uDFE2 B\\u00E1sico \\u2192 S/.299/mes \\u2192 500 conversaciones\\n\\uD83D\\uDD35 Pro \\u2192 S/.499/mes \\u2192 1,500 conversaciones\\n\\uD83D\\uDFE3 Enterprise \\u2192 desde S/.799 \\u2192 Ilimitadas\\n\\n\\u2728 Sin contrato de permanencia. Cancela cuando quieras.\\n\\uD83D\\uDCA1 Descuento 15% pagando 6 meses | 25% pagando 1 a\\u00F1o\\n\\n\\u00BFHablamos con un asesor para elegir el mejor? \\uD83E\\uDD1D"; }
  else { planText = "\\uD83D\\uDCB0 *Planes de SofIA AI*\\n\\n\\uD83D\\uDFE2 Plan B\\u00E1sico: S/.299/mes \\u2014 500 conversaciones\\n\\uD83D\\uDD35 Plan Pro: S/.499/mes \\u2014 1,500 conversaciones \\u2B50\\n\\uD83D\\uDFE3 Enterprise: desde S/.799/mes \\u2014 ilimitadas\\n\\nSin contrato. Cancela cuando quieras.\\n\\n\\u00BFQuieres hablar con un asesor para elegir el mejor plan? \\uD83E\\uDD1D"; }
  await sendText.call(this, planText);
  await sendTwilioTemplate.call(this, botConfig.twilio_followup_content_sid, {});
  return [{ json: Object.assign({}, ctx, { intent: "SUBMENU_AWAIT", classified_by: "DEMO_PLAN_RESPONSE_SENT" }) }];
}

// ── New Demo Flow Engine ─────────────────────────────────────────────────
const flowConfig = botConfig.demo_flow || null;
if (!flowConfig || !flowConfig.nodes) {
  // No demo flow config — fallback
  return [{ json: ctx }];
}

// ── Lead capture state machine ───────────────────────────────────────────
if (intent === "DEMO_FLOW") {
  var leadState = convLabels.find(function(l) { return l.startsWith("df_lead_"); });
  if (leadState) {
    return await handleLeadCapture.call(this, "_LEAD_CAPTURE", null, flowConfig);
  }
}

// ── Resolve current state node ───────────────────────────────────────────
var currentNodeId = getDemoState() || flowConfig.start_node;
var currentNode = flowConfig.nodes[currentNodeId];

// ── DEMO_FLOW_START: show bienvenida ─────────────────────────────────────
if (intent === "DEMO_FLOW_START") {
  var startId = flowConfig.start_node;
  await sendDemoNode.call(this, startId, flowConfig);
  return [{ json: Object.assign({}, ctx, { intent: "SUBMENU_AWAIT", classified_by: "DF_BIENVENIDA_SENT", skip_ai: true }) }];
}

// ── DEMO_FLOW_CATCH_ALL: re-send current node ────────────────────────────
if (intent === "DEMO_FLOW_CATCH_ALL") {
  var catchNodeId = currentNodeId || flowConfig.catch_all_node;
  await sendText.call(this, "\\uD83D\\uDC49 Por favor elige una de las opciones del men\\u00FA:");
  await sendDemoNode.call(this, catchNodeId, flowConfig);
  return [{ json: Object.assign({}, ctx, { intent: "SUBMENU_AWAIT", classified_by: "DF_CATCH_ALL_RESENT", skip_ai: true }) }];
}

// ── DEMO_FLOW: user selected pos_1..pos_5 ────────────────────────────────
if (intent === "DEMO_FLOW") {
  var pos = ctx.demo_pos;
  if (!currentNode || !pos) {
    await sendDemoNode.call(this, flowConfig.start_node, flowConfig);
    return [{ json: Object.assign({}, ctx, { intent: "SUBMENU_AWAIT", classified_by: "DF_FALLBACK_START", skip_ai: true }) }];
  }
  // Find selected option (pos is 1-based index)
  var selectedOption = currentNode.options[pos - 1] || null;
  if (!selectedOption) {
    await sendText.call(this, "\\uD83D\\uDC49 Por favor elige una de las opciones disponibles:");
    await sendDemoNode.call(this, currentNodeId, flowConfig);
    return [{ json: Object.assign({}, ctx, { intent: "SUBMENU_AWAIT", classified_by: "DF_INVALID_POS", skip_ai: true }) }];
  }

  // Execute action or navigate to next node
  var action = selectedOption.action || null;
  var nextNodeId = selectedOption.next || null;

  if (action === "_HUMAN") {
    return [{ json: Object.assign({}, ctx, { intent: "HUMAN", classified_by: "DF_ACTION_HUMAN", skip_ai: true }) }];
  }

  if (action === "_CREATE_EVENT") {
    await transitionToNode.call(this, null); // clear df_* state
    return [{ json: Object.assign({}, ctx, { intent: "CREATE_EVENT", classified_by: "DF_ACTION_CREATE_EVENT", skip_ai: false }) }];
  }

  if (action === "_LEAD_CAPTURE" || action === "_LEAD_CAPTURE_START") {
    return await handleLeadCapture.call(this, action, selectedOption, flowConfig);
  }

  if (nextNodeId && flowConfig.nodes[nextNodeId]) {
    await sendDemoNode.call(this, nextNodeId, flowConfig);
    return [{ json: Object.assign({}, ctx, { intent: "SUBMENU_AWAIT", classified_by: "DF_NAV_" + nextNodeId.toUpperCase(), skip_ai: true }) }];
  }

  // No action, no next → go back to bienvenida
  await sendDemoNode.call(this, flowConfig.start_node, flowConfig);
  return [{ json: Object.assign({}, ctx, { intent: "SUBMENU_AWAIT", classified_by: "DF_FALLBACK_BIENVENIDA", skip_ai: true }) }];
}

// Fallback — should not reach here
return [{ json: ctx }];`;

async function main() {
  const wf = await apiRequest('GET', `/api/v1/workflows/${WF_ID}`);
  const results = [];

  // ── Fix 1: Extend ¿Es DEMO_INFO? to also match DEMO_FLOW intents ──────────
  const demoInfoNode = wf.nodes.find(n => n.name === '¿Es DEMO_INFO?');
  demoInfoNode.parameters = {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
      combinator: "or",
      conditions: [
        { id: "di-plan", leftValue: "={{ $json.intent }}", rightValue: "DEMO_PLAN_INFO", operator: { type: "string", operation: "equals", rightType: "any" } },
        { id: "di-feat", leftValue: "={{ $json.intent }}", rightValue: "DEMO_FEATURE_INFO", operator: { type: "string", operation: "equals", rightType: "any" } },
        { id: "di-flow", leftValue: "={{ $json.intent }}", rightValue: "DEMO_FLOW", operator: { type: "string", operation: "equals", rightType: "any" } },
        { id: "di-flow-catch", leftValue: "={{ $json.intent }}", rightValue: "DEMO_FLOW_CATCH_ALL", operator: { type: "string", operation: "equals", rightType: "any" } },
        { id: "di-flow-start", leftValue: "={{ $json.intent }}", rightValue: "DEMO_FLOW_START", operator: { type: "string", operation: "equals", rightType: "any" } }
      ]
    },
    options: {}
  };
  results.push('Fix 1 OK: ¿Es DEMO_INFO? now catches DEMO_FLOW, DEMO_FLOW_CATCH_ALL, DEMO_FLOW_START');

  // ── Fix 2: Replace Responder Demo with full Demo Flow Engine ──────────────
  const responderNode = wf.nodes.find(n => n.name === 'Responder Demo');
  if (!responderNode) { results.push('WARN Fix2: Responder Demo node not found'); }
  else {
    if (responderNode.parameters.jsCode !== undefined) responderNode.parameters.jsCode = DEMO_FLOW_ENGINE_CODE;
    else responderNode.parameters.functionCode = DEMO_FLOW_ENGINE_CODE;
    results.push('Fix 2 OK: Responder Demo → Demo Flow Engine (' + DEMO_FLOW_ENGINE_CODE.split('\n').length + ' lines)');
  }

  const payload = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings || {}, staticData: wf.staticData || null };
  const putResp = await apiRequest('PUT', `/api/v1/workflows/${WF_ID}`, payload);
  console.log('=== patch_v26_engine results ===');
  results.forEach(r => console.log(r));
  if (putResp.id) console.log('n8n PUT: OK | Nodes:', putResp.nodes.length);
  else console.log('n8n PUT ERROR:', JSON.stringify(putResp).substring(0, 500));
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
