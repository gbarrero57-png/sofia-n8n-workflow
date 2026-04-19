#!/usr/bin/env node
/**
 * patch_v26e.js
 * Fix routing conflict: T11 day picker uses pos_1..pos_3 as IDs,
 * same as DEMO_FLOW navigation. Pre-Clasificador catches pos_* for
 * DEMO_FLOW BEFORE checking awaiting_day_choice state → infinite loop.
 *
 * Fix: guard the pos_* → DEMO_FLOW block so it's skipped when
 * the conversation is in awaiting_day_choice booking funnel state.
 */

const https = require("https");

const N8N_BASE = "https://workflows.n8n.redsolucionesti.com";
const N8N_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q";
const WF_ID    = "37SLdWISQLgkHeXk";

function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(N8N_BASE + path);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method,
      headers: {
        "X-N8N-API-KEY": N8N_KEY,
        "Content-Type": "application/json",
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 300)}`));
        } else {
          resolve(JSON.parse(data));
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log("Fetching workflow...");
  const wf = await apiRequest("GET", `/api/v1/workflows/${WF_ID}`);

  const nodeIdx = wf.nodes.findIndex((n) => n.name === "Pre-Clasificador Keywords");
  if (nodeIdx === -1) throw new Error("Node 'Pre-Clasificador Keywords' not found");

  let code = wf.nodes[nodeIdx].parameters.jsCode;
  console.log("Code length:", code.length);

  // ── OLD pos_* block ──────────────────────────────────────────────────────
  const OLD_POS = `// ══ DEMO FLOW NAVIGATION: pos_1..pos_5 from LP3/LP4/LP5 list-picker templates ════════
if (_rawMsg === "pos_1" || _rawMsg === "pos_2" || _rawMsg === "pos_3" || _rawMsg === "pos_4" || _rawMsg === "pos_5") {
  return [{ json: Object.assign({}, $json, { intent: "DEMO_FLOW", demo_pos: parseInt(_rawMsg.replace("pos_", ""), 10), confidence: "high", classified_by: "DF_POS_ID", skip_ai: true }) }];
}`;

  if (!code.includes(OLD_POS)) {
    throw new Error("Cannot find pos_* block — anchor mismatch. Current block:\n" +
      code.substring(code.indexOf("pos_1") - 50, code.indexOf("pos_1") + 400));
  }

  // ── NEW pos_* block: guard with awaiting_day_choice ───────────────────
  // When T11 (day picker) is shown, pos_1..pos_3 are its button IDs.
  // If the booking funnel is in awaiting_day_choice state, skip DEMO_FLOW routing
  // and let it fall through to the 0b BOOKING FUNNEL STATE block below,
  // which correctly handles awaiting_day_choice → BOOKING_TIME_PREF + _is_day_choice:true
  const NEW_POS = `// ══ DEMO FLOW NAVIGATION: pos_1..pos_5 from LP3/LP4/LP5 list-picker templates ════════
// Guard: T11 (day picker) also uses pos_1..pos_3 as item IDs.
// Skip DEMO_FLOW routing when in awaiting_day_choice booking funnel state.
var _inDayChoice = convLabels.includes("awaiting_day_choice") ||
  (($json.raw_payload && $json.raw_payload.conversation &&
    $json.raw_payload.conversation.custom_attributes &&
    $json.raw_payload.conversation.custom_attributes.booking_funnel_state) === "awaiting_day_choice");
if (!_inDayChoice && (_rawMsg === "pos_1" || _rawMsg === "pos_2" || _rawMsg === "pos_3" || _rawMsg === "pos_4" || _rawMsg === "pos_5")) {
  return [{ json: Object.assign({}, $json, { intent: "DEMO_FLOW", demo_pos: parseInt(_rawMsg.replace("pos_", ""), 10), confidence: "high", classified_by: "DF_POS_ID", skip_ai: true }) }];
}`;

  const newCode = code.replace(OLD_POS, NEW_POS);

  if (newCode === code) throw new Error("Replace was a no-op — check anchor");
  if (!newCode.includes("_inDayChoice")) throw new Error("New code missing _inDayChoice guard");
  console.log("Code length after patch:", newCode.length, "(delta:", newCode.length - code.length + ")");

  // ── PUT back ──────────────────────────────────────────────────────────────
  wf.nodes[nodeIdx].parameters.jsCode = newCode;

  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || {},
    staticData: wf.staticData || null,
  };

  console.log("Uploading patched workflow...");
  const result = await apiRequest("PUT", `/api/v1/workflows/${WF_ID}`, payload);
  console.log("Upload result:", result.id, result.name, "active:", result.active);

  try {
    await apiRequest("POST", `/api/v1/workflows/${WF_ID}/activate`);
    console.log("Workflow re-activated.");
  } catch (e) {
    console.warn("Re-activate warning:", e.message);
  }

  console.log("\n✅ patch_v26e applied!");
  console.log("   pos_* now guarded with !_inDayChoice");
  console.log("   T11 day selections (pos_1..pos_3) in awaiting_day_choice state → fall through to BOOKING_TIME_PREF");
}

main().catch((e) => {
  console.error("PATCH FAILED:", e.message);
  process.exit(1);
});
