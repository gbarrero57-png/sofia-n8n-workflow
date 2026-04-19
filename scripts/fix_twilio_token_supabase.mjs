/**
 * fix_twilio_token_supabase.mjs
 * Updates twilio_auth_token in bot_config for all clinics that have it set
 * to the old expired token.
 */
const SUPABASE_URL = 'https://inhyrrjidhzrbqecnptn.supabase.co';
const SUPABASE_KEY = 'process.env.SUPABASE_SERVICE_KEY';
const OLD_TOKEN = '28b9a195bc04dbb6f5045d1971b9bd6a';
const NEW_TOKEN = '6504179bc74222d9da8c8125f20bcfdf';

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

// Get all clinics
const clinics = await fetch(`${SUPABASE_URL}/rest/v1/clinics?select=id,name,bot_config`, { headers })
  .then(r => r.json());

for (const clinic of clinics) {
  const bc = clinic.bot_config || {};
  if (bc.twilio_auth_token === OLD_TOKEN) {
    bc.twilio_auth_token = NEW_TOKEN;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/clinics?id=eq.${clinic.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ bot_config: bc })
    });
    const d = await r.json();
    if (r.ok) {
      console.log(`✅ ${clinic.name} — twilio_auth_token actualizado`);
    } else {
      console.error(`❌ ${clinic.name} error:`, JSON.stringify(d));
    }
  } else if (bc.twilio_auth_token) {
    console.log(`ℹ️  ${clinic.name} — token diferente, no modificado: ${bc.twilio_auth_token.slice(0,8)}...`);
  } else {
    console.log(`–  ${clinic.name} — sin twilio_auth_token`);
  }
}
