// patch_slot_preferences.js
// Fix: Explicar Agendamiento extracts day/time preference from message
// Fix: Seleccionar 3 Mejores Slots prioritizes matching preferences
const https = require('https');

const N8N_HOST = 'workflows.n8n.redsolucionesti.com';
const API_KEY  = process.env.N8N_API_KEY || '';
const WF_ID    = '37SLdWISQLgkHeXk';

// ─── Explicar Agendamiento ────────────────────────────────────────────────────
const CODE_EXPLICAR = [
  '// EXPLICAR AGENDAMIENTO — extrae preferencias del mensaje',
  'const msg = ($json.message_text || "").toLowerCase();',
  '',
  '// --- Preferred day ---',
  'const nowUTC = new Date();',
  'const nowLima = new Date(nowUTC.getTime() - 5 * 3600000);',
  'const todayDow = nowLima.getUTCDay();',
  'const tomorrowDow = (todayDow + 1) % 7;',
  '',
  'const DAY_WORDS = [',
  '  { words: ["lunes"],                dow: 1 },',
  '  { words: ["martes"],               dow: 2 },',
  '  { words: ["miercoles","miércoles"],dow: 3 },',
  '  { words: ["jueves"],               dow: 4 },',
  '  { words: ["viernes"],              dow: 5 },',
  '  { words: ["sabado","sábado"],      dow: 6 },',
  '  { words: ["domingo"],              dow: 0 },',
  '  { words: ["hoy"],                  dow: todayDow },',
  '  { words: ["mañana","manana"],       dow: tomorrowDow }',
  '];',
  '',
  'let preferred_dow = null;',
  'for (var di = 0; di < DAY_WORDS.length; di++) {',
  '  var entry = DAY_WORDS[di];',
  '  for (var wi = 0; wi < entry.words.length; wi++) {',
  '    if (msg.includes(entry.words[wi])) { preferred_dow = entry.dow; break; }',
  '  }',
  '  if (preferred_dow !== null) break;',
  '}',
  '',
  '// --- Preferred time window ---',
  'var pref_hour_start = null;',
  'var pref_hour_end   = null;',
  '',
  '// Specific hour: "4pm", "4 de la tarde", "16:00", "4:30pm"',
  'var hourMatch = msg.match(/\\b(\\d{1,2})(?::(\\d{2}))?\\s*(?:pm|p\\.m\\.|de la tarde|en punto)/);',
  'if (!hourMatch) hourMatch = msg.match(/\\b(1[3-9]|2[0-3]):(\\d{2})\\b/); // 13:00-23:59',
  'if (hourMatch) {',
  '  var h = parseInt(hourMatch[1]);',
  '  if (h < 12 && (msg.includes("pm") || msg.includes("tarde"))) h += 12;',
  '  pref_hour_start = Math.max(9, h - 1);',
  '  pref_hour_end   = Math.min(19, h + 2);',
  '} else if (msg.includes("tarde") || msg.includes("afternoon")) {',
  '  pref_hour_start = 14; pref_hour_end = 19;',
  '} else if (msg.includes("por la mañana") || msg.includes("en la mañana") || msg.includes("por la manana")) {',
  '  pref_hour_start = 9; pref_hour_end = 13;',
  '} else if (msg.includes("mediodia") || msg.includes("mediodía") || msg.includes("medio dia")) {',
  '  pref_hour_start = 12; pref_hour_end = 14;',
  '}',
  '',
  'return [{ json: Object.assign({}, $json, {',
  '  escalation_message: "Entiendo que deseas agendar una cita. Buscando horarios disponibles...",',
  '  escalation_reason: "APPOINTMENT_REQUEST",',
  '  escalation_note: "Paciente solicitó: " + $json.intent + "\\nMensaje original: " + $json.message_text,',
  '  should_escalate: true,',
  '  preferred_dow: preferred_dow,',
  '  preferred_hour_start: pref_hour_start,',
  '  preferred_hour_end: pref_hour_end',
  '}) }];'
].join('\n');

// ─── Seleccionar 3 Mejores Slots ─────────────────────────────────────────────
const CODE_SELECCIONAR = [
  '// SELECCIONAR 3 MEJORES SLOTS — prioriza preferencias del paciente',
  'const all_slots = $json.available_slots || [];',
  'const preferred_dow  = $json.preferred_dow;         // null o 0-6',
  'const pref_h_start   = $json.preferred_hour_start;  // null o 9-19',
  'const pref_h_end     = $json.preferred_hour_end;    // null o 10-20',
  '',
  'if (all_slots.length === 0) {',
  '  return [{ json: Object.assign({}, $json, {',
  '    selected_slots: [], no_slots_available: true, should_escalate: true,',
  '    escalation_reason: "NO_SLOTS_AVAILABLE",',
  '    escalation_message: "Lo siento, no hay horarios disponibles en los proximos 7 dias. Te conecto con un agente."',
  '  }) }];',
  '}',
  '',
  '// Score each slot: exact day+hour match = 200, day only = 100, hour only = 50',
  'var scored = all_slots.map(function(slot) {',
  '  var dt = new Date(slot.start);',
  '  var limaDate = new Date(dt.getTime() - 5 * 3600000);',
  '  var limaHour = limaDate.getUTCHours();',
  '  var limaDow  = limaDate.getUTCDay();',
  '',
  '  var score = 0;',
  '  var dayMatch  = (preferred_dow  !== null && preferred_dow  !== undefined && limaDow  === preferred_dow);',
  '  var hourMatch = (pref_h_start   !== null && pref_h_start  !== undefined && limaHour >= pref_h_start && limaHour < pref_h_end);',
  '',
  '  if (dayMatch && hourMatch) score = 200;',
  '  else if (dayMatch)         score = 100;',
  '  else if (hourMatch)        score = 50;',
  '',
  '  return Object.assign({}, slot, { _score: score, _dow: limaDow, _hour: limaHour });',
  '});',
  '',
  '// Sort: highest score first, then chronological',
  'scored.sort(function(a, b) {',
  '  if (b._score !== a._score) return b._score - a._score;',
  '  return new Date(a.start) - new Date(b.start);',
  '});',
  '',
  '// If no preference matches, fall back to first 3 chronological',
  'var selected = scored.slice(0, 3);',
  '',
  '// Format options',
  'var slot_options = selected.map(function(slot, idx) {',
  '  return {',
  '    option_number: idx + 1,',
  '    date: slot.date,',
  '    time: slot.time,',
  '    start_iso: slot.start,',
  '    end_iso: slot.end',
  '  };',
  '});',
  '',
  '// Build context note: did we find preferred slots?',
  'var best_score = scored[0] ? scored[0]._score : 0;',
  'var pref_note = "";',
  'if (preferred_dow !== null && best_score < 100) {',
  '  var dow_names = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];',
  '  pref_note = "No hay disponibilidad el " + (dow_names[preferred_dow] || "") + " en los proximos 7 dias. Mostrando proximos disponibles.";',
  '} else if (preferred_dow !== null && pref_h_start !== null && best_score < 200) {',
  '  pref_note = "No hay exactamente ese horario disponible. Mostrando lo mas cercano.";',
  '}',
  '',
  'return [{ json: Object.assign({}, $json, {',
  '  selected_slots: slot_options,',
  '  has_slots: true,',
  '  total_offered: slot_options.length,',
  '  preference_note: pref_note',
  '}) }];'
].join('\n');

// ─── API helpers ─────────────────────────────────────────────────────────────

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: N8N_HOST, path, method: 'GET', headers: { 'X-N8N-API-KEY': API_KEY } }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }); req.on('error', reject); req.end();
  });
}

function apiPut(path, body) {
  const b = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: N8N_HOST, path, method: 'PUT',
      headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    }); req.on('error', reject); req.write(b); req.end();
  });
}

async function run() {
  if (!API_KEY) { console.error('Set N8N_API_KEY'); process.exit(1); }

  const wf = await apiGet('/api/v1/workflows/' + WF_ID);

  const explicar = wf.nodes.find(n => n.name === 'Explicar Agendamiento');
  const seleccionar = wf.nodes.find(n => n.name === 'Seleccionar 3 Mejores Slots');

  if (!explicar)   { console.error('Explicar Agendamiento not found'); process.exit(1); }
  if (!seleccionar){ console.error('Seleccionar 3 Mejores Slots not found'); process.exit(1); }

  explicar.parameters.jsCode   = CODE_EXPLICAR;
  seleccionar.parameters.jsCode = CODE_SELECCIONAR;

  const res = await apiPut('/api/v1/workflows/' + WF_ID, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings, staticData: wf.staticData
  });

  console.log('PUT:', res.status, res.status === 200 ? 'OK' : res.body.slice(0, 300));
}

run().catch(console.error);
