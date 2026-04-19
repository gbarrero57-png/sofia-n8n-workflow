/**
 * create_reengagement_templates.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Crea y somete a aprobación de Meta los templates de re-engagement:
 *
 *   T12_reengagement_slots   — R2 cuando teníamos slots ofrecidos
 *   T13_reengagement_generic — R2 genérico (no hay slots guardados)
 *
 * Categoría: UTILITY (mayor tasa de aprobación que MARKETING)
 * Razón: son recordatorios de servicio iniciado por el usuario, no publicidad.
 *
 * Uso: node scripts/patches/archive/create_reengagement_templates.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

const ACCOUNT_SID = 'AC4080780a4b4a7d8e7b107a39f01abad3';
const AUTH_TOKEN  = '6504179bc74222d9da8c8125f20bcfdf';
const AUTH        = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64');

// ── API helpers ───────────────────────────────────────────────────────────────
async function twilioPost(path, body) {
  const r = await fetch(`https://content.twilio.com${path}`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${AUTH}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}

async function submitForApproval(sid, name, category = 'UTILITY') {
  const r = await fetch(`https://content.twilio.com/v1/Content/${sid}/ApprovalRequests`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${AUTH}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, category, allow_category_change: true })
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}

// ── Templates ─────────────────────────────────────────────────────────────────
//
// Reglas Meta para aprobación:
//   - Variables: {{1}}, {{2}} — siempre con ejemplos en el campo variables{}
//   - Botones: máx 20 chars por botón
//   - Cuerpo: sin mayúsculas excesivas, sin URLs que no sean del negocio
//   - Categoría UTILITY: mensaje de seguimiento a interacción iniciada por usuario

const TEMPLATES = [
  {
    // T12: El paciente tuvo slots ofrecidos — los mencionamos implícitamente
    friendly_name: 'sofia_reengagement_slots_v1',
    language: 'es',
    types: {
      'twilio/quick-reply': {
        body: 'Hola {{1}} 👋 Notamos que no terminaste de elegir tu horario en {{2}}.\n\n¿Aún te interesa agendar tu cita dental? Podemos buscarte nuevos horarios disponibles 🦷',
        actions: [
          { title: 'Ver horarios',  id: 'reeng_ver_horarios' },
          { title: 'Ya no, gracias', id: 'reeng_no_gracias' }
        ]
      }
    },
    variables: { '1': 'María', '2': 'Clínica Dental SofIA' }
  },
  {
    // T13: Genérico — no tenemos contexto de slots
    friendly_name: 'sofia_reengagement_generic_v1',
    language: 'es',
    types: {
      'twilio/quick-reply': {
        body: 'Hola {{1}} 👋 En {{2}} queremos ayudarte a agendar tu cita dental.\n\n¿Cuándo te vendría bien venir? Tenemos disponibilidad esta semana 📅',
        actions: [
          { title: 'Agendar ahora',   id: 'reeng_agendar' },
          { title: 'Hablar con asesor', id: 'reeng_asesor' }
        ]
      }
    },
    variables: { '1': 'Carlos', '2': 'Clínica Dental SofIA' }
  },
  {
    // T14: Último intento — tono más urgente / oferta de escalar a humano
    friendly_name: 'sofia_reengagement_final_v1',
    language: 'es',
    types: {
      'twilio/quick-reply': {
        body: 'Hola {{1}}, es nuestro último mensaje 😊\n\nSi en algún momento quieres agendar tu cita en {{2}}, aquí estaremos. ¿Te conectamos con un asesor ahora?',
        actions: [
          { title: 'Sí, conectarme',  id: 'reeng_conectar' },
          { title: 'No por ahora',    id: 'reeng_no_ahora' }
        ]
      }
    },
    variables: { '1': 'Ana', '2': 'Clínica Dental SofIA' }
  }
];

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════');
console.log('  Twilio Templates — Re-engagement (Meta Approval)');
console.log('═══════════════════════════════════════════════════════════\n');

const results = {};

for (const tpl of TEMPLATES) {
  process.stdout.write(`Creando ${tpl.friendly_name}... `);

  // 1. Crear template
  const created = await twilioPost('/v1/Content', {
    friendly_name: tpl.friendly_name,
    language: tpl.language,
    types: tpl.types,
    variables: tpl.variables
  });

  if (created.status !== 201 && created.status !== 200) {
    console.log(`❌ Error ${created.status}: ${JSON.stringify(created.body).slice(0,120)}`);
    continue;
  }

  const sid = created.body.sid;
  console.log(`OK → ${sid}`);

  // 2. Someter a aprobación de Meta
  process.stdout.write(`  Submitting to Meta for approval (UTILITY)... `);
  const approval = await submitForApproval(sid, tpl.friendly_name, 'UTILITY');

  if (approval.status === 200 || approval.status === 201) {
    const approvalStatus = approval.body?.status ?? approval.body?.approval_status ?? 'submitted';
    console.log(`✅ ${approvalStatus}`);
    results[tpl.friendly_name] = { sid, approval_status: approvalStatus };
  } else {
    console.log(`⚠️  ${approval.status}: ${JSON.stringify(approval.body).slice(0,120)}`);
    results[tpl.friendly_name] = { sid, approval_status: 'submission_failed', error: approval.body };
  }
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  RESULTADOS');
console.log('═══════════════════════════════════════════════════════════');
for (const [name, r] of Object.entries(results)) {
  console.log(`  ${name}`);
  console.log(`    SID:    ${r.sid}`);
  console.log(`    Status: ${r.approval_status}`);
}

console.log('\n  📋 Próximos pasos:');
console.log('  1. Meta revisa en 24-48h (a veces minutos)');
console.log('  2. Revisar estado en: https://console.twilio.com/us1/develop/sms/content-template-builder');
console.log('  3. Una vez aprobados, actualizar el workflow de re-engagement');
console.log('     para usar los SIDs en R2 en lugar del mensaje de texto libre');
console.log('═══════════════════════════════════════════════════════════\n');
