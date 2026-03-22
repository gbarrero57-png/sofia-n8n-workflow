const fs = require('fs');

const wf = JSON.parse(fs.readFileSync('c:/Users/Barbara/Documents/n8n_workflow_claudio/saas/sofia_current_v3.json', 'utf8'));

// Re-fetch fresh from n8n to avoid stale data
const https = require('https');
const API_KEY = process.env.N8N_API_KEY;
const WF_ID = '37SLdWISQLgkHeXk';

const newCode = [
  '// WEBHOOK SECURITY GATE — SofIA',
  'const headers = $input.item.json.headers || {};',
  '',
  'const token = (',
  "    headers['x-chatwoot-webhook-token'] ||",
  "    headers['X-Chatwoot-Webhook-Token'] ||",
  "    ''",
  ');',
  '',
  "const expectedToken = 'EMpKxHggWneW19AfE_FFR9w3-QFixzn5';",
  '',
  'const payload = $input.item.json.body || $input.item.json;',
  '',
  'const logEntry = {',
  '    ts: new Date().toISOString(),',
  '    token_match: token === expectedToken,',
  '    token_present: !!token,',
  '    conversation_id: payload.conversation ? payload.conversation.id : null,',
  '    message_type: payload.message_type || null,',
  '};',
  '',
  'if (!token || token !== expectedToken) {',
  "    console.warn(JSON.stringify({...logEntry, event: 'WEBHOOK_TOKEN_MISMATCH'}));",
  '} else {',
  "    console.log(JSON.stringify({...logEntry, event: 'WEBHOOK_ACCEPTED'}));",
  '}',
  '',
  'return [$input.item];',
].join('\n');

// Patch the node
const nodeIdx = wf.nodes.findIndex(n => n.name === 'Verificar Webhook Token');
if (nodeIdx === -1) {
  console.error('Node not found!');
  process.exit(1);
}
wf.nodes[nodeIdx].parameters.jsCode = newCode;

// Verify the code looks right
console.log('--- CODE PREVIEW ---');
console.log(newCode.substring(0, 200));
console.log('---');
console.log('$input present:', newCode.includes('$input'));

// Save patched workflow
const putBody = {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: wf.settings,
  staticData: wf.staticData,
};

fs.writeFileSync(
  'c:/Users/Barbara/Documents/n8n_workflow_claudio/saas/sofia_put_v3.json',
  JSON.stringify(putBody)
);
console.log('PUT body saved. $input occurrences in jsCode:', (newCode.match(/\$input/g) || []).length);
