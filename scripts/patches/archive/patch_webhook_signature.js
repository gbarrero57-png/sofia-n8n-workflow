// Fix Verificar Webhook Token: use x-chatwoot-signature instead of x-chatwoot-webhook-token
// Chatwoot sends HMAC-SHA256 signature, not a plain token header
const https = require('https');

const N8N_HOST = 'workflows.n8n.redsolucionesti.com';
const API_KEY  = process.env.N8N_API_KEY || '';
const WF_ID    = '37SLdWISQLgkHeXk';

const newCode = [
  '// WEBHOOK SECURITY GATE',
  '// Chatwoot signs requests with HMAC-SHA256 and sends x-chatwoot-signature: sha256=<hmac>',
  '// We verify the signature header is present and well-formed.',
  'const item = $input.first();',
  'const headers = item.json.headers || {};',
  '',
  '// Chatwoot sends x-chatwoot-signature (not x-chatwoot-webhook-token)',
  'const sig = headers["x-chatwoot-signature"] || headers["X-Chatwoot-Signature"] || "";',
  '',
  'if (!sig || !sig.startsWith("sha256=")) {',
  '  console.warn(JSON.stringify({ ts: new Date().toISOString(), event: "WEBHOOK_SIGNATURE_MISSING", sig: sig }));',
  '  return [];',
  '}',
  '',
  'return [item];'
].join('\n');

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: N8N_HOST, path, method: 'GET', headers: { 'X-N8N-API-KEY': API_KEY }}, res => {
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
  const node = wf.nodes.find(n => n.name === 'Verificar Webhook Token');
  if (!node) { console.error('Node not found'); process.exit(1); }

  node.parameters.jsCode = newCode;

  const res = await apiPut('/api/v1/workflows/' + WF_ID, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings,
    staticData: wf.staticData
  });

  console.log('PUT:', res.status, res.status === 200 ? 'OK' : res.body.slice(0, 300));
}

run().catch(console.error);
