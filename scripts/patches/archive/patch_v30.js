/**
 * patch_v30.js — Demo booking: fix lead capture + connect to calendar + add CTA
 *
 * FIXES:
 * 1. Pre-Clasificador: detect df_lead_* labels → route to DEMO_FLOW (lead capture broken)
 * 2. Responder Demo: add sendDemoBookingDayPicker() helper (LP5 + SOFIA_DAYS + labels)
 * 3. Responder Demo: df_lead_phone completion → send LP5 day picker (calendar connected)
 * 4. Responder Demo: _CREATE_EVENT → check lead_captured, collect lead first if needed
 * 5. Supabase demo_flow: add "_LEAD_CAPTURE" CTA to como_funciona, precios, info_*
 */

const https = require('https');
const fs    = require('fs');

const N8N_URL = 'https://workflows.n8n.redsolucionesti.com';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const WF_ID  = '37SLdWISQLgkHeXk';

const SB_URL = 'inhyrrjidhzrbqecnptn.supabase.co';
const env    = fs.readFileSync('saas/.env', 'utf8');
const SB_KEY = env.match(/SUPABASE_SERVICE_KEY=(.+)/)[1].trim();
const DEMO_CLINIC_ID = 'c6c15fca-d7fc-4d98-83c1-2c5cb5a6bef1';

function n8nReq(method, path, body) {
  return new Promise((res, rej) => {
    const u = new URL(N8N_URL + path);
    const opts = { hostname: u.hostname, port: 443, path: u.pathname + u.search,
      method, headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' } };
    const r = https.request(opts, resp => { let d=''; resp.on('data',c=>d+=c); resp.on('end',()=>{ try{res(JSON.parse(d));}catch(e){res(d);} }); });
    r.on('error', rej);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

function sbReq(method, path, body) {
  return new Promise((res, rej) => {
    const opts = { hostname: SB_URL, port: 443, path, method,
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer '+SB_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' } };
    const r = https.request(opts, resp => { let d=''; resp.on('data',c=>d+=c); resp.on('end',()=>{ try{res(JSON.parse(d));}catch(e){res(d);} }); });
    r.on('error', rej);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function main() {
  console.log('Fetching workflow...');
  const wf = await n8nReq('GET', `/api/v1/workflows/${WF_ID}`);

  // ── FIX 1: Pre-Clasificador — detect df_lead_* labels ──────────────────
  const preNode = wf.nodes.find(n => n.name === 'Pre-Clasificador Keywords');
  let preCode = preNode.parameters.jsCode;

  const preOld = `  return [{ json: Object.assign({}, $json, { intent: "GREETING", confidence: "high", classified_by: "GREETING_OVERRIDE", skip_ai: true }) }];
}
// 0b. BOOKING FUNNEL STATE`;

  const preNew = `  return [{ json: Object.assign({}, $json, { intent: "GREETING", confidence: "high", classified_by: "GREETING_OVERRIDE", skip_ai: true }) }];
}
// 0a2. DEMO LEAD CAPTURE STATE — multi-step form (df_lead_name/clinic/phone)
// Must be before 0b so lead responses aren't treated as booking funnel state
var _dfLeadLabel = convLabels.find(function(l) { return l.startsWith("df_lead_"); });
if (_dfLeadLabel) {
  return [{ json: Object.assign({}, $json, { intent: "DEMO_FLOW", classified_by: "DF_LEAD_CAPTURE_STATE", skip_ai: true }) }];
}
// 0b. BOOKING FUNNEL STATE`;

  if (preCode.includes(preOld)) {
    preCode = preCode.replace(preOld, preNew);
    preNode.parameters.jsCode = preCode;
    console.log('✅ FIX 1: df_lead_* detection added to Pre-Clasificador');
  } else {
    console.log('⚠️  FIX 1: Pre-Clasificador pattern not found');
  }

  // ── FIX 2+3+4: Responder Demo ─────────────────────────────────────────
  const rdNode = wf.nodes.find(n => n.name === 'Responder Demo');
  let rdCode = rdNode.parameters.jsCode;

  // FIX 2: Add sendDemoBookingDayPicker helper before MAIN INTENT ROUTER
  const helperInsertPoint = `// ════════════════════════════════════════════════════════════════════════════
// MAIN INTENT ROUTER`;

  const newHelper = `// ── Send LP5 day picker for demo booking + set awaiting_day_choice ─────────
const sendDemoBookingDayPicker = async function(bConfig, context) {
  var _months = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  var _wdays  = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];
  var _check  = new Date(); _check.setDate(_check.getDate() + 1);
  var _offered = [];
  while (_offered.length < 5) {
    var _dow = _check.getDay();
    if (_dow > 0 && _dow < 6) {
      _offered.push({ option: _offered.length + 1, dow: _dow,
        date_iso: _check.toISOString().slice(0, 10),
        label: _wdays[_dow] + " " + _check.getDate() + " de " + _months[_check.getMonth()] });
    }
    _check.setDate(_check.getDate() + 1);
  }
  // Write SOFIA_DAYS private note so Resolver Booking Step Case A can map day_N → DOW
  try {
    await this.helpers.httpRequest({
      method: "POST",
      url: "https://chat.redsolucionesti.com/api/v1/accounts/" + context.account_id + "/conversations/" + context.conversation_id + "/messages",
      headers: { "api_access_token": bConfig.chatwoot_api_token, "Content-Type": "application/json" },
      body: JSON.stringify({ content: "SOFIA_DAYS:" + JSON.stringify(_offered), message_type: "outgoing", private: true }),
      json: false
    });
  } catch(e) {}
  // Set awaiting_day_choice label + lead_captured
  var _currLabels = (context.raw_payload && context.raw_payload.conversation && context.raw_payload.conversation.labels) || [];
  var _newLabels = _currLabels.filter(function(l) {
    return !l.startsWith("df_") && !l.startsWith("awaiting_") && !l.startsWith("lead_plan_") && l !== "lead_captured";
  });
  _newLabels.push("lead_captured");
  _newLabels.push("awaiting_day_choice");
  try { await this.helpers.httpRequest({
    method: "POST",
    url: "https://chat.redsolucionesti.com/api/v1/accounts/" + context.account_id + "/conversations/" + context.conversation_id + "/labels",
    headers: { "api_access_token": bConfig.chatwoot_api_token, "Content-Type": "application/json" },
    body: JSON.stringify({ labels: _newLabels }), json: false
  }); } catch(e) {}
  // Set booking_funnel_state custom attribute
  try { await this.helpers.httpRequest({
    method: "PATCH",
    url: "https://chat.redsolucionesti.com/api/v1/accounts/" + context.account_id + "/conversations/" + context.conversation_id,
    headers: { "api_access_token": bConfig.chatwoot_api_token, "Content-Type": "application/json" },
    body: JSON.stringify({ custom_attributes: { booking_funnel_state: "awaiting_day_choice" } }), json: false
  }); } catch(e) {}
  // Send LP5 day picker via Twilio
  var _dayLpSid = bConfig.twilio_day_lp5_sid;
  if (_dayLpSid && context.contact_phone) {
    var _toPhone = context.contact_phone;
    if (!_toPhone.startsWith("whatsapp:")) _toPhone = "whatsapp:" + _toPhone;
    var _auth = Buffer.from(bConfig.twilio_account_sid + ":" + bConfig.twilio_auth_token).toString("base64");
    var _dayVars = { "1": "Elige el dia para tu demo (30 min):" };
    for (var _vi = 0; _vi < _offered.length; _vi++) { _dayVars[String(_vi + 2)] = _offered[_vi].label; }
    try { await this.helpers.httpRequest({
      method: "POST",
      url: "https://api.twilio.com/2010-04-01/Accounts/" + bConfig.twilio_account_sid + "/Messages.json",
      headers: { "Authorization": "Basic " + _auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: ["From=" + encodeURIComponent(bConfig.twilio_from), "To=" + encodeURIComponent(_toPhone),
             "ContentSid=" + encodeURIComponent(_dayLpSid),
             "ContentVariables=" + encodeURIComponent(JSON.stringify(_dayVars))].join("&")
    }); } catch(e) { console.error("LP5 send error:", e.message); }
  }
  return [{ json: Object.assign({}, context, { intent: "SUBMENU_AWAIT", classified_by: "DEMO_BOOKING_DAY_SENT", skip_ai: true }) }];
};

// ════════════════════════════════════════════════════════════════════════════
// MAIN INTENT ROUTER`;

  if (rdCode.includes(helperInsertPoint)) {
    rdCode = rdCode.replace(helperInsertPoint, newHelper);
    console.log('✅ FIX 2: sendDemoBookingDayPicker helper added to Responder Demo');
  } else {
    console.log('⚠️  FIX 2: MAIN INTENT ROUTER insertion point not found');
  }

  // FIX 3: Replace df_lead_phone completion to use LP5 day picker
  const leadPhoneOld = `  if (leadState === "df_lead_phone") {
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
  }`;

  const leadPhoneNew = `  if (leadState === "df_lead_phone") {
    // All data collected — save lead to private note, then show LP5 day picker
    var city = ctx.message_text || "";
    var planLabel = convLabels.find(function(l) { return l.startsWith("lead_plan_"); });
    var plan = planLabel ? planLabel.replace("lead_plan_", "") : "no especificado";
    // Private note for the sales team
    try { await this.helpers.httpRequest({
      method: "POST",
      url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/messages",
      headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
      body: JSON.stringify({ content: "\\ud83d\\udcca LEAD CAPTURADO\\nPlan: " + plan + "\\nCiudad/contacto: " + city, message_type: "outgoing", private: true }),
      json: false
    }); } catch(e) {}
    // Confirmation + transition to calendar booking
    await sendText.call(this, "\\u2705 \\u00a1Perfecto! Ahora elijamos el mejor d\\u00eda para tu demo personalizada de SofIA.");
    return await sendDemoBookingDayPicker.call(this, botConfig, ctx);
  }`;

  if (rdCode.includes(leadPhoneOld)) {
    rdCode = rdCode.replace(leadPhoneOld, leadPhoneNew);
    console.log('✅ FIX 3: Lead capture completion now sends LP5 day picker');
  } else {
    // Try with actual unicode chars (not escaped)
    const checkStr = 'if (leadState === "df_lead_phone")';
    const idx = rdCode.indexOf(checkStr);
    console.log('⚠️  FIX 3: df_lead_phone pattern not found exactly. Searching... found at char:', idx);
    if (idx >= 0) {
      console.log('  Context:', JSON.stringify(rdCode.substring(idx, idx+200)));
    }
  }

  // FIX 4: Replace _CREATE_EVENT handler — check lead_captured first
  const ceOld = `  if (action === "_CREATE_EVENT") {
    await transitionToNode.call(this, null);
    var t02Sid = botConfig.twilio_booking_service_sid;
    if (t02Sid && ctx.contact_phone) {
      var toNum = ctx.contact_phone;
      if (!toNum.startsWith("whatsapp:")) toNum = "whatsapp:" + toNum;
      var authB64 = Buffer.from(botConfig.twilio_account_sid + ":" + botConfig.twilio_auth_token).toString("base64");
      var t02Parts = [
        "From=" + encodeURIComponent(botConfig.twilio_from),
        "To=" + encodeURIComponent(toNum),
        "ContentSid=" + encodeURIComponent(t02Sid)
      ];
      try {
        await this.helpers.httpRequest({
          method: "POST",
          url: "https://api.twilio.com/2010-04-01/Accounts/" + botConfig.twilio_account_sid + "/Messages.json",
          headers: { "Authorization": "Basic " + authB64, "Content-Type": "application/x-www-form-urlencoded" },
          body: t02Parts.join("&")
        });
      } catch(e) { console.error("_CREATE_EVENT Twilio send error:", e.message); }
    } else {
      await sendText.call(this, "\\uD83D\\uDCC5 \\u00BFQu\\u00E9 tipo de servicio necesitas?\\n\\n1. Limpieza dental\\n2. Consulta general\\n3. Ortodoncia\\n4. Blanqueamiento\\n5. Urgencia");
    }
    try {
      await this.helpers.httpRequest({
        method: "PATCH",
        url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id,
        headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
        body: JSON.stringify({ custom_attributes: { booking_funnel_state: "awaiting_service" } }),
        json: false
      });
      var bfLabels = convLabels.filter(function(l) { return !l.startsWith("df_") && l !== "awaiting_service"; });
      bfLabels.push("awaiting_service");
      await setLabels.call(this, bfLabels);
    } catch(e) { console.error("_CREATE_EVENT label/attr error:", e.message); }
    return [{ json: Object.assign({}, ctx, { intent: "SUBMENU_AWAIT", classified_by: "DF_ACTION_CREATE_EVENT_SENT", skip_ai: true }) }];
  }`;

  const ceNew = `  if (action === "_CREATE_EVENT") {
    await transitionToNode.call(this, null);
    // DEMO BOOKING: collect lead info first, then show calendar day picker
    var _hasLeadData = convLabels.includes("lead_captured");
    if (!_hasLeadData) {
      // Lead info not collected yet — start multi-step form
      return await handleLeadCapture.call(this, "_LEAD_CAPTURE", null, flowConfig);
    }
    // Lead already captured → go straight to LP5 day picker
    await sendText.call(this, "\\u{1F4C5} Genial! Elijamos el d\\u00EDa para tu demo:");
    return await sendDemoBookingDayPicker.call(this, botConfig, ctx);
  }`;

  if (rdCode.includes(ceOld)) {
    rdCode = rdCode.replace(ceOld, ceNew);
    console.log('✅ FIX 4: _CREATE_EVENT now checks lead_captured before booking');
  } else {
    const idx = rdCode.indexOf('if (action === "_CREATE_EVENT")');
    console.log('⚠️  FIX 4: _CREATE_EVENT pattern not matched exactly. Found at char:', idx);
  }

  rdNode.parameters.jsCode = rdCode;

  // ── FIX 5: Supabase demo_flow nodes — add CTA to info/feature nodes ────
  console.log('\nUpdating Supabase demo_flow nodes...');
  const sbRes = await sbReq('GET', `/rest/v1/clinics?select=bot_config&id=eq.${DEMO_CLINIC_ID}`);
  const bc = sbRes[0].bot_config;
  const df = bc.demo_flow;

  // como_funciona (lp4, 4 opts): change pos_4 "Ver planes y precios"→"Agendar demo gratis"
  df.nodes.como_funciona.options[3] = { id: "pos_4", next: null, label: "\uD83D\uDCC5 Agendar demo gratis", action: "_LEAD_CAPTURE" };
  console.log('  como_funciona pos_4 → _LEAD_CAPTURE');

  // precios (lp5, 5 opts): change pos_5 "Ver cómo funciona"→"Agendar demo gratis"
  df.nodes.precios.options[4] = { id: "pos_5", next: null, label: "\uD83D\uDCC5 Agendar demo gratis", action: "_LEAD_CAPTURE" };
  console.log('  precios pos_5 → _LEAD_CAPTURE');

  // info_responde (lp3, 3 opts): change pos_1 "Ver planes y precios"→"Agendar demo gratis"
  df.nodes.info_responde.options[0] = { id: "pos_1", next: null, label: "\uD83D\uDCC5 Agendar demo gratis", action: "_LEAD_CAPTURE" };
  console.log('  info_responde pos_1 → _LEAD_CAPTURE');

  // info_recordatorios (lp3, 3 opts): change pos_1 "Ver planes y precios"→"Agendar demo gratis"
  df.nodes.info_recordatorios.options[0] = { id: "pos_1", next: null, label: "\uD83D\uDCC5 Agendar demo gratis", action: "_LEAD_CAPTURE" };
  console.log('  info_recordatorios pos_1 → _LEAD_CAPTURE');

  // info_agenda (lp3): keep _CREATE_EVENT at pos_1, rename label to be clearer
  df.nodes.info_agenda.options[0].label = "\uD83D\uDCC5 Agendar demo gratis";
  console.log('  info_agenda pos_1 label → "Agendar demo gratis"');

  // bienvenida: rename pos_3 "Agendar cita ahora" → "Agendar demo gratis"
  df.nodes.bienvenida.options[2].label = "\uD83D\uDCC5 Agendar demo gratis";
  console.log('  bienvenida pos_3 label → "Agendar demo gratis"');

  // Save updated bot_config to Supabase
  const sbUpdate = await sbReq('PATCH', `/rest/v1/clinics?id=eq.${DEMO_CLINIC_ID}`,
    { bot_config: bc });
  if (Array.isArray(sbUpdate) && sbUpdate[0]) {
    console.log('✅ FIX 5: Supabase demo_flow nodes updated');
  } else {
    console.log('⚠️  FIX 5: Supabase update result:', JSON.stringify(sbUpdate).substring(0,200));
  }

  // ── Upload workflow ────────────────────────────────────────────────────
  const payload = { name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings || {}, staticData: wf.staticData || null };

  console.log('\nUploading workflow...');
  const result = await n8nReq('PUT', `/api/v1/workflows/${WF_ID}`, payload);
  console.log('Upload:', result.id, result.name, 'active:', result.active);

  if (!result.active) {
    await n8nReq('POST', `/api/v1/workflows/${WF_ID}/activate`);
    console.log('Re-activated.');
  }

  console.log('\n✅ patch_v30 complete!');
  console.log('   1. "gabriel" in lead capture now routes to DEMO_FLOW (not catch-all)');
  console.log('   2. After city/contact → LP5 day picker sent (calendar connected!)');
  console.log('   3. _CREATE_EVENT → checks lead first, then LP5 → full booking flow');
  console.log('   4. Demo CTA added to: como_funciona, precios, info_responde, info_recordatorios, info_agenda, bienvenida');
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
