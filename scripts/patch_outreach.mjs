import { readFileSync, writeFileSync } from 'fs';

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const BASE = 'https://workflows.n8n.redsolucionesti.com';

async function putWorkflow(id, body) {
  const r = await fetch(`${BASE}/api/v1/workflows/${id}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`PUT ${id} failed: ${JSON.stringify(j)}`);
  return j;
}

async function postWorkflow(body) {
  const r = await fetch(`${BASE}/api/v1/workflows`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`POST failed: ${JSON.stringify(j)}`);
  return j;
}

// ── 1. EMAIL WORKFLOW ─────────────────────────────────────────────
const emailWf = JSON.parse(readFileSync('C:/Users/Barbara/Documents/n8n_workflow_claudio/saas/email_wf_live.json', 'utf8'));

const parsearLeads = emailWf.nodes.find(n => n.name === 'Parsear Leads');
parsearLeads.parameters.jsCode = `var body    = $input.first().json;
var records = body.records || [];
if (records.length === 0) return [{ json: { _skip: true, msg: "Sin leads disponibles" } }];
return records.map(function(rec) {
  var f = rec.fields || {};
  return { json: {
    record_id:     rec.id,
    nombre:        f.nombre        || f.name    || "",
    email:         f.email         || "",
    direccion:     f.direccion     || f.address || "Lima",
    rating:        f.rating        || 0,
    total_resenas: f.total_resenas || f.resenas || 0,
    website:       f.website       || "",
    status:        f.status        || "",
    fuente:        f.fuente        || "google_maps",
    citas_semana:  f.citas_semana  || ""
  }};
});`;

const prepPrompt = emailWf.nodes.find(n => n.name === 'Preparar Prompt');
prepPrompt.parameters.jsCode = `var all = $input.all();
return all.map(function(item) {
  var j = item.json;
  if (j._skip) return { json: j };
  var fuente = j.fuente || 'google_maps';
  var prompt;
  if (fuente === 'meta_ads') {
    var citas = j.citas_semana || 'no especificado';
    prompt = 'Eres experto en ventas B2B para clinicas dentales en Peru.\\n' +
      'Genera asunto y parrafo de apertura para un lead CALIENTE que ya pidio demo de SofIA en Facebook.\\n\\n' +
      'Clinica: ' + (j.nombre || 'la clinica') + '\\n' +
      'Citas por semana declaradas: ' + citas + '\\n\\n' +
      'SofIA ofrece:\\n' +
      '- Agenda 24/7 por WhatsApp sin cambiar numero\\n' +
      '- Historial clinico digital con alertas de alergias\\n' +
      '- Recordatorios automaticos (reduce cancelaciones 40%)\\n' +
      '- Datos seguros y aislados por clinica\\n\\n' +
      'Reglas ASUNTO: max 55 chars, referencia su solicitud, urgencia amigable.\\n' +
      'Reglas HOOK: 2 oraciones max, tono calido (NO cold outreach), menciona impacto para ' + citas + ' citas/semana.\\n\\n' +
      'Responde SOLO JSON sin markdown: {"asunto":"...","hook":"..."}';
  } else {
    var tpl = 'Eres experto en ventas B2B para clinicas dentales en Peru.\\nGenera asunto y parrafo de apertura PERSONALIZADO.\\n\\nClinica: {{NOMBRE}}\\nZona: {{DIRECCION}}\\nRating Google: {{RATING}} estrellas ({{RESENAS}} resenas)\\nTiene web propia: {{TIENE_WEB}}\\n\\nProducto: SofIA - asistente IA para clinicas via WhatsApp 24/7, historial clinico digital con alertas de alergias, recordatorios automaticos.\\n\\nReglas ASUNTO: max 55 chars, despierta curiosidad, NO: gratis/oferta/urgente.\\nReglas HOOK: 2 oraciones max, menciona algo especifico de la clinica, problema de perder pacientes fuera de horario, tono directo y cercano.\\n\\nResponde SOLO JSON sin markdown: {"asunto":"...","hook":"..."}';
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

const emailPayload = { name: emailWf.name, nodes: emailWf.nodes, connections: emailWf.connections, settings: emailWf.settings, staticData: emailWf.staticData };
const emailResult = await putWorkflow('8mglaD5SCaFB2XWZ', emailPayload);
console.log('✅ Email workflow updated:', emailResult.id);

// ── 2. SMS WORKFLOW ───────────────────────────────────────────────
const smsWf = JSON.parse(readFileSync('C:/Users/Barbara/Documents/n8n_workflow_claudio/saas/sms_wf_live.json', 'utf8'));

const getLeadsSms = smsWf.nodes.find(n => n.name === 'Get Leads SMS');
getLeadsSms.parameters.options.filterByFormula = "OR(AND({status}='email_enviado',IS_BEFORE({fecha_envio},DATEADD(TODAY(),-4,'days'))),{status}='sin_email',AND({status}='nuevo',{fuente}='meta_ads',{email}=''))";

const prepTel = smsWf.nodes.find(n => n.name === 'Preparar Tel');
prepTel.parameters.jsCode = `var all = $input.all();
return all.map(function(item) {
  var j = item.json;
  var tel = (j.telefono||j.phone||"").replace(/[\\s\\-\\(\\)]/g,"");
  if (!tel) return { json: Object.assign({}, j, { skip: true }) };
  var phone = tel;
  if (!phone.startsWith("+51")) {
    if (phone.startsWith("51")) phone = "+" + phone;
    else if (phone.startsWith("9") && phone.length===9) phone = "+51" + phone;
    else if (phone.startsWith("01")) phone = "+51" + phone.slice(1);
    else phone = "+51" + phone;
  }
  var isMobile = /^\\+519/.test(phone);
  var fuente = j.fuente || 'google_maps';
  var nombre = j.nombre || '';
  var sms;
  if (fuente === 'meta_ads') {
    sms = (nombre ? nombre.slice(0,15) + ', ' : '') +
      'gracias por tu interes en SofIA! Te escribimos de RedSolucionesti. ' +
      'Cuando te conviene una demo rapida de 15 min? Escribe SI o el dia que prefieres. ' +
      'STOP para darte de baja.';
  } else {
    sms = (nombre ? nombre.slice(0,18) + ', ' : '') +
      'te escribimos de SofIA. Revisaste nuestro email? ' +
      'Automatiza citas de tu clinica dental por WhatsApp 24/7 y reduce cancelaciones 40%. ' +
      'Demo gratuita esta semana? Responde SI o STOP para no recibir.';
  }
  return { json: {
    record_id:  j.id || j.record_id,
    nombre:     nombre,
    phone_e164: phone,
    is_mobile:  isMobile,
    sms_text:   sms,
    skip:       !isMobile,
    fecha_hoy:  new Date().toISOString().slice(0,10)
  }};
});`;

const smsPayload = { name: smsWf.name, nodes: smsWf.nodes, connections: smsWf.connections, settings: smsWf.settings, staticData: smsWf.staticData };
const smsResult = await putWorkflow('q1RZvxPbZVNJKAT5', smsPayload);
console.log('✅ SMS workflow updated:', smsResult.id);

// ── 3. META LEADS CAPTURE (nuevo) ────────────────────────────────
const metaWf = {
  name: "SofIA - Meta Leads Capture",
  nodes: [
    {
      id: "meta-wh-01",
      name: "Meta Webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 1,
      position: [200, 400],
      parameters: {
        httpMethod: "Any",
        path: "meta-leads",
        responseMode: "responseNode"
      },
      webhookId: "sofia-meta-leads"
    },
    {
      id: "meta-wh-02",
      name: "Rutear Request",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [420, 400],
      parameters: {
        jsCode: `var item = $input.first().json;
var query = item.query || {};
var body  = item.body  || {};
var isVerification = !!(query['hub.mode'] && query['hub.challenge']);
var leadgenId = null;
if (body.entry && body.entry[0] && body.entry[0].changes) {
  var chg = body.entry[0].changes[0];
  if (chg && chg.value && chg.value.leadgen_id) leadgenId = String(chg.value.leadgen_id);
}
return [{ json: {
  is_verification: isVerification,
  challenge:       query['hub.challenge'] || '',
  verify_token:    query['hub.verify_token'] || '',
  leadgen_id:      leadgenId
}}];`
      }
    },
    {
      id: "meta-wh-03",
      name: "Es Verificacion",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [640, 400],
      parameters: {
        conditions: {
          options: { caseSensitive: false, leftValue: "", typeValidation: "loose" },
          conditions: [{
            id: "c1",
            leftValue: "={{ $json.is_verification }}",
            rightValue: true,
            operator: { type: "boolean", operation: "true", singleValue: true }
          }],
          combinator: "and"
        }
      }
    },
    {
      id: "meta-wh-04",
      name: "Responder Verificacion",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1,
      position: [860, 260],
      parameters: {
        respondWith: "text",
        responseBody: "={{ $json.challenge }}",
        options: { responseCode: 200 }
      }
    },
    {
      id: "meta-wh-05",
      name: "Obtener Lead Meta",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [860, 540],
      parameters: {
        method: "GET",
        url: "=https://graph.facebook.com/v19.0/{{ $json.leadgen_id }}",
        sendQuery: true,
        queryParameters: {
          parameters: [
            { name: "fields", value: "field_data,created_time" },
            { name: "access_token", value: "={{ $vars.META_PAGE_ACCESS_TOKEN }}" }
          ]
        },
        options: {}
      }
    },
    {
      id: "meta-wh-06",
      name: "Parsear Lead",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1080, 540],
      parameters: {
        jsCode: `var item = $input.first().json;
var fields = item.field_data || [];
var d = {};
fields.forEach(function(f) { d[f.name] = (f.values && f.values[0]) || ''; });

var nombre   = d['full_name']    || d['nombre']   || d['name']  || '';
var telefono = d['phone_number'] || d['telefono'] || d['phone'] || '';
var email    = d['email']        || '';
var citas    = '';
Object.keys(d).forEach(function(k) {
  if (k.indexOf('cita') !== -1 || k.indexOf('semana') !== -1) citas = d[k];
});

var tel = telefono.replace(/[\\s\\-\\(\\)]/g,'');
if (tel && !tel.startsWith('+')) {
  if (tel.startsWith('51'))                      tel = '+' + tel;
  else if (tel.startsWith('9') && tel.length===9) tel = '+51' + tel;
  else                                            tel = '+51' + tel;
}
return [{ json: {
  nombre:       nombre,
  telefono:     tel,
  email:        email,
  citas_semana: citas,
  fuente:       'meta_ads',
  status:       'nuevo',
  fecha_lead:   new Date().toISOString().slice(0,10)
}}];`
      }
    },
    {
      id: "meta-wh-07",
      name: "Guardar en Airtable",
      type: "n8n-nodes-base.airtable",
      typeVersion: 2,
      position: [1300, 540],
      parameters: {
        operation: "create",
        base: { "__rl": true, value: "app6a4u9dvXMxwOnY", mode: "id" },
        table: { "__rl": true, value: "tblBuVcKITk5GFoqk", mode: "id" },
        columns: {
          mappingMode: "defineBelow",
          value: {
            nombre:       "={{ $json.nombre }}",
            telefono:     "={{ $json.telefono }}",
            email:        "={{ $json.email }}",
            citas_semana: "={{ $json.citas_semana }}",
            fuente:       "meta_ads",
            status:       "nuevo",
            fecha_lead:   "={{ $json.fecha_lead }}"
          }
        },
        options: { typecast: true }
      },
      credentials: { airtableTokenApi: { id: "YmCX94YiEOb7UtNi", name: "Airtable Personal Access Token account" } }
    },
    {
      id: "meta-wh-08",
      name: "SMS Inmediato Twilio",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [1520, 540],
      onError: "continueRegularOutput",
      parameters: {
        method: "POST",
        url: "https://api.twilio.com/2010-04-01/Accounts/AC4080780a4b4a7d8e7b107a39f01abad3/Messages.json",
        authentication: "genericCredentialType",
        genericAuthType: "httpBasicAuth",
        sendBody: true,
        contentType: "form-urlencoded",
        bodyParameters: {
          parameters: [
            { name: "To",   value: "={{ $json.telefono }}" },
            { name: "From", value: "+13186683828" },
            { name: "Body", value: "=Hola {{ $json.nombre }}, gracias por tu interes en SofIA! Te contactamos de RedSolucionesti. Cuando te conviene una demo rapida de 15 min por WhatsApp? Responde con el dia que prefieres o escribe STOP para no recibir mensajes." }
          ]
        },
        options: {}
      },
      credentials: { httpBasicAuth: { id: "yh9g07Rj36ac5eE0", name: "Twilio API" } }
    },
    {
      id: "meta-wh-09",
      name: "Responder OK",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1,
      position: [1740, 540],
      parameters: {
        respondWith: "json",
        responseBody: '{"status":"received"}',
        options: { responseCode: 200 }
      }
    }
  ],
  connections: {
    "Meta Webhook":          { main: [[{ node: "Rutear Request",         type: "main", index: 0 }]] },
    "Rutear Request":        { main: [[{ node: "Es Verificacion",        type: "main", index: 0 }]] },
    "Es Verificacion":       { main: [
      [{ node: "Responder Verificacion", type: "main", index: 0 }],
      [{ node: "Obtener Lead Meta",      type: "main", index: 0 }]
    ]},
    "Obtener Lead Meta":     { main: [[{ node: "Parsear Lead",           type: "main", index: 0 }]] },
    "Parsear Lead":          { main: [[{ node: "Guardar en Airtable",    type: "main", index: 0 }]] },
    "Guardar en Airtable":   { main: [[{ node: "SMS Inmediato Twilio",   type: "main", index: 0 }]] },
    "SMS Inmediato Twilio":  { main: [[{ node: "Responder OK",           type: "main", index: 0 }]] }
  },
  settings: { executionOrder: "v1" },
  staticData: null
};

const metaResult = await postWorkflow(metaWf);
console.log('✅ Meta Leads Capture created:', metaResult.id);

// Activate it
const actRes = await fetch(`${BASE}/api/v1/workflows/${metaResult.id}/activate`, {
  method: 'POST', headers: { 'X-N8N-API-KEY': API_KEY }
});
console.log('✅ Meta workflow activated:', actRes.status);

console.log('\n=== DONE ===');
console.log('Webhook URL: https://workflows.n8n.redsolucionesti.com/webhook/meta-leads');
