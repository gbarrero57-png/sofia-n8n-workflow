/**
 * patch_email_v3.js
 * Email HTML profesional con CTA WhatsApp
 * Cambios vs v2:
 *   - OpenAI genera solo {asunto, hook} (no email completo)
 *   - Nuevo nodo "Construir HTML" inyecta hook en template profesional
 *   - emailSend cambia a modo html
 *   - CTA: WhatsApp wa.me/51905858566
 */
const https = require('https');

const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const WF_ID   = '8mglaD5SCaFB2XWZ';
const BASE    = 'workflows.n8n.redsolucionesti.com';
const AT_BASE  = 'app6a4u9dvXMxwOnY';
const AT_TABLE = 'tblBuVcKITk5GFoqk';
const AT_PAT   = 'pat5sJm0yS44SFj32.d405758758dca807b0b6dd628dffa64a99f50148c3cfad6cc1b5efca6af832ef';
const OPENAI_CRED = { id: 'SeCPLJI4mV6p2hJR', name: 'OpenAi account' };
const WA_LINK = 'https://wa.me/51905858566?text=Hola%20Gabriel%2C%20vi%20tu%20email%20sobre%20SofIA%20y%20quisiera%20saber%20m%C3%A1s';

function api(method, path, body) {
  const data = body ? JSON.stringify(body) : null;
  return new Promise((res, rej) => {
    const req = https.request({
      hostname: BASE, path, method,
      headers: {
        'X-N8N-API-KEY': N8N_KEY,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch(e) { res(d); } }); });
    req.on('error', rej);
    if (data) req.write(data);
    req.end();
  });
}

// ─── PROMPT: solo asunto + hook personalizado ───────────────────────────────
const PROMPT_TEMPLATE = `Eres experto en ventas B2B para clinicas dentales en Peru.
Genera un asunto de email y un parrafo de apertura PERSONALIZADO.

Clinica: {{NOMBRE}}
Zona: {{DIRECCION}}
Rating Google: {{RATING}} estrellas ({{RESENAS}} resenas)
Tiene web propia: {{TIENE_WEB}}

Producto: SofIA - asistente IA para clinicas dentales via WhatsApp que atiende pacientes 24/7, agenda citas automaticamente y envia recordatorios.

Reglas ASUNTO:
- Maximo 55 caracteres
- Despierta curiosidad o hace una pregunta
- NO usar: "gratis", "oferta", "urgente", "oportunidad"
- Ejemplo bueno: "Su clinica atiende pacientes a las 11pm?"

Reglas HOOK (parrafo de apertura):
- 2 oraciones maximas
- Menciona ALGO especifico: el nombre, la zona, o el rating
- Plantea naturalmente el problema de perder pacientes que escriben fuera de horario o que no reciben respuesta rapida
- Tono: directo y cercano, NO corporativo, NO vendedor agresivo
- NO menciones precios ni porcentajes inventados

Responde SOLO este JSON sin markdown ni explicaciones:
{"asunto":"...","hook":"..."}`;

// ─── HTML TEMPLATE (como string de JS para el Code node) ─────────────────────
// Usamos una funcion que devuelve el HTML string con reemplazos de {{NOMBRE}} y {{HOOK}}
const HTML_BUILDER_CODE = `
var all = $input.all();
return all.map(function(item) {
  var j = item.json;
  var nombre = (j.nombre || 'su clinica').replace(/[<>]/g, '');
  var hook   = (j.hook   || '').replace(/[<>]/g, '');
  var waLink = '${WA_LINK}';

  var H = [
    '<!DOCTYPE html><html lang="es"><head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1.0">',
    '<title>SofIA para Clinicas</title>',
    '</head>',
    '<body style="margin:0;padding:0;background:#EEF2F7;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;">',

    // Wrapper
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F7;padding:30px 0;">',
    '<tr><td align="center">',
    '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">',

    // ── HEADER ──
    '<tr><td style="background:linear-gradient(135deg,#7C3AED 0%,#9F67FA 100%);padding:32px 40px;">',
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>',
    '<td>',
    '<div style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-1px;">SofIA</div>',
    '<div style="font-size:11px;color:rgba(255,255,255,0.75);margin-top:3px;letter-spacing:1px;text-transform:uppercase;">Asistente IA para Clinicas Dentales</div>',
    '</td>',
    '<td align="right" style="font-size:36px;">&#129463;</td>',
    '</tr></table>',
    '</td></tr>',

    // ── SALUDO + HOOK ──
    '<tr><td style="padding:36px 40px 24px;">',
    '<p style="margin:0 0 6px;font-size:13px;color:#94A3B8;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Para el equipo de</p>',
    '<h2 style="margin:0 0 22px;font-size:22px;color:#1E293B;font-weight:800;">' + nombre + '</h2>',
    '<p style="margin:0;font-size:15px;color:#374151;line-height:1.75;">' + hook + '</p>',
    '</td></tr>',

    // ── VALUE PROPS ──
    '<tr><td style="padding:0 40px 28px;">',
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0FF;border-radius:12px;border-left:4px solid #7C3AED;">',
    '<tr><td style="padding:20px 24px 12px;">',
    '<p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#7C3AED;text-transform:uppercase;letter-spacing:1px;">Con SofIA tu clinica puede:</p>',
    '<table width="100%" cellpadding="0" cellspacing="0">',
    '<tr><td style="padding:5px 0;font-size:14px;color:#374151;">&#128172;&nbsp; Agendar citas por WhatsApp <strong>24/7</strong>, incluso de madrugada</td></tr>',
    '<tr><td style="padding:5px 0;font-size:14px;color:#374151;">&#128276;&nbsp; Enviar recordatorios automaticos y <strong>reducir cancelaciones</strong></td></tr>',
    '<tr><td style="padding:5px 0;font-size:14px;color:#374151;">&#8987;&nbsp; Atender mensajes fuera de horario <strong>sin personal extra</strong></td></tr>',
    '<tr><td style="padding:5px 0;font-size:14px;color:#374151;">&#128279;&nbsp; Funciona con tus sistemas actuales &mdash; <strong>sin cambios</strong></td></tr>',
    '</table>',
    '</td></tr></table>',
    '</td></tr>',

    // ── SEPARADOR ──
    '<tr><td style="padding:0 40px;"><div style="height:1px;background:#E2E8F0;"></div></td></tr>',

    // ── CTA ──
    '<tr><td style="padding:28px 40px 32px;" align="center">',
    '<p style="margin:0 0 18px;font-size:14px;color:#64748B;text-align:center;">',
    '&#128064;&nbsp; <strong>15 minutos</strong> para que veas como funcionaria en tu clinica.',
    '</p>',
    '<a href="' + waLink + '" style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:15px 36px;border-radius:50px;letter-spacing:0.3px;">',
    '&#128172;&nbsp; Escribir por WhatsApp',
    '</a>',
    '<p style="margin:14px 0 0;font-size:12px;color:#94A3B8;">Respondo en minutos &bull; Sin compromiso</p>',
    '</td></tr>',

    // ── FIRMA ──
    '<tr><td style="padding:20px 40px 24px;border-top:1px solid #E2E8F0;">',
    '<table cellpadding="0" cellspacing="0"><tr>',
    '<td style="width:42px;height:42px;background:#7C3AED;border-radius:50%;text-align:center;vertical-align:middle;">',
    '<span style="font-size:18px;color:#fff;line-height:42px;">G</span>',
    '</td>',
    '<td style="padding-left:12px;">',
    '<div style="font-size:14px;color:#1E293B;font-weight:700;">Gabriel Barrero</div>',
    '<div style="font-size:12px;color:#64748B;margin-top:2px;">SofIA &bull; RedSolucionesti &bull; Lima, Peru</div>',
    '<div style="font-size:12px;color:#7C3AED;margin-top:2px;">gabriel@redsolucionesti.com</div>',
    '</td>',
    '</tr></table>',
    '</td></tr>',

    // ── FOOTER ──
    '<tr><td style="background:#F8F9FC;padding:16px 40px;border-top:1px solid #E2E8F0;">',
    '<p style="margin:0;font-size:10px;color:#94A3B8;text-align:center;line-height:1.6;">',
    '&copy; 2026 RedSolucionesti.com &middot; Lima, Peru<br>',
    'Recibiste este email porque tu clinica aparece en Google Maps.<br>',
    '<a href="mailto:gabriel@redsolucionesti.com?subject=Dar%20de%20baja%20lista" style="color:#94A3B8;">No deseo recibir mas emails</a>',
    '</p>',
    '</td></tr>',

    // cierre
    '</table>',
    '</td></tr></table>',
    '</body></html>'
  ].join('');

  return { json: {
    record_id:    j.record_id,
    nombre:       j.nombre,
    email_real:   j.email_real,
    email_asunto: j.email_asunto,
    html_body:    H,
    fecha_hoy:    j.fecha_hoy
  }};
});
`.trim();

// ─── PARSEAR EMAIL (extrae asunto+hook en lugar de asunto+cuerpo) ─────────────
const PARSEAR_EMAIL_CODE = `
var openaiItems = $input.all();
var leadItems   = $('Preparar Prompt').all();
var results     = [];

for (var i = 0; i < openaiItems.length; i++) {
  var lead = leadItems[i] ? leadItems[i].json : {};
  if (lead._skip) continue;
  if (!lead.email)  continue;

  var raw  = openaiItems[i].json;
  var text = (raw.choices && raw.choices[0] && raw.choices[0].message)
    ? raw.choices[0].message.content
    : JSON.stringify(raw);

  var parsed = {};
  try {
    var clean = text.replace(/\`\`\`json\\n?/g,'').replace(/\`\`\`/g,'').trim();
    parsed = JSON.parse(clean);
  } catch(e) {
    parsed = { asunto: 'SofIA para ' + lead.nombre, hook: text.slice(0, 300) };
  }

  results.push({ json: {
    record_id:    lead.record_id,
    nombre:       lead.nombre,
    email_real:   lead.email,
    email_asunto: '[TEST -> ' + lead.email + '] ' + (parsed.asunto || ''),
    hook:         parsed.hook || parsed.cuerpo || '',
    fecha_hoy:    lead.fecha_hoy
  }});
}
return results;
`.trim();

// ─── PREPARAR PATCH (para Airtable update) ───────────────────────────────────
const PREPARAR_PATCH_CODE = `
var all = $input.all();
return all.map(function(item) {
  var j = item.json;
  return { json: {
    patch_url:  'https://api.airtable.com/v0/${AT_BASE}/${AT_TABLE}/' + j.record_id,
    patch_body: JSON.stringify({
      fields: {
        status:       'email_enviado',
        fecha_envio:  j.fecha_hoy,
        email_asunto: j.email_asunto
      },
      typecast: true
    }),
    record_id: j.record_id,
    nombre:    j.nombre
  }};
});
`.trim();

// ─── PREPARAR PROMPT (sin cambios vs v2) ─────────────────────────────────────
const PREPARAR_PROMPT_CODE = `
var all = $input.all();
return all.map(function(item) {
  var j = item.json;
  if (j._skip) return { json: j };
  var tpl = ${JSON.stringify(PROMPT_TEMPLATE)};
  var prompt = tpl
    .replace('{{NOMBRE}}',    j.nombre    || 'la clinica')
    .replace('{{DIRECCION}}', j.direccion || 'Lima')
    .replace('{{RATING}}',    String(j.rating || 0))
    .replace('{{RESENAS}}',   String(j.total_resenas || 0))
    .replace('{{TIENE_WEB}}', j.website ? 'si (' + j.website + ')' : 'no');
  return { json: {
    record_id:     j.record_id,
    nombre:        j.nombre        || '',
    email:         j.email         || '',
    direccion:     j.direccion     || '',
    rating:        j.rating        || 0,
    total_resenas: j.total_resenas || 0,
    fecha_hoy:     new Date().toISOString().slice(0,10),
    openai_body:   JSON.stringify({
      model:       'gpt-4o-mini',
      temperature: 0.8,
      max_tokens:  300,
      messages:    [{ role: 'user', content: prompt }]
    })
  }};
});
`.trim();

// ─── WORKFLOW COMPLETO (10 nodos) ─────────────────────────────────────────────
function buildWorkflow(smtpCred) {
  const AT_FILTER = "AND(OR({status}='nuevo',{status}='sin_web'),NOT({email}=''))";

  return {
    name: 'SofIA - Email Inicial',
    settings: { executionOrder: 'v1' },
    staticData: null,
    nodes: [
      // 1: Trigger manual
      {
        id: 'em-01', name: 'Inicio Manual',
        type: 'n8n-nodes-base.manualTrigger', typeVersion: 1,
        position: [0, 400], parameters: {}
      },
      // 2: GET Airtable via HTTP (Airtable v2 roto)
      {
        id: 'em-02', name: 'Get Leads Email',
        type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
        position: [220, 400],
        parameters: {
          method: 'GET',
          url: `https://api.airtable.com/v0/${AT_BASE}/${AT_TABLE}`,
          authentication: 'none',
          sendHeaders: true,
          headerParameters: { parameters: [{ name: 'Authorization', value: `Bearer ${AT_PAT}` }] },
          sendQuery: true,
          queryParameters: {
            parameters: [
              { name: 'filterByFormula', value: AT_FILTER },
              { name: 'maxRecords',      value: '10' },
              { name: 'sort[0][field]',  value: 'created_at' },
              { name: 'sort[0][direction]', value: 'desc' }
            ]
          },
          options: {}
        }
      },
      // 3: Parsear records[] → items
      {
        id: 'em-03', name: 'Parsear Leads',
        type: 'n8n-nodes-base.code', typeVersion: 2,
        position: [440, 400],
        parameters: {
          jsCode: [
            'var body    = $input.first().json;',
            'var records = body.records || [];',
            'if (records.length === 0) return [{ json: { _skip: true, msg: "Sin leads disponibles" } }];',
            'return records.map(function(rec) {',
            '  var f = rec.fields || {};',
            '  return { json: {',
            '    record_id:     rec.id,',
            '    nombre:        f.nombre        || f.name    || "",',
            '    email:         f.email         || "",',
            '    direccion:     f.direccion     || f.address || "Lima",',
            '    rating:        f.rating        || 0,',
            '    total_resenas: f.total_resenas || f.resenas || 0,',
            '    website:       f.website       || "",',
            '    status:        f.status        || ""',
            '  }};',
            '});'
          ].join('\n')
        }
      },
      // 4: Preparar prompt OpenAI
      {
        id: 'em-04', name: 'Preparar Prompt',
        type: 'n8n-nodes-base.code', typeVersion: 2,
        position: [660, 400],
        parameters: { jsCode: PREPARAR_PROMPT_CODE }
      },
      // 5: Llamar OpenAI
      {
        id: 'em-05', name: 'OpenAI Generar Email',
        type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
        position: [880, 400],
        onError: 'continueRegularOutput',
        credentials: { openAiApi: OPENAI_CRED },
        parameters: {
          method: 'POST',
          url: 'https://api.openai.com/v1/chat/completions',
          authentication: 'predefinedCredentialType',
          nodeCredentialType: 'openAiApi',
          sendBody: true,
          contentType: 'raw',
          rawContentType: 'application/json',
          body: '={{ $json.openai_body }}',
          options: {}
        }
      },
      // 6: Parsear respuesta OpenAI → extrae asunto + hook
      {
        id: 'em-06', name: 'Parsear Email',
        type: 'n8n-nodes-base.code', typeVersion: 2,
        position: [1100, 400],
        parameters: { jsCode: PARSEAR_EMAIL_CODE }
      },
      // 7: Inyectar en template HTML
      {
        id: 'em-07', name: 'Construir HTML',
        type: 'n8n-nodes-base.code', typeVersion: 2,
        position: [1320, 400],
        parameters: { jsCode: HTML_BUILDER_CODE }
      },
      // 8: Enviar email HTML via Brevo SMTP
      {
        id: 'em-08', name: 'Enviar Email',
        type: 'n8n-nodes-base.emailSend', typeVersion: 2,
        position: [1540, 400],
        onError: 'continueRegularOutput',
        ...(smtpCred ? { credentials: smtpCred } : {}),
        parameters: {
          fromEmail: '"SofIA for Clinics" <gabriel@redsolucionesti.com>',
          toEmail:   'gbarrero57@gmail.com',
          subject:   '={{ $json.email_asunto }}',
          emailType: 'html',
          message:   '={{ $json.html_body }}',
          options: {}
        }
      },
      // 9: Preparar PATCH Airtable
      {
        id: 'em-09', name: 'Preparar PATCH',
        type: 'n8n-nodes-base.code', typeVersion: 2,
        position: [1760, 400],
        parameters: { jsCode: PREPARAR_PATCH_CODE }
      },
      // 10: PATCH Airtable → marcar email_enviado
      {
        id: 'em-10', name: 'Actualizar Email Enviado',
        type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
        position: [1980, 400],
        onError: 'continueRegularOutput',
        parameters: {
          method: 'PATCH',
          url: '={{ $json.patch_url }}',
          authentication: 'none',
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: 'Authorization',  value: `Bearer ${AT_PAT}` },
              { name: 'Content-Type',   value: 'application/json' }
            ]
          },
          sendBody: true,
          contentType: 'raw',
          rawContentType: 'application/json',
          body: '={{ $json.patch_body }}',
          options: {}
        }
      }
    ],
    connections: {
      'Inicio Manual':        { main: [[{ node: 'Get Leads Email',        type: 'main', index: 0 }]] },
      'Get Leads Email':      { main: [[{ node: 'Parsear Leads',          type: 'main', index: 0 }]] },
      'Parsear Leads':        { main: [[{ node: 'Preparar Prompt',        type: 'main', index: 0 }]] },
      'Preparar Prompt':      { main: [[{ node: 'OpenAI Generar Email',   type: 'main', index: 0 }]] },
      'OpenAI Generar Email': { main: [[{ node: 'Parsear Email',          type: 'main', index: 0 }]] },
      'Parsear Email':        { main: [[{ node: 'Construir HTML',         type: 'main', index: 0 }]] },
      'Construir HTML':       { main: [[{ node: 'Enviar Email',           type: 'main', index: 0 }]] },
      'Enviar Email':         { main: [[{ node: 'Preparar PATCH',         type: 'main', index: 0 }]] },
      'Preparar PATCH':       { main: [[{ node: 'Actualizar Email Enviado', type: 'main', index: 0 }]] }
    }
  };
}

async function main() {
  // 1: Leer workflow actual para preservar credencial SMTP
  console.log('Leyendo workflow actual...');
  const current = await api('GET', `/api/v1/workflows/${WF_ID}`);
  if (!current.nodes) {
    console.error('ERROR al leer workflow:', JSON.stringify(current).slice(0,300));
    process.exit(1);
  }

  // Preservar credencial SMTP del nodo emailSend
  let smtpCred = null;
  const emailNode = current.nodes.find(n => n.type === 'n8n-nodes-base.emailSend');
  if (emailNode && emailNode.credentials) {
    smtpCred = emailNode.credentials;
    console.log('✅ Credencial SMTP encontrada:', JSON.stringify(smtpCred));
  } else {
    console.log('⚠️  Sin credencial SMTP — asignar manualmente en UI después');
  }

  // 2: Construir y deployar
  const wf = buildWorkflow(smtpCred);
  console.log(`\nDeployando "${wf.name}" con ${wf.nodes.length} nodos...`);
  console.log('Nodos:', wf.nodes.map(n => n.name).join(' → '));

  const result = await api('PUT', `/api/v1/workflows/${WF_ID}`, wf);

  if (result.nodes) {
    console.log('\n✅ Workflow actualizado correctamente');
    console.log('Nodos en n8n:', result.nodes.map(n => n.name).join(' → '));

    const construirNode = result.nodes.find(n => n.name === 'Construir HTML');
    const getLeadsNode  = result.nodes.find(n => n.name === 'Get Leads Email');
    console.log('\nGet Leads Email tipo:', getLeadsNode ? getLeadsNode.type : '?');
    console.log('Construir HTML:',       construirNode ? '✅ presente' : '❌ FALTA');

    console.log('\n=== PASOS SIGUIENTES ===');
    console.log('1. Abrir n8n UI: https://workflows.n8n.redsolucionesti.com');
    console.log('2. Abrir "SofIA - Email Inicial"');
    if (!smtpCred) {
      console.log('3. ⚠️  Click en "Enviar Email" → asignar credencial Brevo SMTP');
    } else {
      console.log('3. Credencial SMTP ya preservada ✅');
    }
    console.log('4. Click "Test workflow"');
    console.log('5. Revisar emails HTML en gbarrero57@gmail.com');
    console.log('   (asunto con [TEST -> email@real])');
  } else {
    console.error('\n❌ ERROR al actualizar:');
    console.error(JSON.stringify(result).slice(0, 800));
  }
}

main().catch(console.error);
