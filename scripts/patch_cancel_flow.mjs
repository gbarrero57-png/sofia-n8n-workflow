/**
 * patch_cancel_flow.mjs — v2: Fix flujo de cancelación de citas
 *
 * Problemas corregidos:
 *   1. Buscar Citas Paciente: mostraba citas pasadas (sin filtro futuro)
 *      → Filtra start_time >= now(), solo 1 cita (la próxima)
 *   2. Formatear Citas: sin estado awaiting_cancel_confirm
 *      → Setea label y cancela directo con "1"/"sí"
 *   3. Pre-Clasificador: "1" se ruteaba a DEMO_FLOW cuando awaiting_cancel_confirm
 *      → Intercepta el estado antes de los list-picker IDs
 *
 * Run: node scripts/patch_cancel_flow.mjs
 */

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const BASE   = 'https://workflows.n8n.redsolucionesti.com';
const WF_ID  = '37SLdWISQLgkHeXk';
const CW_BASE = 'https://chat.redsolucionesti.com';

// ─── Fetch workflow ───────────────────────────────────────────────────────
const wf = await fetch(`${BASE}/api/v1/workflows/${WF_ID}`, {
  headers: { 'X-N8N-API-KEY': API_KEY }
}).then(r => r.json());
if (!wf.nodes) { console.error('ERROR fetching:', JSON.stringify(wf).slice(0,200)); process.exit(1); }
console.log(`Workflow: ${wf.name} | ${wf.nodes.length} nodes`);
const getNode = name => wf.nodes.find(n => n.name === name);

// ══════════════════════════════════════════════════════════════════════════
// PATCH 1 — Buscar Citas Paciente: solo próxima cita futura, limit=1
// ══════════════════════════════════════════════════════════════════════════
const buscarNode = getNode('Buscar Citas Paciente');
if (!buscarNode) { console.error('Node "Buscar Citas Paciente" not found'); process.exit(1); }
buscarNode.parameters.jsCode = `const ctx = $input.first().json;
const SUPABASE_URL = $env.N8N_SUPABASE_URL;
const SERVICE_KEY  = $env.N8N_SUPABASE_SERVICE_KEY;
const phone    = ctx.contact_phone || "";
const clinicId = ctx.clinic_id || "";

if (!phone) {
  return [{ json: Object.assign({}, ctx, { raw_appointments: [], has_appointments: false, phone_missing: true }) }];
}

const fields = "select=id,start_time,end_time,service,status,patient_name";
const base   = SUPABASE_URL + "/rest/v1/appointments";
const hdrs   = { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY };
const nowISO = new Date().toISOString();

let appointments = [];

// 1. Próxima cita futura (scheduled o confirmed), la más cercana, solo 1
const futureQ = [
  base + "?contact_phone=eq." + encodeURIComponent(phone) + "&clinic_id=eq." + clinicId +
        "&status=in.(scheduled,confirmed)&start_time=gte." + nowISO + "&order=start_time.asc&limit=1&" + fields,
  base + "?phone=eq." + encodeURIComponent(phone) + "&clinic_id=eq." + clinicId +
        "&status=in.(scheduled,confirmed)&start_time=gte." + nowISO + "&order=start_time.asc&limit=1&" + fields
];
for (var qi = 0; qi < futureQ.length; qi++) {
  try {
    const res = await this.helpers.httpRequest({ method: "GET", url: futureQ[qi], headers: hdrs, json: true });
    if (res && res.length > 0) { appointments = res; break; }
  } catch(e) { /* try next */ }
}

// 2. Fallback: última cita registrada si no hay futuras
if (appointments.length === 0) {
  const fallQ = [
    base + "?contact_phone=eq." + encodeURIComponent(phone) + "&clinic_id=eq." + clinicId +
          "&status=neq.cancelled&order=start_time.desc&limit=1&" + fields,
    base + "?phone=eq." + encodeURIComponent(phone) + "&clinic_id=eq." + clinicId +
          "&status=neq.cancelled&order=start_time.desc&limit=1&" + fields
  ];
  for (var fi = 0; fi < fallQ.length; fi++) {
    try {
      const res = await this.helpers.httpRequest({ method: "GET", url: fallQ[fi], headers: hdrs, json: true });
      if (res && res.length > 0) { appointments = res; break; }
    } catch(e) { /* try next */ }
  }
}

return [{ json: Object.assign({}, ctx, { raw_appointments: appointments, has_appointments: appointments.length > 0 }) }];
`;
console.log('✅ Patched: Buscar Citas Paciente (future-only, limit=1)');

// ══════════════════════════════════════════════════════════════════════════
// PATCH 2 — Formatear Citas: awaiting_cancel_confirm + confirmación directa
// ══════════════════════════════════════════════════════════════════════════
const formatearNode = getNode('Formatear Citas');
if (!formatearNode) { console.error('Node "Formatear Citas" not found'); process.exit(1); }
formatearNode.parameters.jsCode = `const ctx = $input.first().json;
const appts      = ctx.raw_appointments || [];
const clinicName = ctx.clinic_name || "la clinica";
const clinicId   = ctx.clinic_id   || "";
const SUPABASE_URL  = $env.N8N_SUPABASE_URL;
const SERVICE_KEY   = $env.N8N_SUPABASE_SERVICE_KEY;

// Chatwoot helpers
const convLabels = (ctx.raw_payload && ctx.raw_payload.conversation && ctx.raw_payload.conversation.labels) || [];
const accountId  = ctx.account_id || 2;
const convId     = ctx.conversation_id;
const cwToken    = (ctx.bot_config && ctx.bot_config.chatwoot_api_token) || "yypAwZDH2dV3crfbqJqWCgj1";
const cwBase     = "${CW_BASE}";
const cwHdrs     = { api_access_token: cwToken, "Content-Type": "application/json" };

const msgText = (ctx.message_text || "").toLowerCase().trim()
  .normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");

// ── Helper: set/clear awaiting_cancel_confirm label ────────────────────
const setCancelLabel = async (add) => {
  var newLabels = convLabels.filter(function(l) { return l !== "awaiting_cancel_confirm"; });
  if (add) newLabels.push("awaiting_cancel_confirm");
  try {
    await this.helpers.httpRequest({
      method: "POST",
      url: cwBase + "/api/v1/accounts/" + accountId + "/conversations/" + convId + "/labels",
      headers: cwHdrs,
      body: { labels: newLabels },
      json: true
    });
  } catch(e) { console.warn("label err:", e.message); }
};

// ── Estado awaiting_cancel_confirm ────────────────────────────────────
const _inCancelConfirm = convLabels.includes("awaiting_cancel_confirm");
const _confirmYes = /^(1|si|yes|ok|dale|cancelar|confirmar|listo|va|claro|afirmativo)$/.test(msgText);
const _confirmNo  = /^(2|no|volver|menu|atras|no cancelar|no gracias)$/.test(msgText);

if (_inCancelConfirm && appts.length > 0) {
  if (_confirmNo) {
    await setCancelLabel(false);
    return [{ json: Object.assign({}, ctx, { appointments_text: "Entendido, tu cita sigue activa. \\u00bfEn qu\\u00e9 m\\u00e1s te ayudo?" }) }];
  }
  if (_confirmYes) {
    const apt = appts[0];
    if (apt && apt.id) {
      const dt    = new Date(apt.start_time);
      const fecha = dt.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Lima" });
      const hora  = dt.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });
      try {
        await this.helpers.httpRequest({
          method: "PATCH",
          url: SUPABASE_URL + "/rest/v1/appointments?id=eq." + apt.id + "&clinic_id=eq." + clinicId,
          headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY,
                     "Content-Type": "application/json", Prefer: "return=minimal" },
          body: { status: "cancelled" },
          json: true
        });
        console.log(JSON.stringify({ ts: new Date().toISOString(), event: "APPOINTMENT_CANCELLED", id: apt.id }));
        await setCancelLabel(false);
        const ok = "\\u2705 Tu cita del *" + fecha + "* a las *" + hora + "* ha sido cancelada exitosamente." +
          "\\n\\nEse horario queda disponible." +
          "\\n\\n*1.* Agendar nueva cita\\xa0\\xa0 *2.* Hablar con agente";
        return [{ json: Object.assign({}, ctx, { appointments_text: ok, appointment_cancelled: true, cancelled_appointment_id: apt.id }) }];
      } catch(e) {
        console.error(JSON.stringify({ ts: new Date().toISOString(), event: "CANCEL_ERROR", error: e.message }));
        await setCancelLabel(false);
        return [{ json: Object.assign({}, ctx, { appointments_text: "Hubo un problema al cancelar. Escribe *agente* para ayuda." }) }];
      }
    }
  }
}

// ── Legacy: "cancelar N" en el mensaje ───────────────────────────────
const cancelMatch = msgText.match(/cancelar\\s*([1-9])/);
if (cancelMatch) {
  const apt = appts[parseInt(cancelMatch[1]) - 1];
  if (apt && apt.id) {
    const dt    = new Date(apt.start_time);
    const fecha = dt.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Lima" });
    const hora  = dt.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });
    try {
      await this.helpers.httpRequest({
        method: "PATCH",
        url: SUPABASE_URL + "/rest/v1/appointments?id=eq." + apt.id + "&clinic_id=eq." + clinicId,
        headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY,
                   "Content-Type": "application/json", Prefer: "return=minimal" },
        body: { status: "cancelled" },
        json: true
      });
      console.log(JSON.stringify({ ts: new Date().toISOString(), event: "APPOINTMENT_CANCELLED", id: apt.id }));
      await setCancelLabel(false);
      const ok = "\\u2705 Cita del *" + fecha + "* a las *" + hora + "* cancelada exitosamente." +
        "\\n\\n*1.* Agendar nueva cita\\xa0\\xa0 *2.* Hablar con agente";
      return [{ json: Object.assign({}, ctx, { appointments_text: ok, appointment_cancelled: true }) }];
    } catch(e) {
      await setCancelLabel(false);
      return [{ json: Object.assign({}, ctx, { appointments_text: "Problema al cancelar. Escribe *agente*." }) }];
    }
  }
}

// ── Sin citas ─────────────────────────────────────────────────────────
if (!appts || appts.length === 0) {
  var noApptTxt = ctx.phone_missing
    ? "No pude identificar tu n\\u00famero. Contacta directamente a la cl\\u00ednica."
    : "No encontr\\u00e9 citas pr\\u00f3ximas en " + clinicName + ".\\n\\n*1.* Agendar nueva cita\\n*2.* Hablar con un agente";
  return [{ json: Object.assign({}, ctx, { appointments_text: noApptTxt }) }];
}

// ── Mostrar cita + pedir confirmación ────────────────────────────────
const appt = appts[0];
const dt   = new Date(appt.start_time);
const fecha = dt.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Lima" });
const hora  = dt.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });
const serv  = appt.service || "Consulta general";
const STATUS_ES = { scheduled: "Agendada", confirmed: "Confirmada", completed: "Completada", no_show: "No se present\\u00f3", cancelled: "Cancelada" };
const estado = STATUS_ES[appt.status] || appt.status;

if (new Date(appt.start_time) > new Date()) {
  await setCancelLabel(true);
  const txt = "Tu pr\\u00f3xima cita en " + clinicName + ":\\n\\n" +
    "\\ud83d\\udcc5 *" + fecha + "* a las *" + hora + "*\\n" +
    "\\ud83e\\uddb7 " + serv + " \\u2014 " + estado + "\\n\\n" +
    "\\u00bfConfirmas que deseas cancelarla?\\n\\n" +
    "Responde *S\\u00ed* para cancelar o *No* para volver";
  return [{ json: Object.assign({}, ctx, { appointments_text: txt }) }];
} else {
  const txt = "Tu \\u00faltima cita en " + clinicName + " fue el *" + fecha + "* a las *" + hora + "*\\n" +
    "(" + serv + " \\u2014 " + estado + ")\\n\\n" +
    "No hay citas futuras activas para cancelar.\\n\\n" +
    "*1.* Agendar nueva cita\\xa0\\xa0 *2.* Hablar con agente";
  return [{ json: Object.assign({}, ctx, { appointments_text: txt }) }];
}
`;
console.log('✅ Patched: Formatear Citas (awaiting_cancel_confirm + direct confirm)');

// ══════════════════════════════════════════════════════════════════════════
// PATCH 3 — Pre-Clasificador: interceptar awaiting_cancel_confirm
//           Inserta ANTES del bloque LIST-PICKER ID DETECTOR
// ══════════════════════════════════════════════════════════════════════════
const preNode = getNode('Pre-Clasificador Keywords');
if (!preNode) { console.error('Node "Pre-Clasificador Keywords" not found'); process.exit(1); }
let preCode = preNode.parameters.jsCode || preNode.parameters.code;

const INJECT_BEFORE = '// ══ LIST-PICKER ID DETECTOR — MAXIMA PRIORIDAD';
const CANCEL_BLOCK = `// ── awaiting_cancel_confirm: interceptar "1"/"sí"/"cancelar" ANTES de pos_N ──
var _inCancelConfirm = convLabels.includes("awaiting_cancel_confirm");
if (_inCancelConfirm) {
  var _ccClean = ($json.message_text || "").toLowerCase().trim()
    .normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
  var _cancelYes = ["1","si","yes","ok","dale","cancelar","confirmar","listo","va","claro","afirmativo"];
  var _cancelNo  = ["2","no","volver","menu","atras","no cancelar","no gracias"];
  if (_cancelYes.indexOf(_ccClean) !== -1 || _rawMsg === "pos_1" || _rawMsg === "confirm_cancel") {
    return [{ json: Object.assign({}, $json, { intent: "APPOINTMENT_STATUS", confidence: "high", classified_by: "CANCEL_CONFIRM_YES", skip_ai: true }) }];
  }
  if (_cancelNo.indexOf(_ccClean) !== -1 || _rawMsg === "pos_2" || _rawMsg === "back_menu") {
    return [{ json: Object.assign({}, $json, { intent: "APPOINTMENT_STATUS", confidence: "high", classified_by: "CANCEL_CONFIRM_NO", skip_ai: true, cancel_rejected: true }) }];
  }
  // Cualquier otro texto → mostrar la cita otra vez
  return [{ json: Object.assign({}, $json, { intent: "APPOINTMENT_STATUS", confidence: "medium", classified_by: "CANCEL_CONFIRM_PASSTHROUGH", skip_ai: true }) }];
}

`;

if (!preCode.includes(INJECT_BEFORE)) {
  console.error('ERROR: injection marker not found in Pre-Clasificador. Aborting.');
  process.exit(1);
}
if (preCode.includes('_inCancelConfirm')) {
  console.log('⚠️  Pre-Clasificador ya tiene awaiting_cancel_confirm — skipping inject');
} else {
  preCode = preCode.replace(INJECT_BEFORE, CANCEL_BLOCK + INJECT_BEFORE);
  preNode.parameters.jsCode = preCode;
  console.log('✅ Patched: Pre-Clasificador Keywords (awaiting_cancel_confirm added)');
}

// ─── PUT workflow ──────────────────────────────────────────────────────────
const r = await fetch(`${BASE}/api/v1/workflows/${WF_ID}`, {
  method: 'PUT',
  headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings, staticData: null })
});
const d = await r.json();
if (r.ok) {
  console.log(`\n✅ Workflow guardado: ${d.name}`);
  console.log('   Cambios: Buscar Citas Paciente + Formatear Citas + Pre-Clasificador Keywords');
} else {
  console.error('❌ Error guardando:', JSON.stringify(d).slice(0, 300));
  process.exit(1);
}
