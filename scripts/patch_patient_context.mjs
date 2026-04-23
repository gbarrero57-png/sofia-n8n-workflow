/**
 * patch_patient_context.mjs
 * Patches SofIA workflow (37SLdWISQLgkHeXk) to:
 *   1. Bot Pause Check     — fetch get_patient_context_for_bot after governance
 *   2. Preparar Prompt INFO — inject patient context in system prompt + personalize greeting
 */

import { readFileSync } from 'fs';

const N8N_URL = process.env.N8N_API_URL || 'https://workflows.n8n.redsolucionesti.com';
const API_KEY = process.env.N8N_API_KEY || (() => {
  try { return readFileSync('n8n-mcp/.env', 'utf8').match(/N8N_API_KEY=(.+)/)?.[1]?.trim() || ''; } catch { return ''; }
})();
const WF_ID = '37SLdWISQLgkHeXk';

async function getWf() {
  const r = await fetch(`${N8N_URL}/api/v1/workflows/${WF_ID}`, { headers: { 'X-N8N-API-KEY': API_KEY } });
  if (!r.ok) throw new Error(`GET ${r.status}: ${await r.text()}`);
  return r.json();
}

async function putWf(wf) {
  const r = await fetch(`${N8N_URL}/api/v1/workflows/${WF_ID}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings, staticData: wf.staticData })
  });
  if (!r.ok) throw new Error(`PUT ${r.status}: ${await r.text()}`);
  return r.json();
}

// ─── Patch 1: Bot Pause Check ─────────────────────────────────────────────

const BPC_OLD = `return [{ json: {
    ...$json,
    governance_conversation_id: conversation?.conversation_id ?? null,
    governance_status:          conversation?.status ?? 'active',
    governance_checked:         true,
    _start_ts:                  START_TS   // Para calcular duration_ms al final
} }];`;

const BPC_NEW = `// 4. PATIENT CONTEXT — contexto del paciente para personalizar respuestas IA
// Fail-open: si falla, el bot continua sin contexto de historial
let patientCtx = { known: false };
const patientPhone = $json.contact_phone || '';
if (patientPhone) {
    try {
        const ctxResult = await supabaseRpc('get_patient_context_for_bot', {
            p_clinic_id: clinicId,
            p_phone:     patientPhone
        }, { attempts: 1 });
        patientCtx = Array.isArray(ctxResult) ? (ctxResult[0] || { known: false }) : (ctxResult || { known: false });
    } catch(e) {
        console.warn(JSON.stringify({ ts: new Date().toISOString(), event: 'PATIENT_CTX_WARN', error: e.message }));
    }
}

return [{ json: {
    ...$json,
    governance_conversation_id: conversation?.conversation_id ?? null,
    governance_status:          conversation?.status ?? 'active',
    governance_checked:         true,
    _start_ts:                  START_TS,
    patient_ctx:                patientCtx
} }];`;

// ─── Patch 2a: Preparar Prompt INFO — patientSection variable ─────────────

const PROMPT_ANCHOR = `var kbSectionNormal = (kb_context && kb_context !== noKb) ? "INFORMACION DE LA CLINICA:\\n" + kb_context + "\\n\\n" : "";`;

const PROMPT_INJECT = `var kbSectionNormal = (kb_context && kb_context !== noKb) ? "INFORMACION DE LA CLINICA:\\n" + kb_context + "\\n\\n" : "";

// Contexto del paciente (historial clinico para personalizar la respuesta)
var patientCtxData = $json.patient_ctx || { known: false };
var patientSection = "";
if (patientCtxData.known) {
  var pParts = ["HISTORIAL DEL PACIENTE:", patientCtxData.summary];
  if (patientCtxData.has_allergies && patientCtxData.allergy_alert) {
    pParts.push("ALERTA ALERGIAS: " + patientCtxData.allergy_alert + " (mencionalo si el tratamiento es relevante)");
  }
  patientSection = pParts.join("\\n") + "\\n\\n";
}`;

// ─── Patch 2b: inject patientSection into lines array ─────────────────────

const LINES_OLD = `  kbSectionNormal,`;
const LINES_NEW = `  kbSectionNormal,\n  patientSection,`;

// ─── Patch 2c: personalized greeting ─────────────────────────────────────

const GREETING_OLD = `if (isGreeting) {
  system_prompt = "Eres SofIA, asistente virtual de " + clinic_name + ". El paciente te saludo. Responde EXACTAMENTE con: \\"" + welcomeMsg + "\\" No agregues nada mas.";
  user_prompt = message_text;
  return [{ json: Object.assign({}, $json, { system_prompt, user_prompt, _prompt_ready: true }) }];
}`;

const GREETING_NEW = `if (isGreeting) {
  var greetingCtx = $json.patient_ctx || { known: false };
  var greetMsg = welcomeMsg;
  if (greetingCtx.known && greetingCtx.full_name) {
    var firstName = greetingCtx.full_name.split(' ')[0];
    greetMsg = "\\u00a1Hola " + firstName + "! \\ud83d\\ude0a Bienvenido/a de vuelta a " + clinic_name + ". \\u00bfEn qu\\u00e9 te puedo ayudar?";
  }
  system_prompt = "Eres SofIA, asistente virtual de " + clinic_name + ". El paciente te saludo. Responde EXACTAMENTE con: \\"" + greetMsg + "\\" No agregues nada mas.";
  user_prompt = message_text;
  return [{ json: Object.assign({}, $json, { system_prompt, user_prompt, _prompt_ready: true }) }];
}`;

// ─── Main ─────────────────────────────────────────────────────────────────

const wf = await getWf();
let changed = 0;

for (const node of wf.nodes) {

  // ── Patch 1 ──
  if (node.name === 'Bot Pause Check') {
    const code = node.parameters.jsCode;
    if (code.includes('patient_ctx')) {
      console.log('[SKIP] Bot Pause Check already patched');
    } else if (code.includes(BPC_OLD)) {
      node.parameters.jsCode = code.replace(BPC_OLD, BPC_NEW);
      console.log('[OK]   Bot Pause Check patched');
      changed++;
    } else {
      console.error('[ERR]  Bot Pause Check: OLD string not found');
      process.exit(1);
    }
  }

  // ── Patch 2 ──
  if (node.name === 'Preparar Prompt INFO') {
    let code = node.parameters.jsCode;
    let nodeChanged = 0;

    // 2a: patientSection variable
    if (code.includes('patientSection')) {
      console.log('[SKIP] patientSection variable already present');
    } else if (code.includes(PROMPT_ANCHOR)) {
      code = code.replace(PROMPT_ANCHOR, PROMPT_INJECT);
      console.log('[OK]   patientSection variable added');
      nodeChanged++;
    } else {
      console.error('[ERR]  PROMPT_ANCHOR not found');
      process.exit(1);
    }

    // 2b: inject into lines[]
    if (code.includes('patientSection,')) {
      console.log('[SKIP] patientSection already in lines[]');
    } else if (code.includes(LINES_OLD)) {
      code = code.replace(LINES_OLD, LINES_NEW);
      console.log('[OK]   patientSection injected into lines[]');
      nodeChanged++;
    } else {
      console.error('[ERR]  LINES_OLD not found');
      process.exit(1);
    }

    // 2c: personalized greeting
    if (code.includes('greetingCtx')) {
      console.log('[SKIP] greeting personalization already present');
    } else if (code.includes(GREETING_OLD)) {
      code = code.replace(GREETING_OLD, GREETING_NEW);
      console.log('[OK]   greeting personalized');
      nodeChanged++;
    } else {
      console.warn('[WARN] GREETING_OLD not found — greeting not personalized (non-fatal)');
    }

    node.parameters.jsCode = code;
    if (nodeChanged > 0) changed++;
  }
}

if (changed === 0) {
  console.log('Nothing to patch — already up to date.');
  process.exit(0);
}

console.log(`\nPushing ${changed} patched node(s) to n8n...`);
await putWf(wf);
console.log('Done. SofIA workflow updated.');
