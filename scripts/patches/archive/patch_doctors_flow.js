// patch_doctors_flow.js — Phase 2: Multi-doctor calendar support in SofIA
// Changes:
//  1. Explicar Agendamiento   → add doctor preference extraction
//  2. NEW Resolver Doctor     → fetch + match doctor from Supabase
//  3. Leer Citas Supabase     → filter by doctor_id
//  4. Calcular Slots          → use doctor weekly_schedule (fallback to bot_config)
//  5. Seleccionar 3 Mejores   → pass through doctor fields
//  6. Formatear Oferta        → include doctor name per slot
//  7. Lock de Slot            → carry doctor_id / doctor_name
//  8. Guardar Cita Supabase   → save doctor_id
//  9. Confirmar al Paciente   → mention doctor name in message
const https = require('https');

const N8N_HOST = 'workflows.n8n.redsolucionesti.com';
const API_KEY  = process.env.N8N_API_KEY || '';
const WF_ID    = '37SLdWISQLgkHeXk';

// ─── Node codes ────────────────────────────────────────────────────────────

const CODE_EXPLICAR = [
  '// EXPLICAR AGENDAMIENTO — extrae preferencias de dia, hora y doctor',
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
  'var preferred_dow = null;',
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
  'var hourMatch = msg.match(/\\b(\\d{1,2})(?::(\\d{2}))?\\s*(?:pm|p\\.m\\.|de la tarde|en punto)/);',
  'if (!hourMatch) hourMatch = msg.match(/\\b(1[3-9]|2[0-3]):(\\d{2})\\b/);',
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
  '// --- Preferred doctor ---',
  'var preferred_doctor_name = null;',
  'var preferred_specialty   = null;',
  '',
  '// Match "con el Dr. García", "con la Dra. López", "con el doctor García"',
  'var doctorMatch = msg.match(/(?:con (?:el |la )?(?:dr\\.?|dra\\.?|doctor|doctora)\\s+)([a-záéíóúüñ]+(?:\\s+[a-záéíóúüñ]+)?)/i);',
  'if (!doctorMatch) {',
  '  // Match "doctor García" without "con"',
  '  doctorMatch = msg.match(/(?:dr\\.?|dra\\.?|doctor|doctora)\\s+([a-záéíóúüñ]+)/i);',
  '}',
  'if (doctorMatch) {',
  '  preferred_doctor_name = doctorMatch[1].trim();',
  '}',
  '',
  '// Specialty keywords',
  'if (msg.includes("ortodoncia") || msg.includes("brackets") || msg.includes("alineador")) {',
  '  preferred_specialty = "ortodoncia";',
  '} else if (msg.includes("implante")) {',
  '  preferred_specialty = "implantes";',
  '} else if (msg.includes("endodoncia") || msg.includes("conducto")) {',
  '  preferred_specialty = "endodoncia";',
  '} else if (msg.includes("blanqueamiento")) {',
  '  preferred_specialty = "blanqueamiento";',
  '} else if (msg.includes("pediatric") || msg.includes("niño") || msg.includes("niños")) {',
  '  preferred_specialty = "pediatrica";',
  '}',
  '',
  'return [{ json: Object.assign({}, $json, {',
  '  escalation_message: "Entiendo que deseas agendar una cita. Buscando horarios disponibles...",',
  '  escalation_reason: "APPOINTMENT_REQUEST",',
  '  escalation_note: "Paciente solicitó: " + $json.intent + "\\nMensaje original: " + $json.message_text,',
  '  should_escalate: true,',
  '  preferred_dow: preferred_dow,',
  '  preferred_hour_start: pref_hour_start,',
  '  preferred_hour_end: pref_hour_end,',
  '  preferred_doctor_name: preferred_doctor_name,',
  '  preferred_specialty: preferred_specialty',
  '}) }];'
].join('\n');

// ─── NEW NODE: Resolver Doctor ─────────────────────────────────────────────
const CODE_RESOLVER_DOCTOR = [
  '// RESOLVER DOCTOR — busca doctores activos de la clínica y hace match con preferencia del paciente',
  '// Si no hay doctores → fallback a modo clínica (igual que antes)',
  'const ctx = $("Explicar Agendamiento").item.json;',
  'const SUPABASE_URL = $env.N8N_SUPABASE_URL;',
  'const SERVICE_KEY  = $env.N8N_SUPABASE_SERVICE_KEY;',
  'const clinic_id    = ctx.clinic_id;',
  '',
  'var doctors = [];',
  'try {',
  '  doctors = await this.helpers.httpRequest({',
  '    method: "GET",',
  '    url: SUPABASE_URL + "/rest/v1/rpc/list_doctors",',
  '    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json" },',
  '    body: { p_clinic_id: clinic_id },',
  '    json: true',
  '  });',
  '  if (!Array.isArray(doctors)) doctors = [];',
  '} catch(e) {',
  '  console.warn(JSON.stringify({ ts: new Date().toISOString(), event: "DOCTORS_FETCH_ERROR", error: e.message }));',
  '  doctors = [];',
  '}',
  '',
  '// Match doctor by name or specialty',
  'var preferred_name = (ctx.preferred_doctor_name || "").toLowerCase().trim();',
  'var preferred_spec = (ctx.preferred_specialty   || "").toLowerCase().trim();',
  'var selected_doctor = null;',
  '',
  'if (preferred_name && doctors.length > 0) {',
  '  // Try last name first, then full name',
  '  selected_doctor = doctors.find(function(d) {',
  '    var full = (d.first_name + " " + d.last_name).toLowerCase();',
  '    var last = d.last_name.toLowerCase();',
  '    return last.includes(preferred_name) || preferred_name.includes(last) || full.includes(preferred_name);',
  '  }) || null;',
  '}',
  '',
  'if (!selected_doctor && preferred_spec && doctors.length > 0) {',
  '  selected_doctor = doctors.find(function(d) {',
  '    return d.specialty.toLowerCase().includes(preferred_spec);',
  '  }) || null;',
  '}',
  '',
  'console.log(JSON.stringify({',
  '  ts: new Date().toISOString(),',
  '  event: "DOCTOR_RESOLVED",',
  '  total_doctors: doctors.length,',
  '  selected: selected_doctor ? selected_doctor.last_name : null,',
  '  mode: selected_doctor ? "specific" : (doctors.length > 0 ? "any" : "legacy")',
  '}));',
  '',
  'return [{ json: Object.assign({}, ctx, {',
  '  available_doctors: doctors,',
  '  selected_doctor: selected_doctor,',
  '  doctor_selection_mode: selected_doctor ? "specific" : (doctors.length > 0 ? "any" : "legacy")',
  '}) }];'
].join('\n');

// ─── Leer Citas Supabase ───────────────────────────────────────────────────
const CODE_LEER_CITAS = [
  '// LEER CITAS SUPABASE — filtra por doctor si hay doctor seleccionado',
  'const ctx = $("Resolver Doctor").item.json;',
  'const SUPABASE_URL = $env.N8N_SUPABASE_URL;',
  'const SERVICE_KEY  = $env.N8N_SUPABASE_SERVICE_KEY;',
  'const clinic_id    = ctx.clinic_id;',
  'const selected_doctor = ctx.selected_doctor;',
  '',
  'if (!clinic_id) {',
  '  console.warn(JSON.stringify({ ts: new Date().toISOString(), event: "NO_CLINIC_ID" }));',
  '  return [{ json: { no_appointments: true } }];',
  '}',
  '',
  'const now     = new Date();',
  'const in7days = new Date(now.getTime() + 7 * 24 * 3600000);',
  '',
  'var url = $env.N8N_SUPABASE_URL + "/rest/v1/appointments"',
  '  + "?clinic_id=eq." + clinic_id',
  '  + "&start_time=gte." + now.toISOString()',
  '  + "&start_time=lte." + in7days.toISOString()',
  '  + "&status=neq.cancelled"',
  '  + "&select=start_time,end_time,doctor_id";',
  '',
  '// If specific doctor selected, filter by doctor_id only',
  'if (selected_doctor) {',
  '  url += "&doctor_id=eq." + selected_doctor.id;',
  '}',
  '',
  'var appointments = [];',
  'try {',
  '  appointments = await this.helpers.httpRequest({',
  '    method: "GET", url: url,',
  '    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY },',
  '    json: true',
  '  });',
  '} catch(e) {',
  '  console.error(JSON.stringify({ ts: new Date().toISOString(), event: "APPTS_READ_ERROR", error: e.message }));',
  '}',
  '',
  'if (!appointments || appointments.length === 0) {',
  '  return [{ json: { no_appointments: true } }];',
  '}',
  '',
  'return appointments.map(function(a) {',
  '  return {',
  '    json: {',
  '      start:     { dateTime: a.start_time },',
  '      end:       { dateTime: a.end_time },',
  '      doctor_id: a.doctor_id || null',
  '    }',
  '  };',
  '});'
].join('\n');

// ─── Calcular Slots Disponibles ───────────────────────────────────────────
const CODE_CALCULAR = [
  '// CALCULAR SLOTS — usa weekly_schedule del doctor si hay doctores configurados',
  '// Fallback: bot_config.business_hours si no hay doctores (modo legacy)',
  'const busy_events = $input.all();',
  'const ctx = $("Resolver Doctor").item.json;',
  'const OFFSET_HOURS = 5; // Lima UTC-5',
  '',
  'var selected_doctor   = ctx.selected_doctor   || null;',
  'var available_doctors = ctx.available_doctors || [];',
  'var mode              = ctx.doctor_selection_mode || "legacy";',
  '',
  '// Build busy-times per doctor from input events',
  'var busyByDoctor = {};',
  'var busyGeneral  = [];',
  'for (var bi = 0; bi < busy_events.length; bi++) {',
  '  var ev = busy_events[bi].json;',
  '  if (!ev.start || !ev.end) continue;',
  '  var bStart = new Date(ev.start.dateTime || ev.start.date);',
  '  var bEnd   = new Date(ev.end.dateTime   || ev.end.date);',
  '  var did    = ev.doctor_id || null;',
  '  if (did) {',
  '    if (!busyByDoctor[did]) busyByDoctor[did] = [];',
  '    busyByDoctor[did].push({ start: bStart, end: bEnd });',
  '  } else {',
  '    busyGeneral.push({ start: bStart, end: bEnd });',
  '  }',
  '}',
  '',
  '// Helper: build slots for one doctor using their weekly_schedule',
  'function buildDoctorSlots(doctor, busyTimes) {',
  '  var schedule = doctor.weekly_schedule || [];',
  '  var duration = doctor.slot_duration_min || 30;',
  '  var schedMap = {};',
  '  for (var si = 0; si < schedule.length; si++) {',
  '    var e = schedule[si];',
  '    if (!schedMap[e.dow]) schedMap[e.dow] = [];',
  '    schedMap[e.dow].push({ start: e.start_hour, end: e.end_hour });',
  '  }',
  '  var nowUTC   = new Date();',
  '  var nowLimaMs = nowUTC.getTime() - OFFSET_HOURS * 3600000;',
  '  var nowLima  = new Date(nowLimaMs);',
  '  var slots = [];',
  '  var dname = doctor.display_name || ("Dr. " + doctor.first_name + " " + doctor.last_name);',
  '',
  '  for (var day = 0; day < 7; day++) {',
  '    var limaDay = new Date(nowLima);',
  '    limaDay.setDate(limaDay.getDate() + day);',
  '    limaDay.setHours(0, 0, 0, 0);',
  '    var dow = limaDay.getDay();',
  '    var windows = schedMap[dow];',
  '    if (!windows || windows.length === 0) continue;',
  '',
  '    for (var wi = 0; wi < windows.length; wi++) {',
  '      var win = windows[wi];',
  '      for (var hour = win.start; hour < win.end; hour++) {',
  '        for (var min = 0; min < 60; min += duration) {',
  '          var slotLimaMs  = limaDay.getTime() + (hour * 60 + min) * 60000;',
  '          var slotStartUTC = new Date(slotLimaMs + OFFSET_HOURS * 3600000);',
  '          var slotEndUTC   = new Date(slotStartUTC.getTime() + duration * 60000);',
  '          if (slotStartUTC <= nowUTC) continue;',
  '          var avail = true;',
  '          for (var ti = 0; ti < busyTimes.length; ti++) {',
  '            if (slotStartUTC < busyTimes[ti].end && slotEndUTC > busyTimes[ti].start) { avail = false; break; }',
  '          }',
  '          if (avail) {',
  '            var displayDate = new Date(slotLimaMs);',
  '            slots.push({',
  '              start: slotStartUTC.toISOString(),',
  '              end:   slotEndUTC.toISOString(),',
  '              date:  displayDate.toLocaleDateString("es-PE", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),',
  '              time:  displayDate.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }),',
  '              doctor_id:   doctor.id,',
  '              doctor_name: dname,',
  '              specialty:   doctor.specialty || ""',
  '            });',
  '          }',
  '        }',
  '      }',
  '    }',
  '  }',
  '  return slots;',
  '}',
  '',
  '// Helper: legacy mode using bot_config business hours',
  'function buildLegacySlots(busyTimes, botConfig) {',
  '  var bStart = (botConfig && botConfig.business_hours_start) ? botConfig.business_hours_start : 9;',
  '  var bEnd   = (botConfig && botConfig.business_hours_end)   ? botConfig.business_hours_end   : 19;',
  '  var business_hours = { 1: { start: bStart, end: bEnd }, 2: { start: bStart, end: bEnd },',
  '    3: { start: bStart, end: bEnd }, 4: { start: bStart, end: bEnd },',
  '    5: { start: bStart, end: bEnd }, 6: { start: 9, end: 14 }, 0: null };',
  '  var duration = 30;',
  '  var nowUTC   = new Date();',
  '  var nowLimaMs = nowUTC.getTime() - OFFSET_HOURS * 3600000;',
  '  var nowLima  = new Date(nowLimaMs);',
  '  var slots = [];',
  '  for (var day = 0; day < 7; day++) {',
  '    var limaDay = new Date(nowLima);',
  '    limaDay.setDate(limaDay.getDate() + day);',
  '    limaDay.setHours(0, 0, 0, 0);',
  '    var hours = business_hours[limaDay.getDay()];',
  '    if (!hours) continue;',
  '    for (var hour = hours.start; hour < hours.end; hour++) {',
  '      for (var min = 0; min < 60; min += duration) {',
  '        var slotLimaMs  = limaDay.getTime() + (hour * 60 + min) * 60000;',
  '        var slotStartUTC = new Date(slotLimaMs + OFFSET_HOURS * 3600000);',
  '        var slotEndUTC   = new Date(slotStartUTC.getTime() + duration * 60000);',
  '        if (slotStartUTC <= nowUTC) continue;',
  '        var avail = true;',
  '        for (var ti = 0; ti < busyTimes.length; ti++) {',
  '          if (slotStartUTC < busyTimes[ti].end && slotEndUTC > busyTimes[ti].start) { avail = false; break; }',
  '        }',
  '        if (avail) {',
  '          var displayDate = new Date(slotLimaMs);',
  '          slots.push({',
  '            start: slotStartUTC.toISOString(), end: slotEndUTC.toISOString(),',
  '            date:  displayDate.toLocaleDateString("es-PE", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),',
  '            time:  displayDate.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }),',
  '            doctor_id: null, doctor_name: null, specialty: null',
  '          });',
  '        }',
  '      }',
  '    }',
  '  }',
  '  return slots;',
  '}',
  '',
  '// ── Main logic ──────────────────────────────────────────────────────────',
  'var available_slots = [];',
  '',
  'if (mode === "legacy" || available_doctors.length === 0) {',
  '  // No doctors configured — use clinic business hours',
  '  available_slots = buildLegacySlots(busyGeneral, ctx.bot_config).slice(0, 20);',
  '',
  '} else if (mode === "specific" && selected_doctor) {',
  '  // Specific doctor requested',
  '  var busy = busyByDoctor[selected_doctor.id] || [];',
  '  available_slots = buildDoctorSlots(selected_doctor, busy).slice(0, 20);',
  '',
  '} else {',
  '  // "any" mode — compute slots for all doctors, sort chronologically',
  '  for (var di = 0; di < available_doctors.length; di++) {',
  '    var doc = available_doctors[di];',
  '    var dBusy = busyByDoctor[doc.id] || [];',
  '    var dSlots = buildDoctorSlots(doc, dBusy);',
  '    for (var si = 0; si < dSlots.length; si++) available_slots.push(dSlots[si]);',
  '  }',
  '  available_slots.sort(function(a, b) { return new Date(a.start) - new Date(b.start); });',
  '  available_slots = available_slots.slice(0, 20);',
  '}',
  '',
  'return [{',
  '  json: Object.assign({}, ctx, {',
  '    available_slots: available_slots,',
  '    total_available: available_slots.length,',
  '    busy_events_count: busy_events.length,',
  '    calculated_at: new Date().toISOString()',
  '  })',
  '}];'
].join('\n');

// ─── Seleccionar 3 Mejores Slots ──────────────────────────────────────────
const CODE_SELECCIONAR = [
  '// SELECCIONAR 3 MEJORES SLOTS — prioriza preferencias del paciente y doctor',
  'const all_slots = $json.available_slots || [];',
  'const preferred_dow  = $json.preferred_dow;',
  'const pref_h_start   = $json.preferred_hour_start;',
  'const pref_h_end     = $json.preferred_hour_end;',
  '',
  'if (all_slots.length === 0) {',
  '  return [{ json: Object.assign({}, $json, {',
  '    selected_slots: [], no_slots_available: true, should_escalate: true,',
  '    escalation_reason: "NO_SLOTS_AVAILABLE",',
  '    escalation_message: "Lo siento, no hay horarios disponibles en los proximos 7 dias. Te conecto con un agente."',
  '  }) }];',
  '}',
  '',
  'var scored = all_slots.map(function(slot) {',
  '  var dt       = new Date(slot.start);',
  '  var limaDate = new Date(dt.getTime() - 5 * 3600000);',
  '  var limaHour = limaDate.getUTCHours();',
  '  var limaDow  = limaDate.getUTCDay();',
  '  var score    = 0;',
  '  var dayMatch  = (preferred_dow    != null && limaDow  === preferred_dow);',
  '  var hourMatch = (pref_h_start     != null && limaHour >= pref_h_start && limaHour < pref_h_end);',
  '  if (dayMatch && hourMatch) score = 200;',
  '  else if (dayMatch)         score = 100;',
  '  else if (hourMatch)        score = 50;',
  '  return Object.assign({}, slot, { _score: score, _dow: limaDow, _hour: limaHour });',
  '});',
  '',
  'scored.sort(function(a, b) {',
  '  if (b._score !== a._score) return b._score - a._score;',
  '  return new Date(a.start) - new Date(b.start);',
  '});',
  '',
  'var selected = scored.slice(0, 3);',
  '',
  'var slot_options = selected.map(function(slot, idx) {',
  '  return {',
  '    option_number: idx + 1,',
  '    date:         slot.date,',
  '    time:         slot.time,',
  '    start_iso:    slot.start,',
  '    end_iso:      slot.end,',
  '    doctor_id:    slot.doctor_id   || null,',
  '    doctor_name:  slot.doctor_name || null,',
  '    specialty:    slot.specialty   || null',
  '  };',
  '});',
  '',
  'var best_score = scored[0] ? scored[0]._score : 0;',
  'var pref_note  = "";',
  'if (preferred_dow !== null && preferred_dow !== undefined && best_score < 100) {',
  '  var dow_names = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];',
  '  pref_note = "No hay disponibilidad el " + (dow_names[preferred_dow] || "") + " en los proximos 7 dias. Mostrando proximos disponibles.";',
  '} else if (preferred_dow !== null && preferred_dow !== undefined && pref_h_start !== null && pref_h_start !== undefined && best_score < 200) {',
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

// ─── Formatear Oferta de Slots ────────────────────────────────────────────
const CODE_FORMATEAR = [
  '// FORMAT SLOT OFFER MESSAGE — incluye nombre del doctor si aplica',
  'const slots    = $json.selected_slots || [];',
  'const prefNote = $json.preference_note || "";',
  '',
  'if (slots.length === 0) {',
  '  return [{ json: Object.assign({}, $json, {',
  '    offer_message: "Lo siento, no hay horarios disponibles en los proximos 7 dias.",',
  '    should_escalate: true, escalation_reason: "NO_SLOTS_AVAILABLE"',
  '  }) }];',
  '}',
  '',
  'var message = "";',
  'if (prefNote) { message += prefNote + "\\n\\n"; }',
  'message += "¡Perfecto! Tengo estos horarios disponibles:\\n\\n";',
  '',
  'for (var i = 0; i < slots.length; i++) {',
  '  var s = slots[i];',
  '  var line = s.option_number + ". " + s.date + " a las " + s.time;',
  '  if (s.doctor_name) { line += " — " + s.doctor_name; }',
  '  message += line + "\\n";',
  '}',
  '',
  'message += "\\nResponde con *1*, *2* o *3* para confirmar.";',
  '',
  'return [{ json: Object.assign({}, $json, {',
  '  offer_message: message,',
  '  offered_slots: slots,',
  '  awaiting_slot_confirmation: true,',
  '  should_escalate: false',
  '}) }];'
].join('\n');

// ─── Lock de Slot ─────────────────────────────────────────────────────────
const CODE_LOCK = [
  '// LOCK SLOT - Prepara datos del evento, incluye doctor si aplica',
  'const slot    = $json.chosen_slot;',
  'const patient = $json.sender_name    || "Paciente";',
  'const phone   = $json.contact_phone  || "No disponible";',
  'const clinicName = $json.clinic_name || $json.slot_clinic_name || "Clinica";',
  'const nl      = String.fromCharCode(10);',
  '',
  '// Detect service from original message',
  'const src_msg = ($json.original_appointment_message || "").toLowerCase();',
  'var service = "Consulta dental";',
  'if (src_msg.includes("limpieza"))                               service = "Limpieza dental";',
  'else if (src_msg.includes("blanqueamiento"))                    service = "Blanqueamiento dental";',
  'else if (src_msg.includes("ortodoncia"))                        service = "Ortodoncia";',
  'else if (src_msg.includes("extraccion")||src_msg.includes("extracción")) service = "Extraccion dental";',
  'else if (src_msg.includes("endodoncia")||src_msg.includes("conducto"))   service = "Endodoncia";',
  'else if (src_msg.includes("implante"))                          service = "Implante dental";',
  'else if (src_msg.includes("revision")||src_msg.includes("revisión")||src_msg.includes("chequeo")) service = "Revision dental";',
  'else if (src_msg.includes("dolor")||src_msg.includes("urgencia")) service = "Urgencia dental";',
  '',
  '// Doctor from chosen slot',
  'var doctor_id   = slot.doctor_id   || null;',
  'var doctor_name = slot.doctor_name || null;',
  '',
  'return [{',
  '  json: Object.assign({}, $json, {',
  '    event_summary:     service + " - " + patient,',
  '    event_description: "Paciente: " + patient + nl + "Telefono: " + phone + nl',
  '                     + "Servicio: " + service',
  '                     + (doctor_name ? nl + "Doctor: " + doctor_name : "") + nl + nl',
  '                     + "Agendado automaticamente por SofIA Bot",',
  '    event_start:    slot.start_iso,',
  '    event_end:      slot.end_iso,',
  '    event_location: clinicName,',
  '    service_type:   service,',
  '    doctor_id:      doctor_id,',
  '    doctor_name:    doctor_name',
  '  })',
  '}];'
].join('\n');

// ─── Guardar Cita Supabase ────────────────────────────────────────────────
const CODE_GUARDAR = [
  '// GUARDAR CITA — directo en Supabase, incluye doctor_id si aplica',
  'const withRetry = async (fn, opts = {}) => {',
  '  const { attempts = 3, baseMs = 1000, maxMs = 30000, noRetryOn = [] } = opts;',
  '  let lastError;',
  '  for (let i = 0; i < attempts; i++) {',
  '    try { return await fn(); } catch(e) {',
  '      lastError = e;',
  '      const skip = noRetryOn.some(c => e.message && e.message.includes(String(c)));',
  '      if (i === attempts - 1 || skip) throw e;',
  '      const delay = Math.min(baseMs * Math.pow(2, i) + Math.random() * 500, maxMs);',
  '      await new Promise(r => setTimeout(r, delay));',
  '    }',
  '  }',
  '  throw lastError;',
  '};',
  '',
  'const ctx          = $node["Lock de Slot"].json;',
  'const SUPABASE_URL = $env.N8N_SUPABASE_URL;',
  'const SERVICE_KEY  = $env.N8N_SUPABASE_SERVICE_KEY;',
  'const clinicId     = ctx.clinic_id;',
  '',
  'if (!clinicId || !/^[0-9a-f]{8}-/.test(clinicId)) {',
  '  throw new Error("INTERNAL_ERROR: clinic_id invalido: " + clinicId);',
  '}',
  '',
  'const startTime = ctx.event_start;',
  'const convId    = String(ctx.conversation_id || "");',
  'const doctorId  = ctx.doctor_id || null;',
  '',
  '// IDEMPOTENCIA: evitar doble guardado',
  'let idempUrl = $env.N8N_SUPABASE_URL + "/rest/v1/appointments"',
  '  + "?clinic_id=eq." + clinicId',
  '  + "&conversation_id=eq." + encodeURIComponent(convId)',
  '  + "&start_time=eq."      + encodeURIComponent(startTime)',
  '  + "&select=id";',
  'if (doctorId) idempUrl += "&doctor_id=eq." + doctorId;',
  '',
  'let existing = [];',
  'try {',
  '  existing = await this.helpers.httpRequest({',
  '    method: "GET", url: idempUrl,',
  '    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY },',
  '    json: true',
  '  });',
  '} catch(e) { existing = []; }',
  '',
  'if (existing && existing.length > 0) {',
  '  console.log(JSON.stringify({ ts: new Date().toISOString(), event: "APPOINTMENT_DUPLICATE", id: existing[0].id }));',
  '  return [{ json: Object.assign({}, ctx, { appointment_id: existing[0].id, appointment_saved: true, appointment_duplicate: true }) }];',
  '}',
  '',
  'const body = {',
  '  clinic_id:       clinicId,',
  '  conversation_id: convId,',
  '  patient_name:    (ctx.sender_name || "Paciente").substring(0, 100),',
  '  phone:           (ctx.contact_phone || "").substring(0, 30),',
  '  service:         ctx.service_type || "Consulta dental",',
  '  start_time:      startTime,',
  '  end_time:        ctx.event_end,',
  '  status:          "scheduled",',
  '  source:          "bot",',
  '  doctor_id:       doctorId',
  '};',
  '',
  'let result;',
  'try {',
  '  result = await withRetry(async () => this.helpers.httpRequest({',
  '    method: "POST",',
  '    url: SUPABASE_URL + "/rest/v1/appointments",',
  '    headers: {',
  '      apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY,',
  '      "Content-Type": "application/json", Prefer: "return=representation"',
  '    },',
  '    body, json: true',
  '  }), { attempts: 3, baseMs: 500, noRetryOn: ["400", "409"] });',
  '} catch(e) {',
  '  console.error(JSON.stringify({ ts: new Date().toISOString(), event: "APPOINTMENT_SAVE_FAILED", error: e.message }));',
  '  throw e;',
  '}',
  '',
  'const appt = Array.isArray(result) ? result[0] : result;',
  'console.log(JSON.stringify({ ts: new Date().toISOString(), event: "APPOINTMENT_SAVED", id: appt && appt.id, doctor_id: doctorId }));',
  'return [{ json: Object.assign({}, ctx, { appointment_id: appt && appt.id, appointment_saved: true }) }];'
].join('\n');

// ─── Confirmar al Paciente ────────────────────────────────────────────────
const CODE_CONFIRMAR = [
  '// CONFIRM APPOINTMENT TO PATIENT — incluye nombre del doctor si aplica',
  'const original_data = $node["Lock de Slot"].json;',
  'const slot          = original_data.chosen_slot;',
  'const service       = original_data.service_type;',
  'const clinic_name   = original_data.clinic_name || original_data.slot_clinic_name || "nuestra clinica";',
  'const doctor_name   = original_data.doctor_name || null;',
  'const clinic_phone  = (original_data.bot_config && original_data.bot_config.phone)',
  '  ? original_data.bot_config.phone : (original_data.slot_clinic_phone || null);',
  'const nl = String.fromCharCode(10);',
  '',
  'const phone_line  = clinic_phone  ? (nl + "Si necesitas cambios, llamanos al " + clinic_phone) : "";',
  'const doctor_line = doctor_name   ? (nl + "Doctor: " + doctor_name) : "";',
  '',
  'const confirmation_message = "Listo! Tu cita de " + service + " ha sido agendada para el "',
  '  + slot.date + " a las " + slot.time + "." + nl + nl',
  '  + "Clinica: " + clinic_name',
  '  + doctor_line',
  '  + phone_line + nl + nl',
  '  + "Te esperamos!";',
  '',
  'const appt_id = $json.appointment_id || "N/A";',
  'const internal_note = "CITA AGENDADA AUTOMATICAMENTE" + nl + nl',
  '  + "Fecha/Hora: " + slot.date + " a las " + slot.time + nl',
  '  + "Servicio: " + service + nl',
  '  + (doctor_name ? "Doctor: " + doctor_name + nl : "")',
  '  + "Paciente: " + original_data.sender_name + nl',
  '  + "Telefono: " + original_data.contact_phone + nl',
  '  + "Appointment ID: " + appt_id + nl + nl',
  '  + "SofIA - Confirmacion automatica";',
  '',
  'return [{',
  '  json: Object.assign({}, original_data, {',
  '    confirmation_message: confirmation_message,',
  '    internal_note:        internal_note,',
  '    appointment_id:       appt_id,',
  '    event_created:        true',
  '  })',
  '}];'
].join('\n');

// ─── API helpers ──────────────────────────────────────────────────────────

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: N8N_HOST, path, method: 'GET',
      headers: { 'X-N8N-API-KEY': API_KEY }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
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

// ─── Main ─────────────────────────────────────────────────────────────────

async function run() {
  if (!API_KEY) { console.error('Set N8N_API_KEY env var'); process.exit(1); }

  console.log('Fetching live workflow...');
  const wf = await apiGet('/api/v1/workflows/' + WF_ID);
  console.log('Nodes:', wf.nodes.length);

  // ── 1. Patch existing nodes ──────────────────────────────────────────────

  const patches = [
    { name: 'Explicar Agendamiento',    code: CODE_EXPLICAR    },
    { name: 'Leer Citas Supabase',      code: CODE_LEER_CITAS  },
    { name: 'Calcular Slots Disponibles', code: CODE_CALCULAR  },
    { name: 'Seleccionar 3 Mejores Slots', code: CODE_SELECCIONAR },
    { name: 'Formatear Oferta de Slots', code: CODE_FORMATEAR  },
    { name: 'Lock de Slot',             code: CODE_LOCK        },
    { name: 'Guardar Cita Supabase',    code: CODE_GUARDAR     },
    { name: 'Confirmar al Paciente',    code: CODE_CONFIRMAR   },
  ];

  for (const p of patches) {
    const node = wf.nodes.find(n => n.name === p.name);
    if (!node) { console.error('❌ Node not found:', p.name); process.exit(1); }
    node.parameters.jsCode = p.code;
    console.log('✅ Patched:', p.name);
  }

  // ── 2. Add "Resolver Doctor" node (between Explicar and Leer Citas) ─────

  const existingResolver = wf.nodes.find(n => n.name === 'Resolver Doctor');
  if (existingResolver) {
    existingResolver.parameters.jsCode = CODE_RESOLVER_DOCTOR;
    console.log('✅ Updated existing: Resolver Doctor');
  } else {
    // Get position of Explicar Agendamiento to place Resolver Doctor next to it
    const explicarNode = wf.nodes.find(n => n.name === 'Explicar Agendamiento');
    const leerNode     = wf.nodes.find(n => n.name === 'Leer Citas Supabase');

    // Place Resolver Doctor between Explicar (x=3472) and Leer (x=3696)
    // Shift Leer Citas and everything after it 240px to the right
    const insertX = explicarNode.position[0] + 240;
    const insertY = explicarNode.position[1];

    // Shift Leer Citas Supabase and downstream nodes right by 240px
    const nodesToShift = [
      'Leer Citas Supabase', 'Calcular Slots Disponibles', 'Seleccionar 3 Mejores Slots',
      'Formatear Oferta de Slots', 'Enviar Oferta Chatwoot', 'Marcar Esperando Confirmacion'
    ];
    nodesToShift.forEach(name => {
      const n = wf.nodes.find(n => n.name === name);
      if (n) n.position = [n.position[0] + 240, n.position[1]];
    });

    const resolverNode = {
      id: 'code-resolver-doctor',
      name: 'Resolver Doctor',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [insertX, insertY],
      parameters: { jsCode: CODE_RESOLVER_DOCTOR }
    };
    wf.nodes.push(resolverNode);
    console.log('✅ Added new node: Resolver Doctor at position', [insertX, insertY]);

    // ── 3. Update connections ─────────────────────────────────────────────
    // OLD: Explicar Agendamiento → Leer Citas Supabase
    // NEW: Explicar Agendamiento → Resolver Doctor → Leer Citas Supabase

    wf.connections['Explicar Agendamiento'] = {
      main: [[{ node: 'Resolver Doctor', type: 'main', index: 0 }]]
    };
    wf.connections['Resolver Doctor'] = {
      main: [[{ node: 'Leer Citas Supabase', type: 'main', index: 0 }]]
    };
    console.log('✅ Connections updated: Explicar → Resolver Doctor → Leer Citas');
  }

  // ── 4. PUT workflow ──────────────────────────────────────────────────────

  console.log('\nPushing workflow to n8n...');
  const res = await apiPut('/api/v1/workflows/' + WF_ID, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings,
    staticData: wf.staticData
  });

  console.log('PUT:', res.status, res.status === 200 ? '✅ OK' : '❌ ' + res.body.slice(0, 400));

  if (res.status === 200) {
    console.log('\n✅ Phase 2 complete. Workflow updated with multi-doctor support.');
    console.log('   • Clinics WITHOUT doctors → same behavior as before (legacy mode)');
    console.log('   • Clinics WITH doctors    → slots calculated from doctor weekly_schedule');
    console.log('   • Patient can say "quiero cita con el Dr. García" → matched by name');
  }
}

run().catch(console.error);
