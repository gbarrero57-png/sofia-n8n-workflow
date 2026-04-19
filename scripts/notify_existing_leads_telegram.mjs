/**
 * notify_existing_leads_telegram.mjs
 * Creates a one-shot n8n workflow that sends Telegram notifications
 * for all 15 existing Meta Ads leads.
 * Each message includes: name, phone, email, WhatsApp link with predefined
 * welcome message + call to schedule a 10-min demo.
 *
 * Run: node scripts/notify_existing_leads_telegram.mjs
 */

const API_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const BASE     = 'https://workflows.n8n.redsolucionesti.com';
const CHAT_ID  = '-4523041658';

const leads = [
  { nombre: 'Marvin Charles Cangalaya Barzola', telefono: '', email: 'marvincharles_2@hotmail.com',     citas: 'menos_de_20' },
  { nombre: 'José Santos',                      telefono: '', email: 'jsgen06@gmail.com',               citas: 'menos_de_20' },
  { nombre: 'Daniel Alca',                      telefono: '', email: 'danielalca80@hotmail.com',        citas: 'menos_de_20' },
  { nombre: 'Pedro',                            telefono: '', email: 'pedromartinezf34@gmail.com',      citas: 'más_de_50'   },
  { nombre: 'Luis Enrique',                     telefono: '', email: 'luisdiaque0510@gmail.com',        citas: 'más_de_50'   },
  { nombre: 'Óscar Becerra',                    telefono: '', email: 'carrascoandres402@gmail.com',     citas: 'entre_20_y_50' },
  { nombre: 'Alex',                             telefono: '', email: 'dr.alexander.alvarez@gmail.com',  citas: 'menos_de_20' },
  { nombre: 'Arnaldo Alvarez',                  telefono: '', email: 'alvarezarnaldo84@gmail.com',      citas: 'menos_de_20' },
  { nombre: 'Maria Rios',                       telefono: '', email: 'mjmayu@yahoo.com',                citas: 'menos_de_20' },
  { nombre: 'Lucero Cabana',                    telefono: '', email: 'Cabanalucero175@gmail.com',       citas: 'más_de_50'   },
  { nombre: 'Enrique',                          telefono: '', email: 'enriver18@gmail.com',             citas: 'entre_20_y_50' },
  { nombre: 'Luis Alberto Saavedra Santi',      telefono: '', email: 'Fisiomanosperusac@gmail.com',     citas: 'entre_20_y_50' },
  { nombre: 'Héctor Meléndez',                  telefono: '', email: 'hector.melendez1999@gmail.com',   citas: 'entre_20_y_50' },
  { nombre: 'Milagros Vega',                    telefono: '', email: 'milagros.vega@upch.pe',           citas: 'menos_de_20' },
  { nombre: 'Gabriel Barrero',                  telefono: '', email: 'gaboalejandro57@gmail.com',       citas: 'entre_20_y_50' },
];

// ── Citas label helper ────────────────────────────────────────────────────
const citasLabel = {
  'menos_de_20':   '🟢 <20 citas/sem',
  'entre_20_y_50': '🔵 20-50 citas/sem',
  'más_de_50':     '🟣 >50 citas/sem',
};

// ── Build Telegram message per lead ──────────────────────────────────────
function buildMessage(lead) {
  const firstName = (lead.nombre || '').split(' ')[0];
  const citas     = citasLabel[lead.citas] || lead.citas;

  // Predefined WA message (text= parameter)
  const waMsg = encodeURIComponent(
    'Hola ' + firstName + ', soy Gabriel de RedSoluciones TI \uD83D\uDC4B' +
    ' Vi que completaste nuestro formulario sobre SofIA AI para cl\u00EDnicas dentales.' +
    ' \u00BFTienes 10 min esta semana para una demo gratis? \uD83E\uDDB7'
  );

  // WhatsApp link: to lead's phone if available, else to Gabriel's (for outbound)
  const phone = (lead.telefono || '').replace(/\D/g, '');
  const waLink = phone
    ? 'https://wa.me/' + phone + '?text=' + waMsg
    : 'https://wa.me/51905858566?text=' + encodeURIComponent('Hola, tenemos un lead de Meta Ads: ' + lead.nombre + ' — ' + lead.email);

  return (
    '\uD83C\uDFAF *Lead Existente — Meta Ads*\n\n' +
    '\uD83D\uDC64 *' + lead.nombre + '*\n' +
    (phone ? '\uD83D\uDCF1 `+' + phone + '`\n' : '') +
    '\uD83D\uDCE7 ' + lead.email + '\n' +
    '\uD83D\uDCC5 ' + citas + '\n\n' +
    '\uD83D\uDCF2 *Escribirle:*\n' + waLink
  );
}

// ── Summarize all leads code (for Code node) ─────────────────────────────
const allLeadsData = JSON.stringify(leads.map(l => ({ json: l })));

// ── Build one-shot workflow JSON ──────────────────────────────────────────
const wf = {
  name: 'SofIA - Notificar 15 Leads Meta Telegram',
  nodes: [
    // 1. Manual trigger
    {
      id: 'manual', name: 'Ejecutar Ahora',
      type: 'n8n-nodes-base.manualTrigger', typeVersion: 1,
      position: [0, 300], parameters: {}
    },
    // 2. Leads data
    {
      id: 'leads_data', name: 'Leads Existentes',
      type: 'n8n-nodes-base.code', typeVersion: 2,
      position: [220, 300],
      parameters: {
        jsCode: 'return ' + allLeadsData + ';'
      }
    },
    // 3. Telegram notification per lead
    {
      id: 'telegram_lead', name: 'Notificar Telegram Lead',
      type: 'n8n-nodes-base.telegram', typeVersion: 1,
      position: [440, 300],
      parameters: {
        chatId:  CHAT_ID,
        text:    '={{ ' + buildTelegramExpression() + ' }}',
        additionalFields: { parse_mode: 'Markdown', disable_web_page_preview: true }
      },
      credentials: { telegramApi: { id: 'cSaxAEvIePNLpINc', name: 'Telegram account' } }
    },
    // 4. Aggregate
    {
      id: 'aggregate', name: 'Resumen Final',
      type: 'n8n-nodes-base.code', typeVersion: 2,
      position: [660, 300],
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode: [
          'const items = $input.all();',
          'const total = items.length;',
          'return [{ json: { total, mensaje: total + " notificaciones enviadas a Telegram" } }];'
        ].join('\n')
      }
    },
    // 5. Telegram summary
    {
      id: 'telegram_summary', name: 'Resumen Telegram',
      type: 'n8n-nodes-base.telegram', typeVersion: 1,
      position: [880, 300],
      parameters: {
        chatId: CHAT_ID,
        text: '=✅ *Leads Meta Ads — Notificación Completa*\n\n📊 {{ $json.total }} leads enviados\n\n_Estos son los leads actuales que tienes en tu pipeline. Cada notificación incluye su WhatsApp con mensaje predefinido listo para enviar._',
        additionalFields: { parse_mode: 'Markdown' }
      },
      credentials: { telegramApi: { id: 'cSaxAEvIePNLpINc', name: 'Telegram account' } }
    },
    // 6. Deactivate self
    {
      id: 'deactivate', name: 'Desactivar Workflow',
      type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
      position: [1100, 300],
      parameters: {
        method: 'POST',
        url: '=https://workflows.n8n.redsolucionesti.com/api/v1/workflows/{{ $workflow.id }}/deactivate',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        options: {}
      },
      credentials: { httpHeaderAuth: { id: 'n8n-api-key', name: 'N8N API Key' } }
    }
  ],
  connections: {
    'Ejecutar Ahora':           { main: [[{ node: 'Leads Existentes', type: 'main', index: 0 }]] },
    'Leads Existentes':         { main: [[{ node: 'Notificar Telegram Lead', type: 'main', index: 0 }]] },
    'Notificar Telegram Lead':  { main: [[{ node: 'Resumen Final', type: 'main', index: 0 }]] },
    'Resumen Final':            { main: [[{ node: 'Resumen Telegram', type: 'main', index: 0 }]] },
    'Resumen Telegram':         { main: [[{ node: 'Desactivar Workflow', type: 'main', index: 0 }]] }
  },
  settings: { executionOrder: 'v1' }
};

function buildTelegramExpression() {
  const WA_SUFFIX = encodeURIComponent(
    ', soy Gabriel de RedSoluciones TI \uD83D\uDC4B' +
    ' Vi tu formulario sobre SofIA AI para cl\u00EDnicas dentales.' +
    ' \u00BFTienes 10 min esta semana para una demo gratis? \uD83E\uDDB7'
  );
  const citasMap = JSON.stringify(citasLabel).replace(/"/g, "'");

  return [
    "function() {",
    "  var firstName = ($json.nombre || '').split(' ')[0];",
    "  var phone = ($json.telefono || '').replace(/\\D/g,'');",
    "  var c = " + citasMap + ";",
    "  var cLabel = c[$json.citas] || $json.citas || '';",
    "  var waMsg = encodeURIComponent('Hola ' + firstName + '" + WA_SUFFIX + "');",
    "  var waLink = phone",
    "    ? 'https://wa.me/' + phone + '?text=' + waMsg",
    "    : 'https://wa.me/51905858566?text=' + encodeURIComponent('Lead Meta: ' + $json.nombre + ' — ' + $json.email);",
    "  return '\\uD83C\\uDFAF *Lead Meta Ads*\\n\\n' +",
    "    '\\uD83D\\uDC64 *' + $json.nombre + '*\\n' +",
    "    (phone ? '\\uD83D\\uDCF1 +' + phone + '\\n' : '') +",
    "    '\\uD83D\\uDCE7 ' + $json.email + '\\n' +",
    "    '\\uD83D\\uDCC5 ' + cLabel + '\\n\\n' +",
    "    '\\uD83D\\uDCF2 *Escribirle ahora:*\\n' + waLink;",
    "}()"
  ].join(' ');
}

// ── Create workflow ───────────────────────────────────────────────────────
const r = await fetch(`${BASE}/api/v1/workflows`, {
  method: 'POST',
  headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify(wf)
});
const d = await r.json();
if (!d.id) { console.error('❌ Create failed:', JSON.stringify(d)); process.exit(1); }
console.log('✅ Workflow creado:', d.id, '—', d.name);
console.log('');
console.log('📋 Para ejecutar:');
console.log('   1. Ve a: https://workflows.n8n.redsolucionesti.com');
console.log('   2. Abre el workflow "SofIA - Notificar 15 Leads Meta Telegram"');
console.log('   3. Haz clic en "Test workflow" o actívalo y ejecuta manualmente');
console.log('');
console.log('   O ejecútalo vía API:');
console.log('   node -e "fetch(\'https://workflows.n8n.redsolucionesti.com/api/v1/workflows/' + d.id + '/execute\', { method: \'POST\', headers: { \'X-N8N-API-KEY\': \'' + API_KEY + '\', \'Content-Type\': \'application/json\' }, body: \'{}\'}).then(r=>r.json()).then(console.log)"');
