// ============================================
// VALIDAR INPUT + DETECTAR CONTACTO NUEVO
// ============================================
const payload = $input.item.json.body || $input.item.json;

// Campos del evento
const event = payload.event;
const content = payload.content || '';
const conversation_id = payload.conversation?.id;
const inbox_id = payload.conversation?.inbox_id;
const clinic_id = payload.conversation?.custom_attributes?.clinic_id;
const patient_id = payload.conversation?.custom_attributes?.patient_id;
const contact_phone = payload.conversation?.contact_inbox?.source_id;
const contact_id = payload.sender?.id;
const channel_type = payload.conversation?.contact_inbox?.inbox?.channel_type;
const account_id = payload.account?.id || 2;
const message_type = payload.message_type;
const created_at = payload.created_at;

// Obtener contador de interacciones bot
const bot_count = payload.conversation?.custom_attributes?.bot_interaction_count || 0;
const last_bot_message = payload.conversation?.custom_attributes?.last_bot_message_at;
const contact_inboxes = payload.conversation?.contact_inbox;
const has_contact_inbox = !!contact_inboxes;

return [{
  json: {
    message_text: (content || '').trim(),
    conversation_id: conversation_id,
    inbox_id: inbox_id,
    inbox_id_api: 2,
    inbox_id_db: 3,
    clinic_id: clinic_id || 'default',
    patient_id: patient_id,
    contact_phone: contact_phone,
    contact_id: contact_id,
    account_id: account_id,
    message_type: message_type,
    message_timestamp: created_at,
    bot_interaction_count: bot_count,
    last_bot_message_at: last_bot_message,
    sender_name: payload.sender?.name || 'Paciente',
    sender_email: payload.sender?.email,
    conversation_status: payload.conversation?.status,
    has_contact_inbox: has_contact_inbox,
    channel_type: channel_type || 'Channel::WebWidget',
    raw_payload: payload
  }
}];
