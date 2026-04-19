#!/usr/bin/env node
/**
 * patch_v26d.js
 * Fix _CREATE_EVENT and add _HUMAN handler in "Responder Demo" node
 * - _CREATE_EVENT: sends T02 service picker directly via Twilio API
 * - _HUMAN: sends handoff message + sets conversation to pending
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

  const nodeIdx = wf.nodes.findIndex((n) => n.name === "Responder Demo");
  if (nodeIdx === -1) throw new Error("Node 'Responder Demo' not found");

  let code = wf.nodes[nodeIdx].parameters.jsCode;
  console.log("Code length:", code.length);

  // ── Locate the old _CREATE_EVENT block ──────────────────────────────────
  // Expected (lines 232-235):
  //   if (action === "_CREATE_EVENT") {
  //     await transitionToNode.call(this, null); // clear df_* state
  //     return [{ json: Object.assign({}, ctx, { intent: "CREATE_EVENT", classified_by: "DF_ACTION_CREATE_EVENT", skip_ai: false }) }];
  //   }
  const OLD_ANCHOR = 'if (action === "_CREATE_EVENT") {';
  const anchorIdx = code.indexOf(OLD_ANCHOR);
  if (anchorIdx === -1) throw new Error("Could not find _CREATE_EVENT block — anchor not found");

  // Find closing brace of this if block
  let braceDepth = 0;
  let blockStart = anchorIdx;
  let blockEnd = -1;
  for (let i = anchorIdx; i < code.length; i++) {
    if (code[i] === "{") braceDepth++;
    else if (code[i] === "}") {
      braceDepth--;
      if (braceDepth === 0) {
        blockEnd = i + 1;
        break;
      }
    }
  }
  if (blockEnd === -1) throw new Error("Could not find end of _CREATE_EVENT block");

  const oldBlock = code.slice(blockStart, blockEnd);
  console.log("OLD _CREATE_EVENT block found (" + oldBlock.length + " chars):");
  console.log(oldBlock.substring(0, 200));

  // ── Check if _HUMAN already exists ──────────────────────────────────────
  const hasHuman = code.includes('action === "_HUMAN"');
  console.log("Has _HUMAN handler:", hasHuman);

  // ── Build replacement ────────────────────────────────────────────────────
  const HUMAN_BLOCK = `if (action === "_HUMAN") {
    await transitionToNode.call(this, null);
    await sendText.call(this, "\\uD83D\\uDC64 En un momento un asesor humano te atender\\u00E1. \\u00A1Gracias por tu inter\\u00E9s en SofIA!");
    try {
      await this.helpers.httpRequest({
        method: "POST",
        url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/toggle_status",
        headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "pending" }),
        json: false
      });
    } catch(e) { console.error("_HUMAN toggle status error:", e.message); }
    return [{ json: Object.assign({}, ctx, { intent: "HUMAN", classified_by: "DF_ACTION_HUMAN", skip_ai: true }) }];
  }`;

  const CREATE_EVENT_BLOCK = `if (action === "_CREATE_EVENT") {
    await transitionToNode.call(this, null);
    var t02Sid = botConfig.twilio_booking_service_sid;
    if (t02Sid && ctx.contact_phone) {
      var toNum = ctx.contact_phone;
      if (!toNum.startsWith("whatsapp:")) toNum = "whatsapp:" + toNum;
      var authB64 = Buffer.from(botConfig.twilio_account_sid + ":" + botConfig.twilio_auth_token).toString("base64");
      var t02Parts = [
        "From=" + encodeURIComponent(botConfig.twilio_from),
        "To=" + encodeURIComponent(toNum),
        "ContentSid=" + encodeURIComponent(t02Sid)
      ];
      try {
        await this.helpers.httpRequest({
          method: "POST",
          url: "https://api.twilio.com/2010-04-01/Accounts/" + botConfig.twilio_account_sid + "/Messages.json",
          headers: { "Authorization": "Basic " + authB64, "Content-Type": "application/x-www-form-urlencoded" },
          body: t02Parts.join("&")
        });
      } catch(e) { console.error("_CREATE_EVENT Twilio send error:", e.message); }
    } else {
      await sendText.call(this, "\\uD83D\\uDCC5 \\u00BFQu\\u00E9 tipo de servicio necesitas?\\n\\n1. Limpieza dental\\n2. Consulta general\\n3. Ortodoncia\\n4. Blanqueamiento\\n5. Urgencia");
    }
    try {
      await this.helpers.httpRequest({
        method: "PATCH",
        url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id,
        headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
        body: JSON.stringify({ custom_attributes: { booking_funnel_state: "awaiting_service" } }),
        json: false
      });
      var bfLabels = convLabels.filter(function(l) { return !l.startsWith("df_") && l !== "awaiting_service"; });
      bfLabels.push("awaiting_service");
      await setLabels.call(this, bfLabels);
    } catch(e) { console.error("_CREATE_EVENT label/attr error:", e.message); }
    return [{ json: Object.assign({}, ctx, { intent: "SUBMENU_AWAIT", classified_by: "DF_ACTION_CREATE_EVENT_SENT", skip_ai: true }) }];
  }`;

  // Build replacement: if no _HUMAN, prepend it before _CREATE_EVENT
  const replacement = hasHuman
    ? CREATE_EVENT_BLOCK
    : HUMAN_BLOCK + "\n  " + CREATE_EVENT_BLOCK;

  const newCode = code.slice(0, blockStart) + replacement + code.slice(blockEnd);

  // Quick sanity: parse check via JSON round-trip (can't eval, but check length grew)
  console.log("New code length:", newCode.length, "(was:", code.length + ")");
  if (newCode.length < code.length) throw new Error("New code shorter than old — aborting");

  // Verify new code contains expected markers
  if (!newCode.includes("DF_ACTION_CREATE_EVENT_SENT")) throw new Error("New code missing DF_ACTION_CREATE_EVENT_SENT");
  if (!newCode.includes("awaiting_service")) throw new Error("New code missing awaiting_service");
  console.log("Sanity checks passed.");

  // ── PUT back ─────────────────────────────────────────────────────────────
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

  // Re-activate
  try {
    await apiRequest("POST", `/api/v1/workflows/${WF_ID}/activate`);
    console.log("Workflow re-activated.");
  } catch (e) {
    console.warn("Re-activate warning (may already be active):", e.message);
  }

  console.log("\n✅ patch_v26d applied successfully!");
  console.log("   _HUMAN handler:", hasHuman ? "already existed" : "added fresh");
  console.log("   _CREATE_EVENT: now sends T02 + sets awaiting_service label");
}

main().catch((e) => {
  console.error("PATCH FAILED:", e.message);
  process.exit(1);
});
