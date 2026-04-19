#!/usr/bin/env node
/**
 * patch_v27.js
 * Replace quick-reply day buttons with LP list-picker (all weekdays visible),
 * and add LP list-picker for time slots.
 *
 * Changes:
 * 1. Create Twilio LP5 day template  (IDs day_1..day_5, button "Ver días")
 * 2. Create Twilio LP3 slot template (IDs slot_1..slot_3, button "Ver horarios")
 * 3. Save SIDs to Supabase bot_config (twilio_day_lp5_sid, twilio_slot_lp3_sid)
 * 4. Resolver Booking Step Case B: use LP5 day template instead of T11 quick-reply
 * 5. Marcar Esperando Confirmación: add LP3 slot send after saving SOFIA_SLOTS
 * 6. Pre-Clasificador Keywords: add day_1..day_5 and slot_1..slot_3 handlers
 */

const https = require("https");
const fs    = require("fs");

const TWILIO_ACCOUNT_SID = "AC4080780a4b4a7d8e7b107a39f01abad3";
const TWILIO_AUTH_TOKEN  = "28b9a195bc04dbb6f5045d1971b9bd6a";
const DEMO_CLINIC_ID     = "c6c15fca-d7fc-4d98-83c1-2c5cb5a6bef1";
const N8N_BASE           = "https://workflows.n8n.redsolucionesti.com";
const N8N_KEY            = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q";
const WF_ID              = "37SLdWISQLgkHeXk";

const sbEnv    = fs.readFileSync("c:/Users/Barbara/Documents/n8n_workflow_claudio/saas/.env", "utf8");
const SB_KEY   = sbEnv.match(/SUPABASE_SERVICE_KEY=(.+)/)[1].trim();
const SB_HOST  = "inhyrrjidhzrbqecnptn.supabase.co";

// ── Helpers ──────────────────────────────────────────────────────────────────

function twilioReq(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const auth = Buffer.from(TWILIO_ACCOUNT_SID + ":" + TWILIO_AUTH_TOKEN).toString("base64");
    const opts = {
      hostname: "content.twilio.com", port: 443, path, method: "POST",
      headers: { "Authorization": "Basic " + auth, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
    };
    const req = https.request(opts, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({ _raw: d }); } });
    });
    req.on("error", reject); req.write(data); req.end();
  });
}

function sbReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: SB_HOST, port: 443, path, method,
      headers: { "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY, "Content-Type": "application/json", "Prefer": "return=representation" }
    };
    if (data) opts.headers["Content-Length"] = Buffer.byteLength(data);
    const req = https.request(opts, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({ _raw: d }); } });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function n8nReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(N8N_BASE + path);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url.hostname, port: 443, path: url.pathname + url.search, method,
      headers: { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" }
    };
    const req = https.request(opts, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => {
        if (res.statusCode >= 400) reject(new Error("HTTP " + res.statusCode + ": " + d.substring(0, 300)));
        else { try { resolve(JSON.parse(d)); } catch(e) { resolve(d); } }
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── Step 1: Create Twilio LP templates ───────────────────────────────────────

async function createTemplates() {
  console.log("\n── Step 1: Create Twilio LP templates ──");

  // LP5 Day picker: 5 items, IDs day_1..day_5, labels {{2}}..{{6}}, body {{1}}
  const dayTpl = {
    friendly_name: "sofia_day_lp5_v2",
    language: "es",
    variables: { "1": "\uD83D\uDCC5 \u00BFQu\u00E9 d\u00EDa prefieres?", "2": "Lunes", "3": "Martes", "4": "Mi\u00E9rcoles", "5": "Jueves", "6": "Viernes" },
    types: {
      "twilio/list-picker": {
        body: "{{1}}",
        button: "Ver d\u00EDas disponibles",
        items: [
          { id: "day_1", item: "{{2}}" },
          { id: "day_2", item: "{{3}}" },
          { id: "day_3", item: "{{4}}" },
          { id: "day_4", item: "{{5}}" },
          { id: "day_5", item: "{{6}}" }
        ]
      }
    }
  };

  // LP3 Slot picker: 3 items, IDs slot_1..slot_3, labels {{2}}..{{4}}, body {{1}}
  const slotTpl = {
    friendly_name: "sofia_slot_lp3_v2",
    language: "es",
    variables: { "1": "\u23F0 Horarios disponibles:", "2": "10:00am", "3": "11:30am", "4": "03:00pm" },
    types: {
      "twilio/list-picker": {
        body: "{{1}}",
        button: "Ver horarios",
        items: [
          { id: "slot_1", item: "{{2}}" },
          { id: "slot_2", item: "{{3}}" },
          { id: "slot_3", item: "{{4}}" }
        ]
      }
    }
  };

  let daySid, slotSid;

  console.log("Creating sofia_day_lp5_v2...");
  const dayResp = await twilioReq("/v1/Content", dayTpl);
  if (dayResp.sid) {
    daySid = dayResp.sid;
    console.log("  ✅ day LP5:", daySid);
  } else {
    console.log("  ❌ day LP5 error:", JSON.stringify(dayResp).substring(0, 200));
    throw new Error("Failed to create day LP5 template");
  }

  console.log("Creating sofia_slot_lp3_v2...");
  const slotResp = await twilioReq("/v1/Content", slotTpl);
  if (slotResp.sid) {
    slotSid = slotResp.sid;
    console.log("  ✅ slot LP3:", slotSid);
  } else {
    console.log("  ❌ slot LP3 error:", JSON.stringify(slotResp).substring(0, 200));
    throw new Error("Failed to create slot LP3 template");
  }

  return { daySid, slotSid };
}

// ── Step 2: Save SIDs to Supabase ────────────────────────────────────────────

async function saveToSupabase(daySid, slotSid) {
  console.log("\n── Step 2: Save SIDs to Supabase ──");
  const rows = await sbReq("GET", "/rest/v1/clinics?select=id,bot_config&id=eq." + DEMO_CLINIC_ID);
  if (!Array.isArray(rows) || !rows[0]) throw new Error("Clinic not found: " + JSON.stringify(rows).substring(0, 200));
  const bc = rows[0].bot_config || {};
  bc.twilio_day_lp5_sid  = daySid;
  bc.twilio_slot_lp3_sid = slotSid;
  const result = await sbReq("PATCH", "/rest/v1/clinics?id=eq." + DEMO_CLINIC_ID, { bot_config: bc });
  if (Array.isArray(result) && result[0]) {
    console.log("  ✅ Saved twilio_day_lp5_sid:", daySid);
    console.log("  ✅ Saved twilio_slot_lp3_sid:", slotSid);
  } else {
    console.log("  Supabase response:", JSON.stringify(result).substring(0, 300));
  }
}

// ── Step 3: Patch n8n workflow ────────────────────────────────────────────────

async function patchWorkflow() {
  console.log("\n── Step 3: Patch n8n workflow ──");
  const wf = await n8nReq("GET", "/api/v1/workflows/" + WF_ID);

  // ── 3a. Resolver Booking Step: replace T11 quick-reply with LP5 day picker ──
  const rbsIdx = wf.nodes.findIndex(n => n.name === "Resolver Booking Step");
  if (rbsIdx === -1) throw new Error("'Resolver Booking Step' node not found");

  let rbsCode = wf.nodes[rbsIdx].parameters.jsCode;

  const OLD_T11_SEND = `  // Send T11 dynamic quick-reply (3 day buttons) via Twilio; text fallback
  var _t11Sid = botConfig.twilio_day_offer_sid;
  var _isTwilioDay = !!botConfig.twilio_account_sid && !!_t11Sid && !!ctx.contact_phone;
  if (_isTwilioDay && _offered.length >= 1) {
    var _toDay = ctx.contact_phone;
    if (!_toDay.startsWith("whatsapp:")) _toDay = "whatsapp:" + _toDay;
    var _authDay = Buffer.from(botConfig.twilio_account_sid + ":" + botConfig.twilio_auth_token).toString("base64");
    var _dayVars = {};
    var _numDay = Math.min(_offered.length, 3);
    for (var _dvi = 0; _dvi < _numDay; _dvi++) { _dayVars[String(_dvi + 1)] = _offered[_dvi].label; }
    if (!_dayVars["2"]) _dayVars["2"] = _dayVars["1"];
    if (!_dayVars["3"]) _dayVars["3"] = _dayVars["2"];
    var _t11Bd = ["From=" + encodeURIComponent(botConfig.twilio_from),
      "To=" + encodeURIComponent(_toDay),
      "ContentSid=" + encodeURIComponent(_t11Sid),
      "ContentVariables=" + encodeURIComponent(JSON.stringify(_dayVars))
    ].join("&");
    try {
      await this.helpers.httpRequest({ method: "POST",
        url: "https://api.twilio.com/2010-04-01/Accounts/" + botConfig.twilio_account_sid + "/Messages.json",
        headers: { "Authorization": "Basic " + _authDay, "Content-Type": "application/x-www-form-urlencoded" },
        body: _t11Bd });
    } catch(_et11) {
      // Fallback: send text picker
      await this.helpers.httpRequest({ method: "POST",
        url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/messages",
        headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
        body: JSON.stringify({ content: _pickerTxt, message_type: "outgoing", private: false }), json: false });
    }
  } else {
    // Fallback when no Twilio: send text list
    await this.helpers.httpRequest({ method: "POST",
      url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/messages",
      headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
      body: JSON.stringify({ content: _pickerTxt, message_type: "outgoing", private: false }), json: false });
  }`;

  if (!rbsCode.includes(OLD_T11_SEND.substring(0, 80))) {
    throw new Error("Cannot find T11 send block in Resolver Booking Step. First 80: " + OLD_T11_SEND.substring(0, 80));
  }

  const NEW_LP5_SEND = `  // Send LP5 day list-picker (all weekdays visible as radio options) via Twilio; text fallback
  var _dayLpSid = botConfig.twilio_day_lp5_sid;
  var _isTwilioDay = !!botConfig.twilio_account_sid && !!_dayLpSid && !!ctx.contact_phone;
  if (_isTwilioDay && _offered.length >= 1) {
    var _toDay = ctx.contact_phone;
    if (!_toDay.startsWith("whatsapp:")) _toDay = "whatsapp:" + _toDay;
    var _authDay = Buffer.from(botConfig.twilio_account_sid + ":" + botConfig.twilio_auth_token).toString("base64");
    var _dayVars = { "1": "\uD83D\uDCC5 \u00BFQu\u00E9 d\u00EDa prefieres?" };
    var _numDay = Math.min(_offered.length, 5);
    for (var _dvi = 0; _dvi < _numDay; _dvi++) { _dayVars[String(_dvi + 2)] = _offered[_dvi].label; }
    // Pad remaining slots (LP5 needs all 5 variables)
    for (var _dpi = _numDay; _dpi < 5; _dpi++) { _dayVars[String(_dpi + 2)] = _offered[_numDay - 1].label; }
    var _t11Bd = ["From=" + encodeURIComponent(botConfig.twilio_from),
      "To=" + encodeURIComponent(_toDay),
      "ContentSid=" + encodeURIComponent(_dayLpSid),
      "ContentVariables=" + encodeURIComponent(JSON.stringify(_dayVars))
    ].join("&");
    try {
      await this.helpers.httpRequest({ method: "POST",
        url: "https://api.twilio.com/2010-04-01/Accounts/" + botConfig.twilio_account_sid + "/Messages.json",
        headers: { "Authorization": "Basic " + _authDay, "Content-Type": "application/x-www-form-urlencoded" },
        body: _t11Bd });
    } catch(_et11) {
      // Fallback: text list
      await this.helpers.httpRequest({ method: "POST",
        url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/messages",
        headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
        body: JSON.stringify({ content: _pickerTxt, message_type: "outgoing", private: false }), json: false });
    }
  } else {
    // Fallback when no Twilio: text list
    await this.helpers.httpRequest({ method: "POST",
      url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/messages",
      headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
      body: JSON.stringify({ content: _pickerTxt, message_type: "outgoing", private: false }), json: false });
  }`;

  rbsCode = rbsCode.replace(OLD_T11_SEND, NEW_LP5_SEND);
  if (!rbsCode.includes("twilio_day_lp5_sid")) throw new Error("RBS patch failed — day_lp5_sid not found in new code");
  wf.nodes[rbsIdx].parameters.jsCode = rbsCode;
  console.log("  ✅ Resolver Booking Step patched (LP5 day picker)");

  // ── 3b. Marcar Esperando Confirmación: add LP3 slot send ─────────────────
  const mecIdx = wf.nodes.findIndex(n => n.name === "Marcar Esperando Confirmación");
  if (mecIdx === -1) throw new Error("'Marcar Esperando Confirmación' node not found");

  let mecCode = wf.nodes[mecIdx].parameters.jsCode;

  // Anchor: the return statement at the end
  const OLD_MEC_RETURN = `return [{
  json: {
    message_text: ctx.message_text, conversation_id: ctx.conversation_id,
    inbox_id: ctx.inbox_id, clinic_id: ctx.clinic_id,
    clinic_name: ctx.clinic_name, bot_config: ctx.bot_config,
    contact_phone: ctx.contact_phone, contact_id: ctx.contact_id,
    account_id: ctx.account_id, message_type: ctx.message_type,
    message_timestamp: ctx.message_timestamp,
    bot_interaction_count: ctx.bot_interaction_count,
    sender_name: ctx.sender_name, sender_email: ctx.sender_email,
    conversation_status: ctx.conversation_status,
    has_contact_inbox: ctx.has_contact_inbox, channel_type: ctx.channel_type,
    intent: ctx.intent, confidence: ctx.confidence,
    selected_slots: ctx.selected_slots || [],
    label_set: true, slots_stored: slots.length > 0
  }
}];`;

  if (!mecCode.includes(OLD_MEC_RETURN.substring(0, 60))) {
    throw new Error("Cannot find return block in Marcar Esperando Confirmación");
  }

  const LP3_SLOT_SEND = `// ── Send LP3 slot list-picker if Twilio slot template is configured ──────────
const botConfigMEC = ctx.bot_config || {};
const slotLpSid = botConfigMEC.twilio_slot_lp3_sid;
if (slotLpSid && botConfigMEC.twilio_account_sid && ctx.contact_phone && slots.length > 0) {
  var _slotTo = ctx.contact_phone;
  if (!_slotTo.startsWith("whatsapp:")) _slotTo = "whatsapp:" + _slotTo;
  var _slotAuth = Buffer.from(botConfigMEC.twilio_account_sid + ":" + botConfigMEC.twilio_auth_token).toString("base64");
  var _DAYS_S = ["Dom","Lun","Mar","Mie","Jue","Vie","Sab"];
  var _MONTHS_S = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  var _slotVars = { "1": "\u23F0 Elige tu horario:" };
  var _nSlots = Math.min(slots.length, 3);
  for (var _si = 0; _si < _nSlots; _si++) {
    var _sl = slots[_si];
    var _slLbl = (_sl.date || "") + " " + (_sl.time || "");
    if (_sl.start_time) {
      var _sld = new Date(_sl.start_time);
      var _slHr = _sld.getUTCHours() - 5;
      if (_slHr < 0) _slHr += 24;
      _slLbl = _DAYS_S[_sld.getUTCDay()] + " " + _sld.getUTCDate() + " " + _MONTHS_S[_sld.getUTCMonth()] + " " + String(_slHr).padStart(2,"0") + ":" + String(_sld.getUTCMinutes()).padStart(2,"0");
    }
    if (_slLbl.length > 24) _slLbl = _slLbl.substring(0, 23) + "\u2026";
    _slotVars[String(_si + 2)] = _slLbl;
  }
  // Pad to 3 if fewer slots
  for (var _spi = _nSlots; _spi < 3; _spi++) { _slotVars[String(_spi + 2)] = _slotVars[String(_nSlots + 1)] || "Otro horario"; }
  try {
    await this.helpers.httpRequest({
      method: "POST",
      url: "https://api.twilio.com/2010-04-01/Accounts/" + botConfigMEC.twilio_account_sid + "/Messages.json",
      headers: { "Authorization": "Basic " + _slotAuth, "Content-Type": "application/x-www-form-urlencoded" },
      body: ["From=" + encodeURIComponent(botConfigMEC.twilio_from),
             "To=" + encodeURIComponent(_slotTo),
             "ContentSid=" + encodeURIComponent(slotLpSid),
             "ContentVariables=" + encodeURIComponent(JSON.stringify(_slotVars))].join("&")
    });
    console.log(JSON.stringify({ ts: new Date().toISOString(), event: "SLOT_LP_SENT", count: _nSlots }));
  } catch(e) { console.error("LP slot send error:", e.message); }
}

`;

  mecCode = mecCode.replace(OLD_MEC_RETURN, LP3_SLOT_SEND + OLD_MEC_RETURN);
  if (!mecCode.includes("twilio_slot_lp3_sid")) throw new Error("MEC patch failed — slot_lp3_sid not found");
  wf.nodes[mecIdx].parameters.jsCode = mecCode;
  console.log("  ✅ Marcar Esperando Confirmación patched (LP3 slot picker)");

  // ── 3c. Pre-Clasificador: add day_* and slot_* ID handlers ───────────────
  const preIdx = wf.nodes.findIndex(n => n.name === "Pre-Clasificador Keywords");
  if (preIdx === -1) throw new Error("'Pre-Clasificador Keywords' node not found");

  let preCode = wf.nodes[preIdx].parameters.jsCode;

  // Insert BEFORE the pos_* → DEMO_FLOW block
  const POS_BLOCK_HEADER = "// ══ DEMO FLOW NAVIGATION: pos_1..pos_5 from LP3/LP4/LP5 list-picker templates ════════";
  if (!preCode.includes(POS_BLOCK_HEADER)) throw new Error("Cannot find pos_* block header in Pre-Clasificador");

  const DAY_SLOT_HANDLERS = `// ── Day LP IDs (day_1..day_5) → booking day selection (LP list-picker) ─────
if (/^day_[1-5]$/.test(_rawMsg)) {
  var _bfStateDayInline = ($json.raw_payload && $json.raw_payload.conversation &&
    $json.raw_payload.conversation.custom_attributes &&
    $json.raw_payload.conversation.custom_attributes.booking_funnel_state) || "";
  if (convLabels.includes("awaiting_day_choice") || _bfStateDayInline === "awaiting_day_choice") {
    var _dayLpNum = parseInt(_rawMsg.replace("day_", ""), 10);
    return [{ json: Object.assign({}, $json, { intent: "BOOKING_TIME_PREF", confidence: "high",
      classified_by: "DAY_LP_BTN", skip_ai: true, _is_day_choice: true,
      message_text: String(_dayLpNum) }) }];
  }
}
// ── Slot LP IDs (slot_1..slot_3) → slot confirmation ─────────────────────
if (/^slot_[1-3]$/.test(_rawMsg) && convLabels.includes("awaiting_slot")) {
  var _slotLpNum = parseInt(_rawMsg.replace("slot_", ""), 10);
  return [{ json: Object.assign({}, $json, { intent: "CREATE_EVENT", confidence: "high",
    classified_by: "SLOT_LP_BTN", skip_ai: true, message_text: String(_slotLpNum) }) }];
}
`;

  preCode = preCode.replace(POS_BLOCK_HEADER, DAY_SLOT_HANDLERS + POS_BLOCK_HEADER);
  if (!preCode.includes("DAY_LP_BTN")) throw new Error("Pre-Clasificador patch failed — DAY_LP_BTN not found");
  wf.nodes[preIdx].parameters.jsCode = preCode;
  console.log("  ✅ Pre-Clasificador patched (day_* and slot_* handlers)");

  // ── PUT back ──────────────────────────────────────────────────────────────
  const payload = {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings || {}, staticData: wf.staticData || null
  };

  console.log("  Uploading workflow...");
  const result = await n8nReq("PUT", "/api/v1/workflows/" + WF_ID, payload);
  console.log("  Upload:", result.id, result.name, "active:", result.active);

  try {
    await n8nReq("POST", "/api/v1/workflows/" + WF_ID + "/activate");
    console.log("  Re-activated.");
  } catch(e) { console.warn("  Re-activate warning:", e.message); }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { daySid, slotSid } = await createTemplates();
  await saveToSupabase(daySid, slotSid);
  await patchWorkflow();
  console.log("\n✅ patch_v27 complete!");
  console.log("   Day picker:  LP5 list-picker with radio buttons (day_1..day_5)");
  console.log("   Slot picker: LP3 list-picker with radio buttons (slot_1..slot_3)");
  console.log("   Both IDs handled in Pre-Clasificador");
}

main().catch(e => {
  console.error("PATCH FAILED:", e.message);
  process.exit(1);
});
