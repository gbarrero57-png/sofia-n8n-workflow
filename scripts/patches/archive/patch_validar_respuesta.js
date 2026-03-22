/**
 * Fix Validar Respuesta length limit
 * The INFO prompt now instructs AI to respond with up to 100 words + follow-up options,
 * which can reach ~800 chars. The old 500-char limit would incorrectly trigger escalation.
 */

const fs = require('fs');
const https = require('https');

const N8N_URL = 'https://workflows.n8n.redsolucionesti.com';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const WORKFLOW_ID = '37SLdWISQLgkHeXk';

function apiFetch(path, method, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(N8N_URL + path);
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: method || 'GET',
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 500)}`));
        } else {
          try { resolve(JSON.parse(data)); }
          catch (e) { resolve(data); }
        }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function main() {
  console.log('Fetching workflow...');
  const wf = await apiFetch(`/api/v1/workflows/${WORKFLOW_ID}`);
  const nodes = wf.nodes;

  const validarResp = nodes.find(n => n.name === 'Validar Respuesta');
  if (!validarResp) { console.error('Validar Respuesta not found'); process.exit(1); }

  const oldCode = validarResp.parameters.jsCode;
  const newCode = oldCode.replace(
    /if \(llm_response\.length > 500\)/,
    'if (llm_response.length > 800)'
  );

  if (newCode === oldCode) {
    console.log('No change needed (limit already updated or not found)');
    return;
  }

  validarResp.parameters.jsCode = newCode;
  console.log('Updated Validar Respuesta length limit: 500 -> 800 chars');

  const payload = {
    name:        wf.name,
    nodes:       wf.nodes,
    connections: wf.connections,
    settings:    wf.settings || {},
    staticData:  wf.staticData || null
  };

  const result = await apiFetch(`/api/v1/workflows/${WORKFLOW_ID}`, 'PUT', payload);
  console.log('Upload result — id:', result.id, '| active:', result.active);
  console.log('✅ Done!');
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
