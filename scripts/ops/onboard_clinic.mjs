#!/usr/bin/env node
/**
 * onboard_clinic.mjs — SofIA SaaS: Full Clinic Onboarding
 *
 * Usage:
 *   node scripts/ops/onboard_clinic.mjs [path/to/config.json]
 *   node scripts/ops/onboard_clinic.mjs scripts/clinic_config_template.json
 *
 * What it does (~2 min):
 *   1. Creates Chatwoot WhatsApp Meta Cloud API inbox
 *   2. Inserts clinic record in Supabase (with full bot_config + CTWA rules)
 *   3. Creates admin auth user
 *   4. Creates staff record
 *   5. Seeds knowledge_base
 *   6. Prints credentials + Meta webhook setup instructions
 *
 * Env vars (optional — hardcoded defaults for this project):
 *   SUPABASE_URL          https://inhyrrjidhzrbqecnptn.supabase.co
 *   SUPABASE_SERVICE_KEY  sb_secret_...
 *   CHATWOOT_URL          https://chat.redsolucionesti.com
 *   CHATWOOT_TOKEN        Superadmin token
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ─────────────────────────────────────────────────────────────────
const SUPABASE_URL  = process.env.SUPABASE_URL  || 'https://inhyrrjidhzrbqecnptn.supabase.co';
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY || 'sb_secret_jpzMd6yUKtpWTUnQZb44mA_5PmOZDQ3';
const CHATWOOT_URL  = process.env.CHATWOOT_URL  || 'https://chat.redsolucionesti.com';
const CHATWOOT_TOKEN = process.env.CHATWOOT_TOKEN || 'yypAwZDH2dV3crfbqJqWCgj1';
const CHATWOOT_ACCOUNT_ID = 2;
const N8N_WEBHOOK = 'https://workflows.n8n.redsolucionesti.com/webhook/chatwoot-sofia';

const SB_HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function sbPost(resource, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${resource}`, {
    method: 'POST', headers: SB_HEADERS, body: JSON.stringify(body),
  });
  const data = await r.json();
  return { status: r.status, data };
}

async function sbPatch(resource, query, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${resource}?${query}`, {
    method: 'PATCH',
    headers: { ...SB_HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}

async function sbGet(resource) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${resource}`, { headers: SB_HEADERS });
  return r.json();
}

async function createAuthUser(email, password, metadata) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { ...SB_HEADERS, Prefer: undefined },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: metadata }),
  });
  return r.json();
}

async function cwPost(endpoint, body) {
  const r = await fetch(`${CHATWOOT_URL}/api/v1${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', api_access_token: CHATWOOT_TOKEN },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}

async function cwGet(endpoint) {
  const r = await fetch(`${CHATWOOT_URL}/api/v1${endpoint}`, {
    headers: { api_access_token: CHATWOOT_TOKEN },
  });
  return r.json();
}

// ── Step 1: Chatwoot WhatsApp Inbox ────────────────────────────────────────

async function createChatwootInbox(config) {
  console.log('\n[1/5] Creando inbox WhatsApp Meta en Chatwoot...');

  const wa = config.whatsapp;
  if (!wa?.phone_number_id || !wa?.waba_id || !wa?.system_user_token) {
    console.warn('  ⚠ Credenciales Meta incompletas — creando inbox tipo API como fallback');
    const { status, data } = await cwPost(`/accounts/${CHATWOOT_ACCOUNT_ID}/inboxes`, {
      name: config.chatwoot_inbox_name || `SofIA - ${config.clinic.name}`,
      channel: { type: 'api', webhook_url: N8N_WEBHOOK },
    });
    if (!data?.id) {
      throw new Error(`No se pudo crear inbox Chatwoot: ${JSON.stringify(data).slice(0, 200)}`);
    }
    console.log(`  ✓ Inbox API creado: "${data.name}" (ID: ${data.id})`);
    console.log('  ℹ Conecta manualmente el número WhatsApp Meta en Chatwoot > Settings > Inboxes');
    return { inbox: data, type: 'api' };
  }

  // Create Meta Cloud API WhatsApp inbox
  const { status, data } = await cwPost(`/accounts/${CHATWOOT_ACCOUNT_ID}/inboxes`, {
    name: config.chatwoot_inbox_name || `SofIA - ${config.clinic.name}`,
    channel: {
      type: 'whatsapp',
      phone_number: wa.phone_number,
      provider: 'whatsapp_cloud',
      provider_config: {
        api_key:             wa.system_user_token,
        phone_number_id:     wa.phone_number_id,
        business_account_id: wa.waba_id,
      },
    },
  });

  if (status !== 200 && status !== 201) {
    throw new Error(`Error creando inbox WhatsApp (${status}): ${JSON.stringify(data).slice(0, 300)}`);
  }

  console.log(`  ✓ Inbox WhatsApp Meta creado: "${data.name}" (ID: ${data.id})`);
  console.log(`  ✓ Número: ${wa.phone_number}`);
  return { inbox: data, type: 'whatsapp_cloud' };
}

// ── Step 2: Supabase Clinic Record ─────────────────────────────────────────

async function createClinicRecord(config, inboxId, inboxType) {
  console.log('\n[2/5] Creando registro de clínica en Supabase...');

  // Check for duplicate subdomain
  const existing = await sbGet(`clinics?subdomain=eq.${config.clinic.subdomain}&select=id,name`);
  if (Array.isArray(existing) && existing.length > 0) {
    throw new Error(`Subdomain '${config.clinic.subdomain}' ya existe (clinic_id: ${existing[0].id})`);
  }

  // Build bot_config merging defaults with config overrides
  const botConfig = {
    // Core
    chatwoot_inbox_id:    inboxId,
    chatwoot_account_id:  CHATWOOT_ACCOUNT_ID,
    chatwoot_api_token:   CHATWOOT_TOKEN,
    wa_phone_number_id:   config.whatsapp?.phone_number_id || null,
    wa_waba_id:           config.whatsapp?.waba_id || null,
    // Scheduling
    business_hours_start: config.business_hours?.start ?? 8,
    business_hours_end:   config.business_hours?.end   ?? 22,
    reminder_hours_before: config.reminder_hours_before ?? 24,
    max_bot_interactions: config.max_bot_interactions   ?? 15,
    slot_duration_minutes: config.slot_duration_minutes ?? 30,
    slots_per_day:        config.slots_per_day          ?? 6,
    // CTWA (Click-to-WhatsApp) rules — array of { source_id, headline, response }
    ctwa_rules: config.ctwa_rules || [],
    // Messaging
    welcome_message:    config.welcome_message    || null,
    escalation_message: config.escalation_message || null,
    // Override with any extra keys from config.bot_config
    ...(config.bot_config || {}),
  };

  const { status, data } = await sbPost('clinics', {
    name:            config.clinic.name,
    subdomain:       config.clinic.subdomain,
    phone:           config.clinic.phone      || null,
    address:         config.clinic.address    || null,
    timezone:        config.clinic.timezone   || 'America/Lima',
    bot_config:      botConfig,
    branding_config: config.branding_config   || {},
    active:          true,
  });

  if (status !== 201) {
    throw new Error(`Error insertando clínica (${status}): ${JSON.stringify(data).slice(0, 300)}`);
  }

  const clinic = Array.isArray(data) ? data[0] : data;
  console.log(`  ✓ Clínica creada: ${clinic.name}`);
  console.log(`  ✓ clinic_id: ${clinic.id}`);
  console.log(`  ✓ inbox_id:  ${inboxId}`);
  if (botConfig.ctwa_rules?.length) {
    console.log(`  ✓ CTWA rules: ${botConfig.ctwa_rules.length} reglas configuradas`);
  }
  return clinic;
}

// ── Step 3: Admin auth user ────────────────────────────────────────────────

async function createAdminUser(config, clinicId) {
  console.log('\n[3/5] Creando usuario admin...');

  const user = await createAuthUser(
    config.admin.email,
    config.admin.password,
    { full_name: config.admin.full_name, clinic_id: clinicId, role: 'admin' }
  );

  if (user.error || !user.id) {
    throw new Error(`Error creando auth user: ${user.error || JSON.stringify(user)}`);
  }

  console.log(`  ✓ Auth user: ${user.email} (${user.id})`);
  return user;
}

// ── Step 4: Staff record ───────────────────────────────────────────────────

async function createStaffRecord(adminUser, clinicId, fullName) {
  console.log('\n[4/5] Creando registro de staff...');

  const { status, data } = await sbPost('staff', {
    user_id:   adminUser.id,
    clinic_id: clinicId,
    role:      'admin',
    full_name: fullName,
    active:    true,
  });

  if (status !== 201) {
    throw new Error(`Error creando staff (${status}): ${JSON.stringify(data).slice(0, 200)}`);
  }

  const staff = Array.isArray(data) ? data[0] : data;
  console.log(`  ✓ Staff record: ${staff.id}`);
  return staff;
}

// ── Step 5: Knowledge base ─────────────────────────────────────────────────

async function seedKnowledgeBase(knowledgeBase, clinicId) {
  const kb = knowledgeBase || [];
  console.log(`\n[5/5] Cargando KB (${kb.length} entradas)...`);

  if (!kb.length) {
    console.log('  ⚠ Sin entradas KB en config — omitiendo');
    return 0;
  }

  const entries = kb.map(k => ({
    clinic_id: clinicId,
    category:  k.category || 'general',
    question:  k.question,
    answer:    k.answer,
    keywords:  k.keywords || [],
    priority:  k.priority || 0,
    metadata:  {},
    active:    true,
  }));

  let inserted = 0;
  for (let i = 0; i < entries.length; i += 20) {
    const batch = entries.slice(i, i + 20);
    const { status } = await sbPost('knowledge_base', batch);
    if (status === 201) inserted += batch.length;
    else console.warn(`  ⚠ Batch ${i}–${i + batch.length} falló (status ${status})`);
  }

  console.log(`  ✓ ${inserted}/${kb.length} entradas insertadas`);
  return inserted;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const configPath = process.argv[2]
    || path.join(__dirname, '../../scripts/clinic_config_template.json');

  if (!fs.existsSync(configPath)) {
    console.error(`\n[ERROR] No se encontró: ${configPath}`);
    console.error('Uso: node scripts/ops/onboard_clinic.mjs [config.json]');
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    console.error(`\n[ERROR] JSON inválido: ${e.message}`);
    process.exit(1);
  }

  // Validate required fields
  if (!config.clinic?.name || !config.clinic?.subdomain) {
    console.error('\n[ERROR] Falta clinic.name o clinic.subdomain');
    process.exit(1);
  }
  if (!config.admin?.email || !config.admin?.password) {
    console.error('\n[ERROR] Falta admin.email o admin.password');
    process.exit(1);
  }

  const t0 = Date.now();
  console.log('═'.repeat(65));
  console.log(' SofIA — Onboarding de Clínica');
  console.log('═'.repeat(65));
  console.log(` Clínica:  ${config.clinic.name}`);
  console.log(` Subdom.:  ${config.clinic.subdomain}`);
  console.log(` WhatsApp: ${config.whatsapp?.phone_number || '(configurar manualmente)'}`);
  console.log(` Admin:    ${config.admin.email}`);
  console.log(` KB items: ${(config.knowledge_base || []).length}`);
  console.log(` CTWA rules: ${(config.ctwa_rules || []).length}`);
  console.log('─'.repeat(65));

  let inboxResult, clinic, adminUser, staff, kbCount;

  try {
    inboxResult = await createChatwootInbox(config);
    clinic      = await createClinicRecord(config, inboxResult.inbox.id, inboxResult.type);
    adminUser   = await createAdminUser(config, clinic.id);
    staff       = await createStaffRecord(adminUser, clinic.id, config.admin.full_name);
    kbCount     = await seedKnowledgeBase(config.knowledge_base, clinic.id);
  } catch (err) {
    console.error(`\n[FATAL] ${err.message}`);
    if (clinic) {
      console.error(`[ROLLBACK NEEDED] clinic_id=${clinic.id} — eliminar de Supabase si necesario`);
    }
    process.exit(1);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const inboxId = inboxResult.inbox.id;
  const webhookUrl = `${CHATWOOT_URL}/webhooks/whatsapp/${inboxId}`;

  console.log('\n');
  console.log('╔' + '═'.repeat(63) + '╗');
  console.log('║  ONBOARDING COMPLETADO                                        ║');
  console.log('╠' + '═'.repeat(63) + '╣');
  console.log(`║  Tiempo: ${elapsed}s`.padEnd(64) + '║');
  console.log('╠' + '═'.repeat(63) + '╣');
  console.log('║  CREDENCIALES ADMIN                                           ║');
  console.log('╠' + '═'.repeat(63) + '╣');
  console.log(`║  Panel:    https://sofia-admin-theta.vercel.app/admin`.padEnd(64) + '║');
  console.log(`║  Email:    ${config.admin.email}`.padEnd(64) + '║');
  console.log(`║  Password: ${config.admin.password}`.padEnd(64) + '║');
  console.log('╠' + '═'.repeat(63) + '╣');
  console.log('║  IDs TÉCNICOS                                                 ║');
  console.log('╠' + '═'.repeat(63) + '╣');
  console.log(`║  clinic_id:  ${clinic.id}`.padEnd(64) + '║');
  console.log(`║  user_id:    ${adminUser.id}`.padEnd(64) + '║');
  console.log(`║  staff_id:   ${staff.id}`.padEnd(64) + '║');
  console.log(`║  inbox_id:   ${inboxId} (Chatwoot)`.padEnd(64) + '║');
  console.log(`║  KB entries: ${kbCount}`.padEnd(64) + '║');
  console.log('╠' + '═'.repeat(63) + '╣');
  if (inboxResult.type === 'whatsapp_cloud') {
    console.log('║  META WEBHOOK (registrar en Meta Business Manager)            ║');
    console.log('╠' + '═'.repeat(63) + '╣');
    console.log(`║  URL: ${webhookUrl}`.padEnd(64) + '║');
    console.log(`║  Verify token: ${inboxResult.inbox.provider_config?.webhook_verify_token || '(ver Chatwoot)'}`.padEnd(64) + '║');
  } else {
    console.log('║  PASO PENDIENTE: Conectar WhatsApp Meta en Chatwoot           ║');
    console.log('╠' + '═'.repeat(63) + '╣');
    console.log('║  Settings > Inboxes > (este inbox) > Configuration > WA Meta  ║');
  }
  console.log('╠' + '═'.repeat(63) + '╣');
  console.log('║  PROXIMOS PASOS                                               ║');
  console.log('╠' + '═'.repeat(63) + '╣');
  console.log('║  1. Dar email + password al admin de la clínica               ║');
  console.log('║  2. Admin cambia contraseña en primer login                    ║');
  console.log('║  3. Registrar Webhook URL en Meta Business Manager             ║');
  console.log('║  4. Enviar mensaje de prueba desde el número WhatsApp          ║');
  if ((config.ctwa_rules || []).length) {
    console.log('║  5. Configurar anuncios Meta con Click-to-WhatsApp             ║');
    console.log('║     source_id en cada anuncio debe coincidir con ctwa_rules   ║');
  }
  console.log('╚' + '═'.repeat(63) + '╝');

  // Save credentials
  const credsFile = path.join(__dirname, `../../credentials_${config.clinic.subdomain}.json`);
  fs.writeFileSync(credsFile, JSON.stringify({
    generated_at: new Date().toISOString(),
    clinic: { id: clinic.id, name: clinic.name, subdomain: config.clinic.subdomain },
    admin:  { email: config.admin.email, password: config.admin.password,
               full_name: config.admin.full_name, user_id: adminUser.id, staff_id: staff.id },
    panel_url: 'https://sofia-admin-theta.vercel.app/admin',
    chatwoot_inbox_id: inboxId,
    inbox_type: inboxResult.type,
    meta_webhook_url: inboxResult.type === 'whatsapp_cloud' ? webhookUrl : null,
    kb_entries: kbCount,
    ctwa_rules: (config.ctwa_rules || []).map(r => r.source_id),
  }, null, 2));
  console.log(`\nCredenciales guardadas en: credentials_${config.clinic.subdomain}.json`);
}

main().catch(err => {
  console.error('\n[UNCAUGHT]', err.message);
  process.exit(1);
});
