/**
 * patch_v41_demo_e2e.mjs
 * E2E coherence fix for SofIA Demo flow
 *
 * Fixes:
 * 1. Prices: S/299/499/799 → S/290/490/790 everywhere (match landing page)
 * 2. Tier rename: "Enterprise" → "Clínica" (S/790), Enterprise becomes custom
 * 3. Remove dead `lead_intro` node (unreachable, redundant with handleLeadCapture intro message)
 * 4. Fix `info_responde` pos_2 double 📅 emoji → ⚡
 * 5. Legacy DEMO_PLAN_INFO in Responder Demo: update prices + rename tier
 */

import { readFileSync } from 'fs';
import https from 'https';

const SUPA_URL = 'https://inhyrrjidhzrbqecnptn.supabase.co';
const SUPA_KEY = 'process.env.SUPABASE_SERVICE_KEY';
const DEMO_CLINIC_ID = 'c6c15fca-d7fc-4d98-83c1-2c5cb5a6bef1';

const N8N_KEY = readFileSync('n8n-mcp/.env','utf8').match(/N8N_API_KEY=(.+)/)?.[1]?.trim();
const N8N_HOST = 'workflows.n8n.redsolucionesti.com';
const WORKFLOW_ID = '37SLdWISQLgkHeXk';

// ── Helpers ──────────────────────────────────────────────────────────────────

function httpReq(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function getWorkflow() {
  const r = await httpReq({ hostname: N8N_HOST, port: 443, path: `/api/v1/workflows/${WORKFLOW_ID}`, method: 'GET', headers: { 'X-N8N-API-KEY': N8N_KEY } });
  if (r.status !== 200) throw new Error('Failed to fetch workflow: ' + r.status);
  return r.body;
}

async function putWorkflow(wf) {
  const payload = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings || {}, staticData: wf.staticData || null };
  const body = JSON.stringify(payload);
  const r = await httpReq({ hostname: N8N_HOST, port: 443, path: `/api/v1/workflows/${WORKFLOW_ID}`, method: 'PUT', headers: { 'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, body);
  if (r.status !== 200) throw new Error('Failed to PUT workflow: ' + r.status + ' ' + JSON.stringify(r.body).slice(0,300));
  return r.body;
}

async function getSupabaseClinic() {
  const r = await httpReq({ hostname: 'inhyrrjidhzrbqecnptn.supabase.co', port: 443, path: `/rest/v1/clinics?id=eq.${DEMO_CLINIC_ID}&select=bot_config`, method: 'GET', headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY } });
  if (r.status !== 200 || !r.body[0]) throw new Error('Failed to fetch clinic: ' + r.status);
  return r.body[0].bot_config;
}

async function patchSupabaseClinic(bot_config) {
  const body = JSON.stringify({ bot_config });
  const r = await httpReq({ hostname: 'inhyrrjidhzrbqecnptn.supabase.co', port: 443, path: `/rest/v1/clinics?id=eq.${DEMO_CLINIC_ID}`, method: 'PATCH', headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Prefer': 'return=minimal' } }, body);
  if (r.status !== 200 && r.status !== 204) throw new Error('Failed to PATCH clinic: ' + r.status + ' ' + JSON.stringify(r.body));
}

// ════════════════════════════════════════════════════════════════════════════
// PART 1: Update Supabase bot_config demo_flow nodes
// ════════════════════════════════════════════════════════════════════════════

async function patchSupabase() {
  console.log('📥 Fetching SofIA Demo bot_config from Supabase...');
  const bc = await getSupabaseClinic();
  const df = bc.demo_flow;
  const nodes = df.nodes;

  // ── Fix 1: precios node — update prices + rename Enterprise → Clínica ──
  nodes.precios.body =
    '💰 *Planes de SofIA AI*\n\n' +
    '🟢 *Básico* — S/290/mes — 500 conversaciones\n' +
    '🔵 *Pro* — S/490/mes — 1,500 conversaciones ⭐\n' +
    '🏥 *Clínica* — S/790/mes — ilimitadas + multi-doctor\n\n' +
    '_Sin contrato. Cancela cuando quieras._\n\n' +
    '¿Cuál quieres conocer?';
  // Update option labels
  nodes.precios.options[0].label = '🟢 Básico S/290/mes';
  nodes.precios.options[1].label = '🔵 Pro S/490/mes ⭐';
  nodes.precios.options[2].label = '🏥 Clínica S/790/mes';
  nodes.precios.options[2].next  = 'precio_clinica'; // rename target
  // pos_4 and pos_5 stay as is

  // ── Fix 2: precio_basico — update price ──
  nodes.precio_basico.body =
    '🟢 *Plan Básico — S/290/mes*\n\n' +
    '✅ Agendamiento automático 24/7\n' +
    '✅ IA para preguntas frecuentes\n' +
    '✅ Base de conocimiento personalizada\n' +
    '✅ 1 WhatsApp + panel incluido\n' +
    '✅ 500 conversaciones/mes\n\n' +
    'Ideal para clínicas que *empiezan con automatización*.\n\n' +
    '💡 _Sin contrato. Cancela cuando quieras._';

  // ── Fix 3: precio_pro — update price + add hook line ──
  nodes.precio_pro.body =
    '🔵 *Plan Pro — S/490/mes* ⭐ El más popular\n\n' +
    'Todo del Básico, más:\n' +
    '✅ Recordatorios 24h antes de cada cita\n' +
    '✅ Reportes mensuales por email\n' +
    '✅ Soporte prioritario WhatsApp\n' +
    '✅ 1,500 conversaciones/mes\n' +
    '✅ Métricas avanzadas\n\n' +
    '💡 _Sin contrato. Cancela cuando quieras._';

  // ── Fix 4: Add precio_clinica node (was precio_enterprise) ──
  // Copy old enterprise node with updated content
  nodes.precio_clinica = {
    body:
      '🏥 *Plan Clínica — S/790/mes*\n\n' +
      'Para clínicas que quieren lo máximo:\n' +
      '✅ Todo del Plan Pro\n' +
      '✅ Múltiples doctores y especialidades\n' +
      '✅ Reportes avanzados por doctor\n' +
      '✅ Hasta 5,000 conversaciones/mes\n' +
      '✅ Soporte 24/7\n\n' +
      '🟣 ¿Múltiples sedes? Consulta nuestro *Plan Enterprise* (precio personalizado).',
    type: 'lp3',
    options: [
      { id: 'pos_1', next: null, label: '📅 Demo del Plan Clínica', action: '_LEAD_CAPTURE', lead_plan: 'clinica' },
      { id: 'pos_2', next: 'precio_comparar', label: '📋 Comparar planes' },
      { id: 'pos_3', next: null, label: '🤝 Hablar con un asesor', action: '_HUMAN' }
    ]
  };

  // Keep old precio_enterprise in case of stale references, redirect to precio_clinica
  nodes.precio_enterprise = {
    ...nodes.precio_clinica,
    body: nodes.precio_clinica.body // same content
  };

  // ── Fix 5: precio_comparar — update prices ──
  nodes.precio_comparar.body =
    '📋 *Comparativa de planes*\n\n' +
    '🟢 Básico → S/290/mes → 500 conv.\n' +
    '🔵 Pro → S/490/mes → 1,500 conv. ⭐\n' +
    '🏥 Clínica → S/790/mes → ilimitadas\n' +
    '🟣 Enterprise → precio personalizado → multi-sede\n\n' +
    '✨ Sin contrato. Cancela cuando quieras.\n' +
    '💡 *Descuento 15%* pagando 6 meses | *25%* pagando 1 año';

  // ── Fix 6: Remove dead lead_intro node ──
  delete nodes.lead_intro;

  // ── Fix 7: info_responde — fix double 📅 emoji on pos_2 ──
  nodes.info_responde.options[1].label = '⚡ Probar agendamiento en vivo';

  // ── Write back ──
  bc.demo_flow = { ...df, nodes };

  console.log('📤 Patching SofIA Demo bot_config in Supabase...');
  await patchSupabaseClinic(bc);
  console.log('✅ Supabase bot_config updated');
}

// ════════════════════════════════════════════════════════════════════════════
// PART 2: Update Responder Demo node — legacy DEMO_PLAN_INFO prices
// ════════════════════════════════════════════════════════════════════════════

async function patchWorkflow() {
  console.log('📥 Fetching n8n workflow...');
  const wf = await getWorkflow();

  const node = wf.nodes.find(n => n.name === 'Responder Demo');
  if (!node) throw new Error('Responder Demo node not found');

  let code = node.parameters.jsCode;

  // Fix DEMO_PLAN_INFO "basico" price
  code = code.replace(
    /Plan B[aá]sico.*?S\/\.?299\/mes/g,
    'Plan Básico — S/290/mes'
  );
  code = code.replace(
    /\uD83D\uDFE2 \*Plan B[aá]sico.*?S\/\.?299\/mes\*/,
    '🟢 *Plan Básico — S/290/mes*'
  );
  // Fix plan basico full block
  code = code.replace(
    "planText = \"\\uD83D\\uDFE2 *Plan B\\u00e1sico \\u2014 S/.299/mes*",
    "planText = \"\\uD83D\\uDFE2 *Plan B\\u00e1sico \\u2014 S/290/mes*"
  );
  code = code.replace(
    'planText = "\\uD83D\\uDFE2 *Plan B\\u00e1sico \\u2014 S/.299/mes*',
    'planText = "\\uD83D\\uDFE2 *Plan B\\u00e1sico \\u2014 S/290/mes*'
  );

  // Fix DEMO_PLAN_INFO "pro" price
  code = code.replace(
    'S/.499/mes* \\u2B50 (m\\u00e1s popular)',
    'S/490/mes* \\u2B50 (m\\u00e1s popular)'
  );
  code = code.replace(
    'S/.499/mes*',
    'S/490/mes*'
  );

  // Fix DEMO_PLAN_INFO "enterprise" → rename to Clínica + update price
  code = code.replace(
    'Plan Enterprise \\u2014 desde S/.799/mes',
    'Plan Cl\\u00ednica \\u2014 S/790/mes'
  );
  code = code.replace(
    'desde S/.799/mes',
    'S/790/mes'
  );
  code = code.replace(
    'Plan Enterprise \\u2014 desde S/.799',
    'Plan Cl\\u00ednica \\u2014 S/790'
  );

  // Fix comparar block prices
  code = code.replace(
    'B\\u00e1sico \\u2192 S/.299/mes',
    'B\\u00e1sico \\u2192 S/290/mes'
  );
  code = code.replace(
    'Pro \\u2192 S/.499/mes',
    'Pro \\u2192 S/490/mes'
  );
  code = code.replace(
    'Enterprise \\u2192 desde S/.799',
    'Cl\\u00ednica \\u2192 S/790'
  );
  code = code.replace(
    'desde S/.799/mes',
    'S/790/mes'
  );

  // Fix generic price mentions in fallback planText
  code = code.replace(
    'S/.299/mes',
    'S/290/mes'
  );
  code = code.replace(
    'S/.499/mes',
    'S/490/mes'
  );
  code = code.replace(
    'S/.799/mes',
    'S/790/mes'
  );

  node.parameters.jsCode = code;

  console.log('📤 Pushing updated Responder Demo to n8n...');
  const result = await putWorkflow(wf);
  console.log('✅ n8n workflow updated, version:', result.versionId || 'ok');
}

// ════════════════════════════════════════════════════════════════════════════

async function main() {
  try {
    await patchSupabase();
    await patchWorkflow();
    console.log('\n🎉 patch_v41 complete — SofIA demo E2E coherence restored');
    console.log('   Prices: S/290 / S/490 / S/790 (match landing page)');
    console.log('   Clínica tier added, lead_intro dead node removed');
    console.log('   info_responde emoji fixed, DEMO_PLAN_INFO prices updated');
  } catch(e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
}

main();
