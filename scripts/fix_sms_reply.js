const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';

function n8n(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const req = https.request({
      hostname: 'workflows.n8n.redsolucionesti.com', path, method,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
    }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => resolve(JSON.parse(d))); });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// Build the Telegram text expression using dot notation (no double quotes inside)
// $json.From = numero del lead
// $json.Body = texto del mensaje
const telegramText = [
  '={{',
  '"SMS Outreach\\n\\n" +',
  '"De: " + ($json.From || "") + "\\n" +',
  '"Mensaje: " + ($json.Body || "") + "\\n\\n" +',
  '(/^(si|yes|dale|ok|quiero|interesa)/i.test(($json.Body || "").trim())',
  '  ? "INTERESADO - llamar ahora!"',
  '  : /^(stop|baja)/i.test(($json.Body || "").trim())',
  '    ? "STOP - dar de baja"',
  '    : "Respuesta recibida")',
  '}}'
].join(' ');

async function main() {
  await n8n('POST', '/api/v1/workflows/hePACJnCY9lTAJez/deactivate');
  const wf = await n8n('GET', '/api/v1/workflows/hePACJnCY9lTAJez');

  wf.nodes = wf.nodes.map(n => {
    if (n.name === 'Telegram') {
      n.parameters.text = telegramText;
      // Remove parse_mode to avoid emoji/markdown issues
      n.parameters.additionalFields = {};
      console.log('Telegram node fixed');
    }
    return n;
  });

  const r = await n8n('PUT', '/api/v1/workflows/hePACJnCY9lTAJez', {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings || {}, staticData: wf.staticData || null
  });
  console.log('PUT:', r.id ? 'OK' : 'ERROR ' + JSON.stringify(r).substring(0, 200));

  await n8n('POST', '/api/v1/workflows/hePACJnCY9lTAJez/activate');
  console.log('Activado. Probando...');
}
main().catch(console.error);
