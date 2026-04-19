/**
 * patch_lead_welcome_sid.mjs
 * Actualiza el ContentSid en el workflow de Meta leads una vez aprobado.
 *
 * Uso: node scripts/patch_lead_welcome_sid.mjs HXxxxxxxxxxxxxxxxxxx
 */

const SID = process.argv[2];
if (!SID || !SID.startsWith('HX')) {
  console.error('Uso: node scripts/patch_lead_welcome_sid.mjs HXxxxxxxxxxxxxxxxxxx');
  process.exit(1);
}

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const BASE = 'https://workflows.n8n.redsolucionesti.com';
const WF_ID = 'J5aUVLsnYNNZw9Rq';

const wf = await fetch(`${BASE}/api/v1/workflows/${WF_ID}`, {
  headers: { 'X-N8N-API-KEY': API_KEY }
}).then(r => r.json());

const waNode = wf.nodes.find(n => n.name === 'WhatsApp Bienvenida Lead');
if (!waNode) { console.error('No encontre nodo WhatsApp Bienvenida Lead'); process.exit(1); }

const contentSidParam = waNode.parameters.bodyParameters.parameters.find(p => p.name === 'ContentSid');
contentSidParam.value = SID;
console.log('ContentSid actualizado a:', SID);

const r = await fetch(`${BASE}/api/v1/workflows/${WF_ID}`, {
  method: 'PUT',
  headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings, staticData: null })
});
const d = await r.json();
console.log(r.ok ? '✅ Workflow actualizado — WhatsApp activo con template aprobado' : '❌ Error: ' + JSON.stringify(d).slice(0,200));
