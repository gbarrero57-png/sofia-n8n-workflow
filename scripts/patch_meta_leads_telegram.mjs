/**
 * patch_meta_leads_telegram.mjs
 * Adds Telegram notification to SofIA - Meta Leads Capture workflow.
 * New node inserted between "Parsear Lead" and "Guardar en Airtable" so
 * Gabriel gets notified immediately for EVERY new Meta Ads lead with:
 *   - Name, phone, email
 *   - WhatsApp link to contact the lead with a predefined welcome message
 *   - CTA to schedule a 10-min demo
 *
 * Run: node scripts/patch_meta_leads_telegram.mjs
 */

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const BASE   = 'https://workflows.n8n.redsolucionesti.com';
const WF_ID  = 'J5aUVLsnYNNZw9Rq';
const CHAT_ID = '-4523041658';

// ── WhatsApp predefined message (URL-encoded, static part) ─────────────────
// Full message: "Hola [nombre], soy Gabriel de RedSoluciones TI 👋
//  Vi que completaste nuestro formulario sobre SofIA AI para clínicas dentales.
//  ¿Tienes 10 minutos esta semana para una demo gratis? 🦷"
const WA_SUFFIX = encodeURIComponent(
  ', soy Gabriel de RedSoluciones TI \uD83D\uDC4B' +
  ' Vi que completaste nuestro formulario sobre SofIA AI para cl\u00EDnicas dentales.' +
  ' \u00BFTienes 10 min esta semana para una demo gratis? \uD83E\uDDB7'
);
// Full URL template: wa.me/PHONE?text=Hola+FIRSTNAME+SUFFIX
// Built dynamically in n8n expression below

// ── Telegram message text (n8n expression) ────────────────────────────────
// Note: \n in JS string → \\n in JSON → \n in n8n expression (newline ✓)
//       \D in JS string → \\D in JSON → \D in regex ✓
const TELEGRAM_TEXT =
  "={{ " +
  "'🎯 *Nuevo Lead — Meta Ads*\\n\\n' +" +
  "'👤 *' + $json.nombre + '*\\n' +" +
  "'📱 `' + $json.telefono + '`\\n' +" +
  "'📧 ' + ($json.email || '—') + '\\n\\n' +" +
  "'📲 *Escribirle ahora:*\\n' +" +
  "'https://wa.me/' + $json.telefono.replace(/\\D/g,'') + '?text=Hola+' + encodeURIComponent(($json.nombre||'').split(' ')[0]) + '" + WA_SUFFIX + "' +" +
  "'\\n\\n⏱️ _Responder en < 5 min × 9 conversión_' " +
  "}}";

// ── Fetch workflow ──────────────────────────────────────────────────────────
const wf = await fetch(`${BASE}/api/v1/workflows/${WF_ID}`, {
  headers: { 'X-N8N-API-KEY': API_KEY }
}).then(r => r.json());

// Guard: skip if already patched
if (wf.nodes.some(n => n.name === 'Notificar Lead Telegram')) {
  console.log('ℹ️  Already patched — Notificar Lead Telegram node exists');
  process.exit(0);
}

// ── New Telegram node ─────────────────────────────────────────────────────
const telegramNode = {
  id:          'notificar_lead_telegram',
  name:        'Notificar Lead Telegram',
  type:        'n8n-nodes-base.telegram',
  typeVersion: 1,
  position:    [1080, 660],
  parameters: {
    chatId:           CHAT_ID,
    text:             TELEGRAM_TEXT,
    additionalFields: { parse_mode: 'Markdown', disable_web_page_preview: true }
  },
  credentials: { telegramApi: { id: 'cSaxAEvIePNLpINc', name: 'Telegram account' } }
};

wf.nodes.push(telegramNode);

// ── Rewire connections ────────────────────────────────────────────────────
// Before: Parsear Lead → Guardar en Airtable
// After:  Parsear Lead → Notificar Lead Telegram → Guardar en Airtable
wf.connections['Parsear Lead'] = {
  main: [[{ node: 'Notificar Lead Telegram', type: 'main', index: 0 }]]
};
wf.connections['Notificar Lead Telegram'] = {
  main: [[{ node: 'Guardar en Airtable', type: 'main', index: 0 }]]
};

// ── PUT workflow ──────────────────────────────────────────────────────────
const r = await fetch(`${BASE}/api/v1/workflows/${WF_ID}`, {
  method: 'PUT',
  headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings, staticData: null
  })
});
const d = await r.json();
console.log(r.ok
  ? '✅ Meta Leads Capture actualizado — Telegram notification activa para nuevos leads'
  : '❌ Error: ' + JSON.stringify(d).slice(0, 300));
