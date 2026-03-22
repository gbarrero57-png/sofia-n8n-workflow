const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('c:/Users/Barbara/Documents/n8n_workflow_claudio/saas/sofia_current.json', 'utf8'));

const guardarIdx = wf.nodes.findIndex(n => n.name === 'Guardar Cita Supabase');
let code = wf.nodes[guardarIdx].parameters.jsCode;

// Fix 1: Restore context from Lock de Slot (Google Calendar wiped $json)
code = code.replace(
    'const SUPABASE_URL = $env.N8N_SUPABASE_URL;',
    `// CONTEXT RESTORE: Google Calendar replaced $json — restore from Lock de Slot\nconst _lockCtx = $node["Lock de Slot"].json;\nconst _calEvent = $json;\nconst SUPABASE_URL = $env.N8N_SUPABASE_URL;`
);

// Fix 2: clinic_id from conversation context
code = code.replace('const clinicId     = $json.clinic_id;', 'const clinicId     = _lockCtx.clinic_id;');

// Fix 3: calendar event ID from Google Calendar response
code = code.replace("const calendarEventId = ($json.id || 'unknown')", "const calendarEventId = (_calEvent.id || 'unknown')");

// Fix 4: body - use _lockCtx for conversation fields, _calEvent for times
code = code.replace(
    "clinic_id: clinicId, conversation_id: $json.conversation_id || 0,",
    "clinic_id: clinicId, conversation_id: _lockCtx.conversation_id || 0,"
);
code = code.replace(
    "patient_name: ($json.sender_name || 'Paciente').substring(0, 100),",
    "patient_name: (_lockCtx.sender_name || 'Paciente').substring(0, 100),"
);
code = code.replace(
    "phone: ($json.contact_phone || '').substring(0, 30),",
    "phone: (_lockCtx.contact_phone || '').substring(0, 30),"
);
code = code.replace(
    "start_time: $json.start || new Date().toISOString(),",
    "start_time: (_calEvent.start && _calEvent.start.dateTime) || _calEvent.start || new Date().toISOString(),"
);
code = code.replace(
    "end_time:   $json.end   || new Date(Date.now() + 3600000).toISOString(),",
    "end_time:   (_calEvent.end && _calEvent.end.dateTime) || _calEvent.end || new Date(Date.now() + 3600000).toISOString(),"
);

// Fix 5: return statements
code = code.replace(
    '{ json: Object.assign({}, $json, { appointment_saved: true, appointment_duplicate: true }) }',
    '{ json: Object.assign({}, _lockCtx, { calendar_event_id: _calEvent.id, appointment_saved: true, appointment_duplicate: true }) }'
);
code = code.replace(
    '{ json: Object.assign({}, $json, { appointment_saved: true }) }',
    '{ json: Object.assign({}, _lockCtx, { calendar_event_id: _calEvent.id, appointment_saved: true }) }'
);
code = code.replace(
    '{ json: Object.assign({}, $json, { appointment_saved: false, appointment_error: e.message }) }',
    '{ json: Object.assign({}, _lockCtx, { calendar_event_id: _calEvent.id, appointment_saved: false, appointment_error: e.message }) }'
);

const checks = [
    '_lockCtx = $node["Lock de Slot"].json',
    '_lockCtx.clinic_id',
    '_calEvent.id',
    '_lockCtx.conversation_id',
    '_lockCtx.sender_name',
    '_lockCtx.contact_phone',
    '_calEvent.start && _calEvent.start.dateTime',
];
checks.forEach(function(c) { console.log(c + ':', code.includes(c) ? '✅' : '❌'); });

wf.nodes[guardarIdx].parameters.jsCode = code;
const putBody = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings, staticData: wf.staticData };
fs.writeFileSync('c:/Users/Barbara/Documents/n8n_workflow_claudio/saas/sofia_put_guardar.json', JSON.stringify(putBody));
console.log('PUT body saved.');
