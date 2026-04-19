/**
 * patch_blast_email_template.mjs
 * Actualiza el HTML del email y el fromEmail en los dos workflows de blast.
 */

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const BASE    = 'https://workflows.n8n.redsolucionesti.com';
const AT_TOKEN = process.env.AIRTABLE_PAT;
const AT_BASE  = 'app6a4u9dvXMxwOnY';
const AT_TABLE = 'tblBuVcKITk5GFoqk';
const TG_TOKEN = '8497144736:AAEwPwcp0Mp8va4L8fj0RC2e7e0uLGj2BxE';
const TG_CHAT  = '7727513100';
const SMTP_CRED = { id: '10XlOZ0JAhnvl208', name: 'Brevo SMTP Leads' };

const WF_INITIAL  = 'WBzLRqtmEpMKH4Ql';
const WF_FOLLOWUP = 'XE9ibSiA7LhzH9kR';

// ─── Updated HTML builders ─────────────────────────────────────────────────
const INITIAL_HTML_FN = `
function buildInitialHtml(nombre, ciudad, distrito) {
  const wa_demo     = 'https://wa.me/51977588512?text=' + encodeURIComponent('Hola, quiero ver una demo de SofIA para mi clínica dental.');
  const wa_gabriel  = 'https://wa.me/51905858566?text=' + encodeURIComponent('Hola Gabriel, vi tu email sobre SofIA y quiero más información.');
  const loc = distrito && ciudad ? distrito + ', ' + ciudad : ciudad || '';
  return \`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:600px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <div style="background:linear-gradient(135deg,#1e1b4b 0%,#4c1d95 100%);padding:36px 40px;text-align:center;">
    <div style="font-size:36px;margin-bottom:12px;">🦷</div>
    <h1 style="color:#fff;margin:0;font-size:26px;font-weight:700;">SofIA</h1>
    <p style="color:#c4b5fd;margin:6px 0 0;font-size:14px;">Asistente de citas dental con inteligencia artificial</p>
  </div>
  <div style="padding:36px 40px;">
    <p style="font-size:16px;color:#374151;margin-top:0;">Hola, soy <strong>Gabriel</strong> de <strong>RedSoluciones TI</strong> 👋</p>
    <p style="font-size:15px;color:#4b5563;line-height:1.7;">
      Vi que <strong>\${nombre}</strong>\${loc ? ' en <strong>' + loc + '</strong>' : ''} tiene
      una presencia destacada y me gustaría presentarles <strong>SofIA</strong>,
      nuestro asistente de WhatsApp con IA para clínicas dentales.
    </p>
    <div style="background:#f8fafc;border-radius:10px;padding:20px 24px;margin:24px 0;">
      <p style="margin:0 0 12px;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">¿Qué hace SofIA?</p>
      <div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-start;"><span style="font-size:18px;">🕐</span><span style="font-size:14px;color:#374151;line-height:1.6;">Atiende pacientes <strong>24/7</strong> por WhatsApp automáticamente</span></div>
      <div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-start;"><span style="font-size:18px;">📅</span><span style="font-size:14px;color:#374151;line-height:1.6;">Agenda citas <strong>sin intervención humana</strong>, revisa disponibilidad en tiempo real</span></div>
      <div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-start;"><span style="font-size:18px;">🔔</span><span style="font-size:14px;color:#374151;line-height:1.6;">Envía <strong>recordatorios automáticos</strong> para reducir ausencias</span></div>
      <div style="display:flex;gap:10px;align-items:flex-start;"><span style="font-size:18px;">📊</span><span style="font-size:14px;color:#374151;line-height:1.6;">Panel de control con <strong>métricas y reportes</strong> en tiempo real</span></div>
    </div>
    <p style="font-size:15px;color:#4b5563;line-height:1.7;">
      SofIA ya está activo en clínicas dentales de Lima, Arequipa y Trujillo.
      La implementación toma <strong>menos de 48 horas</strong>.
    </p>
    <div style="text-align:center;margin:32px 0 16px;">
      <a href="\${wa_demo}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4c1d95);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;">Ver demo de SofIA →</a>
    </div>
    <div style="text-align:center;margin-bottom:24px;">
      <a href="\${wa_gabriel}" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:600;">💬 Escribirme por WhatsApp</a>
    </div>
  </div>
  <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
    <p style="font-size:12px;color:#6b7280;margin:0;"><strong>Gabriel Barrero</strong> · RedSoluciones TI<br>
    <a href="https://sofia.redsolucionesti.com" style="color:#7c3aed;text-decoration:none;">sofia.redsolucionesti.com</a></p>
    <p style="font-size:11px;color:#9ca3af;margin:8px 0 0;">Si no deseas recibir más emails, responde con "cancelar" en el asunto.</p>
  </div>
</div></body></html>\`;
}
`;

const FOLLOWUP_HTML_FN = `
function buildFollowupHtml(nombre, ciudad, distrito) {
  const wa_demo    = 'https://wa.me/51977588512?text=' + encodeURIComponent('Hola, quiero ver una demo de SofIA para mi clínica dental.');
  const wa_gabriel = 'https://wa.me/51905858566?text=' + encodeURIComponent('Hola Gabriel, vi tu email sobre SofIA y quiero más información.');
  return \`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:600px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <div style="background:linear-gradient(135deg,#1e1b4b 0%,#4c1d95 100%);padding:24px 40px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">🦷 SofIA</h1>
  </div>
  <div style="padding:36px 40px;">
    <p style="font-size:16px;color:#374151;margin-top:0;">Hola de nuevo 👋</p>
    <p style="font-size:15px;color:#4b5563;line-height:1.7;">
      Hace unos días te envié información sobre <strong>SofIA</strong>, el asistente de WhatsApp con IA
      para clínicas dentales. Quería asegurarme de que lo recibiste.
    </p>
    <p style="font-size:15px;color:#4b5563;line-height:1.7;">
      Si te interesa, puedes hablar directamente con SofIA para ver cómo funciona,
      o escribirme y coordinamos una <strong>demo de 10 minutos</strong> personalizada.
    </p>
    <div style="text-align:center;margin:28px 0 16px;">
      <a href="\${wa_demo}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4c1d95);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;">Hablar con SofIA →</a>
    </div>
    <div style="text-align:center;margin-bottom:24px;">
      <a href="\${wa_gabriel}" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:600;">💬 Escribirle a Gabriel</a>
    </div>
  </div>
  <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 40px;text-align:center;">
    <p style="font-size:12px;color:#6b7280;margin:0;"><strong>Gabriel Barrero</strong> · RedSoluciones TI ·
    <a href="https://sofia.redsolucionesti.com" style="color:#7c3aed;text-decoration:none;">sofia.redsolucionesti.com</a></p>
    <p style="font-size:11px;color:#9ca3af;margin:6px 0 0;">Si no deseas recibir más emails, responde con "cancelar".</p>
  </div>
</div></body></html>\`;
}
`;

// ─── Build Code node jsCode for fetch + html ──────────────────────────────
function buildFetchCode(htmlFnCode, htmlFnName, filterFormula) {
  return `
const AT_TOKEN = '${AT_TOKEN}';
const AT_URL   = 'https://api.airtable.com/v0/${AT_BASE}/${AT_TABLE}';

function validEmail(e) {
  if (!e) return false;
  const s = String(e).trim();
  return s.length > 5 && /^[^@]+@[^@]{3,}\\.[a-z]{2,}$/i.test(s) &&
    !['example','test','lorem','noreply','wixpress','cloudflare','n@media','@m.co'].some(x => s.includes(x));
}

${htmlFnCode.trim()}

const leads = [];
let offset = '';
let hasMore = true;
while (hasMore) {
  const params = new URLSearchParams();
  ['nombre','email','ciudad','distrito'].forEach(f => params.append('fields[]', f));
  params.set('filterByFormula', '${filterFormula}');
  params.set('pageSize', '100');
  if (offset) params.set('offset', offset);
  const res = await this.helpers.httpRequest({
    method: 'GET',
    url: AT_URL + '?' + params.toString(),
    headers: { Authorization: 'Bearer ' + AT_TOKEN },
  });
  for (const r of (res.records || [])) {
    const f = r.fields;
    if (!validEmail(f.email)) continue;
    const nombre   = f.nombre   || 'Estimado/a';
    const ciudad   = f.ciudad   || '';
    const distrito = f.distrito || '';
    leads.push({
      id: r.id, nombre, email: f.email.trim().toLowerCase(),
      ciudad, distrito,
      html: ${htmlFnName}(nombre, ciudad, distrito),
    });
  }
  offset = res.offset || '';
  hasMore = !!res.offset;
}
return leads.map(l => ({ json: l }));
`;
}

function buildFinalizeCode(newStatus, emailType) {
  return `
const AT_TOKEN = '${AT_TOKEN}';
const AT_URL   = 'https://api.airtable.com/v0/${AT_BASE}/${AT_TABLE}';
const TG_TOKEN = '${TG_TOKEN}';
const TG_CHAT  = '${TG_CHAT}';

const all    = $input.all();
const sent   = all.filter(i => !i.json.error);
const failed = all.filter(i =>  i.json.error);

const toUpdate = sent.map(i => ({ id: i.json.id, fields: { status: '${newStatus}' } }));
for (let i = 0; i < toUpdate.length; i += 10) {
  await this.helpers.httpRequest({
    method: 'PATCH',
    url: AT_URL,
    headers: { Authorization: 'Bearer ' + AT_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: toUpdate.slice(i, i + 10) }),
  });
}

const byCiudad   = {};
const byDistrito = {};
for (const i of sent) {
  const c = i.json.ciudad   || 'Sin ciudad';
  const d = i.json.distrito || '';
  byCiudad[c] = (byCiudad[c] || 0) + 1;
  if (d) byDistrito[d + ' (' + c + ')'] = (byDistrito[d + ' (' + c + ')'] || 0) + 1;
}

const ciudadLines   = Object.entries(byCiudad).sort((a,b)=>b[1]-a[1]).map(([c,n])=>'  • '+c+': '+n).join('\\n');
const topDistritos  = Object.entries(byDistrito).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([d,n])=>'  '+d+': '+n).join('\\n');

const msg = ['📧 <b>${emailType}</b> completado','','<b>✅ Enviados:</b> '+sent.length,'<b>❌ Fallidos:</b> '+failed.length,'','<b>Por ciudad:</b>',ciudadLines,'','<b>Top distritos:</b>',topDistritos].join('\\n');

await this.helpers.httpRequest({
  method: 'POST',
  url: 'https://api.telegram.org/bot' + TG_TOKEN + '/sendMessage',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ chat_id: TG_CHAT, text: msg, parse_mode: 'HTML' }),
});

return [{ json: { sent: sent.length, failed: failed.length, byCiudad } }];
`;
}

// ─── Patch each workflow ──────────────────────────────────────────────────
async function patchWorkflow(wfId, fetchCode, finalizeCode, subject) {
  const res = await fetch(`${BASE}/api/v1/workflows/${wfId}`, {
    headers: { 'X-N8N-API-KEY': API_KEY }
  });
  const wf = await res.json();

  for (const node of wf.nodes) {
    if (node.name === 'Fetch Leads') {
      node.parameters.jsCode = fetchCode;
    }
    if (node.name === 'Actualizar AT + Telegram') {
      node.parameters.jsCode = finalizeCode;
    }
    if (node.name === 'Send Email') {
      node.parameters.fromEmail = 'info@redsolucionesti.com';
      node.parameters.subject   = subject;
      delete node.parameters.options.replyTo;   // no reply
    }
  }

  // Deactivate
  await fetch(`${BASE}/api/v1/workflows/${wfId}/deactivate`, {
    method: 'POST', headers: { 'X-N8N-API-KEY': API_KEY }
  });

  // PUT
  const putRes = await fetch(`${BASE}/api/v1/workflows/${wfId}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: wf.name,
      nodes: wf.nodes,
      connections: wf.connections,
      settings: wf.settings,
    }),
  });
  if (!putRes.ok) throw new Error(`PUT failed: ${await putRes.text()}`);

  // Reactivate
  await fetch(`${BASE}/api/v1/workflows/${wfId}/activate`, {
    method: 'POST', headers: { 'X-N8N-API-KEY': API_KEY }
  });

  console.log('✅', wf.name, '— actualizado');
}

await patchWorkflow(
  WF_INITIAL,
  buildFetchCode(INITIAL_HTML_FN, 'buildInitialHtml', 'AND({status}="nuevo",{email}!="")'),
  buildFinalizeCode('enviado', 'Email Inicial (9am)'),
  'SofIA: agenda automática de citas por WhatsApp para tu clínica dental',
);

await patchWorkflow(
  WF_FOLLOWUP,
  buildFetchCode(FOLLOWUP_HTML_FN, 'buildFollowupHtml', 'OR({status}="enviado",{status}="email_enviado")'),
  buildFinalizeCode('follow_up_enviado', 'Email Follow-up (1pm)'),
  'Follow-up: ¿pudiste ver la info sobre SofIA?',
);

// ─── Send updated test email ──────────────────────────────────────────────
import nodemailer from 'nodemailer';

const atRes = await fetch(
  `https://api.airtable.com/v0/${AT_BASE}/${AT_TABLE}?filterByFormula=AND({status}="nuevo",{email}!="")&maxRecords=1&fields[]=nombre&fields[]=ciudad&fields[]=distrito`,
  { headers: { Authorization: `Bearer ${AT_TOKEN}` } }
);
const atData = await atRes.json();
const lead = atData.records?.[0]?.fields ?? { nombre: 'Clínica Demo', ciudad: 'Lima', distrito: 'Miraflores' };

// build html inline for test
const wa_demo    = 'https://wa.me/51977588512?text=' + encodeURIComponent('Hola, quiero ver una demo de SofIA para mi clínica dental.');
const wa_gabriel = 'https://wa.me/51905858566?text=' + encodeURIComponent('Hola Gabriel, vi tu email sobre SofIA y quiero más información.');
const loc = (lead.distrito && lead.ciudad) ? `${lead.distrito}, ${lead.ciudad}` : lead.ciudad || '';

const testHtml = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
<div style="background:#f59e0b;color:#000;text-align:center;padding:8px;font-size:13px;font-weight:bold;">⚠️ EMAIL DE PRUEBA — Lead real: ${lead.nombre} (${lead.ciudad})</div>
<div style="max-width:600px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <div style="background:linear-gradient(135deg,#1e1b4b 0%,#4c1d95 100%);padding:36px 40px;text-align:center;">
    <div style="font-size:36px;margin-bottom:12px;">🦷</div>
    <h1 style="color:#fff;margin:0;font-size:26px;font-weight:700;">SofIA</h1>
    <p style="color:#c4b5fd;margin:6px 0 0;font-size:14px;">Asistente de citas dental con inteligencia artificial</p>
  </div>
  <div style="padding:36px 40px;">
    <p style="font-size:16px;color:#374151;margin-top:0;">Hola, soy <strong>Gabriel</strong> de <strong>RedSoluciones TI</strong> 👋</p>
    <p style="font-size:15px;color:#4b5563;line-height:1.7;">
      Vi que <strong>${lead.nombre}</strong>${loc ? ` en <strong>${loc}</strong>` : ''} tiene
      una presencia destacada y me gustaría presentarles <strong>SofIA</strong>,
      nuestro asistente de WhatsApp con IA para clínicas dentales.
    </p>
    <div style="background:#f8fafc;border-radius:10px;padding:20px 24px;margin:24px 0;">
      <p style="margin:0 0 12px;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">¿Qué hace SofIA?</p>
      <div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-start;"><span style="font-size:18px;">🕐</span><span style="font-size:14px;color:#374151;line-height:1.6;">Atiende pacientes <strong>24/7</strong> por WhatsApp automáticamente</span></div>
      <div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-start;"><span style="font-size:18px;">📅</span><span style="font-size:14px;color:#374151;line-height:1.6;">Agenda citas <strong>sin intervención humana</strong>, revisa disponibilidad en tiempo real</span></div>
      <div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-start;"><span style="font-size:18px;">🔔</span><span style="font-size:14px;color:#374151;line-height:1.6;">Envía <strong>recordatorios automáticos</strong> para reducir ausencias</span></div>
      <div style="display:flex;gap:10px;align-items:flex-start;"><span style="font-size:18px;">📊</span><span style="font-size:14px;color:#374151;line-height:1.6;">Panel de control con <strong>métricas y reportes</strong> en tiempo real</span></div>
    </div>
    <p style="font-size:15px;color:#4b5563;line-height:1.7;">
      SofIA ya está activo en clínicas dentales de Lima, Arequipa y Trujillo.
      La implementación toma <strong>menos de 48 horas</strong>.
    </p>
    <div style="text-align:center;margin:32px 0 16px;">
      <a href="${wa_demo}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4c1d95);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;">Ver demo de SofIA →</a>
    </div>
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${wa_gabriel}" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:600;">💬 Escribirme por WhatsApp</a>
    </div>
  </div>
  <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
    <p style="font-size:12px;color:#6b7280;margin:0;"><strong>Gabriel Barrero</strong> · RedSoluciones TI<br>
    <a href="https://sofia.redsolucionesti.com" style="color:#7c3aed;text-decoration:none;">sofia.redsolucionesti.com</a></p>
    <p style="font-size:11px;color:#9ca3af;margin:8px 0 0;">Si no deseas recibir más emails, responde con "cancelar" en el asunto.</p>
  </div>
</div></body></html>`;

const transport = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com', port: 587, secure: false,
  auth: { user: 'a521e9001@smtp-brevo.com', pass: process.env.BREVO_SMTP_KEY },
  tls: { rejectUnauthorized: false },
});

const info = await transport.sendMail({
  from: '"Gabriel - RedSoluciones TI" <info@redsolucionesti.com>',
  to:   'gaboalejandro57@gmail.com',
  subject: '[PRUEBA v2] SofIA: agenda automática de citas por WhatsApp para tu clínica dental',
  html: testHtml,
});

console.log('\n📧 Test email v2 enviado:', info.messageId);
console.log('   From: info@redsolucionesti.com');
console.log('   "Ver demo de SofIA" → WA +51977588512 (SofIA demo)');
console.log('   "Escribirme por WhatsApp" → WA +51905858566 (Gabriel personal)');
console.log('   Sin "responde este email"');
