// patch_v26_pre.js — Patch Pre-Clasificador:
// 1. Add pos_1..pos_5 ID detection → DEMO_FLOW (demo flow navigation)
// 2. Add demo_mode catch-all guard before fallback → DEMO_FLOW_START or DEMO_FLOW_CATCH_ALL

const https = require('https');
const fs = require('fs');
const env = fs.readFileSync('c:/Users/Barbara/Documents/n8n_workflow_claudio/n8n-mcp/.env', 'utf8');
const API_KEY = env.match(/N8N_API_KEY=(.+)/)[1].trim();
const WF_ID = '37SLdWISQLgkHeXk';

function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://workflows.n8n.redsolucionesti.com');
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname, port: 443, path, method,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(d); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const wf = await apiRequest('GET', `/api/v1/workflows/${WF_ID}`);
  const pre = wf.nodes.find(n => n.name === 'Pre-Clasificador Keywords');
  let code = pre.parameters.jsCode || pre.parameters.functionCode;
  const results = [];

  // ── FIX 1: Add pos_1..pos_5 detection after existing button IDs ───────────
  const OLD_BUTTONS_END = 'if (_rawMsg === "retry_day") return [{ json: Object.assign({}, $json, { intent: "BOOKING_TIME_PREF", confidence: "high", classified_by: "BTN_ID_RETRY_DAY", skip_ai: true, day_change_request: true, message_text: "cambiar horario preferencia de otro dia" }) }];\n// ═════════════════════════════════════════════════════════════════════════';

  const NEW_BUTTONS_END = 'if (_rawMsg === "retry_day") return [{ json: Object.assign({}, $json, { intent: "BOOKING_TIME_PREF", confidence: "high", classified_by: "BTN_ID_RETRY_DAY", skip_ai: true, day_change_request: true, message_text: "cambiar horario preferencia de otro dia" }) }];\n\n// \u2550\u2550 DEMO FLOW NAVIGATION: pos_1..pos_5 from LP3/LP4/LP5 list-picker templates \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\nif (_rawMsg === "pos_1" || _rawMsg === "pos_2" || _rawMsg === "pos_3" || _rawMsg === "pos_4" || _rawMsg === "pos_5") {\n  return [{ json: Object.assign({}, $json, { intent: "DEMO_FLOW", demo_pos: parseInt(_rawMsg.replace("pos_", ""), 10), confidence: "high", classified_by: "DF_POS_ID", skip_ai: true }) }];\n}\n// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550';

  if (!code.includes(OLD_BUTTONS_END)) {
    results.push('WARN Fix1: pos_1..5 anchor not found');
  } else {
    code = code.replace(OLD_BUTTONS_END, NEW_BUTTONS_END);
    results.push('Fix 1 OK: pos_1..pos_5 detection added');
  }

  // ── FIX 2: Add demo_mode catch-all guard before final fallback ────────────
  const OLD_FALLBACK = '// 8. Fallback — AI classifier\nreturn [{ json: Object.assign({}, $json, { skip_ai: false }) }];';

  const NEW_FALLBACK = '// \u2550\u2550 DEMO MODE CATCH-ALL: when demo_mode=true and no other handler matched \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\nif (($json.bot_config || {}).demo_mode === true) {\n  var _dfActiveLabel = convLabels.find(function(l) { return l.startsWith("df_"); });\n  if (_dfActiveLabel) {\n    // User is in a demo flow node but sent free text \u2014 return to current state\n    return [{ json: Object.assign({}, $json, { intent: "DEMO_FLOW_CATCH_ALL", demo_state: _dfActiveLabel, confidence: "high", classified_by: "DF_CATCH_ALL", skip_ai: true }) }];\n  }\n  // Demo mode but no active flow \u2014 start from bienvenida\n  return [{ json: Object.assign({}, $json, { intent: "DEMO_FLOW_START", confidence: "high", classified_by: "DF_START", skip_ai: true }) }];\n}\n// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\n// 8. Fallback \u2014 AI classifier\nreturn [{ json: Object.assign({}, $json, { skip_ai: false }) }];';

  if (!code.includes(OLD_FALLBACK)) {
    results.push('WARN Fix2: fallback anchor not found');
  } else {
    code = code.replace(OLD_FALLBACK, NEW_FALLBACK);
    results.push('Fix 2 OK: demo_mode catch-all guard added before fallback');
  }

  if (pre.parameters.jsCode !== undefined) pre.parameters.jsCode = code;
  else pre.parameters.functionCode = code;

  const payload = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings || {}, staticData: wf.staticData || null };
  const putResp = await apiRequest('PUT', `/api/v1/workflows/${WF_ID}`, payload);
  console.log('=== patch_v26_pre results ===');
  results.forEach(r => console.log(r));
  if (putResp.id) console.log('n8n PUT: OK | Nodes:', putResp.nodes.length);
  else console.log('n8n PUT ERROR:', JSON.stringify(putResp).substring(0, 400));
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
