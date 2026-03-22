const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('saas/sofia_live.json', 'utf8'));

const get    = name => wf.nodes.find(n => n.name === name);
const getIdx = name => wf.nodes.findIndex(n => n.name === name);

// ─── 1. REPLACE Google Calendar: Leer Eventos → Leer Citas Supabase ──────────
const gcalReadIdx = getIdx('Google Calendar: Leer Eventos');
wf.nodes[gcalReadIdx] = {
  id: wf.nodes[gcalReadIdx].id,
  name: 'Leer Citas Supabase',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: wf.nodes[gcalReadIdx].position,
  parameters: {
    jsCode: [
      '// LEER CITAS SUPABASE — reemplaza Google Calendar: Leer Eventos',
      '// Lee citas confirmadas para calcular slots ocupados de la clinica',
      'const ctx = $(\'Explicar Agendamiento\').item.json;',
      'const SUPABASE_URL = $env.N8N_SUPABASE_URL;',
      'const SERVICE_KEY  = $env.N8N_SUPABASE_SERVICE_KEY;',
      'const clinic_id    = ctx.clinic_id;',
      '',
      'if (!clinic_id) {',
      '  console.warn(JSON.stringify({ ts: new Date().toISOString(), event: "NO_CLINIC_ID" }));',
      '  return [{ json: { no_appointments: true } }];',
      '}',
      '',
      'const now     = new Date();',
      'const in7days = new Date(now.getTime() + 7 * 24 * 3600000);',
      '',
      'let appointments = [];',
      'try {',
      '  appointments = await this.helpers.httpRequest({',
      '    method: "GET",',
      '    url: SUPABASE_URL + "/rest/v1/appointments"',
      '      + "?clinic_id=eq." + clinic_id',
      '      + "&start_time=gte." + now.toISOString()',
      '      + "&start_time=lte." + in7days.toISOString()',
      '      + "&status=neq.cancelled"',
      '      + "&select=start_time,end_time",',
      '    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY },',
      '    json: true',
      '  });',
      '} catch(e) {',
      '  console.error(JSON.stringify({ ts: new Date().toISOString(), event: "APPTS_READ_ERROR", error: e.message }));',
      '}',
      '',
      'if (!appointments || appointments.length === 0) {',
      '  // Sin citas agendadas — todos los slots estan libres',
      '  return [{ json: { no_appointments: true } }];',
      '}',
      '',
      '// Formato compatible con Calcular Slots Disponibles',
      'return appointments.map(a => ({',
      '  json: {',
      '    start: { dateTime: a.start_time },',
      '    end:   { dateTime: a.end_time }',
      '  }',
      '}));'
    ].join('\n')
  }
};

// ─── 2. REMOVE Google Calendar create + IF + error handler ───────────────────
const toRemove = ['Crear Evento Google Calendar', '¿Evento Creado OK?', 'Manejar Error Calendar'];
toRemove.forEach(name => {
  const idx = getIdx(name);
  if (idx >= 0) { wf.nodes.splice(idx, 1); console.log('Removed: ' + name); }
});

// ─── 3. UPDATE Guardar Cita Supabase — directo desde Lock de Slot ─────────────
get('Guardar Cita Supabase').parameters.jsCode = [
  '// GUARDAR CITA — directo en Supabase, sin Google Calendar',
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
  '',
  '// IDEMPOTENCIA: evitar doble guardado',
  'let existing = [];',
  'try {',
  '  existing = await this.helpers.httpRequest({',
  '    method: "GET",',
  '    url: SUPABASE_URL + "/rest/v1/appointments"',
  '      + "?clinic_id=eq." + clinicId',
  '      + "&conversation_id=eq." + encodeURIComponent(convId)',
  '      + "&start_time=eq." + encodeURIComponent(startTime)',
  '      + "&select=id",',
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
  '  source:          "bot"',
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
  'console.log(JSON.stringify({ ts: new Date().toISOString(), event: "APPOINTMENT_SAVED", id: appt && appt.id }));',
  'return [{ json: Object.assign({}, ctx, { appointment_id: appt && appt.id, appointment_saved: true }) }];'
].join('\n');

// ─── 4. UPDATE Confirmar al Paciente — usa appointment_id ────────────────────
get('Confirmar al Paciente').parameters.jsCode = [
  '// CONFIRM APPOINTMENT TO PATIENT',
  'const original_data = $node["Lock de Slot"].json;',
  'const slot          = original_data.chosen_slot;',
  'const service       = original_data.service_type;',
  'const clinic_name   = original_data.clinic_name || original_data.slot_clinic_name || "nuestra clinica";',
  'const clinic_phone  = (original_data.bot_config && original_data.bot_config.phone)',
  '  ? original_data.bot_config.phone : (original_data.slot_clinic_phone || null);',
  'const nl = String.fromCharCode(10);',
  '',
  'const phone_line = clinic_phone ? (nl + "Si necesitas cambios, llamanos al " + clinic_phone) : "";',
  '',
  'const confirmation_message = "Listo! Tu cita de " + service + " ha sido agendada para el "',
  '  + slot.date + " a las " + slot.time + "." + nl + nl',
  '  + "Clinica: " + clinic_name + phone_line + nl + nl',
  '  + "Te esperamos!";',
  '',
  'const appt_id = $json.appointment_id || "N/A";',
  'const internal_note = "CITA AGENDADA AUTOMATICAMENTE" + nl + nl',
  '  + "Fecha/Hora: " + slot.date + " a las " + slot.time + nl',
  '  + "Servicio: " + service + nl',
  '  + "Paciente: " + original_data.sender_name + nl',
  '  + "Telefono: " + original_data.contact_phone + nl',
  '  + "Appointment ID: " + appt_id + nl + nl',
  '  + "SofIA - Confirmacion automatica";',
  '',
  'return [{',
  '  json: {',
  '    ...original_data,',
  '    confirmation_message: confirmation_message,',
  '    internal_note: internal_note,',
  '    appointment_id: appt_id,',
  '    event_created: true',
  '  }',
  '}];'
].join('\n');

// ─── 5. FIX CONNECTIONS ───────────────────────────────────────────────────────
// Rename Google Calendar Leer Eventos -> Leer Citas Supabase
if (wf.connections['Google Calendar: Leer Eventos']) {
  wf.connections['Leer Citas Supabase'] = wf.connections['Google Calendar: Leer Eventos'];
  delete wf.connections['Google Calendar: Leer Eventos'];
}

// Remove deleted nodes from connections
toRemove.forEach(name => delete wf.connections[name]);

// Lock de Slot -> Guardar Cita Supabase (skip removed nodes)
wf.connections['Lock de Slot'] = {
  main: [[{ node: 'Guardar Cita Supabase', type: 'main', index: 0 }]]
};

// Guardar Cita -> Confirmar al Paciente
wf.connections['Guardar Cita Supabase'] = {
  main: [[{ node: 'Confirmar al Paciente', type: 'main', index: 0 }]]
};

fs.writeFileSync('saas/sofia_live_gcal_removed.json', JSON.stringify(wf, null, 2));
console.log('Done. Nodes total: ' + wf.nodes.length);
console.log('GoogleCalendar nodes remaining: ' + wf.nodes.filter(n => n.type === 'n8n-nodes-base.googleCalendar').length);
console.log('Connections sample - Lock de Slot:', JSON.stringify(wf.connections['Lock de Slot']));
