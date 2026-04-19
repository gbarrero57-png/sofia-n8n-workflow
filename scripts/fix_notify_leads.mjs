/**
 * fix_notify_leads.mjs
 * Fixes Meta Ads leads Telegram notification.
 *  1. Deletes broken workflow GAjNvb4yOzTKfq6p (invalid IIFE expression)
 *  2. Creates a clean workflow: Code node returns pre-computed telegram_text,
 *     Telegram node uses simple ={{ $json.telegram_text }}
 *  3. Activates — fires within 1 min, then self-deactivates
 *
 * Run: node scripts/fix_notify_leads.mjs
 */

const API_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const BASE      = 'https://workflows.n8n.redsolucionesti.com';
const CHAT_ID   = '-4523041658';
const OLD_WF_ID = 'GAjNvb4yOzTKfq6p';

// ── Lead data ─────────────────────────────────────────────────────────────────
const leads = [
  { nombre: 'Marvin Charles Cangalaya Barzola', telefono: '', email: 'marvincharles_2@hotmail.com',    citas: 'menos_de_20'   },
  { nombre: 'José Santos',                      telefono: '', email: 'jsgen06@gmail.com',              citas: 'menos_de_20'   },
  { nombre: 'Daniel Alca',                      telefono: '', email: 'danielalca80@hotmail.com',       citas: 'menos_de_20'   },
  { nombre: 'Pedro',                            telefono: '', email: 'pedromartinezf34@gmail.com',     citas: 'más_de_50'     },
  { nombre: 'Luis Enrique',                     telefono: '', email: 'luisdiaque0510@gmail.com',       citas: 'más_de_50'     },
  { nombre: 'Óscar Becerra',                    telefono: '', email: 'carrascoandres402@gmail.com',    citas: 'entre_20_y_50' },
  { nombre: 'Alex',                             telefono: '', email: 'dr.alexander.alvarez@gmail.com', citas: 'menos_de_20'   },
  { nombre: 'Arnaldo Alvarez',                  telefono: '', email: 'alvarezarnaldo84@gmail.com',     citas: 'menos_de_20'   },
  { nombre: 'Maria Rios',                       telefono: '', email: 'mjmayu@yahoo.com',               citas: 'menos_de_20'   },
  { nombre: 'Lucero Cabana',                    telefono: '', email: 'Cabanalucero175@gmail.com',      citas: 'más_de_50'     },
  { nombre: 'Enrique',                          telefono: '', email: 'enriver18@gmail.com',            citas: 'entre_20_y_50' },
  { nombre: 'Luis Alberto Saavedra Santi',      telefono: '', email: 'Fisiomanosperusac@gmail.com',    citas: 'entre_20_y_50' },
  { nombre: 'Héctor Meléndez',                  telefono: '', email: 'hector.melendez1999@gmail.com',  citas: 'entre_20_y_50' },
  { nombre: 'Milagros Vega',                    telefono: '', email: 'milagros.vega@upch.pe',          citas: 'menos_de_20'   },
  { nombre: 'Gabriel Barrero',                  telefono: '', email: 'gaboalejandro57@gmail.com',      citas: 'entre_20_y_50' },
];

// ── Pre-compute telegram text in Node.js (avoids any n8n expression complexity) ──
const WA_SUFFIX = encodeURIComponent(
  ', soy Gabriel de RedSoluciones TI \uD83D\uDC4B' +
  ' Vi que completaste nuestro formulario sobre SofIA AI para cl\u00EDnicas dentales.' +
  ' \u00BFTienes 10 min esta semana para una demo gratis? \uD83E\uDDB7'
);

const citasLabel = {
  'menos_de_20':   '\uD83D\uDFE2 <20 citas/sem',
  'entre_20_y_50': '\uD83D\uDD35 20-50 citas/sem',
  'm\u00E1s_de_50': '\uD83D\uDFE3 >50 citas/sem',
};

function buildLeadText(lead) {
  const firstName = (lead.nombre || '').split(' ')[0];
  const phone     = (lead.telefono || '').replace(/\D/g, '');
  const waLink    = phone
    ? 'https://wa.me/' + phone + '?text=Hola+' + encodeURIComponent(firstName) + WA_SUFFIX
    : 'https://wa.me/51905858566?text=' + encodeURIComponent('Lead Meta: ' + lead.nombre + ' \u2014 ' + lead.email);
  const cLabel = citasLabel[lead.citas] || lead.citas || '';

  return '\uD83C\uDFAF *Lead Existente \u2014 Meta Ads*\n\n' +
    '\uD83D\uDC64 *' + lead.nombre + '*\n' +
    (phone ? '\uD83D\uDCF1 +' + phone + '\n' : '') +
    '\uD83D\uDCE7 ' + lead.email + '\n' +
    '\uD83D\uDCC5 ' + cLabel + '\n\n' +
    '\uD83D\uDCF2 *Escribirle:*\n' + waLink;
}

// Embed as static JSON — the Code node just returns this literal array
const leadsItems = leads.map(lead => ({
  json: { telegram_text: buildLeadText(lead), nombre: lead.nombre }
}));
const CODE_LEADS = 'return ' + JSON.stringify(leadsItems) + ';';

// Self-deactivation (runs once after all 15 Telegram messages sent)
const CODE_DEACTIVATE = [
  'const items = $input.all();',
  'try {',
  '  await this.helpers.httpRequest({',
  "    method: 'POST',",
  "    url: 'https://workflows.n8n.redsolucionesti.com/api/v1/workflows/' + $workflow.id + '/deactivate',",
  "    headers: { 'X-N8N-API-KEY': '" + API_KEY + "' },",
  '    json: true',
  '  });',
  "  console.log('Auto-deactivated after ' + items.length + ' notifications sent');",
  '} catch(e) {',
  "  console.warn('Deactivate failed:', e.message);",
  '}',
  "return [{ json: { total_sent: items.length, done: true } }];"
].join('\n');

// ── Delete broken old workflow ────────────────────────────────────────────────
console.log('Deleting broken workflow', OLD_WF_ID, '...');
const delResp = await fetch(`${BASE}/api/v1/workflows/${OLD_WF_ID}`, {
  method: 'DELETE',
  headers: { 'X-N8N-API-KEY': API_KEY }
});
console.log(delResp.ok || delResp.status === 404
  ? '✅ Old workflow deleted (or not found)'
  : '⚠️  Delete returned ' + delResp.status);

// ── Build new workflow ────────────────────────────────────────────────────────
const wf = {
  name: 'SofIA - Notificar 15 Leads Meta Telegram',
  nodes: [
    {
      id: 'trigger', name: 'Cada Minuto',
      type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1,
      position: [0, 300],
      parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } }
    },
    {
      id: 'leads', name: 'Leads Existentes',
      type: 'n8n-nodes-base.code', typeVersion: 2,
      position: [220, 300],
      parameters: { jsCode: CODE_LEADS }
    },
    {
      id: 'telegram', name: 'Notificar Telegram Lead',
      type: 'n8n-nodes-base.telegram', typeVersion: 1,
      position: [440, 300],
      parameters: {
        chatId: CHAT_ID,
        text: '={{ $json.telegram_text }}',
        additionalFields: { parse_mode: 'Markdown', disable_web_page_preview: true }
      },
      credentials: { telegramApi: { id: 'cSaxAEvIePNLpINc', name: 'Telegram account' } }
    },
    {
      id: 'deactivate', name: 'Auto Desactivar',
      type: 'n8n-nodes-base.code', typeVersion: 2,
      position: [660, 300],
      parameters: { mode: 'runOnceForAllItems', jsCode: CODE_DEACTIVATE }
    }
  ],
  connections: {
    'Cada Minuto':         { main: [[{ node: 'Leads Existentes',      type: 'main', index: 0 }]] },
    'Leads Existentes':    { main: [[{ node: 'Notificar Telegram Lead', type: 'main', index: 0 }]] },
    'Notificar Telegram Lead': { main: [[{ node: 'Auto Desactivar',   type: 'main', index: 0 }]] }
  },
  settings: { executionOrder: 'v1' }
};

// ── Create ────────────────────────────────────────────────────────────────────
const r1 = await fetch(`${BASE}/api/v1/workflows`, {
  method: 'POST',
  headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify(wf)
});
const d1 = await r1.json();
if (!d1.id) { console.error('❌ Create failed:', JSON.stringify(d1).slice(0, 300)); process.exit(1); }
console.log('✅ Workflow creado:', d1.id, '—', d1.name);

// ── Activate ──────────────────────────────────────────────────────────────────
const r2 = await fetch(`${BASE}/api/v1/workflows/${d1.id}/activate`, {
  method: 'POST',
  headers: { 'X-N8N-API-KEY': API_KEY }
});
const d2 = await r2.json();
console.log(r2.ok ? '✅ Activado — enviará 15 leads a Telegram en < 1 min, luego se auto-desactiva' : '❌ Activate error: ' + JSON.stringify(d2).slice(0, 200));
console.log('   Workflow ID:', d1.id);
