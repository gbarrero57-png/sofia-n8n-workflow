// Patch SMS and Llamada workflows with real Twilio credentials
const https = require('https');

const N8N_HOST = 'workflows.n8n.redsolucionesti.com';
const API_KEY = process.env.N8N_API_KEY || '';

const TWILIO_SID  = 'AC4080780a4b4a7d8e7b107a39f01abad3';
const TWILIO_FROM = '+13186683828';
const CRED_ID     = 'yh9g07Rj36ac5eE0';
const CRED_NAME   = 'Twilio API';

const SMS_WF_ID    = 'q1RZvxPbZVNJKAT5';
const LLAMADA_WF_ID = 'nYsyOfbIUmEcJgbw';

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: N8N_HOST, path, method: 'GET', headers: { 'X-N8N-API-KEY': API_KEY } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.end();
  });
}

function apiPut(path, body) {
  const b = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: N8N_HOST, path, method: 'PUT',
      headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.write(b);
    req.end();
  });
}

async function patchSMS(wf) {
  // Fix URL with real Account SID
  const smsNode = wf.nodes.find(n => n.name === 'Enviar SMS Twilio');
  smsNode.parameters.url = 'https://api.twilio.com/2010-04-01/Accounts/' + TWILIO_SID + '/Messages.json';

  // Fix From number
  const fromParam = smsNode.parameters.bodyParameters.parameters.find(p => p.name === 'From');
  fromParam.value = TWILIO_FROM;

  // Assign credential
  smsNode.credentials = { httpBasicAuth: { id: CRED_ID, name: CRED_NAME } };

  console.log('SMS: URL and From fixed, credential assigned');
  return wf;
}

async function patchLlamada(wf) {
  // Fix Preparar Llamada code node - replace placeholder SID
  const prepNode = wf.nodes.find(n => n.name === 'Preparar Llamada');
  prepNode.parameters.jsCode = prepNode.parameters.jsCode.replace(
    'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    TWILIO_SID
  );

  // Fix Hacer Llamada - From number and credential
  const callNode = wf.nodes.find(n => n.name === 'Hacer Llamada');
  const fromParam = callNode.parameters.bodyParameters.parameters.find(p => p.name === 'From');
  fromParam.value = TWILIO_FROM;
  callNode.credentials = { httpBasicAuth: { id: CRED_ID, name: CRED_NAME } };

  // Fix Actualizar Llamada if it needs credential
  console.log('Llamada: SID, From fixed, credential assigned');
  return wf;
}

async function run() {
  if (!API_KEY) { console.error('Set N8N_API_KEY env var'); process.exit(1); }

  console.log('Fetching workflows...');
  const [smsWf, llamadaWf] = await Promise.all([
    apiGet('/api/v1/workflows/' + SMS_WF_ID),
    apiGet('/api/v1/workflows/' + LLAMADA_WF_ID)
  ]);

  await patchSMS(smsWf);
  await patchLlamada(llamadaWf);

  console.log('Pushing updates...');
  const [smsRes, llamadaRes] = await Promise.all([
    apiPut('/api/v1/workflows/' + SMS_WF_ID, {
      name: smsWf.name,
      nodes: smsWf.nodes,
      connections: smsWf.connections,
      settings: smsWf.settings,
      staticData: smsWf.staticData
    }),
    apiPut('/api/v1/workflows/' + LLAMADA_WF_ID, {
      name: llamadaWf.name,
      nodes: llamadaWf.nodes,
      connections: llamadaWf.connections,
      settings: llamadaWf.settings,
      staticData: llamadaWf.staticData
    })
  ]);

  console.log('SMS PUT:', smsRes.status, smsRes.status === 200 ? 'OK' : smsRes.body.slice(0, 200));
  console.log('Llamada PUT:', llamadaRes.status, llamadaRes.status === 200 ? 'OK' : llamadaRes.body.slice(0, 200));
}

run().catch(console.error);
