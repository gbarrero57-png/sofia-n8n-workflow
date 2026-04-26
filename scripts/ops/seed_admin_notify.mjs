/**
 * seed_admin_notify.mjs
 * Guarda admin_notify_phone + SIDs de templates T12/T13/T14 en todas las clínicas.
 * Para clínicas futuras: agregar una fila a CLINIC_PHONES abajo.
 *
 * Run: node scripts/ops/seed_admin_notify.mjs
 */

import { readFileSync } from 'fs';

const KEY = readFileSync('saas/.env', 'utf8')
  .match(/SUPABASE_SERVICE_KEY=(.+)/)?.[1]?.trim();
const BASE = 'https://inhyrrjidhzrbqecnptn.supabase.co';

// ── Config por clínica ────────────────────────────────────────────────────────
// Para agregar una nueva clínica: añadir una fila aquí antes de correr el script
const CLINIC_PHONES = {
  'c6c15fca-d7fc-4d98-83c1-2c5cb5a6bef1': '+51905858566',  // SofIA Demo → Gabriel
  // '39b0e8e6-xxxx': '+51999000000',                        // Covida → owner
  // '6a9f25e2-xxxx': '+51888000000',                        // SmilePlus → owner
};

// SIDs Round 7 — 2026-04-26 (es_ES language, text-only, 4/3/3 vars)
const TEMPLATE_SIDS = {
  twilio_admin_new_appt_sid:    'HX1d1f14d0705bb97a02ff6a21b71ef3c1',  // T12 sofia_notif_cita_r7 (4 vars, text)
  twilio_patient_confirmed_sid: 'HX7057b0cc825f0385067bcb0fffdd449e',  // T13 sofia_cita_ok_r7 (3 vars, text)
  twilio_patient_cancelled_sid: 'HX95a4d46225f94494a049049b42e4223f',  // T14 sofia_cita_cancel_r7 (3 vars, text)
  twilio_debt_reminder_sid:     'HXf490c093266e014e940f567fab0bd5ac',  // T15 sofia_recordatorio_deuda_v1
};

async function get(path) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
  });
  return r.json();
}

async function patch(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal'
    },
    body: JSON.stringify(body)
  });
  return r.status;
}

console.log('\n=== Seed admin_notify_phone + template SIDs ===\n');

for (const [clinicId, phone] of Object.entries(CLINIC_PHONES)) {
  process.stdout.write(`Clínica ${clinicId.slice(0, 8)}... `);

  // Leer bot_config actual (sin admin_notify_phone - puede no existir aún)
  const rows = await get(`/rest/v1/clinics?select=id,name,bot_config&id=eq.${clinicId}`);
  if (!rows || !Array.isArray(rows) || !rows.length) { console.log('❌ No encontrada o error'); continue; }

  const clinic = rows[0];
  const currentBotConfig = clinic.bot_config || {};

  // Merge template SIDs sin pisar el resto del bot_config
  const mergedBotConfig = { ...currentBotConfig, ...TEMPLATE_SIDS };

  // Patch 1: bot_config (funciona siempre, columna ya existe)
  const s1 = await patch(
    `/rest/v1/clinics?id=eq.${clinicId}`,
    { bot_config: mergedBotConfig }
  );

  // Patch 2: admin_notify_phone (requiere migración 037)
  const s2 = await patch(
    `/rest/v1/clinics?id=eq.${clinicId}`,
    { admin_notify_phone: phone }
  );

  const botOk = s1 === 204;
  const phoneOk = s2 === 204;
  if (botOk && phoneOk) {
    console.log(`✅ ${clinic.name} → admin_phone: ${phone} + SIDs`);
  } else if (botOk && !phoneOk) {
    console.log(`⚠️  ${clinic.name} → SIDs OK, admin_phone FALLÓ (HTTP ${s2}) — ¿migración 037 aplicada?`);
  } else {
    console.log(`❌ bot_config HTTP ${s1} | admin_phone HTTP ${s2}`);
  }
}

console.log('\n✅ Seed completado.\n');
console.log('SIDs guardados en bot_config de cada clínica:');
for (const [k, v] of Object.entries(TEMPLATE_SIDS)) {
  console.log(`  ${k}: ${v}`);
}
console.log('');
