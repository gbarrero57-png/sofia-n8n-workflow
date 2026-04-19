/**
 * patch_blast_supabase.mjs
 * Updates both email blast workflows to read/write Supabase instead of Airtable.
 * Run after migration 034 is applied and data is migrated.
 *
 * Usage: node scripts/patch_blast_supabase.mjs
 */

const API_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const BASE     = 'https://workflows.n8n.redsolucionesti.com';

const SB_URL      = 'https://inhyrrjidhzrbqecnptn.supabase.co';
const SERVICE_KEY = 'process.env.SUPABASE_SERVICE_KEY';
const TG_TOKEN    = '8497144736:AAEwPwcp0Mp8va4L8fj0RC2e7e0uLGj2BxE';
const TG_CHAT     = '7727513100';

// ─── Feature rows HTML ─────────────────────────────────────────────────────────
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

// ─── HTML builder function ─────────────────────────────────────────────────────
function makeHtmlBuilderFn(fnName) {
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

// ─── Fetch + HTML Code node (reads from Supabase) ──────────────────────────────
function buildFetchCode(statusFilter, fnName) {
  // statusFilter: SQL OR clause e.g. "status.eq.nuevo" or "status.in.(enviado,email_enviado)"
  return `
var SB_URL = '${SB_URL}';
var SERVICE_KEY = '${SERVICE_KEY}';

function validEmail(e) {
  if (!e) return false;
  var s = String(e).trim();
  return s.length > 5 && /^[^@]+@[^@]{3,}\\.[a-z]{2,}$/i.test(s) &&
    !['example','test','lorem','noreply','wixpress','cloudflare','n@media','@m.co'].some(function(x){ return s.includes(x); });
}

${makeHtmlBuilderFn(fnName)}

var leads = [];
var from = 0;
var pageSize = 1000;
var hasMore = true;

while (hasMore) {
  var to = from + pageSize - 1;
  var res = await this.helpers.httpRequest({
    method: 'GET',
    url: SB_URL + '/rest/v1/leads?select=id,nombre,email,ciudad,distrito&${statusFilter}&order=created_at.asc',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': 'Bearer ' + SERVICE_KEY,
      'Range': from + '-' + to,
      'Range-Unit': 'items',
    },
  });
  var rows = Array.isArray(res) ? res : [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!validEmail(r.email)) continue;
    var nombre = r.nombre || 'Estimado/a';
    var ciudad = r.ciudad || '';
    var distrito = r.distrito || '';
    leads.push({ id: r.id, nombre: nombre, email: r.email.trim().toLowerCase(), ciudad: ciudad, distrito: distrito, html: ${fnName}(nombre, ciudad, distrito) });
  }
  hasMore = rows.length === pageSize;
  from += pageSize;
}
return leads.map(function(l){ return { json: l }; });
`;
}

// ─── Finalize Code node (writes to Supabase) ──────────────────────────────────
function buildFinalizeCode(newStatus, label) {
  return `
var SB_URL = '${SB_URL}';
var SERVICE_KEY = '${SERVICE_KEY}';
var TG_TOKEN = '${TG_TOKEN}'; var TG_CHAT = '${TG_CHAT}';
var all = $input.all();
var sent = all.filter(function(i){ return !i.json.error; });
var failed = all.filter(function(i){ return i.json.error; });

// Collect emails sent successfully (Send Email node puts recipient in json.accepted[0])
var now = new Date().toISOString();
var sentEmails = [];
for (var i = 0; i < sent.length; i++) {
  var acc = sent[i].json.accepted;
  if (acc && acc[0]) sentEmails.push(acc[0].toLowerCase().trim());
}

// Update Supabase in batches of 20 emails at a time
var sbErrors = 0;
for (var i = 0; i < sentEmails.length; i += 20) {
  var batch = sentEmails.slice(i, i + 20);
  var quotedList = batch.map(function(e){ return '"' + e + '"'; }).join(',');
  try {
    await this.helpers.httpRequest({
      method: 'PATCH',
      url: SB_URL + '/rest/v1/leads?email=in.(' + quotedList + ')',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ status: '${newStatus}', fecha_envio: now }),
    });
  } catch(e) { sbErrors++; }
}

// For city breakdown — query Supabase for the sent emails to get city info
var byCiudad = {}, byDistrito = {};
try {
  var allEmails = sentEmails.join(',');
  if (allEmails) {
    var infoRes = await this.helpers.httpRequest({
      method: 'GET',
      url: SB_URL + '/rest/v1/leads?select=ciudad,distrito&email=in.(' + sentEmails.map(function(e){ return '"'+e+'"'; }).join(',') + ')&limit=1000',
      headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY },
    });
    var infoRows = Array.isArray(infoRes) ? infoRes : [];
    for (var j = 0; j < infoRows.length; j++) {
      var c = infoRows[j].ciudad || 'Sin ciudad', d = infoRows[j].distrito || '';
      byCiudad[c] = (byCiudad[c] || 0) + 1;
      if (d) byDistrito[d + ' (' + c + ')'] = (byDistrito[d + ' (' + c + ')'] || 0) + 1;
    }
  }
} catch(e) { /* city breakdown optional */ }
var ciudadLines = Object.entries(byCiudad).sort(function(a,b){return b[1]-a[1];}).map(function(e){return '  • '+e[0]+': '+e[1];}).join('\\n');
var topDistritos = Object.entries(byDistrito).sort(function(a,b){return b[1]-a[1];}).slice(0,5).map(function(e){return '  '+e[0]+': '+e[1];}).join('\\n');
var extra = sbErrors > 0 ? '\\n\\n⚠️ Errores Supabase: '+sbErrors : '';
var msg = '📧 ${label} completado\\n\\n✅ Enviados: '+sent.length+'\\n❌ Fallidos: '+failed.length+'\\n\\nPor ciudad:\\n'+ciudadLines+'\\n\\nTop distritos:\\n'+topDistritos+extra;
await this.helpers.httpRequest({ method: 'POST', url: 'https://api.telegram.org/bot'+TG_TOKEN+'/sendMessage', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: parseInt(TG_CHAT), text: msg }) });
return [{ json: { sent: sent.length, failed: failed.length, sbErrors: sbErrors, byCiudad: byCiudad } }];
`;
}

// ─── Patch helper ──────────────────────────────────────────────────────────────
async function patch(wfId, fetchCode, finalizeCode) {
  const r  = await fetch(`${BASE}/api/v1/workflows/${wfId}`, { headers: { 'X-N8N-API-KEY': API_KEY } });
  const wf = await r.json();

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
  console.log('✅', updated.name, '— actualizado a Supabase');
}

// ─── Run ───────────────────────────────────────────────────────────────────────
await patch(
  'WBzLRqtmEpMKH4Ql',  // Email Inicial
  buildFetchCode('status=eq.nuevo&email=not.is.null', 'buildInitialHtml'),
  buildFinalizeCode('enviado', 'Email Inicial (9am)'),
);

await patch(
  'XE9ibSiA7LhzH9kR',  // Email Follow-up
  buildFetchCode('status=in.(enviado,email_enviado)', 'buildFollowupHtml'),
  buildFinalizeCode('follow_up_enviado', 'Email Follow-up (5pm)'),
);

console.log('\n✅ Ambos workflows actualizados — leyendo y escribiendo en Supabase');
console.log('   Email Inicial   → leads status=nuevo');
console.log('   Email Follow-up → leads status=enviado o email_enviado');
