// PATCH SOFIA v5 — Refined responses, day-change detection, status translations
const fs = require('fs');

const WF_PATH = process.env.TEMP + '/sofia_full.json';
const OUT_PATH = process.env.TEMP + '/sofia_v5.json';

const wf = JSON.parse(fs.readFileSync(WF_PATH));

function patch(name, fn) {
  const n = wf.nodes.find(n => n.name === name);
  if (!n) { console.log('NOT FOUND:', name); return; }
  fn(n);
  console.log('PATCHED:', name);
}

// ════════════════════════════════════════════════════
// 1. PRE-CLASIFICADOR KEYWORDS v5
//    — detect day-change when awaiting slot
//    — add natural language availability queries
// ════════════════════════════════════════════════════
patch('Pre-Clasificador Keywords', n => {
  n.parameters.jsCode = `// PRE-CLASIFICADOR BASADO EN KEYWORDS v5
const message = ($json.message_text || "").toLowerCase().trim();

// 0. WhatsApp Safe ya pidio escalacion
if ($json.should_escalate === true) {
    return [{ json: Object.assign({}, $json, { intent: "HUMAN", confidence: "high", classified_by: "WHATSAPP_SAFE_ESCALATION", skip_ai: true }) }];
}

// 1. SLOT CONFIRMATION — maxima prioridad cuando awaiting_slot
const convLabels = $json.raw_payload && $json.raw_payload.conversation && $json.raw_payload.conversation.labels || [];
const awaitingSlot = convLabels.includes("awaiting_slot");

if (awaitingSlot) {
    // 1a. Numero explicito (1, 2, 3) o palabra equivalente
    const wordMap = { "uno":"1","one":"1","dos":"2","two":"2","tres":"3","three":"3" };
    const cleanMsg = message.replace(/[^a-z0-9 ]/g, "").trim();
    const slotFromWord = wordMap[cleanMsg];
    const slotFromDigit = message.match(/[1-3]/)?.[0];
    const slotDigit = slotFromWord || slotFromDigit || null;
    if (slotDigit) {
        return [{ json: Object.assign({}, $json, { message_text: slotDigit, intent: "CREATE_EVENT", confidence: "high", classified_by: "SLOT_CONFIRMATION_DETECTOR", skip_ai: true }) }];
    }
    // 1b. Afirmacion simple
    const affirmatives = ["si","si","yes","ok","dale","de acuerdo","bueno","perfecto","claro","listo","va","quiero","ese","esa","esa opcion","esa hora","ese horario","con ese","con esa"];
    const cleanMsg2 = message.replace(/[^a-z0-9aeiouun ]/g, "").trim();
    if (affirmatives.includes(cleanMsg2) || affirmatives.some(function(a) { return cleanMsg2.startsWith(a + " "); })) {
        return [{ json: Object.assign({}, $json, { intent: "CREATE_EVENT", confidence: "high", classified_by: "SLOT_AFFIRMATION_DETECTOR", skip_ai: true }) }];
    }
    // 1c. Pide otro dia — reroute a CREATE_EVENT con dia nuevo
    const DAY_KW = ["lunes","martes","miercoles","miercoles","jueves","viernes","sabado","sabado","domingo","hoy","manana","mañana","otro dia","otro dia","siguiente","proxima","proxima semana","esta semana"];
    const hasDayKw = DAY_KW.some(function(d) { return message.includes(d); });
    if (hasDayKw) {
        return [{ json: Object.assign({}, $json, { intent: "CREATE_EVENT", confidence: "high", classified_by: "DAY_CHANGE_DETECTOR", skip_ai: true, day_change_request: true }) }];
    }
}

// 2. MENU keywords
const MENU_KEYWORDS = ["menu","menu","opciones","opcion","inicio","volver","ayuda","start","ver opciones"];
for (var mi = 0; mi < MENU_KEYWORDS.length; mi++) {
    if (message === MENU_KEYWORDS[mi] || message.startsWith(MENU_KEYWORDS[mi])) {
        return [{ json: Object.assign({}, $json, { intent: "MENU", confidence: "high", classified_by: "MENU_KEYWORD_DETECTOR", skip_ai: true }) }];
    }
}

// 3. GREETING → mostrar menu
const greetingRegex = /^(hola+|holi+|hey+|ola+|hi+|hello+|buenas?|buenos?|saludos?|buen dia|buenas tardes|buenas noches|que tal|alo|alo)[!.! ]*$/i;
if (greetingRegex.test(message)) {
    return [{ json: Object.assign({}, $json, { intent: "GREETING", confidence: "high", classified_by: "GREETING_DETECTOR", skip_ai: true }) }];
}

// 4. MENU_SELECTION — digito solo (sin awaiting slot)
const digitMatch = message.match(/^([1-9])$/);
if (digitMatch && !awaitingSlot) {
    return [{ json: Object.assign({}, $json, { intent: "MENU_SELECTION", menu_selection_option: digitMatch[1], confidence: "high", classified_by: "MENU_SELECTION_DETECTOR", skip_ai: true }) }];
}

// 5. CREATE_EVENT keywords — incluye consultas naturales de disponibilidad
const CREATE_EVENT_KEYWORDS = [
    "agendar","reservar","cita","turno","appointment",
    "quiero una cita","necesito cita","quiero cita","quiero ir","necesito ir",
    "cuando puedo","disponibilidad","hay disponible","hay hora","tienes hora",
    "hay espacio","hay lugar","tienen espacio","tienes espacio",
    "hay para el","hay para la","tienes para el","tienen para el",
    "puedo ir el","puedo ir manana","puedo ir hoy",
    "hora disponible","una hora para","me puedes agendar","pueden agendarme",
    "quiero el lunes","quiero el martes","quiero el miercoles","quiero el jueves",
    "quiero el viernes","quiero el sabado","quiero el domingo",
    "cita para el","cita el lunes","cita el martes","cita el miercoles",
    "cita el jueves","cita el viernes","cita el sabado"
];
for (var ci = 0; ci < CREATE_EVENT_KEYWORDS.length; ci++) {
    if (message.includes(CREATE_EVENT_KEYWORDS[ci])) {
        return [{ json: Object.assign({}, $json, { intent: "CREATE_EVENT", confidence: "high", classified_by: "PRE_CLASSIFIER", skip_ai: true }) }];
    }
}

// 6. PAYMENT keywords
const PAYMENT_KEYWORDS = ["pague","pagar","transferencia","deposite","ya pague","como pagar","metodo de pago","efectivo","tarjeta","factura","recibo","comprobante"];
for (var pi = 0; pi < PAYMENT_KEYWORDS.length; pi++) {
    if (message.includes(PAYMENT_KEYWORDS[pi])) {
        return [{ json: Object.assign({}, $json, { intent: "PAYMENT", confidence: "high", classified_by: "PRE_CLASSIFIER", skip_ai: true }) }];
    }
}

// 7. HUMAN escalation keywords
const HUMAN_KEYWORDS = ["hablar con","persona real","humano","agente","operador","quiero hablar","necesito hablar","emergencia","urgencia","urgente","dolor fuerte","sangra","mucho dolor","me duele mucho","duele mucho","muela","hinchazon","infeccion","inflamacion","queja","reclamo","problema grave"];
for (var hi = 0; hi < HUMAN_KEYWORDS.length; hi++) {
    if (message.includes(HUMAN_KEYWORDS[hi])) {
        return [{ json: Object.assign({}, $json, { intent: "HUMAN", confidence: "high", classified_by: "PRE_CLASSIFIER", skip_ai: true }) }];
    }
}

// 8. Fallback — AI classifier
return [{ json: Object.assign({}, $json, { skip_ai: false }) }];`;
});

// ════════════════════════════════════════════════════
// 2. CHECK SLOT CONFIRMATION STATE
//    — clear label when day_change_request
// ════════════════════════════════════════════════════
patch('Check Slot Confirmation State', n => {
  const dayChangePatch = `// Si usuario pide otro dia, limpiar label y reiniciar scheduling
if ($json.day_change_request === true && awaiting) {
  try {
    await this.helpers.httpRequest({
      method: "POST",
      url: "https://chat.redsolucionesti.com/api/v1/accounts/" + validar_data.account_id + "/conversations/" + validar_data.conversation_id + "/labels",
      headers: { "api_access_token": "yypAwZDH2dV3crfbqJqWCgj1", "Content-Type": "application/json" },
      body: { labels: [] }, json: true
    });
  } catch(e) { /* non-fatal */ }
  return [{ json: { ...$json, slot_confirmation_pending: false, is_second_interaction: false, offered_slots: [], day_change_request: true } }];
}

`;

  n.parameters.jsCode = n.parameters.jsCode.replace(
    'return [{\n  json: {\n    ...$json,\n    intent: $json.intent,',
    dayChangePatch + 'return [{\n  json: {\n    ...$json,\n    intent: $json.intent,'
  );
});

// ════════════════════════════════════════════════════
// 3. FORMATEAR CITAS — estados en español
// ════════════════════════════════════════════════════
patch('Formatear Citas', n => {
  n.parameters.jsCode = `const ctx = $input.first().json;
const appts = ctx.raw_appointments || [];
const clinicName = ctx.clinic_name || "la clinica";

const STATUS_ES = {
  scheduled: "Agendada \u{1F4C5}",
  confirmed:  "Confirmada \u2705",
  completed:  "Completada \u2713",
  no_show:    "No se presento \u26A0\uFE0F",
  cancelled:  "Cancelada \u2715"
};

if (!appts || appts.length === 0) {
  var noApptText = "";
  if (ctx.phone_missing) {
    noApptText = "No pude identificar tu numero. Por favor contacta directamente a la clinica.";
  } else {
    noApptText = "No encontre citas activas en " + clinicName + ".\\n\\n\u00BFTe agendo una nueva? Responde *1*.";
  }
  return [{ json: Object.assign({}, ctx, { appointments_text: noApptText }) }];
}

var lines = appts.map(function(a, i) {
  var dt    = new Date(a.start_time);
  var fecha = dt.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });
  var hora  = dt.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  var serv  = a.service || "Consulta general";
  var est   = STATUS_ES[a.status] || a.status;
  return (i + 1) + ". *" + fecha + "* a las " + hora + "\\n   " + serv + " - " + est;
});

var text = "\u{1F4CB} *Tus citas en " + clinicName + ":*\\n\\n" + lines.join("\\n\\n");
text += "\\n\\n_Para cancelar escribe: cancelar 1 (o el numero)_";
text += "\\n\\n\u00BFNecesitas agendar otra? Responde *1*.";

return [{ json: Object.assign({}, ctx, { appointments_text: text }) }];`;
});

// ════════════════════════════════════════════════════
// 4. PEDIR ACLARACIÓN — mensaje mas natural
// ════════════════════════════════════════════════════
patch('Pedir Aclaración', n => {
  const msg = 'Con cual te quedas? Responde *1*, *2* o *3* \uD83D\uDE0A\nO dime si prefieres otro dia.';
  const body = JSON.stringify({ content: msg, message_type: 'outgoing', private: false });
  n.parameters.jsonBody = '=' + JSON.stringify(body);
});

// ════════════════════════════════════════════════════
// 5. FORMATEAR OFERTA DE SLOTS — sin "¡Perfecto!" cuando hay nota negativa
// ════════════════════════════════════════════════════
patch('Formatear Oferta de Slots', n => {
  n.parameters.jsCode = `// FORMAT SLOT OFFER MESSAGE
const slots    = $json.selected_slots || [];
const prefNote = $json.preference_note || "";

if (slots.length === 0) {
  return [{ json: Object.assign({}, $json, {
    offer_message: "Lo siento, no hay horarios en los proximos 7 dias. Te conecto con un agente.",
    should_escalate: true, escalation_reason: "NO_SLOTS_AVAILABLE"
  }) }];
}

var message = "";
if (prefNote) {
  message += prefNote + "\\n\\n";
  message += "Te muestro los mas proximos:\\n\\n";
} else {
  message += "Aqui los horarios disponibles:\\n\\n";
}

for (var i = 0; i < slots.length; i++) {
  var s = slots[i];
  var line = s.option_number + ". " + s.date + " a las " + s.time;
  if (s.doctor_name) { line += " - Dr. " + s.doctor_name; }
  message += line + "\\n";
}

message += "\\nResponde *1*, *2* o *3* para confirmar \uD83D\uDE0A";

return [{ json: Object.assign({}, $json, {
  offer_message: message,
  offered_slots: slots,
  awaiting_slot_confirmation: true,
  should_escalate: false
}) }];`;
});

// ════════════════════════════════════════════════════
// 6. SELECCIONAR 3 MEJORES SLOTS — mejor redaccion
// ════════════════════════════════════════════════════
patch('Seleccionar 3 Mejores Slots', n => {
  n.parameters.jsCode = n.parameters.jsCode
    .replace(
      '"No hay disponibilidad el " + (dow_names[preferred_dow] || "") + " en los proximos 7 dias. Mostrando proximos disponibles."',
      '"El " + (dow_names[preferred_dow] || "") + " no hay disponibilidad en los proximos 7 dias."'
    )
    .replace(
      '"No hay exactamente ese horario disponible. Mostrando lo mas cercano."',
      '"No hay ese horario exacto disponible."'
    );
});

// ════════════════════════════════════════════════════
// SAVE
// ════════════════════════════════════════════════════
const out = {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: wf.settings || {},
  staticData: wf.staticData || null
};
fs.writeFileSync(OUT_PATH, JSON.stringify(out));
console.log('\nAll patches done. Saved to', OUT_PATH);
