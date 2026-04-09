/**
 * create_twilio_template_t12.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Crea el template T12_reengagement en Twilio Content API.
 * Se usa en el R2 del sistema de re-engagement (fuera de ventana 24h WhatsApp).
 *
 * Template: twilio/quick-reply
 *   Cuerpo: "Hola {{1}}! Aún tienes horarios disponibles para tu cita 🦷.
 *            ¿Agendamos ahora?"
 *   Botones:
 *     - "Ver horarios"      → SofIA retoma flujo CREATE_EVENT
 *     - "Hablar con asesor" → Bot pause + notificación staff
 *
 * Uso:
 *   node scripts/patches/archive/create_twilio_template_t12.js \
 *     --account-sid ACxxxxxxxx \
 *     --auth-token xxxxxxxx
 *
 * O con variables de entorno:
 *   TWILIO_ACCOUNT_SID=ACxxx TWILIO_AUTH_TOKEN=xxx node create_twilio_template_t12.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

const https = require('https');

// ── Credenciales ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}

const ACCOUNT_SID = getArg('--account-sid') || process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN  = getArg('--auth-token')  || process.env.TWILIO_AUTH_TOKEN;

if (!ACCOUNT_SID || !AUTH_TOKEN) {
  console.error('❌ Credenciales Twilio requeridas:');
  console.error('   --account-sid ACxxxxxxxx --auth-token xxxxxxxx');
  console.error('   O: TWILIO_ACCOUNT_SID=xxx TWILIO_AUTH_TOKEN=xxx node ...');
  process.exit(1);
}

const BASE_AUTH = Buffer.from(ACCOUNT_SID + ':' + AUTH_TOKEN).toString('base64');

// ── Twilio API helper ─────────────────────────────────────────────────────────
function twilioPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: 'content.twilio.com',
      path,
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + BASE_AUTH,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch(e) { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── Template definition ───────────────────────────────────────────────────────
const T12_REENGAGEMENT = {
  friendly_name: 'T12_reengagement',
  language: 'es',
  types: {
    'twilio/quick-reply': {
      body: 'Hola {{1}}! ⏰ Aún tienes horarios disponibles para tu cita dental 🦷.\n¿Agendamos ahora?',
      actions: [
        { title: 'Ver horarios',       id: 'ver_horarios' },
        { title: 'Hablar con asesor',  id: 'hablar_asesor' }
      ]
    }
  },
  variables: {
    '1': 'Nombre del paciente (o vacío para saludo genérico)'
  }
};

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log('Creando T12_reengagement...');

  const r = await twilioPost('/v1/Content', T12_REENGAGEMENT);

  if (r.status === 201 || r.status === 200) {
    const sid = r.body.sid;
    console.log(`✅ T12_reengagement creado → ${sid}`);
    console.log('');
    console.log('Guarda este SID en bot_config o en el workflow de re-engagement:');
    console.log(`  "twilio_reengagement_sid": "${sid}"`);
    console.log('');
    console.log('Pasos siguientes:');
    console.log('  1. Aprobar el template en Twilio Console (WhatsApp templates)');
    console.log('     https://console.twilio.com/us1/develop/sms/content-template-builder');
    console.log('  2. Actualizar el nodo "Send via Chatwoot" del workflow Re-engagement');
    console.log('     para usar este SID en R2 cuando la sesión haya expirado');
    return;
  }

  console.error(`❌ Error ${r.status}:`, JSON.stringify(r.body, null, 2));
  console.error('');
  console.error('Posibles causas:');
  console.error('  - Cuenta Twilio trial: los templates requieren aprobación de WhatsApp');
  console.error('  - Texto demasiado largo (body > 1024 chars)');
  console.error('  - Botón title > 20 chars');
})();
