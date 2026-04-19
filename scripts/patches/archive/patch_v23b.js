// patch_v23b.js — Fix remaining 2 missed anchors from patch_v23
//   Fix 3: Resolver Booking Step — day picker → T11 dynamic quick-reply
//   Fix 4: Confirmar al Paciente — add T09 dynamic quick-reply after confirmation

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
  // FIX 3: Resolver Booking Step — replace text day picker with T11
  // ══════════════════════════════════════════════════════════════════════
  const rbsNode = wf.nodes.find(n => n.name === 'Resolver Booking Step');
  if (!rbsNode) { console.error('ERROR: RBS not found'); process.exit(1); }
  let rbsCode = rbsNode.parameters.jsCode || rbsNode.parameters.functionCode;

  const OLD_CASE_B = `// Send day picker to user
  await this.helpers.httpRequest({
    method: "POST",
    url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/messages",
    headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
    body: JSON.stringify({ content: _pickerTxt, message_type: "outgoing", private: false }),
    json: false
  });

  await saveToChat({ booking_funnel_state: "awaiting_day_choice", booking_service: ctx._booking_service || ctx._bfSvc || "" });
  // Use label (reliable in webhook) + remove any stale awaiting_slot label
  var _curLabels = (ctx.raw_payload && ctx.raw_payload.conversation && ctx.raw_payload.conversation.labels) || [];
  var _newLabels = _curLabels.filter(function(l) { return l !== "awaiting_slot" && l !== "awaiting_day_choice"; });
  _newLabels.push("awaiting_day_choice");
  await setLabel(_newLabels);
  return [{ json: Object.assign({}, ctx, { _continue_to_slots: false }) }];`;

  const NEW_CASE_B = `// Send T11 dynamic quick-reply (3 day buttons) via Twilio; text fallback
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
  }

  await saveToChat({ booking_funnel_state: "awaiting_day_choice", booking_service: ctx._booking_service || ctx._bfSvc || "" });
  // Use label (reliable in webhook) + remove any stale awaiting_slot label
  var _curLabels = (ctx.raw_payload && ctx.raw_payload.conversation && ctx.raw_payload.conversation.labels) || [];
  var _newLabels = _curLabels.filter(function(l) { return l !== "awaiting_slot" && l !== "awaiting_day_choice"; });
  _newLabels.push("awaiting_day_choice");
  await setLabel(_newLabels);
  return [{ json: Object.assign({}, ctx, { _continue_to_slots: false }) }];`;

  if (!rbsCode.includes(OLD_CASE_B)) {
    results.push('WARN: RBS Case B anchor still not found');
    console.log('DEBUG: First 50 chars of OLD_CASE_B search:', JSON.stringify(OLD_CASE_B.substring(0, 50)));
    const idx = rbsCode.indexOf('Send day picker');
    console.log('DEBUG: "Send day picker" found at index:', idx);
    if (idx >= 0) console.log('DEBUG: Context around it:', JSON.stringify(rbsCode.substring(idx - 5, idx + 50)));
  } else {
    rbsCode = rbsCode.replace(OLD_CASE_B, NEW_CASE_B);
    results.push('Fix 3 OK: RBS day picker → T11 dynamic quick-reply');
  }

  if (rbsNode.parameters.jsCode !== undefined) rbsNode.parameters.jsCode = rbsCode;
  else rbsNode.parameters.functionCode = rbsCode;

  // ══════════════════════════════════════════════════════════════════════
  // FIX 4: Confirmar al Paciente — add T09 dynamic quick-reply
  // ══════════════════════════════════════════════════════════════════════
  const confNode = wf.nodes.find(n => n.name === 'Confirmar al Paciente');
  if (!confNode) { results.push('WARN: Confirmar al Paciente not found'); }
  else {
    let confCode = confNode.parameters.jsCode || confNode.parameters.functionCode;

    const OLD_CONF_RETURN = `return [{
  json: Object.assign({}, original_data, {
    confirmation_message: confirmation_message,
    internal_note:        internal_note,
    appointment_id:       appt_id,
    event_created:        true
  })
}];`;

    const NEW_CONF_RETURN = `// Send T09 dynamic quick-reply with appointment details + action buttons
const botConfigConf = original_data.bot_config || {};
if (botConfigConf.twilio_account_sid && botConfigConf.twilio_appointment_content_sid && original_data.contact_phone) {
  var _toConf = original_data.contact_phone;
  if (!_toConf.startsWith("whatsapp:")) _toConf = "whatsapp:" + _toConf;
  var _authConf = Buffer.from(botConfigConf.twilio_account_sid + ":" + botConfigConf.twilio_auth_token).toString("base64");
  var _apptSummary = "\uD83C\uDFE5 " + service + nl + "\uD83D\uDCC5 " + slot.date + " a las " + slot.time;
  if (doctor_name) _apptSummary += nl + "\uD83D\uDC68\u200D\u2695\uFE0F " + doctor_name;
  var _t09Bd = ["From=" + encodeURIComponent(botConfigConf.twilio_from),
    "To=" + encodeURIComponent(_toConf),
    "ContentSid=" + encodeURIComponent(botConfigConf.twilio_appointment_content_sid),
    "ContentVariables=" + encodeURIComponent(JSON.stringify({ "1": _apptSummary }))
  ].join("&");
  try {
    await this.helpers.httpRequest({ method: "POST",
      url: "https://api.twilio.com/2010-04-01/Accounts/" + botConfigConf.twilio_account_sid + "/Messages.json",
      headers: { "Authorization": "Basic " + _authConf, "Content-Type": "application/x-www-form-urlencoded" },
      body: _t09Bd });
  } catch(_et09) {}
}

return [{
  json: Object.assign({}, original_data, {
    confirmation_message: confirmation_message,
    internal_note:        internal_note,
    appointment_id:       appt_id,
    event_created:        true
  })
}];`;

    if (!confCode.includes(OLD_CONF_RETURN)) {
      results.push('WARN: Confirmar return anchor still not found');
      const ri = confCode.lastIndexOf('return');
      console.log('DEBUG last return context:', JSON.stringify(confCode.substring(Math.max(0, ri - 20), ri + 100)));
    } else {
      confCode = confCode.replace(OLD_CONF_RETURN, NEW_CONF_RETURN);
      results.push('Fix 4 OK: Confirmar al Paciente sends T09 quick-reply');
    }

    if (confNode.parameters.jsCode !== undefined) confNode.parameters.jsCode = confCode;
    else confNode.parameters.functionCode = confCode;
  }

  // ══════════════════════════════════════════════════════════════════════
  // PUT workflow
  // ══════════════════════════════════════════════════════════════════════
  const payload = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings || {}, staticData: wf.staticData || null };
  const putResp = await apiRequest('PUT', `/api/v1/workflows/${WF_ID}`, payload);
  console.log('=== patch_v23b results ===');
  results.forEach(r => console.log(r));
  if (putResp.id) console.log('n8n PUT: OK | Nodes:', putResp.nodes.length);
  else console.log('n8n PUT ERROR:', JSON.stringify(putResp).substring(0, 500));
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
