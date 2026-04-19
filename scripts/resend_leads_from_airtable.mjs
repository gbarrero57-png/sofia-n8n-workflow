/**
 * resend_leads_from_airtable.mjs
 * Reads Meta Ads leads from Airtable via HTTP Request,
 * sends each as a Telegram notification with real phone + SofIA WA link.
 * Self-deactivates after one run.
 *
 * Run: node scripts/resend_leads_from_airtable.mjs
 */

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const BASE    = 'https://workflows.n8n.redsolucionesti.com';
const CHAT_ID = '7727513100';
const WF_ID   = 'TDtSFOtpg6DVpYHE';

const WA_SUFFIX = encodeURIComponent(
  ', soy Gabriel de RedSoluciones TI \uD83D\uDC4B' +
  ' Vi que completaste nuestro formulario sobre SofIA AI para cl\u00EDnicas dentales.' +
  ' \u00BFTienes 10 min esta semana para una demo gratis? \uD83E\uDDB7'
);

// ── Build Code node source using array join (no shell/template escaping issues) ──
const CODE_BUILD = [
  "const resp = $input.first().json;",
  "const records = resp.records || [];",
  "",
  "var WA_SUFFIX = '" + WA_SUFFIX + "';",
  "",
  "var citasLabel = function(val) {",
  "  if (!val) return '';",
  "  var n = parseInt(val);",
  "  if (!isNaN(n)) {",
  "    if (n < 20) return '\\uD83D\\uDFE2 &lt;20 citas/sem';",
  "    if (n < 50) return '\\uD83D\\uDD35 20-50 citas/sem';",
  "    return '\\uD83D\\uDFE3 &gt;50 citas/sem';",
  "  }",
  "  return val;",
  "};",
  "",
  "// Real meta leads: have nombre + email but NO website or direccion (those are clinic/maps leads)",
  "// Phantom blank records: have neither nombre nor email",
  "var metaLeads = records.filter(function(rec) {",
  "  var f = rec.fields || {};",
  "  return f.nombre && f.nombre.trim() && f.email && !f.website && !f.direccion;",
  "});",
  "",
  "console.log(JSON.stringify({ total_status_nuevo: records.length, meta_leads_real: metaLeads.length }));",
  "",
  "return metaLeads.map(function(rec) {",
  "  var f = rec.fields || {};",
  "  var nombre   = f.nombre   || '';",
  "  var telefono = f.telefono || '';",
  "  var email    = f.email    || '';",
  "  var citas    = f.citas    || f.total_semanas || '';",
  "",
  "  var digits = telefono.replace(/\\D/g, '');",
  "  var phone = '';",
  "  if (digits) {",
  "    if (digits.startsWith('51') && digits.length >= 11) phone = digits;",
  "    else if (digits.startsWith('9') && digits.length === 9) phone = '51' + digits;",
  "    else if (digits.length > 6) phone = digits;",
  "  }",
  "",
  "  var firstName = (nombre.split(' ')[0] || nombre).trim();",
  "  var waLink = phone",
  "    ? 'https://wa.me/' + phone + '?text=Hola+' + encodeURIComponent(firstName) + WA_SUFFIX",
  "    : 'https://wa.me/?text=Hola+' + encodeURIComponent(firstName) + WA_SUFFIX;",
  "",
  "  var cl = citasLabel(citas);",
  "",
  "  // HTML mode: escape < > & in dynamic content (emails can have underscores which break Markdown)",
  "  var esc = function(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };",
  "",
  "  var text = '\\uD83C\\uDFAF <b>Lead Meta Ads</b>\\n\\n' +",
  "    '\\uD83D\\uDC64 <b>' + esc(nombre) + '</b>\\n' +",
  "    (phone ? '\\uD83D\\uDCF1 +' + phone + '\\n' : '') +",
  "    '\\uD83D\\uDCE7 ' + esc(email) + '\\n' +",
  "    (cl ? '\\uD83D\\uDCC5 ' + cl + '\\n' : '') +",
  "    '\\n\\uD83D\\uDCF2 <b>Escribirle:</b>\\n' + waLink;",
  "",
  "  return { json: { telegram_text: text, nombre: nombre, phone: phone } };",
  "});"
].join('\n');

const CODE_DEACTIVATE = [
  "const items = $input.all();",
  "try {",
  "  await this.helpers.httpRequest({",
  "    method: 'POST',",
  "    url: 'https://workflows.n8n.redsolucionesti.com/api/v1/workflows/' + $workflow.id + '/deactivate',",
  "    headers: { 'X-N8N-API-KEY': '" + API_KEY + "' },",
  "    json: true",
  "  });",
  "  console.log('Deactivated after ' + items.length + ' notifications');",
  "} catch(e) { console.warn(e.message); }",
  "return [{ json: { total_sent: items.length } }];"
].join('\n');

// ── Fetch and update the existing workflow ────────────────────────────────────
const wf = await fetch(`${BASE}/api/v1/workflows/${WF_ID}`, {
  headers: { 'X-N8N-API-KEY': API_KEY }
}).then(r => r.json());

// Update nodes
wf.nodes.find(n => n.name === 'Construir Mensajes').parameters.jsCode = CODE_BUILD;
wf.nodes.find(n => n.name === 'Auto Desactivar').parameters.jsCode    = CODE_DEACTIVATE;

// Reset Airtable query to status=nuevo, all fields, pageSize 100
const airtableNode = wf.nodes.find(n => n.name === 'Leer Leads Airtable');
airtableNode.parameters.queryParameters = {
  parameters: [
    { name: 'filterByFormula', value: "{status}='nuevo'" },
    { name: 'pageSize', value: '100' }
  ]
};

const r1 = await fetch(`${BASE}/api/v1/workflows/${WF_ID}`, {
  method: 'PUT',
  headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings, staticData: null })
});
console.log(r1.ok ? '✅ Workflow updated' : '❌ Update failed: ' + r1.status);

const r2 = await fetch(`${BASE}/api/v1/workflows/${WF_ID}/activate`, {
  method: 'POST', headers: { 'X-N8N-API-KEY': API_KEY }
});
console.log(r2.ok ? '✅ Activated — fires in < 1 min' : '❌ Activate error: ' + r2.status);
console.log('   Workflow ID:', WF_ID);
