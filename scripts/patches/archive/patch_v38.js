/**
 * patch_v38.js — _HUMAN action: include WhatsApp direct link to advisor
 *
 * When user taps "Hablar con un asesor" in the demo flow, replace the generic
 * "un asesor se pondrá en contacto" message with a direct WhatsApp link to +51905858566
 * with a predefined text so the prospect can reach Gabriel immediately.
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

  const node = wf.nodes.find((n) => n.name === "Responder Demo");
  if (!node) throw new Error("Responder Demo not found");

  let code = node.parameters.jsCode;

  const OLD =
    `    await sendText.call(this, "👤 ¡Claro! Un asesor de SofIA AI se pondrá en contacto contigo en breve para resolver todas tus dudas.\\n\\n¡Gracias por tu interés!");`;

  const NEW =
    `    await sendText.call(this, "👤 ¡Genial! Te conecto directamente con nuestro asesor.\\n\\n📲 Escríbele por WhatsApp ahora mismo:\\nhttps://wa.me/51905858566?text=Hola%2C%20vi%20la%20demo%20de%20SofIA%20AI%20y%20quiero%20m%C3%A1s%20informaci%C3%B3n\\n\\nTe responderá en minutos. ¡Gracias por tu interés! 🙌");`;

  if (!code.includes(OLD)) throw new Error("FIX: _HUMAN sendText not found in Responder Demo");
  node.parameters.jsCode = code.replace(OLD, NEW);
  console.log("FIX applied: _HUMAN message now includes WhatsApp direct link");

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
  const node2 = wf2.nodes.find((n) => n.name === "Responder Demo");
  const ok = node2.parameters.jsCode.includes("wa.me/51905858566");
  console.log("\nVerification:");
  console.log("  WhatsApp link present:", ok ? "✅" : "❌");
  console.log("  patch_v38 complete.");
}

main().catch((e) => {
  console.error("PATCH FAILED:", e.message);
  process.exit(1);
});
