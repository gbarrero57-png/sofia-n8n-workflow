/**
 * patch_twilio_fallback.mjs
 * Adds master Twilio credentials fallback to Enviar Menu Chatwoot node.
 * New clinics don't need twilio_auth_token in bot_config.
 * Run after every Twilio token rotation.
 */

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const BASE = 'https://workflows.n8n.redsolucionesti.com';
const WF_ID = '37SLdWISQLgkHeXk';

// ── MASTER TWILIO CREDENTIALS (update here when token rotates) ────────────
const MASTER_SID   = 'AC4080780a4b4a7d8e7b107a39f01abad3';
const MASTER_TOKEN = '6504179bc74222d9da8c8125f20bcfdf';
// ─────────────────────────────────────────────────────────────────────────

const wf = await fetch(`${BASE}/api/v1/workflows/${WF_ID}`, {
  headers: { 'X-N8N-API-KEY': API_KEY }
}).then(r => r.json());

const node = wf.nodes.find(n => n.name === 'Enviar Menu Chatwoot');
if (!node) { console.error('Node not found'); process.exit(1); }

// Replace the two patterns where Twilio credentials are used:
// 1. "botConfig.twilio_account_sid + ":" + botConfig.twilio_auth_token"
// 2. "const accountSid = botConfig.twilio_account_sid" and "const authToken = botConfig.twilio_auth_token"

let code = node.parameters.jsCode;

// Add master credentials constants at the top of the function body
// (after the first opening line of actual logic)
const FALLBACK_HEADER = `// ── Master Twilio credentials (fallback for clinics without bot_config token) ──
const MASTER_TWILIO_SID   = "${MASTER_SID}";
const MASTER_TWILIO_TOKEN = "${MASTER_TOKEN}";
// ──────────────────────────────────────────────────────────────────────────────
`;

// Insert after first line that uses botConfig (before line 45 where basicAuth starts)
// Find the insertion point: just before the first twilio_account_sid usage
const insertBefore = `    const basicAuth = Buffer.from(botConfig.twilio_account_sid`;
code = code.replace(insertBefore, FALLBACK_HEADER + insertBefore);

// Replace the two basicAuth constructions to use fallback
code = code.replace(
  `const basicAuth = Buffer.from(botConfig.twilio_account_sid + ":" + botConfig.twilio_auth_token).toString("base64");`,
  `const basicAuth = Buffer.from((botConfig.twilio_account_sid || MASTER_TWILIO_SID) + ":" + (botConfig.twilio_auth_token || MASTER_TWILIO_TOKEN)).toString("base64");`
);

// Replace accountSid and authToken variable assignments
code = code.replace(
  `const accountSid = botConfig.twilio_account_sid;`,
  `const accountSid = botConfig.twilio_account_sid || MASTER_TWILIO_SID;`
);
code = code.replace(
  `const authToken  = botConfig.twilio_auth_token;`,
  `const authToken  = botConfig.twilio_auth_token  || MASTER_TWILIO_TOKEN;`
);

// Also fix the URL that uses botConfig.twilio_account_sid directly
code = code.replace(
  `url: "https://api.twilio.com/2010-04-01/Accounts/" + botConfig.twilio_account_sid + "/Messages.json",`,
  `url: "https://api.twilio.com/2010-04-01/Accounts/" + (botConfig.twilio_account_sid || MASTER_TWILIO_SID) + "/Messages.json",`
);

node.parameters.jsCode = code;

// Verify replacements happened
const checks = [
  'MASTER_TWILIO_SID',
  'MASTER_TWILIO_TOKEN',
  'botConfig.twilio_account_sid || MASTER_TWILIO_SID',
  'botConfig.twilio_auth_token || MASTER_TWILIO_TOKEN',
];
checks.forEach(c => {
  if (!code.includes(c)) console.warn('⚠️  Not found in code:', c);
});

const r = await fetch(`${BASE}/api/v1/workflows/${WF_ID}`, {
  method: 'PUT',
  headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings, staticData: null })
});
const d = await r.json();
console.log(r.ok ? '✅ Sofia workflow actualizado — Twilio fallback en su lugar' : '❌ Error: ' + JSON.stringify(d).slice(0, 200));
