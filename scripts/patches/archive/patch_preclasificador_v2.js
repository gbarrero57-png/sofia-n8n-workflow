#!/usr/bin/env node
/**
 * Patch: Update Pre-Clasificador Keywords node with greeting detection + short fallback
 */
const fs = require('fs');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const WORKFLOW_ID = '37SLdWISQLgkHeXk';

// Build the new jsCode as a plain string (no template literals to avoid escaping issues)
const lines = [
  '// ============================================',
  '// PRE-CLASIFICADOR BASADO EN KEYWORDS',
  '// Casos obvios que no necesitan AI',
  '// ============================================',
  'const message = ($json.message_text || "").toLowerCase().trim();',
  '',
  '// SLOT CONFIRMATION: Highest priority — check BEFORE AI classification',
  '// If conversation is awaiting slot confirmation and message is 1/2/3',
  'const convLabels = $json.raw_payload?.conversation?.labels || [];',
  'const awaitingSlot = convLabels.includes("awaiting_slot");',
  'if (awaitingSlot && /^[123]$/.test(message.trim())) {',
  '    return [{',
  '        json: {',
  '            ...$json,',
  '            intent: "CREATE_EVENT",',
  '            confidence: "high",',
  '            classified_by: "SLOT_CONFIRMATION_DETECTOR",',
  '            skip_ai: true',
  '        }',
  '    }];',
  '}',
  '',
  '// PURE GREETING DETECTION: if all words are greetings → HUMAN',
  '// A real person should handle initial contact (e.g. "Hola buenos días")',
  'const GREETING_WORDS = new Set([',
  '    "hola","hey","holi","buenos","buenas","buen","dias","dia",',
  '    "tarde","tardes","noche","noches","saludos","hi","hello",',
  '    "good","morning","afternoon","evening","que","tal","como","estas","esta"',
  ']);',
  '// Normalize: remove accents for comparison',
  'const msgNorm = message.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");',
  'const cleanWords = msgNorm.replace(/[!.\\u00a1?\\u00bf,;:]/g, "").split(/\\s+/).filter(w => w.length > 0);',
  'const isOnlyGreeting = cleanWords.length > 0 && cleanWords.length <= 4 &&',
  '    cleanWords.every(w => GREETING_WORDS.has(w));',
  'if (isOnlyGreeting) {',
  '    return [{',
  '        json: {',
  '            ...$json,',
  '            intent: "HUMAN",',
  '            confidence: "high",',
  '            classified_by: "GREETING_DETECTOR",',
  '            skip_ai: true',
  '        }',
  '    }];',
  '}',
  '',
  '// Definir keywords',
  'const CREATE_EVENT_KEYWORDS = [',
  '    "agendar", "reservar", "cita", "turno", "hora disponible",',
  '    "appointment", "quiero una cita", "necesito cita",',
  '    "cuando puedo ir", "horarios para cita", "disponibilidad para cita"',
  '];',
  '',
  'const PAYMENT_KEYWORDS = [',
  '    "pague", "pagar", "transferencia", "deposite",',
  '    "ya pague", "como pagar", "metodos de pago", "metodo de pago",',
  '    "efectivo", "tarjeta", "pagos", "cobran", "cobro",',
  '    "factura", "recibo", "comprobante de pago"',
  '];',
  '',
  'const HUMAN_KEYWORDS = [',
  '    "hablar con", "persona real", "humano", "agente",',
  '    "operador", "recepcion", "quiero hablar",',
  '    "necesito hablar", "contactar persona",',
  '    "emergencia", "urgencia", "dolor fuerte", "sangra",',
  '    "mucho dolor", "hinchazon", "infeccion",',
  '    "queja", "reclamo", "problema grave"',
  '];',
  '',
  '// Check for HUMAN first (highest priority for escalation)',
  'for (const keyword of HUMAN_KEYWORDS) {',
  '    if (message.includes(keyword)) {',
  '        return [{',
  '            json: {',
  '                ...$json,',
  '                intent: "HUMAN",',
  '                confidence: "high",',
  '                classified_by: "PRE_CLASSIFIER",',
  '                skip_ai: true',
  '            }',
  '        }];',
  '    }',
  '}',
  '',
  '// Check for CREATE_EVENT',
  'for (const keyword of CREATE_EVENT_KEYWORDS) {',
  '    if (message.includes(keyword)) {',
  '        return [{',
  '            json: {',
  '                ...$json,',
  '                intent: "CREATE_EVENT",',
  '                confidence: "high",',
  '                classified_by: "PRE_CLASSIFIER",',
  '                skip_ai: true',
  '            }',
  '        }];',
  '    }',
  '}',
  '',
  '// Check for PAYMENT',
  'for (const keyword of PAYMENT_KEYWORDS) {',
  '    if (message.includes(keyword)) {',
  '        return [{',
  '            json: {',
  '                ...$json,',
  '                intent: "PAYMENT",',
  '                confidence: "high",',
  '                classified_by: "PRE_CLASSIFIER",',
  '                skip_ai: true',
  '            }',
  '        }];',
  '    }',
  '}',
  '',
  '// SHORT NON-SPANISH FALLBACK: avoid expensive double LLM call for ambiguous/test/gibberish',
  '// If message has no Spanish accented chars and is 3 words or fewer → HUMAN (safe escalation)',
  'const hasSpanishChars = /[\\u00e0-\\u00ff\\u00bf\\u00a1]/i.test(message);',
  'const wordCount = message.split(/\\s+/).filter(w => w.length > 0).length;',
  'if (!hasSpanishChars && wordCount <= 3) {',
  '    return [{',
  '        json: {',
  '            ...$json,',
  '            intent: "HUMAN",',
  '            confidence: "low",',
  '            classified_by: "SHORT_FALLBACK",',
  '            skip_ai: true',
  '        }',
  '    }];',
  '}',
  '',
  '// No match - send to AI Clasificador',
  'return [{',
  '    json: {',
  '        ...$json,',
  '        skip_ai: false',
  '    }',
  '}];',
];

const NEW_CODE = lines.join('\n');

// Local test before deploying
function localTest() {
  const GREETING_WORDS = new Set([
    'hola','hey','holi','buenos','buenas','buen','dias','dia',
    'tarde','tardes','noche','noches','saludos','hi','hello',
    'good','morning','afternoon','evening','que','tal','como','estas','esta'
  ]);

  function classify(msg) {
    const message = msg.toLowerCase().trim();
    const convLabels = [];
    const awaitingSlot = false;
    // Greeting check
    const msgNorm = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const cleanWords = msgNorm.replace(/[!.\u00a1?\u00bf,;:]/g, '').split(/\s+/).filter(w => w.length > 0);
    const isOnlyGreeting = cleanWords.length > 0 && cleanWords.length <= 4 && cleanWords.every(w => GREETING_WORDS.has(w));
    if (isOnlyGreeting) return 'HUMAN(greeting)';
    // HUMAN keywords
    const HUMAN_KEYWORDS = ['hablar con','persona real','humano','agente','operador','recepcion','quiero hablar','necesito hablar','emergencia','urgencia','dolor fuerte','sangra','mucho dolor','queja','reclamo'];
    for (const k of HUMAN_KEYWORDS) if (message.includes(k)) return 'HUMAN(keyword)';
    // CREATE_EVENT keywords
    const CREATE_EVENT_KEYWORDS = ['agendar','reservar','cita','turno','hora disponible','appointment','cuando puedo ir'];
    for (const k of CREATE_EVENT_KEYWORDS) if (message.includes(k)) return 'CREATE_EVENT';
    // PAYMENT keywords
    const PAYMENT_KEYWORDS = ['pague','pagar','transferencia','efectivo','tarjeta','pagos','cobran','cobro','factura'];
    for (const k of PAYMENT_KEYWORDS) if (message.includes(k)) return 'PAYMENT';
    // Short fallback
    const hasSpanishChars = /[\u00e0-\u00ff\u00bf\u00a1]/i.test(message);
    const wordCount = message.split(/\s+/).filter(w => w.length > 0).length;
    if (!hasSpanishChars && wordCount <= 3) return 'HUMAN(short)';
    return 'AI→classify';
  }

  const tests = [
    { msg: 'Hola buenos días', expected: 'HUMAN' },
    { msg: 'Test message', expected: 'HUMAN' },
    { msg: 'hola', expected: 'HUMAN' },
    { msg: 'buenas tardes', expected: 'HUMAN' },
    { msg: '¿Cuánto cuesta una limpieza?', expected: 'AI' },
    { msg: '¿Cómo puedo pagar?', expected: 'PAYMENT' },
    { msg: 'Quiero una cita', expected: 'CREATE_EVENT' },
    { msg: 'quiero hablar con alguien', expected: 'HUMAN' },
    { msg: 'asdfghjkl', expected: 'HUMAN' },
    { msg: 'ok', expected: 'HUMAN' },
    { msg: '¿Cuánto cuesta?', expected: 'AI' },
  ];

  let allPassed = true;
  tests.forEach(t => {
    const result = classify(t.msg);
    const passed = result.startsWith(t.expected);
    const mark = passed ? '✓' : '✗';
    console.log(`  ${mark} "${t.msg}" → ${result} (expected: ${t.expected})`);
    if (!passed) allPassed = false;
  });
  return allPassed;
}

async function run() {
  const https = require('https');

  function apiRequest(method, path, body) {
    return new Promise((resolve, reject) => {
      const bodyStr = body ? JSON.stringify(body) : '';
      const opts = {
        hostname: 'workflows.n8n.redsolucionesti.com',
        path,
        method,
        headers: {
          'X-N8N-API-KEY': API_KEY,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
        },
      };
      const req = https.request(opts, res => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', reject);
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }

  // 1. Local test
  console.log('\nLocal logic test:');
  const testsPassed = localTest();
  if (!testsPassed) {
    console.error('\nLocal tests FAILED. Aborting deployment.');
    process.exit(1);
  }
  console.log('All local tests passed!\n');

  // 2. Fetch workflow
  console.log('Fetching workflow...');
  const resp = await apiRequest('GET', `/api/v1/workflows/${WORKFLOW_ID}`, null);
  if (resp.status !== 200) throw new Error('Failed to fetch workflow: ' + resp.status);
  const wf = JSON.parse(resp.body);

  // 3. Backup
  fs.writeFileSync('./saas/workflow_backup_pre_greeting_fix.json', JSON.stringify(wf, null, 2));
  console.log('Backup saved: saas/workflow_backup_pre_greeting_fix.json');

  // 4. Update Pre-Clasificador node
  const nodeIdx = wf.nodes.findIndex(n => n.name === 'Pre-Clasificador Keywords');
  if (nodeIdx === -1) throw new Error('Pre-Clasificador Keywords node not found!');
  wf.nodes[nodeIdx].parameters.jsCode = NEW_CODE;
  console.log('Updated node: Pre-Clasificador Keywords');

  // 5. Push workflow
  console.log('Pushing workflow...');
  const putBody = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || {},
    staticData: wf.staticData || null,
  };
  const putResp = await apiRequest('PUT', `/api/v1/workflows/${WORKFLOW_ID}`, putBody);
  if (putResp.status !== 200) {
    console.error('PUT failed:', putResp.status, putResp.body.substring(0, 500));
    throw new Error('Failed to push workflow');
  }
  console.log('Workflow updated successfully!');

  // 6. Activate
  const actResp = await apiRequest('POST', `/api/v1/workflows/${WORKFLOW_ID}/activate`, {});
  console.log('Activate status:', actResp.status);
}

run().catch(e => { console.error(e); process.exit(1); });
