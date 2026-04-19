/**
 * patch_v31.js — Fix greeting detection + LP5 day picker routing
 *
 * FIX 1: Pre-Clasificador — add !_isShortGreeting guard to df_lead_ detection
 *   Problem: "hola" with stale df_lead_* labels triggers lead capture instead of bienvenida.
 *   Root cause: GREETING_OVERRIDE should return early, but sometimes doesn't in n8n runtime.
 *   Fix: belt-and-suspenders guard so df_lead_ detection is skipped for greetings.
 *
 * FIX 2: Pre-Clasificador — handle pos_N when awaiting_day_choice (LP5 day picker)
 *   Problem: LP5 (twilio_lp5_sid) is a list-picker with item IDs pos_1..pos_5.
 *   When user taps a day, Chatwoot receives "pos_2" (not "day_2").
 *   Pre-Clasificador only checks /^day_[1-5]$/, so pos_N is never routed as a day choice.
 *   Fix: add pos_N → BOOKING_TIME_PREF detection when _inDayChoice is true.
 */

const N8N_URL = "https://workflows.n8n.redsolucionesti.com";
const N8N_KEY = process.env.N8N_API_KEY || require("fs").readFileSync(
  require("path").join(__dirname, "../../../n8n-mcp/.env"), "utf8"
).match(/N8N_API_KEY=(.+)/)?.[1]?.trim();

const https = require("https");

function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(N8N_URL + path);
    const opts = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method,
      headers: {
        "X-N8N-API-KEY": N8N_KEY,
        "Content-Type": "application/json",
      },
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

  // ── FIX 1: Pre-Clasificador — add !_isShortGreeting guard to df_lead_ ────
  const preClasNode = wf.nodes.find((n) => n.name === "Pre-Clasificador Keywords");
  if (!preClasNode) throw new Error("Pre-Clasificador Keywords not found");

  let preCode = preClasNode.parameters.jsCode;

  // FIX 1: Replace the df_lead_ check to add !_isShortGreeting guard
  const OLD_DF_LEAD = `var _dfLeadLabel = convLabels.find(function(l) { return l.startsWith("df_lead_"); });
if (_dfLeadLabel) {
  return [{ json: Object.assign({}, $json, { intent: "DEMO_FLOW", classified_by: "DF_LEAD_CAPTURE_STATE", skip_ai: true }) }];
}`;

  const NEW_DF_LEAD = `var _dfLeadLabel = convLabels.find(function(l) { return l.startsWith("df_lead_"); });
// Guard: greetings always reset the flow even if stale df_lead_ label exists
if (_dfLeadLabel && !_isShortGreeting) {
  return [{ json: Object.assign({}, $json, { intent: "DEMO_FLOW", classified_by: "DF_LEAD_CAPTURE_STATE", skip_ai: true }) }];
}`;

  if (!preCode.includes(OLD_DF_LEAD)) {
    throw new Error("FIX 1: Could not find OLD_DF_LEAD block in Pre-Clasificador");
  }
  preCode = preCode.replace(OLD_DF_LEAD, NEW_DF_LEAD);
  console.log("FIX 1 applied: !_isShortGreeting guard added to df_lead_ check");

  // FIX 2: Add pos_N → BOOKING_TIME_PREF when _inDayChoice (LP5 day picker)
  const OLD_SLOT_LP = `// ── Slot LP IDs (slot_1..slot_3) → slot confirmation ─────────────────────
if (/^slot_[1-3]$/.test(_rawMsg) && convLabels.includes("awaiting_slot")) {`;

  const NEW_SLOT_LP = `// ── LP5 day-picker also sends pos_N (list-picker item ID) when awaiting_day_choice ──
// LP5 template (twilio_lp5_sid) has item IDs pos_1..pos_5 (same as LP3/LP4).
// The /^day_[1-5]$/ check above only fires for future templates with day_N item IDs.
if (/^pos_[1-5]$/.test(_rawMsg) && _inDayChoice) {
  var _dayLpNumP = parseInt(_rawMsg.replace("pos_", ""), 10);
  return [{ json: Object.assign({}, $json, { intent: "BOOKING_TIME_PREF", confidence: "high",
    classified_by: "DAY_LP_BTN_POS", skip_ai: true, _is_day_choice: true,
    message_text: String(_dayLpNumP) }) }];
}
// ── Slot LP IDs (slot_1..slot_3) → slot confirmation ─────────────────────
if (/^slot_[1-3]$/.test(_rawMsg) && convLabels.includes("awaiting_slot")) {`;

  if (!preCode.includes(OLD_SLOT_LP)) {
    throw new Error("FIX 2: Could not find OLD_SLOT_LP anchor in Pre-Clasificador");
  }
  preCode = preCode.replace(OLD_SLOT_LP, NEW_SLOT_LP);
  console.log("FIX 2 applied: pos_N → BOOKING_TIME_PREF when _inDayChoice");

  preClasNode.parameters.jsCode = preCode;

  // ── PUT the updated workflow ─────────────────────────────────────────────
  console.log("Saving workflow...");
  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings,
    staticData: wf.staticData,
  };
  await apiRequest("PUT", "/api/v1/workflows/37SLdWISQLgkHeXk", payload);
  console.log("Workflow saved.");

  // Re-activate
  await apiRequest("POST", "/api/v1/workflows/37SLdWISQLgkHeXk/activate");
  console.log("Workflow activated. patch_v31 complete.");

  // Verify
  const wf2 = await apiRequest("GET", "/api/v1/workflows/37SLdWISQLgkHeXk");
  const node2 = wf2.nodes.find((n) => n.name === "Pre-Clasificador Keywords");
  const code2 = node2.parameters.jsCode;
  console.log("\nVerification:");
  console.log("  FIX 1 (!_isShortGreeting):", code2.includes("!_isShortGreeting") ? "✅" : "❌");
  console.log("  FIX 2 (DAY_LP_BTN_POS):", code2.includes("DAY_LP_BTN_POS") ? "✅" : "❌");
}

main().catch((e) => {
  console.error("PATCH FAILED:", e.message);
  process.exit(1);
});
