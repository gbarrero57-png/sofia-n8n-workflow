// patch_menu_system.js — Adds full interactive menu system to SofIA
// New nodes: ¿Es MENU o GREETING?, Generar Texto Menu, Enviar Menu,
//            ¿Es MENU_SELECTION?, Resolver Opcion Menu,
//            ¿Es APPOINTMENT_STATUS?, Buscar Citas Paciente, Formatear Citas, Enviar Citas
const https = require('https');

const N8N_HOST = 'workflows.n8n.redsolucionesti.com';
const API_KEY  = process.env.N8N_API_KEY || '';
const WF_ID    = '37SLdWISQLgkHeXk';

// ─── Node codes ─────────────────────────────────────────────────────────────

const CODE_GENERAR_MENU = [
  'const ctx = $input.first().json;',
  'const botConfig = ctx.bot_config || {};',
  'const menu = botConfig.menu || {};',
  'const clinicName = ctx.clinic_name || "la clinica";',
  'const header = (menu.header || "Hola! Soy SofIA tu asistente virtual").replace("{clinic_name}", clinicName);',
  'const footer = menu.footer || "\\nResponde con el numero de tu opcion.";',
  'const options = menu.options || [',
  '  { id: "1", emoji: "📅", label: "Agendar una cita" },',
  '  { id: "2", emoji: "🕐", label: "Horarios y ubicacion" },',
  '  { id: "3", emoji: "💰", label: "Servicios y precios" },',
  '  { id: "4", emoji: "📋", label: "Ver o cancelar mi cita" },',
  '  { id: "5", emoji: "👤", label: "Hablar con un agente" }',
  '];',
  'const optionLines = options.map(function(o) { return o.emoji + " *" + o.id + ".* " + o.label; }).join("\\n");',
  'const menuText = header + "\\n\\n" + optionLines + footer;',
  'return [{ json: Object.assign({}, ctx, { menu_text: menuText, menu_options: options }) }];'
].join('\n');

const CODE_RESOLVER_OPCION = [
  'const ctx = $input.first().json;',
  'const opcion = String(ctx.menu_selection_option || "").trim();',
  'const menuOptions = (ctx.menu_options) || (ctx.bot_config && ctx.bot_config.menu && ctx.bot_config.menu.options) || [];',
  'const selected = menuOptions.find(function(o) { return o.id === opcion; });',
  'if (!selected) {',
  '  // Invalid option - show menu again',
  '  return [{ json: Object.assign({}, ctx, { intent: "MENU", classified_by: "MENU_INVALID", skip_ai: true }) }];',
  '}',
  'const out = Object.assign({}, ctx, {',
  '  intent: selected.intent,',
  '  classified_by: "MENU_SELECTION_RESOLVED",',
  '  skip_ai: true',
  '});',
  '// For INFO options, use predefined query instead of original message',
  'if (selected.intent === "INFO" && selected.query) {',
  '  out.message_text = selected.query;',
  '}',
  'return [{ json: out }];'
].join('\n');

const CODE_BUSCAR_CITAS = [
  'const ctx = $input.first().json;',
  'const SUPABASE_URL = $env.N8N_SUPABASE_URL;',
  'const SERVICE_KEY  = $env.N8N_SUPABASE_SERVICE_KEY;',
  'const phone     = ctx.contact_phone || "";',
  'const clinicId  = ctx.clinic_id || "";',
  '',
  'if (!phone) {',
  '  return [{ json: Object.assign({}, ctx, { raw_appointments: [], has_appointments: false, phone_missing: true }) }];',
  '}',
  '',
  'let appointments = [];',
  'const fields = "select=id,start_time,end_time,service,status,patient_name";',
  'const base   = SUPABASE_URL + "/rest/v1/appointments";',
  'const hdrs   = { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY };',
  '',
  '// Try contact_phone field first, then phone field',
  'const queries = [',
  '  base + "?contact_phone=eq." + encodeURIComponent(phone) + "&clinic_id=eq." + clinicId + "&status=neq.cancelled&order=start_time.asc&limit=5&" + fields,',
  '  base + "?phone=eq."         + encodeURIComponent(phone) + "&clinic_id=eq." + clinicId + "&status=neq.cancelled&order=start_time.asc&limit=5&" + fields',
  '];',
  '',
  'for (var qi = 0; qi < queries.length; qi++) {',
  '  try {',
  '    const res = await this.helpers.httpRequest({ method: "GET", url: queries[qi], headers: hdrs, json: true });',
  '    if (res && res.length > 0) { appointments = res; break; }',
  '  } catch(e) { /* try next */ }',
  '}',
  '',
  'return [{ json: Object.assign({}, ctx, { raw_appointments: appointments, has_appointments: appointments.length > 0 }) }];'
].join('\n');

const CODE_FORMATEAR_CITAS = [
  'const ctx = $input.first().json;',
  'const appts = ctx.raw_appointments || [];',
  'const clinicName = ctx.clinic_name || "la clinica";',
  '',
  'if (!appts || appts.length === 0) {',
  '  var noApptText = "";',
  '  if (ctx.phone_missing) {',
  '    noApptText = "No pude identificar tu numero de telefono. Por favor contacta directamente a la clinica.";',
  '  } else {',
  '    noApptText = "No encontre citas programadas para tu numero en " + clinicName + ".\\n\\nPara agendar una nueva cita responde *1* o escribe \\"quiero una cita\\".";',
  '  }',
  '  return [{ json: Object.assign({}, ctx, { appointments_text: noApptText }) }];',
  '}',
  '',
  'var lines = appts.map(function(a, i) {',
  '  var dt     = new Date(a.start_time);',
  '  var fecha  = dt.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });',
  '  var hora   = dt.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });',
  '  var serv   = a.service || "Consulta general";',
  '  var estado = a.status === "scheduled" ? "Confirmada ✅" : a.status;',
  '  var shortId = a.id ? a.id.slice(0, 8) : "---";',
  '  return (i + 1) + ". *" + fecha + "* a las " + hora + "\\n   Servicio: " + serv + "\\n   Estado: " + estado;',
  '});',
  '',
  'var text = "📋 *Tus citas en " + clinicName + ":*\\n\\n" + lines.join("\\n\\n");',
  'text += "\\n\\n_Para cancelar una cita escribe: cancelar [numero]_\\n_Ej: cancelar 1_";',
  'text += "\\n\\nPara agendar una nueva cita responde *1*.";',
  '',
  'return [{ json: Object.assign({}, ctx, { appointments_text: text }) }];'
].join('\n');

const CODE_PRE_CLASIFICADOR_V4 = [
  '// PRE-CLASIFICADOR BASADO EN KEYWORDS v4 — with MENU and MENU_SELECTION',
  'const message = ($json.message_text || "").toLowerCase().trim();',
  '',
  '// 1. SLOT CONFIRMATION: highest priority (when awaiting slot)',
  'const convLabels = $json.raw_payload && $json.raw_payload.conversation && $json.raw_payload.conversation.labels || [];',
  'const awaitingSlot = convLabels.includes("awaiting_slot");',
  '',
  'if (awaitingSlot) {',
  '    const wordMap = { "uno":"1","one":"1","dos":"2","two":"2","tres":"3","three":"3" };',
  '    const cleanMsg = message.replace(/[^a-z0-9 ]/g, "").trim();',
  '    const slotFromWord = wordMap[cleanMsg];',
  '    const slotFromDigit = message.match(/[1-3]/)?.[0];',
  '    const slotDigit = slotFromWord || slotFromDigit || null;',
  '    if (slotDigit) {',
  '        return [{ json: Object.assign({}, $json, { message_text: slotDigit, intent: "CREATE_EVENT", confidence: "high", classified_by: "SLOT_CONFIRMATION_DETECTOR", skip_ai: true }) }];',
  '    }',
  '    // Affirmative response when awaiting slot',
  '    const affirmatives = ["si","sí","yes","ok","dale","de acuerdo","bueno","perfecto","claro","listo","va","quiero","ese","esa"];',
  '    const cleanMsg2 = message.replace(/[^a-z0-9áéíóúñ ]/g, "").trim();',
  '    if (affirmatives.includes(cleanMsg2) || affirmatives.some(function(a) { return cleanMsg2.startsWith(a + " "); })) {',
  '        return [{ json: Object.assign({}, $json, { intent: "CREATE_EVENT", confidence: "high", classified_by: "SLOT_AFFIRMATION_DETECTOR", skip_ai: true }) }];',
  '    }',
  '}',
  '',
  '// 2. MENU keywords — show menu',
  'const MENU_KEYWORDS = ["menu","menú","opciones","opcion","inicio","volver","ayuda","start","hola menu","ver opciones"];',
  'for (var mi = 0; mi < MENU_KEYWORDS.length; mi++) {',
  '    if (message === MENU_KEYWORDS[mi] || message.startsWith(MENU_KEYWORDS[mi])) {',
  '        return [{ json: Object.assign({}, $json, { intent: "MENU", confidence: "high", classified_by: "MENU_KEYWORD_DETECTOR", skip_ai: true }) }];',
  '    }',
  '}',
  '',
  '// 3. GREETING → show menu',
  'const greetingRegex = /^(hola+|holi+|hey+|ola+|hi+|hello+|buenas?|buenos?|saludos?|buen dia|buenas tardes|buenas noches)[!.¡ ]*$/i;',
  'if (greetingRegex.test(message)) {',
  '    return [{ json: Object.assign({}, $json, { intent: "GREETING", confidence: "high", classified_by: "GREETING_DETECTOR", skip_ai: true }) }];',
  '}',
  '',
  '// 4. MENU_SELECTION — standalone digit (not awaiting slot)',
  'const digitMatch = message.match(/^([1-9])$/);',
  'if (digitMatch && !awaitingSlot) {',
  '    return [{ json: Object.assign({}, $json, { intent: "MENU_SELECTION", menu_selection_option: digitMatch[1], confidence: "high", classified_by: "MENU_SELECTION_DETECTOR", skip_ai: true }) }];',
  '}',
  '',
  '// 5. CREATE_EVENT keywords',
  'const CREATE_EVENT_KEYWORDS = [',
  '    "agendar","reservar","cita","turno","appointment",',
  '    "quiero una cita","necesito cita","quiero cita",',
  '    "cuando puedo ir","horarios","disponibilidad",',
  '    "hay espacio","hay lugar","tienen espacio","tienes espacio",',
  '    "hay disponibilidad","puedo ir el","puedo ir mañana","puedo ir hoy",',
  '    "hora disponible","tienen hora","hay hora","una hora para"',
  '];',
  'for (var ci = 0; ci < CREATE_EVENT_KEYWORDS.length; ci++) {',
  '    if (message.includes(CREATE_EVENT_KEYWORDS[ci])) {',
  '        return [{ json: Object.assign({}, $json, { intent: "CREATE_EVENT", confidence: "high", classified_by: "PRE_CLASSIFIER", skip_ai: true }) }];',
  '    }',
  '}',
  '',
  '// 6. PAYMENT keywords',
  'const PAYMENT_KEYWORDS = ["pague","pagar","transferencia","deposite","ya pague","como pagar","metodo de pago","efectivo","tarjeta","factura","recibo","comprobante"];',
  'for (var pi = 0; pi < PAYMENT_KEYWORDS.length; pi++) {',
  '    if (message.includes(PAYMENT_KEYWORDS[pi])) {',
  '        return [{ json: Object.assign({}, $json, { intent: "PAYMENT", confidence: "high", classified_by: "PRE_CLASSIFIER", skip_ai: true }) }];',
  '    }',
  '}',
  '',
  '// 7. HUMAN escalation keywords',
  'const HUMAN_KEYWORDS = ["hablar con","persona real","humano","agente","operador","quiero hablar","necesito hablar","emergencia","urgencia","dolor fuerte","sangra","mucho dolor","hinchazon","infeccion","queja","reclamo","problema grave"];',
  'for (var hi = 0; hi < HUMAN_KEYWORDS.length; hi++) {',
  '    if (message.includes(HUMAN_KEYWORDS[hi])) {',
  '        return [{ json: Object.assign({}, $json, { intent: "HUMAN", confidence: "high", classified_by: "PRE_CLASSIFIER", skip_ai: true }) }];',
  '    }',
  '}',
  '',
  '// 8. Fallback → AI',
  'return [{ json: Object.assign({}, $json, { skip_ai: false }) }];'
].join('\n');

// ─── New nodes definitions ───────────────────────────────────────────────────

function newNodes() {
  return [
    // ¿Es MENU o GREETING?
    {
      id: 'if-menu-greeting',
      name: '¿Es MENU o GREETING?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2,
      position: [2128, 304],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
          combinator: 'or',
          conditions: [
            { id: 'cond-menu',     leftValue: '={{ $json.intent }}', rightValue: 'MENU',     operator: { type: 'string', operation: 'equals' } },
            { id: 'cond-greeting', leftValue: '={{ $json.intent }}', rightValue: 'GREETING', operator: { type: 'string', operation: 'equals' } }
          ]
        }
      }
    },
    // Generar Texto Menu
    {
      id: 'code-generar-menu',
      name: 'Generar Texto Menu',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2352, 164],
      parameters: { jsCode: CODE_GENERAR_MENU }
    },
    // Enviar Menu Chatwoot
    {
      id: 'http-enviar-menu',
      name: 'Enviar Menu Chatwoot',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2576, 164],
      parameters: {
        method: 'POST',
        url: '=https://chat.redsolucionesti.com/api/v1/accounts/{{ $json.account_id }}/conversations/{{ $json.conversation_id }}/messages',
        sendHeaders: true,
        headerParameters: { parameters: [{ name: 'api_access_token', value: 'yypAwZDH2dV3crfbqJqWCgj1' }] },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={\n  "content": {{ JSON.stringify($json.menu_text) }},\n  "message_type": "outgoing",\n  "private": false\n}',
        options: {}
      }
    },
    // ¿Es MENU_SELECTION?
    {
      id: 'if-menu-selection',
      name: '¿Es MENU_SELECTION?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2,
      position: [2352, 444],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
          combinator: 'and',
          conditions: [
            { id: 'cond-ms', leftValue: '={{ $json.intent }}', rightValue: 'MENU_SELECTION', operator: { type: 'string', operation: 'equals' } }
          ]
        }
      }
    },
    // Resolver Opcion Menu
    {
      id: 'code-resolver-opcion',
      name: 'Resolver Opcion Menu',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2576, 344],
      parameters: { jsCode: CODE_RESOLVER_OPCION }
    },
    // ¿Es APPOINTMENT_STATUS?
    {
      id: 'if-appointment-status',
      name: '¿Es APPOINTMENT_STATUS?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2,
      position: [2352, 804],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
          combinator: 'and',
          conditions: [
            { id: 'cond-as', leftValue: '={{ $json.intent }}', rightValue: 'APPOINTMENT_STATUS', operator: { type: 'string', operation: 'equals' } }
          ]
        }
      }
    },
    // Buscar Citas Paciente
    {
      id: 'code-buscar-citas',
      name: 'Buscar Citas Paciente',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2576, 704],
      parameters: { jsCode: CODE_BUSCAR_CITAS }
    },
    // Formatear Citas
    {
      id: 'code-formatear-citas',
      name: 'Formatear Citas',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2800, 704],
      parameters: { jsCode: CODE_FORMATEAR_CITAS }
    },
    // Enviar Citas Chatwoot
    {
      id: 'http-enviar-citas',
      name: 'Enviar Citas Chatwoot',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [3024, 704],
      parameters: {
        method: 'POST',
        url: '=https://chat.redsolucionesti.com/api/v1/accounts/{{ $json.account_id }}/conversations/{{ $json.conversation_id }}/messages',
        sendHeaders: true,
        headerParameters: { parameters: [{ name: 'api_access_token', value: 'yypAwZDH2dV3crfbqJqWCgj1' }] },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={\n  "content": {{ JSON.stringify($json.appointments_text) }},\n  "message_type": "outgoing",\n  "private": false\n}',
        options: {}
      }
    }
  ];
}

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

// ─── Main ────────────────────────────────────────────────────────────────────

async function run() {
  if (!API_KEY) { console.error('Set N8N_API_KEY'); process.exit(1); }

  console.log('Fetching workflow...');
  const wf = await apiGet('/api/v1/workflows/' + WF_ID);

  // 1. Update Pre-Clasificador
  const preNode = wf.nodes.find(n => n.name === 'Pre-Clasificador Keywords');
  preNode.parameters.jsCode = CODE_PRE_CLASIFICADOR_V4;
  console.log('Pre-Clasificador updated');

  // 2. Add new nodes
  const nodes = newNodes();
  wf.nodes.push(...nodes);
  console.log('Added', nodes.length, 'new nodes');

  // 3. Update connections
  const C = wf.connections;

  // Normalizar Intent → ¿Es MENU o GREETING? (was → ¿Es CREATE_EVENT?)
  C['Normalizar Intent'] = { main: [[{ node: '¿Es MENU o GREETING?', type: 'main', index: 0 }]] };

  // ¿Es MENU o GREETING? [YES] → Generar Texto Menu | [NO] → ¿Es MENU_SELECTION?
  C['¿Es MENU o GREETING?'] = {
    main: [
      [{ node: 'Generar Texto Menu',    type: 'main', index: 0 }],
      [{ node: '¿Es MENU_SELECTION?',   type: 'main', index: 0 }]
    ]
  };

  // Generar Texto Menu → Enviar Menu Chatwoot
  C['Generar Texto Menu'] = { main: [[{ node: 'Enviar Menu Chatwoot', type: 'main', index: 0 }]] };

  // Enviar Menu Chatwoot → Registrar Metrica
  C['Enviar Menu Chatwoot'] = { main: [[{ node: 'Registrar Metrica', type: 'main', index: 0 }]] };

  // ¿Es MENU_SELECTION? [YES] → Resolver Opcion Menu | [NO] → ¿Es CREATE_EVENT?
  C['¿Es MENU_SELECTION?'] = {
    main: [
      [{ node: 'Resolver Opcion Menu', type: 'main', index: 0 }],
      [{ node: '¿Es CREATE_EVENT?',    type: 'main', index: 0 }]
    ]
  };

  // Resolver Opcion Menu → ¿Es CREATE_EVENT? (reuses existing chain)
  C['Resolver Opcion Menu'] = { main: [[{ node: '¿Es CREATE_EVENT?', type: 'main', index: 0 }]] };

  // ¿Es PAYMENT? [NO] → ¿Es APPOINTMENT_STATUS? (was → Preparar Escalado)
  C['¿Es PAYMENT?'] = {
    main: [
      [{ node: 'Preparar Escalado',        type: 'main', index: 0 }],  // YES (payment)
      [{ node: '¿Es APPOINTMENT_STATUS?',  type: 'main', index: 0 }]   // NO
    ]
  };

  // ¿Es APPOINTMENT_STATUS? [YES] → Buscar Citas Paciente | [NO] → Preparar Escalado
  C['¿Es APPOINTMENT_STATUS?'] = {
    main: [
      [{ node: 'Buscar Citas Paciente', type: 'main', index: 0 }],
      [{ node: 'Preparar Escalado',     type: 'main', index: 0 }]
    ]
  };

  // Buscar Citas Paciente → Formatear Citas
  C['Buscar Citas Paciente'] = { main: [[{ node: 'Formatear Citas', type: 'main', index: 0 }]] };

  // Formatear Citas → Enviar Citas Chatwoot
  C['Formatear Citas'] = { main: [[{ node: 'Enviar Citas Chatwoot', type: 'main', index: 0 }]] };

  // Enviar Citas Chatwoot → Registrar Metrica
  C['Enviar Citas Chatwoot'] = { main: [[{ node: 'Registrar Metrica', type: 'main', index: 0 }]] };

  console.log('Connections updated');

  // 4. Push
  console.log('Pushing workflow...');
  const res = await apiPut('/api/v1/workflows/' + WF_ID, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings,
    staticData: wf.staticData
  });

  console.log('PUT:', res.status, res.status === 200 ? 'OK ✓' : res.body.slice(0, 400));
}

run().catch(console.error);
