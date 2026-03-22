// PATCH: Mensajes de outreach — SMS personalizado + TwiML profesional
// Afecta los 3 workflows: EFnNBEXSCnUwRPM2, q1RZvxPbZVNJKAT5, nYsyOfbIUmEcJgbw

const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';

// ══════════════════════════════════════════════════════════════════
// MENSAJES — editar aqui para A/B testing o cambios futuros
// ══════════════════════════════════════════════════════════════════

// SMS para leads SIN email previo (primer contacto directo)
const SMS_PRIMER_CONTACTO = function(nombre) {
  var n = (nombre || 'Doctor').slice(0, 18);
  return n + ', desde SofIA: automatizamos la agenda de tu clinica dental por WhatsApp 24/7. Tus pacientes reservan solos, con recordatorios automaticos. Demo gratis esta semana? Responde SI. STOP para no recibir.';
};

// SMS para leads CON email previo (follow-up)
const SMS_FOLLOWUP_EMAIL = function(nombre) {
  var n = (nombre || 'Doctor').slice(0, 18);
  return n + ', te escribimos de SofIA. Revisaste nuestro email? Automatiza las citas de tu clinica dental por WhatsApp 24/7 y reduce cancelaciones un 40%. Demo gratuita disponible. Responde SI o STOP para no recibir.';
};

// TwiML para la llamada — voz Polly Mia-Neural (espanol natural)
// Duracion aproximada: 25 segundos
const TWIML_LLAMADA = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<Response>',
  '<Say voice="Polly.Mia-Neural" language="es-US">',
  'Hola, buen dia. Le llamo de parte de SofIA, el asistente de inteligencia artificial para clinicas dentales en Lima.',
  '<break time="500ms"/>',
  'Nos comunicamos porque le escribimos hace unos dias sobre como sus pacientes pueden agendar citas directamente por WhatsApp, las 24 horas, los 7 dias de la semana, sin que su equipo tenga que responder manualmente.',
  '<break time="400ms"/>',
  'Ademas, SofIA envia recordatorios automaticos que reducen las cancelaciones hasta un 40 por ciento.',
  '<break time="500ms"/>',
  'Si le interesa ver una demostracion gratuita de 15 minutos esta semana, por favor responda el mensaje de texto que le enviamos, o escribanos al mismo numero.',
  '<break time="400ms"/>',
  'Muchas gracias por su tiempo. Que tenga un excelente dia.',
  '</Say>',
  '</Response>'
].join('');

// ══════════════════════════════════════════════════════════════════

function n8n(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const req = https.request({
      hostname: 'workflows.n8n.redsolucionesti.com', path, method,
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => resolve(JSON.parse(d))); });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function put(wf) {
  return n8n('PUT', '/api/v1/workflows/' + wf.id, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings || {}, staticData: wf.staticData || null
  });
}

async function patchMain() {
  // EFnNBEXSCnUwRPM2 — Outreach Llamadas y SMS (manual)
  const wf = await n8n('GET', '/api/v1/workflows/EFnNBEXSCnUwRPM2');
  wf.nodes = wf.nodes.map(n => {
    if (n.name === 'Preparar Datos') {
      // Actualizar texto SMS según si tiene email o no
      n.parameters.jsCode = n.parameters.jsCode
        .replace(
          /var smsText = ".*?";/,
          [
            'var hasSentEmail = j.status === "email_enviado";',
            '  var nombreCorto = (nombre || "Doctor").slice(0, 18);',
            '  var smsText;',
            '  if (hasSentEmail) {',
            '    smsText = nombreCorto + ", te escribimos de SofIA. Revisaste nuestro email? Automatiza las citas de tu clinica dental por WhatsApp 24/7 y reduce cancelaciones un 40%. Demo gratuita disponible. Responde SI o STOP para no recibir.";',
            '  } else {',
            '    smsText = nombreCorto + ", desde SofIA: automatizamos la agenda de tu clinica dental por WhatsApp 24/7. Tus pacientes reservan solos, con recordatorios automaticos. Demo gratis esta semana? Responde SI. STOP para no recibir.";',
            '  }'
          ].join('\n  ')
        );
      console.log('  [MAIN] Preparar Datos SMS — actualizado');
    }
    if (n.name === 'Hacer Llamada') {
      const twimlParam = n.parameters.bodyParameters.parameters.find(p => p.name === 'Twiml');
      if (twimlParam) { twimlParam.value = TWIML_LLAMADA; console.log('  [MAIN] Hacer Llamada TwiML — actualizado'); }
    }
    return n;
  });
  const r = await put(wf);
  console.log('MAIN:', r.id ? '✅' : '❌ ' + JSON.stringify(r).substring(0,200));
}

async function patchSMSCron() {
  // q1RZvxPbZVNJKAT5 — SMS Follow-up CRON (leads con email enviado hace 4+ dias)
  const wf = await n8n('GET', '/api/v1/workflows/q1RZvxPbZVNJKAT5');
  wf.nodes = wf.nodes.map(n => {
    if (n.name === 'Preparar Tel') {
      // Este CRON solo corre para leads con status=email_enviado, asi que siempre es follow-up
      n.parameters.jsCode = n.parameters.jsCode.replace(
        /var sms = ".*?";/,
        'var sms = (j.nombre ? (j.nombre.slice(0,18) + ", ") : "") + "te escribimos de SofIA. Revisaste nuestro email? Automatiza las citas de tu clinica dental por WhatsApp 24/7 y reduce cancelaciones un 40%. Demo gratuita esta semana? Responde SI o STOP para no recibir.";'
      );
      console.log('  [SMS CRON] Preparar Tel — actualizado');
    }
    return n;
  });
  const r = await put(wf);
  console.log('SMS CRON:', r.id ? '✅' : '❌ ' + JSON.stringify(r).substring(0,200));
}

async function patchCallCron() {
  // nYsyOfbIUmEcJgbw — Llamada Follow-up CRON
  const wf = await n8n('GET', '/api/v1/workflows/nYsyOfbIUmEcJgbw');
  wf.nodes = wf.nodes.map(n => {
    if (n.name === 'Hacer Llamada') {
      const twimlParam = n.parameters.bodyParameters.parameters.find(p => p.name === 'Twiml');
      if (twimlParam) { twimlParam.value = TWIML_LLAMADA; console.log('  [CALL CRON] Hacer Llamada TwiML — actualizado'); }
    }
    return n;
  });
  const r = await put(wf);
  console.log('CALL CRON:', r.id ? '✅' : '❌ ' + JSON.stringify(r).substring(0,200));
}

async function main() {
  console.log('Patching outreach messages...\n');
  await Promise.all([patchMain(), patchSMSCron(), patchCallCron()]);
  console.log('\nDone.');
}

main().catch(console.error);
