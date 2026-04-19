import { readFileSync } from 'fs';

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const BASE = 'https://workflows.n8n.redsolucionesti.com';
const WF_ID = 'J5aUVLsnYNNZw9Rq';

const wf = JSON.parse(readFileSync('C:/Users/Barbara/Documents/n8n_workflow_claudio/saas/meta_wf_live.json', 'utf8'));

// Replace the single "Any" webhook with two webhooks: GET (verify) + POST (leads)
// Remove old webhook node and add two new ones

wf.nodes = wf.nodes.filter(n => n.name !== 'Meta Webhook');

// GET webhook — verification only
wf.nodes.unshift({
  id: "meta-wh-get",
  name: "Meta Webhook GET",
  type: "n8n-nodes-base.webhook",
  typeVersion: 1,
  position: [200, 260],
  parameters: {
    httpMethod: "GET",
    path: "meta-leads",
    responseMode: "responseNode"
  },
  webhookId: "sofia-meta-leads-get"
});

// POST webhook — new lead notification
wf.nodes.unshift({
  id: "meta-wh-post",
  name: "Meta Webhook POST",
  type: "n8n-nodes-base.webhook",
  typeVersion: 1,
  position: [200, 540],
  parameters: {
    httpMethod: "POST",
    path: "meta-leads",
    responseMode: "responseNode"
  },
  webhookId: "sofia-meta-leads-post"
});

// Fix Rutear Request — only handles GET verification now (simple)
const rutear = wf.nodes.find(n => n.name === 'Rutear Request');
rutear.parameters.jsCode = `var item = $input.first().json;
var query = item.query || item;
var challenge = query['hub.challenge'] || query['hub_challenge'] || '';
var token = query['hub.verify_token'] || query['hub_verify_token'] || '';
return [{ json: {
  challenge: challenge,
  valid: (token === 'sofia2026')
}}];`;

// For POST flow: parse the body directly
const parsearLead = wf.nodes.find(n => n.name === 'Parsear Lead');
// Add a node to extract leadgen_id from POST body
wf.nodes.push({
  id: "meta-extract-id",
  name: "Extraer Leadgen ID",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [420, 540],
  parameters: {
    jsCode: `var item = $input.first().json;
var body = item.body || item;
var entry = body.entry && body.entry[0];
var chg = entry && entry.changes && entry.changes[0];
var leadgen_id = chg && chg.value && chg.value.leadgen_id ? String(chg.value.leadgen_id) : null;
return [{ json: { leadgen_id: leadgen_id } }];`
  }
});

// Fix Obtener Lead Meta to use input
const obtener = wf.nodes.find(n => n.name === 'Obtener Lead Meta');
obtener.position = [640, 540];
obtener.parameters.url = '=https://graph.facebook.com/v19.0/{{ $json.leadgen_id }}';

// Reposition remaining nodes
const nodePositions = {
  'Parsear Lead':        [860,  540],
  'Guardar en Airtable': [1080, 540],
  'SMS Inmediato Twilio':[1300, 540],
  'Responder OK':        [1520, 540],
  'Responder Verificacion': [640, 260],
  'Es Verificacion':     [420, 260],
  'Rutear Request':      [200, 260]  // reuse for GET flow
};
wf.nodes.forEach(n => {
  if (nodePositions[n.name]) n.position = nodePositions[n.name];
});

// Reposition Rutear Request under GET webhook
const rutearNode = wf.nodes.find(n => n.name === 'Rutear Request');
if (rutearNode) rutearNode.position = [420, 260];

// Remove Es Verificacion — no longer needed (GET always = verify)
wf.nodes = wf.nodes.filter(n => n.name !== 'Es Verificacion');

// Rebuild connections
wf.connections = {
  "Meta Webhook GET": {
    main: [[{ node: "Rutear Request", type: "main", index: 0 }]]
  },
  "Rutear Request": {
    main: [[{ node: "Responder Verificacion", type: "main", index: 0 }]]
  },
  "Meta Webhook POST": {
    main: [[{ node: "Extraer Leadgen ID", type: "main", index: 0 }]]
  },
  "Extraer Leadgen ID": {
    main: [[{ node: "Obtener Lead Meta", type: "main", index: 0 }]]
  },
  "Obtener Lead Meta": {
    main: [[{ node: "Parsear Lead", type: "main", index: 0 }]]
  },
  "Parsear Lead": {
    main: [[{ node: "Guardar en Airtable", type: "main", index: 0 }]]
  },
  "Guardar en Airtable": {
    main: [[{ node: "SMS Inmediato Twilio", type: "main", index: 0 }]]
  },
  "SMS Inmediato Twilio": {
    main: [[{ node: "Responder OK", type: "main", index: 0 }]]
  }
};

// Deactivate first
await fetch(`${BASE}/api/v1/workflows/${WF_ID}/deactivate`, {
  method: 'POST', headers: { 'X-N8N-API-KEY': API_KEY }
});

const r = await fetch(`${BASE}/api/v1/workflows/${WF_ID}`, {
  method: 'PUT',
  headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings, staticData: null })
});
const result = await r.json();
if (!r.ok) { console.error('PUT failed:', JSON.stringify(result)); process.exit(1); }
console.log('✅ Workflow updated:', result.id);

// Reactivate
await fetch(`${BASE}/api/v1/workflows/${WF_ID}/activate`, {
  method: 'POST', headers: { 'X-N8N-API-KEY': API_KEY }
});
console.log('✅ Reactivated');

// Test GET verification
const test = await fetch('https://workflows.n8n.redsolucionesti.com/webhook/meta-leads?hub.mode=subscribe&hub.challenge=TEST123&hub.verify_token=sofia2026');
const text = await test.text();
console.log('Test GET status:', test.status, '| body:', text);
