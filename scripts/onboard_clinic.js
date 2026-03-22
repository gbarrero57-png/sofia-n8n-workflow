#!/usr/bin/env node
/**
 * onboard_clinic.js — SofIA SaaS Clinic Onboarding Script
 *
 * Usage:
 *   node onboard_clinic.js [config.json]
 *   node onboard_clinic.js clinic_config_template.json
 *
 * If no config file is given, uses clinic_config_template.json in the same directory.
 *
 * What it does in ~2 minutes:
 *   1. Creates the clinic record in Supabase (clinics table)
 *   2. Creates the admin Supabase auth user
 *   3. Creates the staff record linking user to clinic
 *   4. Seeds the knowledge base (from config.knowledge_base)
 *   5. Creates a Chatwoot inbox (if CHATWOOT_TOKEN is set)
 *   6. Prints a full credentials summary
 *
 * Environment variables (optional — fall back to defaults):
 *   SUPABASE_URL          Supabase project URL
 *   SUPABASE_SERVICE_KEY  Service role key (bypasses RLS)
 *   CHATWOOT_URL          Chatwoot API base URL (account endpoint)
 *   CHATWOOT_TOKEN        Chatwoot API access token
 */

const fs   = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL
  || 'https://inhyrrjidhzrbqecnptn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluaHlycmppZGh6cmJxZWNucHRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwNzU3NSwiZXhwIjoyMDg2NTgzNTc1fQ.-YwX0Qf4Gn8MdjFbLxCYuCJV1OzWl2qWWk4hKuU6z7k';
const CHATWOOT_URL   = process.env.CHATWOOT_URL   || 'https://chat.redsolucionesti.com/api/v1/accounts/2';
const CHATWOOT_TOKEN = process.env.CHATWOOT_TOKEN || 'yypAwZDH2dV3crfbqJqWCgj1';

const SUPABASE_HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

const delay = ms => new Promise(r => setTimeout(r, ms));

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SUPABASE_HEADERS });
  return r.json();
}

async function sbPost(path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { ...SUPABASE_HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}

async function sbRpc(fn, params) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: SUPABASE_HEADERS,
    body: JSON.stringify(params),
  });
  return r.json();
}

// Auth Admin API
async function createAuthUser(email, password, metadata) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: SUPABASE_HEADERS,
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: metadata }),
  });
  return r.json();
}

async function deleteAuthUser(userId) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: SUPABASE_HEADERS,
  });
}

// ─── Chatwoot helpers ─────────────────────────────────────────────────────────

async function createChatwootInbox(name, webhookUrl) {
  const r = await fetch(`${CHATWOOT_URL}/inboxes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', api_access_token: CHATWOOT_TOKEN },
    body: JSON.stringify({
      name,
      channel: { type: 'api', webhook_url: webhookUrl },
    }),
  });
  return r.json();
}

// ─── Steps ───────────────────────────────────────────────────────────────────

async function step1_createClinic(config) {
  console.log('\n[1/5] Creando registro de clínica...');

  // Check subdomain uniqueness
  const existing = await sbGet(`clinics?subdomain=eq.${config.clinic.subdomain}&select=id`);
  if (Array.isArray(existing) && existing.length > 0) {
    throw new Error(`El subdomain '${config.clinic.subdomain}' ya existe. Usa un subdomain único.`);
  }

  const { status, data } = await sbPost('clinics', {
    name:       config.clinic.name,
    subdomain:  config.clinic.subdomain,
    phone:      config.clinic.phone,
    address:    config.clinic.address,
    timezone:   config.clinic.timezone || 'America/Lima',
    bot_config: config.clinic.bot_config || {},
    branding_config: config.clinic.branding_config || {},
    active: true,
  });

  if (status !== 201 || !data || data.error) {
    throw new Error(`Error creando clínica: ${JSON.stringify(data)}`);
  }

  const clinic = Array.isArray(data) ? data[0] : data;
  console.log(`  ✓ Clínica creada: ${clinic.name} (${clinic.id})`);
  return clinic;
}

async function step2_createAdminUser(config, clinicId) {
  console.log('\n[2/5] Creando usuario admin...');

  const user = await createAuthUser(
    config.admin.email,
    config.admin.password,
    { full_name: config.admin.full_name, clinic_id: clinicId, role: 'admin' }
  );

  if (user.error || !user.id) {
    throw new Error(`Error creando auth user: ${user.error || JSON.stringify(user)}`);
  }

  console.log(`  ✓ Auth user creado: ${user.email} (${user.id})`);
  return user;
}

async function step3_createStaffRecord(adminUser, clinicId, fullName) {
  console.log('\n[3/5] Creando registro de staff...');

  const { status, data } = await sbPost('staff', {
    user_id:   adminUser.id,
    clinic_id: clinicId,
    role:      'admin',
    full_name: fullName,
    active:    true,
  });

  if (status !== 201 || !data || (Array.isArray(data) && data[0]?.error)) {
    // Rollback auth user
    await deleteAuthUser(adminUser.id);
    throw new Error(`Error creando staff: ${JSON.stringify(data)}`);
  }

  const staff = Array.isArray(data) ? data[0] : data;
  console.log(`  ✓ Staff record creado: ${staff.id} (role: admin)`);
  return staff;
}

async function step4_seedKnowledgeBase(knowledgeBase, clinicId) {
  console.log(`\n[4/5] Cargando base de conocimiento (${knowledgeBase.length} entradas)...`);

  const entries = knowledgeBase.map(kb => ({
    clinic_id: clinicId,
    category:  kb.category || 'general',
    question:  kb.question,
    answer:    kb.answer,
    keywords:  kb.keywords || [],
    priority:  kb.priority || 0,
    metadata:  {},
    active:    true,
  }));

  // Insert in batches of 20
  let inserted = 0;
  for (let i = 0; i < entries.length; i += 20) {
    const batch = entries.slice(i, i + 20);
    const { status, data } = await sbPost('knowledge_base', batch);
    if (status === 201) {
      inserted += batch.length;
    } else {
      console.warn(`  ⚠ Batch ${i}-${i + 20} failed: ${JSON.stringify(data).slice(0, 100)}`);
    }
  }

  console.log(`  ✓ ${inserted}/${knowledgeBase.length} entradas cargadas`);
  return inserted;
}

async function step5_createChatwootInbox(config, clinicId) {
  console.log('\n[5/5] Creando inbox de Chatwoot...');

  const inboxName  = config.chatwoot?.inbox_name || `SofIA - ${config.clinic.name}`;
  const webhookUrl = config.chatwoot?.webhook_url
    || 'https://workflows.n8n.redsolucionesti.com/webhook/chatwoot-sofia';

  try {
    const inbox = await createChatwootInbox(inboxName, webhookUrl);

    if (!inbox.id) {
      console.warn(`  ⚠ No se pudo crear el inbox de Chatwoot: ${JSON.stringify(inbox).slice(0, 200)}`);
      console.warn('     Puedes crearlo manualmente en Chatwoot > Configuración > Inboxes > Agregar inbox > API');
      return null;
    }

    // Update clinic record with chatwoot_inbox_id
    await fetch(`${SUPABASE_URL}/rest/v1/clinics?id=eq.${clinicId}`, {
      method: 'PATCH',
      headers: SUPABASE_HEADERS,
      body: JSON.stringify({
        chatwoot_inbox_id: inbox.id,
        chatwoot_account_id: config.chatwoot?.account_id || 2,
      }),
    });

    console.log(`  ✓ Inbox creado: "${inbox.name}" (ID: ${inbox.id})`);
    console.log(`  ✓ Webhook configurado: ${webhookUrl}`);
    return inbox;
  } catch (err) {
    console.warn(`  ⚠ Error Chatwoot: ${err.message}`);
    console.warn('     Crea el inbox manualmente si es necesario.');
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const configPath = process.argv[2]
    || path.join(__dirname, 'clinic_config_template.json');

  if (!fs.existsSync(configPath)) {
    console.error(`\n[ERROR] No se encontró el archivo de configuración: ${configPath}`);
    console.error('Uso: node onboard_clinic.js [ruta/a/config.json]');
    console.error('     node onboard_clinic.js clinic_config_template.json');
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error(`\n[ERROR] JSON inválido en ${configPath}: ${err.message}`);
    process.exit(1);
  }

  // Validate required fields
  if (!config.clinic?.name || !config.clinic?.subdomain) {
    console.error('\n[ERROR] config.clinic.name y config.clinic.subdomain son obligatorios');
    process.exit(1);
  }
  if (!config.admin?.email || !config.admin?.password) {
    console.error('\n[ERROR] config.admin.email y config.admin.password son obligatorios');
    process.exit(1);
  }

  const start = Date.now();
  console.log('═'.repeat(65));
  console.log('SofIA — Onboarding de Clínica');
  console.log('═'.repeat(65));
  console.log(`Clínica:  ${config.clinic.name}`);
  console.log(`Subdomin: ${config.clinic.subdomain}`);
  console.log(`Admin:    ${config.admin.email}`);
  console.log(`KB items: ${(config.knowledge_base || []).length}`);
  console.log('─'.repeat(65));

  let clinic = null;
  let adminUser = null;
  let staff = null;
  let inbox = null;
  let kbInserted = 0;

  try {
    clinic     = await step1_createClinic(config);
    adminUser  = await step2_createAdminUser(config, clinic.id);
    staff      = await step3_createStaffRecord(adminUser, clinic.id, config.admin.full_name);
    kbInserted = await step4_seedKnowledgeBase(config.knowledge_base || [], clinic.id);
    inbox      = await step5_createChatwootInbox(config, clinic.id);
  } catch (err) {
    console.error(`\n\n[FATAL] ${err.message}`);
    if (clinic && !adminUser) {
      console.error('[ROLLBACK] Clínica creada pero admin falló — elimina manualmente el registro');
      console.error(`  Supabase > clinics > id = ${clinic.id}`);
    }
    process.exit(1);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('\n');
  console.log('╔' + '═'.repeat(63) + '╗');
  console.log('║  ✅  ONBOARDING COMPLETADO                                    ║');
  console.log('╠' + '═'.repeat(63) + '╣');
  console.log(`║  Tiempo:    ${elapsed}s`.padEnd(64) + '║');
  console.log('╠' + '═'.repeat(63) + '╣');
  console.log('║  CREDENCIALES DE ACCESO                                       ║');
  console.log('╠' + '═'.repeat(63) + '╣');
  console.log(`║  Panel:     https://sofia-admin-theta.vercel.app/admin`.padEnd(64) + '║');
  console.log(`║  Email:     ${config.admin.email}`.padEnd(64) + '║');
  console.log(`║  Password:  ${config.admin.password}`.padEnd(64) + '║');
  console.log('╠' + '═'.repeat(63) + '╣');
  console.log('║  IDs TÉCNICOS                                                 ║');
  console.log('╠' + '═'.repeat(63) + '╣');
  console.log(`║  clinic_id: ${clinic.id}`.padEnd(64) + '║');
  console.log(`║  user_id:   ${adminUser.id}`.padEnd(64) + '║');
  console.log(`║  staff_id:  ${staff.id}`.padEnd(64) + '║');
  if (inbox) {
    console.log(`║  inbox_id:  ${inbox.id} (Chatwoot)`.padEnd(64) + '║');
  }
  console.log('╠' + '═'.repeat(63) + '╣');
  console.log('║  BASE DE CONOCIMIENTO                                         ║');
  console.log('╠' + '═'.repeat(63) + '╣');
  console.log(`║  ${kbInserted} preguntas cargadas`.padEnd(64) + '║');
  console.log('╠' + '═'.repeat(63) + '╣');
  console.log('║  PRÓXIMOS PASOS                                               ║');
  console.log('╠' + '═'.repeat(63) + '╣');
  console.log('║  1. Entregar email + contraseña al admin de la clínica        ║');
  console.log('║  2. Admin entra al panel y cambia su contraseña               ║');
  console.log('║  3. Revisar/editar base de conocimiento en panel > KB         ║');
  if (!inbox) {
    console.log('║  4. Crear inbox WhatsApp en Chatwoot manualmente              ║');
  } else {
    console.log('║  4. Conectar número WhatsApp al inbox en Chatwoot             ║');
  }
  console.log('║  5. Activar hook de JWT en Supabase (si no está activo)       ║');
  console.log('╚' + '═'.repeat(63) + '╝');

  // ─── Save credentials file ────────────────────────────────────────────────
  const credsFile = path.join(__dirname, `credentials_${config.clinic.subdomain}.json`);
  fs.writeFileSync(credsFile, JSON.stringify({
    generated_at: new Date().toISOString(),
    clinic: {
      id: clinic.id,
      name: clinic.name || config.clinic.name,
      subdomain: config.clinic.subdomain,
    },
    admin: {
      email: config.admin.email,
      password: config.admin.password,
      full_name: config.admin.full_name,
      user_id: adminUser.id,
      staff_id: staff.id,
    },
    panel_url: 'https://sofia-admin-theta.vercel.app/admin',
    chatwoot_inbox_id: inbox?.id || null,
    kb_entries: kbInserted,
  }, null, 2));
  console.log(`\nCredenciales guardadas en: ${credsFile}`);
}

main().catch(err => {
  console.error('\n[UNCAUGHT ERROR]', err.message);
  process.exit(1);
});
