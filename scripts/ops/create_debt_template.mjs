/**
 * create_debt_template.mjs
 * Crea T15: recordatorio de deuda pendiente para paciente (sin botones).
 * Plantilla simple con 3 variables → aprobación Meta más rápida.
 *
 * Run: node scripts/ops/create_debt_template.mjs
 */

const ACCOUNT = 'AC4080780a4b4a7d8e7b107a39f01abad3';
const TOKEN   = '310d11c181fa818864175346ccb3f948';

const AUTH = Buffer.from(`${ACCOUNT}:${TOKEN}`).toString('base64');

async function createTemplate(name, body, variables) {
  const r = await fetch('https://content.twilio.com/v1/Content', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${AUTH}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      friendly_name: name,
      language: 'es',
      variables,
      types: {
        'twilio/text': { body },
      },
    }),
  });
  const d = await r.json();
  if (!r.ok) { console.error('Error:', d); return null; }
  return d;
}

async function approveTemplate(sid) {
  const r = await fetch(`https://content.twilio.com/v1/Content/${sid}/ApprovalRequests/whatsapp`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${AUTH}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: 'sofia_recordatorio_deuda_v1', category: 'UTILITY' }),
  });
  return r.json();
}

console.log('\n=== Crear template T15: recordatorio de deuda ===\n');

// T15 — recordatorio de deuda (sin botones, 3 variables)
const t15 = await createTemplate(
  'sofia_recordatorio_deuda_v1',
  'Hola {{1}}, te recordamos que tienes un pago pendiente de {{2}} en {{3}}. ' +
  'Para coordinar el pago, responde a este mensaje y un asesor te atenderá. Gracias.',
  { '1': 'Nombre paciente', '2': 'S/ 150.00', '3': 'Clínica SofIA' },
);

if (!t15) { console.log('❌ Error creando T15'); process.exit(1); }
console.log(`✅ T15 creado: ${t15.sid}`);
console.log(`   Friendly name: ${t15.friendly_name}`);

console.log('\nEnviando a aprobación Meta (UTILITY)...');
const approval = await approveTemplate(t15.sid);
console.log(`   Aprobación: ${JSON.stringify(approval.status ?? approval)}`);

console.log('\n=== RESULTADO ===');
console.log(`T15 debt_reminder  SID: ${t15.sid}`);
console.log('\n⚠️  Agrega este SID al seed de cada clínica:');
console.log(`  twilio_debt_reminder_sid: '${t15.sid}'`);
console.log('\nEjecuta seed_admin_notify.mjs actualizado para guardarlo en bot_config.\n');
