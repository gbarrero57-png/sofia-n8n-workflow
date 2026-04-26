/**
 * create_r6_templates.mjs
 * Round 6 — elimina los 3 templates R5 rechazados y crea T12/T13/T14 con:
 *   - language: es_MX  (Meta bucket diferente a "es" — evita el error "already Spanish content")
 *   - category: UTILITY
 *
 * T12 — Admin: nueva cita agendada (quick-reply, 3 vars)
 * T13 — Paciente: cita confirmada  (text, 2 vars)
 * T14 — Paciente: cita cancelada   (text, 2 vars)
 *
 * Run: node scripts/ops/create_r6_templates.mjs
 */

const ACCOUNT_SID = 'AC4080780a4b4a7d8e7b107a39f01abad3';
const AUTH_TOKEN  = '310d11c181fa818864175346ccb3f948';
const BASE_AUTH   = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64');

// ── Round 5 rejected SIDs to delete ──────────────────────────────────────────
const R5_TO_DELETE = [
  { sid: 'HXc72bba25e2d23fd4214fe51c00fee1fd', name: 'cita_admin_nueva_r5' },
  { sid: 'HXc5366dabdcc7b19ff8fad7fa3c2d9db2', name: 'cita_pac_confirm_r5' },
  { sid: 'HXea157b1ec5a297fc30dd26d018790424', name: 'cita_pac_cancel_r5'  },
];

// ── R6 templates to create ────────────────────────────────────────────────────
const R6_TEMPLATES = [

  // T12 — Admin: nueva cita agendada (quick-reply, 3 vars)
  {
    key: 'T12_admin_new_appt',
    payload: {
      friendly_name: 'dental_admin_appt_v1',
      language: 'es_MX',
      variables: {
        '1': 'Juan Pérez',
        '2': 'lunes 28 abril 10:00',
        '3': '+51912345678'
      },
      types: {
        'twilio/quick-reply': {
          body: 'SofIA agendó una consulta dental.\n\nPaciente: {{1}}\nFecha: {{2}}\nTelefono: {{3}}\n\nAccione para confirmar o cancelar.',
          actions: [
            { title: 'Confirmar turno', id: 'confirm_appt' },
            { title: 'Cancelar turno',  id: 'cancel_appt'  }
          ]
        }
      }
    }
  },

  // T13 — Paciente: cita confirmada (text, 2 vars)
  {
    key: 'T13_patient_confirmed',
    payload: {
      friendly_name: 'dental_pac_confirmada_v1',
      language: 'es_MX',
      variables: {
        '1': 'Juan',
        '2': 'lunes 28 abril a las 10:00'
      },
      types: {
        'twilio/text': {
          body: 'Hola {{1}}, tu consulta dental del {{2}} fue confirmada. Te esperamos puntual.'
        }
      }
    }
  },

  // T14 — Paciente: cita cancelada (text, 2 vars)
  {
    key: 'T14_patient_cancelled',
    payload: {
      friendly_name: 'dental_pac_cancelada_v1',
      language: 'es_MX',
      variables: {
        '1': 'Juan',
        '2': 'lunes 28 abril a las 10:00'
      },
      types: {
        'twilio/text': {
          body: 'Hola {{1}}, lamentamos que tu consulta dental del {{2}} no pudo confirmarse. Escribenos para reagendar.'
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
console.log('  Round 6 Twilio Templates — delete R5 + create R6');
console.log('══════════════════════════════════════════════════════\n');

// Step 1: Delete R5 rejected templates
console.log('── Step 1: Deleting Round 5 rejected templates ─────────\n');
for (const { sid, name } of R5_TO_DELETE) {
  process.stdout.write(`  Deleting ${name} (${sid})... `);
  const status = await twilioDelete(sid);
  if (status === 204) {
    console.log('✅ Deleted');
  } else if (status === 404) {
    console.log('⚠️  Not found (already deleted or wrong SID)');
  } else {
    console.log(`❌ Unexpected status ${status}`);
  }
}

// Step 2: Create R6 templates
console.log('\n── Step 2: Creating Round 6 templates ──────────────────\n');

const results = {};
let allCreated = true;

for (const { key, payload } of R6_TEMPLATES) {
  process.stdout.write(`  Creating ${key} (${payload.friendly_name})... `);
  const { status, data } = await twilioCreate(payload);
  if (status === 201) {
    console.log(`✅ SID: ${data.sid}`);
    results[key] = { sid: data.sid, friendly_name: payload.friendly_name, status: 'created' };
  } else {
    console.log(`❌ Error ${status}: ${JSON.stringify(data).slice(0, 200)}`);
    results[key] = { sid: null, friendly_name: payload.friendly_name, status: 'failed', error: JSON.stringify(data).slice(0, 200) };
    allCreated = false;
  }
}

if (!allCreated) {
  console.log('\n❌ Some templates failed to create. Fix errors above before approving.\n');
  process.exit(1);
}

// Step 3: Submit approval requests
console.log('\n── Step 3: Submitting WhatsApp approval requests ───────\n');

for (const [key, info] of Object.entries(results)) {
  if (!info.sid) continue;
  process.stdout.write(`  Approving ${key} (${info.sid})... `);
  const { status, data } = await twilioApprove(info.sid, info.friendly_name);
  if (status === 200 || status === 201) {
    const approvalStatus = data.status ?? data.whatsapp?.status ?? 'submitted';
    console.log(`✅ Approval status: ${approvalStatus}`);
    results[key].approval_status = approvalStatus;
  } else {
    console.log(`⚠️  Approval response ${status}: ${JSON.stringify(data).slice(0, 200)}`);
    results[key].approval_status = `error_${status}`;
  }
}

// Step 4: Summary
console.log('\n══════════════════════════════════════════════════════');
console.log('  SUMMARY — Round 6 Template SIDs');
console.log('══════════════════════════════════════════════════════\n');

const fieldMap = {
  T12_admin_new_appt:    'twilio_admin_appt_sid  (T12)',
  T13_patient_confirmed: 'twilio_pac_confirmed_sid (T13)',
  T14_patient_cancelled: 'twilio_pac_cancelada_sid (T14)'
};

for (const [key, info] of Object.entries(results)) {
  const label = fieldMap[key] || key;
  console.log(`  ${label}`);
  console.log(`    SID:      ${info.sid}`);
  console.log(`    Approval: ${info.approval_status ?? 'n/a'}`);
  console.log('');
}

console.log('Guarda estos SIDs en bot_config de cada clínica:');
console.log('');
for (const [key, info] of Object.entries(results)) {
  if (!info.sid) continue;
  const field = {
    T12_admin_new_appt:    'twilio_admin_appt_sid',
    T13_patient_confirmed: 'twilio_pac_confirmed_sid',
    T14_patient_cancelled: 'twilio_pac_cancelada_sid'
  }[key] || key;
  console.log(`  "${field}": "${info.sid}"`);
}

console.log('\n⚠️  Meta approval takes 24-72h. Monitor status at:');
console.log('  https://console.twilio.com/us1/develop/sms/content-template-builder\n');
