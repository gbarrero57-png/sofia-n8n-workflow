/**
 * create_admin_notification_templates.mjs
 * Crea los templates T12, T13, T14 en Twilio Content API para notificaciones admin.
 *
 * T12 - Admin: nueva cita agendada (quick-reply + URL button)
 * T13 - Paciente: cita confirmada
 * T14 - Paciente: cita cancelada + slots disponibles (quick-reply dinámico)
 *
 * Run: node scripts/ops/create_admin_notification_templates.mjs
 */

const ACCOUNT_SID = 'AC4080780a4b4a7d8e7b107a39f01abad3';
const AUTH_TOKEN  = '3151687eb79db7a281651d7e1670c0b6';
const BASE_AUTH   = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64');

async function twilioPost(body) {
  const res = await fetch('https://content.twilio.com/v1/Content', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${BASE_AUTH}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  return { status: res.status, data };
}

const templates = [

  // ── T12: Admin — nueva cita agendada ────────────────────────────────────────
  // quick-reply con 2 botones de acción + 1 botón URL al panel admin
  {
    key: 'T12_admin_new_appt',
    payload: {
      friendly_name: 'sofia_admin_new_appt_v1',
      language: 'es',
      variables: {
        '1': 'Juan Pérez',
        '2': '+51999000111',
        '3': 'viernes 25 de abril',
        '4': '09:30 a.m.',
        '5': 'Limpieza dental',
        '6': 'Dr. César Salas',
        '7': 'Vía bot',
        '8': 'a1b2c3d4'
      },
      types: {
        'twilio/quick-reply': {
          body: '🆕 *Nueva cita agendada*\n\n👤 *{{1}}*\n📞 {{2}}\n📅 {{3}} · {{4}}\n🦷 {{5}}\n👨‍⚕️ {{6}}\n📌 {{7}}\n\n_ref: {{8}}_',
          actions: [
            { title: '✅ Confirmar', id: 'admin_confirm' },
            { title: '❌ Cancelar',  id: 'admin_cancel'  }
          ]
        }
      }
    }
  },

  // ── T13: Paciente — cita confirmada ─────────────────────────────────────────
  {
    key: 'T13_patient_confirmed',
    payload: {
      friendly_name: 'sofia_patient_appt_confirmed_v1',
      language: 'es',
      variables: {
        '1': 'Juan',
        '2': 'viernes 25 de abril',
        '3': '09:30 a.m.',
        '4': 'Clínica Demo'
      },
      types: {
        'twilio/text': {
          body: '✅ *Tu cita fue confirmada*\n\nHola {{1}}, tu cita del *{{2}}* a las *{{3}}* en {{4}} está confirmada.\n\n¡Te esperamos! 😊'
        }
      }
    }
  },

  // ── T14: Paciente — cita cancelada + nuevos slots ────────────────────────────
  // Igual que T07 (slot offer) pero con mensaje de cancelación en el body
  {
    key: 'T14_patient_cancelled_rebook',
    payload: {
      friendly_name: 'sofia_patient_appt_cancelled_v1',
      language: 'es',
      variables: {
        '1': 'Juan',
        '2': 'viernes 25 de abril',
        '3': 'sáb 26 abr · 09:00',
        '4': 'sáb 26 abr · 10:00',
        '5': 'lun 28 abr · 09:00'
      },
      types: {
        'twilio/quick-reply': {
          body: '😔 *Tu cita fue cancelada*\n\nHola {{1}}, tu cita del *{{2}}* fue cancelada por la clínica.\n\nTenemos estos horarios disponibles:',
          actions: [
            { title: '{{3}}', id: 'rebook_slot_1' },
            { title: '{{4}}', id: 'rebook_slot_2' },
            { title: '{{5}}', id: 'rebook_slot_3' }
          ]
        }
      }
    }
  }
];

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('\n=== Creando templates admin notifications ===\n');

const results = {};

for (const tmpl of templates) {
  process.stdout.write(`Creando ${tmpl.key}... `);
  const { status, data } = await twilioPost(tmpl.payload);
  if (status === 201) {
    console.log(`✅ SID: ${data.sid}`);
    results[tmpl.key] = data.sid;
  } else {
    console.log(`❌ Error ${status}:`, JSON.stringify(data).slice(0, 200));
  }
}

console.log('\n=== Resultado ===\n');
console.log('Guarda estos SIDs en bot_config de cada clínica:\n');
for (const [key, sid] of Object.entries(results)) {
  const field = {
    T12_admin_new_appt:         'twilio_admin_new_appt_sid',
    T13_patient_confirmed:      'twilio_patient_confirmed_sid',
    T14_patient_cancelled_rebook: 'twilio_patient_cancelled_sid'
  }[key] || key;
  console.log(`  ${field}: "${sid}"`);
}

if (Object.keys(results).length === 3) {
  console.log('\n✅ Todos los templates creados.\n');
  console.log('Siguiente paso: actualizar bot_config en Supabase con los SIDs');
  console.log('  UPDATE clinics SET bot_config = bot_config || \'{"twilio_admin_new_appt_sid":"...", ...}\'::jsonb');
  console.log('  WHERE id = \'c6c15fca-d7fc-4d98-83c1-2c5cb5a6bef1\';\n');
} else {
  console.log('\n⚠️  Algunos templates fallaron. Revisar errores arriba.\n');
  process.exit(1);
}
