/**
 * patch_v37.js — Fix Lock de Slot const + Enviar Menu Chatwoot stale labels
 *
 * BUG 1: Lock de Slot line 3: `const patient = ...`
 *   Line 39: `patient = demoName + ...`  → TypeError: Assignment to constant variable
 *   FIX: Change `const patient` → `var patient`
 *
 * BUG 2: Enviar Menu Chatwoot re-adds awaiting_slot after Generar Texto Menu cleared it.
 *   Root cause: cleanLabels starts from ctx.raw_payload.conversation.labels (stale webhook
 *   snapshot). It filters only df_* labels, keeping awaiting_slot alive. The Generar Texto
 *   Menu clear (POST labels:[]) happens first, then Enviar Menu Chatwoot overwrites it with
 *   ["awaiting_slot","df_bienvenida"].
 *   FIX: When entering demo mode, only set ["df_<start_node>"] — discard all stale labels.
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

  // ── FIX 1: Lock de Slot — const patient → var patient ────────────────────
  {
    const node = wf.nodes.find((n) => n.name === "Lock de Slot");
    if (!node) throw new Error("Lock de Slot not found");
    let code = node.parameters.jsCode;

    const OLD = `const patient = $json.sender_name    || "Paciente";`;
    const NEW = `var patient = $json.sender_name    || "Paciente";`;

    if (!code.includes(OLD)) throw new Error("FIX 1: const patient not found in Lock de Slot");
    node.parameters.jsCode = code.replace(OLD, NEW);
    console.log("FIX 1 applied: const patient → var patient in Lock de Slot");
  }

  // ── FIX 2: Enviar Menu Chatwoot — drop stale labels when entering demo ────
  {
    const node = wf.nodes.find((n) => n.name === "Enviar Menu Chatwoot");
    if (!node) throw new Error("Enviar Menu Chatwoot not found");
    let code = node.parameters.jsCode;

    // Replace the stale-labels logic with a clean "only df_start_node" set
    const OLD =
`    // Clear all df_* labels (fresh start)
    try {
      const convLabels = (ctx.raw_payload && ctx.raw_payload.conversation && ctx.raw_payload.conversation.labels) || [];
      const cleanLabels = convLabels.filter(function(l) { return !l.startsWith("df_"); });
      cleanLabels.push("df_" + demoFlow.start_node);
      await this.helpers.httpRequest({
        method: "POST",
        url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/labels",
        headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
        body: JSON.stringify({ labels: cleanLabels }),
        json: false
      });
    } catch(e) {}`;

    const NEW =
`    // Clear ALL labels and set only df_start_node (fresh demo start)
    // NOTE: Do NOT inherit ctx.raw_payload.conversation.labels — it is stale webhook data
    // that still has awaiting_slot / other booking labels from a previous session.
    try {
      await this.helpers.httpRequest({
        method: "POST",
        url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/labels",
        headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
        body: JSON.stringify({ labels: ["df_" + demoFlow.start_node] }),
        json: false
      });
    } catch(e) {}`;

    if (!code.includes(OLD)) throw new Error("FIX 2: stale labels block not found in Enviar Menu Chatwoot");
    node.parameters.jsCode = code.replace(OLD, NEW);
    console.log("FIX 2 applied: Enviar Menu only sets [df_start_node] — no stale labels");
  }

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
  const lock2 = wf2.nodes.find((n) => n.name === "Lock de Slot");
  const menu2 = wf2.nodes.find((n) => n.name === "Enviar Menu Chatwoot");

  console.log("\nVerification:");
  console.log("  Lock de Slot var patient:", lock2.parameters.jsCode.includes('var patient = $json.sender_name') ? "✅" : "❌");
  console.log("  Lock de Slot no const patient:", !lock2.parameters.jsCode.includes('const patient') ? "✅" : "❌");
  console.log("  Enviar Menu no stale labels:", !menu2.parameters.jsCode.includes('convLabels.filter(function(l) { return !l.startsWith("df_"); })') ? "✅" : "❌");
  console.log("  Enviar Menu only df_start_node:", menu2.parameters.jsCode.includes('labels: ["df_" + demoFlow.start_node]') ? "✅" : "❌");
  console.log("\npatch_v37 complete.");
}

main().catch((e) => {
  console.error("PATCH FAILED:", e.message);
  process.exit(1);
});
