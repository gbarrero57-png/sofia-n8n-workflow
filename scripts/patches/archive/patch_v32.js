/**
 * patch_v32.js — Fix Calcular Slots: slice(0,20) runs before _filterDay filter
 *
 * BUG: buildLegacySlots generates 20 slots/day (9am-7pm × 30min = exactly 20).
 * With .slice(0,20) applied BEFORE the _filterDay filter, all 20 slots are from
 * today. Filtering for tomorrow leaves 0 slots → "Sin disponibilidad en 14 dias".
 *
 * FIX: Remove .slice(0,20) from the mode-dispatch section. Apply a single
 * .slice(0,100) AFTER all filters are done, just before passing to Seleccionar.
 *
 * Coverage: legacy mode, specific mode, any mode (all three paths).
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

  const node = wf.nodes.find((n) => n.name === "Calcular Slots Disponibles");
  if (!node) throw new Error("Calcular Slots Disponibles not found");

  let code = node.parameters.jsCode;

  // ── FIX: Remove .slice(0,20) from all three mode paths ───────────────────
  // Path 1: legacy mode
  const OLD_LEGACY =
    "available_slots = buildLegacySlots(busyGeneral, ctx.bot_config).slice(0, 20);";
  const NEW_LEGACY =
    "available_slots = buildLegacySlots(busyGeneral, ctx.bot_config); // slice after filter";
  if (!code.includes(OLD_LEGACY)) throw new Error("FIX: legacy slice not found");
  code = code.replace(OLD_LEGACY, NEW_LEGACY);
  console.log("FIX applied: legacy mode slice removed");

  // Path 2: specific doctor mode
  const OLD_SPECIFIC =
    "available_slots = buildDoctorSlots(selected_doctor, busy).slice(0, 20);";
  const NEW_SPECIFIC =
    "available_slots = buildDoctorSlots(selected_doctor, busy); // slice after filter";
  if (!code.includes(OLD_SPECIFIC)) throw new Error("FIX: specific slice not found");
  code = code.replace(OLD_SPECIFIC, NEW_SPECIFIC);
  console.log("FIX applied: specific mode slice removed");

  // Path 3: any mode (sort then slice)
  const OLD_ANY =
    "available_slots.sort(function(a, b) { return new Date(a.start) - new Date(b.start); })\n  available_slots = available_slots.slice(0, 20);";
  const NEW_ANY =
    "available_slots.sort(function(a, b) { return new Date(a.start) - new Date(b.start); }) // slice after filter";

  // Try with exact whitespace variants
  let anyFixed = false;
  const anyVariants = [
    // with newline + 2 spaces
    "available_slots.sort(function(a, b) { return new Date(a.start) - new Date(b.start); });\n  available_slots = available_slots.slice(0, 20);",
    // with newline + no spaces
    "available_slots.sort(function(a, b) { return new Date(a.start) - new Date(b.start); });\navailable_slots = available_slots.slice(0, 20);",
    // semicolon variants
    "available_slots.sort(function(a, b) { return new Date(a.start) - new Date(b.start); })\n  available_slots = available_slots.slice(0, 20);",
    "available_slots.sort(function(a, b) { return new Date(a.start) - new Date(b.start); })\navailable_slots = available_slots.slice(0, 20);",
  ];
  for (const variant of anyVariants) {
    if (code.includes(variant)) {
      const replacement = variant.replace(/\n.*available_slots = available_slots\.slice\(0, 20\);/, "; // slice after filter");
      code = code.replace(variant, replacement);
      anyFixed = true;
      console.log("FIX applied: any mode slice removed");
      break;
    }
  }
  if (!anyFixed) {
    // Find it by searching
    const anyIdx = code.indexOf("available_slots = available_slots.slice(0, 20)");
    if (anyIdx < 0) throw new Error("FIX: any mode slice not found");
    // Replace just this line
    code = code.substring(0, anyIdx) + "// available_slots.slice(0,20) moved after filters" + code.substring(anyIdx + "available_slots = available_slots.slice(0, 20)".length);
    console.log("FIX applied: any mode slice removed (fallback)");
  }

  // ── Add .slice(0, 100) AFTER all filters (before return) ─────────────────
  const OLD_RETURN_ANCHOR = "return [{\n  json: Object.assign({}, ctx, {\n    available_slots:";
  const NEW_RETURN_ANCHOR = "available_slots = available_slots.slice(0, 100); // cap after all filters\nreturn [{\n  json: Object.assign({}, ctx, {\n    available_slots:";

  if (code.includes(OLD_RETURN_ANCHOR)) {
    code = code.replace(OLD_RETURN_ANCHOR, NEW_RETURN_ANCHOR);
    console.log("FIX applied: cap slice(0,100) added before return");
  } else {
    // Fallback: find last return [ in the code
    const retIdx = code.lastIndexOf("return [{");
    if (retIdx < 0) throw new Error("FIX: return statement not found");
    code = code.substring(0, retIdx) + "available_slots = available_slots.slice(0, 100); // cap after all filters\n" + code.substring(retIdx);
    console.log("FIX applied: cap slice(0,100) added before final return (fallback)");
  }

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
  console.log("Workflow activated. patch_v32 complete.");

  // Verify
  const wf2 = await apiRequest("GET", "/api/v1/workflows/37SLdWISQLgkHeXk");
  const node2 = wf2.nodes.find((n) => n.name === "Calcular Slots Disponibles");
  const code2 = node2.parameters.jsCode;
  console.log("\nVerification:");
  console.log("  slice after filter (legacy):", !code2.includes("buildLegacySlots(busyGeneral, ctx.bot_config).slice(0, 20)") ? "✅" : "❌");
  console.log("  slice after filter (specific):", !code2.includes("buildDoctorSlots(selected_doctor, busy).slice(0, 20)") ? "✅" : "❌");
  console.log("  cap slice(0,100) present:", code2.includes("slice(0, 100)") ? "✅" : "❌");
}

main().catch((e) => {
  console.error("PATCH FAILED:", e.message);
  process.exit(1);
});
