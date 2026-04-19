// PATCH: Nueva secuencia de outreach
// SMS 1 (link WhatsApp) → llamada 5s después → SMS 2 (landing) 2h después
// Workflows: q1RZvxPbZVNJKAT5 (SMS CRON) y nYsyOfbIUmEcJgbw (Call CRON)

const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';

const WA_LINK    = 'wa.me/51905858566?text=Hola,%20me%20interesa%20saber%20m%C3%A1s%20sobre%20Sof%C3%ADa';
const LANDING    = 'sofia.redsolucionesti.com';
const AUDIO_URL  = 'https://inhyrrjidhzrbqecnptn.supabase.co/storage/v1/object/public/outreach/llamada_sofia_fonetico.mp3';
const TWILIO_SID = 'AC4080780a4b4a7d8e7b107a39f01abad3';
const FROM_NUM   = '+13186683828';
const TWILIO_AUTH= Buffer.from('AC4080780a4b4a7d8e7b107a39f01abad3:6504179bc74222d9da8c8125f20bcfdf').toString('base64');

function n8n(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const req = https.request({
      hostname: 'workflows.n8n.redsolucionesti.com', path, method,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
    }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => resolve(JSON.parse(d))); });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
}

// ── SMS 1: mensaje cálido + link WhatsApp ─────────────────────────────────────
// Max 160 chars. Objetivo: sonar humano, dar el link, no presionar.
const SMS1_CODE = [
  'var all = $input.all();',
  'return all.map(function(item) {',
  '  var j = item.json;',
  '  var tel = (j.telefono||j.phone||"").replace(/[\\s\\-\\(\\)]/g, "");',
  '  if (!tel) return { json: Object.assign({}, j, { skip: true }) };',
  '  var phone = tel;',
  '  if (!phone.startsWith("+51")) {',
  '    if (phone.startsWith("51"))                          phone = "+" + phone;',
  '    else if (phone.startsWith("9") && phone.length===9)  phone = "+51" + phone;',
  '    else if (phone.startsWith("01"))                     phone = "+51" + phone.slice(1);',
  '    else                                                 phone = "+51" + phone;',
  '  }',
  '  var isMobile = /^\\+519/.test(phone);',
  '  var fuente = j.fuente || "google_maps";',
  '  var nombre = (j.nombre || "").split(" ")[0] || "Doctor";',
  '',
  '  // SMS 1: cálido, con link WhatsApp. Max 160 chars.',
  '  var sms1;',
  '  if (fuente === "meta_ads") {',
  '    sms1 = "Hola " + nombre + ", soy Gabriel de RedSolucionesti. Vi que te interesa automatizar tu clínica dental. Te cuento más por aquí: ' + WA_LINK + '";',
  '  } else {',
  '    sms1 = "Hola " + nombre + ", soy Gabriel de RedSolucionesti. ¿Tu clínica dental pierde citas por no responder WhatsApp? Sofía lo resuelve. Hablamos aquí: ' + WA_LINK + '";',
  '  }',
  '',
  '  return { json: {',
  '    record_id:  j.id || j.record_id,',
  '    nombre:     j.nombre || "",',
  '    telefono:   j.telefono || "",',
  '    email:      j.email || "",',
  '    fuente:     fuente,',
  '    status:     j.status || "nuevo",',
  '    phone_e164: phone,',
  '    is_mobile:  isMobile,',
  '    sms_text:   sms1,',
  '    skip:       !isMobile,',
  '    fecha_hoy:  new Date().toISOString().slice(0,10)',
  '  }};',
  '});'
].join('\n');

// ── Nodo: Llamada Twilio (HTTP Request directo) ───────────────────────────────
// Parámetros del nodo httpRequest que hace la llamada 5 seg después del SMS
const TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response><Play>' + AUDIO_URL + '</Play></Response>';

// ── Nodo: Esperar 2 horas (Wait node) ────────────────────────────────────────
// Después de la llamada, n8n espera 2h y luego envía SMS 2

// ── SMS 2: landing page (confianza + credibilidad) ────────────────────────────
const SMS2_TEXT = [
  '={{ "Hola " + $json.nombre.split(" ")[0] + ",",',
  '" hace un momento le llamamos de RedSolucionesti.",',
  '" Sofía es nuestra IA para clínicas dentales: agenda WhatsApp 24/7, recordatorios automáticos, historial digital.",',
  '" Conócenos aquí: ' + LANDING + '" }}'
].join(' ');

async function patchSMSCron() {
  const wf = await n8n('GET', '/api/v1/workflows/q1RZvxPbZVNJKAT5');

  // ── Modificar nodo Preparar Tel con nuevo SMS 1 ──
  wf.nodes = wf.nodes.map(n => {
    if (n.name === 'Preparar Tel') {
      n.parameters.jsCode = SMS1_CODE;
      console.log('  Preparar Tel: SMS 1 con link WhatsApp ✓');
    }
    return n;
  });

  // ── Agregar nodo Wait 2h si no existe ──
  const hasWait = wf.nodes.some(n => n.name === 'Esperar 2 Horas');
  const hasSMS2 = wf.nodes.some(n => n.name === 'Enviar SMS 2');
  const hasMakeLlamada = wf.nodes.some(n => n.name === 'Llamada Inmediata');

  if (!hasMakeLlamada) {
    wf.nodes.push({
      id: 'llamada-inmediata', name: 'Llamada Inmediata',
      type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
      position: [1100, 280],
      parameters: {
        method: 'POST',
        url: 'https://api.twilio.com/2010-04-01/Accounts/' + TWILIO_SID + '/Calls.json',
        authentication: 'none',
        sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Authorization', value: 'Basic ' + TWILIO_AUTH }] },
        sendBody: true,
        contentType: 'form-urlencoded',
        bodyParameters: { parameters: [
          { name: 'To',   value: '={{ $json.phone_e164 }}' },
          { name: 'From', value: FROM_NUM },
          { name: 'Twiml', value: TWIML }
        ]}
      }
    });
    console.log('  Llamada Inmediata: nodo agregado ✓');
  }

  if (!hasWait) {
    wf.nodes.push({
      id: 'wait-2h', name: 'Esperar 2 Horas',
      type: 'n8n-nodes-base.wait', typeVersion: 1,
      position: [1320, 280],
      parameters: { unit: 'hours', amount: 2 }
    });
    console.log('  Esperar 2 Horas: nodo agregado ✓');
  }

  if (!hasSMS2) {
    wf.nodes.push({
      id: 'sms2-twilio', name: 'Enviar SMS 2',
      type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
      position: [1540, 280],
      parameters: {
        method: 'POST',
        url: 'https://api.twilio.com/2010-04-01/Accounts/' + TWILIO_SID + '/Messages.json',
        authentication: 'none',
        sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Authorization', value: 'Basic ' + TWILIO_AUTH }] },
        sendBody: true,
        contentType: 'form-urlencoded',
        bodyParameters: { parameters: [
          { name: 'To',   value: '={{ $json.phone_e164 }}' },
          { name: 'From', value: FROM_NUM },
          { name: 'Body', value: '={{ "Hola " + ($json.nombre||"").split(" ")[0] + ", hace un momento le llamamos de RedSolucionesti. Sofía automatiza las citas de clínicas dentales: WhatsApp 24/7, recordatorios, historial digital. Conócenos: ' + LANDING + '" }}' }
        ]}
      }
    });
    console.log('  Enviar SMS 2: nodo agregado ✓');
  }

  // ── Actualizar connections ──
  // Enviar SMS Twilio → Llamada Inmediata → Esperar 2 Horas → Enviar SMS 2 → Actualizar SMS Enviado → ...
  if (!hasMakeLlamada) {
    // Redirigir: después de Enviar SMS Twilio → Llamada Inmediata
    wf.connections['Enviar SMS Twilio'] = { main: [[{ node: 'Llamada Inmediata', type: 'main', index: 0 }]] };
    wf.connections['Llamada Inmediata'] = { main: [[{ node: 'Esperar 2 Horas', type: 'main', index: 0 }]] };
    wf.connections['Esperar 2 Horas']   = { main: [[{ node: 'Enviar SMS 2', type: 'main', index: 0 }]] };
    wf.connections['Enviar SMS 2']      = { main: [[{ node: 'Actualizar SMS Enviado', type: 'main', index: 0 }]] };
    console.log('  Connections actualizadas ✓');
  }

  const r = await n8n('PUT', '/api/v1/workflows/q1RZvxPbZVNJKAT5', {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings || {}, staticData: wf.staticData || null
  });
  console.log('SMS CRON:', r.id ? '✅' : '❌ ' + JSON.stringify(r).substring(0, 300));
}

async function main() {
  console.log('Actualizando secuencia de outreach...\n');
  await patchSMSCron();
  console.log('\nSecuencia final:');
  console.log('  10:00 AM → SMS 1 (link WhatsApp)');
  console.log('  10:00 AM +5s → Llamada (audio ElevenLabs)');
  console.log('  12:00 PM → SMS 2 (link landing sofia.redsolucionesti.com)');
}
main().catch(console.error);
