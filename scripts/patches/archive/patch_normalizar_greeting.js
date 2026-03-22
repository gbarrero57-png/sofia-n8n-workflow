// Fix Normalizar Intent: stop converting GREETING → INFO
// GREETING now has its own branch (¿Es MENU o GREETING?)
const https = require('https');

const N8N_HOST = 'workflows.n8n.redsolucionesti.com';
const API_KEY  = process.env.N8N_API_KEY || '';
const WF_ID    = '37SLdWISQLgkHeXk';

const newCode = [
  '// NORMALIZAR OUTPUT DEL CLASIFICADOR',
  '// Keyword path: context is intact in $json',
  'if ($json.skip_ai === true && $json.intent) {',
  '    const intent = $json.intent;',
  '    // GREETING is now handled by ¿Es MENU o GREETING? — do NOT convert to INFO',
  '    return [{ json: Object.assign({}, $json, { intent: intent, classified_at: new Date().toISOString(), phase: "PHASE_1_WITH_PRE_CLASSIFIER" }) }];',
  '}',
  '',
  '// AI path: restore context from Pre-Clasificador Keywords node',
  'const ctx = $node["Pre-Clasificador Keywords"].json;',
  'let intent_data = $json.output || $json;',
  'if (typeof intent_data === "string") {',
  '    try { intent_data = JSON.parse(intent_data); }',
  '    catch(e) {',
  '        const t = intent_data.toLowerCase();',
  '        if (t.includes("create_event")) intent_data = { intent: "CREATE_EVENT", confidence: "low" };',
  '        else if (t.includes("info"))   intent_data = { intent: "INFO",         confidence: "low" };',
  '        else if (t.includes("payment")) intent_data = { intent: "PAYMENT",     confidence: "low" };',
  '        else intent_data = { intent: "HUMAN", confidence: "low" };',
  '    }',
  '}',
  'let intent = (intent_data.intent || "HUMAN").trim().toUpperCase();',
  'let confidence = (intent_data.confidence || "low").toLowerCase();',
  'const valid = ["CREATE_EVENT","INFO","PAYMENT","HUMAN"];',
  'if (!valid.includes(intent)) { intent = "HUMAN"; confidence = "low"; }',
  'return [{ json: Object.assign({}, ctx, { intent: intent, confidence: confidence, classified_at: new Date().toISOString(), phase: "PHASE_1_WITH_AI_CLASSIFIER" }) }];'
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
  const node = wf.nodes.find(n => n.name === 'Normalizar Intent');
  if (!node) { console.error('Node not found'); process.exit(1); }
  node.parameters.jsCode = newCode;
  const res = await apiPut('/api/v1/workflows/' + WF_ID, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings, staticData: wf.staticData
  });
  console.log('PUT:', res.status, res.status === 200 ? 'OK' : res.body.slice(0, 200));
}

run().catch(console.error);
