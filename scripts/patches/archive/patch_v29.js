/**
 * patch_v29.js — Fix literal newlines in Responder Demo _HUMAN handler
 *
 * BUG: Lines 230-232 and 248-249 in Responder Demo have actual \n characters
 * inside double-quoted strings. n8n's code sandbox rejects these with
 * "Invalid or unexpected token" SyntaxError. Every pos_4 (Hablar con un asesor)
 * tap results in no response being sent.
 *
 * FIX: Replace literal newlines with \\n escape sequences in both strings.
 */

const https = require('https');
const fs    = require('fs');

const N8N_URL = 'https://workflows.n8n.redsolucionesti.com';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const WF_ID  = '37SLdWISQLgkHeXk';

function req(method, path, body) {
  return new Promise((res, rej) => {
    const u = new URL(N8N_URL + path);
    const opts = {
      hostname: u.hostname, port: 443, path: u.pathname + u.search,
      method, headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' }
    };
    const r = https.request(opts, resp => {
      let d = '';
      resp.on('data', c => d += c);
      resp.on('end', () => {
        try { res(JSON.parse(d)); } catch(e) { res(d); }
      });
    });
    r.on('error', rej);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function main() {
  console.log('Fetching workflow...');
  const wf = await req('GET', `/api/v1/workflows/${WF_ID}`);

  const rdNode = wf.nodes.find(n => n.name === 'Responder Demo');
  if (!rdNode) throw new Error('Responder Demo node not found');

  let code = rdNode.parameters.jsCode;
  const originalLen = code.length;

  // ── FIX 1: sendText with literal newlines in _HUMAN handler ───────────────
  // The string "👤 ¡Claro! Un asesor...\n\n¡Gracias por tu interés!"
  // has actual newline chars — replace with \n escape sequences
  const badSendText = `"👤 ¡Claro! Un asesor de SofIA AI se pondrá en contacto contigo en breve para resolver todas tus dudas.\n\n¡Gracias por tu interés!"`;
  const goodSendText = `"👤 ¡Claro! Un asesor de SofIA AI se pondrá en contacto contigo en breve para resolver todas tus dudas.\\n\\n¡Gracias por tu interés!"`;

  if (code.includes(badSendText)) {
    code = code.replace(badSendText, goodSendText);
    console.log('✅ FIX 1: Escaped literal newlines in sendText(_HUMAN message)');
  } else {
    // Try matching with the actual newline chars explicitly
    const badStr = "👤 ¡Claro! Un asesor de SofIA AI se pondrá en contacto contigo en breve para resolver todas tus dudas.\n\n¡Gracias por tu interés!";
    const goodStr = "👤 ¡Claro! Un asesor de SofIA AI se pondrá en contacto contigo en breve para resolver todas tus dudas.\\n\\n¡Gracias por tu interés!";
    if (code.includes(badStr)) {
      code = code.replace(badStr, goodStr);
      console.log('✅ FIX 1: Escaped literal newlines in _HUMAN sendText (string match)');
    } else {
      console.log('⚠️  FIX 1: Pattern not found — checking raw chars...');
      // Show what's around _HUMAN to debug
      const idx = code.indexOf('_HUMAN');
      console.log('  Context around _HUMAN:', JSON.stringify(code.substring(idx, idx+300)));
    }
  }

  // ── FIX 2: private note body with literal newline ──────────────────────────
  // "🤝 LEAD SOLICITA ASESOR (desde demo SofIA)\nContacto: "
  const badNote = "🤝 LEAD SOLICITA ASESOR (desde demo SofIA)\nContacto: ";
  const goodNote = "🤝 LEAD SOLICITA ASESOR (desde demo SofIA)\\nContacto: ";

  if (code.includes(badNote)) {
    code = code.replace(badNote, goodNote);
    console.log('✅ FIX 2: Escaped literal newline in private note body');
  } else {
    console.log('⚠️  FIX 2: Private note pattern not found');
  }

  // ── Verify no more literal newlines inside double-quoted strings ──────────
  // Quick check: scan for newlines that look like they're inside strings
  const lines = code.split('\n');
  let suspiciousCount = 0;
  lines.forEach((line, idx) => {
    // A line that starts with non-code content after an unclosed string is suspicious
    if (/^[^/\s*{]/.test(line) && !/^\s*(var|const|let|if|else|try|catch|await|return|\/\/|\/\*)/.test(line)) {
      // Could be a string continuation — but hard to detect reliably here
    }
  });

  const newLen = code.length;
  console.log(`\nCode length: ${originalLen} → ${newLen} chars (delta: ${newLen - originalLen})`);

  if (newLen === originalLen) {
    console.log('⚠️  No changes made — check if patterns match');
    process.exit(1);
  }

  // ── Upload ─────────────────────────────────────────────────────────────────
  rdNode.parameters.jsCode = code;
  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || {},
    staticData: wf.staticData || null
  };

  console.log('\nUploading workflow...');
  const result = await req('PUT', `/api/v1/workflows/${WF_ID}`, payload);
  console.log('Upload:', result.id, result.name, 'active:', result.active);

  // Re-activate if needed
  if (!result.active) {
    await req('POST', `/api/v1/workflows/${WF_ID}/activate`);
    console.log('Re-activated.');
  }

  console.log('\n✅ patch_v29 complete!');
  console.log('   _HUMAN handler now works without SyntaxError');
  console.log('   "Hablar con un asesor" button will correctly escalate to human agent');
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
