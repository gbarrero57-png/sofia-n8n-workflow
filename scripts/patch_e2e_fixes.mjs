/**
 * patch_e2e_fixes.mjs — E2E coherence fixes post-cancel/demo flow
 *
 * Bug 1: Double confirmation (Twilio T09 + Chatwoot text = 2 WhatsApp msgs)
 *   Fix: Confirmar al Paciente sets twilio_confirmation_sent=true when T09 sent.
 *        Enviar Confirmación (now Code node) skips Chatwoot send when that flag is set.
 *
 * Bug 2: Post-cancel "1" goes to demo flow (pos_1) because no state guards it.
 *   Fix: Remove numbered options from cancel success msg → natural language only.
 *
 * Bug 3: "jose perez, clinica covida" → bienvenida (df_lead_name label stale/missing).
 *   Fix: Responder Demo also saves lead_capture_state in custom_attributes.
 *        Pre-Clasificador uses custom_attributes as fallback when df_lead_* label missing.
 *
 * Run: node scripts/patch_e2e_fixes.mjs
 */

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const BASE   = 'https://workflows.n8n.redsolucionesti.com';
const WF_ID  = '37SLdWISQLgkHeXk';

// ─── Fetch fresh workflow ──────────────────────────────────────────────────
const wf = await fetch(`${BASE}/api/v1/workflows/${WF_ID}`, {
  headers: { 'X-N8N-API-KEY': API_KEY }
}).then(r => r.json());
if (!wf.nodes) { console.error('ERROR fetching:', JSON.stringify(wf).slice(0,200)); process.exit(1); }
console.log(`Workflow: ${wf.name} | ${wf.nodes.length} nodes`);
const getNode = name => wf.nodes.find(n => n.name === name);

// ══════════════════════════════════════════════════════════════════════════
// FIX 1a — Confirmar al Paciente: flag twilio_confirmation_sent in output
// ══════════════════════════════════════════════════════════════════════════
const confirmarNode = getNode('Confirmar al Paciente');
if (!confirmarNode) { console.error('"Confirmar al Paciente" not found'); process.exit(1); }

// The return statement always includes the json output. We inject the flag
// right after the T09 try block closes and before the final return.
const OLD_RETURN = `return [{
  json: Object.assign({}, original_data, {
    confirmation_message: confirmation_message,
    internal_note:        internal_note,
    appointment_id:       appt_id,
    event_created:        true
  })
}];`;

const NEW_RETURN = `// Track whether Twilio T09 was sent so Enviar Confirmación can skip duplicate
const _twilio_conf_sent = !!(botConfigConf.twilio_account_sid && botConfigConf.twilio_appointment_content_sid && original_data.contact_phone);

return [{
  json: Object.assign({}, original_data, {
    confirmation_message:      confirmation_message,
    internal_note:             internal_note,
    appointment_id:            appt_id,
    event_created:             true,
    twilio_confirmation_sent:  _twilio_conf_sent
  })
}];`;

if (!confirmarNode.parameters.jsCode.includes(OLD_RETURN)) {
  console.error('ERROR: return marker not found in Confirmar al Paciente');
  process.exit(1);
}
if (confirmarNode.parameters.jsCode.includes('twilio_confirmation_sent')) {
  console.log('⚠️  Confirmar al Paciente already patched — skipping');
} else {
  confirmarNode.parameters.jsCode = confirmarNode.parameters.jsCode.replace(OLD_RETURN, NEW_RETURN);
  console.log('✅ Patched: Confirmar al Paciente (twilio_confirmation_sent flag)');
}

// ══════════════════════════════════════════════════════════════════════════
// FIX 1b — Enviar Confirmación: convert HTTP Request → Code node
//           Skip Chatwoot send when T09 was already sent via Twilio
// ══════════════════════════════════════════════════════════════════════════
const enviarConfNode = getNode('Enviar Confirmación');
if (!enviarConfNode) { console.error('"Enviar Confirmación" not found'); process.exit(1); }

if (enviarConfNode.type === 'n8n-nodes-base.code') {
  console.log('⚠️  Enviar Confirmación already a Code node — skipping');
} else {
  enviarConfNode.type = 'n8n-nodes-base.code';
  enviarConfNode.typeVersion = 2;
  enviarConfNode.parameters = {
    jsCode: `// Enviar Confirmación — skip if Twilio T09 was already sent (avoids double WhatsApp msg)
const ctx = $input.first().json;
const botConfig = ctx.bot_config || {};

// If T09 template was sent inside Confirmar al Paciente, skip Chatwoot public send.
// For non-Twilio clinics, twilio_confirmation_sent is false → send via Chatwoot as usual.
if (ctx.twilio_confirmation_sent) {
  // T09 already delivered the confirmation to WhatsApp.
  // Just send an internal private note so agents can see it in Chatwoot.
  if (ctx.internal_note && botConfig.chatwoot_api_token && ctx.account_id && ctx.conversation_id) {
    try {
      await this.helpers.httpRequest({
        method: "POST",
        url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/messages",
        headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
        body: JSON.stringify({ content: ctx.internal_note, message_type: "outgoing", private: true }),
        json: false
      });
    } catch(_e) { /* non-critical */ }
  }
  return [$input.first()];
}

// No Twilio T09 — send public confirmation via Chatwoot (text goes via WhatsApp channel)
if (ctx.confirmation_message && botConfig.chatwoot_api_token && ctx.account_id && ctx.conversation_id) {
  await this.helpers.httpRequest({
    method: "POST",
    url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/messages",
    headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
    body: JSON.stringify({ content: ctx.confirmation_message, message_type: "outgoing", private: false }),
    json: false
  });
}

return [$input.first()];`
  };
  console.log('✅ Patched: Enviar Confirmación (HTTP Request → Code, conditional send)');
}

// ══════════════════════════════════════════════════════════════════════════
// FIX 2 — Formatear Citas: remove numbered menu from cancel success message
//          "1. Agendar nueva cita  2. Hablar con agente" caused ambiguous "1"
// ══════════════════════════════════════════════════════════════════════════
const formatearNode = getNode('Formatear Citas');
if (!formatearNode) { console.error('"Formatear Citas" not found'); process.exit(1); }

const OLD_CANCEL_OK = `"\\u2705 Tu cita del *" + fecha + "* a las *" + hora + "* ha sido cancelada exitosamente." +
          "\\n\\nEse horario queda disponible." +
          "\\n\\n*1.* Agendar nueva cita\\xa0\\xa0 *2.* Hablar con agente";`;

const NEW_CANCEL_OK = `"\\u2705 Tu cita del *" + fecha + "* a las *" + hora + "* ha sido cancelada exitosamente.\\n\\nEse horario queda disponible. Si quieres agendar una nueva cita escríbeme y con gusto te ayudo.";`;

if (!formatearNode.parameters.jsCode.includes(OLD_CANCEL_OK)) {
  // Try legacy pattern (from cancelar N branch)
  const OLD_CANCEL_OK_LEGACY = `"\\u2705 Cita del *" + fecha + "* a las *" + hora + "* cancelada exitosamente." +
        "\\n\\n*1.* Agendar nueva cita\\xa0\\xa0 *2.* Hablar con agente";`;
  if (!formatearNode.parameters.jsCode.includes(OLD_CANCEL_OK_LEGACY)) {
    console.log('⚠️  Cancel OK message pattern not found in Formatear Citas — may already be patched or changed');
  } else {
    formatearNode.parameters.jsCode = formatearNode.parameters.jsCode.replace(
      OLD_CANCEL_OK_LEGACY,
      `"\\u2705 Cita del *" + fecha + "* a las *" + hora + "* cancelada exitosamente.\\n\\nSi quieres agendar una nueva cita escríbeme cuando quieras.";`
    );
    console.log('✅ Patched: Formatear Citas (removed numbered options from cancel legacy branch)');
  }
} else if (formatearNode.parameters.jsCode.includes('Agendar nueva cita')) {
  formatearNode.parameters.jsCode = formatearNode.parameters.jsCode.replace(OLD_CANCEL_OK, NEW_CANCEL_OK);
  // Also fix legacy branch if present
  const LEGACY_OK = `"\\u2705 Cita del *" + fecha + "* a las *" + hora + "* cancelada exitosamente." +
        "\\n\\n*1.* Agendar nueva cita\\xa0\\xa0 *2.* Hablar con agente";`;
  if (formatearNode.parameters.jsCode.includes(LEGACY_OK)) {
    formatearNode.parameters.jsCode = formatearNode.parameters.jsCode.replace(
      LEGACY_OK,
      `"\\u2705 Cita del *" + fecha + "* a las *" + hora + "* cancelada exitosamente.\\n\\nSi quieres agendar una nueva cita escríbeme cuando quieras.";`
    );
    console.log('✅ Patched: Formatear Citas (removed numbered options from both cancel branches)');
  } else {
    console.log('✅ Patched: Formatear Citas (removed numbered options from main cancel branch)');
  }
} else {
  console.log('⚠️  Formatear Citas cancel message already patched — skipping');
}

// ══════════════════════════════════════════════════════════════════════════
// FIX 3a — Responder Demo: save lead_capture_state in custom_attributes
//           Provides a reliable fallback when df_lead_* label is stale
// ══════════════════════════════════════════════════════════════════════════
const demoNode = getNode('Responder Demo');
if (!demoNode) { console.error('"Responder Demo" not found'); process.exit(1); }

if (demoNode.parameters.jsCode.includes('lead_capture_state')) {
  console.log('⚠️  Responder Demo already has lead_capture_state — skipping fix 3a');
} else {
  // Inject a helper function to set lead_capture_state in custom_attributes.
  // We insert it right after the existing setLabels helper function definition.
  const LABELS_HELPER_END = `// ── Get demo flow state from labels (df_*) ───────────────────────────────`;

  const CA_HELPER = `// ── Save lead capture state in custom_attributes (fallback for stale labels) ──
const setLeadCaptureState = async function(state) {
  // state: 'asking_name' | 'asking_clinic' | 'asking_city' | null
  try {
    await this.helpers.httpRequest({
      method: "PATCH",
      url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id,
      headers: { "api_access_token": botConfig.chatwoot_api_token, "Content-Type": "application/json" },
      body: JSON.stringify({ custom_attributes: { lead_capture_state: state } }),
      json: false
    });
  } catch(_e) { /* non-critical */ }
};

`;

  if (!demoNode.parameters.jsCode.includes(LABELS_HELPER_END)) {
    console.error('ERROR: injection anchor not found in Responder Demo for fix 3a');
    process.exit(1);
  }
  demoNode.parameters.jsCode = demoNode.parameters.jsCode.replace(
    LABELS_HELPER_END,
    CA_HELPER + LABELS_HELPER_END
  );

  // Now inject setLeadCaptureState calls into handleLeadCapture branches.
  // Branch 1: !leadState — starting name collection
  const OLD_LC_NAME = `  await setLabels.call(this, newLabels);
    await sendText.call(this, "\\ud83d\\ude80 \\u00a1Perfecto! Para preparar tu demo personalizada necesito 3 datos r\\u00e1pidos.\\n\\nPrimero, \\u00bfc\\u00f3mo te llamas?");
    return [{ json: Object.assign({}, ctx, { intent: "SUBMENU_AWAIT", classified_by: "LEAD_CAPTURE_NAME_REQUESTED", skip_ai: true }) }];`;

  const NEW_LC_NAME = `  await setLabels.call(this, newLabels);
    await setLeadCaptureState.call(this, "asking_name");
    await sendText.call(this, "\\ud83d\\ude80 \\u00a1Perfecto! Para preparar tu demo personalizada necesito 3 datos r\\u00e1pidos.\\n\\nPrimero, \\u00bfc\\u00f3mo te llamas?");
    return [{ json: Object.assign({}, ctx, { intent: "SUBMENU_AWAIT", classified_by: "LEAD_CAPTURE_NAME_REQUESTED", skip_ai: true }) }];`;

  // Branch 2: df_lead_name — save name, ask clinic
  const OLD_LC_CLINIC = `  await setLabels.call(this, newLabels2);
    await sendText.call(this, "\\ud83d\\udc4b \\u00a1Hola, " + name.split(" ")[0] + "! \\u00bfC\\u00f3mo se llama tu cl\\u00ednica?");
    return [{ json: Object.assign({}, ctx, { intent: "SUBMENU_AWAIT", classified_by: "LEAD_CAPTURE_CLINIC_REQUESTED", lead_name: name, skip_ai: true }) }];`;

  const NEW_LC_CLINIC = `  await setLabels.call(this, newLabels2);
    await setLeadCaptureState.call(this, "asking_clinic");
    await sendText.call(this, "\\ud83d\\udc4b \\u00a1Hola, " + name.split(" ")[0] + "! \\u00bfC\\u00f3mo se llama tu cl\\u00ednica?");
    return [{ json: Object.assign({}, ctx, { intent: "SUBMENU_AWAIT", classified_by: "LEAD_CAPTURE_CLINIC_REQUESTED", lead_name: name, skip_ai: true }) }];`;

  // Branch 3: df_lead_clinic — save clinic, ask city
  const OLD_LC_CITY = `  await setLabels.call(this, newLabels3);
    await sendText.call(this, "\\ud83d\\udccd \\u00bfEn qu\\u00e9 ciudad est\\u00e1 " + clinicName + "? (o tu n\\u00famero de contacto si prefieres)");
    return [{ json: Object.assign({}, ctx, { intent: "SUBMENU_AWAIT", classified_by: "LEAD_CAPTURE_CITY_REQUESTED", lead_clinic: clinicName, skip_ai: true }) }];`;

  const NEW_LC_CITY = `  await setLabels.call(this, newLabels3);
    await setLeadCaptureState.call(this, "asking_city");
    await sendText.call(this, "\\ud83d\\udccd \\u00bfEn qu\\u00e9 ciudad est\\u00e1 " + clinicName + "? (o tu n\\u00famero de contacto si prefieres)");
    return [{ json: Object.assign({}, ctx, { intent: "SUBMENU_AWAIT", classified_by: "LEAD_CAPTURE_CITY_REQUESTED", lead_clinic: clinicName, skip_ai: true }) }];`;

  let patched3a = false;
  if (demoNode.parameters.jsCode.includes(OLD_LC_NAME)) {
    demoNode.parameters.jsCode = demoNode.parameters.jsCode.replace(OLD_LC_NAME, NEW_LC_NAME);
    patched3a = true;
  }
  if (demoNode.parameters.jsCode.includes(OLD_LC_CLINIC)) {
    demoNode.parameters.jsCode = demoNode.parameters.jsCode.replace(OLD_LC_CLINIC, NEW_LC_CLINIC);
    patched3a = true;
  }
  if (demoNode.parameters.jsCode.includes(OLD_LC_CITY)) {
    demoNode.parameters.jsCode = demoNode.parameters.jsCode.replace(OLD_LC_CITY, NEW_LC_CITY);
    patched3a = true;
  }

  // Also clear lead_capture_state when all data is collected (df_lead_phone branch)
  const OLD_LC_DONE = `    // Confirmation + transition to calendar booking
    await sendText.call(this, "\\u2705 \\u00a1Perfecto! Ahora elijamos el mejor d\\u00eda para tu demo personalizada de SofIA.");
    return await sendDemoBookingDayPicker.call(this, botConfig, ctx);`;

  const NEW_LC_DONE = `    // Confirmation + transition to calendar booking (clear lead_capture_state)
    await setLeadCaptureState.call(this, null);
    await sendText.call(this, "\\u2705 \\u00a1Perfecto! Ahora elijamos el mejor d\\u00eda para tu demo personalizada de SofIA.");
    return await sendDemoBookingDayPicker.call(this, botConfig, ctx);`;

  if (demoNode.parameters.jsCode.includes(OLD_LC_DONE)) {
    demoNode.parameters.jsCode = demoNode.parameters.jsCode.replace(OLD_LC_DONE, NEW_LC_DONE);
    patched3a = true;
  }

  if (patched3a) {
    console.log('✅ Patched: Responder Demo (lead_capture_state in custom_attributes)');
  } else {
    console.log('⚠️  Responder Demo: some branch patterns not found — check manually');
  }
}

// ══════════════════════════════════════════════════════════════════════════
// FIX 3b — Pre-Clasificador: fallback to custom_attributes.lead_capture_state
//           when df_lead_* label is stale/missing (race condition protection)
// ══════════════════════════════════════════════════════════════════════════
const preNode = getNode('Pre-Clasificador Keywords');
if (!preNode) { console.error('"Pre-Clasificador Keywords" not found'); process.exit(1); }

const OLD_DF_LEAD_CHECK = `var _dfLeadLabel = convLabels.find(function(l) { return l.startsWith("df_lead_"); });
// Guard: greetings always reset the flow even if stale df_lead_ label exists
if (_dfLeadLabel && !_isShortGreeting) {
  return [{ json: Object.assign({}, $json, { intent: "DEMO_FLOW", classified_by: "DF_LEAD_CAPTURE_STATE", skip_ai: true }) }];
}`;

const NEW_DF_LEAD_CHECK = `var _dfLeadLabel = convLabels.find(function(l) { return l.startsWith("df_lead_"); });
// Fallback: check custom_attributes.lead_capture_state when label is stale/missing
if (!_dfLeadLabel && !_isShortGreeting) {
  var _lcsCa = ($json.raw_payload && $json.raw_payload.conversation && $json.raw_payload.conversation.custom_attributes && $json.raw_payload.conversation.custom_attributes.lead_capture_state) || null;
  if (_lcsCa === "asking_name")   _dfLeadLabel = "df_lead_name";
  else if (_lcsCa === "asking_clinic") _dfLeadLabel = "df_lead_clinic";
  else if (_lcsCa === "asking_city")   _dfLeadLabel = "df_lead_phone";
}
// Guard: greetings always reset the flow even if stale df_lead_ label exists
if (_dfLeadLabel && !_isShortGreeting) {
  return [{ json: Object.assign({}, $json, { intent: "DEMO_FLOW", classified_by: "DF_LEAD_CAPTURE_STATE", skip_ai: true }) }];
}`;

if (!preNode.parameters.jsCode.includes(OLD_DF_LEAD_CHECK)) {
  console.log('⚠️  Pre-Clasificador df_lead check pattern not found — may already be patched');
} else if (preNode.parameters.jsCode.includes('lead_capture_state')) {
  console.log('⚠️  Pre-Clasificador already has lead_capture_state fallback — skipping');
} else {
  preNode.parameters.jsCode = preNode.parameters.jsCode.replace(OLD_DF_LEAD_CHECK, NEW_DF_LEAD_CHECK);
  console.log('✅ Patched: Pre-Clasificador Keywords (custom_attributes fallback for lead state)');
}

// ─── PUT workflow ──────────────────────────────────────────────────────────
console.log('\nSaving workflow to n8n...');
const r = await fetch(`${BASE}/api/v1/workflows/${WF_ID}`, {
  method: 'PUT',
  headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings, staticData: null })
});
const d = await r.json();
if (r.ok) {
  console.log(`\n✅ Workflow guardado: ${d.name} (${d.nodes?.length || '?'} nodes)`);
  console.log('   Fixes applied:');
  console.log('   1. Confirmar al Paciente → sets twilio_confirmation_sent flag');
  console.log('   2. Enviar Confirmación   → Code node, skips Chatwoot when T09 sent');
  console.log('   3. Formatear Citas       → removed "1. Agendar/2. Hablar" from cancel msg');
  console.log('   4. Responder Demo        → saves lead_capture_state in custom_attributes');
  console.log('   5. Pre-Clasificador      → fallback to custom_attributes for lead state');
} else {
  console.error('❌ Error guardando:', JSON.stringify(d).slice(0, 500));
  process.exit(1);
}
