import { readFileSync } from 'fs';

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const BASE   = 'https://workflows.n8n.redsolucionesti.com';
const TG_CHAT = '-4523041658'; // TELEGRAM_CHAT_ID from memory
const TG_CRED = { telegramApi: { id: 'cSaxAEvIePNLpINc', name: 'Telegram account' } };

async function put(id, wf) {
  const r = await fetch(`${BASE}/api/v1/workflows/${id}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings, staticData: null })
  });
  const j = await r.json();
  if (!r.ok) throw new Error('PUT ' + id + ' failed: ' + JSON.stringify(j).slice(0, 300));
  return j;
}

// ── HELPER: build Telegram summary node + count node ─────────────
function makeSummaryNodes(prefix, lastNode, tgNodeId, countNodeId, summaryCode, tgText, posCount, posTg) {
  const countNode = {
    id: countNodeId,
    name: prefix + ' - Resumen',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: posCount,
    parameters: { jsCode: summaryCode }
  };
  const tgNode = {
    id: tgNodeId,
    name: prefix + ' - Notificar Telegram',
    type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2,
    position: posTg,
    parameters: {
      chatId: TG_CHAT,
      text: tgText,
      additionalFields: { parse_mode: 'Markdown' }
    },
    credentials: TG_CRED
  };
  return { countNode, tgNode };
}

// ═══════════════════════════════════════════════════════════════
// 1. EMAIL WORKFLOW
// ═══════════════════════════════════════════════════════════════
const emailWf = JSON.parse(readFileSync('C:/Users/Barbara/Documents/n8n_workflow_claudio/saas/email_tg.json', 'utf8'));

const emailSummaryCode = [
  "var items = $input.all();",
  "var total = items.length;",
  "var meta = 0, gmap = 0;",
  "items.forEach(function(i) {",
  "  if ((i.json.fuente||'google_maps') === 'meta_ads') meta++;",
  "  else gmap++;",
  "});",
  "return [{ json: { total: total, meta_ads: meta, google_maps: gmap } }];"
].join('\n');

const emailTgText = [
  "=📧 *SofIA - Emails Enviados*",
  "",
  "📊 *Resumen del día:*",
  "• Total enviados: {{ $json.total }}",
  "• 🔥 Meta Ads (warm): {{ $json.meta_ads }}",
  "• 📍 Google Maps (cold): {{ $json.google_maps }}",
  "",
  "🕘 {{ $now.format('DD/MM/YYYY HH:mm') }} Lima"
].join('\n');

const { countNode: emailCount, tgNode: emailTg } = makeSummaryNodes(
  'Email', 'Actualizar Email Enviado', 'email-tg-01', 'email-count-01',
  emailSummaryCode, emailTgText, [1540, 400], [1760, 400]
);

emailWf.nodes.push(emailCount, emailTg);
emailWf.connections['Actualizar Email Enviado'] = {
  main: [[{ node: 'Email - Resumen', type: 'main', index: 0 }]]
};
emailWf.connections['Email - Resumen'] = {
  main: [[{ node: 'Email - Notificar Telegram', type: 'main', index: 0 }]]
};

const emailResult = await put('8mglaD5SCaFB2XWZ', emailWf);
console.log('✅ Email workflow updated:', emailResult.id);

// ═══════════════════════════════════════════════════════════════
// 2. SMS WORKFLOW
// ═══════════════════════════════════════════════════════════════
const smsWf = JSON.parse(readFileSync('C:/Users/Barbara/Documents/n8n_workflow_claudio/saas/sms_tg.json', 'utf8'));

const smsSummaryCode = [
  "var items = $input.all();",
  "var total = items.length;",
  "var meta = 0, gmap_email = 0, gmap_new = 0, followup = 0;",
  "items.forEach(function(i) {",
  "  var f = i.json.fuente || 'google_maps';",
  "  var s = i.json.status || '';",
  "  if (f === 'meta_ads') meta++;",
  "  else if (s === 'nuevo') gmap_new++;",
  "  else if (s === 'email_enviado') gmap_email++;",
  "  else followup++;",
  "});",
  "return [{ json: { total: total, meta_ads: meta, gmap_sin_email: gmap_new, gmap_followup: gmap_email, otros: followup } }];"
].join('\n');

const smsTgText = [
  "=📱 *SofIA - SMS Enviados*",
  "",
  "📊 *Resumen del día:*",
  "• Total enviados: {{ $json.total }}",
  "• 🔥 Meta Ads (warm): {{ $json.meta_ads }}",
  "• 📍 Google Maps sin email: {{ $json.gmap_sin_email }}",
  "• 🔄 Google Maps follow-up: {{ $json.gmap_followup }}",
  "• 📋 Otros: {{ $json.otros }}",
  "",
  "🕙 {{ $now.format('DD/MM/YYYY HH:mm') }} Lima"
].join('\n');

const { countNode: smsCount, tgNode: smsTg } = makeSummaryNodes(
  'SMS', 'Actualizar SMS Enviado', 'sms-tg-01', 'sms-count-01',
  smsSummaryCode, smsTgText, [1320, 280], [1540, 280]
);

smsWf.nodes.push(smsCount, smsTg);
smsWf.connections['Actualizar SMS Enviado'] = {
  main: [[{ node: 'SMS - Resumen', type: 'main', index: 0 }]]
};
smsWf.connections['SMS - Resumen'] = {
  main: [[{ node: 'SMS - Notificar Telegram', type: 'main', index: 0 }]]
};

const smsResult = await put('q1RZvxPbZVNJKAT5', smsWf);
console.log('✅ SMS workflow updated:', smsResult.id);

// ═══════════════════════════════════════════════════════════════
// 3. LLAMADA WORKFLOW
// ═══════════════════════════════════════════════════════════════
const callWf = JSON.parse(readFileSync('C:/Users/Barbara/Documents/n8n_workflow_claudio/saas/call_tg.json', 'utf8'));

const callSummaryCode = [
  "var items = $input.all();",
  "var total = items.length;",
  "var meta = 0, gmap = 0;",
  "items.forEach(function(i) {",
  "  if ((i.json.fuente||'google_maps') === 'meta_ads') meta++;",
  "  else gmap++;",
  "});",
  "return [{ json: { total: total, meta_ads: meta, google_maps: gmap } }];"
].join('\n');

const callTgText = [
  "=📞 *SofIA - Llamadas Realizadas*",
  "",
  "📊 *Resumen del día:*",
  "• Total llamadas: {{ $json.total }}",
  "• 🔥 Meta Ads (warm): {{ $json.meta_ads }}",
  "• 📍 Google Maps (cold): {{ $json.google_maps }}",
  "",
  "🕚 {{ $now.format('DD/MM/YYYY HH:mm') }} Lima"
].join('\n');

// Find last node in call workflow
const lastCallNode = callWf.nodes.find(n => n.name === 'Actualizar Llamada');
const lastCallName = lastCallNode ? 'Actualizar Llamada' : callWf.nodes[callWf.nodes.length - 1].name;
const lastCallPos  = lastCallNode ? lastCallNode.position : [880, 400];

const { countNode: callCount, tgNode: callTg } = makeSummaryNodes(
  'Llamada', lastCallName, 'call-tg-01', 'call-count-01',
  callSummaryCode, callTgText,
  [lastCallPos[0] + 220, lastCallPos[1]],
  [lastCallPos[0] + 440, lastCallPos[1]]
);

callWf.nodes.push(callCount, callTg);
callWf.connections[lastCallName] = {
  main: [[{ node: 'Llamada - Resumen', type: 'main', index: 0 }]]
};
callWf.connections['Llamada - Resumen'] = {
  main: [[{ node: 'Llamada - Notificar Telegram', type: 'main', index: 0 }]]
};

const callResult = await put('nYsyOfbIUmEcJgbw', callWf);
console.log('✅ Llamada workflow updated:', callResult.id);

console.log('\n=== TELEGRAM REPORTS CONFIGURADOS ===');
console.log('Recibirás notificaciones como:');
console.log('📧 Email → cantidad + meta_ads vs google_maps');
console.log('📱 SMS   → cantidad + clasificación por tipo');
console.log('📞 Llamada → cantidad + meta_ads vs google_maps');
