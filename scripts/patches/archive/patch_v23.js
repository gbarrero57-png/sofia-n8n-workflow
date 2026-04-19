// patch_v23.js — Button-driven conversation system
// Changes:
//   1. Pre-Clasificador: detect all T01-T11 button labels + navigation buttons
//   2. Explicar Agendamiento: add "awaiting_service" label when sending T02
//   3. Resolver Booking Step: send T11 dynamic quick-reply for day picker (3 days)
//   4. Confirmar al Paciente: send T09 dynamic quick-reply with appointment details

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
      hostname: url.hostname, port: url.port || 443, path: path, method: method,
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
  const results = [];

  // ══════════════════════════════════════════════════════════════════════
  // FIX 1: Pre-Clasificador — update button label detection
  // ══════════════════════════════════════════════════════════════════════
  const preNode = wf.nodes.find(n => n.name === 'Pre-Clasificador Keywords');
  if (!preNode) { console.error('ERROR: Pre-Clasificador not found'); process.exit(1); }
  let preCode = preNode.parameters.jsCode || preNode.parameters.functionCode;

  // 1a: Update _demoMenuOpt to also detect T01 list-picker item titles
  const OLD_DEMO_MENU_OPT = `function _demoMenuOpt(s) {
  if (s.includes("probar agendamiento") || s.includes("probar cita")) return "1";
  if (s.includes("planes y precios") || s.includes("planes") && s.includes("precio")) return "2";
  if (s.includes("funciones de sofia") || s.includes("funciones")) return "3";
  if (s.includes("casos de exito") || s.includes("casos")) return "4";
  if (s.includes("hablar con") && s.includes("asesor") || s.includes("hablar asesor")) return "5";
  return null;
}`;

  const NEW_DEMO_MENU_OPT = `function _demoMenuOpt(s) {
  // T01 list-picker item titles (after emoji strip)
  if (s === "agendar una cita" || s.includes("agendar una cita")) return "1";
  if (s === "planes y precios" || s.includes("planes y precios")) return "2";
  if (s === "funciones de sofia" || s.includes("funciones de sofia")) return "3";
  if (s === "casos de exito" || s.includes("casos de exito")) return "4";
  if (s === "hablar con un humano" || s.includes("hablar con un humano")) return "5";
  // Legacy text detection (kept for backwards compatibility)
  if (s.includes("probar agendamiento") || s.includes("probar cita")) return "1";
  if (s.includes("planes") && s.includes("precio")) return "2";
  if (s.includes("funciones")) return "3";
  if (s.includes("casos")) return "4";
  if (s.includes("hablar con") && s.includes("asesor") || s.includes("hablar asesor")) return "5";
  return null;
}`;

  if (!preCode.includes(OLD_DEMO_MENU_OPT)) {
    results.push('WARN: _demoMenuOpt anchor not found');
  } else {
    preCode = preCode.replace(OLD_DEMO_MENU_OPT, NEW_DEMO_MENU_OPT);
    results.push('Fix 1a OK: _demoMenuOpt updated with T01 labels');
  }

  // 1b: Update time label map to add "cualquier fecha"
  const OLD_TIME_MAP = `var _timeLabelMap = { "esta semana": "time_this_week", "proxima semana": "time_next_week", "sin preferencia": "time_any" };
var _timeByLabel = _timeLabelMap[msgStripped] || _timeLabelMap[msgLow];
if (!_timeByLabel) {
  if (msgStripped.includes("esta semana") && !msgStripped.includes("proxima")) _timeByLabel = "time_this_week";
  else if (msgStripped.includes("proxima semana")) _timeByLabel = "time_next_week";
  else if (msgStripped.includes("sin preferencia") || msgStripped === "sin prefer") _timeByLabel = "time_any";
}`;

  const NEW_TIME_MAP = `var _timeLabelMap = { "esta semana": "time_this_week", "proxima semana": "time_next_week", "sin preferencia": "time_any", "cualquier fecha": "time_any", "cualquier fecha disponible": "time_any", "ver semana completa": "time_any" };
var _timeByLabel = _timeLabelMap[msgStripped] || _timeLabelMap[msgLow];
if (!_timeByLabel) {
  if (msgStripped.includes("esta semana") && !msgStripped.includes("proxima")) _timeByLabel = "time_this_week";
  else if (msgStripped.includes("proxima semana")) _timeByLabel = "time_next_week";
  else if (msgStripped.includes("sin preferencia") || msgStripped === "sin prefer") _timeByLabel = "time_any";
  else if (msgStripped.includes("cualquier fecha") || msgStripped.includes("flexible")) _timeByLabel = "time_any";
}`;

  if (!preCode.includes(OLD_TIME_MAP)) {
    results.push('WARN: time label map anchor not found');
  } else {
    preCode = preCode.replace(OLD_TIME_MAP, NEW_TIME_MAP);
    results.push('Fix 1b OK: time label map updated');
  }

  // 1c: Update feature detection to add "citas automaticas" and "integraciones"
  const OLD_FEAT_DETECT = `var _featQuery = null;
if (msgStripped.includes("agendamiento") || (msgStripped.includes("agenda") && msgStripped.includes("automatica"))) _featQuery = "como funciona el agendamiento automatico de citas SofIA";
else if (msgStripped.includes("ia 24") || msgStripped.includes("ia 24/7") || msgStripped.includes("respuestas con ia") || msgStripped === "feat_ia" || msgLow === "feat_ia") _featQuery = "como funciona la IA de SofIA respuestas automaticas 24 horas";
else if (msgStripped.includes("recordatorio")) _featQuery = "como funcionan los recordatorios automaticos de cita SofIA";
else if (msgStripped.includes("reporte")) _featQuery = "que reportes genera SofIA mensualmente metricas";
else if (msgStripped.includes("escalaci") || msgStripped.includes("escalacion") || msgStripped.includes("humano") && msgStripped.includes("escal")) _featQuery = "que pasa cuando SofIA no puede responder escalacion a humano";
else if (msgStripped.includes("multi") && (msgStripped.includes("clinica") || msgStripped.includes("clinic"))) _featQuery = "SofIA funciona para varias clinicas a la vez multi-clinica";`;

  const NEW_FEAT_DETECT = `var _featQuery = null;
// T05 list-picker titles (after emoji strip + normalize)
if (msgStripped === "citas automaticas" || msgStripped.includes("citas automaticas")) _featQuery = "como funciona el agendamiento automatico de citas SofIA";
else if (msgStripped === "recordatorios 24h" || msgStripped === "recordatorios 24") _featQuery = "como funcionan los recordatorios automaticos de cita SofIA";
else if (msgStripped === "reportes mensuales") _featQuery = "que reportes genera SofIA mensualmente metricas";
else if (msgStripped === "escalacion humana") _featQuery = "que pasa cuando SofIA no puede responder escalacion a humano";
else if (msgStripped === "multi-clinica" || msgStripped === "multiclinica") _featQuery = "SofIA funciona para varias clinicas a la vez multi-clinica";
else if (msgStripped === "integraciones") _featQuery = "que integraciones tiene SofIA con WhatsApp CRM y sistemas de gestion";
// Legacy text detection
else if (msgStripped.includes("agendamiento") || (msgStripped.includes("agenda") && msgStripped.includes("automatica"))) _featQuery = "como funciona el agendamiento automatico de citas SofIA";
else if (msgStripped.includes("ia 24") || msgStripped.includes("ia 24/7") || msgStripped.includes("respuestas con ia") || msgStripped === "feat_ia" || msgLow === "feat_ia") _featQuery = "como funciona la IA de SofIA respuestas automaticas 24 horas";
else if (msgStripped.includes("recordatorio")) _featQuery = "como funcionan los recordatorios automaticos de cita SofIA";
else if (msgStripped.includes("reporte")) _featQuery = "que reportes genera SofIA mensualmente metricas";
else if (msgStripped.includes("escalaci") || msgStripped.includes("escalacion") || msgStripped.includes("humano") && msgStripped.includes("escal")) _featQuery = "que pasa cuando SofIA no puede responder escalacion a humano";
else if (msgStripped.includes("multi") && (msgStripped.includes("clinica") || msgStripped.includes("clinic"))) _featQuery = "SofIA funciona para varias clinicas a la vez multi-clinica";
else if (msgStripped.includes("integraci")) _featQuery = "que integraciones tiene SofIA con WhatsApp CRM y sistemas de gestion";`;

  if (!preCode.includes(OLD_FEAT_DETECT)) {
    results.push('WARN: feature detection anchor not found');
  } else {
    preCode = preCode.replace(OLD_FEAT_DETECT, NEW_FEAT_DETECT);
    results.push('Fix 1c OK: feature detection updated with T05 labels');
  }

  // 1d: Update plan detection to add T04 labels
  const OLD_PLAN_DETECT = `var _planKey = null;
if (msgStripped.includes("basico") || msgStripped.includes("299")) _planKey = "basico";
else if (msgStripped.includes("enterprise") || msgStripped.includes("799")) _planKey = "enterprise";
else if (msgStripped === "plan_pro" || msgStripped.includes("plan pro") || msgStripped.includes("499") || (msgStripped.includes("pro") && !msgStripped.includes("proxima") && !msgStripped.includes("producto"))) _planKey = "pro";
else if (msgStripped.includes("comparar") || msgStripped.includes("todos los planes")) _planKey = "comparar";`;

  const NEW_PLAN_DETECT = `var _planKey = null;
// T04 list-picker titles (after emoji strip + normalize)
if (msgStripped === "plan basico") _planKey = "basico";
else if (msgStripped === "plan pro") _planKey = "pro";
else if (msgStripped === "plan enterprise") _planKey = "enterprise";
else if (msgStripped === "comparar planes") _planKey = "comparar";
// Legacy + fallback detection
else if (msgStripped.includes("basico") || msgStripped.includes("299")) _planKey = "basico";
else if (msgStripped.includes("enterprise") || msgStripped.includes("799")) _planKey = "enterprise";
else if (msgStripped === "plan_pro" || msgStripped.includes("plan pro") || msgStripped.includes("499") || (msgStripped.includes("pro") && !msgStripped.includes("proxima") && !msgStripped.includes("producto"))) _planKey = "pro";
else if (msgStripped.includes("comparar") || msgStripped.includes("todos los planes")) _planKey = "comparar";`;

  if (!preCode.includes(OLD_PLAN_DETECT)) {
    results.push('WARN: plan detection anchor not found');
  } else {
    preCode = preCode.replace(OLD_PLAN_DETECT, NEW_PLAN_DETECT);
    results.push('Fix 1d OK: plan detection updated with T04 labels');
  }

  // 1e: Add service picker detection + navigation buttons
  // Insert BEFORE the existing time detection section (which starts with "// ─ Time preference LABELS")
  const OLD_TIME_PREF_SECTION_MARKER = `// ─ Time preference LABELS (quick-reply buttons envia el label no el ID) ───`;
  const NEW_SERVICE_AND_NAV = `// ── NAVIGATION BUTTONS (T06/T08/T09/T10 quick-reply) ────────────────────
// These are exact button titles after emoji strip
if (msgStripped === "menu principal" || msgStripped === "ver menu" || msgStripped === "volver al menu" || msgStripped === "ver menu principal") {
  return [{ json: Object.assign({}, $json, { intent: "GREETING", confidence: "high", classified_by: "BTN_BACK_MENU", skip_ai: true }) }];
}
if (msgStripped === "perfecto, gracias" || msgStripped === "perfecto gracias") {
  return [{ json: Object.assign({}, $json, { intent: "GREETING", confidence: "high", classified_by: "BTN_POST_CONFIRM_ACK", skip_ai: true }) }];
}
if (msgStripped === "cancelar cita") {
  return [{ json: Object.assign({}, $json, { intent: "HUMAN", confidence: "high", classified_by: "BTN_CANCEL_APPT", skip_ai: true }) }];
}
if (msgStripped === "cambiar horario" || msgStripped === "elegir otro dia") {
  return [{ json: Object.assign({}, $json, { intent: "BOOKING_TIME_PREF", confidence: "high", classified_by: "BTN_CHANGE_SLOT", skip_ai: true, day_change_request: true, message_text: "cambiar horario preferencia de otro dia" }) }];
}
if (msgStripped === "agendar demo gratis" || msgStripped === "agendar demo gratuita") {
  return [{ json: Object.assign({}, $json, { intent: "CREATE_EVENT", confidence: "high", classified_by: "BTN_AGENDAR_DEMO", skip_ai: true }) }];
}

// ── T02 SERVICE PICKER — detect service item titles ───────────────────────
// List-picker sends the title text; detect after emoji strip
var _svcBtnMap = { "limpieza dental": "Limpieza dental", "consulta general": "Consulta general", "ortodoncia": "Ortodoncia", "blanqueamiento dental": "Blanqueamiento dental", "implante dental": "Implante dental", "urgencia dental": "Urgencia dental", "otro servicio": "Otro servicio" };
if (_svcBtnMap[msgStripped]) {
  return [{ json: Object.assign({}, $json, { intent: "BOOKING_SERVICE", confidence: "high", classified_by: "BTN_SERVICE_PICKER", skip_ai: true, message_text: _svcBtnMap[msgStripped] }) }];
}

// ─ Time preference LABELS (quick-reply buttons envia el label no el ID) ───`;

  if (!preCode.includes(OLD_TIME_PREF_SECTION_MARKER)) {
    results.push('WARN: time pref section marker not found in Pre-Clasificador');
  } else {
    preCode = preCode.replace(OLD_TIME_PREF_SECTION_MARKER, NEW_SERVICE_AND_NAV);
    results.push('Fix 1e OK: navigation buttons + service picker added to Pre-Clasificador');
  }

  if (preNode.parameters.jsCode !== undefined) preNode.parameters.jsCode = preCode;
  else preNode.parameters.functionCode = preCode;

  // ══════════════════════════════════════════════════════════════════════
  // FIX 2: Explicar Agendamiento — add "awaiting_service" label when sending T02
  // ══════════════════════════════════════════════════════════════════════
  const explNode = wf.nodes.find(n => n.name === 'Explicar Agendamiento');
  if (!explNode) { console.error('ERROR: Explicar Agendamiento not found'); process.exit(1); }
  let explCode = explNode.parameters.jsCode || explNode.parameters.functionCode;

  // After sending T02 and saving custom_attributes, also set label
  const OLD_EXPL_SAVE = `    await this.helpers.httpRequest({ method: "PATCH",
      url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id,
      headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
      body: JSON.stringify({ custom_attributes: { booking_funnel_state: "awaiting_service" } }), json: false });
  } catch(e) {}
  return [{ json: Object.assign({}, ctx, { _funnel_started: true }) }];`;

  const NEW_EXPL_SAVE = `    await this.helpers.httpRequest({ method: "PATCH",
      url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id,
      headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
      body: JSON.stringify({ custom_attributes: { booking_funnel_state: "awaiting_service" } }), json: false });
    // Add label (reliable state tracking)
    var _curLabels2 = (ctx.raw_payload && ctx.raw_payload.conversation && ctx.raw_payload.conversation.labels) || [];
    var _svcLabels = _curLabels2.filter(function(l) { return l !== "awaiting_service" && l !== "awaiting_slot" && l !== "awaiting_day_choice"; });
    _svcLabels.push("awaiting_service");
    await this.helpers.httpRequest({ method: "POST",
      url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/labels",
      headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
      body: { labels: _svcLabels }, json: true });
  } catch(e) {}
  return [{ json: Object.assign({}, ctx, { _funnel_started: true }) }];`;

  if (!explCode.includes(OLD_EXPL_SAVE)) {
    results.push('WARN: Explicar Agendamiento save anchor not found');
  } else {
    explCode = explCode.replace(OLD_EXPL_SAVE, NEW_EXPL_SAVE);
    results.push('Fix 2 OK: awaiting_service label added in Explicar Agendamiento');
  }

  // Also update Pre-Clasificador to handle awaiting_service LABEL (after slot check)
  // Insert check for awaiting_service label right after awaiting_slot block
  const OLD_BOOKING_FUNNEL_CHECK = `if (_bfState === "awaiting_service") {
    return [{ json: Object.assign({}, $json, { intent: "BOOKING_SERVICE", confidence: "high", classified_by: "BOOKING_FUNNEL_STATE", skip_ai: true, _booking_funnel_state: "awaiting_service" }) }];
}`;

  const NEW_BOOKING_FUNNEL_CHECK = `if (_bfState === "awaiting_service" || convLabels.includes("awaiting_service")) {
    return [{ json: Object.assign({}, $json, { intent: "BOOKING_SERVICE", confidence: "high", classified_by: "BOOKING_FUNNEL_STATE", skip_ai: true, _booking_funnel_state: "awaiting_service" }) }];
}`;

  if (!preCode.includes(OLD_BOOKING_FUNNEL_CHECK)) {
    results.push('WARN: awaiting_service funnel check anchor not found');
  } else {
    preCode = preCode.replace(OLD_BOOKING_FUNNEL_CHECK, NEW_BOOKING_FUNNEL_CHECK);
    // Re-apply since we modified preCode in between
    if (preNode.parameters.jsCode !== undefined) preNode.parameters.jsCode = preCode;
    else preNode.parameters.functionCode = preCode;
    results.push('Fix 2b OK: awaiting_service label check added to Pre-Clasificador');
  }

  if (explNode.parameters.jsCode !== undefined) explNode.parameters.jsCode = explCode;
  else explNode.parameters.functionCode = explCode;

  // ══════════════════════════════════════════════════════════════════════
  // FIX 3: Resolver Booking Step — send T11 dynamic quick-reply for day picker
  //   Replace: Chatwoot text day list with Twilio T11 (3 dynamic buttons)
  //   Keep: SOFIA_DAYS private note (digit fallback)
  // ══════════════════════════════════════════════════════════════════════
  const rbsNode = wf.nodes.find(n => n.name === 'Resolver Booking Step');
  if (!rbsNode) { console.error('ERROR: Resolver Booking Step not found'); process.exit(1); }
  let rbsCode = rbsNode.parameters.jsCode || rbsNode.parameters.functionCode;

  // Replace Case B section: limit to 3 days, send T11 via Twilio
  const OLD_CASE_B_SEND = `  // Send day picker to user
  await this.helpers.httpRequest({
    method: "POST",
    url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/messages",
    headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
    body: JSON.stringify({ content: _pickerTxt, message_type: "outgoing", private: false }),
    json: false
  });

  await saveToChat({ booking_funnel_state: "awaiting_day_choice", booking_service: ctx._booking_service || ctx._bfSvc || "" });
  return [{ json: Object.assign({}, ctx, { _continue_to_slots: false }) }];`;

  const NEW_CASE_B_SEND = `  // Send T11 dynamic quick-reply (3 day buttons) via Twilio, fallback to text
  var _t11Sid = botConfig.twilio_day_offer_sid;
  var _isTwilioDay = !!botConfig.twilio_account_sid && !!_t11Sid && !!ctx.contact_phone;
  if (_isTwilioDay && _offered.length >= 1) {
    var _toDay = ctx.contact_phone;
    if (!_toDay.startsWith("whatsapp:")) _toDay = "whatsapp:" + _toDay;
    var _authDay = Buffer.from(botConfig.twilio_account_sid + ":" + botConfig.twilio_auth_token).toString("base64");
    // Limit to 3 days for T11 (3 buttons)
    var _dayVars = {};
    for (var _dvi = 0; _dvi < Math.min(_offered.length, 3); _dvi++) {
      _dayVars[String(_dvi + 1)] = _offered[_dvi].label;
    }
    // Pad if less than 3 days offered
    if (!_dayVars["2"]) _dayVars["2"] = _dayVars["1"];
    if (!_dayVars["3"]) _dayVars["3"] = _dayVars["2"];
    var _t11Body = ["From=" + encodeURIComponent(botConfig.twilio_from),
      "To=" + encodeURIComponent(_toDay),
      "ContentSid=" + encodeURIComponent(_t11Sid),
      "ContentVariables=" + encodeURIComponent(JSON.stringify(_dayVars))
    ].join("&");
    try {
      await this.helpers.httpRequest({ method: "POST",
        url: "https://api.twilio.com/2010-04-01/Accounts/" + botConfig.twilio_account_sid + "/Messages.json",
        headers: { "Authorization": "Basic " + _authDay, "Content-Type": "application/x-www-form-urlencoded" },
        body: _t11Body });
    } catch(_et11) {
      // Fallback to text if Twilio fails
      await this.helpers.httpRequest({ method: "POST",
        url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/messages",
        headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
        body: JSON.stringify({ content: _pickerTxt, message_type: "outgoing", private: false }), json: false });
    }
  } else {
    // Fallback: send text list
    await this.helpers.httpRequest({ method: "POST",
      url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/messages",
      headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
      body: JSON.stringify({ content: _pickerTxt, message_type: "outgoing", private: false }), json: false });
  }

  await saveToChat({ booking_funnel_state: "awaiting_day_choice", booking_service: ctx._booking_service || ctx._bfSvc || "" });
  return [{ json: Object.assign({}, ctx, { _continue_to_slots: false }) }];`;

  if (!rbsCode.includes(OLD_CASE_B_SEND)) {
    results.push('WARN: RBS Case B send anchor not found');
  } else {
    rbsCode = rbsCode.replace(OLD_CASE_B_SEND, NEW_CASE_B_SEND);
    results.push('Fix 3 OK: RBS Case B now sends T11 dynamic quick-reply');
  }

  if (rbsNode.parameters.jsCode !== undefined) rbsNode.parameters.jsCode = rbsCode;
  else rbsNode.parameters.functionCode = rbsCode;

  // ══════════════════════════════════════════════════════════════════════
  // FIX 4: Confirmar al Paciente — send T09 dynamic quick-reply
  //   After sending the text confirmation, also send T09 via Twilio
  // ══════════════════════════════════════════════════════════════════════
  const confNode = wf.nodes.find(n => n.name === 'Confirmar al Paciente');
  if (!confNode) {
    results.push('WARN: Confirmar al Paciente not found');
  } else {
    let confCode = confNode.parameters.jsCode || confNode.parameters.functionCode;

    // Find the return statement at the end and add T09 before it
    // The node ends with a return that has the confirmation data
    const OLD_CONF_RETURN = `return [{ json: Object.assign({}, original_data, {
    confirmation_message,
    _appointment_confirmed: true
  }) }];`;

    const NEW_CONF_RETURN = `// Send T09 dynamic quick-reply with appointment summary + action buttons
const botConfigConf = original_data.bot_config || {};
if (botConfigConf.twilio_account_sid && botConfigConf.twilio_appointment_content_sid && original_data.contact_phone) {
  var _toConf = original_data.contact_phone;
  if (!_toConf.startsWith("whatsapp:")) _toConf = "whatsapp:" + _toConf;
  var _authConf = Buffer.from(botConfigConf.twilio_account_sid + ":" + botConfigConf.twilio_auth_token).toString("base64");
  // Build compact appointment summary for {{1}} variable
  var _apptSummary = "\uD83D\uDCC5 " + slot.date + " a las " + slot.time;
  if (doctor_name) _apptSummary += nl + "\uD83D\uDC68\u200D\u2695\uFE0F " + doctor_name;
  _apptSummary += nl + "\uD83C\uDFE5 " + (original_data.clinic_name || "Clinica");
  var _t09Vars = { "1": _apptSummary };
  var _t09Body = ["From=" + encodeURIComponent(botConfigConf.twilio_from),
    "To=" + encodeURIComponent(_toConf),
    "ContentSid=" + encodeURIComponent(botConfigConf.twilio_appointment_content_sid),
    "ContentVariables=" + encodeURIComponent(JSON.stringify(_t09Vars))
  ].join("&");
  try {
    await this.helpers.httpRequest({ method: "POST",
      url: "https://api.twilio.com/2010-04-01/Accounts/" + botConfigConf.twilio_account_sid + "/Messages.json",
      headers: { "Authorization": "Basic " + _authConf, "Content-Type": "application/x-www-form-urlencoded" },
      body: _t09Body });
  } catch(_et09) {}
}

return [{ json: Object.assign({}, original_data, {
    confirmation_message,
    _appointment_confirmed: true
  }) }];`;

    if (!confCode.includes(OLD_CONF_RETURN)) {
      results.push('WARN: Confirmar al Paciente return anchor not found');
    } else {
      confCode = confCode.replace(OLD_CONF_RETURN, NEW_CONF_RETURN);
      if (confNode.parameters.jsCode !== undefined) confNode.parameters.jsCode = confCode;
      else confNode.parameters.functionCode = confCode;
      results.push('Fix 4 OK: Confirmar al Paciente sends T09 quick-reply');
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // FIX 5: Responder Demo — cleaner CTA text (remove text instruction)
  // ══════════════════════════════════════════════════════════════════════
  const rdNode = wf.nodes.find(n => n.name === 'Responder Demo');
  if (rdNode) {
    let rdCode = rdNode.parameters.jsCode || rdNode.parameters.functionCode;

    const OLD_CTA_FEAT = `  var ctaFeat = "\\n\\n---\\n*Agendar tu demo gratuita:* Escribe \\"agendar demo\\" o toca el boton ↓"; /* DEMO_CTA_TEXT */`;
    const NEW_CTA_FEAT = `  var ctaFeat = "\\n\\n---"; /* DEMO_CTA_TEXT — T06 button handles the CTA */`;

    const OLD_CTA_PLAN = `  var ctaPlan = "\\n\\n---\\n*Agendar tu demo gratuita:* Escribe \\"agendar demo\\" o toca el boton ↓"; /* DEMO_CTA_TEXT */`;
    const NEW_CTA_PLAN = `  var ctaPlan = "\\n\\n---"; /* DEMO_CTA_TEXT — T06 button handles the CTA */`;

    if (rdCode.includes(OLD_CTA_FEAT)) {
      rdCode = rdCode.replace(OLD_CTA_FEAT, NEW_CTA_FEAT);
      results.push('Fix 5a OK: Responder Demo feat CTA text simplified');
    } else {
      results.push('WARN: Responder Demo feat CTA anchor not found (may already be updated)');
    }
    if (rdCode.includes(OLD_CTA_PLAN)) {
      rdCode = rdCode.replace(OLD_CTA_PLAN, NEW_CTA_PLAN);
      results.push('Fix 5b OK: Responder Demo plan CTA text simplified');
    } else {
      results.push('WARN: Responder Demo plan CTA anchor not found (may already be updated)');
    }

    if (rdNode.parameters.jsCode !== undefined) rdNode.parameters.jsCode = rdCode;
    else rdNode.parameters.functionCode = rdCode;
  }

  // ══════════════════════════════════════════════════════════════════════
  // PUT workflow
  // ══════════════════════════════════════════════════════════════════════
  const payload = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings || {}, staticData: wf.staticData || null };
  const putResp = await apiRequest('PUT', `/api/v1/workflows/${WF_ID}`, payload);
  console.log('=== patch_v23 results ===');
  results.forEach(r => console.log(r));
  if (putResp.id) console.log('n8n PUT: OK | Nodes:', putResp.nodes.length);
  else console.log('n8n PUT ERROR:', JSON.stringify(putResp).substring(0, 500));
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
