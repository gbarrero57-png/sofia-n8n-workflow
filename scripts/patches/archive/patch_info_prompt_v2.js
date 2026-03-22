// Patch Preparar Prompt INFO - more concrete, actionable responses
const https = require('https');

const N8N_HOST = 'workflows.n8n.redsolucionesti.com';
const API_KEY  = process.env.N8N_API_KEY || '';
const WF_ID    = '37SLdWISQLgkHeXk';

const newCode = [
  'const message_text = $json.message_text || "";',
  'const clinic_name = $json.clinic_name || "la clinica";',
  'const isGreeting = $json.is_greeting === true;',
  'const welcomeMsg = $json.welcome_message_text || ("Hola! Soy SofIA de " + clinic_name + ". En que puedo ayudarte?");',
  'const kb_context = $json.kb_context || "";',
  'var system_prompt, user_prompt;',
  '',
  'if (isGreeting) {',
  '    system_prompt = "Eres SofIA, asistente virtual de " + clinic_name + ". El paciente te saludo. Responde EXACTAMENTE con: \\"" + welcomeMsg + "\\" No agregues nada mas.";',
  '    user_prompt = message_text;',
  '} else {',
  '    var rules = [',
  '        "1. Se amable y directo, maximo 2-3 oraciones",',
  '        "2. Responde en espanol",',
  '        "3. Si el paciente pregunta sobre disponibilidad o si puede ir un dia especifico, SIEMPRE dile que escriba: quiero una cita el [dia] y la verificaras inmediatamente",',
  '        "4. Si tienes la informacion en el contexto, usala. Si no, di honestamente que no tienes ese dato y ofrece conectarlo con un agente",',
  '        "5. NUNCA prometas algo que no puedes cumplir",',
  '        "6. NO uses frases vagas como te recomiendo agendar una cita. Se especifico sobre el siguiente paso"',
  '    ].join(". ");',
  '    var kbSection = kb_context ? "INFORMACION DE LA CLINICA:\\n" + kb_context + "\\n\\n" : "";',
  '    system_prompt = "Eres SofIA, asistente virtual de la clinica dental " + clinic_name + ". " + kbSection + "REGLAS: " + rules;',
  '    user_prompt = message_text;',
  '}',
  '',
  'return [{ json: Object.assign({}, $json, { system_prompt: system_prompt, user_prompt: user_prompt }) }];'
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
  const node = wf.nodes.find(n => n.name === 'Preparar Prompt INFO');
  if (!node) { console.error('Node not found'); process.exit(1); }
  node.parameters.jsCode = newCode;
  const res = await apiPut('/api/v1/workflows/' + WF_ID, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings, staticData: wf.staticData
  });
  console.log('PUT:', res.status, res.status === 200 ? 'OK' : res.body.slice(0, 300));
}

run().catch(console.error);
