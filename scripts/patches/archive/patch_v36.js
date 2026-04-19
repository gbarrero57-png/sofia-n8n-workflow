/**
 * patch_v36.js — conversation_state: single source of truth for booking/demo state
 *
 * PROBLEM: Conversation state is tracked in 3 places simultaneously:
 *   - Chatwoot labels: awaiting_slot, awaiting_day_choice, df_*
 *   - custom_attributes.booking_funnel_state: awaiting_time_pref, awaiting_day_choice, awaiting_slot
 *   - Private notes: SOFIA_SLOTS:[...], SOFIA_DAYS:[...]
 *
 * When these desync (timing, duplicate webhooks), Pre-Clasificador mis-routes.
 *
 * FIX: Add custom_attributes.conversation_state as the canonical state field.
 *   Values: 'idle' | 'awaiting_day' | 'awaiting_slot' | 'demo'
 *
 * CHANGES:
 *   1. Generar Texto Menu — PATCH conversation_state='idle' on every GREETING
 *   2. Actualizar Attributes Éxito — add conversation_state='idle' to existing PATCH
 *   3. Marcar Esperando Confirmación — PATCH conversation_state='awaiting_slot'
 *   4. Resolver Booking Step — add conversation_state to saveToChat() calls
 *   5. Pre-Clasificador — use conversation_state as PRIMARY signal (labels as fallback)
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

  // Helper to find and patch a node
  function getNode(name) {
    const n = wf.nodes.find((n) => n.name === name);
    if (!n) throw new Error(`Node not found: ${name}`);
    return n;
  }

  // ── FIX 1: Generar Texto Menu — reset conversation_state on GREETING ─────
  {
    const node = getNode("Generar Texto Menu");
    let code = node.parameters.jsCode;

    const OLD =
      `} catch(e) { /* non-fatal — continue showing menu */ }

return [{ json: Object.assign({}, ctx, { menu_text: menuText, menu_options: options, _last_message_was_menu: true }) }];`;

    const NEW =
      `} catch(e) { /* non-fatal — continue showing menu */ }

// Reset conversation_state to idle (single source of truth)
try {
  await this.helpers.httpRequest({
    method: "PATCH",
    url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id,
    headers: { "api_access_token": $node["Merge Clinic Data"].json.chatwoot_api_token, "Content-Type": "application/json" },
    body: { custom_attributes: { conversation_state: "idle" } },
    json: true
  });
} catch(e) { /* non-fatal */ }

return [{ json: Object.assign({}, ctx, { menu_text: menuText, menu_options: options, _last_message_was_menu: true }) }];`;

    if (!code.includes(OLD)) throw new Error("FIX 1: anchor not found in Generar Texto Menu");
    node.parameters.jsCode = code.replace(OLD, NEW);
    console.log("FIX 1 applied: conversation_state=idle on GREETING");
  }

  // ── FIX 2: Actualizar Attributes Éxito — add conversation_state=idle ─────
  {
    const node = getNode("Actualizar Attributes Éxito");
    let code = node.parameters.jsCode;

    const OLD =
      `      custom_attributes: {
        sofia_phase: 'PHASE_4_COMPLETE',
        awaiting_slot_confirmation: 'false',
        appointment_confirmed: 'true',
        bot_interaction_count: (ctx.bot_interaction_count || 0) + 1
      }`;

    const NEW =
      `      custom_attributes: {
        sofia_phase: 'PHASE_4_COMPLETE',
        awaiting_slot_confirmation: 'false',
        appointment_confirmed: 'true',
        bot_interaction_count: (ctx.bot_interaction_count || 0) + 1,
        conversation_state: 'idle'
      }`;

    if (!code.includes(OLD)) throw new Error("FIX 2: custom_attributes block not found in Actualizar Attributes Éxito");
    node.parameters.jsCode = code.replace(OLD, NEW);
    console.log("FIX 2 applied: conversation_state=idle on booking success");
  }

  // ── FIX 3: Marcar Esperando Confirmación — set conversation_state ─────────
  {
    const node = getNode("Marcar Esperando Confirmación");
    let code = node.parameters.jsCode;

    // After the labels POST, add a PATCH for conversation_state
    const OLD =
      `    body: { labels: ['awaiting_slot'] }
  });
} catch(e) {
  console.error(JSON.stringify({ ts: new Date().toISOString(), event: 'LABEL_ERROR', error: e.message }));
}

const slots = ctx.selected_slots || [];`;

    const NEW =
      `    body: { labels: ['awaiting_slot'] }
  });
} catch(e) {
  console.error(JSON.stringify({ ts: new Date().toISOString(), event: 'LABEL_ERROR', error: e.message }));
}

// Set conversation_state = awaiting_slot (single source of truth)
try {
  await this.helpers.httpRequest({
    method: 'PATCH',
    url: baseUrl + '/conversations/' + conversation_id,
    headers: headers,
    body: { custom_attributes: { conversation_state: 'awaiting_slot' } }
  });
} catch(e) {
  console.error(JSON.stringify({ ts: new Date().toISOString(), event: 'STATE_UPDATE_ERROR', error: e.message }));
}

const slots = ctx.selected_slots || [];`;

    if (!code.includes(OLD)) throw new Error("FIX 3: labels block not found in Marcar Esperando Confirmación");
    node.parameters.jsCode = code.replace(OLD, NEW);
    console.log("FIX 3 applied: conversation_state=awaiting_slot when slot picker shown");
  }

  // ── FIX 4a: Resolver Booking Step — Case A (day chosen) ──────────────────
  {
    const node = getNode("Resolver Booking Step");
    let code = node.parameters.jsCode;

    // Case A: saveToChat({ booking_funnel_state: "awaiting_slot" })
    const OLD_A =
      `await saveToChat({ booking_funnel_state: "awaiting_slot" });
    // Remove awaiting_day_choice label, add awaiting_slot`;

    const NEW_A =
      `await saveToChat({ booking_funnel_state: "awaiting_slot", conversation_state: "awaiting_slot" });
    // Remove awaiting_day_choice label, add awaiting_slot`;

    if (!code.includes(OLD_A)) throw new Error("FIX 4a: Case A saveToChat not found in Resolver Booking Step");
    code = code.replace(OLD_A, NEW_A);
    console.log("FIX 4a applied: conversation_state=awaiting_slot on day chosen");

    // Case B (day picker shown): saveToChat({ booking_funnel_state: "awaiting_day_choice", ... })
    const OLD_B =
      `await saveToChat({ booking_funnel_state: "awaiting_day_choice", booking_service: ctx._booking_service || ctx._bfSvc || "" });`;

    const NEW_B =
      `await saveToChat({ booking_funnel_state: "awaiting_day_choice", conversation_state: "awaiting_day", booking_service: ctx._booking_service || ctx._bfSvc || "" });`;

    if (!code.includes(OLD_B)) throw new Error("FIX 4b: Case B saveToChat not found in Resolver Booking Step");
    code = code.replace(OLD_B, NEW_B);
    console.log("FIX 4b applied: conversation_state=awaiting_day when day picker shown");

    node.parameters.jsCode = code;
  }

  // ── FIX 5: Pre-Clasificador — conversation_state as primary signal ─────────
  {
    const node = getNode("Pre-Clasificador Keywords");
    let code = node.parameters.jsCode;

    // Replace early _inDayChoice/_inSlotChoice definitions (now after convLabels, post patch_v34)
    const OLD_EARLY =
      `// ── Early context flags (must be before any pos_N routing) ──────────────────
var _inDayChoice = convLabels.includes("awaiting_day_choice") ||
  (($json.raw_payload && $json.raw_payload.conversation &&
    $json.raw_payload.conversation.custom_attributes &&
    $json.raw_payload.conversation.custom_attributes.booking_funnel_state) === "awaiting_day_choice");
var _inSlotChoice = convLabels.includes("awaiting_slot");`;

    const NEW_EARLY =
      `// ── Early context flags (must be before any pos_N routing) ──────────────────
// conversation_state = single source of truth (set by state nodes, patch_v36)
// Labels are kept as fallback for backward compatibility
var _convState = ($json.raw_payload && $json.raw_payload.conversation &&
  $json.raw_payload.conversation.custom_attributes &&
  $json.raw_payload.conversation.custom_attributes.conversation_state) || null;
var _inSlotChoice = _convState === 'awaiting_slot' || convLabels.includes("awaiting_slot");
var _inDayChoice = _convState === 'awaiting_day' ||
  convLabels.includes("awaiting_day_choice") ||
  (($json.raw_payload && $json.raw_payload.conversation &&
    $json.raw_payload.conversation.custom_attributes &&
    $json.raw_payload.conversation.custom_attributes.booking_funnel_state) === "awaiting_day_choice");`;

    if (!code.includes(OLD_EARLY)) throw new Error("FIX 5: early flags block not found in Pre-Clasificador");
    node.parameters.jsCode = code.replace(OLD_EARLY, NEW_EARLY);
    console.log("FIX 5 applied: Pre-Clasificador uses conversation_state as primary signal");
  }

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
  console.log("Workflow activated.");

  // Verify
  const wf2 = await apiRequest("GET", "/api/v1/workflows/37SLdWISQLgkHeXk");
  const checks = {
    "Generar Texto Menu": (n) => n.parameters.jsCode.includes("conversation_state: \"idle\""),
    "Actualizar Attributes Éxito": (n) => n.parameters.jsCode.includes("conversation_state: 'idle'"),
    "Marcar Esperando Confirmación": (n) => n.parameters.jsCode.includes("conversation_state: 'awaiting_slot'"),
    "Resolver Booking Step": (n) => n.parameters.jsCode.includes("conversation_state: \"awaiting_day\"") && n.parameters.jsCode.includes("conversation_state: \"awaiting_slot\""),
    "Pre-Clasificador Keywords": (n) => n.parameters.jsCode.includes("_convState === 'awaiting_slot'"),
  };

  console.log("\nVerification:");
  let allOk = true;
  for (const [name, check] of Object.entries(checks)) {
    const n2 = wf2.nodes.find((n) => n.name === name);
    const ok = n2 && check(n2);
    console.log(`  ${name}: ${ok ? "✅" : "❌"}`);
    if (!ok) allOk = false;
  }
  console.log(allOk ? "\npatch_v36 complete ✅" : "\npatch_v36 PARTIAL — check failures above ❌");
}

main().catch((e) => {
  console.error("PATCH FAILED:", e.message);
  process.exit(1);
});
