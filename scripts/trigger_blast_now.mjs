/**
 * trigger_blast_now.mjs
 * 1. Añade webhook al workflow inicial y lo dispara ahora
 * 2. Actualiza follow-up CRON a 5pm Lima (22:00 UTC)
 */

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const BASE    = 'https://workflows.n8n.redsolucionesti.com';
const WF_INICIAL  = 'WBzLRqtmEpMKH4Ql';
const WF_FOLLOWUP = 'XE9ibSiA7LhzH9kR';

async function getWf(id) {
  const r = await fetch(`${BASE}/api/v1/workflows/${id}`, { headers: { 'X-N8N-API-KEY': API_KEY } });
  return r.json();
}
async function deactivate(id) {
  await fetch(`${BASE}/api/v1/workflows/${id}/deactivate`, { method: 'POST', headers: { 'X-N8N-API-KEY': API_KEY } });
}
async function activate(id) {
  await fetch(`${BASE}/api/v1/workflows/${id}/activate`, { method: 'POST', headers: { 'X-N8N-API-KEY': API_KEY } });
}
async function putWf(id, body) {
  const r = await fetch(`${BASE}/api/v1/workflows/${id}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PUT ${id}: ${await r.text()}`);
  return r.json();
}

// ── 1. Add webhook to Email Inicial and trigger it ────────────────────────
const wf1 = await getWf(WF_INICIAL);

// Add webhook node if not already there
const hasWebhook = wf1.nodes.some(n => n.id === 'blast-trigger');
if (!hasWebhook) {
  wf1.nodes.push({
    id: 'blast-trigger', name: 'Trigger Manual Blast',
    type: 'n8n-nodes-base.webhook', typeVersion: 1,
    position: [-300, 300],
    parameters: { path: 'blast-inicial-ahora', responseMode: 'onReceived', httpMethod: 'GET' },
    webhookId: 'blast-inicial-ahora-uuid',
  });
  wf1.connections['Trigger Manual Blast'] = { main: [[{ node: 'Fetch Leads', type: 'main', index: 0 }]] };
}

await deactivate(WF_INICIAL);
await putWf(WF_INICIAL, { name: wf1.name, nodes: wf1.nodes, connections: wf1.connections, settings: wf1.settings });
await activate(WF_INICIAL);
console.log('✅ Webhook añadido al Email Inicial — esperando 3s para que se registre...');
await new Promise(r => setTimeout(r, 3000));

// Trigger the webhook
const triggerRes = await fetch(`${BASE}/webhook/blast-inicial-ahora`);
console.log('🚀 Blast disparado — status HTTP:', triggerRes.status);
if (triggerRes.status === 200) {
  console.log('   El workflow está corriendo. ~170 emails enviándose...');
  console.log('   Recibirás notificación en Telegram cuando termine.');
} else {
  const body = await triggerRes.text();
  console.log('   Respuesta:', body.slice(0, 200));
}

// ── 2. Update follow-up CRON to 5pm Lima (22:00 UTC) ─────────────────────
const wf2 = await getWf(WF_FOLLOWUP);

for (const n of wf2.nodes) {
  if (n.type === 'n8n-nodes-base.scheduleTrigger') {
    n.parameters.rule.interval[0].expression = '0 22 * * *';
    console.log('\n⏰ Follow-up CRON actualizado: 5pm Lima (22:00 UTC)');
  }
}

await deactivate(WF_FOLLOWUP);
await putWf(WF_FOLLOWUP, { name: wf2.name, nodes: wf2.nodes, connections: wf2.connections, settings: wf2.settings });
await activate(WF_FOLLOWUP);
console.log('✅', wf2.name, '— activo a las 5pm Lima');

console.log('\n─────────────────────────────────────────');
console.log('Email Inicial   → corriendo AHORA');
console.log('Email Follow-up → 5pm Lima hoy');
console.log('─────────────────────────────────────────');
