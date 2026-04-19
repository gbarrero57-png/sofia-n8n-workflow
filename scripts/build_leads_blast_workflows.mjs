/**
 * build_leads_blast_workflows.mjs
 * Crea dos workflows n8n:
 *   1) "Leads - Email Inicial (9am)" — CRON 9am Lima
 *   2) "Leads - Email Follow-up (1pm)" — CRON 1pm Lima
 *
 * Cada workflow:
 *   - Fetch leads de Airtable según status
 *   - Envía email personalizado via Brevo SMTP
 *   - Actualiza status en Airtable
 *   - Notifica Telegram con resumen por ciudad/distrito
 *
 * Run: node scripts/build_leads_blast_workflows.mjs
 */

const API_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const BASE     = 'https://workflows.n8n.redsolucionesti.com';
const AT_TOKEN = process.env.AIRTABLE_PAT;
const AT_BASE  = 'app6a4u9dvXMxwOnY';
const AT_TABLE = 'tblBuVcKITk5GFoqk';
const TG_TOKEN = '7670596059:AAEQPaKOI9jkmR_KNLWfyWXoHHEyKlAJYo4'; // from n8n cred lookup
const TG_CHAT  = '7727513100';
const SMTP_CRED = { id: '10XlOZ0JAhnvl208', name: 'Brevo SMTP Leads' };

// ─── n8n API helpers ─────────────────────────────────────────────────────────
async function n8nPost(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`n8n POST ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}
async function n8nPut(path, body) {
  const r = await fetch(BASE + path, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`n8n PUT ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}

// ─── Email HTML templates ─────────────────────────────────────────────────────
const INITIAL_EMAIL_JS = `
// Initial email HTML builder — used inside n8n Code node
function buildInitialHtml(nombre, ciudad, distrito) {
  const wa = 'https://wa.me/51977588512?text=' + encodeURIComponent('Hola Gabriel, vi tu email sobre SofIA y quiero más información.');
  const loc = distrito && ciudad ? distrito + ', ' + ciudad : ciudad || '';
  return \`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
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
      Vi que <strong>\${nombre}</strong>\${loc ? ' en <strong>' + loc + '</strong>' : ''} tiene una presencia destacada y me gustaría presentarles <strong>SofIA</strong>,
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
      Implementación en <strong>menos de 48 horas</strong>, sin cambiar tu número de WhatsApp actual.
    </p>
    <div style="text-align:center;margin:32px 0 16px;">
      <a href="https://sofia.redsolucionesti.com" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4c1d95);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;">Ver demo de SofIA →</a>
    </div>
    <div style="text-align:center;margin-bottom:8px;">
      <a href="\${wa}" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:600;">💬 Escribirme por WhatsApp</a>
    </div>
    <p style="font-size:13px;color:#9ca3af;text-align:center;margin-top:8px;">O responde este email para coordinar una demo de 10 minutos.</p>
  </div>
  <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
    <p style="font-size:12px;color:#6b7280;margin:0;"><strong>Gabriel Barrero</strong> · RedSoluciones TI<br>
    <a href="mailto:gabriel@redsolucionesti.com" style="color:#7c3aed;text-decoration:none;">gabriel@redsolucionesti.com</a> ·
    <a href="https://sofia.redsolucionesti.com" style="color:#7c3aed;text-decoration:none;">sofia.redsolucionesti.com</a></p>
    <p style="font-size:11px;color:#9ca3af;margin:8px 0 0;">Si no deseas recibir más emails, responde con "cancelar" en el asunto.</p>
  </div>
</div></body></html>\`;
}
`;

const FOLLOWUP_EMAIL_JS = `
function buildFollowupHtml(nombre, ciudad, distrito) {
  const wa = 'https://wa.me/51977588512?text=' + encodeURIComponent('Hola Gabriel, me escribes sobre SofIA, me gustaría saber más.');
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
      para clínicas dentales como <strong>\${nombre}</strong>.
    </p>
    <p style="font-size:15px;color:#4b5563;line-height:1.7;">
      Quería asegurarme de que lo recibiste. Si no es el momento adecuado, no hay problema — responde
      este email y te escribo más adelante.
    </p>
    <p style="font-size:15px;color:#4b5563;line-height:1.7;">
      Si sí te interesa, me encantaría mostrarte una <strong>demo de 10 minutos</strong>
      personalizada para clínicas como la tuya:
    </p>
    <div style="text-align:center;margin:28px 0 16px;">
      <a href="https://sofia.redsolucionesti.com" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4c1d95);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;">Agendar demo →</a>
    </div>
    <div style="text-align:center;margin-bottom:8px;">
      <a href="\${wa}" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:600;">💬 WhatsApp directo</a>
    </div>
  </div>
  <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 40px;text-align:center;">
    <p style="font-size:12px;color:#6b7280;margin:0;"><strong>Gabriel Barrero</strong> · RedSoluciones TI ·
    <a href="mailto:gabriel@redsolucionesti.com" style="color:#7c3aed;text-decoration:none;">gabriel@redsolucionesti.com</a></p>
    <p style="font-size:11px;color:#9ca3af;margin:6px 0 0;">Si no deseas recibir más emails, responde con "cancelar".</p>
  </div>
</div></body></html>\`;
}
`;

// ─── Code node: Fetch initial leads ──────────────────────────────────────────
const CODE_FETCH_INITIAL = `
const AT_TOKEN = '${AT_TOKEN}';
const AT_BASE  = '${AT_BASE}';
const AT_TABLE = '${AT_TABLE}';
const AT_URL   = 'https://api.airtable.com/v0/' + AT_BASE + '/' + AT_TABLE;

function validEmail(e) {
  if (!e) return false;
  const s = String(e).trim();
  return s.length > 5 && /^[^@]+@[^@]{3,}\\.[a-z]{2,}$/i.test(s) &&
    !['example','test','lorem','n@media','noreply','@m.co','@g.co'].some(x => s.includes(x));
}

const leads = [];
let offset = '';
let hasMore = true;
while (hasMore) {
  const params = new URLSearchParams();
  ['nombre','email','ciudad','distrito'].forEach(f => params.append('fields[]', f));
  params.set('filterByFormula', 'AND({status}="nuevo", {email} != "")');
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
    leads.push({ id: r.id, nombre: f.nombre || 'Estimado/a', email: f.email.trim().toLowerCase(), ciudad: f.ciudad || '', distrito: f.distrito || '' });
  }
  offset = res.offset || '';
  hasMore = !!res.offset;
}

return leads.map(l => ({ json: l }));
`;

// ─── Code node: Fetch follow-up leads ────────────────────────────────────────
const CODE_FETCH_FOLLOWUP = CODE_FETCH_INITIAL.replace(
  '{status}="nuevo"',
  'OR({status}="enviado",{status}="email_enviado")'
);

// ─── Code node: After send — update Airtable + notify Telegram ───────────────
function buildCodeFinalize(newStatus, emailType) {
  return `
const AT_TOKEN = '${AT_TOKEN}';
const AT_URL   = 'https://api.airtable.com/v0/${AT_BASE}/${AT_TABLE}';
const TG_TOKEN = '${TG_TOKEN}';
const TG_CHAT  = '${TG_CHAT}';

const all = $input.all();
const sent = all.filter(i => !i.json.error);
const failed = all.filter(i => i.json.error);

// Batch update Airtable status (10 at a time)
const toUpdate = sent.map(i => ({ id: i.json.id, fields: { status: '${newStatus}' } }));
for (let i = 0; i < toUpdate.length; i += 10) {
  const batch = toUpdate.slice(i, i + 10);
  await this.helpers.httpRequest({
    method: 'PATCH',
    url: AT_URL,
    headers: { Authorization: 'Bearer ' + AT_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: batch }),
  });
}

// Stats by ciudad
const byCiudad = {};
const byDistrito = {};
for (const i of sent) {
  const c = i.json.ciudad || 'Sin ciudad';
  const d = i.json.distrito || '';
  byCiudad[c] = (byCiudad[c] || 0) + 1;
  if (d) byDistrito[d + ' (' + c + ')'] = (byDistrito[d + ' (' + c + ')'] || 0) + 1;
}

const ciudadLines = Object.entries(byCiudad).sort((a,b) => b[1]-a[1]).map(([c,n]) => '  • ' + c + ': ' + n).join('\\n');
const topDistritos = Object.entries(byDistrito).sort((a,b) => b[1]-a[1]).slice(0,5).map(([d,n]) => '  ' + d + ': ' + n).join('\\n');

const msg = [
  '📧 <b>${emailType}</b> completado',
  '',
  '<b>✅ Enviados:</b> ' + sent.length,
  '<b>❌ Fallidos:</b> ' + failed.length,
  '',
  '<b>Por ciudad:</b>',
  ciudadLines,
  '',
  '<b>Top distritos:</b>',
  topDistritos,
].join('\\n');

await this.helpers.httpRequest({
  method: 'POST',
  url: 'https://api.telegram.org/bot' + TG_TOKEN + '/sendMessage',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ chat_id: TG_CHAT, text: msg, parse_mode: 'HTML' }),
});

return [{ json: { sent: sent.length, failed: failed.length, byCiudad } }];
`;
}

// ─── Build workflow JSON ──────────────────────────────────────────────────────
function buildWorkflow(name, cronHour, fetchCode, finalizeCode, smtpSubject, emailBuilderJs, emailType) {
  // Lima = UTC-5, so 9am Lima = 14:00 UTC, 1pm Lima = 18:00 UTC
  const utcHour = cronHour + 5;
  return {
    name,
    nodes: [
      // 1. Schedule Trigger
      {
        id: 'trigger', name: 'CRON ' + cronHour + 'am Lima',
        type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.1,
        position: [0, 300],
        parameters: {
          rule: {
            interval: [{ field: 'cronExpression', expression: '0 ' + utcHour + ' * * *' }],
          },
        },
      },
      // 2. Fetch leads
      {
        id: 'fetch', name: 'Fetch Leads',
        type: 'n8n-nodes-base.code', typeVersion: 2,
        position: [250, 300],
        parameters: { jsCode: fetchCode, mode: 'runOnceForAllItems' },
      },
      // 3. Send Email
      {
        id: 'sendemail', name: 'Send Email',
        type: 'n8n-nodes-base.emailSend', typeVersion: 2.1,
        position: [500, 300],
        parameters: {
          fromEmail: 'gabriel@redsolucionesti.com',
          toEmail: '={{ $json.email }}',
          subject: smtpSubject,
          emailType: 'html',
          message: '={{ (() => { ' + emailBuilderJs + ' return ' + emailType + 'Html($json.nombre, $json.ciudad, $json.distrito); })() }}',
          options: { replyTo: 'gabriel@redsolucionesti.com', appendAttribution: false },
        },
        credentials: { smtp: SMTP_CRED },
      },
      // 4. Finalize
      {
        id: 'finalize', name: 'Actualizar AT + Telegram',
        type: 'n8n-nodes-base.code', typeVersion: 2,
        position: [750, 300],
        parameters: { jsCode: finalizeCode, mode: 'runOnceForAllItems' },
      },
    ],
    connections: Object.fromEntries([
      ['CRON ' + cronHour + 'am Lima', { main: [[{ node: 'Fetch Leads', type: 'main', index: 0 }]] }],
      ['Fetch Leads',                  { main: [[{ node: 'Send Email',  type: 'main', index: 0 }]] }],
      ['Send Email',                   { main: [[{ node: 'Actualizar AT + Telegram', type: 'main', index: 0 }]] }],
    ]),
    settings: { executionOrder: 'v1', saveExecutionProgress: true, saveDataSuccessExecution: 'all' },
  };
}

// ─── Create workflows ─────────────────────────────────────────────────────────

// The email message expression can't contain function definitions inline easily,
// so I'll put the HTML template building into the Fetch Leads code node instead.

const CODE_FETCH_INITIAL_WITH_HTML = `
const AT_TOKEN = '${AT_TOKEN}';
const AT_URL   = 'https://api.airtable.com/v0/${AT_BASE}/${AT_TABLE}';

function validEmail(e) {
  if (!e) return false;
  const s = String(e).trim();
  return s.length > 5 && /^[^@]+@[^@]{3,}\\.[a-z]{2,}$/i.test(s) &&
    !['example','test','lorem','noreply','wixpress','cloudflare','n@media','@m.co'].some(x => s.includes(x));
}

${INITIAL_EMAIL_JS}

const leads = [];
let offset = '';
let hasMore = true;
while (hasMore) {
  const params = new URLSearchParams();
  ['nombre','email','ciudad','distrito'].forEach(f => params.append('fields[]', f));
  params.set('filterByFormula', 'AND({status}="nuevo",{email}!="")');
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
      id: r.id,
      nombre,
      email: f.email.trim().toLowerCase(),
      ciudad,
      distrito,
      html: buildInitialHtml(nombre, ciudad, distrito),
    });
  }
  offset = res.offset || '';
  hasMore = !!res.offset;
}
return leads.map(l => ({ json: l }));
`;

const CODE_FETCH_FOLLOWUP_WITH_HTML = CODE_FETCH_INITIAL_WITH_HTML
  .replace(INITIAL_EMAIL_JS.trim(), FOLLOWUP_EMAIL_JS.trim())
  .replace('buildInitialHtml', 'buildFollowupHtml')
  .replace('{status}="nuevo"', 'OR({status}="enviado",{status}="email_enviado")');

const wf1 = buildWorkflow(
  'Leads - Email Inicial (9am Lima)',
  9,
  CODE_FETCH_INITIAL_WITH_HTML,
  buildCodeFinalize('enviado', 'Email Inicial'),
  'SofIA: agenda automática de citas por WhatsApp para tu clínica dental',
  '', 'initial',
);

const wf2 = buildWorkflow(
  'Leads - Email Follow-up (1pm Lima)',
  13,
  CODE_FETCH_FOLLOWUP_WITH_HTML,
  buildCodeFinalize('follow_up_enviado', 'Email Follow-up'),
  'Follow-up: ¿pudiste ver la info sobre SofIA?',
  '', 'followup',
);

// Override Send Email message to use $json.html (built in fetch node)
for (const wf of [wf1, wf2]) {
  wf.nodes.find(n => n.id === 'sendemail').parameters.message = '={{ $json.html }}';
}

// Create both workflows
console.log('Creando workflow 1: Email Inicial 9am...');
const r1 = await n8nPost('/api/v1/workflows', wf1);
console.log('  ✅ Creado:', r1.id, '—', r1.name);

console.log('Creando workflow 2: Follow-up 1pm...');
const r2 = await n8nPost('/api/v1/workflows', wf2);
console.log('  ✅ Creado:', r2.id, '—', r2.name);

// Activate both
console.log('Activando workflows...');
await fetch(`${BASE}/api/v1/workflows/${r1.id}/activate`, {
  method: 'POST', headers: { 'X-N8N-API-KEY': API_KEY }
});
await fetch(`${BASE}/api/v1/workflows/${r2.id}/activate`, {
  method: 'POST', headers: { 'X-N8N-API-KEY': API_KEY }
});

console.log('\n✅ Listo!');
console.log('  Email Inicial → 9am Lima  → CRON 0 14 * * * (UTC)  → ID:', r1.id);
console.log('  Email Follow-up → 1pm Lima → CRON 0 18 * * * (UTC)  → ID:', r2.id);
console.log('\n  Leads "nuevo" con email válido: ~170');
console.log('  Leads "enviado" para follow-up: ~19');
console.log('\n  Telegram notificará a chat 7727513100 después de cada envío.');
