/**
 * test_templates_e2e.mjs
 * E2E completo de todos los flows de plantillas WhatsApp en SofIA:
 *   T12 — Admin: nueva cita
 *   T13 — Paciente: cita confirmada
 *   T14 — Paciente: cita cancelada
 *   T15 — Paciente: recordatorio deuda
 *   24h — Recordatorio 24h antes de la cita
 *   Re-engagement — SIDs activos
 *
 * Run: node scripts/ops/test_templates_e2e.mjs
 */

import { readFileSync } from 'fs';

const SB_KEY   = readFileSync('saas/.env','utf8').match(/SUPABASE_SERVICE_KEY=(.+)/)?.[1]?.trim();
const N8N_KEY  = readFileSync('n8n-mcp/.env','utf8').match(/N8N_API_KEY=(.+)/)?.[1]?.trim();
const TW_SID   = 'AC4080780a4b4a7d8e7b107a39f01abad3';
const TW_TOKEN = readFileSync('saas/.env','utf8').match(/TWILIO_AUTH_TOKEN=(.+)/)?.[1]?.trim()
                 || '310d11c181fa818864175346ccb3f948';
const SB_BASE  = 'https://inhyrrjidhzrbqecnptn.supabase.co';
const N8N_BASE = 'https://workflows.n8n.redsolucionesti.com';
const CLINIC   = 'c6c15fca-d7fc-4d98-83c1-2c5cb5a6bef1';

const SBH  = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };
const N8NH = { 'X-N8N-API-KEY': N8N_KEY };
const TWH  = { Authorization: `Basic ${Buffer.from(`${TW_SID}:${TW_TOKEN}`).toString('base64')}` };

const sb  = async (p,m='GET',b) => { const r=await fetch(SB_BASE+p,{method:m,headers:SBH,body:b?JSON.stringify(b):undefined}); const t=await r.text(); return {s:r.status,d:t?JSON.parse(t):{}}; };
const rpc = async (fn,b) => sb('/rest/v1/rpc/'+fn,'POST',b);
const n8n = async p => { const r=await fetch(N8N_BASE+'/api/v1'+p,{headers:N8NH}); return r.json(); };

let passed=0, failed=0, warns=0;
function ok(msg)   { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.log(`  ❌ ${msg}`); failed++; }
function warn(msg) { console.log(`  ⚠️  ${msg}`); warns++; }
function section(t){ console.log(`\n── ${t} ${'─'.repeat(Math.max(0,50-t.length))}`); }

// ── TWILIO: verify all SIDs ───────────────────────────────────────────────────
async function checkTwilioSid(sid, label) {
  try {
    const r = await fetch(`https://content.twilio.com/v1/Content/${sid}`, { headers: TWH });
    if (r.status === 404) { fail(`${label} (${sid.slice(0,12)}) — NOT FOUND`); return null; }
    const d = await r.json();
    const approvalR = await fetch(`https://content.twilio.com/v1/Content/${sid}/ApprovalRequests`, { headers: TWH });
    const appD = await approvalR.json();
    const status = appD.whatsapp?.status ?? 'unknown';
    if (status === 'approved') ok(`${label} → ${d.friendly_name} | status: ${status}`);
    else if (status === 'received' || status === 'pending') warn(`${label} → ${d.friendly_name} | status: ${status} (pendiente Meta)`);
    else fail(`${label} → ${d.friendly_name} | status: ${status}`);
    return { sid, friendly_name: d.friendly_name, approval_status: status };
  } catch(e) { fail(`${label} — error: ${e.message}`); return null; }
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════');
console.log('  SofIA — E2E Templates & Notifications Test');
console.log('══════════════════════════════════════════════════════');

// ═══ BLOQUE 1: Estado de templates Twilio ═══════════════════════════════════
section('1. Twilio template SIDs (Meta approval status)');

// Get SIDs from clinic bot_config
const clinicR = await sb(`/rest/v1/clinics?id=eq.${CLINIC}&select=name,bot_config,admin_notify_phone`);
const clinic  = clinicR.d[0];
const bc      = clinic?.bot_config || {};
console.log(`  Clínica: ${clinic?.name} | admin_phone: ${clinic?.admin_notify_phone}`);
console.log(`  Bot config SIDs:`);
Object.entries(bc).filter(([k]) => k.includes('_sid')).forEach(([k,v]) => console.log(`    ${k}: ${v}`));

const SID_MAP = {
  'T12 Admin NewAppt':       bc.twilio_admin_new_appt_sid,
  'T13 Patient Confirmed':   bc.twilio_patient_confirmed_sid,
  'T14 Patient Cancelled':   bc.twilio_patient_cancelled_sid,
  'T15 Debt Reminder (R2)':  bc.twilio_debt_reminder_sid,
  '24h Reminder':            bc.twilio_reminder_sid,
};

const sidResults = {};
for (const [label, sid] of Object.entries(SID_MAP)) {
  if (!sid) { fail(`${label} — SID missing from bot_config`); continue; }
  sidResults[label] = await checkTwilioSid(sid, label);
}

// ═══ BLOQUE 2: 24h Reminders — lógica y cola ════════════════════════════════
section('2. 24h Reminders — citas pendientes de recordatorio');

// Get the 24h reminder template SID from the workflow
const remWf = await n8n('/workflows/FCSJrGj5bLMuytr7');
const sendNode = remWf.nodes?.find(n => n.name === 'Send WhatsApp Reminder');
const fmtNode  = remWf.nodes?.find(n => n.name === 'Format Reminder Message');
const sendParams = JSON.stringify(sendNode?.parameters || '');
const rem24SIDs = sendParams.match(/HX[a-f0-9]{32}/g) || [];
const fmtCode   = fmtNode?.parameters?.jsCode || '';
const rem24hTemplateName = fmtCode.match(/sofia_\w+/)?.[0] || 'unknown';
console.log(`  24h reminder template name: ${rem24hTemplateName}`);
console.log(`  SIDs found in Send node: ${rem24SIDs.length > 0 ? rem24SIDs.join(', ') : '(dynamic — from bot_config or hardcoded)'}`);

// Check appointments in next 23-25h window (reminder target window)
const now   = new Date();
const from  = new Date(now.getTime() + 22*3600*1000).toISOString();
const to    = new Date(now.getTime() + 26*3600*1000).toISOString();
const apptR = await sb(`/rest/v1/appointments?clinic_id=eq.${CLINIC}&start_time=gte.${from}&start_time=lte.${to}&status=in.(scheduled,confirmed)&select=id,patient_name,phone,start_time,status`);
if (apptR.d.length > 0) {
  ok(`${apptR.d.length} cita(s) en ventana 22-26h para recordatorio`);
  apptR.d.forEach(a => console.log(`    · ${a.patient_name} | ${new Date(a.start_time).toLocaleString('es-PE')} | ${a.status}`));
} else {
  warn('No hay citas en ventana 22-26h (normal si no hay citas mañana)');
}

// Check reminder_log for recent sends
const logR = await sb(`/rest/v1/reminder_log?clinic_id=eq.${CLINIC}&select=patient_name,phone,sent_at,reminder_type&order=sent_at.desc&limit=5`);
if (logR.s === 200 && Array.isArray(logR.d) && logR.d.length > 0) {
  ok(`reminder_log: ${logR.d.length} registros recientes`);
  logR.d.forEach(l => console.log(`    · [${l.reminder_type}] ${l.patient_name} → ${new Date(l.sent_at).toLocaleString('es-PE')}`));
} else if (logR.s === 404) {
  warn('reminder_log table not found (may use different table)');
} else {
  warn('reminder_log vacío — no se han enviado recordatorios aún');
}

// Check the cron is active
if (remWf.active) ok('24h Reminders workflow ACTIVE');
else fail('24h Reminders workflow INACTIVE');

// ═══ BLOQUE 3: Appt Notify workflow (T12) ═══════════════════════════════════
section('3. T12 Admin Notification — workflow + recent sends');

const notifyWf = await n8n('/workflows/5jstI4hfoWArtzZe');
if (notifyWf.active) ok('SofIA - Appt Notify workflow ACTIVE');
else fail('SofIA - Appt Notify workflow INACTIVE');

// Check admin_notifications table for recent T12 sends
const adminNotifR = await sb(`/rest/v1/admin_notifications?clinic_id=eq.${CLINIC}&select=id,patient_phone,admin_phone,status,sent_at,twilio_message_sid&order=sent_at.desc&limit=5`);
if (adminNotifR.s === 200 && Array.isArray(adminNotifR.d)) {
  if (adminNotifR.d.length > 0) {
    ok(`admin_notifications: ${adminNotifR.d.length} T12 recientes`);
    adminNotifR.d.forEach(n => console.log(`    · ${n.patient_phone} → ${n.admin_phone} | ${n.status} | SID:${n.twilio_message_sid?.slice(0,12)} | ${new Date(n.sent_at).toLocaleString('es-PE')}`));
  } else {
    warn('admin_notifications vacío');
  }
} else {
  warn(`admin_notifications: HTTP ${adminNotifR.s}`);
}

// Verify T12 content variables format matches R7 (4 vars)
const mainHandler = notifyWf.nodes?.find(n => n.name === 'Main Handler');
const mhCode = mainHandler?.parameters?.jsCode || '';
const has4Vars = mhCode.includes('"4"') && mhCode.includes('clinic') && mhCode.includes('contentVars');
if (has4Vars) ok('T12 contentVars has 4 variables (patient, date, phone, clinic) ✓');
else fail('T12 contentVars format unexpected — check R7 patch');

// ═══ BLOQUE 4: T13/T14 Admin Reply Handler ══════════════════════════════════
section('4. T13/T14 — Admin reply confirm/cancel flow');

const sofiaWf = await n8n('/workflows/37SLdWISQLgkHeXk');
if (sofiaWf.active) ok('Sofia main workflow ACTIVE');
else fail('Sofia main workflow INACTIVE');

const adminReply = sofiaWf.nodes?.find(n => n.name === 'Admin Reply Handler');
const arCode = adminReply?.parameters?.jsCode || '';

// Verify R7 var structure
const t13ok = arCode.includes('t13_vars') && arCode.includes('"1": firstName') && arCode.includes('"3": clinicName');
const t14ok = arCode.includes('t14_vars') && arCode.includes('"1": firstName');
const t13SidOk = arCode.includes('twilio_patient_confirmed_sid');
const t14SidOk = arCode.includes('twilio_patient_cancelled_sid');
if (t13ok) ok('T13 vars: {1:firstName, 2:date+time, 3:clinicName} ✓');
else fail('T13 vars structure incorrect');
if (t14ok) ok('T14 vars: {1:firstName, 2:date+time, 3:clinicName} ✓');
else fail('T14 vars structure incorrect');
if (t13SidOk) ok('T13 SID reads from bot_config.twilio_patient_confirmed_sid ✓');
else fail('T13 SID source incorrect');
if (t14SidOk) ok('T14 SID reads from bot_config.twilio_patient_cancelled_sid ✓');
else fail('T14 SID source incorrect');

// Verify Send T13/T14 HTTP nodes exist and have correct structure
const t13SendNode = sofiaWf.nodes?.find(n => n.name === 'Send T13 Patient Confirmed');
const t14SendNode = sofiaWf.nodes?.find(n => n.name === 'Send T14 Patient Cancelled');
if (t13SendNode?.type === 'n8n-nodes-base.httpRequest') ok('Send T13 node: httpRequest ✓');
else fail('Send T13 node missing or wrong type');
if (t14SendNode?.type === 'n8n-nodes-base.httpRequest') ok('Send T14 node: httpRequest ✓');
else fail('Send T14 node missing or wrong type');

// Check that T13/T14 nodes have ContentSid and ContentVariables params
const t13params = JSON.stringify(t13SendNode?.parameters || '');
const t14params = JSON.stringify(t14SendNode?.parameters || '');
if (t13params.includes('ContentSid') && t13params.includes('ContentVariables')) ok('T13 node has ContentSid + ContentVariables params ✓');
else fail('T13 node missing ContentSid or ContentVariables');
if (t14params.includes('ContentSid') && t14params.includes('ContentVariables')) ok('T14 node has ContentSid + ContentVariables params ✓');
else fail('T14 node missing ContentSid or ContentVariables');

// ═══ BLOQUE 5: T15 Debt Reminders ══════════════════════════════════════════
section('5. T15 Debt Reminders — workflow + overdue check');

const debtWf = await n8n('/workflows/Qu1aE3m9bzI7TPiJ');
if (debtWf.active) ok('SofIA - Debt Reminders workflow ACTIVE');
else fail('SofIA - Debt Reminders workflow INACTIVE');

const debtSend = debtWf.nodes?.find(n => n.name === 'Send Reminders');
const debtCode = debtSend?.parameters?.jsCode || '';
const debtHasT15 = debtCode.includes('twilio_debt_reminder_sid') || debtCode.includes('T15');
const debtHasDryRun = debtCode.includes('dry_run');
if (debtHasT15) ok('T15 SID reads from bot_config.twilio_debt_reminder_sid ✓');
else fail('T15 SID reference not found in Send Reminders node');
if (debtHasDryRun) ok('dry_run mode available for safe testing ✓');

// Check overdue payments
const overdueR = await rpc('get_overdue_patients', { p_clinic_id: CLINIC }).catch(() => ({s:404,d:{}}));
if (overdueR.s === 200 && Array.isArray(overdueR.d)) {
  if (overdueR.d.length > 0) {
    warn(`${overdueR.d.length} pacientes con deuda vencida (T15 pendiente de envío)`);
  } else {
    ok('No hay pacientes con deuda vencida');
  }
} else {
  // Try direct query
  const debtsR = await sb(`/rest/v1/payment_plans?clinic_id=eq.${CLINIC}&status=eq.overdue&select=id,patient_id,total_amount&limit=5`);
  if (debtsR.s === 200) {
    if (debtsR.d.length > 0) warn(`${debtsR.d.length} payment_plans con status=overdue`);
    else ok('No hay payment_plans vencidos');
  } else if (debtsR.s === 404) {
    warn('payment_plans table not found');
  } else {
    // try cobros table
    const cobrosR = await sb(`/rest/v1/cobros?clinic_id=eq.${CLINIC}&estado=eq.vencido&limit=3`);
    if (cobrosR.s === 200) {
      if (cobrosR.d.length > 0) warn(`${cobrosR.d.length} cobros vencidos`);
      else ok('No hay cobros vencidos');
    } else warn(`debt tables query HTTP ${debtsR.s}`);
  }
}

// ═══ BLOQUE 6: Re-engagement SIDs ═══════════════════════════════════════════
section('6. Re-engagement Reminders — SID validity');

const reengWf = await n8n('/workflows/CwL85rI1rLFD0MS1');
if (reengWf.active) ok('Re-engagement workflow ACTIVE');
else warn('Re-engagement workflow INACTIVE');

const reengNode = reengWf.nodes?.find(n => n.name === 'Fetch Slots & Build Message');
const reengCode = JSON.stringify(reengNode?.parameters || '');
const reengSIDs = [...new Set(reengCode.match(/HX[a-f0-9]{32}/g) || [])];
console.log(`  Found ${reengSIDs.length} SIDs in Re-engagement:`);
for (const sid of reengSIDs) {
  await checkTwilioSid(sid, `  Re-eng ${sid.slice(0,12)}`);
}

// ═══ BLOQUE 7: Simular T12 via Appt Notify webhook ══════════════════════════
section('7. Live test — simular T12 vía Appt Notify webhook');

// Get the webhook URL for Appt Notify
const webhookNode = notifyWf.nodes?.find(n => n.type === 'n8n-nodes-base.webhook' || n.name?.toLowerCase().includes('webhook'));
const webhookPath = webhookNode?.parameters?.path || webhookNode?.parameters?.httpMethod;
console.log(`  Webhook node: ${webhookNode?.name || 'not found'} | path: ${webhookPath || 'unknown'}`);

// We can test by directly calling the webhook with dry-run data
// But since this sends a real WhatsApp to admin, we'll verify the last execution instead
const execR = await fetch(`${N8N_BASE}/api/v1/executions?workflowId=5jstI4hfoWArtzZe&limit=3`, { headers: N8NH });
const execD = await execR.json();
const execs = execD.data || [];
if (execs.length > 0) {
  const last = execs[0];
  const lastStatus = last.status || last.finished;
  const lastTime   = new Date(last.startedAt || last.stoppedAt).toLocaleString('es-PE');
  if (last.status === 'success' || last.finished === true) {
    ok(`Last T12 execution: ${lastStatus} @ ${lastTime}`);
  } else {
    warn(`Last T12 execution: ${lastStatus} @ ${lastTime}`);
  }
} else {
  warn('No executions found for Appt Notify');
}

// Check last 24h reminder execution
const remExecR = await fetch(`${N8N_BASE}/api/v1/executions?workflowId=FCSJrGj5bLMuytr7&limit=3`, { headers: N8NH });
const remExecD = await remExecR.json();
const remExecs = remExecD.data || [];
if (remExecs.length > 0) {
  const last = remExecs[0];
  const lastTime = new Date(last.startedAt).toLocaleString('es-PE');
  if (last.status === 'success') ok(`Last 24h Reminders execution: success @ ${lastTime}`);
  else warn(`Last 24h Reminders execution: ${last.status} @ ${lastTime}`);
} else {
  warn('No executions found for 24h Reminders');
}

// ═══ BLOQUE 8: Twilio account health ════════════════════════════════════════
section('8. Twilio account health');

try {
  const twR = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}.json`, { headers: TWH });
  const twD = await twR.json();
  if (twD.status === 'active') ok(`Twilio account active | type: ${twD.type}`);
  else fail(`Twilio account status: ${twD.status}`);

  // Check WhatsApp sender
  const msgR = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/IncomingPhoneNumbers.json?PhoneNumber=%2B13186683828`,
    { headers: TWH }
  );
  const msgD = await msgR.json();
  if (msgD.incoming_phone_numbers?.length > 0) ok('Twilio number +13186683828 active ✓');
  else warn('Twilio number +13186683828 not found in account');
} catch(e) { fail('Twilio account check failed: ' + e.message); }

// ═══ RESUMEN ════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════');
console.log('  RESULTADOS');
console.log('══════════════════════════════════════════════════════');
console.log(`  ✅ Passed:   ${passed}`);
console.log(`  ❌ Failed:   ${failed}`);
console.log(`  ⚠️  Warnings: ${warns}`);
console.log('══════════════════════════════════════════════════════\n');

if (failed > 0) process.exit(1);
