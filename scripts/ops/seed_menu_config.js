// Seed menu configuration into bot_config for all clinics
const https = require('https');

const SUPABASE_HOST = 'inhyrrjidhzrbqecnptn.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluaHlycmppZGh6cmJxZWNucHRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwNzU3NSwiZXhwIjoyMDg2NTgzNTc1fQ.-YwX0Qf4Gn8MdjFbLxCYuCJV1OzWl2qWWk4hKuU6z7k';

function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const b = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: SUPABASE_HOST, path, method,
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
        ...(b ? { 'Content-Length': Buffer.byteLength(b) } : {})
      }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    if (b) req.write(b);
    req.end();
  });
}

// Default menu (all clinics share this base, can be customized per clinic)
function buildMenu(extras) {
  const base = {
    header: "Hola! Soy SofIA tu asistente virtual\n\nEn que puedo ayudarte hoy?",
    footer: "\nResponde con el numero de tu opcion.",
    options: [
      { id: "1", emoji: "📅", label: "Agendar una cita",       intent: "CREATE_EVENT" },
      { id: "2", emoji: "🕐", label: "Horarios y ubicacion",   intent: "INFO",               query: "horarios y ubicacion" },
      { id: "3", emoji: "💰", label: "Servicios y precios",    intent: "INFO",               query: "servicios y precios" },
      { id: "4", emoji: "📋", label: "Ver o cancelar mi cita", intent: "APPOINTMENT_STATUS" },
      { id: "5", emoji: "👤", label: "Hablar con un agente",   intent: "HUMAN" }
    ]
  };
  return Object.assign({}, base, extras || {});
}

const clinicMenus = [
  // Red Soluciones — main clinic
  {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    menu: buildMenu({ header: "Hola! Soy SofIA tu asistente virtual de Clinica Dental Red Soluciones\n\nEn que puedo ayudarte hoy?" })
  },
  // OdontoVida Norte
  {
    id: 'f8e7d6c5-b4a3-9281-0fed-cba987654321',
    menu: buildMenu({
      header: "Hola! Soy SofIA tu asistente virtual de OdontoVida Norte\n\nEn que puedo ayudarte hoy?",
      options: [
        { id: "1", emoji: "📅", label: "Agendar una cita",       intent: "CREATE_EVENT" },
        { id: "2", emoji: "🕐", label: "Horarios y ubicacion",   intent: "INFO", query: "horarios y ubicacion" },
        { id: "3", emoji: "💰", label: "Servicios y precios",    intent: "INFO", query: "servicios y precios" },
        { id: "4", emoji: "🚨", label: "Urgencia dental",        intent: "HUMAN" },
        { id: "5", emoji: "📋", label: "Ver o cancelar mi cita", intent: "APPOINTMENT_STATUS" },
        { id: "6", emoji: "👤", label: "Hablar con un agente",   intent: "HUMAN" }
      ]
    })
  },
  // Sofia Demo
  {
    id: 'c6c15fca-d7fc-4d98-83c1-2c5cb5a6bef1',
    menu: buildMenu({
      header: "Hola! Soy SofIA, asistente virtual de demostracion\n\nEsta es una demo del sistema SofIA para clinicas dentales. En que puedo ayudarte?",
      options: [
        { id: "1", emoji: "📅", label: "Probar agendamiento",    intent: "CREATE_EVENT" },
        { id: "2", emoji: "🕐", label: "Horarios y ubicacion",   intent: "INFO", query: "horarios y ubicacion" },
        { id: "3", emoji: "💰", label: "Servicios y precios",    intent: "INFO", query: "servicios y precios" },
        { id: "4", emoji: "📋", label: "Ver o cancelar cita",    intent: "APPOINTMENT_STATUS" },
        { id: "5", emoji: "🤖", label: "Que es SofIA?",          intent: "INFO", query: "que es sofia" },
        { id: "6", emoji: "👤", label: "Hablar con un agente",   intent: "HUMAN" }
      ]
    })
  },
  // San Marcos
  {
    id: '56b0cf1c-2ab6-4e03-b989-044701e47271',
    menu: buildMenu({ header: "Hola! Soy SofIA tu asistente virtual de Clinica Dental San Marcos\n\nEn que puedo ayudarte hoy?" })
  },
  // San Jose
  {
    id: '78dd31da-74da-41ad-b1bc-d7143cb4bc82',
    menu: buildMenu({ header: "Hola! Soy SofIA tu asistente virtual de Clinica Dental San Jose\n\nEn que puedo ayudarte hoy?" })
  }
];

async function run() {
  for (const clinic of clinicMenus) {
    // First get current bot_config
    const getRes = await apiRequest('GET', '/rest/v1/clinics?id=eq.' + clinic.id + '&select=id,name,bot_config', null);
    const rows = JSON.parse(getRes.body);
    if (!rows || rows.length === 0) { console.log('NOT FOUND:', clinic.id); continue; }

    const current = rows[0];
    const newConfig = Object.assign({}, current.bot_config || {}, { menu: clinic.menu });

    const patchRes = await apiRequest('PATCH', '/rest/v1/clinics?id=eq.' + clinic.id, { bot_config: newConfig });
    console.log(current.name + ':', patchRes.status === 204 ? 'OK' : patchRes.body.slice(0, 100));
  }
}

run().catch(console.error);
