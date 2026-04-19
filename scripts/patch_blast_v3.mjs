/**
 * patch_blast_v3.mjs — actualiza workflows con email template v3 (10 features)
 */

const API_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const BASE     = 'https://workflows.n8n.redsolucionesti.com';
const AT_TOKEN = process.env.AIRTABLE_PAT;
const AT_BASE  = 'app6a4u9dvXMxwOnY';
const AT_TABLE = 'tblBuVcKITk5GFoqk';
const TG_TOKEN = '8497144736:AAEwPwcp0Mp8va4L8fj0RC2e7e0uLGj2BxE';
const TG_CHAT  = '7727513100';

// ─── Feature rows HTML (string, no template literals to avoid n8n escaping issues)
const FEATURE_ROWS = [
  ['🕐', 'Atención 24/7 sin descanso',         'Responde pacientes a cualquier hora, incluso fines de semana y feriados, sin costo adicional de personal.'],
  ['📅', 'Agenda citas automáticamente',         'Revisa disponibilidad en tiempo real, ofrece los 3 mejores horarios y confirma la cita sin que tú hagas nada.'],
  ['🔒', 'Cero dobles agendas',                  'Bloqueo de slot en tiempo real. Imposible que dos pacientes reserven el mismo horario.'],
  ['🧠', 'IA que entiende preguntas',             'Responde sobre precios, servicios, horarios y pagos — con las respuestas que tú configuras para tu clínica.'],
  ['📋', 'Menú interactivo con botones',          'Botones de WhatsApp para agendar, consultar citas, cancelar o hablar con un humano. Sin escribir, sin confusión.'],
  ['👨‍⚕️','Traspaso a humano en 1 clic',           'Tu equipo toma el control de cualquier conversación desde Chatwoot. SofIA se pausa automáticamente.'],
  ['🔔', 'Recordatorios automáticos',             'Envía recordatorios 24h antes de cada cita para reducir ausencias y cancelaciones de último minuto.'],
  ['🔄', 'Re-engagement de pacientes',            'Contacta automáticamente pacientes que preguntaron pero no completaron su cita.'],
  ['📊', 'Panel y reportes mensuales',            'Dashboard con métricas de conversaciones, tasa de agendamiento y reportes enviados a tu correo.'],
  ['🏥', 'Multi-sede',                            'Varias clínicas, cada una con su WhatsApp, base de conocimiento y calendario propios.'],
].map(([icon, title, desc]) =>
  `<div style="display:flex;gap:14px;margin-bottom:20px;align-items:flex-start;">` +
  `<div style="width:40px;height:40px;background:#f3f0ff;border-radius:10px;text-align:center;line-height:40px;font-size:20px;flex-shrink:0;">${icon}</div>` +
  `<div><p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#1e1b4b;">${title}</p>` +
  `<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">${desc}</p></div></div>`
).join('');

// ─── HTML builder (used at email-send time, inside n8n Code node as a JS string)
// We write it as a JS function string that will be embedded in the Code node jsCode.
function makeHtmlBuilderFn(fnName) {
  // Escape backticks and backslashes for embedding as a string in the outer JS module
  const featureRowsEscaped = FEATURE_ROWS
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');

  return `function ${fnName}(nombre, ciudad, distrito) {
  var wa_demo    = 'https://wa.me/51977588512?text=' + encodeURIComponent('Hola, quiero ver una demo de SofIA para mi clinica dental.');
  var wa_gabriel = 'https://wa.me/51905858566?text=' + encodeURIComponent('Hola Gabriel, vi tu email sobre SofIA y quiero mas informacion.');
  var loc = (distrito && ciudad) ? (distrito + ', ' + ciudad) : (ciudad || '');
  var featureRows = ${JSON.stringify(FEATURE_ROWS)};
  var html =
    '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#f3f4f6;font-family:Segoe UI,Arial,sans-serif;">' +
    '<div style="max-width:600px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">' +
    '<div style="background:linear-gradient(135deg,#1e1b4b 0%,#4c1d95 100%);padding:36px 40px;text-align:center;">' +
    '<div style="font-size:36px;margin-bottom:12px;">🦷</div>' +
    '<h1 style="color:#fff;margin:0;font-size:26px;font-weight:700;">SofIA</h1>' +
    '<p style="color:#c4b5fd;margin:6px 0 0;font-size:14px;">Asistente de citas dental con inteligencia artificial</p></div>' +
    '<div style="padding:36px 40px 24px;">' +
    '<p style="font-size:16px;color:#374151;margin-top:0;">Hola, soy <strong>Gabriel</strong> de <strong>RedSoluciones TI</strong> 👋</p>' +
    '<p style="font-size:15px;color:#4b5563;line-height:1.7;">Vi que <strong>' + nombre + '</strong>' + (loc ? ' en <strong>' + loc + '</strong>' : '') + ' tiene una presencia destacada y me gustaría presentarles <strong>SofIA</strong> — el asistente de WhatsApp con IA que está transformando cómo las clínicas dentales manejan sus citas.</p>' +
    '<div style="background:#faf9ff;border:1px solid #e9d5ff;border-radius:12px;padding:24px 28px;margin:24px 0;">' +
    '<p style="margin:0 0 20px;font-size:12px;color:#6d28d9;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;">¿Qué puede hacer SofIA por tu clínica?</p>' +
    featureRows + '</div>' +
    '<div style="background:linear-gradient(135deg,#ede9fe,#ddd6fe);border-radius:10px;padding:16px 20px;margin-bottom:28px;text-align:center;">' +
    '<p style="margin:0;font-size:14px;color:#4c1d95;font-weight:600;">🚀 Ya activo en clínicas de Lima, Arequipa, Trujillo, Chiclayo y Cusco</p>' +
    '<p style="margin:4px 0 0;font-size:13px;color:#6d28d9;">Implementación en menos de 48 horas · Sin cambiar plataformas</p></div>' +
    '<div style="text-align:center;margin-bottom:16px;"><a href="' + wa_demo + '" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4c1d95);color:#fff;text-decoration:none;padding:15px 36px;border-radius:10px;font-size:15px;font-weight:700;">Ver demo de SofIA →</a></div>' +
    '<div style="text-align:center;margin-bottom:24px;"><a href="' + wa_gabriel + '" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;padding:13px 28px;border-radius:10px;font-size:14px;font-weight:600;">💬 Escribirme por WhatsApp</a></div>' +
    '</div>' +
    '<div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">' +
    '<p style="font-size:12px;color:#6b7280;margin:0;"><strong>Gabriel Barrero</strong> · RedSoluciones TI<br>' +
    '<a href="https://sofia.redsolucionesti.com" style="color:#7c3aed;text-decoration:none;">sofia.redsolucionesti.com</a></p>' +
    '<p style="font-size:11px;color:#9ca3af;margin:8px 0 0;">Si no deseas recibir mas emails, responde con cancelar en el asunto.</p>' +
    '</div></div></body></html>';
  return html;
}`;
}

// ─── Fetch + HTML Code node ────────────────────────────────────────────────
function buildFetchCode(filter, fnName) {
  return `
const AT_TOKEN = '${AT_TOKEN}';
const AT_URL   = 'https://api.airtable.com/v0/${AT_BASE}/${AT_TABLE}';

function validEmail(e) {
  if (!e) return false;
  var s = String(e).trim();
  return s.length > 5 && /^[^@]+@[^@]{3,}\\.[a-z]{2,}$/i.test(s) &&
    !['example','test','lorem','noreply','wixpress','cloudflare','n@media','@m.co'].some(function(x){ return s.includes(x); });
}

${makeHtmlBuilderFn(fnName)}

var leads = [], offset = '', hasMore = true;
while (hasMore) {
  var params = new URLSearchParams();
  ['nombre','email','ciudad','distrito'].forEach(function(f){ params.append('fields[]', f); });
  params.set('filterByFormula', '${filter}');
  params.set('pageSize', '100');
  if (offset) params.set('offset', offset);
  var res = await this.helpers.httpRequest({ method: 'GET', url: AT_URL + '?' + params.toString(), headers: { Authorization: 'Bearer ' + AT_TOKEN } });
  var records = res.records || [];
  for (var i = 0; i < records.length; i++) {
    var f = records[i].fields;
    if (!validEmail(f.email)) continue;
    var nombre = f.nombre || 'Estimado/a', ciudad = f.ciudad || '', distrito = f.distrito || '';
    leads.push({ id: records[i].id, nombre: nombre, email: f.email.trim().toLowerCase(), ciudad: ciudad, distrito: distrito, html: ${fnName}(nombre, ciudad, distrito) });
  }
  offset = res.offset || ''; hasMore = !!res.offset;
}
return leads.map(function(l){ return { json: l }; });
`;
}

// ─── Finalize Code node ────────────────────────────────────────────────────
function buildFinalizeCode(newStatus, label) {
  return `
var AT_TOKEN = '${AT_TOKEN}';
var AT_URL = 'https://api.airtable.com/v0/${AT_BASE}/${AT_TABLE}';
var TG_TOKEN = '${TG_TOKEN}'; var TG_CHAT = '${TG_CHAT}';
var all = $input.all(), sent = all.filter(function(i){ return !i.json.error; }), failed = all.filter(function(i){ return i.json.error; });
var toUpdate = sent.map(function(i){ return { id: i.json.id, fields: { status: '${newStatus}' } }; });
for (var i = 0; i < toUpdate.length; i += 10) {
  await this.helpers.httpRequest({ method: 'PATCH', url: AT_URL, headers: { Authorization: 'Bearer ' + AT_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ records: toUpdate.slice(i, i + 10) }) });
}
var byCiudad = {}, byDistrito = {};
for (var j = 0; j < sent.length; j++) { var c = sent[j].json.ciudad || 'Sin ciudad', d = sent[j].json.distrito || ''; byCiudad[c] = (byCiudad[c] || 0) + 1; if (d) byDistrito[d + ' (' + c + ')'] = (byDistrito[d + ' (' + c + ')'] || 0) + 1; }
var ciudadLines = Object.entries(byCiudad).sort(function(a,b){return b[1]-a[1];}).map(function(e){return '  • '+e[0]+': '+e[1];}).join('\\n');
var topDistritos = Object.entries(byDistrito).sort(function(a,b){return b[1]-a[1];}).slice(0,5).map(function(e){return '  '+e[0]+': '+e[1];}).join('\\n');
var msg = ['📧 <b>${label}</b> completado','','<b>✅ Enviados:</b> '+sent.length,'<b>❌ Fallidos:</b> '+failed.length,'','<b>Por ciudad:</b>',ciudadLines,'','<b>Top distritos:</b>',topDistritos].join('\\n');
await this.helpers.httpRequest({ method: 'POST', url: 'https://api.telegram.org/bot'+TG_TOKEN+'/sendMessage', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: TG_CHAT, text: msg, parse_mode: 'HTML' }) });
return [{ json: { sent: sent.length, failed: failed.length, byCiudad: byCiudad } }];
`;
}

// ─── Patch helper ──────────────────────────────────────────────────────────
async function patch(wfId, fetchCode, finalizeCode) {
  const r   = await fetch(`${BASE}/api/v1/workflows/${wfId}`, { headers: { 'X-N8N-API-KEY': API_KEY } });
  const wf  = await r.json();

  for (const n of wf.nodes) {
    if (n.name === 'Fetch Leads')              n.parameters.jsCode = fetchCode;
    if (n.name === 'Actualizar AT + Telegram') n.parameters.jsCode = finalizeCode;
    if (n.name === 'Send Email') {
      n.parameters.fromEmail = 'info@redsolucionesti.com';
      if (n.parameters.options) delete n.parameters.options.replyTo;
    }
  }

  await fetch(`${BASE}/api/v1/workflows/${wfId}/deactivate`, { method: 'POST', headers: { 'X-N8N-API-KEY': API_KEY } });

  const p = await fetch(`${BASE}/api/v1/workflows/${wfId}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings }),
  });
  if (!p.ok) { console.error('PUT error:', await p.text()); return; }

  await fetch(`${BASE}/api/v1/workflows/${wfId}/activate`, { method: 'POST', headers: { 'X-N8N-API-KEY': API_KEY } });
  const updated = await p.json();
  console.log('✅', updated.name);
}

// ─── Run ───────────────────────────────────────────────────────────────────
await patch(
  'WBzLRqtmEpMKH4Ql',
  buildFetchCode('AND({status}="nuevo",{email}!="")', 'buildInitialHtml'),
  buildFinalizeCode('enviado', 'Email Inicial (9am)'),
);

await patch(
  'XE9ibSiA7LhzH9kR',
  buildFetchCode('OR({status}="enviado",{status}="email_enviado")', 'buildFollowupHtml'),
  buildFinalizeCode('follow_up_enviado', 'Email Follow-up (1pm)'),
);

console.log('\n✅ Ambos workflows actualizados con template v3 (10 features)');
console.log('   Blast mañana 9am Lima → ~170 leads');
console.log('   Follow-up 1pm Lima → leads "enviado"');
