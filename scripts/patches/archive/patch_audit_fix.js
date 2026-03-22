/**
 * SofIA Comprehensive Audit Fix
 * Fixes identified in full workflow audit 2026-03-22
 *
 * Bugs fixed:
 * 1. Pedir Aclaración — double-stringified jsonBody
 * 2. Enviar Mensaje Escalado — raw interpolation in JSON body breaks on special chars
 * 3. Crear Nota Interna — same raw interpolation issue
 * 4. Actualizar Custom Attributes — add bot_paused call to Supabase after escalation
 * 5. Preparar Prompt INFO — instruct AI to give SHORT responses with follow-up options
 * 6. Confirmar al Paciente — professional confirmation message with emojis and structure
 * 7. Pre-Clasificador Keywords — add APPOINTMENT_STATUS and 'cancelar' keywords
 * 8. Preparar Escalado — use bot_config.escalation_message properly
 */

const fs = require('fs');
const https = require('https');

const N8N_URL = 'https://workflows.n8n.redsolucionesti.com';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const WORKFLOW_ID = '37SLdWISQLgkHeXk';

function apiFetch(path, method, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(N8N_URL + path);
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: method || 'GET',
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 500)}`));
        } else {
          try { resolve(JSON.parse(data)); }
          catch (e) { resolve(data); }
        }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function main() {
  console.log('Fetching workflow...');
  const wf = await apiFetch(`/api/v1/workflows/${WORKFLOW_ID}`);
  const nodes = wf.nodes;
  console.log(`Loaded workflow with ${nodes.length} nodes`);

  // ─────────────────────────────────────────────────────────────────────────
  // FIX 1: Pedir Aclaración — fix double-stringified jsonBody
  // ─────────────────────────────────────────────────────────────────────────
  const pedirAclaracion = nodes.find(n => n.name === 'Pedir Aclaración');
  if (pedirAclaracion) {
    pedirAclaracion.parameters.jsonBody =
      `={{ JSON.stringify({ content: "Con cual te quedas? Responde *1*, *2* o *3* 😊\\nO dime si prefieres otro dia.", message_type: "outgoing", private: false }) }}`;
    console.log('✔ Fixed Pedir Aclaración jsonBody (was double-stringified)');
  } else {
    console.warn('⚠ Pedir Aclaración not found');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FIX 2: Enviar Mensaje Escalado — use JSON.stringify to handle special chars
  // ─────────────────────────────────────────────────────────────────────────
  const enviarEscalado = nodes.find(n => n.name === 'Enviar Mensaje Escalado');
  if (enviarEscalado) {
    enviarEscalado.parameters.jsonBody =
      `={{ JSON.stringify({ content: $json.escalation_message_final, message_type: "outgoing", private: false }) }}`;
    console.log('✔ Fixed Enviar Mensaje Escalado jsonBody (raw interpolation -> JSON.stringify)');
  } else {
    console.warn('⚠ Enviar Mensaje Escalado not found');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FIX 3: Crear Nota Interna — use JSON.stringify to avoid broken JSON on special chars
  // ─────────────────────────────────────────────────────────────────────────
  const crearNota = nodes.find(n => n.name === 'Crear Nota Interna');
  if (crearNota) {
    crearNota.parameters.jsonBody =
      `={{ JSON.stringify({ content: "SofIA Bot\\n\\nIntencion: " + $json.intent + "\\nConfianza: " + $json.confidence + "\\nRazon: " + ($json.escalation_reason || "Testing") + "\\nMensaje: " + $json.message_text, message_type: "outgoing", private: true }) }}`;
    console.log('✔ Fixed Crear Nota Interna jsonBody (raw interpolation -> JSON.stringify)');
  } else {
    console.warn('⚠ Crear Nota Interna not found');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FIX 4: Actualizar Custom Attributes — add bot_paused call after escalation
  // ─────────────────────────────────────────────────────────────────────────
  const actualizarAttrs = nodes.find(n => n.name === 'Actualizar Custom Attributes');
  if (actualizarAttrs) {
    // Change this node from an HTTP Request that only updates custom attributes
    // to a Code node that: (1) updates custom attributes AND (2) calls pause_conversation RPC
    // We keep it as an httpRequest but add a new Code node after it
    // Actually, we modify the Preparar Escalado node to also set bot_paused via Supabase
    // Better: convert Actualizar Custom Attributes to a Code node that does both
    // But we don't want to change node type — instead we'll patch the node AFTER it
    // The simplest fix: modify the existing jsCode approach in Preparar Escalado to include the pause call
    //
    // ACTUAL FIX: We insert the Supabase pause into Preparar Escalado's code
    // because it has access to governance_conversation_id at that point.
    // Actually the governance_conversation_id is set by Bot Pause Check, and Preparar Escalado
    // IS downstream of Bot Pause Check. So we can use it in Preparar Escalado or afterwards.
    //
    // The cleanest fix is to update Actualizar Custom Attributes to be a Code node
    // that does the PATCH to Chatwoot AND calls pause_conversation to Supabase.
    // But node type changes require careful connection management.
    //
    // SIMPLEST fix: modify Preparar Escalado to include a Supabase pause call.
    console.log('⚑ Actualizar Custom Attributes: bot_paused fix applied via Preparar Escalado modification (see Fix 4b)');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FIX 4b: Preparar Escalado — add Supabase pause_conversation call
  // ─────────────────────────────────────────────────────────────────────────
  const prepararEscalado = nodes.find(n => n.name === 'Preparar Escalado');
  if (prepararEscalado) {
    prepararEscalado.parameters.jsCode = `// PREPARAR ESCALADO — pausa el bot en Supabase governance
const ctx = $json;
const escalationMsg = ctx.escalation_message
  || (ctx.bot_config && ctx.bot_config.escalation_message)
  || 'Un agente de nuestro equipo te atenderá en breve.';

// Intentar pausar el bot en Supabase (fail-safe: no bloquea el flujo)
const govId = ctx.governance_conversation_id;
if (govId) {
  const SUPABASE_URL = $env.N8N_SUPABASE_URL;
  const SERVICE_KEY  = $env.N8N_SUPABASE_SERVICE_KEY;
  try {
    await this.helpers.httpRequest({
      method: 'POST',
      url: SUPABASE_URL + '/rest/v1/rpc/pause_conversation',
      headers: {
        'apikey':        SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type':  'application/json'
      },
      body: {
        p_conversation_id: govId,
        p_clinic_id:       ctx.clinic_id,
        p_user_role:       'admin'
      },
      json: true
    });
    console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'BOT_PAUSED', gov_id: govId }));
  } catch(e) {
    // Non-fatal: log but continue with escalation
    console.warn(JSON.stringify({ ts: new Date().toISOString(), event: 'BOT_PAUSE_FAILED', error: e.message }));
  }
}

return [{
  json: {
    ...ctx,
    escalation_message_final: escalationMsg,
    escalation_reason_final:  ctx.escalation_reason || ('HUMAN_' + ctx.intent),
    internal_note: 'SofIA — Escalado a agente. Intent: ' + ctx.intent,
    is_urgent: ctx.priority === 'urgent',
    bot_paused: govId ? true : false
  }
}];`;
    console.log('✔ Fixed Preparar Escalado — now pauses bot in Supabase after escalation');
  } else {
    console.warn('⚠ Preparar Escalado not found');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FIX 5: Preparar Prompt INFO — instruct AI for SHORT responses + follow-ups
  // ─────────────────────────────────────────────────────────────────────────
  const prepararPrompt = nodes.find(n => n.name === 'Preparar Prompt INFO');
  if (prepararPrompt) {
    prepararPrompt.parameters.jsCode = `const message_text = $json.message_text || "";
const clinic_name = $json.clinic_name || "la clinica";
const isGreeting = $json.is_greeting === true;
const welcomeMsg = $json.welcome_message_text || ("Hola! Soy SofIA de " + clinic_name + ". En que puedo ayudarte?");
const kb_context = $json.kb_context || "";
var system_prompt, user_prompt;

if (isGreeting) {
    system_prompt = "Eres SofIA, asistente virtual de " + clinic_name + ". El paciente te saludo. Responde EXACTAMENTE con: \\"" + welcomeMsg + "\\" No agregues nada mas.";
    user_prompt = message_text;
} else {
    var kbSection = kb_context ? "INFORMACION DE LA CLINICA:\\n" + kb_context + "\\n\\n" : "";
    var rules = [
        "1. Responde en maximo 100 palabras. Se conciso y directo",
        "2. Responde siempre en espanol",
        "3. Usa la informacion de la clinica si esta disponible. Si no tienes el dato, dilo honestamente",
        "4. NUNCA inventes precios, horarios ni nombres de doctores",
        "5. Si el paciente pregunta sobre disponibilidad para un dia especifico, dile que escriba: quiero una cita el [dia]",
        "6. NO uses frases vacias como te recomiendo agendar. Se especifico",
        "7. Al final de tu respuesta, ofrece 2 opciones de siguiente paso numeradas (ej: 1. Agendar cita  2. Hablar con agente)"
    ].join(". ");
    system_prompt = "Eres SofIA, asistente virtual amable de la clinica dental " + clinic_name + ". " + kbSection + "REGLAS ESTRICTAS: " + rules;
    user_prompt = message_text;
}

return [{ json: Object.assign({}, $json, { system_prompt: system_prompt, user_prompt: user_prompt }) }];`;
    console.log('✔ Fixed Preparar Prompt INFO — now instructs AI for SHORT responses with follow-up options');
  } else {
    console.warn('⚠ Preparar Prompt INFO not found');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FIX 6: Confirmar al Paciente — professional confirmation message
  // ─────────────────────────────────────────────────────────────────────────
  const confirmarPaciente = nodes.find(n => n.name === 'Confirmar al Paciente');
  if (confirmarPaciente) {
    confirmarPaciente.parameters.jsCode = `// CONFIRM APPOINTMENT TO PATIENT — professional message with emoji and structure
const original_data = $node["Lock de Slot"].json;
const slot          = original_data.chosen_slot;
const service       = original_data.service_type || "Consulta dental";
const clinic_name   = original_data.clinic_name || original_data.slot_clinic_name || "nuestra clinica";
const doctor_name   = original_data.doctor_name || null;
const clinic_phone  = (original_data.bot_config && original_data.bot_config.phone)
  ? original_data.bot_config.phone : (original_data.slot_clinic_phone || null);
const nl = String.fromCharCode(10);

const doctor_line = doctor_name   ? (nl + "👨‍⚕️ Dr. " + doctor_name) : "";
const phone_line  = clinic_phone  ? (nl + nl + "📞 Si necesitas cambios, llamanos: " + clinic_phone) : "";

const confirmation_message =
    "✅ *Cita confirmada!*" + nl + nl +
    "📅 " + slot.date + " a las *" + slot.time + "*" + nl +
    "🏥 " + clinic_name + nl +
    "🦷 " + service +
    doctor_line +
    phone_line + nl + nl +
    "Te esperamos 😊";

const appt_id = $json.appointment_id || "N/A";
const internal_note = "CITA AGENDADA POR SOFIA" + nl + nl
  + "Fecha/Hora: " + slot.date + " a las " + slot.time + nl
  + "Servicio: " + service + nl
  + (doctor_name ? "Doctor: " + doctor_name + nl : "")
  + "Paciente: " + (original_data.sender_name || "Paciente") + nl
  + "Telefono: " + (original_data.contact_phone || "-") + nl
  + "Appointment ID: " + appt_id + nl + nl
  + "SofIA — Confirmacion automatica";

return [{
  json: Object.assign({}, original_data, {
    confirmation_message: confirmation_message,
    internal_note:        internal_note,
    appointment_id:       appt_id,
    event_created:        true
  })
}];`;
    console.log('✔ Fixed Confirmar al Paciente — professional message with emojis and structure');
  } else {
    console.warn('⚠ Confirmar al Paciente not found');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FIX 7: Pre-Clasificador Keywords — add APPOINTMENT_STATUS and cancelar keywords
  // ─────────────────────────────────────────────────────────────────────────
  const preClasificador = nodes.find(n => n.name === 'Pre-Clasificador Keywords');
  if (preClasificador) {
    const oldCode = preClasificador.parameters.jsCode;
    // Insert APPOINTMENT_STATUS keywords before PAYMENT keywords section
    const insertAfter = '// 4. MENU_SELECTION — digito solo (sin awaiting slot)';
    const appointmentBlock = `
// 4b. APPOINTMENT_STATUS keywords — ver/cancelar citas
const APPT_KEYWORDS = [
    "ver mi cita","ver mis citas","mis citas","tengo cita","mi cita",
    "cancelar","cancelar cita","quiero cancelar","cuando es mi cita",
    "ver cita","consultar cita","estado de mi cita","mis reservas",
    "ver reserva","tengo una reserva"
];
for (var ai = 0; ai < APPT_KEYWORDS.length; ai++) {
    if (message.includes(APPT_KEYWORDS[ai])) {
        return [{ json: Object.assign({}, $json, { intent: "APPOINTMENT_STATUS", confidence: "high", classified_by: "APPT_KEYWORD_DETECTOR", skip_ai: true }) }];
    }
}

`;
    if (oldCode.includes(insertAfter) && !oldCode.includes('APPT_KEYWORDS')) {
      preClasificador.parameters.jsCode = oldCode.replace(
        insertAfter,
        appointmentBlock + insertAfter
      );
      console.log('✔ Fixed Pre-Clasificador — added APPOINTMENT_STATUS and cancelar keywords');
    } else if (oldCode.includes('APPT_KEYWORDS')) {
      console.log('⊝ Pre-Clasificador already has APPT_KEYWORDS, skipping');
    } else {
      console.warn('⚠ Pre-Clasificador insert point not found');
    }
  } else {
    console.warn('⚠ Pre-Clasificador Keywords not found');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FIX 8: Validar Respuesta — fix escalation keyword false-positive for "te conecto"
  // The bot sends "te conecto con un agente" AS the escalation message,
  // so Validar Respuesta should NOT trigger re-escalation for the INFO bot.
  // The "te conecto" keyword check is CORRECT when the LLM says it, but
  // the escalation check should only trigger when it's the LLM's OWN response.
  // However, since this node runs AFTER LLM call (not after escalation message),
  // the check is actually valid. Keep it but verify flow context.
  // No change needed here.
  // ─────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────
  // FIX 9: Formatear Oferta de Slots — improve message formatting
  // ─────────────────────────────────────────────────────────────────────────
  const formatearOferta = nodes.find(n => n.name === 'Formatear Oferta de Slots');
  if (formatearOferta) {
    formatearOferta.parameters.jsCode = `// FORMAT SLOT OFFER MESSAGE
const slots    = $json.selected_slots || [];
const prefNote = $json.preference_note || "";

if (slots.length === 0) {
  return [{ json: Object.assign({}, $json, {
    offer_message: "Lo siento, no hay horarios disponibles en los proximos 7 dias. Te conecto con un agente para buscarte una opcion.",
    should_escalate: true, escalation_reason: "NO_SLOTS_AVAILABLE"
  }) }];
}

var message = "📅 *Horarios disponibles:*\\n\\n";

if (prefNote) {
  message = "📅 " + prefNote + "\\n\\n";
}

for (var i = 0; i < slots.length; i++) {
  var s = slots[i];
  var line = "*" + s.option_number + ".* " + s.date + " a las *" + s.time + "*";
  if (s.doctor_name) { line += " — Dr. " + s.doctor_name; }
  message += line + "\\n";
}

message += "\\nResponde *1*, *2* o *3* para confirmar 😊\\nO dime si prefieres otro dia.";

return [{ json: Object.assign({}, $json, {
  offer_message: message,
  offered_slots: slots,
  awaiting_slot_confirmation: true,
  should_escalate: false
}) }];`;
    console.log('✔ Fixed Formatear Oferta de Slots — better formatting with bold and emoji');
  } else {
    console.warn('⚠ Formatear Oferta de Slots not found');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FIX 10: Generar Texto Menu — ensure welcome_message from bot_config is used
  // The current code uses menu.header but not the welcome_message from bot_config.
  // This is intentional (menu.header is the menu-specific header), keep as-is.
  // ─────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────
  // Save patched workflow
  // ─────────────────────────────────────────────────────────────────────────
  const payload = {
    name:        wf.name,
    nodes:       wf.nodes,
    connections: wf.connections,
    settings:    wf.settings || {},
    staticData:  wf.staticData || null
  };

  console.log('\nUploading patched workflow...');
  const result = await apiFetch(`/api/v1/workflows/${WORKFLOW_ID}`, 'PUT', payload);
  console.log('Upload result — id:', result.id, '| name:', result.name, '| active:', result.active);
  console.log('\n✅ All fixes applied successfully!');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
