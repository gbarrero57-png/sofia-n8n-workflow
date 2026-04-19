import { readFileSync } from 'fs';

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const BASE = 'https://workflows.n8n.redsolucionesti.com';

async function put(id, wf) {
  const r = await fetch(`${BASE}/api/v1/workflows/${id}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings, staticData: wf.staticData||null })
  });
  const j = await r.json();
  if (!r.ok) throw new Error('PUT failed: ' + JSON.stringify(j).slice(0,300));
  return j;
}

// ── 1. SMS WORKFLOW — update Preparar Tel copy ────────────────
const smsWf = JSON.parse(readFileSync('C:/Users/Barbara/Documents/n8n_workflow_claudio/saas/sms_live2.json', 'utf8'));

const prepTel = smsWf.nodes.find(n => n.name === 'Preparar Tel');
prepTel.parameters.jsCode = `var all = $input.all();
return all.map(function(item) {
  var j = item.json;
  var tel = (j.telefono||j.phone||"").replace(/[\\s\\-\\(\\)]/g,"");
  if (!tel) return { json: Object.assign({}, j, { skip: true }) };
  var phone = tel;
  if (!phone.startsWith("+51")) {
    if (phone.startsWith("51"))                       phone = "+" + phone;
    else if (phone.startsWith("9") && phone.length===9) phone = "+51" + phone;
    else if (phone.startsWith("01"))                  phone = "+51" + phone.slice(1);
    else                                              phone = "+51" + phone;
  }
  var isMobile = /^\\+519/.test(phone);
  var fuente = j.fuente || 'google_maps';
  var nombre = (j.nombre || '').split(' ')[0]; // solo primer nombre

  var sms1, sms2;

  if (fuente === 'meta_ads') {
    // Warm — ya pidieron info
    sms1 = 'Hola ' + nombre + ', soy Gabriel de SofIA. ' +
      'Vi que pediste info sobre automatizar las citas de tu clinica. ' +
      'SofIA atiende WhatsApp 24/7, agenda citas sola y guarda el historial de cada paciente sin que tu equipo haga nada. ' +
      'Cuando tienes 15 min esta semana para una demo rapida? ' +
      'Responde con el dia que prefieres o escribe STOP.';
    // Follow-up día 6
    sms2 = nombre + ', ultimo mensaje de nuestra parte. ' +
      'Clinicas en Lima estan reduciendo no-shows 40% con SofIA. ' +
      'Si en algun momento quieres verlo en accion: wa.me/51905858566 ' +
      'Escribe STOP para no recibir mas mensajes.';
  } else {
    // Cold — Google Maps
    sms1 = 'Hola ' + nombre + ', te escribi un email hace unos dias sobre SofIA. ' +
      'Tu clinica pierde citas porque nadie responde WhatsApp de noche? ' +
      'SofIA lo resuelve: agenda 24/7, recordatorios automaticos, historial clinico digital. ' +
      'Demo gratis esta semana. Responde SI o STOP.';
    sms2 = nombre + ', ultimo mensaje. ' +
      'Clinicas dentales en Lima reducen cancelaciones 40% con SofIA IA. ' +
      'Si te interesa: wa.me/51905858566 ' +
      'STOP para darte de baja.';
  }

  // Usar sms2 si ya hubo un primer contacto (status=sms_enviado)
  var smsText = (j.status === 'sms_enviado') ? sms2 : sms1;

  return { json: {
    record_id:  j.id || j.record_id,
    nombre:     j.nombre || '',
    phone_e164: phone,
    is_mobile:  isMobile,
    sms_text:   smsText,
    skip:       !isMobile,
    fecha_hoy:  new Date().toISOString().slice(0,10)
  }};
});`;

const smsResult = await put('q1RZvxPbZVNJKAT5', smsWf);
console.log('✅ SMS workflow updated:', smsResult.id);

// ── 2. META LEADS — SMS inmediato mejorado ────────────────────
const metaWf = JSON.parse(readFileSync('C:/Users/Barbara/Documents/n8n_workflow_claudio/saas/meta_wf_live.json', 'utf8'));

const smsInmediato = metaWf.nodes.find(n => n.name === 'SMS Inmediato Twilio');
smsInmediato.parameters.bodyParameters.parameters[2].value =
  '=Hola {{ $json.nombre.split(" ")[0] }}, soy Gabriel de SofIA 👋 ' +
  'Vi que pediste info sobre automatizar las citas de tu clinica. ' +
  'SofIA atiende WhatsApp 24/7, agenda citas sola y guarda el historial de cada paciente. ' +
  'Cuando tienes 15 min esta semana para una demo rapida? ' +
  'Responde con el dia que prefieres o escribe STOP.';

const metaResult = await put('J5aUVLsnYNNZw9Rq', metaWf);
console.log('✅ Meta Leads SMS updated:', metaResult.id);

// ── 3. LLAMADAS — audio mejorado por fuente ───────────────────
const callWf = JSON.parse(readFileSync('C:/Users/Barbara/Documents/n8n_workflow_claudio/saas/call_live2.json', 'utf8'));

const hacerLlamada = callWf.nodes.find(n => n.name === 'Hacer Llamada');
if (hacerLlamada) {
  // Add a prep node before the call to build TwiML by fuente
  // Find Preparar Llamada node and update it
  const prepLlamada = callWf.nodes.find(n => n.name === 'Preparar Llamada');
  if (prepLlamada) {
    prepLlamada.parameters.jsCode = `var all = $input.all();
return all.map(function(item) {
  var j = item.json;
  var tel = (j.telefono||"").replace(/[\\s\\-\\(\\)]/g,"");
  var phone = tel;
  if (!phone.startsWith("+51")) {
    if (phone.startsWith("9") && phone.length===9) phone = "+51"+phone;
    else if (phone.startsWith("51")) phone = "+"+phone;
    else if (phone.startsWith("01")) phone = "+51"+phone.slice(1);
    else phone = "+51"+phone;
  }
  var fuente = j.fuente || 'google_maps';
  var nombre = (j.nombre||'').split(' ')[0];

  var twiml;
  if (fuente === 'meta_ads') {
    twiml = '<?xml version="1.0" encoding="UTF-8"?><Response>' +
      '<Say voice="Polly.Mia-Neural" language="es-US">' +
      'Hola, buenos dias. Le llamo de parte de Gabriel, del equipo de SofIA en RedSolucionesti.' +
      '<break time="400ms"/>' +
      'Hace unos dias usted solicito informacion sobre SofIA para su clinica ' +
      'y queria asegurarme de que recibio todo lo que necesitaba.' +
      '<break time="400ms"/>' +
      'SofIA es el asistente de inteligencia artificial que atiende el WhatsApp de su clinica las 24 horas, ' +
      'agenda citas solo, guarda el historial clinico de sus pacientes con alertas de alergias ' +
      'y envia recordatorios automaticos para reducir cancelaciones.' +
      '<break time="500ms"/>' +
      'Me encantaria mostrarle como funciona en una demostracion de solo 15 minutos, sin compromiso.' +
      '<break time="400ms"/>' +
      'Por favor escribanos al WhatsApp mas cinco uno, nueve cero cinco, ocho cinco ocho, cinco seis seis ' +
      'y con gusto coordinamos el horario que mas le convenga.' +
      '<break time="400ms"/>' +
      'Gracias y que tenga un excelente dia.' +
      '</Say></Response>';
  } else {
    twiml = '<?xml version="1.0" encoding="UTF-8"?><Response>' +
      '<Say voice="Polly.Mia-Neural" language="es-US">' +
      'Hola, buenos dias. Le llamo de parte de SofIA, el asistente de inteligencia artificial para clinicas dentales en Lima.' +
      '<break time="500ms"/>' +
      'Nos comunicamos porque notamos que su clinica atiende pacientes en Lima ' +
      'y quisiera presentarles una solucion que estan usando otras clinicas de la zona.' +
      '<break time="400ms"/>' +
      'SofIA responde el WhatsApp de su clinica las 24 horas, ' +
      'agenda citas automaticamente, envia recordatorios a sus pacientes ' +
      'y guarda el historial clinico de cada uno, con alertas de alergias incluidas.' +
      '<break time="400ms"/>' +
      'Esto les permite captar pacientes que escriben fuera de horario ' +
      'y reducir las cancelaciones hasta un 40 por ciento.' +
      '<break time="500ms"/>' +
      'Si le interesa ver una demostracion gratuita de 15 minutos esta semana, ' +
      'responda el mensaje de texto que le enviamos ' +
      'o escribanos al WhatsApp mas cinco uno, nueve cero cinco, ocho cinco ocho, cinco seis seis.' +
      '<break time="400ms"/>' +
      'Muchas gracias por su tiempo. Que tenga un excelente dia.' +
      '</Say></Response>';
  }

  return { json: {
    record_id:   j.id || j.record_id,
    nombre:      j.nombre || '',
    phone_e164:  phone,
    twiml:       twiml,
    fecha_hoy:   new Date().toISOString().slice(0,10)
  }};
});`;
  }

  // Update Hacer Llamada to use $json.twiml
  hacerLlamada.parameters.bodyParameters.parameters[2].value = '={{ $json.twiml }}';

  const callResult = await put('nYsyOfbIUmEcJgbw', callWf);
  console.log('✅ Llamada workflow updated:', callResult.id);
} else {
  console.log('⚠️ Hacer Llamada node not found — skipping');
}

// ── 4. EMAIL — update OpenAI prompt with warm copy ────────────
const emailWf = JSON.parse(readFileSync('C:/Users/Barbara/Documents/n8n_workflow_claudio/saas/email_wf_live.json', 'utf8'));

const prepPrompt = emailWf.nodes.find(n => n.name === 'Preparar Prompt');
prepPrompt.parameters.jsCode = `var all = $input.all();
return all.map(function(item) {
  var j = item.json;
  if (j._skip) return { json: j };
  var fuente = j.fuente || 'google_maps';
  var prompt;

  if (fuente === 'meta_ads') {
    var citas = j.citas_semana || 'varias';
    prompt = 'Eres experto en ventas B2B para clinicas dentales en Peru.\\n' +
      'Genera un asunto y un parrafo de apertura para un lead CALIENTE que ya pidio demo de SofIA en Facebook.\\n\\n' +
      'Nombre: ' + (j.nombre || 'la clinica') + '\\n' +
      'Citas por semana: ' + citas + '\\n\\n' +
      'El email debe incluir estos puntos clave de SofIA:\\n' +
      '- Atiende WhatsApp 24/7, responde en segundos\\n' +
      '- Agenda citas automaticamente\\n' +
      '- Historial clinico digital con alertas de alergias\\n' +
      '- Recordatorios automaticos (reduce cancelaciones 40%)\\n' +
      '- Datos seguros y aislados por clinica\\n\\n' +
      'Reglas ASUNTO: max 55 chars, referencia su solicitud previa, tono calido.\\n' +
      'Reglas HOOK: 2 oraciones, menciona el impacto para ' + citas + ' citas/semana, NO cold outreach.\\n\\n' +
      'Responde SOLO JSON sin markdown: {"asunto":"...","hook":"..."}';
  } else {
    var tpl = 'Eres experto en ventas B2B para clinicas dentales en Peru.\\n' +
      'Genera asunto y parrafo de apertura PERSONALIZADO para cold outreach.\\n\\n' +
      'Clinica: {{NOMBRE}}\\nZona: {{DIRECCION}}\\n' +
      'Rating Google: {{RATING}} estrellas ({{RESENAS}} resenas)\\n' +
      'Tiene web propia: {{TIENE_WEB}}\\n\\n' +
      'SofIA ofrece: WhatsApp 24/7, historial clinico digital, alertas de alergias, recordatorios automaticos, datos seguros.\\n\\n' +
      'Reglas ASUNTO: max 55 chars, despierta curiosidad, NO: gratis/oferta/urgente.\\n' +
      'Reglas HOOK: 2 oraciones max, menciona algo especifico de la clinica, problema de perder pacientes fuera de horario.\\n\\n' +
      'Responde SOLO JSON sin markdown: {"asunto":"...","hook":"..."}';
    prompt = tpl
      .replace('{{NOMBRE}}',    j.nombre    || 'la clinica')
      .replace('{{DIRECCION}}', j.direccion || 'Lima')
      .replace('{{RATING}}',    String(j.rating || 0))
      .replace('{{RESENAS}}',   String(j.total_resenas || 0))
      .replace('{{TIENE_WEB}}', j.website ? 'si (' + j.website + ')' : 'no');
  }

  return { json: {
    record_id:     j.record_id,
    nombre:        j.nombre        || '',
    email:         j.email         || '',
    direccion:     j.direccion     || '',
    rating:        j.rating        || 0,
    total_resenas: j.total_resenas || 0,
    fuente:        fuente,
    citas_semana:  j.citas_semana  || '',
    fecha_hoy:     new Date().toISOString().slice(0,10),
    openai_body:   JSON.stringify({
      model: 'gpt-4o-mini', temperature: 0.8, max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    })
  }};
});`;

// Update HTML builder — add warm section for meta_ads
const buildHtml = emailWf.nodes.find(n => n.name === 'Construir HTML');
if (buildHtml) {
  // Inject fuente into HTML — add warm badge for meta_ads leads
  buildHtml.parameters.jsCode = buildHtml.parameters.jsCode.replace(
    "var nombre = (j.nombre || 'su clinica').replace(/[<>]/g, '');",
    "var nombre = (j.nombre || 'su clinica').replace(/[<>]/g, '');\n  var fuente = j.fuente || 'google_maps';"
  ).replace(
    "'Recibiste este email porque tu clinica aparece en Google Maps o solicito informacion sobre SofIA.'",
    "fuente === 'meta_ads' ? 'Recibiste este email porque solicitaste informacion sobre SofIA.' : 'Recibiste este email porque tu clinica aparece en Google Maps.'"
  );
}

const emailResult = await put('8mglaD5SCaFB2XWZ', emailWf);
console.log('✅ Email workflow updated:', emailResult.id);

console.log('\\n=== TODOS LOS WORKFLOWS ACTUALIZADOS ===');
