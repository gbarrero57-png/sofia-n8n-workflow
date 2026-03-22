const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('c:/Users/Barbara/Documents/n8n_workflow_claudio/saas/sofia_live.json','utf8'));
const get = name => wf.nodes.find(n => n.name === name);
const nl = 'String.fromCharCode(10)';

// ─────────────────────────────────────────────────────────────
// Fix 1: Marcar Esperando Confirmación - store original_message in SOFIA_SLOTS note
// ─────────────────────────────────────────────────────────────
const marcar = get('Marcar Esperando Confirmación');
marcar.parameters.jsCode = `// MARCAR ESPERANDO CONFIRMACION
const ctx = $node["Formatear Oferta de Slots"].json;
const account_id = ctx.account_id;
const conversation_id = ctx.conversation_id;
const token = 'yypAwZDH2dV3crfbqJqWCgj1';
const baseUrl = 'https://chat.redsolucionesti.com/api/v1/accounts/' + account_id;
const headers = { 'api_access_token': token, 'Content-Type': 'application/json' };

try {
  await this.helpers.httpRequest({
    method: 'POST',
    url: baseUrl + '/conversations/' + conversation_id + '/labels',
    headers: headers,
    body: { labels: ['awaiting_slot'] }
  });
} catch(e) {
  console.error(JSON.stringify({ ts: new Date().toISOString(), event: 'LABEL_ERROR', error: e.message }));
}

const slots = ctx.selected_slots || [];
if (slots.length > 0) {
  try {
    const notePayload = {
      slots: slots,
      original_message: ctx.message_text || '',
      clinic_name: ctx.clinic_name || '',
      clinic_phone: (ctx.bot_config && ctx.bot_config.phone) ? ctx.bot_config.phone : ''
    };
    await this.helpers.httpRequest({
      method: 'POST',
      url: baseUrl + '/conversations/' + conversation_id + '/messages',
      headers: headers,
      body: { content: 'SOFIA_SLOTS:' + JSON.stringify(notePayload), message_type: 'outgoing', private: true }
    });
    console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'SLOTS_STORED', count: slots.length }));
  } catch(e) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), event: 'SLOTS_STORE_ERROR', error: e.message }));
  }
}

return [{
  json: {
    message_text: ctx.message_text, conversation_id: ctx.conversation_id,
    inbox_id: ctx.inbox_id, clinic_id: ctx.clinic_id,
    clinic_name: ctx.clinic_name, bot_config: ctx.bot_config,
    contact_phone: ctx.contact_phone, contact_id: ctx.contact_id,
    account_id: ctx.account_id, message_type: ctx.message_type,
    message_timestamp: ctx.message_timestamp,
    bot_interaction_count: ctx.bot_interaction_count,
    sender_name: ctx.sender_name, sender_email: ctx.sender_email,
    conversation_status: ctx.conversation_status,
    has_contact_inbox: ctx.has_contact_inbox, channel_type: ctx.channel_type,
    intent: ctx.intent, confidence: ctx.confidence,
    selected_slots: ctx.selected_slots || [],
    label_set: true, slots_stored: slots.length > 0
  }
}];`;

// ─────────────────────────────────────────────────────────────
// Fix 2: Check Slot Confirmation State - parse new + old format
// ─────────────────────────────────────────────────────────────
const checkSlot = get('Check Slot Confirmation State');
checkSlot.parameters.jsCode = `// CHECK IF AWAITING SLOT CONFIRMATION
const validar_data = $node["Validar Input"].json;
const convLabels = (validar_data.raw_payload && validar_data.raw_payload.conversation && validar_data.raw_payload.conversation.labels) ? validar_data.raw_payload.conversation.labels : [];
const awaitingViaLabel = convLabels.includes("awaiting_slot");
const custom_attrs = (validar_data.raw_payload && validar_data.raw_payload.conversation) ? validar_data.raw_payload.conversation.custom_attributes : {};
const awaitingViaAttr = custom_attrs && custom_attrs.awaiting_slot_confirmation === "true";
const awaiting = awaitingViaLabel || awaitingViaAttr;

console.log(JSON.stringify({ ts: new Date().toISOString(), awaiting_label: awaitingViaLabel, labels: convLabels }));

let slots = [];
let original_message = '';
let slot_clinic_name = '';
let slot_clinic_phone = '';

if (awaiting) {
  try {
    const account_id = validar_data.account_id;
    const conversation_id = validar_data.conversation_id;
    const token = 'yypAwZDH2dV3crfbqJqWCgj1';
    const resp = await this.helpers.httpRequest({
      method: 'GET',
      url: 'https://chat.redsolucionesti.com/api/v1/accounts/' + account_id + '/conversations/' + conversation_id + '/messages',
      headers: { 'api_access_token': token }
    });
    const messages = resp.payload || [];
    const slotNotes = messages.filter(function(m) {
      return m.private && typeof m.content === 'string' && m.content.startsWith('SOFIA_SLOTS:');
    });
    if (slotNotes.length > 0) {
      const lastNote = slotNotes[slotNotes.length - 1];
      const raw = lastNote.content.replace('SOFIA_SLOTS:', '');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        slots = parsed;
      } else {
        slots = parsed.slots || [];
        original_message = parsed.original_message || '';
        slot_clinic_name = parsed.clinic_name || '';
        slot_clinic_phone = parsed.clinic_phone || '';
      }
      console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'SLOTS_RETRIEVED', count: slots.length, orig: original_message.substring(0,40) }));
    } else {
      console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'SLOTS_NOTE_NOT_FOUND' }));
    }
  } catch(e) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), event: 'SLOTS_FETCH_ERROR', error: e.message }));
  }
}

return [{
  json: {
    ...$json,
    intent: $json.intent,
    confidence: $json.confidence,
    slot_confirmation_pending: awaiting && ($json.classified_by === 'SLOT_CONFIRMATION_DETECTOR'),
    offered_slots: slots,
    original_appointment_message: original_message,
    slot_clinic_name: slot_clinic_name,
    slot_clinic_phone: slot_clinic_phone,
    is_second_interaction: awaiting
  }
}];`;

// ─────────────────────────────────────────────────────────────
// Fix 3: Lock de Slot - dynamic location + service from original_message
// ─────────────────────────────────────────────────────────────
const lock = get('Lock de Slot');
lock.parameters.jsCode = `// LOCK SLOT - Prepare event data
const slot = $json.chosen_slot;
const patient = $json.sender_name || 'Paciente';
const phone = $json.contact_phone || 'No disponible';
const clinicName = $json.clinic_name || $json.slot_clinic_name || 'Clinica';
const nl = String.fromCharCode(10);

// Detect service from original appointment request (stored in SOFIA_SLOTS note)
const src_msg = ($json.original_appointment_message || '').toLowerCase();
let service = 'Consulta dental';
if (src_msg.includes('limpieza')) service = 'Limpieza dental';
else if (src_msg.includes('blanqueamiento')) service = 'Blanqueamiento dental';
else if (src_msg.includes('ortodoncia')) service = 'Ortodoncia';
else if (src_msg.includes('extraccion') || src_msg.includes('extracción')) service = 'Extraccion dental';
else if (src_msg.includes('endodoncia') || src_msg.includes('conducto')) service = 'Endodoncia';
else if (src_msg.includes('implante')) service = 'Implante dental';
else if (src_msg.includes('revision') || src_msg.includes('revisión') || src_msg.includes('chequeo')) service = 'Revision dental';
else if (src_msg.includes('dolor') || src_msg.includes('urgencia')) service = 'Urgencia dental';

return [{
  json: {
    ...$json,
    event_summary: service + ' - ' + patient,
    event_description: 'Paciente: ' + patient + nl + 'Telefono: ' + phone + nl + 'Servicio: ' + service + nl + nl + 'Agendado automaticamente por SofIA Bot',
    event_start: slot.start_iso,
    event_end: slot.end_iso,
    event_location: clinicName,
    service_type: service
  }
}];`;

// ─────────────────────────────────────────────────────────────
// Fix 4: Confirmar al Paciente - dynamic clinic name + phone
// ─────────────────────────────────────────────────────────────
const confirmar = get('Confirmar al Paciente');
confirmar.parameters.jsCode = `// CONFIRM APPOINTMENT TO PATIENT
const original_data = $node["Lock de Slot"].json;
const slot = original_data.chosen_slot;
const service = original_data.service_type;
const clinic_name = original_data.clinic_name || original_data.slot_clinic_name || 'nuestra clinica';
const clinic_phone = (original_data.bot_config && original_data.bot_config.phone)
  ? original_data.bot_config.phone
  : (original_data.slot_clinic_phone || null);
const nl = String.fromCharCode(10);

const phone_line = clinic_phone ? (nl + 'Si necesitas cambios, llamanos al ' + clinic_phone) : '';

const confirmation_message = 'Listo! Tu cita de ' + service + ' ha sido agendada para el ' + slot.date + ' a las ' + slot.time + '.' + nl + nl + 'Clinica: ' + clinic_name + phone_line + nl + nl + 'Te esperamos!';

const internal_note = 'CITA AGENDADA AUTOMATICAMENTE' + nl + nl +
  'Fecha/Hora: ' + slot.date + ' a las ' + slot.time + nl +
  'Servicio: ' + service + nl +
  'Paciente: ' + original_data.sender_name + nl +
  'Telefono: ' + original_data.contact_phone + nl +
  'Event ID: ' + $json.id + nl + nl +
  'SofIA - Confirmacion automatica';

return [{
  json: {
    ...original_data,
    confirmation_message: confirmation_message,
    internal_note: internal_note,
    event_id: $json.id,
    event_created: true
  }
}];`;

// ─────────────────────────────────────────────────────────────
// Fix 5: Actualizar Attributes Éxito - increment bot_interaction_count
// ─────────────────────────────────────────────────────────────
const exito = get('Actualizar Attributes Éxito');
exito.parameters.jsCode = `// ACTUALIZAR ATTRIBUTES EXITO
const ctx = $node["Lock de Slot"].json;
const account_id = ctx.account_id;
const conversation_id = ctx.conversation_id;
const token = 'yypAwZDH2dV3crfbqJqWCgj1';
const baseUrl = 'https://chat.redsolucionesti.com/api/v1/accounts/' + account_id;
const headers = { 'api_access_token': token, 'Content-Type': 'application/json' };

try {
  await this.helpers.httpRequest({
    method: 'PATCH',
    url: baseUrl + '/conversations/' + conversation_id,
    headers: headers,
    body: {
      custom_attributes: {
        sofia_phase: 'PHASE_4_COMPLETE',
        awaiting_slot_confirmation: 'false',
        appointment_confirmed: 'true',
        bot_interaction_count: (ctx.bot_interaction_count || 0) + 1
      }
    }
  });
} catch(e) {
  console.error(JSON.stringify({ ts: new Date().toISOString(), event: 'ATTRS_UPDATE_ERROR', error: e.message }));
}

try {
  await this.helpers.httpRequest({
    method: 'POST',
    url: baseUrl + '/conversations/' + conversation_id + '/labels',
    headers: headers,
    body: { labels: [] }
  });
} catch(e) {
  console.error(JSON.stringify({ ts: new Date().toISOString(), event: 'LABEL_CLEAR_ERROR', error: e.message }));
}

return [{
  json: {
    account_id: account_id,
    conversation_id: conversation_id,
    clinic_id: ctx.clinic_id,
    intent: ctx.intent,
    attrs_updated: true,
    label_cleared: true
  }
}];`;

// ─────────────────────────────────────────────────────────────
// Fix 6: Wire Registrar Metrica -> Registrar Ejecucion
// ─────────────────────────────────────────────────────────────
wf.connections['Registrar Metrica'] = {
  main: [[{ node: 'Registrar Ejecucion', type: 'main', index: 0 }]]
};

fs.writeFileSync('c:/Users/Barbara/Documents/n8n_workflow_claudio/saas/sofia_live_fixed2.json', JSON.stringify(wf, null, 2));
console.log('All 6 fixes applied OK');
