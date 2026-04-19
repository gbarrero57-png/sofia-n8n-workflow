/**
 * patch_v35.js — Early exit for outgoing/activity messages in Validar Input
 *
 * PROBLEM: Every message SofIA sends via Chatwoot triggers a webhook back to n8n.
 * These outgoing-message executions run 9 nodes before IsUserMessage filters them.
 * At peak (multiple messages per user interaction), this is ~50% of all executions.
 *
 * FIX: Return [] immediately in Validar Input when message_type is 'outgoing'
 * or 'activity'. This stops the execution after just 3 nodes instead of 9,
 * with zero risk of affecting real user message processing.
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

  const node = wf.nodes.find((n) => n.name === "Validar Input");
  if (!node) throw new Error("Validar Input not found");

  let code = node.parameters.jsCode;

  // The early exit goes right after message_type is extracted
  const OLD_MSG_TYPE = `const message_type = payload.message_type;
const created_at = payload.created_at;`;

  const NEW_MSG_TYPE = `const message_type = payload.message_type;
const created_at = payload.created_at;

// Early exit: outgoing/activity messages are SofIA's own responses
// Stops execution after 3 nodes instead of running 9 before IsUserMessage filter
if (message_type === 'outgoing' || message_type === 'activity') {
  return [];
}`;

  if (!code.includes(OLD_MSG_TYPE)) {
    throw new Error("FIX: message_type line not found in Validar Input");
  }
  code = code.replace(OLD_MSG_TYPE, NEW_MSG_TYPE);
  console.log("FIX applied: early exit for outgoing/activity messages");

  node.parameters.jsCode = code;

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
  const node2 = wf2.nodes.find((n) => n.name === "Validar Input");
  const code2 = node2.parameters.jsCode;
  console.log("\nVerification:");
  console.log("  Early exit present:", code2.includes("message_type === 'outgoing'") ? "✅" : "❌");
  console.log("  patch_v35 complete.");
}

main().catch((e) => {
  console.error("PATCH FAILED:", e.message);
  process.exit(1);
});
