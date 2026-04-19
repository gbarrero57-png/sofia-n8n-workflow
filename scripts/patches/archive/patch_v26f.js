#!/usr/bin/env node
/**
 * patch_v26f.js
 * Fix _HUMAN handler in Demo Flow Engine:
 * Currently just returns {intent: "HUMAN"} with no user message and no status change.
 * Fix: send handoff text + toggle conversation to pending so human agents see it.
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
      headers: { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 300)}`));
        else resolve(JSON.parse(data));
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

  const nodeIdx = wf.nodes.findIndex((n) => n.name === "Responder Demo");
  if (nodeIdx === -1) throw new Error("Node 'Responder Demo' not found");

  let code = wf.nodes[nodeIdx].parameters.jsCode;
  console.log("Code length:", code.length);

  // ── OLD _HUMAN block (no-op) ─────────────────────────────────────────────
  const OLD_HUMAN = `if (action === "_HUMAN") {
    return [{ json: Object.assign({}, ctx, { intent: "HUMAN", classified_by: "DF_ACTION_HUMAN", skip_ai: true }) }];
  }`;

  if (!code.includes(OLD_HUMAN)) {
    throw new Error("Cannot find old _HUMAN block. Current _HUMAN block:\n" +
      code.substring(code.indexOf('"_HUMAN"') - 20, code.indexOf('"_HUMAN"') + 200));
  }

  // ── NEW _HUMAN block: sends message + sets conversation to pending ────────
  const NEW_HUMAN = `if (action === "_HUMAN") {
    await transitionToNode.call(this, null);
    await sendText.call(this, "\uD83D\uDC64 \u00a1Claro! Un asesor de SofIA AI se pondr\u00e1 en contacto contigo en breve para resolver todas tus dudas.\n\n\u00a1Gracias por tu inter\u00e9s!");
    try {
      await this.helpers.httpRequest({
        method: "POST",
        url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/toggle_status",
        headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "pending" }),
        json: false
      });
    } catch(e) { console.error("_HUMAN toggle status error:", e.message); }
    // Private note so asesor has context
    try {
      await this.helpers.httpRequest({
        method: "POST",
        url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/messages",
        headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
        body: JSON.stringify({ content: "\uD83E\uDD1D LEAD SOLICITA ASESOR (desde demo SofIA)\nContacto: " + (ctx.contact_phone || ctx.sender_name || "desconocido"), message_type: "outgoing", private: true }),
        json: false
      });
    } catch(e) {}
    return [{ json: Object.assign({}, ctx, { intent: "SUBMENU_AWAIT", classified_by: "DF_ACTION_HUMAN_SENT", skip_ai: true }) }];
  }`;

  const newCode = code.replace(OLD_HUMAN, NEW_HUMAN);
  if (newCode === code) throw new Error("Replace was a no-op");
  if (!newCode.includes("DF_ACTION_HUMAN_SENT")) throw new Error("Missing DF_ACTION_HUMAN_SENT in output");

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
  console.log("Upload:", result.id, result.name, "active:", result.active);

  try {
    await apiRequest("POST", `/api/v1/workflows/${WF_ID}/activate`);
    console.log("Re-activated.");
  } catch (e) {
    console.warn("Re-activate warning:", e.message);
  }

  console.log("\n✅ patch_v26f applied!");
  console.log("   _HUMAN: now sends message + toggles conversation to pending + private note");
}

main().catch((e) => {
  console.error("PATCH FAILED:", e.message);
  process.exit(1);
});
