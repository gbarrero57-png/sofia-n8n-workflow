/**
 * create_lead_welcome_template.mjs
 * ──────────────────────────────────────────────────────────────────────────
 * Crea y envía a aprobación Meta la plantilla de WhatsApp para nuevos leads.
 *
 * Uso:
 *   TWILIO_AUTH_TOKEN=xxxx node scripts/create_lead_welcome_template.mjs
 *
 * Una vez aprobada, copia el ContentSid y ejecuta:
 *   node scripts/patch_lead_welcome_sid.mjs <SID>
 * ──────────────────────────────────────────────────────────────────────────
 */

const ACCOUNT_SID = 'AC4080780a4b4a7d8e7b107a39f01abad3';
const AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
if (!AUTH_TOKEN) {
  console.error('❌ Falta TWILIO_AUTH_TOKEN');
  console.error('   Obtenerlo en: https://console.twilio.com → Account Info → Auth Token');
  process.exit(1);
}
const AUTH = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64');

async function post(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: r.status, data: await r.json() };
}

// ── Template content ───────────────────────────────────────────────────────
// {{1}} = nombre del lead (ej: "Pedro")
// Categoría UTILITY: es una respuesta a una consulta iniciada por el usuario
// (rellenó el formulario de lead), mayor tasa de aprobación que MARKETING

const template = {
  friendly_name: 'sofia_lead_welcome_v1',
  language: 'es',
  variables: { '1': 'Pedro' },
  types: {
    'twilio/quick-reply': {
      body: `Hola {{1}} 👋 Soy Gabriel de *RedSoluciones TI*.\n\nVi que te interesó *SofIA* — la IA que agenda citas dentales por WhatsApp de forma automática.\n\n✅ Atiende pacientes 24/7\n✅ Agenda y confirma citas sola\n✅ Sin cambiar tu número actual\n\n¿Tienes 15 min esta semana para una demo gratis?`,
      actions: [
        { title: 'Ver demo ahora', id: 'demo_si' },
        { title: 'Más información', id: 'demo_info' }
      ]
    }
  }
};

console.log('Creando template sofia_lead_welcome_v1...');
const { status: s1, data: d1 } = await post('https://content.twilio.com/v1/Content', template);
console.log('Create status:', s1);

if (!d1.sid) {
  console.error('❌ Error al crear template:', JSON.stringify(d1));
  process.exit(1);
}

const SID = d1.sid;
console.log('✅ Template creado:', SID);

// Submit to Meta for approval
console.log('Enviando a aprobación Meta...');
const { status: s2, data: d2 } = await post(
  `https://content.twilio.com/v1/Content/${SID}/ApprovalRequests/whatsapp`,
  { name: 'sofia_lead_welcome_v1', category: 'UTILITY' }
);
console.log('Approval status:', s2);

if (s2 === 200 || s2 === 201) {
  console.log('✅ Enviado a Meta para aprobación');
  console.log('   Estado actual:', d2.status);
  console.log('');
  console.log('=== PRÓXIMO PASO ===');
  console.log('Cuando Meta apruebe (1-3 días hábiles), ejecuta:');
  console.log(`   node scripts/patch_lead_welcome_sid.mjs ${SID}`);
} else {
  console.error('❌ Error en aprobación:', JSON.stringify(d2));
}
