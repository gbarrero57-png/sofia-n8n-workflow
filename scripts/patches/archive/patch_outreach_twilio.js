// PATCH: Outreach Llamadas y SMS — credenciales reales Twilio
// Credentials created:
//   Twilio Basic Auth (httpBasicAuth): 54eFThUpUnQMMxHD
//   Twilio API (twilioApi):            QIsqVRYzfNxGw6OO

const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const WF_ID = 'EFnNBEXSCnUwRPM2';
const TWILIO_SID  = 'AC4080780a4b4a7d8e7b107a39f01abad3';
const TWILIO_FROM = '+13186683828';

function n8nRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const req = https.request({
      hostname: 'workflows.n8n.redsolucionesti.com',
      path,
      method,
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  console.log('1. Fetching workflow', WF_ID);
  const wf = await n8nRequest('GET', '/api/v1/workflows/' + WF_ID);
  console.log('   Got:', wf.name, '| nodes:', wf.nodes.length);

  let patched = 0;

  wf.nodes = wf.nodes.map(n => {
    // ── Configuracion: reemplazar placeholders ────────────────────────
    if (n.name === 'Configuracion') {
      n.parameters.jsCode = n.parameters.jsCode
        .replace(/ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/g, TWILIO_SID)
        .replace(/\+1XXXXXXXXXX/g, TWILIO_FROM);
      console.log('2. Patched Configuracion — SID + From');
      patched++;
    }

    // ── Hacer Llamada: agregar credencial Basic Auth ──────────────────
    if (n.name === 'Hacer Llamada' && n.type === 'n8n-nodes-base.httpRequest') {
      n.credentials = {
        httpBasicAuth: { id: '54eFThUpUnQMMxHD', name: 'Twilio Basic Auth' }
      };
      // Mejorar TwiML con voz más natural
      const twiml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Response>',
        '<Say voice="Polly.Mia-Neural" language="es-US">',
        'Hola, buenos dias. Le llamamos de parte de SofIA, ',
        'el asistente de inteligencia artificial para clinicas dentales en Lima. ',
        'Le enviamos un mensaje hace unos dias sobre como automatizar ',
        'la agenda de citas por WhatsApp las 24 horas. ',
        'Si le interesa una demostracion gratuita, ',
        'por favor responda el mensaje de texto que le enviamos. ',
        'Muchas gracias y que tenga un excelente dia.',
        '</Say>',
        '</Response>'
      ].join('');
      const bParams = n.parameters.bodyParameters.parameters;
      const twimlParam = bParams.find(p => p.name === 'Twiml');
      if (twimlParam) twimlParam.value = twiml;
      console.log('3. Patched Hacer Llamada — credential + TwiML');
      patched++;
    }

    // ── Enviar SMS: agregar credencial twilioApi ──────────────────────
    if (n.name === 'Enviar SMS') {
      n.credentials = {
        twilioApi: { id: 'QIsqVRYzfNxGw6OO', name: 'Twilio API' }
      };
      console.log('4. Patched Enviar SMS — twilioApi credential');
      patched++;
    }

    return n;
  });

  console.log('   Total patches:', patched);

  // ── PUT workflow ──────────────────────────────────────────────────────
  console.log('5. Deploying...');
  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || {},
    staticData: wf.staticData || null
  };
  const result = await n8nRequest('PUT', '/api/v1/workflows/' + WF_ID, payload);
  if (result.id) {
    console.log('✅ Deployed:', result.name, '| nodes:', result.nodes.length);
  } else {
    console.error('❌ Error:', JSON.stringify(result).substring(0, 300));
  }
}

main().catch(console.error);
