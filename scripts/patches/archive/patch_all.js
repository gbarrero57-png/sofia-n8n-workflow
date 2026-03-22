const fs = require('fs');

const wf = JSON.parse(fs.readFileSync('c:/Users/Barbara/Documents/n8n_workflow_claudio/saas/sofia_fresh.json', 'utf8'));

// ==========================================
// FIX 1: Verificar Webhook Token — remove $env, hardcode token
// ==========================================
const verificarCode = [
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

const verificarIdx = wf.nodes.findIndex(n => n.name === 'Verificar Webhook Token');
wf.nodes[verificarIdx].parameters.jsCode = verificarCode;
console.log('Fix 1 — Verificar Webhook Token: $input present =', verificarCode.includes('$input'));

// ==========================================
// FIX 2: Calcular Slots Disponibles — restore conversation context after Google Calendar
// ==========================================
const calcularIdx = wf.nodes.findIndex(n => n.name === 'Calcular Slots Disponibles');
const calcularCode = wf.nodes[calcularIdx].parameters.jsCode;

const oldReturn = `return [{
  json: {
    ...$json,
    available_slots: available_slots,
    total_available: available_slots.length,
    busy_events_count: busy_times.length,
    calculated_at: new Date().toISOString()
  }
}];`;

const newReturn = `// Restore conversation context from before Google Calendar node
const ctx = $("Explicar Agendamiento").item.json;

return [{
  json: {
    ...ctx,
    available_slots: available_slots,
    total_available: available_slots.length,
    busy_events_count: busy_times.length,
    calculated_at: new Date().toISOString()
  }
}];`;

if (calcularCode.includes('...$json,')) {
  wf.nodes[calcularIdx].parameters.jsCode = calcularCode.replace(oldReturn, newReturn);
  console.log('Fix 2 — Calcular Slots: context restored =', wf.nodes[calcularIdx].parameters.jsCode.includes('Explicar Agendamiento'));
} else {
  console.log('Fix 2 — Calcular Slots: already patched or pattern not found');
}

// ==========================================
// Save PUT body
// ==========================================
const putBody = {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: wf.settings,
  staticData: wf.staticData,
};

fs.writeFileSync('c:/Users/Barbara/Documents/n8n_workflow_claudio/saas/sofia_put_final.json', JSON.stringify(putBody));
console.log('All fixes applied. PUT body saved.');
