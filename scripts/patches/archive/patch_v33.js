/**
 * patch_v33.js — Fix slot picker: timezone, single LP5 list, pos_N routing
 *
 * FIX 1: Calcular Slots — timezone display bug
 *   toLocaleTimeString/toLocaleDateString without timeZone uses server tz (UTC-1).
 *   Slots stored as "fake UTC" (Lima hour stored as UTC hour) must display with timeZone:"UTC".
 *   Result: "08:00" → "09:00" (correct Lima time).
 *
 * FIX 2: Pre-Clasificador — pos_N routing when awaiting_slot
 *   pos_N + awaiting_slot should → SLOT_LP_BTN_POS (slot confirmation)
 *   not → DEMO_FLOW (demo navigation).
 *   Also extend DEMO_FLOW guard to exclude awaiting_slot state.
 *
 * FIX 3: Check Slot Confirmation State — allow SLOT_LP_BTN_POS
 *   Add 'SLOT_LP_BTN_POS' to classified_by whitelist for slot_confirmation_pending.
 *
 * FIX 4: Enviar Oferta Chatwoot — remove T07 quick-reply + extra text
 *   When Twilio is configured, send plain text only (Marcar Esperando sends the LP5).
 *   Eliminates the duplicate T07 buttons + text overflow before the LP5 list.
 *
 * FIX 5: Marcar Esperando Confirmación — use LP5 (5 items) instead of LP3 (3 items)
 *   Try twilio_lp5_sid first, then fall back to twilio_slot_lp3_sid.
 *   Show up to 5 slots with proper ISO-based time labels.
 */

const N8N_URL = "https://workflows.n8n.redsolucionesti.com";
const N8N_KEY = require("fs")
  .readFileSync(require("path").join(__dirname, "../../../n8n-mcp/.env"), "utf8")
  .match(/N8N_API_KEY=(.+)/)?.[1]?.trim();

const https = require("https");
function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(N8N_URL + path);
    const opts = {
      hostname: url.hostname, port: url.port || 443,
      path: url.pathname + url.search, method,
      headers: { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" },
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
        else resolve(JSON.parse(data));
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log("Fetching SofIA workflow...");
  const wf = await apiRequest("GET", "/api/v1/workflows/37SLdWISQLgkHeXk");
  console.log(`Got workflow: ${wf.nodes.length} nodes`);

  // ── FIX 1: Calcular Slots — add timeZone:"UTC" to all date/time calls ─────
  const calcNode = wf.nodes.find((n) => n.name === "Calcular Slots Disponibles");
  if (!calcNode) throw new Error("Calcular Slots Disponibles not found");
  let calcCode = calcNode.parameters.jsCode;

  // Replace toLocaleDateString without timeZone
  calcCode = calcCode.replace(
    /toLocaleDateString\("es-PE",\s*\{([^}]+)\}\)/g,
    (match, inner) => {
      if (inner.includes("timeZone")) return match; // already has it
      return `toLocaleDateString("es-PE", {${inner.trimEnd()}, timeZone: "UTC" })`;
    }
  );
  // Replace toLocaleTimeString without timeZone
  calcCode = calcCode.replace(
    /toLocaleTimeString\("es-PE",\s*\{([^}]+)\}\)/g,
    (match, inner) => {
      if (inner.includes("timeZone")) return match;
      return `toLocaleTimeString("es-PE", {${inner.trimEnd()}, timeZone: "UTC" })`;
    }
  );
  calcNode.parameters.jsCode = calcCode;
  // Verify
  const tzCount = (calcCode.match(/timeZone: "UTC"/g) || []).length;
  if (tzCount < 4) throw new Error(`FIX 1: Expected >=4 timeZone:"UTC" insertions, got ${tzCount}`);
  console.log(`FIX 1 applied: timeZone:"UTC" added to ${tzCount} date/time format calls`);

  // ── FIX 2: Pre-Clasificador — pos_N routing ───────────────────────────────
  const preClasNode = wf.nodes.find((n) => n.name === "Pre-Clasificador Keywords");
  if (!preClasNode) throw new Error("Pre-Clasificador Keywords not found");
  let preCode = preClasNode.parameters.jsCode;

  // 2a: Add _inSlotChoice detection + update DEMO_FLOW guard to exclude awaiting_slot
  const OLD_DEMO_GUARD = `var _inDayChoice = convLabels.includes("awaiting_day_choice") ||
  (($json.raw_payload && $json.raw_payload.conversation &&
    $json.raw_payload.conversation.custom_attributes &&
    $json.raw_payload.conversation.custom_attributes.booking_funnel_state) === "awaiting_day_choice");
if (!_inDayChoice && (_rawMsg === "pos_1" || _rawMsg === "pos_2" || _rawMsg === "pos_3" || _rawMsg === "pos_4" || _rawMsg === "pos_5")) {`;

  const NEW_DEMO_GUARD = `var _inDayChoice = convLabels.includes("awaiting_day_choice") ||
  (($json.raw_payload && $json.raw_payload.conversation &&
    $json.raw_payload.conversation.custom_attributes &&
    $json.raw_payload.conversation.custom_attributes.booking_funnel_state) === "awaiting_day_choice");
var _inSlotChoice = convLabels.includes("awaiting_slot");
if (!_inDayChoice && !_inSlotChoice && (_rawMsg === "pos_1" || _rawMsg === "pos_2" || _rawMsg === "pos_3" || _rawMsg === "pos_4" || _rawMsg === "pos_5")) {`;

  if (!preCode.includes(OLD_DEMO_GUARD)) throw new Error("FIX 2a: DEMO_GUARD anchor not found");
  preCode = preCode.replace(OLD_DEMO_GUARD, NEW_DEMO_GUARD);
  console.log("FIX 2a applied: _inSlotChoice added to DEMO_FLOW guard");

  // 2b: Add pos_N + awaiting_slot → SLOT_LP_BTN_POS BEFORE the DAY_LP_BTN_POS block
  const OLD_DAY_BTN_POS = `// ── LP5 day-picker also sends pos_N (list-picker item ID) when awaiting_day_choice ──`;
  const NEW_DAY_BTN_POS = `// ── LP5 slot-picker sends pos_N when awaiting_slot ──────────────────────────────────
if (/^pos_[1-5]$/.test(_rawMsg) && _inSlotChoice) {
  var _slotPosNum = parseInt(_rawMsg.replace("pos_", ""), 10);
  return [{ json: Object.assign({}, $json, { intent: "CREATE_EVENT", confidence: "high",
    classified_by: "SLOT_LP_BTN_POS", skip_ai: true, message_text: String(_slotPosNum) }) }];
}
// ── LP5 day-picker also sends pos_N (list-picker item ID) when awaiting_day_choice ──`;

  if (!preCode.includes(OLD_DAY_BTN_POS)) throw new Error("FIX 2b: DAY_BTN_POS anchor not found");
  preCode = preCode.replace(OLD_DAY_BTN_POS, NEW_DAY_BTN_POS);
  console.log("FIX 2b applied: pos_N + awaiting_slot → SLOT_LP_BTN_POS");

  preClasNode.parameters.jsCode = preCode;

  // ── FIX 3: Check Slot Confirmation State — add SLOT_LP_BTN_POS ────────────
  const checkNode = wf.nodes.find((n) => n.name === "Check Slot Confirmation State");
  if (!checkNode) throw new Error("Check Slot Confirmation State not found");
  let checkCode = checkNode.parameters.jsCode;

  const OLD_CLASSIFIED = `$json.classified_by === 'SLOT_LP_BTN' ||
      $json.classified_by === 'SLOT_BTN_LABEL_DETECTOR'`;
  const NEW_CLASSIFIED = `$json.classified_by === 'SLOT_LP_BTN' ||
      $json.classified_by === 'SLOT_LP_BTN_POS' ||
      $json.classified_by === 'SLOT_BTN_LABEL_DETECTOR'`;

  if (!checkCode.includes(OLD_CLASSIFIED)) throw new Error("FIX 3: classified_by list not found");
  checkCode = checkCode.replace(OLD_CLASSIFIED, NEW_CLASSIFIED);
  checkNode.parameters.jsCode = checkCode;
  console.log("FIX 3 applied: SLOT_LP_BTN_POS added to Check Slot Confirmation State");

  // ── FIX 4: Enviar Oferta Chatwoot — send plain text only (skip T07) ───────
  const enviarNode = wf.nodes.find((n) => n.name === "Enviar Oferta Chatwoot");
  if (!enviarNode) throw new Error("Enviar Oferta Chatwoot not found");
  let envCode = enviarNode.parameters.jsCode;

  // Replace the isTwilio block: instead of T07 quick-reply, send plain text + note
  // The LP5 picker will be sent by Marcar Esperando Confirmación
  const OLD_TWILIO_BLOCK = `if (isTwilio) {
  const accountSid = botConfig.twilio_account_sid;
  const authToken  = botConfig.twilio_auth_token;
  const fromNumber = botConfig.twilio_from;
  const contentSid = botConfig.twilio_slots_content_sid;`;

  const NEW_TWILIO_BLOCK = `if (isTwilio) {
  // LP5 slot picker will be sent by Marcar Esperando Confirmación.
  // Here we just send a plain-text listing so the patient sees the slots in Chatwoot.
  // Skip the T07 quick-reply (3-button only) to avoid duplicate/confusing messages.
  const _slotListMsg = ctx.offer_message || "Aqui tienes los horarios disponibles.";
  await this.helpers.httpRequest({
    method: "POST",
    url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/messages",
    headers: { "api_access_token": ctx.chatwoot_api_token || botConfig.chatwoot_api_token, "Content-Type": "application/json" },
    body: JSON.stringify({ content: _slotListMsg, message_type: "outgoing", private: false }),
    json: false
  });
  return [{ json: Object.assign({}, ctx, { slots_sent_via: "chatwoot_text_lp5_pending" }) }];

  // NOTE: Original T07 quick-reply code preserved below (unused):
  const accountSid = botConfig.twilio_account_sid; // unused
  const authToken  = botConfig.twilio_auth_token;  // unused
  const fromNumber = botConfig.twilio_from;         // unused
  const contentSid = botConfig.twilio_slots_content_sid; // unused`;

  if (!envCode.includes(OLD_TWILIO_BLOCK)) throw new Error("FIX 4: Twilio block not found");
  envCode = envCode.replace(OLD_TWILIO_BLOCK, NEW_TWILIO_BLOCK);
  enviarNode.parameters.jsCode = envCode;
  console.log("FIX 4 applied: Enviar Oferta now sends plain text (LP5 sent by Marcar Esperando)");

  // ── FIX 5: Marcar Esperando Confirmación — use LP5 (5 items) ─────────────
  const mecNode = wf.nodes.find((n) => n.name === "Marcar Esperando Confirmación");
  if (!mecNode) throw new Error("Marcar Esperando Confirmación not found");
  let mecCode = mecNode.parameters.jsCode;

  // Change LP key: prefer twilio_lp5_sid, fall back to twilio_slot_lp3_sid
  const OLD_LP_KEY = `const slotLpSid = botConfigMEC.twilio_slot_lp3_sid;
if (slotLpSid && botConfigMEC.twilio_account_sid && ctx.contact_phone && slots.length > 0) {`;
  const NEW_LP_KEY = `// Use LP5 (5 items) for slots if available, fall back to LP3 (3 items)
const slotLpSid = botConfigMEC.twilio_lp5_sid || botConfigMEC.twilio_slot_lp3_sid;
const _maxSlotItems = botConfigMEC.twilio_lp5_sid ? 5 : 3;
if (slotLpSid && botConfigMEC.twilio_account_sid && ctx.contact_phone && slots.length > 0) {`;

  if (!mecCode.includes(OLD_LP_KEY)) throw new Error("FIX 5a: LP key line not found");
  mecCode = mecCode.replace(OLD_LP_KEY, NEW_LP_KEY);
  console.log("FIX 5a applied: LP5 preferred over LP3 for slot picker");

  // Change slot count limit from 3 to _maxSlotItems
  const OLD_NSLOTS = `var _nSlots = Math.min(slots.length, 3);`;
  const NEW_NSLOTS = `var _nSlots = Math.min(slots.length, _maxSlotItems);`;
  if (!mecCode.includes(OLD_NSLOTS)) throw new Error("FIX 5b: _nSlots line not found");
  mecCode = mecCode.replace(OLD_NSLOTS, NEW_NSLOTS);
  console.log("FIX 5b applied: slot count limit updated to _maxSlotItems");

  // Fix slot label — use start_iso (correct property name) instead of start_time
  // Also use proper Lima offset calculation
  const OLD_SLOT_LABEL = `if (_sl.start_time) {
      var _sld = new Date(_sl.start_time);
      var _slHr = _sld.getUTCHours() - 5;
      if (_slHr < 0) _slHr += 24;
      _slLbl = _DAYS_S[_sld.getUTCDay()] + " " + _sld.getUTCDate() + " " + _MONTHS_S[_sld.getUTCMonth()] + " " + String(_slHr).padStart(2,"0") + ":" + String(_sld.getUTCMinutes()).padStart(2,"0");
    }`;
  const NEW_SLOT_LABEL = `// Use start_iso (the real UTC time) to compute Lima display time
    var _startIso = _sl.start_iso || _sl.start_time || null;
    if (_startIso) {
      var _sld = new Date(_startIso);
      // start_iso is real UTC; Lima = UTC - 5h
      var _slLimaMs = _sld.getTime() - 5 * 3600000;
      var _slLima = new Date(_slLimaMs);
      var _slHr = _slLima.getUTCHours();
      var _slMin = _slLima.getUTCMinutes();
      var _slDow = _slLima.getUTCDay();
      var _slDate = _slLima.getUTCDate();
      var _slMon = _slLima.getUTCMonth();
      _slLbl = _DAYS_S[_slDow] + " " + _slDate + " " + _MONTHS_S[_slMon] + " " + String(_slHr).padStart(2,"0") + ":" + String(_slMin).padStart(2,"0");
    }`;
  if (!mecCode.includes(OLD_SLOT_LABEL)) throw new Error("FIX 5c: slot label block not found");
  mecCode = mecCode.replace(OLD_SLOT_LABEL, NEW_SLOT_LABEL);
  console.log("FIX 5c applied: slot label uses start_iso with proper Lima offset");

  // Fix pad loop — use _maxSlotItems instead of hardcoded 3
  const OLD_PAD = `for (var _spi = _nSlots; _spi < 3; _spi++) { _slotVars[String(_spi + 2)] = _slotVars[String(_nSlots + 1)] || "Otro horario"; }`;
  const NEW_PAD = `for (var _spi = _nSlots; _spi < _maxSlotItems; _spi++) { _slotVars[String(_spi + 2)] = _slotVars[String(_nSlots + 1)] || "Otro horario"; }`;
  if (!mecCode.includes(OLD_PAD)) throw new Error("FIX 5d: pad loop not found");
  mecCode = mecCode.replace(OLD_PAD, NEW_PAD);
  console.log("FIX 5d applied: pad loop uses _maxSlotItems");

  mecNode.parameters.jsCode = mecCode;

  // ── PUT the updated workflow ──────────────────────────────────────────────
  console.log("\nSaving workflow...");
  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings,
    staticData: wf.staticData,
  };
  await apiRequest("PUT", "/api/v1/workflows/37SLdWISQLgkHeXk", payload);
  console.log("Workflow saved.");
  await apiRequest("POST", "/api/v1/workflows/37SLdWISQLgkHeXk/activate");
  console.log("Workflow activated. patch_v33 complete.");

  // Verify
  const wf2 = await apiRequest("GET", "/api/v1/workflows/37SLdWISQLgkHeXk");
  const calc2 = wf2.nodes.find((n) => n.name === "Calcular Slots Disponibles");
  const pre2 = wf2.nodes.find((n) => n.name === "Pre-Clasificador Keywords");
  const check2 = wf2.nodes.find((n) => n.name === "Check Slot Confirmation State");
  const env2 = wf2.nodes.find((n) => n.name === "Enviar Oferta Chatwoot");
  const mec2 = wf2.nodes.find((n) => n.name === "Marcar Esperando Confirmación");
  console.log("\nVerification:");
  const tzC = (calc2.parameters.jsCode.match(/timeZone: "UTC"/g) || []).length;
  console.log(`  FIX 1 timezone (${tzC} calls):`, tzC >= 4 ? "✅" : "❌");
  console.log("  FIX 2 _inSlotChoice:", pre2.parameters.jsCode.includes("_inSlotChoice") ? "✅" : "❌");
  console.log("  FIX 2 SLOT_LP_BTN_POS routing:", pre2.parameters.jsCode.includes("SLOT_LP_BTN_POS") ? "✅" : "❌");
  console.log("  FIX 3 Check whitelist:", check2.parameters.jsCode.includes("SLOT_LP_BTN_POS") ? "✅" : "❌");
  console.log("  FIX 4 no T07 send:", env2.parameters.jsCode.includes("chatwoot_text_lp5_pending") ? "✅" : "❌");
  console.log("  FIX 5 LP5 preferred:", mec2.parameters.jsCode.includes("twilio_lp5_sid") ? "✅" : "❌");
  console.log("  FIX 5 start_iso label:", mec2.parameters.jsCode.includes("start_iso") ? "✅" : "❌");
}

main().catch((e) => {
  console.error("PATCH FAILED:", e.message);
  process.exit(1);
});
