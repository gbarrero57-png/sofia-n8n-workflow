const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const TELEGRAM_CRED = { id: 'cSaxAEvIePNLpINc', name: 'Telegram account' };
const TELEGRAM_CHAT = '-4523041658';
const AT_CRED = { id: 'YmCX94YiEOb7UtNi', name: 'Airtable Personal Access Token account' };
const AT_BASE = 'app6a4u9dvXMxwOnY';
const AT_TABLE = 'tblBuVcKITk5GFoqk';

function n8n(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const req = https.request({
      hostname: 'workflows.n8n.redsolucionesti.com', path, method,
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => resolve(JSON.parse(d))); });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const PARSEAR_CODE = [
  'var body = $input.first().json.body || $input.first().json;',
  'var from = body.From || body.from || "";',
  'var texto = body.Body || body.body || "";',
  '',
  '// Normalizar numero peruano',
  'var numLimpio = from.replace(/^\\+51/, "").replace(/[\\s\\-]/g, "");',
  '',
  '// Detectar STOP',
  'var isStop = /^(stop|baja|cancelar|no more|unsubscribe)$/i.test(texto.trim());',
  '',
  '// Detectar interes',
  'var isInterested = /^(si|s[íi]|yes|dale|ok|quiero|me interesa|demo|cuando|disponible|adelante|claro|perfecto|genial)/i.test(texto.trim());',
  '',
  'return [{ json: {',
  '  from_number: from,',
  '  num_limpio: numLimpio,',
  '  mensaje: texto,',
  '  is_stop: isStop,',
  '  is_interested: isInterested,',
  '  timestamp: new Date().toLocaleString("es-PE", { timeZone: "America/Lima" })',
  '}}];'
].join('\n');

const TELEGRAM_TEXT = [
  '={{ ',
  '"📱 *Respuesta SMS Outreach*\\n\\n" +',
  '"👤 *Número:* " + $json.from_number + "\\n" +',
  '"💬 *Mensaje:* " + $json.mensaje + "\\n" +',
  '"🕐 *Hora Lima:* " + $json.timestamp + "\\n\\n" +',
  '($json.is_stop ? "🚫 *STOP — quitar de lista*" : $json.is_interested ? "🔥 *INTERESADO — contactar ahora!*" : "ℹ️ Respuesta neutral")',
  '}}'
].join('');

const workflow = {
  name: 'SofIA - SMS Respuestas Outreach',
  nodes: [
    {
      id: 'n1', name: 'Twilio SMS Webhook',
      type: 'n8n-nodes-base.webhook', typeVersion: 1,
      position: [200, 300],
      webhookId: 'twilio-sms-reply',
      parameters: {
        path: 'twilio-sms-reply',
        httpMethod: 'POST',
        responseMode: 'onReceived',
        responseData: 'allEntries',
        options: {}
      }
    },
    {
      id: 'n2', name: 'Parsear Respuesta',
      type: 'n8n-nodes-base.code', typeVersion: 2,
      position: [420, 300],
      parameters: { jsCode: PARSEAR_CODE }
    },
    {
      id: 'n3', name: 'Notificar Telegram',
      type: 'n8n-nodes-base.telegram', typeVersion: 1.2,
      position: [640, 180],
      credentials: { telegramApi: TELEGRAM_CRED },
      parameters: {
        chatId: TELEGRAM_CHAT,
        text: TELEGRAM_TEXT,
        additionalFields: { parse_mode: 'Markdown' }
      }
    },
    {
      id: 'n4', name: 'Buscar Lead Airtable',
      type: 'n8n-nodes-base.airtable', typeVersion: 2,
      position: [640, 420],
      credentials: { airtableTokenApi: AT_CRED },
      parameters: {
        operation: 'list',
        base: { __rl: true, value: AT_BASE, mode: 'id' },
        table: { __rl: true, value: AT_TABLE, mode: 'id' },
        returnAll: false, limit: 1,
        options: { filterByFormula: "REGEX_REPLACE({telefono},\"[^0-9]\",\"\")=\"{{ $json.num_limpio }}\"" }
      }
    },
    {
      id: 'n5', name: 'Lead Encontrado?',
      type: 'n8n-nodes-base.if', typeVersion: 2,
      position: [860, 420],
      parameters: {
        conditions: {
          options: { caseSensitive: false, leftValue: '', typeValidation: 'loose' },
          conditions: [{ id: 'c1', leftValue: '={{ $json.id }}', rightValue: '', operator: { type: 'string', operation: 'notEmpty' } }],
          combinator: 'and'
        }
      }
    },
    {
      id: 'n6', name: 'Actualizar Status',
      type: 'n8n-nodes-base.airtable', typeVersion: 2,
      position: [1080, 320],
      credentials: { airtableTokenApi: AT_CRED },
      parameters: {
        operation: 'update',
        base: { __rl: true, value: AT_BASE, mode: 'id' },
        table: { __rl: true, value: AT_TABLE, mode: 'id' },
        id: '={{ $json.id }}',
        columns: {
          mappingMode: 'defineBelow',
          value: { status: '={{ $("Parsear Respuesta").item.json.is_stop ? "cerrado" : "respondio" }}' },
          matchingColumns: [], schema: []
        }
      }
    }
  ],
  connections: {
    'Twilio SMS Webhook':  { main: [[{ node: 'Parsear Respuesta', type: 'main', index: 0 }]] },
    'Parsear Respuesta':   { main: [[{ node: 'Notificar Telegram', type: 'main', index: 0 }, { node: 'Buscar Lead Airtable', type: 'main', index: 0 }]] },
    'Buscar Lead Airtable':{ main: [[{ node: 'Lead Encontrado?', type: 'main', index: 0 }]] },
    'Lead Encontrado?':    { main: [[{ node: 'Actualizar Status', type: 'main', index: 0 }], []] }
  },
  settings: { executionOrder: 'v1' }
};

async function main() {
  console.log('Creando workflow SMS Respuestas Outreach...');
  const r = await n8n('POST', '/api/v1/workflows', workflow);
  if (!r.id) { console.error('ERROR:', JSON.stringify(r).substring(0, 400)); return; }
  console.log('Creado ID:', r.id);

  const act = await n8n('POST', '/api/v1/workflows/' + r.id + '/activate');
  console.log('Activado:', act.id ? 'SI' : 'NO');

  console.log('\nWEBHOOK URL para configurar en Twilio:');
  console.log('https://workflows.n8n.redsolucionesti.com/webhook/twilio-sms-reply');
}
main().catch(console.error);
