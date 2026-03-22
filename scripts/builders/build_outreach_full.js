/**
 * build_outreach_full.js
 * Crea 3 workflows de outreach discreto:
 *
 * WF1: SofIA - Email Inicial           (CRON 9am, 10/día, OpenAI personalizado)
 * WF2: SofIA - SMS Follow-up           (CRON 10am, 5/día, día 5+ sin respuesta)
 * WF3: SofIA - Llamada Follow-up       (CRON 11am, 5/día, día 9+ sin respuesta)
 *
 * Status flow:
 *   nuevo/sin_web → [WF1] → email_enviado
 *   sin_email → [WF2 directo] → sms_enviado
 *   email_enviado (5+ días) → [WF2] → sms_enviado
 *   sms_enviado (4+ días) → [WF3] → contactado_tel
 *   respondio / archivado → fin
 */

const https = require('https');
const fs = require('fs');

const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const BASE_URL = 'workflows.n8n.redsolucionesti.com';

const AT_BASE  = 'app6a4u9dvXMxwOnY';
const AT_TABLE = 'tblBuVcKITk5GFoqk';
const AT_CRED  = { id: 'YmCX94YiEOb7UtNi', name: 'Airtable Personal Access Token account' };
const OPENAI_CRED = { id: 'SeCPLJI4mV6p2hJR', name: 'OpenAi account' };

// Brevo SMTP credential ID (user already configured)
const SMTP_CRED = { id: 'SMTP_CRED_ID', name: 'Brevo SMTP' }; // user assigns manually
const SMTP_FROM = '"SofIA for Clinics" <gabriel@redsolucionesti.com>';

// Twilio placeholder
const TWILIO_SID = 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

function apiPost(path, body) {
  const data = JSON.stringify(body);
  return new Promise((res, rej) => {
    const req = https.request({
      hostname: BASE_URL, path, method: 'POST',
      headers: { 'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); });
    req.on('error', rej); req.write(data); req.end();
  });
}

function airtableListNode(id, name, position, formula, limit) {
  return {
    id, name, type: 'n8n-nodes-base.airtable', typeVersion: 2,
    position, credentials: { airtableTokenApi: AT_CRED },
    parameters: {
      operation: 'list',
      base: { __rl: true, value: AT_BASE, mode: 'id' },
      table: { __rl: true, value: AT_TABLE, mode: 'id' },
      returnAll: false, limit,
      options: { filterByFormula: formula }
    }
  };
}

function airtableUpdateNode(id, name, position, statusVal) {
  return {
    id, name, type: 'n8n-nodes-base.airtable', typeVersion: 2,
    position, credentials: { airtableTokenApi: AT_CRED },
    parameters: {
      operation: 'update',
      base: { __rl: true, value: AT_BASE, mode: 'id' },
      table: { __rl: true, value: AT_TABLE, mode: 'id' },
      id: '={{ $json.record_id }}',
      columns: {
        mappingMode: 'defineBelow',
        value: statusVal,
        matchingColumns: [], schema: []
      },
      options: { typecast: true }
    }
  };
}

// ─────────────────────────────────────────────────────────────
// WORKFLOW 1: Email Inicial
// ─────────────────────────────────────────────────────────────
const WF_EMAIL = {
  name: 'SofIA - Email Inicial',
  settings: { executionOrder: 'v1' },
  staticData: null,
  nodes: [
    // CRON: lun-vie 9am Lima (UTC-5 → 14:00 UTC)
    {
      id: 'em-01', name: 'CRON 9am',
      type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1,
      position: [0, 400],
      parameters: {
        rule: { interval: [{ field: 'cronExpression', expression: '0 14 * * 1-5' }] }
      }
    },

    // Get leads: status nuevo o sin_web con email, max 10/día
    airtableListNode(
      'em-02', 'Get Leads Email', [220, 400],
      "AND(OR({status}='nuevo',{status}='sin_web'),NOT({email}=''))",
      10
    ),

    // OpenAI: genera asunto + cuerpo personalizado
    {
      id: 'em-03', name: 'Generar Email OpenAI',
      type: '@n8n/n8n-nodes-langchain.openAi', typeVersion: 1,
      position: [440, 400],
      credentials: { openAiApi: OPENAI_CRED },
      parameters: {
        resource: 'text',
        operation: 'message',
        modelId: { __rl: true, value: 'gpt-4o-mini', mode: 'list' },
        messages: {
          values: [{
            role: 'user',
            content: `=Eres un experto en ventas B2B para clínicas dentales. Escribe un email corto, natural y personalizado para la clínica "{{ $json.nombre }}" ubicada en Lima, Perú.

Datos de la clínica:
- Nombre: {{ $json.nombre }}
- Dirección: {{ $json.direccion }}
- Rating Google: {{ $json.rating }} estrellas ({{ $json.total_resenas }} reseñas)
- Website: {{ $json.website || 'no tiene' }}

Producto a presentar: SofIA - asistente IA para clínicas dentales que:
• Automatiza la agenda de citas por WhatsApp (24/7)
• Reduce cancelaciones con recordatorios automáticos
• Capta pacientes que escriben fuera de horario
• Fácil de configurar, sin cambiar el sistema actual

Instrucciones:
- Email MUY corto (máx 5 oraciones en el cuerpo)
- Tono profesional pero cercano, NO corporativo
- Menciona algo específico de la clínica (rating, zona, etc.)
- CTA claro: "¿Le gustaría ver una demo de 15 minutos esta semana?"
- NO usar emojis excesivos
- Firma: "Gabriel\\nEquipo SofIA\\nweb: sofia.redsolucionesti.com"

Responde ÚNICAMENTE en este formato JSON (sin markdown):
{"asunto":"...","cuerpo":"..."}`
          }]
        },
        options: {}
      }
    },

    // Parsear respuesta OpenAI
    {
      id: 'em-04', name: 'Parsear Email',
      type: 'n8n-nodes-base.code', typeVersion: 2,
      position: [660, 400],
      parameters: {
        jsCode: [
          'var all = $input.all();',
          'return all.map(function(item) {',
          '  var openai = item.json;',
          '  // Extraer el texto de la respuesta de OpenAI',
          '  var text = openai.message?.content || openai.text || JSON.stringify(openai);',
          '  var parsed = {};',
          '  try {',
          '    // Limpiar markdown si lo hay',
          '    var clean = text.replace(/```json\\n?/g,"").replace(/```/g,"").trim();',
          '    parsed = JSON.parse(clean);',
          '  } catch(e) {',
          '    parsed = { asunto: "SofIA para " + (item.json.nombre||"su clinica"), cuerpo: text };',
          '  }',
          '  // Recuperar datos del lead desde nodo anterior',
          '  var lead = $("Get Leads Email").all().find(function(i){',
          '    return i.json.email === item.json.email || i.json.nombre === item.json.nombre;',
          '  });',
          '  var leadData = lead ? lead.json : {};',
          '  return { json: {',
          '    record_id:    leadData.id || "",',
          '    nombre:       leadData.nombre || "",',
          '    email:        leadData.email || "",',
          '    email_asunto: parsed.asunto || "",',
          '    email_cuerpo: parsed.cuerpo || "",',
          '    fecha_hoy:    new Date().toISOString().slice(0,10)',
          '  }};',
          '});'
        ].join('\n')
      }
    },

    // Enviar email via Brevo SMTP
    {
      id: 'em-05', name: 'Enviar Email',
      type: 'n8n-nodes-base.emailSend', typeVersion: 2,
      position: [880, 400],
      onError: 'continueRegularOutput',
      parameters: {
        fromEmail: SMTP_FROM,
        toEmail: '={{ $json.email }}',
        subject: '={{ $json.email_asunto }}',
        emailType: 'text',
        message: '={{ $json.email_cuerpo }}',
        options: {}
      }
    },

    // Actualizar Airtable: email_enviado + fecha
    airtableUpdateNode(
      'em-06', 'Actualizar Email Enviado', [1100, 400],
      { status: 'email_enviado', fecha_envio: '={{ $json.fecha_hoy }}', email_asunto: '={{ $json.email_asunto }}', email_cuerpo: '={{ $json.email_cuerpo }}' }
    )
  ],
  connections: {
    'CRON 9am':           { main: [[{ node: 'Get Leads Email', type: 'main', index: 0 }]] },
    'Get Leads Email':    { main: [[{ node: 'Generar Email OpenAI', type: 'main', index: 0 }]] },
    'Generar Email OpenAI': { main: [[{ node: 'Parsear Email', type: 'main', index: 0 }]] },
    'Parsear Email':      { main: [[{ node: 'Enviar Email', type: 'main', index: 0 }]] },
    'Enviar Email':       { main: [[{ node: 'Actualizar Email Enviado', type: 'main', index: 0 }]] }
  }
};

// ─────────────────────────────────────────────────────────────
// WORKFLOW 2: SMS Follow-up (día 5+ sin respuesta)
// ─────────────────────────────────────────────────────────────
const TWIML_SMS_FALLBACK = "SofIA para clinicas dentales: agenda automatica por WhatsApp 24/7, menos cancelaciones, mas pacientes. Demo GRATIS - responde este mensaje para info. Responde STOP para cancelar.";

const WF_SMS = {
  name: 'SofIA - SMS Follow-up',
  settings: { executionOrder: 'v1' },
  staticData: null,
  nodes: [
    // CRON: lun-vie 10am Lima (15:00 UTC)
    {
      id: 'sms-01', name: 'CRON 10am',
      type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1,
      position: [0, 400],
      parameters: {
        rule: { interval: [{ field: 'cronExpression', expression: '0 15 * * 1-5' }] }
      }
    },

    // Get leads para SMS:
    // - email_enviado con fecha_envio hace 5+ días
    // - o sin_email (nunca tuvieron email, van directo a SMS)
    // max 5/día
    airtableListNode(
      'sms-02', 'Get Leads SMS', [220, 400],
      `OR(AND({status}='email_enviado',IS_BEFORE({fecha_envio},DATEADD(TODAY(),-4,'days'))),{status}='sin_email')`,
      5
    ),

    // Preparar número teléfono E.164
    {
      id: 'sms-03', name: 'Preparar Tel',
      type: 'n8n-nodes-base.code', typeVersion: 2,
      position: [440, 400],
      parameters: {
        jsCode: [
          'var all = $input.all();',
          'return all.map(function(item) {',
          '  var j = item.json;',
          '  var tel = (j.telefono||"").replace(/[\\s\\-\\(\\)]/g,"");',
          '  if (!tel) return { json: Object.assign({}, j, { skip: true }) };',
          '  var phone = tel;',
          '  if (!phone.startsWith("+51")) {',
          '    if (phone.startsWith("51")) phone = "+" + phone;',
          '    else if (phone.startsWith("9") && phone.length===9) phone = "+51" + phone;',
          '    else if (phone.startsWith("01")) phone = "+51" + phone.slice(1);',
          '    else phone = "+51" + phone;',
          '  }',
          '  var isMobile = /^\\+519/.test(phone);',
          '  var sms = "Hola! Soy SofIA, IA para clinicas dentales en Lima. Automatiza citas por WhatsApp 24/7 y reduce cancelaciones. Demo gratis disponible. Responde para info. STOP para no recibir mas.";',
          '  return { json: {',
          '    record_id:  j.id,',
          '    nombre:     j.nombre,',
          '    phone_e164: phone,',
          '    is_mobile:  isMobile,',
          '    sms_text:   sms,',
          '    skip:       !isMobile,',
          '    fecha_hoy:  new Date().toISOString().slice(0,10)',
          '  }};',
          '});'
        ].join('\n')
      }
    },

    // IF: solo celulares
    {
      id: 'sms-04', name: 'IF Es Celular',
      type: 'n8n-nodes-base.if', typeVersion: 2,
      position: [660, 400],
      parameters: {
        conditions: {
          options: { caseSensitive: false, leftValue: '', typeValidation: 'loose' },
          conditions: [{ id: 'c1', leftValue: '={{ $json.is_mobile }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
          combinator: 'and'
        },
        options: {}
      }
    },

    // Enviar SMS via Twilio
    {
      id: 'sms-05', name: 'Enviar SMS Twilio',
      type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
      position: [880, 280],
      onError: 'continueRegularOutput',
      parameters: {
        method: 'POST',
        url: `=https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
        authentication: 'genericCredentialType',
        genericAuthType: 'httpBasicAuth',
        sendBody: true,
        contentType: 'form-urlencoded',
        bodyParameters: {
          parameters: [
            { name: 'To',   value: '={{ $json.phone_e164 }}' },
            { name: 'From', value: '={{ $env.TWILIO_FROM || "+1XXXXXXXXXX" }}' },
            { name: 'Body', value: '={{ $json.sms_text }}' }
          ]
        },
        options: {}
      }
    },

    // Actualizar: sms_enviado
    airtableUpdateNode('sms-06', 'Actualizar SMS Enviado', [1100, 280],
      { status: 'sms_enviado', fecha_followup: '={{ $json.fecha_hoy }}' }
    ),

    // Leads fijos (no celular) - actualizar igual para no reintentar
    airtableUpdateNode('sms-07', 'Actualizar Sin Celular', [880, 560],
      { status: 'sms_enviado', fecha_followup: '={{ $json.fecha_hoy }}' }
    )
  ],
  connections: {
    'CRON 10am':      { main: [[{ node: 'Get Leads SMS', type: 'main', index: 0 }]] },
    'Get Leads SMS':  { main: [[{ node: 'Preparar Tel', type: 'main', index: 0 }]] },
    'Preparar Tel':   { main: [[{ node: 'IF Es Celular', type: 'main', index: 0 }]] },
    'IF Es Celular':  { main: [
      [{ node: 'Enviar SMS Twilio', type: 'main', index: 0 }],
      [{ node: 'Actualizar Sin Celular', type: 'main', index: 0 }]
    ]},
    'Enviar SMS Twilio': { main: [[{ node: 'Actualizar SMS Enviado', type: 'main', index: 0 }]] }
  }
};

// ─────────────────────────────────────────────────────────────
// WORKFLOW 3: Llamada Follow-up (día 9+ sin respuesta)
// ─────────────────────────────────────────────────────────────
const TWIML_CALL = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Mia-Neural">Hola, buenos dias. Llamamos de parte de SofIA, el asistente inteligente para clinicas dentales en Lima. Le escribimos hace unos dias sobre como automatizar la agenda de citas por WhatsApp. Si le interesa una demostracion gratuita, por favor responda el mensaje de texto que le enviamos. Muchas gracias y hasta luego.</Say></Response>`;

const WF_CALL = {
  name: 'SofIA - Llamada Follow-up',
  settings: { executionOrder: 'v1' },
  staticData: null,
  nodes: [
    // CRON: lun-vie 11am Lima (16:00 UTC)
    {
      id: 'call-01', name: 'CRON 11am',
      type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1,
      position: [0, 400],
      parameters: {
        rule: { interval: [{ field: 'cronExpression', expression: '0 16 * * 1-5' }] }
      }
    },

    // Get leads: sms_enviado hace 4+ días, max 5/día
    airtableListNode(
      'call-02', 'Get Leads Llamada', [220, 400],
      `AND({status}='sms_enviado',IS_BEFORE({fecha_followup},DATEADD(TODAY(),-3,'days')))`,
      5
    ),

    // Preparar datos para llamada
    {
      id: 'call-03', name: 'Preparar Llamada',
      type: 'n8n-nodes-base.code', typeVersion: 2,
      position: [440, 400],
      parameters: {
        jsCode: [
          'var all = $input.all();',
          'return all.map(function(item) {',
          '  var j = item.json;',
          '  var tel = (j.telefono||"").replace(/[\\s\\-\\(\\)]/g,"");',
          '  var phone = tel;',
          '  if (!phone.startsWith("+51")) {',
          '    if (phone.startsWith("9") && phone.length===9) phone = "+51"+phone;',
          '    else if (phone.startsWith("51")) phone = "+"+phone;',
          '    else if (phone.startsWith("01")) phone = "+51"+phone.slice(1);',
          '    else phone = "+51"+phone;',
          '  }',
          '  return { json: {',
          '    record_id:   j.id,',
          '    nombre:      j.nombre,',
          '    phone_e164:  phone,',
          `    twilio_sid:  "${TWILIO_SID}",`,
          '    fecha_hoy:   new Date().toISOString().slice(0,10)',
          '  }};',
          '});'
        ].join('\n')
      }
    },

    // Hacer llamada Twilio
    {
      id: 'call-04', name: 'Hacer Llamada',
      type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
      position: [660, 400],
      onError: 'continueRegularOutput',
      parameters: {
        method: 'POST',
        url: `={{ "https://api.twilio.com/2010-04-01/Accounts/" + $json.twilio_sid + "/Calls.json" }}`,
        authentication: 'genericCredentialType',
        genericAuthType: 'httpBasicAuth',
        sendBody: true,
        contentType: 'form-urlencoded',
        bodyParameters: {
          parameters: [
            { name: 'To',    value: '={{ $json.phone_e164 }}' },
            { name: 'From',  value: '={{ $env.TWILIO_FROM || "+1XXXXXXXXXX" }}' },
            { name: 'Twiml', value: TWIML_CALL }
          ]
        },
        options: {}
      }
    },

    // Actualizar: contactado_tel
    airtableUpdateNode('call-05', 'Actualizar Llamada', [880, 400],
      { status: 'contactado_tel' }
    )
  ],
  connections: {
    'CRON 11am':       { main: [[{ node: 'Get Leads Llamada', type: 'main', index: 0 }]] },
    'Get Leads Llamada': { main: [[{ node: 'Preparar Llamada', type: 'main', index: 0 }]] },
    'Preparar Llamada':  { main: [[{ node: 'Hacer Llamada', type: 'main', index: 0 }]] },
    'Hacer Llamada':     { main: [[{ node: 'Actualizar Llamada', type: 'main', index: 0 }]] }
  }
};

// ─────────────────────────────────────────────────────────────
// Deploy todos
// ─────────────────────────────────────────────────────────────
async function deploy(wf) {
  fs.writeFileSync(`saas/${wf.name.replace(/[^a-z0-9]/gi,'_')}.json`, JSON.stringify(wf, null, 2));
  const r = await apiPost('/api/v1/workflows', wf);
  if (r.id) {
    console.log(`✅ ${wf.name} → ID: ${r.id}`);
    return r.id;
  } else {
    console.log(`❌ ${wf.name} → ${JSON.stringify(r).slice(0, 200)}`);
    return null;
  }
}

async function main() {
  console.log('Desplegando 3 workflows de outreach...\n');
  await deploy(WF_EMAIL);
  await deploy(WF_SMS);
  await deploy(WF_CALL);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('CONFIGURACION PENDIENTE:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('1. WF Email: asignar credencial SMTP Brevo al nodo "Enviar Email"');
  console.log('2. WF SMS + Llamada: crear cuenta Twilio y asignar "HTTP Basic Auth"');
  console.log('   al nodo "Enviar SMS Twilio" y "Hacer Llamada"');
  console.log('3. WF SMS + Llamada: actualizar TWILIO_SID y TWILIO_FROM en nodo "Preparar..."');
  console.log('4. Activar WF Email cuando tengas SMTP listo');
  console.log('5. Activar WF SMS + Llamada cuando tengas número Twilio Peru');
  console.log('\nFlujo de status:');
  console.log('nuevo → email_enviado → sms_enviado → contactado_tel → respondio/archivado');
}

main().catch(console.error);
