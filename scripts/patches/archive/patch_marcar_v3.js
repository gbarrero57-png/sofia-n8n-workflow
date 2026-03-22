const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('c:/Users/Barbara/Documents/n8n_workflow_claudio/saas/sofia_fresh6.json', 'utf8'));

const CHATWOOT_TOKEN = 'yypAwZDH2dV3crfbqJqWCgj1';
const CHATWOOT_BASE = 'https://chat.redsolucionesti.com/api/v1/accounts';

// Fix "Marcar Esperando Confirmación": return clean object (no raw_payload) to avoid json validation error
const marcarCode = `// MARCAR ESPERANDO CONFIRMACION
// Gets context from Formatear Oferta de Slots (has account_id, conversation_id, selected_slots)
// 1. Sets awaiting_slot label on Chatwoot conversation
// 2. Stores offered_slots as private note for slot confirmation retrieval
const ctx = $node["Formatear Oferta de Slots"].json;
const account_id = ctx.account_id;
const conversation_id = ctx.conversation_id;
const token = '${CHATWOOT_TOKEN}';
const baseUrl = '${CHATWOOT_BASE}/' + account_id;
const headers = { 'api_access_token': token, 'Content-Type': 'application/json' };

// Step 1: Set awaiting_slot label
try {
  await this.helpers.httpRequest({
    method: 'POST',
    url: baseUrl + '/conversations/' + conversation_id + '/labels',
    headers: headers,
    body: { labels: ['awaiting_slot'] }
  });
  console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'LABEL_SET', conversation_id }));
} catch(e) {
  console.error(JSON.stringify({ ts: new Date().toISOString(), event: 'LABEL_ERROR', error: e.message }));
}

// Step 2: Store slot data as private note for retrieval when patient picks
const slots = ctx.selected_slots || [];
if (slots.length > 0) {
  try {
    const noteContent = 'SOFIA_SLOTS:' + JSON.stringify(slots);
    await this.helpers.httpRequest({
      method: 'POST',
      url: baseUrl + '/conversations/' + conversation_id + '/messages',
      headers: headers,
      body: { content: noteContent, message_type: 'outgoing', private: true }
    });
    console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'SLOTS_STORED', count: slots.length }));
  } catch(e) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), event: 'SLOTS_STORE_ERROR', error: e.message }));
  }
}

// Return clean object (no raw_payload which may contain nested 'json' keys that fail n8n validation)
return [{
  json: {
    message_text: ctx.message_text,
    conversation_id: ctx.conversation_id,
    inbox_id: ctx.inbox_id,
    inbox_id_api: ctx.inbox_id_api,
    inbox_id_db: ctx.inbox_id_db,
    clinic_id: ctx.clinic_id,
    contact_phone: ctx.contact_phone,
    contact_id: ctx.contact_id,
    account_id: ctx.account_id,
    message_type: ctx.message_type,
    message_timestamp: ctx.message_timestamp,
    bot_interaction_count: ctx.bot_interaction_count,
    sender_name: ctx.sender_name,
    sender_email: ctx.sender_email,
    conversation_status: ctx.conversation_status,
    has_contact_inbox: ctx.has_contact_inbox,
    channel_type: ctx.channel_type,
    intent: ctx.intent,
    confidence: ctx.confidence,
    selected_slots: ctx.selected_slots || [],
    label_set: true,
    slots_stored: slots.length > 0
  }
}];`;

const marcarIdx = wf.nodes.findIndex(n => n.name === 'Marcar Esperando Confirmación');
wf.nodes[marcarIdx].type = 'n8n-nodes-base.code';
wf.nodes[marcarIdx].typeVersion = 2;
wf.nodes[marcarIdx].parameters = { jsCode: marcarCode };  // no mode = default runOnceForEachItem
console.log('Marcar v3: clean return without raw_payload ✅');

const putBody = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings, staticData: wf.staticData };
fs.writeFileSync('c:/Users/Barbara/Documents/n8n_workflow_claudio/saas/sofia_put_marcar_v3.json', JSON.stringify(putBody));
console.log('PUT body saved.');
