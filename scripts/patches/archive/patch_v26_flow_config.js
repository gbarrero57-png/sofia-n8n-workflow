// patch_v26_flow_config.js — Save conversion-optimized demo_flow_config to Supabase
// Flow uses LP3/LP4/LP5 templates with pos_1..pos_5 IDs for routing
// Admins can edit this JSON in Supabase to customize the conversation flow

const https = require('https');
const fs = require('fs');
const sbEnv = fs.readFileSync('c:/Users/Barbara/Documents/n8n_workflow_claudio/saas/.env', 'utf8');
const SUPABASE_KEY = sbEnv.match(/SUPABASE_SERVICE_KEY=(.+)/)[1].trim();
const DEMO_CLINIC_ID = 'c6c15fca-d7fc-4d98-83c1-2c5cb5a6bef1';

function sbReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'inhyrrjidhzrbqecnptn.supabase.co', port: 443, path, method,
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json', 'Prefer': 'return=representation',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(d); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEMO FLOW CONFIG — Full conversion-optimized conversation graph
// Each node has: type (lp3/lp4/lp5), body text, and options with pos IDs
// Special actions: _HUMAN (escalate), _CREATE_EVENT (book real appt), _LEAD_CAPTURE
// ═══════════════════════════════════════════════════════════════════════════════
const DEMO_FLOW_CONFIG = {
  start_node: "bienvenida",
  catch_all_node: "bienvenida",
  nodes: {

    // ── F0: Bienvenida ────────────────────────────────────────────────────────
    "bienvenida": {
      "type": "lp4",
      "body": "\u00a1Hola! \ud83d\udc4b Soy *SofIA*, la IA que automatiza tu cl\u00ednica dental.\n\n\u2705 Agenda citas 24/7\n\u2705 Responde con IA\n\u2705 Env\u00eda recordatorios\n\u2705 Reportes mensuales\n\n\u00bfQu\u00e9 te gustar\u00eda explorar?",
      "options": [
        { "id": "pos_1", "label": "\u26a1 C\u00f3mo funciona SofIA", "next": "como_funciona" },
        { "id": "pos_2", "label": "\ud83d\udcb0 Planes y precios", "next": "precios" },
        { "id": "pos_3", "label": "\ud83d\udcc5 Agendar cita ahora", "next": null, "action": "_CREATE_EVENT" },
        { "id": "pos_4", "label": "\ud83e\udd1d Hablar con un asesor", "next": null, "action": "_HUMAN" }
      ]
    },

    // ── F1: Cómo funciona ─────────────────────────────────────────────────────
    "como_funciona": {
      "type": "lp4",
      "body": "*SofIA automatiza lo repetitivo* para que tu equipo atienda lo que realmente importa:\n\n\ud83d\udcc5 Agenda citas sola, 24 horas al d\u00eda\n\ud83e\udd16 Responde preguntas con IA real\n\ud83d\udd14 Env\u00eda recordatorios 24h antes\n\ud83d\udcca Te da reportes mensuales autom\u00e1ticos\n\n\u00bfQu\u00e9 parte quieres conocer mejor?",
      "options": [
        { "id": "pos_1", "label": "\ud83d\udcc5 El agendamiento autom\u00e1tico", "next": "info_agenda" },
        { "id": "pos_2", "label": "\ud83e\udd16 Las respuestas con IA", "next": "info_responde" },
        { "id": "pos_3", "label": "\ud83d\udd14 Recordatorios y reportes", "next": "info_recordatorios" },
        { "id": "pos_4", "label": "\ud83d\udcb0 Ver planes y precios", "next": "precios" }
      ]
    },

    "info_agenda": {
      "type": "lp3",
      "body": "\ud83d\udcc5 *Agendamiento autom\u00e1tico*\n\nTu paciente escribe \u201cquiero una cita\u201d \u2192 SofIA revisa tu calendario \u2192 ofrece 3 horarios como botones \u2192 el paciente elige \u2192 cita confirmada.\n\n\ud83d\udca1 *Sin una sola llamada. Funciona mientras duermes.*\n\n\u00bfQuieres probarlo ahora mismo con una cita real?",
      "options": [
        { "id": "pos_1", "label": "\ud83d\udcc5 S\u00ed, agendar una cita real", "next": null, "action": "_CREATE_EVENT" },
        { "id": "pos_2", "label": "\ud83d\udcb0 Ver planes y precios", "next": "precios" },
        { "id": "pos_3", "label": "\ud83d\udd19 Ver m\u00e1s funciones", "next": "como_funciona" }
      ]
    },

    "info_responde": {
      "type": "lp3",
      "body": "\ud83e\udd16 *Respuestas con IA real*\n\nSofIA conoce tu cl\u00ednica: servicios, horarios, precios, doctores. Responde en lenguaje natural, entiende contexto, y el *90% de preguntas se resuelven solas*.\n\nCuando alguien necesita un humano, escala autom\u00e1ticamente con alerta a tu equipo.",
      "options": [
        { "id": "pos_1", "label": "\ud83d\udcb0 Ver planes y precios", "next": "precios" },
        { "id": "pos_2", "label": "\ud83d\udcc5 Probar el agendamiento", "next": "info_agenda" },
        { "id": "pos_3", "label": "\ud83d\udd19 Ver m\u00e1s funciones", "next": "como_funciona" }
      ]
    },

    "info_recordatorios": {
      "type": "lp3",
      "body": "\ud83d\udd14 *Recordatorios que reducen cancelaciones*\n\nSofIA env\u00eda un mensaje 24h antes con nombre del paciente, hora y doctor. *Reduce hasta 40% las inasistencias.*\n\n\ud83d\udcca *Reportes mensuales:* total de conversaciones, citas agendadas, preguntas frecuentes y tasa de resoluci\u00f3n IA \u2014 en tu correo cada mes.",
      "options": [
        { "id": "pos_1", "label": "\ud83d\udcb0 Ver planes y precios", "next": "precios" },
        { "id": "pos_2", "label": "\ud83d\udcc5 Probar el agendamiento", "next": "info_agenda" },
        { "id": "pos_3", "label": "\ud83d\udd19 Men\u00fa principal", "next": "bienvenida" }
      ]
    },

    // ── F2: Precios ───────────────────────────────────────────────────────────
    "precios": {
      "type": "lp5",
      "body": "\ud83d\udcb0 *Planes de SofIA AI*\n\n\ud83d\udfe2 *B\u00e1sico* \u2014 S/.299/mes \u2014 500 conversaciones\n\ud83d\udd35 *Pro* \u2014 S/.499/mes \u2014 1,500 conversaciones \u2b50\n\ud83d\udfe3 *Enterprise* \u2014 desde S/.799/mes \u2014 ilimitadas\n\n_Sin contrato. Cancela cuando quieras._\n\n\u00bfCu\u00e1l quieres conocer?",
      "options": [
        { "id": "pos_1", "label": "\ud83d\udfe2 Plan B\u00e1sico \u2014 S/.299/mes", "next": "precio_basico" },
        { "id": "pos_2", "label": "\ud83d\udd35 Plan Pro \u2014 S/.499/mes \u2b50", "next": "precio_pro" },
        { "id": "pos_3", "label": "\ud83d\udfe3 Enterprise \u2014 S/.799+/mes", "next": "precio_enterprise" },
        { "id": "pos_4", "label": "\ud83d\udccb Comparar todos", "next": "precio_comparar" },
        { "id": "pos_5", "label": "\u26a1 Ver c\u00f3mo funciona", "next": "como_funciona" }
      ]
    },

    "precio_basico": {
      "type": "lp3",
      "body": "\ud83d\udfe2 *Plan B\u00e1sico \u2014 S/.299/mes*\n\n\u2705 Agendamiento autom\u00e1tico 24/7\n\u2705 IA para preguntas frecuentes\n\u2705 Base de conocimiento personalizada\n\u2705 1 WhatsApp + panel incluido\n\u2705 500 conversaciones/mes\n\nIdeal para cl\u00ednicas que *empiezan con automatizaci\u00f3n*.",
      "options": [
        { "id": "pos_1", "label": "\ud83d\udcc5 Quiero una demo del B\u00e1sico", "next": null, "action": "_LEAD_CAPTURE", "lead_plan": "basico" },
        { "id": "pos_2", "label": "\ud83d\udd35 Ver Plan Pro", "next": "precio_pro" },
        { "id": "pos_3", "label": "\ud83e\udd1d Hablar con un asesor", "next": null, "action": "_HUMAN" }
      ]
    },

    "precio_pro": {
      "type": "lp3",
      "body": "\ud83d\udd35 *Plan Pro \u2014 S/.499/mes* \u2b50 El m\u00e1s popular\n\nTodo del B\u00e1sico, m\u00e1s:\n\u2705 Recordatorios 24h antes de cada cita\n\u2705 Reportes mensuales por email\n\u2705 Soporte prioritario WhatsApp\n\u2705 1,500 conversaciones/mes\n\u2705 M\u00e9tricas avanzadas",
      "options": [
        { "id": "pos_1", "label": "\ud83d\udcc5 Demo del Plan Pro", "next": null, "action": "_LEAD_CAPTURE", "lead_plan": "pro" },
        { "id": "pos_2", "label": "\ud83d\udfe3 Ver Enterprise", "next": "precio_enterprise" },
        { "id": "pos_3", "label": "\ud83e\udd1d Hablar con un asesor", "next": null, "action": "_HUMAN" }
      ]
    },

    "precio_enterprise": {
      "type": "lp3",
      "body": "\ud83d\udfe3 *Plan Enterprise \u2014 desde S/.799/mes*\n\nPara grupos y cadenas dentales:\n\u2705 M\u00faltiples cl\u00ednicas en un panel\n\u2705 M\u00faltiples WhatsApp\n\u2705 API para integraci\u00f3n\n\u2705 Onboarding + capacitaci\u00f3n dedicada\n\u2705 Soporte 24/7 \u2014 Conversaciones ilimitadas",
      "options": [
        { "id": "pos_1", "label": "\ud83e\udd1d Cotizaci\u00f3n personalizada", "next": null, "action": "_LEAD_CAPTURE", "lead_plan": "enterprise" },
        { "id": "pos_2", "label": "\ud83d\udccb Comparar todos los planes", "next": "precio_comparar" },
        { "id": "pos_3", "label": "\ud83d\udd19 Ver todos los planes", "next": "precios" }
      ]
    },

    "precio_comparar": {
      "type": "lp3",
      "body": "\ud83d\udccb *Comparativa de planes*\n\n\ud83d\udfe2 B\u00e1sico \u2192 S/.299/mes \u2192 500 conv.\n\ud83d\udd35 Pro \u2192 S/.499/mes \u2192 1,500 conv. \u2b50\n\ud83d\udfe3 Enterprise \u2192 S/.799+/mes \u2192 Ilimitadas\n\n\u2728 Sin contrato. Cancela cuando quieras.\n\ud83d\udca1 *Descuento 15%* pagando 6 meses | *25%* pagando 1 a\u00f1o",
      "options": [
        { "id": "pos_1", "label": "\ud83e\udd1d Hablar con un asesor", "next": null, "action": "_HUMAN" },
        { "id": "pos_2", "label": "\ud83d\udcc5 Quiero una demo", "next": null, "action": "_LEAD_CAPTURE", "lead_plan": "comparar" },
        { "id": "pos_3", "label": "\ud83d\udd19 Ver planes de nuevo", "next": "precios" }
      ]
    },

    // ── F5: Lead Capture prompt (before multi-step form) ─────────────────────
    "lead_intro": {
      "type": "lp3",
      "body": "\ud83d\ude80 *\u00a1Excelente elecci\u00f3n!*\n\nPara preparar tu demo personalizada necesito 3 datos r\u00e1pidos (30 segundos). Te contactar\u00e1 un asesor en menos de 24 horas.\n\n\u00bfEmpezamos?",
      "options": [
        { "id": "pos_1", "label": "\u2705 S\u00ed, empezar", "next": null, "action": "_LEAD_CAPTURE_START" },
        { "id": "pos_2", "label": "\ud83e\udd1d Prefiero hablar ahora", "next": null, "action": "_HUMAN" },
        { "id": "pos_3", "label": "\ud83d\udd19 Volver al men\u00fa", "next": "bienvenida" }
      ]
    }
  }
};

async function main() {
  // Get current bot_config
  const rows = await sbReq('GET', '/rest/v1/clinics?select=id,bot_config&id=eq.' + DEMO_CLINIC_ID, null);
  const clinic = rows[0];
  const bc = clinic.bot_config || {};

  // Save demo_flow inside bot_config
  const updatedBc = Object.assign({}, bc, { demo_flow: DEMO_FLOW_CONFIG });
  const result = await sbReq('PATCH', '/rest/v1/clinics?id=eq.' + DEMO_CLINIC_ID, { bot_config: updatedBc });
  if (Array.isArray(result) && result[0]) {
    const nodeCount = Object.keys(DEMO_FLOW_CONFIG.nodes).length;
    console.log('✅ demo_flow saved to Supabase |', nodeCount, 'nodes | start:', DEMO_FLOW_CONFIG.start_node);
  } else {
    console.log('Supabase response:', JSON.stringify(result).substring(0, 300));
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
