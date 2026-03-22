// patch_formatear_oferta.js — Include preference_note in slot offer message
const https = require('https');

const N8N_HOST = 'workflows.n8n.redsolucionesti.com';
const API_KEY  = process.env.N8N_API_KEY || '';
const WF_ID    = '37SLdWISQLgkHeXk';

const newCode = [
  '// FORMAT SLOT OFFER MESSAGE — with preference context',
  'const slots = $json.selected_slots || [];',
  'const prefNote = $json.preference_note || "";',
  '',
  'if (slots.length === 0) {',
  '  return [{ json: Object.assign({}, $json, {',
  '    offer_message: "Lo siento, no hay horarios disponibles en los proximos 7 dias.",',
  '    should_escalate: true,',
  '    escalation_reason: "NO_SLOTS_AVAILABLE"',
  '  }) }];',
  '}',
  '',
  'var message = "";',
  'if (prefNote) {',
  '  message += prefNote + "\\n\\n";',
  '}',
  'message += "¡Perfecto! Tengo estos horarios disponibles:\\n\\n";',
  '',
  'for (var i = 0; i < slots.length; i++) {',
  '  var s = slots[i];',
  '  message += s.option_number + ". " + s.date + " a las " + s.time + "\\n";',
  '}',
  '',
  'message += "\\nResponde con *1*, *2* o *3* para confirmar.";',
  '',
  'return [{ json: Object.assign({}, $json, {',
  '  offer_message: message,',
  '  offered_slots: slots,',
  '  awaiting_slot_confirmation: true,',
  '  should_escalate: false',
  '}) }];'
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
  const node = wf.nodes.find(n => n.name === 'Formatear Oferta de Slots');
  if (!node) { console.error('Node not found'); process.exit(1); }
  node.parameters.jsCode = newCode;
  const res = await apiPut('/api/v1/workflows/' + WF_ID, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings, staticData: wf.staticData
  });
  console.log('PUT:', res.status, res.status === 200 ? 'OK' : res.body.slice(0, 200));
}

run().catch(console.error);
