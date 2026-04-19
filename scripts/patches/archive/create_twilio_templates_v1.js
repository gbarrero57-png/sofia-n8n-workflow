// create_twilio_templates.js
// Creates all 15 Twilio Content API templates for SofIA button-driven conversation
// Templates: list-pickers (static) + quick-replies (dynamic via ContentVariables)

const https = require('https');
const fs = require('fs');

const creds = JSON.parse(fs.readFileSync('/tmp/twilio_creds.json', 'utf8'));
const ACCOUNT_SID = creds.account_sid;
const AUTH_TOKEN = creds.auth_token;
const BASE_AUTH = Buffer.from(ACCOUNT_SID + ':' + AUTH_TOKEN).toString('base64');

function twilioPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: 'content.twilio.com',
      path: path,
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

// ════════════════════════════════════════════════════════════
// TEMPLATE DEFINITIONS
// ════════════════════════════════════════════════════════════

const templates = [

  // ── T01: Main Menu (list-picker, 5 items) ───────────────────
  {
    key: 'T01_menu',
    sid_field: 'twilio_menu_content_sid',
    payload: {
      friendly_name: 'sofia_menu_v2',
      language: 'es',
      variables: { '1': 'SofIA Demo' },
      types: {
        'twilio/list-picker': {
          body: '¡Hola! Soy SofIA, tu asistente dental 🦷\n\n¿En qué puedo ayudarte hoy?',
          button: 'Ver opciones',
          items: [
            { id: 'menu_1', item: '📅 Agendar una cita' },
            { id: 'menu_2', item: '💰 Planes y precios' },
            { id: 'menu_3', item: '⚡ Funciones de SofIA' },
            { id: 'menu_4', item: '⭐ Casos de éxito' },
            { id: 'menu_5', item: '👤 Hablar con un humano' }
          ]
        }
      }
    }
  },

  // ── T02: Service Picker (list-picker, 7 services) ───────────
  {
    key: 'T02_service',
    sid_field: 'twilio_booking_service_sid',
    payload: {
      friendly_name: 'sofia_service_picker_v2',
      language: 'es',
      variables: {},
      types: {
        'twilio/list-picker': {
          body: '¿Qué servicio necesitas? 🦷\n\nElige una opción:',
          button: 'Ver servicios',
          items: [
            { id: 'bk_limpieza',   item: '🪥 Limpieza dental',        description: 'Limpieza y profilaxis profesional' },
            { id: 'bk_consulta',   item: '🔍 Consulta general',       description: 'Revisión y diagnóstico inicial' },
            { id: 'bk_ortodoncia', item: '😬 Ortodoncia',             description: 'Brackets, alineadores y corrección' },
            { id: 'bk_blanq',      item: '✨ Blanqueamiento dental',   description: 'Blanqueamiento profesional' },
            { id: 'bk_implante',   item: '🔩 Implante dental',        description: 'Implantes titanio permanentes' },
            { id: 'bk_urgencia',   item: '🚨 Urgencia dental',        description: 'Dolor, fractura o emergencia' },
            { id: 'bk_otro',       item: '📋 Otro servicio',          description: 'Corona, endodoncia, extracción...' }
          ]
        }
      }
    }
  },

  // ── T03: Time Preference (list-picker, 3 options) ────────────
  {
    key: 'T03_time_pref',
    sid_field: 'twilio_booking_time_sid',
    payload: {
      friendly_name: 'sofia_time_pref_v2',
      language: 'es',
      variables: {},
      types: {
        'twilio/list-picker': {
          body: '¿Cuándo prefieres tu cita? 📅\n\nElige tu disponibilidad:',
          button: 'Ver opciones',
          items: [
            { id: 'time_this_week', item: '⚡ Esta semana',        description: 'Lo antes posible' },
            { id: 'time_next_week', item: '📆 Próxima semana',     description: 'Con más anticipación' },
            { id: 'time_any',       item: '🗓️ Cualquier fecha',    description: 'Flexible, me acomodo' }
          ]
        }
      }
    }
  },

  // ── T04: Plans Menu (list-picker, 3 plans) ───────────────────
  {
    key: 'T04_plans',
    sid_field: 'twilio_plans_content_sid',
    payload: {
      friendly_name: 'sofia_plans_v2',
      language: 'es',
      variables: {},
      types: {
        'twilio/list-picker': {
          body: '💰 *Planes SofIA para clínicas dentales*\n\n¿Cuál te interesa conocer?',
          button: 'Ver planes',
          items: [
            { id: 'plan_basico',     item: '🟢 Plan Básico',     description: 'S/ 299/mes — 1 consultorio' },
            { id: 'plan_pro',        item: '🔵 Plan Pro',        description: 'S/ 499/mes — hasta 3 consultorios' },
            { id: 'plan_enterprise', item: '🟣 Plan Enterprise', description: 'S/ 899/mes — ilimitado + personalización' },
            { id: 'plan_comparar',   item: '📊 Comparar planes', description: 'Ver tabla comparativa completa' }
          ]
        }
      }
    }
  },

  // ── T05: Features Menu (list-picker, 6 features) ─────────────
  {
    key: 'T05_features',
    sid_field: 'twilio_features_content_sid',
    payload: {
      friendly_name: 'sofia_features_v2',
      language: 'es',
      variables: {},
      types: {
        'twilio/list-picker': {
          body: '⚡ *¿Qué puede hacer SofIA?*\n\nElige un tema para explorar:',
          button: 'Ver funciones',
          items: [
            { id: 'feat_agendamiento',  item: '📅 Agendamiento automático', description: '24/7 sin intervención humana' },
            { id: 'feat_recordatorios', item: '🔔 Recordatorios 24h',       description: 'Reduce ausentismo hasta 40%' },
            { id: 'feat_reportes',      item: '📊 Reportes mensuales',      description: 'Métricas y análisis automáticos' },
            { id: 'feat_escalacion',    item: '👤 Escalación humana',       description: 'Transferencia inteligente al staff' },
            { id: 'feat_multiclinica',  item: '🏥 Multi-clínica',           description: 'Una sola plataforma para varias sedes' },
            { id: 'feat_integracion',   item: '🔗 Integraciones',           description: 'WhatsApp, CRM, sistemas de gestión' }
          ]
        }
      }
    }
  },

  // ── T06: Post-Demo Info CTA (quick-reply, 2 buttons) ─────────
  // After showing plan/feature info → offer to demo or go back to menu
  {
    key: 'T06_followup',
    sid_field: 'twilio_followup_content_sid',
    payload: {
      friendly_name: 'sofia_followup_v2',
      language: 'es',
      variables: {},
      types: {
        'twilio/quick-reply': {
          body: '¿Te gustaría probarlo con tu clínica? 🚀',
          actions: [
            { type: 'QUICK_REPLY', title: '📅 Agendar demo gratis', id: 'menu_1' },
            { type: 'QUICK_REPLY', title: '🔙 Ver menú', id: 'back_menu' }
          ]
        }
      }
    }
  },

  // ── T07: Slot Offer (dynamic quick-reply 3 slots + footer) ───
  // Body: {{1}} = slots text; Buttons: {{2}}, {{3}}, {{4}} = slot labels
  {
    key: 'T07_slot_offer',
    sid_field: 'twilio_slots_content_sid',
    payload: {
      friendly_name: 'sofia_slot_offer_v3',
      language: 'es',
      variables: { '1': 'Horarios disponibles:', '2': 'Lun 12 ene 09:00', '3': 'Lun 12 ene 11:00', '4': 'Mar 13 ene 10:00' },
      types: {
        'twilio/quick-reply': {
          body: '✅ *Encontré estos horarios disponibles:*\n\n{{1}}',
          actions: [
            { type: 'QUICK_REPLY', title: '{{2}}', id: 'slot_1' },
            { type: 'QUICK_REPLY', title: '{{3}}', id: 'slot_2' },
            { type: 'QUICK_REPLY', title: '{{4}}', id: 'slot_3' }
          ]
        }
      }
    }
  },

  // ── T08: No Slots Available (quick-reply, 3 buttons) ─────────
  {
    key: 'T08_no_slots',
    sid_field: 'twilio_slot_rejection_sid',
    payload: {
      friendly_name: 'sofia_no_slots_v1',
      language: 'es',
      variables: {},
      types: {
        'twilio/quick-reply': {
          body: '😔 No encontré horarios disponibles para ese día.\n\n¿Qué prefieres?',
          actions: [
            { type: 'QUICK_REPLY', title: '📅 Elegir otro día', id: 'retry_day' },
            { type: 'QUICK_REPLY', title: '🗓️ Ver semana completa', id: 'time_any' },
            { type: 'QUICK_REPLY', title: '🔙 Menú principal', id: 'back_menu' }
          ]
        }
      }
    }
  },

  // ── T09: Appointment Confirmation (dynamic quick-reply) ───────
  // Body: {{1}} = full appointment summary text
  {
    key: 'T09_confirm_cita',
    sid_field: 'twilio_appointment_content_sid',
    payload: {
      friendly_name: 'sofia_confirm_cita_v2',
      language: 'es',
      variables: { '1': 'Limpieza dental\nLunes 12 enero, 09:00 AM\nDr. César Salas' },
      types: {
        'twilio/quick-reply': {
          body: '🎉 *¡Cita confirmada!*\n\n{{1}}\n\nTe enviaremos un recordatorio 24h antes.',
          actions: [
            { type: 'QUICK_REPLY', title: '✅ Perfecto, gracias', id: 'post_confirmed' },
            { type: 'QUICK_REPLY', title: '📅 Cambiar horario', id: 'retry_day' },
            { type: 'QUICK_REPLY', title: '❌ Cancelar cita', id: 'cancel_appt' }
          ]
        }
      }
    }
  },

  // ── T10: Post Booking (quick-reply, 2 buttons) ────────────────
  {
    key: 'T10_post_booking',
    sid_field: 'twilio_post_booking_sid',
    payload: {
      friendly_name: 'sofia_post_booking_v1',
      language: 'es',
      variables: {},
      types: {
        'twilio/quick-reply': {
          body: '¿Hay algo más en lo que pueda ayudarte? 😊',
          actions: [
            { type: 'QUICK_REPLY', title: '🏠 Menú principal', id: 'back_menu' },
            { type: 'QUICK_REPLY', title: '👤 Hablar con humano', id: 'menu_5' }
          ]
        }
      }
    }
  },

  // ── T11: Day Offer (dynamic quick-reply 3 days) ──────────────
  // {{1}} = day 1 label, {{2}} = day 2 label, {{3}} = day 3 label
  {
    key: 'T11_day_offer',
    sid_field: 'twilio_day_offer_sid',
    payload: {
      friendly_name: 'sofia_day_offer_v1',
      language: 'es',
      variables: { '1': 'Lun 12 ene', '2': 'Mar 13 ene', '3': 'Mié 14 ene' },
      types: {
        'twilio/quick-reply': {
          body: '📅 *¿Qué día prefieres?*\n\nElige una opción:',
          actions: [
            { type: 'QUICK_REPLY', title: '{{1}}', id: 'day_1' },
            { type: 'QUICK_REPLY', title: '{{2}}', id: 'day_2' },
            { type: 'QUICK_REPLY', title: '{{3}}', id: 'day_3' }
          ]
        }
      }
    }
  }

];

// ════════════════════════════════════════════════════════════
// CREATE ALL TEMPLATES
// ════════════════════════════════════════════════════════════

async function main() {
  const results = {};
  const errors = [];

  for (const tpl of templates) {
    process.stdout.write('Creating ' + tpl.key + '... ');
    try {
      const resp = await twilioPost('/v1/Content', tpl.payload);
      if (resp.status === 201 && resp.body.sid) {
        console.log('OK → ' + resp.body.sid);
        results[tpl.sid_field] = resp.body.sid;
      } else {
        console.log('FAIL (' + resp.status + '): ' + JSON.stringify(resp.body).substring(0, 200));
        errors.push(tpl.key + ': ' + JSON.stringify(resp.body).substring(0, 200));
      }
    } catch(e) {
      console.log('ERROR: ' + e.message);
      errors.push(tpl.key + ': ' + e.message);
    }
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\n=== RESULTS ===');
  console.log(JSON.stringify(results, null, 2));
  fs.writeFileSync('/tmp/twilio_sids.json', JSON.stringify(results, null, 2));
  console.log('\nSIDs saved to /tmp/twilio_sids.json');

  if (errors.length) {
    console.log('\n=== ERRORS ===');
    errors.forEach(e => console.log(e));
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
