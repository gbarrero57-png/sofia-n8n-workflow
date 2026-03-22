const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('c:/Users/Barbara/Documents/n8n_workflow_claudio/saas/sofia_fresh7.json', 'utf8'));

const CHATWOOT_TOKEN = 'yypAwZDH2dV3crfbqJqWCgj1';
const CHATWOOT_BASE = 'https://chat.redsolucionesti.com/api/v1/accounts';

// Fix: use $node["Lock de Slot"] for context (Crear Nota wiped $json)
const actualizarCode = `// ACTUALIZAR ATTRIBUTES EXITO
// Context: Crear Nota Éxito (httpRequest) wiped $json — restore from Lock de Slot
const ctx = $node["Lock de Slot"].json;
const account_id = ctx.account_id;
const conversation_id = ctx.conversation_id;
const token = '${CHATWOOT_TOKEN}';
const baseUrl = '${CHATWOOT_BASE}/' + account_id;
const headers = { 'api_access_token': token, 'Content-Type': 'application/json' };

// Step 1: Update custom_attributes
try {
  await this.helpers.httpRequest({
    method: 'PATCH',
    url: baseUrl + '/conversations/' + conversation_id,
    headers: headers,
    body: {
      custom_attributes: {
        sofia_phase: 'PHASE_4_COMPLETE',
        awaiting_slot_confirmation: 'false',
        appointment_confirmed: 'true',
        bot_interaction_count: ctx.bot_interaction_count || 0
      }
    }
  });
  console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'ATTRS_UPDATED', conversation_id }));
} catch(e) {
  console.error(JSON.stringify({ ts: new Date().toISOString(), event: 'ATTRS_UPDATE_ERROR', error: e.message }));
}

// Step 2: Remove awaiting_slot label
try {
  await this.helpers.httpRequest({
    method: 'POST',
    url: baseUrl + '/conversations/' + conversation_id + '/labels',
    headers: headers,
    body: { labels: [] }
  });
  console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'LABEL_CLEARED', conversation_id }));
} catch(e) {
  console.error(JSON.stringify({ ts: new Date().toISOString(), event: 'LABEL_CLEAR_ERROR', error: e.message }));
}

return [{
  json: {
    account_id: account_id,
    conversation_id: conversation_id,
    clinic_id: ctx.clinic_id,
    attrs_updated: true,
    label_cleared: true
  }
}];`;

const idx = wf.nodes.findIndex(n => n.name === 'Actualizar Attributes Éxito');
wf.nodes[idx].type = 'n8n-nodes-base.code';
wf.nodes[idx].typeVersion = 2;
wf.nodes[idx].parameters = { jsCode: actualizarCode };
console.log('Actualizar Attributes v2: uses Lock de Slot context ✅');

const putBody = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings, staticData: wf.staticData };
fs.writeFileSync('c:/Users/Barbara/Documents/n8n_workflow_claudio/saas/sofia_put_actualizar_v2.json', JSON.stringify(putBody));
console.log('PUT body saved.');
