// patch_v26c.js — Fix Twilio ContentVariables 21656: option labels >24 chars
// Root cause: Twilio list-picker item labels have a 24-character limit.
// Labels over 24 chars cause error 21656 which was being silently swallowed.
// Fix 1: Update all 11 over-limit labels in demo_flow_config (Supabase)
// Fix 2: Add 24-char truncation safety in Demo Flow Engine (n8n)

const https = require('https');
const fs = require('fs');
const sbEnv = fs.readFileSync('c:/Users/Barbara/Documents/n8n_workflow_claudio/saas/.env', 'utf8');
const SUPABASE_KEY = sbEnv.match(/SUPABASE_SERVICE_KEY=(.+)/)[1].trim();
const n8nEnv = fs.readFileSync('c:/Users/Barbara/Documents/n8n_workflow_claudio/n8n-mcp/.env', 'utf8');
const API_KEY = n8nEnv.match(/N8N_API_KEY=(.+)/)[1].trim();
const WF_ID = '37SLdWISQLgkHeXk';
const DEMO_CLINIC_ID = 'c6c15fca-d7fc-4d98-83c1-2c5cb5a6bef1';

function sbReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'inhyrrjidhzrbqecnptn.supabase.co', port: 443, path, method,
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
    };
    const req = https.request(options, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve(JSON.parse(d));}catch(e){resolve(d);} }); });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function n8nReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'workflows.n8n.redsolucionesti.com', port: 443, path, method,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
    };
    const req = https.request(options, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve(JSON.parse(d));}catch(e){resolve(d);} }); });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// All labels must be ≤24 JS chars (Twilio list-picker limit)
// Format: { nodeId: { optId: 'new label' } }
const LABEL_FIXES = {
  "precios": {
    "pos_1": "\uD83D\uDFE2 B\u00E1sico S/.299/mes",          // 20
    "pos_2": "\uD83D\uDD35 Pro S/.499/mes \u2B50",           // 19
    "pos_3": "\uD83D\uDFE3 Enterprise S/.799+"               // 21
  },
  "info_agenda": {
    "pos_1": "\uD83D\uDCC5 Agendar cita ahora"               // 21
  },
  "como_funciona": {
    "pos_1": "\uD83D\uDCC5 El agendamiento",                  // 18
    "pos_3": "\uD83D\uDD14 Recordatorio y m\u00E1s"          // 21
  },
  "info_responde": {
    "pos_2": "\uD83D\uDCC5 Probar agendamiento"               // 22
  },
  "precio_basico": {
    "pos_1": "\uD83D\uDCC5 Demo del B\u00E1sico"             // 18
  },
  "precio_enterprise": {
    "pos_1": "\uD83E\uDD1D Cotizaci\u00F3n personal",         // 22
    "pos_2": "\uD83D\uDCCB Comparar planes"                   // 18
  },
  "info_recordatorios": {
    "pos_2": "\uD83D\uDCC5 Probar agendamiento"               // 22
  }
};

async function main() {
  // === FIX 1: Update demo_flow_config labels in Supabase ===
  const rows = await sbReq('GET', '/rest/v1/clinics?select=id,bot_config&id=eq.' + DEMO_CLINIC_ID, null);
  const bc = rows[0].bot_config;
  const df = bc.demo_flow;
  let fixCount = 0;

  for (const [nodeId, fixes] of Object.entries(LABEL_FIXES)) {
    if (!df.nodes[nodeId]) { console.log('WARN: node not found:', nodeId); continue; }
    for (const [optId, newLabel] of Object.entries(fixes)) {
      const opt = df.nodes[nodeId].options.find(o => o.id === optId);
      if (!opt) { console.log('WARN: option not found:', nodeId, optId); continue; }
      if (newLabel.length > 24) { console.log('ERROR: new label still >24!', nodeId, optId, newLabel.length); continue; }
      console.log('Fix:', nodeId + '.' + optId, '|', opt.label.length, '→', newLabel.length, 'chars |', newLabel);
      opt.label = newLabel;
      fixCount++;
    }
  }

  // Verify all labels are now ≤ 24
  let remaining = 0;
  for (const [nodeId, node] of Object.entries(df.nodes)) {
    for (const opt of node.options) {
      if (opt.label.length > 24) { console.log('STILL OVER 24:', nodeId, opt.id, opt.label.length, opt.label); remaining++; }
    }
  }
  if (remaining > 0) { console.log('ABORT: still', remaining, 'over-limit labels'); return; }

  const updatedBc = Object.assign({}, bc, { demo_flow: df });
  const result = await sbReq('PATCH', '/rest/v1/clinics?id=eq.' + DEMO_CLINIC_ID, { bot_config: updatedBc });
  if (Array.isArray(result) && result[0]) {
    console.log('\n✅ Supabase: ' + fixCount + ' labels fixed, all ≤24 chars');
  } else {
    console.log('Supabase error:', JSON.stringify(result).substring(0, 200));
    return;
  }

  // === FIX 2: Add 24-char truncation safety in Demo Flow Engine (n8n) ===
  const wf = await n8nReq('GET', '/api/v1/workflows/' + WF_ID);
  const responderNode = wf.nodes.find(n => n.name === 'Responder Demo');
  let code = responderNode.parameters.jsCode || responderNode.parameters.functionCode;

  // Add truncation in sendDemoNode before building vars
  const OLD_SEND_NODE = '  // Build ContentVariables: {1: body, 2..N: option labels}\n  var vars = { "1": node.body };\n  for (var vi = 0; vi < node.options.length; vi++) {\n    vars[String(vi + 2)] = node.options[vi].label;\n  }';
  const NEW_SEND_NODE = '  // Build ContentVariables: {1: body, 2..N: option labels}\n  // Twilio list-picker item label max = 24 chars (error 21656 if over)\n  var vars = { "1": node.body };\n  for (var vi = 0; vi < node.options.length; vi++) {\n    var lbl = node.options[vi].label;\n    vars[String(vi + 2)] = lbl.length > 24 ? lbl.substring(0, 23) + "\u2026" : lbl;\n  }';

  if (!code.includes(OLD_SEND_NODE)) {
    console.log('WARN: sendDemoNode vars anchor not found in engine code');
  } else {
    code = code.replace(OLD_SEND_NODE, NEW_SEND_NODE);
    console.log('✅ n8n: 24-char truncation guard added to sendDemoNode');
  }

  if (responderNode.parameters.jsCode !== undefined) responderNode.parameters.jsCode = code;
  else responderNode.parameters.functionCode = code;

  const payload = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings || {}, staticData: wf.staticData || null };
  const putResp = await n8nReq('PUT', '/api/v1/workflows/' + WF_ID, payload);
  if (putResp.id) console.log('✅ n8n PUT: OK | Nodes:', putResp.nodes.length);
  else console.log('n8n error:', JSON.stringify(putResp).substring(0, 300));
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
