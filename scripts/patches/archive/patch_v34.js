/**
 * patch_v34.js — Fix Pre-Clasificador: _inSlotChoice/_inDayChoice hoisting bug
 *
 * BUG: SLOT_LP_BTN_POS (idx ~5629) and DAY_LP_BTN_POS (idx ~6184) were added
 * before the `var _inSlotChoice` / `var _inDayChoice` definitions (idx ~7560).
 * JavaScript `var` hoisting means the vars are `undefined` when those checks run,
 * so SLOT_LP_BTN_POS and DAY_LP_BTN_POS NEVER fire.
 *
 * Consequence: when conversation has "awaiting_slot" label and user taps pos_N:
 *   - SLOT_LP_BTN_POS skipped (_inSlotChoice === undefined, falsy)
 *   - DF_POS_ID skipped (!_inSlotChoice fails because _inSlotChoice is NOW assigned true)
 *   - Falls to DEMO_FLOW_CATCH_ALL → sends "👉 Por favor..." → outgoing webhook → loop
 *
 * FIX: Move `_inDayChoice` and `_inSlotChoice` definitions to right after the
 * `convLabels` definition (top of the function), so both checks work correctly
 * at SLOT_LP_BTN_POS and DAY_LP_BTN_POS.
 * Remove the now-duplicate var declarations near DF_POS_ID (keep just the guard).
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
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method,
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

  const node = wf.nodes.find((n) => n.name === "Pre-Clasificador Keywords");
  if (!node) throw new Error("Pre-Clasificador Keywords not found");

  let code = node.parameters.jsCode;

  // ── FIX: Move _inDayChoice/_inSlotChoice to top (after convLabels) ────────
  // Step 1: Add definitions right after convLabels
  const CONV_LABELS_LINE =
    `const convLabels = ($json.raw_payload && $json.raw_payload.conversation && $json.raw_payload.conversation.labels) || [];`;

  if (!code.includes(CONV_LABELS_LINE)) {
    throw new Error("FIX: convLabels definition not found");
  }

  // Check if already fixed (definitions already present after convLabels)
  const afterConvLabels = code.substring(code.indexOf(CONV_LABELS_LINE) + CONV_LABELS_LINE.length, code.indexOf(CONV_LABELS_LINE) + CONV_LABELS_LINE.length + 300);
  if (afterConvLabels.includes("_inDayChoice")) {
    console.log("Definitions already moved. Verifying...");
  } else {
    const NEW_CONV_LABELS =
      `const convLabels = ($json.raw_payload && $json.raw_payload.conversation && $json.raw_payload.conversation.labels) || [];
// ── Early context flags (must be before any pos_N routing) ──────────────────
var _inDayChoice = convLabels.includes("awaiting_day_choice") ||
  (($json.raw_payload && $json.raw_payload.conversation &&
    $json.raw_payload.conversation.custom_attributes &&
    $json.raw_payload.conversation.custom_attributes.booking_funnel_state) === "awaiting_day_choice");
var _inSlotChoice = convLabels.includes("awaiting_slot");`;

    code = code.replace(CONV_LABELS_LINE, NEW_CONV_LABELS);
    console.log("FIX applied: _inDayChoice/_inSlotChoice moved to top");
  }

  // Step 2: Remove duplicate var declarations near DF_POS_ID
  // These are now redundant (vars already assigned above)
  const OLD_DUP_VARS =
    `// Guard: T11 (day picker) also uses pos_1..pos_3 as item IDs.
// Skip DEMO_FLOW routing when in awaiting_day_choice booking funnel state.
var _inDayChoice = convLabels.includes("awaiting_day_choice") ||
  (($json.raw_payload && $json.raw_payload.conversation &&
    $json.raw_payload.conversation.custom_attributes &&
    $json.raw_payload.conversation.custom_attributes.booking_funnel_state) === "awaiting_day_choice");
var _inSlotChoice = convLabels.includes("awaiting_slot");
if (!_inDayChoice && !_inSlotChoice && (_rawMsg === "pos_1" || _rawMsg === "pos_2" || _rawMsg === "pos_3" || _rawMsg === "pos_4" || _rawMsg === "pos_5")) {`;

  const NEW_GUARD_ONLY =
    `// Guard: skip DEMO_FLOW routing when in a booking funnel state (slot/day choice)
// NOTE: _inDayChoice/_inSlotChoice are defined early (after convLabels) to avoid hoisting issues
if (!_inDayChoice && !_inSlotChoice && (_rawMsg === "pos_1" || _rawMsg === "pos_2" || _rawMsg === "pos_3" || _rawMsg === "pos_4" || _rawMsg === "pos_5")) {`;

  if (!code.includes(OLD_DUP_VARS)) {
    throw new Error("FIX: duplicate var block near DF_POS_ID not found (may already be clean)");
  }
  code = code.replace(OLD_DUP_VARS, NEW_GUARD_ONLY);
  console.log("FIX applied: duplicate var declarations removed near DF_POS_ID");

  node.parameters.jsCode = code;

  // ── PUT the updated workflow ──────────────────────────────────────────────
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

  await apiRequest("POST", "/api/v1/workflows/37SLdWISQLgkHeXk/activate");
  console.log("Workflow activated.");

  // Verify
  const wf2 = await apiRequest("GET", "/api/v1/workflows/37SLdWISQLgkHeXk");
  const node2 = wf2.nodes.find((n) => n.name === "Pre-Clasificador Keywords");
  const code2 = node2.parameters.jsCode;

  // Check early definitions are present
  const convIdx = code2.indexOf("const convLabels");
  const slotIdx = code2.indexOf("var _inSlotChoice");
  const dayIdx = code2.indexOf("var _inDayChoice");
  const slotLpIdx = code2.indexOf("SLOT_LP_BTN_POS");
  const dfPosIdx = code2.indexOf("DF_POS_ID");

  console.log("\nVerification (all indices must increase in order):");
  console.log("  convLabels @", convIdx);
  console.log("  _inDayChoice @", dayIdx, "(should be < SLOT_LP_BTN_POS)");
  console.log("  _inSlotChoice @", slotIdx, "(should be < SLOT_LP_BTN_POS)");
  console.log("  SLOT_LP_BTN_POS @", slotLpIdx);
  console.log("  DF_POS_ID @", dfPosIdx);

  const order_ok = dayIdx < slotLpIdx && slotIdx < slotLpIdx && slotLpIdx < dfPosIdx;
  console.log("  Order correct:", order_ok ? "✅" : "❌ FAIL");
  console.log("  Duplicate vars removed:", !code2.includes("// Guard: T11 (day picker)") ? "✅" : "❌");
}

main().catch((e) => {
  console.error("PATCH FAILED:", e.message);
  process.exit(1);
});
