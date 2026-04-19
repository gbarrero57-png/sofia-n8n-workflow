/**
 * build_barber_email.mjs
 * Creates n8n email outreach workflow for barberías:
 * "Barber - Email Outreach"
 * Reads from barberia_leads (tblpsK9PoL4bFsAZB), status=nuevo WITH email
 * → OpenAI personalized pitch (Barber Loyalty App)
 * → Brevo SMTP send
 * → Airtable update status=email_enviado
 * → Telegram summary
 */

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const BASE    = 'https://workflows.n8n.redsolucionesti.com';

const AT_BASE   = 'app6a4u9dvXMxwOnY';
const AT_TABLE  = 'tblpsK9PoL4bFsAZB';
const AT_TOKEN  = process.env.AIRTABLE_PAT;
const AT_CRED   = { id: 'YmCX94YiEOb7UtNi', name: 'Airtable Personal Access Token account' };

const OPENAI_KEY  = process.env.OPENAI_API_KEY;
const SMTP_CRED   = { id: 'YXXq2HK4nwlXXGkU', name: 'SMTP account' };

const TG_CHAT = '-4523041658';
const TG_CRED = { telegramApi: { id: 'cSaxAEvIePNLpINc', name: 'Telegram account' } };

const nodes = [

  // ── 1. Schedule: every day 9am Lima ────────────────────────────
  {
    id: 'cron-barber', name: 'Cron Barber Email',
    type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2,
    position: [0, 400],
    parameters: {
      rule: { interval: [{ field: 'hours', hoursInterval: 24 }] },
      triggerAtHour: 9, triggerAtMinute: 0,
      timezone: 'America/Lima'
    }
  },

  // ── 2. Get leads from Airtable ──────────────────────────────────
  {
    id: 'get-leads', name: 'Get Leads Barber Email',
    type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
    position: [220, 400],
    parameters: {
      method: 'GET',
      url: 'https://api.airtable.com/v0/' + AT_BASE + '/' + AT_TABLE,
      sendQuery: true,
      queryParameters: {
        parameters: [
          { name: 'filterByFormula', value: "AND({status}='nuevo',{email}!='')" },
          { name: 'maxRecords',      value: '50' },
          { name: 'sort[0][field]',  value: 'rating' },
          { name: 'sort[0][direction]', value: 'desc' }
        ]
      },
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'Authorization', value: 'Bearer ' + AT_TOKEN }
        ]
      },
      options: {}
    }
  },

  // ── 3. Preparar leads ───────────────────────────────────────────
  {
    id: 'prep-leads', name: 'Preparar Leads',
    type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [440, 400],
    parameters: {
      jsCode: [
        'var data = $input.first().json;',
        'var records = data.records || [];',
        'if (records.length === 0) return [];',
        'return records.map(function(rec) {',
        '  var f = rec.fields || {};',
        '  return { json: {',
        '    record_id:    rec.id,',
        '    nombre:       f.nombre       || "",',
        '    email:        f.email        || "",',
        '    telefono:     f.telefono     || "",',
        '    direccion:    f.direccion    || "",',
        '    distrito:     f.distrito     || "",',
        '    rating:       f.rating       || 0,',
        '    total_resenas:f.total_resenas|| 0,',
        '    website:      f.website      || "",',
        '    fuente:       f.fuente       || "google_maps",',
        '    fecha_hoy:    new Date().toISOString().slice(0,10)',
        '  }};',
        '});'
      ].join('\n')
    }
  },

  // ── 4. IF hay leads ─────────────────────────────────────────────
  {
    id: 'if-leads', name: 'IF Hay Leads',
    type: 'n8n-nodes-base.if', typeVersion: 2,
    position: [660, 400],
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' },
        conditions: [{
          id: 'c1', leftValue: '={{ $json.email }}',
          rightValue: '', operator: { type: 'string', operation: 'notEmpty' }
        }],
        combinator: 'and'
      }
    }
  },

  // ── 5. Preparar Prompt OpenAI ───────────────────────────────────
  {
    id: 'prep-prompt', name: 'Preparar Prompt Barber',
    type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [880, 280],
    parameters: {
      jsCode: [
        'var all = $input.all();',
        'return all.map(function(item) {',
        '  var j = item.json;',
        '  var tieneWeb = j.website ? "si (" + j.website + ")" : "no";',
        '  var prompt =',
        '    "Eres experto en ventas B2B para negocios de barberia en Peru.\\n" +',
        '    "Genera un asunto y un parrafo de apertura PERSONALIZADO para cold outreach.\\n\\n" +',
        '    "Barberia: " + (j.nombre || "la barberia") + "\\n" +',
        '    "Zona: " + (j.direccion || j.distrito || "Lima") + "\\n" +',
        '    "Rating Google: " + (j.rating || 0) + " estrellas (" + (j.total_resenas || 0) + " resenas)\\n" +',
        '    "Tiene web propia: " + tieneWeb + "\\n\\n" +',
        '    "Producto: Barber Loyalty App — app de tarjetas de fidelidad digital.\\n" +',
        '    "Beneficios clave:\\n" +',
        '    "- Tarjeta digital de 10 visitas con premios configurables\\n" +',
        '    "- Email automatico en cada visita al cliente\\n" +',
        '    "- Panel admin para ver historial y premios\\n" +',
        '    "- Sin papel, sin perder tarjetas, mas visitas repetidas\\n\\n" +',
        '    "Reglas ASUNTO: max 55 chars, despierta curiosidad, NO: gratis/oferta/urgente.\\n" +',
        '    "Reglas HOOK: 2 oraciones max, menciona algo especifico de la barberia, problema de clientes que no vuelven.\\n\\n" +',
        '    "Responde SOLO JSON sin markdown: {\\"asunto\\":\\"...\\",\\"hook\\":\\"...\\"}";',
        '  return { json: Object.assign({}, j, {',
        '    openai_body: JSON.stringify({',
        '      model: "gpt-4o-mini", temperature: 0.8, max_tokens: 300,',
        '      messages: [{ role: "user", content: prompt }]',
        '    })',
        '  })};',
        '});'
      ].join('\n')
    }
  },

  // ── 6. Llamar OpenAI ────────────────────────────────────────────
  {
    id: 'call-openai', name: 'Llamar OpenAI Barber',
    type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
    position: [1100, 280],
    parameters: {
      method: 'POST',
      url: 'https://api.openai.com/v1/chat/completions',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'Authorization', value: 'Bearer ' + OPENAI_KEY },
          { name: 'Content-Type',  value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'string',
      body: '={{ $json.openai_body }}',
      options: {}
    }
  },

  // ── 7. Parsear respuesta OpenAI ─────────────────────────────────
  {
    id: 'parsear-email', name: 'Parsear Email Barber',
    type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [1320, 280],
    parameters: {
      jsCode: [
        'var openaiItems = $input.all();',
        'var leadItems   = $("Preparar Prompt Barber").all();',
        'var results     = [];',
        'for (var i = 0; i < openaiItems.length; i++) {',
        '  var lead = leadItems[i] ? leadItems[i].json : {};',
        '  if (!lead.email) continue;',
        '  var raw  = openaiItems[i].json;',
        '  var text = (raw.choices && raw.choices[0] && raw.choices[0].message)',
        '    ? raw.choices[0].message.content',
        '    : JSON.stringify(raw);',
        '  var parsed = {};',
        '  try {',
        '    var clean = text.replace(/```json\\n?/g,"").replace(/```/g,"").trim();',
        '    parsed = JSON.parse(clean);',
        '  } catch(e) {',
        '    parsed = { asunto: "Tu barberia merece clientes fieles", hook: text.slice(0,300) };',
        '  }',
        '  results.push({ json: {',
        '    record_id:    lead.record_id,',
        '    nombre:       lead.nombre,',
        '    email_real:   lead.email,',
        '    direccion:    lead.direccion,',
        '    distrito:     lead.distrito,',
        '    rating:       lead.rating,',
        '    total_resenas:lead.total_resenas,',
        '    website:      lead.website,',
        '    email_asunto: parsed.asunto || "Tu barberia merece clientes fieles",',
        '    hook:         parsed.hook   || "",',
        '    fecha_hoy:    lead.fecha_hoy',
        '  }});',
        '}',
        'return results;'
      ].join('\n')
    }
  },

  // ── 8. Construir HTML ───────────────────────────────────────────
  {
    id: 'build-html', name: 'Construir HTML Barber',
    type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [1540, 280],
    parameters: {
      jsCode: [
        'var all = $input.all();',
        'return all.map(function(item) {',
        '  var j = item.json;',
        '  var nombre  = (j.nombre || "la barberia").replace(/[<>]/g,"");',
        '  var hook    = (j.hook   || "").replace(/[<>]/g,"");',
        '  var rating  = j.rating ? j.rating + " ⭐ (" + j.total_resenas + " reseñas)" : "";',
        '  var zona    = (j.distrito || j.direccion || "Lima").replace(/[<>]/g,"");',
        '',
        '  var html = [',
        '    "<!DOCTYPE html><html><head>",',
        '    "<meta charset=\\"UTF-8\\">",',
        '    "<style>",',
        '    "  body { font-family: Arial,sans-serif; background:#f5f5f5; margin:0; padding:0; }",',
        '    "  .wrap { max-width:600px; margin:0 auto; background:#fff; border-radius:8px; overflow:hidden; }",',
        '    "  .header { background:#1a1a1a; padding:32px 40px; text-align:center; }",',
        '    "  .header h1 { color:#FFD700; font-size:26px; margin:0; letter-spacing:2px; }",',
        '    "  .header p  { color:#aaa; font-size:13px; margin:6px 0 0; }",',
        '    "  .body   { padding:36px 40px; color:#333; line-height:1.7; }",',
        '    "  .stamp  { display:inline-block; background:#FFD700; color:#1a1a1a; border-radius:50%;",',
        '    "            width:36px; height:36px; text-align:center; line-height:36px;",',
        '    "            font-size:18px; margin:3px; font-weight:bold; }",',
        '    "  .stamp.empty { background:#eee; }",',
        '    "  .card   { background:#f9f9f9; border:2px dashed #FFD700; border-radius:12px;",',
        '    "            padding:20px; text-align:center; margin:24px 0; }",',
        '    "  .cta    { display:block; background:#FFD700; color:#1a1a1a; text-decoration:none;",',
        '    "            padding:14px 32px; border-radius:8px; font-weight:bold;",',
        '    "            font-size:16px; text-align:center; margin:28px auto; width:fit-content; }",',
        '    "  .footer { background:#1a1a1a; color:#777; padding:20px 40px; font-size:12px; text-align:center; }",',
        '    "</style></head><body>",',
        '    "<div class=\\"wrap\\">",',
        '    "  <div class=\\"header\\">",',
        '    "    <h1>✂️ BARBER LOYALTY</h1>",',
        '    "    <p>Programa de fidelidad digital para barberías</p>",',
        '    "  </div>",',
        '    "  <div class=\\"body\\">",',
        '    "    <p>Hola <strong>" + nombre + "</strong>,</p>",',
        '    "    <p>" + hook + "</p>",',
        '    "    <div class=\\"card\\">",',
        '    "      <p style=\\"font-weight:bold;font-size:15px;color:#1a1a1a;margin:0 0 12px\\">",',
        '    "        Tu cliente acumula así:</p>",',
        '    "      <div>",',
        '    "        <span class=\\"stamp\\">✂</span><span class=\\"stamp\\">✂</span><span class=\\"stamp\\">✂</span>",',
        '    "        <span class=\\"stamp\\">✂</span><span class=\\"stamp\\">✂</span>",',
        '    "        <span class=\\"stamp empty\\">○</span><span class=\\"stamp empty\\">○</span>",',
        '    "        <span class=\\"stamp empty\\">○</span><span class=\\"stamp empty\\">○</span>",',
        '    "        <span class=\\"stamp empty\\">○</span>",',
        '    "      </div>",',
        '    "      <p style=\\"font-size:13px;color:#666;margin:10px 0 0\\">5/10 — le faltan 5 cortes para su próximo premio</p>",',
        '    "    </div>",',
        '    "    <p><strong>¿Qué incluye Barber Loyalty?</strong></p>",',
        '    "    <ul>",',
        '    "      <li>📱 Tarjeta digital de 10 visitas — sin papel que perder</li>",',
        '    "      <li>🎁 Premios configurables por ti: corte gratis, descuento, producto</li>",',
        '    "      <li>📧 Email automático al cliente en cada visita</li>",',
        '    "      <li>📊 Panel admin con historial de clientes y canjes</li>",',
        '    "      <li>⚡ Solo escaneas el DNI del cliente — listo en 3 segundos</li>",',
        '    "    </ul>",',
        '    "    <a class=\\"cta\\" href=\\"https://loyalty.redsolucionesti.com\\">Ver demo gratuita →</a>",',
        '    "    <p style=\\"font-size:13px;color:#888\\">",',
        '    "      Atendemos " + zona + (rating ? " · " + rating : "") + "</p>",',
        '    "  </div>",',
        '    "  <div class=\\"footer\\">",',
        '    "    © 2025 Barber Loyalty by RedSolucionesti · Lima, Perú<br>",',
        '    "    Recibiste este email porque tu barbería aparece en Google Maps.<br>",',
        '    "    <a href=\\"#\\" style=\\"color:#FFD700\\">Dar de baja</a>",',
        '    "  </div>",',
        '    "</div></body></html>"',
        '  ].join("\\n");',
        '',
        '  return { json: Object.assign({}, j, { email_html: html }) };',
        '});'
      ].join('\n')
    }
  },

  // ── 9. Enviar Email Brevo ───────────────────────────────────────
  {
    id: 'send-email', name: 'Enviar Email Barber',
    type: 'n8n-nodes-base.emailSend', typeVersion: 2,
    position: [1760, 280],
    parameters: {
      fromEmail: '"Barber Loyalty" <gabriel@redsolucionesti.com>',
      toEmail:   '={{ $json.email_real }}',
      bccEmail:  'gabriel@redsolucionesti.com',
      subject:   '={{ $json.email_asunto }}',
      html:      '={{ $json.email_html }}',
      options:   {}
    },
    credentials: { smtp: SMTP_CRED }
  },

  // ── 10. Actualizar Airtable ─────────────────────────────────────
  {
    id: 'actualizar-at', name: 'Actualizar Email Enviado Barber',
    type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
    position: [1980, 280],
    parameters: {
      method: 'PATCH',
      url: 'https://api.airtable.com/v0/' + AT_BASE + '/' + AT_TABLE + '/={{ $json.record_id }}',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'Authorization', value: 'Bearer ' + AT_TOKEN },
          { name: 'Content-Type',  value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={"fields":{"status":"email_enviado","fecha_envio":"{{ $json.fecha_hoy }}"}}',
      options: {}
    }
  },

  // ── 11. Resumen ─────────────────────────────────────────────────
  {
    id: 'resumen-barber', name: 'Barber - Resumen',
    type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [2200, 280],
    parameters: {
      jsCode: [
        'var items = $input.all();',
        'var total = items.length;',
        'return [{ json: { total: total } }];'
      ].join('\n')
    }
  },

  // ── 12. Telegram ────────────────────────────────────────────────
  {
    id: 'tg-barber', name: 'Barber - Notificar Telegram',
    type: 'n8n-nodes-base.telegram', typeVersion: 1.2,
    position: [2420, 280],
    parameters: {
      chatId: TG_CHAT,
      text: [
        '=✂️ *Barber Loyalty - Emails Enviados*',
        '',
        '📊 *Resumen del día:*',
        '• Total enviados: {{ $json.total }}',
        '',
        '🕘 {{ $now.format(\'DD/MM/YYYY HH:mm\') }} Lima'
      ].join('\n'),
      additionalFields: { parse_mode: 'Markdown' }
    },
    credentials: TG_CRED
  }

];

const connections = {
  'Cron Barber Email':              { main: [[{ node: 'Get Leads Barber Email',           type: 'main', index: 0 }]] },
  'Get Leads Barber Email':         { main: [[{ node: 'Preparar Leads',                   type: 'main', index: 0 }]] },
  'Preparar Leads':                 { main: [[{ node: 'IF Hay Leads',                     type: 'main', index: 0 }]] },
  'IF Hay Leads': {
    main: [
      [{ node: 'Preparar Prompt Barber', type: 'main', index: 0 }],
      []
    ]
  },
  'Preparar Prompt Barber':         { main: [[{ node: 'Llamar OpenAI Barber',             type: 'main', index: 0 }]] },
  'Llamar OpenAI Barber':           { main: [[{ node: 'Parsear Email Barber',             type: 'main', index: 0 }]] },
  'Parsear Email Barber':           { main: [[{ node: 'Construir HTML Barber',            type: 'main', index: 0 }]] },
  'Construir HTML Barber':          { main: [[{ node: 'Enviar Email Barber',              type: 'main', index: 0 }]] },
  'Enviar Email Barber':            { main: [[{ node: 'Actualizar Email Enviado Barber',  type: 'main', index: 0 }]] },
  'Actualizar Email Enviado Barber':{ main: [[{ node: 'Barber - Resumen',                 type: 'main', index: 0 }]] },
  'Barber - Resumen':               { main: [[{ node: 'Barber - Notificar Telegram',      type: 'main', index: 0 }]] }
};

const wf = {
  name: 'Barber - Email Outreach',
  nodes,
  connections,
  settings: { executionOrder: 'v1' },
  staticData: null
};

const r = await fetch(`${BASE}/api/v1/workflows`, {
  method: 'POST',
  headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify(wf)
});
const j = await r.json();
if (!r.ok) { console.error('Error:', JSON.stringify(j).slice(0, 400)); process.exit(1); }
console.log('✅ Barber Email Outreach workflow created:', j.id);
console.log('   URL: https://workflows.n8n.redsolucionesti.com/workflow/' + j.id);
