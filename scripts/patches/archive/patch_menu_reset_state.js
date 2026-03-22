// patch_menu_reset_state.js
// Adds awaiting_slot label clearing to Generar Texto Menu
// So any previous slot confirmation state is reset when menu is shown
const https = require('https');

const N8N_HOST = 'workflows.n8n.redsolucionesti.com';
const API_KEY  = process.env.N8N_API_KEY || '';
const WF_ID    = '37SLdWISQLgkHeXk';

const newCode = [
  'const ctx = $input.first().json;',
  'const botConfig = ctx.bot_config || {};',
  'const menu = botConfig.menu || {};',
  'const clinicName = ctx.clinic_name || "la clinica";',
  'const header = (menu.header || "Hola! Soy SofIA tu asistente virtual").replace("{clinic_name}", clinicName);',
  'const footer = menu.footer || "\\nResponde con el numero de tu opcion.";',
  'const options = menu.options || [',
  '  { id: "1", emoji: "📅", label: "Agendar una cita" },',
  '  { id: "2", emoji: "🕐", label: "Horarios y ubicacion" },',
  '  { id: "3", emoji: "💰", label: "Servicios y precios" },',
  '  { id: "4", emoji: "📋", label: "Ver o cancelar mi cita" },',
  '  { id: "5", emoji: "👤", label: "Hablar con un agente" }',
  '];',
  'const optionLines = options.map(function(o) { return o.emoji + " *" + o.id + ".* " + o.label; }).join("\\n");',
  'const menuText = header + "\\n\\n" + optionLines + footer;',
  '',
  '// Reset slot confirmation state — clear awaiting_slot label',
  'try {',
  '  await this.helpers.httpRequest({',
  '    method: "POST",',
  '    url: "https://chat.redsolucionesti.com/api/v1/accounts/" + ctx.account_id + "/conversations/" + ctx.conversation_id + "/labels",',
  '    headers: { "api_access_token": "yypAwZDH2dV3crfbqJqWCgj1", "Content-Type": "application/json" },',
  '    body: { labels: [] },',
  '    json: true',
  '  });',
  '} catch(e) { /* non-fatal — continue showing menu */ }',
  '',
  'return [{ json: Object.assign({}, ctx, { menu_text: menuText, menu_options: options }) }];'
].join('\n');

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: N8N_HOST, path, method: 'GET', headers: { 'X-N8N-API-KEY': API_KEY } }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }); req.on('error', reject); req.end();
  });
}

function apiPut(path, body) {
  const b = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: N8N_HOST, path, method: 'PUT',
      headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    }); req.on('error', reject); req.write(b); req.end();
  });
}

async function run() {
  if (!API_KEY) { console.error('Set N8N_API_KEY'); process.exit(1); }
  const wf = await apiGet('/api/v1/workflows/' + WF_ID);
  const node = wf.nodes.find(n => n.name === 'Generar Texto Menu');
  if (!node) { console.error('Node not found'); process.exit(1); }
  node.parameters.jsCode = newCode;
  const res = await apiPut('/api/v1/workflows/' + WF_ID, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings, staticData: wf.staticData
  });
  console.log('PUT:', res.status, res.status === 200 ? 'OK' : res.body.slice(0, 200));
}

run().catch(console.error);
