/**
 * create_r7_templates.mjs
 * Round 7 — elimina R6 rechazados, crea T12/T13/T14 con estrategia diferente:
 *   - language: es_419  (Latin American Spanish — bucket distinto a es/es_MX)
 *   - T12: text-only (sin botones — los botones tienen texto genérico que Meta bloquea)
 *   - T13/T14: 3 variables (agrega nombre de clínica para mayor unicidad)
 *   - Nombres únicos con sufijo _r7 y contenido más específico/branded
 *   - Categoría UTILITY
 *
 * Run: node scripts/ops/create_r7_templates.mjs
 */

const ACCOUNT_SID = 'AC4080780a4b4a7d8e7b107a39f01abad3';
const AUTH_TOKEN  = '310d11c181fa818864175346ccb3f948';
const BASE_AUTH   = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64');

// ── Round 6 rejected SIDs to delete ──────────────────────────────────────────
const R6_TO_DELETE = [
  { sid: 'HX4f53d427488783a57ccf385081a84603', name: 'dental_admin_appt_v1' },
  { sid: 'HX6c083267fbe27e33544d8bf0280b274f', name: 'dental_pac_confirmada_v1' },
  { sid: 'HX10a94d9595014e5510e425b7ed7e6db4', name: 'dental_pac_cancelada_v1' },
];

// ── R7 templates to create ────────────────────────────────────────────────────
const R7_TEMPLATES = [

  // T12 — Admin: nueva cita agendada (text-only, 4 vars)
  // Sin botones: los botones con texto fijo disparan falsos positivos en Meta.
  // 4 variables: paciente, fecha, teléfono, clínica → alta unicidad
  {
    key: 'T12_admin_new_appt',
    payload: {
      friendly_name: 'sofia_notif_cita_r7',
      language: 'es_ES',
      variables: {
        '1': 'Juan Pérez',
        '2': 'lunes 28 abr 10:00 am',
        '3': '+51912345678',
        '4': 'Clínica SofIA'
      },
      types: {
        'twilio/text': {
          body: 'Nueva cita registrada en SofIA.\n\nPaciente: {{1}}\nFecha: {{2}}\nCelular: {{3}}\nClínica: {{4}}\n\nRevisa y gestiona desde tu panel de administración.'
        }
      }
    }
  },

  // T13 — Paciente: cita confirmada (text, 3 vars)
  {
    key: 'T13_patient_confirmed',
    payload: {
      friendly_name: 'sofia_cita_ok_r7',
      language: 'es_ES',
      variables: {
        '1': 'Juan',
        '2': 'lunes 28 de abril a las 10:00 am',
        '3': 'Clínica SofIA'
      },
      types: {
        'twilio/text': {
          body: '¡Listo, {{1}}! Tu cita en {{3}} quedó confirmada para el {{2}}. Te esperamos. Ante cualquier cambio, responde este mensaje.'
        }
      }
    }
  },

  // T14 — Paciente: cita cancelada (text, 3 vars)
  {
    key: 'T14_patient_cancelled',
    payload: {
      friendly_name: 'sofia_cita_cancel_r7',
      language: 'es_ES',
      variables: {
        '1': 'Juan',
        '2': 'lunes 28 de abril a las 10:00 am',
        '3': 'Clínica SofIA'
      },
      types: {
        'twilio/text': {
          body: 'Hola {{1}}, tu cita en {{3}} programada para el {{2}} fue cancelada. Si deseas reagendar, responde este mensaje y te ayudamos.'
        }
      }
    }
  }
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function twilioDelete(sid) {
  const res = await fetch(`https://content.twilio.com/v1/Content/${sid}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Basic ${BASE_AUTH}` }
  });
  return res.status;
}

async function twilioCreate(payload) {
  const res = await fetch('https://content.twilio.com/v1/Content', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${BASE_AUTH}`,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function twilioApprove(sid, friendly_name) {
  const res = await fetch(`https://content.twilio.com/v1/Content/${sid}/ApprovalRequests/whatsapp`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${BASE_AUTH}`,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify({ name: friendly_name, category: 'UTILITY' })
  });
  const data = await res.json();
  return { status: res.status, data };
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════');
console.log('  Round 7 Twilio Templates — delete R6 + create R7');
console.log('  Strategy: es_419 + text-only T12 + 3 vars T13/T14');
console.log('══════════════════════════════════════════════════════\n');

// Step 1: Delete R6 rejected templates
console.log('── Step 1: Deleting Round 6 rejected templates ─────────\n');
for (const { sid, name } of R6_TO_DELETE) {
  process.stdout.write(`  Deleting ${name} (${sid.slice(0, 12)}...)... `);
  const status = await twilioDelete(sid);
  if (status === 204)      console.log('✅ Deleted');
  else if (status === 404) console.log('⚠️  Not found (already deleted)');
  else                     console.log(`❌ Unexpected status ${status}`);
}

// Step 2: Create R7 templates
console.log('\n── Step 2: Creating Round 7 templates ──────────────────\n');

const results = {};
let allCreated = true;

for (const { key, payload } of R7_TEMPLATES) {
  process.stdout.write(`  Creating ${key} (${payload.friendly_name}, ${payload.language})... `);
  const { status, data } = await twilioCreate(payload);
  if (status === 201) {
    console.log(`✅ SID: ${data.sid}`);
    results[key] = { sid: data.sid, friendly_name: payload.friendly_name, status: 'created' };
  } else {
    console.log(`❌ Error ${status}: ${JSON.stringify(data).slice(0, 250)}`);
    results[key] = { sid: null, friendly_name: payload.friendly_name, status: 'failed', error: JSON.stringify(data).slice(0, 250) };
    allCreated = false;
  }
}

if (!allCreated) {
  console.log('\n❌ Algunos templates fallaron. Revisa los errores arriba.\n');
  process.exit(1);
}

// Step 3: Submit approval requests
console.log('\n── Step 3: Submitting WhatsApp approval requests ───────\n');

for (const [key, info] of Object.entries(results)) {
  if (!info.sid) continue;
  process.stdout.write(`  Approving ${key} (${info.sid.slice(0, 12)}...)... `);
  const { status, data } = await twilioApprove(info.sid, info.friendly_name);
  if (status === 200 || status === 201) {
    const approvalStatus = data.status ?? data.whatsapp?.status ?? 'submitted';
    console.log(`✅ Approval status: ${approvalStatus}`);
    results[key].approval_status = approvalStatus;
  } else {
    console.log(`⚠️  Approval response ${status}: ${JSON.stringify(data).slice(0, 250)}`);
    results[key].approval_status = `error_${status}`;
  }
}

// Step 4: Summary
console.log('\n══════════════════════════════════════════════════════');
console.log('  SUMMARY — Round 7 Template SIDs');
console.log('══════════════════════════════════════════════════════\n');

for (const [key, info] of Object.entries(results)) {
  console.log(`  ${key}`);
  console.log(`    friendly_name: ${info.friendly_name}`);
  console.log(`    SID:           ${info.sid}`);
  console.log(`    Approval:      ${info.approval_status ?? 'n/a'}`);
  console.log('');
}

console.log('Cuando todos sean "received", actualiza seed_admin_notify.mjs con los nuevos SIDs.');
console.log('');
const sidsForSeed = {
  twilio_admin_new_appt_sid:    results['T12_admin_new_appt']?.sid,
  twilio_patient_confirmed_sid: results['T13_patient_confirmed']?.sid,
  twilio_patient_cancelled_sid: results['T14_patient_cancelled']?.sid,
};
console.log('const TEMPLATE_SIDS = {');
for (const [k, v] of Object.entries(sidsForSeed)) {
  if (v) console.log(`  ${k}: '${v}',`);
}
console.log('};\n');
console.log('⚠️  Meta approval tarda 24-72h.\n');
