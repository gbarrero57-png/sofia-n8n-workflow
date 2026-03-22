// Patch Pre-Clasificador Keywords v3
// Fixes: "si" when awaiting_slot, broader CREATE_EVENT keyword coverage
const https = require('https');

const N8N_HOST = 'workflows.n8n.redsolucionesti.com';
const API_KEY  = process.env.N8N_API_KEY || '';
const WF_ID    = '37SLdWISQLgkHeXk';

const newCode = [
  '// PRE-CLASIFICADOR BASADO EN KEYWORDS v3',
  'const message = ($json.message_text || "").toLowerCase().trim();',
  '',
  '// 1. SLOT CONFIRMATION: highest priority',
  'const convLabels = $json.raw_payload && $json.raw_payload.conversation && $json.raw_payload.conversation.labels || [];',
  'const awaitingSlot = convLabels.includes("awaiting_slot");',
  '',
  'if (awaitingSlot) {',
  '    // Accept number (1,2,3) or written number',
  '    const wordMap = { "uno":"1","one":"1","dos":"2","two":"2","tres":"3","three":"3" };',
  '    const cleanMsg = message.replace(/[^a-z0-9 ]/g, "").trim();',
  '    const slotFromWord = wordMap[cleanMsg];',
  '    const slotFromDigit = message.match(/[1-3]/)?.[0];',
  '    const slotDigit = slotFromWord || slotFromDigit || null;',
  '    if (slotDigit) {',
  '        return [{ json: Object.assign({}, $json, { message_text: slotDigit, intent: "CREATE_EVENT", confidence: "high", classified_by: "SLOT_CONFIRMATION_DETECTOR", skip_ai: true }) }];',
  '    }',
  '    // Accept affirmative responses → let Check Slot Confirmation State handle',
  '    const affirmatives = ["si","sí","yes","ok","dale","de acuerdo","bueno","perfecto","claro","listo","va","quiero","ese","esa","ese mismo","esa misma"];',
  '    if (affirmatives.includes(cleanMsg) || affirmatives.some(a => cleanMsg.startsWith(a + " "))) {',
  '        return [{ json: Object.assign({}, $json, { intent: "CREATE_EVENT", confidence: "high", classified_by: "SLOT_AFFIRMATION_DETECTOR", skip_ai: true }) }];',
  '    }',
  '}',
  '',
  '// 2. GREETING DETECTION',
  'const greetingRegex = /^(hola+|holi+|hey+|ola+|hi+|hello+|buenas?|buenos?|saludos?)[!.¡ ]*$/i;',
  'if (greetingRegex.test(message)) {',
  '    return [{ json: Object.assign({}, $json, { intent: "GREETING", confidence: "high", classified_by: "GREETING_DETECTOR", skip_ai: true }) }];',
  '}',
  '',
  '// 3. CREATE_EVENT keywords',
  'const CREATE_EVENT_KEYWORDS = [',
  '    "agendar","reservar","cita","turno","appointment",',
  '    "quiero una cita","necesito cita","quiero cita",',
  '    "cuando puedo ir","horarios","disponibilidad",',
  '    "hay espacio","hay lugar","tienen espacio","tienes espacio",',
  '    "hay disponibilidad","estan disponibles","estan libres",',
  '    "puedo ir el","puedo ir mañana","puedo ir hoy",',
  '    "disponible el lunes","disponible el martes","disponible el miercoles",',
  '    "disponible el jueves","disponible el viernes","disponible el sabado",',
  '    "el lunes pueden","el martes pueden","puedo agendar",',
  '    "hora disponible","tienen hora","hay hora","una hora para"',
  '];',
  'for (var i=0; i<CREATE_EVENT_KEYWORDS.length; i++) {',
  '    if (message.includes(CREATE_EVENT_KEYWORDS[i])) {',
  '        return [{ json: Object.assign({}, $json, { intent: "CREATE_EVENT", confidence: "high", classified_by: "PRE_CLASSIFIER", skip_ai: true }) }];',
  '    }',
  '}',
  '',
  '// 4. PAYMENT keywords',
  'const PAYMENT_KEYWORDS = [',
  '    "pague","pagar","transferencia","deposite","ya pague",',
  '    "como pagar","metodo de pago","efectivo","tarjeta",',
  '    "factura","recibo","comprobante"',
  '];',
  'for (var j=0; j<PAYMENT_KEYWORDS.length; j++) {',
  '    if (message.includes(PAYMENT_KEYWORDS[j])) {',
  '        return [{ json: Object.assign({}, $json, { intent: "PAYMENT", confidence: "high", classified_by: "PRE_CLASSIFIER", skip_ai: true }) }];',
  '    }',
  '}',
  '',
  '// 5. HUMAN escalation keywords',
  'const HUMAN_KEYWORDS = [',
  '    "hablar con","persona real","humano","agente","operador",',
  '    "quiero hablar","necesito hablar","emergencia","urgencia",',
  '    "dolor fuerte","sangra","mucho dolor","hinchazon","infeccion",',
  '    "queja","reclamo","problema grave"',
  '];',
  'for (var k=0; k<HUMAN_KEYWORDS.length; k++) {',
  '    if (message.includes(HUMAN_KEYWORDS[k])) {',
  '        return [{ json: Object.assign({}, $json, { intent: "HUMAN", confidence: "high", classified_by: "PRE_CLASSIFIER", skip_ai: true }) }];',
  '    }',
  '}',
  '',
  '// 6. Fallback → AI',
  'return [{ json: Object.assign({}, $json, { skip_ai: false }) }];'
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
  const node = wf.nodes.find(n => n.name === 'Pre-Clasificador Keywords');
  if (!node) { console.error('Node not found'); process.exit(1); }
  node.parameters.jsCode = newCode;
  const res = await apiPut('/api/v1/workflows/' + WF_ID, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings, staticData: wf.staticData
  });
  console.log('PUT:', res.status, res.status === 200 ? 'OK' : res.body.slice(0, 300));
}

run().catch(console.error);
