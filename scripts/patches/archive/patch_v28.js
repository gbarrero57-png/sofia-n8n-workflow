#!/usr/bin/env node
/**
 * patch_v28.js — Fix 4 bugs found in screenshot testing
 *
 * FIX 1 (CRITICAL): Check Slot Confirmation State — add SLOT_LP_BTN to
 *   slot_confirmation_pending whitelist. Without this, slot LP selections
 *   route to "Explicar Agendamiento" demo lead capture instead of confirming.
 *
 * FIX 2 (CRITICAL): Pre-Clasificador — GREETING override before 0b booking
 *   funnel state check. "hola" with stale awaiting_service label was routing
 *   to BOOKING_SERVICE → T03 loop. Now clear greetings go to GREETING always.
 *
 * FIX 3: Seleccionar 3 Mejores Slots — preferred_dow is an ARRAY [1] from
 *   Resolver Booking Step Case A, but comparison used strict ===. All scores
 *   were 0 → pref_note = "El lunes no hay disponibilidad" even with slots.
 *
 * FIX 4: Enviar Demo Followup — clear ALL booking funnel labels after
 *   successful booking so the next conversation starts clean.
 */

const https = require("https");

const N8N_BASE = "https://workflows.n8n.redsolucionesti.com";
const N8N_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q";
const WF_ID    = "37SLdWISQLgkHeXk";

function n8nReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(N8N_BASE + path);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url.hostname, port: 443,
      path: url.pathname + url.search, method,
      headers: { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" }
    };
    const req = https.request(opts, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => {
        if (res.statusCode >= 400) reject(new Error("HTTP " + res.statusCode + ": " + d.substring(0, 300)));
        else { try { resolve(JSON.parse(d)); } catch(e) { resolve(d); } }
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  console.log("Fetching workflow...");
  const wf = await n8nReq("GET", "/api/v1/workflows/" + WF_ID);

  // ────────────────────────────────────────────────────────────────────────────
  // FIX 1: Check Slot Confirmation State — add SLOT_LP_BTN to whitelist
  // ────────────────────────────────────────────────────────────────────────────
  {
    const idx = wf.nodes.findIndex(n => n.name === "Check Slot Confirmation State");
    if (idx === -1) throw new Error("Check Slot Confirmation State not found");
    let code = wf.nodes[idx].parameters.jsCode;

    const OLD = `    slot_confirmation_pending: awaiting && (
      $json.classified_by === 'SLOT_CONFIRMATION_DETECTOR' ||
      $json.classified_by === 'SLOT_AFFIRMATION_DETECTOR' ||
      $json.classified_by === 'DAY_CHANGE_DETECTOR'
    ),`;

    const NEW = `    slot_confirmation_pending: awaiting && (
      $json.classified_by === 'SLOT_CONFIRMATION_DETECTOR' ||
      $json.classified_by === 'SLOT_AFFIRMATION_DETECTOR' ||
      $json.classified_by === 'DAY_CHANGE_DETECTOR' ||
      $json.classified_by === 'SLOT_LP_BTN' ||
      $json.classified_by === 'SLOT_BTN_LABEL_DETECTOR'
    ),`;

    if (!code.includes(OLD.substring(0, 60))) throw new Error("FIX 1 anchor not found in Check Slot Confirmation State");
    wf.nodes[idx].parameters.jsCode = code.replace(OLD, NEW);
    console.log("✅ FIX 1: SLOT_LP_BTN added to slot_confirmation_pending whitelist");
  }

  // ────────────────────────────────────────────────────────────────────────────
  // FIX 2: Pre-Clasificador — GREETING override before 0b booking funnel check
  // ────────────────────────────────────────────────────────────────────────────
  {
    const idx = wf.nodes.findIndex(n => n.name === "Pre-Clasificador Keywords");
    if (idx === -1) throw new Error("Pre-Clasificador Keywords not found");
    let code = wf.nodes[idx].parameters.jsCode;

    // Insert BEFORE the 0b BOOKING FUNNEL STATE check
    const OLD_0B_HEADER = "// 0b. BOOKING FUNNEL STATE";
    if (!code.includes(OLD_0B_HEADER)) throw new Error("FIX 2: 0b header not found");

    const GREETING_OVERRIDE = `// 0a. GREETING OVERRIDE — short greeting resets booking funnel (stale labels)
// Must be before 0b so "hola" with awaiting_service doesn't route to T03
var _isShortGreeting = message.length <= 30 && /^(hola|hello|hi|buenos|buenas|inicio|empezar|start|menu|men\u00fa|bienvenido|buenas?\s+d[ia]|bienvenid)\b/i.test(message);
if (_isShortGreeting) {
  return [{ json: Object.assign({}, $json, { intent: "GREETING", confidence: "high", classified_by: "GREETING_OVERRIDE", skip_ai: true }) }];
}
`;

    wf.nodes[idx].parameters.jsCode = code.replace(OLD_0B_HEADER, GREETING_OVERRIDE + OLD_0B_HEADER);
    console.log("✅ FIX 2: GREETING override added before 0b check in Pre-Clasificador");
  }

  // ────────────────────────────────────────────────────────────────────────────
  // FIX 3: Seleccionar 3 Mejores Slots — handle preferred_dow as array
  // ────────────────────────────────────────────────────────────────────────────
  {
    const idx = wf.nodes.findIndex(n => n.name === "Seleccionar 3 Mejores Slots");
    if (idx === -1) throw new Error("Seleccionar 3 Mejores Slots not found");
    let code = wf.nodes[idx].parameters.jsCode;

    // Fix 1: scoring comparison uses preferred_dow directly (may be array [1])
    const OLD_SCORE = `const preferred_dow  = $json.preferred_dow;
const pref_h_start   = $json.preferred_hour_start;
const pref_h_end     = $json.preferred_hour_end;`;

    const NEW_SCORE = `// preferred_dow may be an array [dow] (from Resolver Booking Step Case A) or number
const _rawPrefDow   = $json.preferred_dow;
const preferred_dow  = Array.isArray(_rawPrefDow) ? _rawPrefDow[0] : _rawPrefDow;
const pref_h_start   = $json.preferred_hour_start;
const pref_h_end     = $json.preferred_hour_end;`;

    if (!code.includes(OLD_SCORE.substring(0, 40))) throw new Error("FIX 3 scoring anchor not found");
    code = code.replace(OLD_SCORE, NEW_SCORE);

    // Fix 2: pref_note condition also uses correct var now (preferred_dow is normalized)
    // The pref_note condition is fine since preferred_dow is now a number
    wf.nodes[idx].parameters.jsCode = code;
    console.log("✅ FIX 3: preferred_dow array normalization in Seleccionar 3 Mejores Slots");
  }

  // ────────────────────────────────────────────────────────────────────────────
  // FIX 4: Enviar Demo Followup — clear all booking funnel labels after booking
  // ────────────────────────────────────────────────────────────────────────────
  {
    const idx = wf.nodes.findIndex(n => n.name === "Enviar Demo Followup");
    if (idx === -1) throw new Error("Enviar Demo Followup not found");
    let code = wf.nodes[idx].parameters.jsCode;

    const OLD_RETURN = "return [{ json: ctx }];";
    if (!code.includes(OLD_RETURN)) throw new Error("FIX 4 return anchor not found in Enviar Demo Followup");

    const CLEAR_LABELS = `// Clear ALL booking funnel labels so the next conversation starts clean
try {
  var _convLabelsClean = (ctx.raw_payload && ctx.raw_payload.conversation && ctx.raw_payload.conversation.labels) || [];
  var _bookingLabels = ["awaiting_service", "awaiting_time_pref", "awaiting_day_choice", "awaiting_slot", "awaiting_day_lp", "demo_capture"];
  var _cleanedLabels = _convLabelsClean.filter(function(l) {
    return !_bookingLabels.includes(l) && !l.startsWith("awaiting_") && !l.startsWith("df_");
  });
  var _bcCleanup = ctx.bot_config || {};
  if (_bcCleanup.chatwoot_api_token && ctx.account_id && ctx.conversation_id) {
    await this.helpers.httpRequest({
      method: "POST",
      url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/labels",
      headers: { "api_access_token": _bcCleanup.chatwoot_api_token, "Content-Type": "application/json" },
      body: JSON.stringify({ labels: _cleanedLabels }),
      json: false
    });
    await this.helpers.httpRequest({
      method: "PATCH",
      url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id,
      headers: { "api_access_token": _bcCleanup.chatwoot_api_token, "Content-Type": "application/json" },
      body: JSON.stringify({ custom_attributes: { booking_funnel_state: null, booking_service: null } }),
      json: false
    });
  }
} catch(e) { /* non-fatal cleanup */ }
`;

    wf.nodes[idx].parameters.jsCode = code.replace(OLD_RETURN, CLEAR_LABELS + OLD_RETURN);
    console.log("✅ FIX 4: Booking funnel labels cleared after successful booking in Enviar Demo Followup");
  }

  // ── PUT back ──────────────────────────────────────────────────────────────
  const payload = {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings || {}, staticData: wf.staticData || null
  };

  console.log("\nUploading workflow...");
  const result = await n8nReq("PUT", "/api/v1/workflows/" + WF_ID, payload);
  console.log("Upload:", result.id, result.name, "active:", result.active);

  try {
    await n8nReq("POST", "/api/v1/workflows/" + WF_ID + "/activate");
    console.log("Re-activated.");
  } catch(e) { console.warn("Re-activate:", e.message); }

  console.log("\n✅ patch_v28 complete!");
  console.log("   1. slot_1..slot_3 LP buttons now confirm appointment (not demo lead capture)");
  console.log("   2. 'hola' always routes to GREETING regardless of stale labels");
  console.log("   3. Slot availability message no longer shows false 'no disponibilidad' note");
  console.log("   4. Booking funnel labels cleared after confirmed appointment");
}

main().catch(e => {
  console.error("PATCH FAILED:", e.message);
  process.exit(1);
});
