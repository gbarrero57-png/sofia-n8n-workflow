/**
 * build_hinode_bot.mjs
 * Builds and activates the Hinode WhatsApp Sales Bot in n8n.
 *
 * Completely independent from SofIA. Does NOT touch sofia_main.json.
 *
 * Intents handled: GREETING | PRODUCT_INQUIRY | ORDER | ORDER_STATUS | PAYMENT | SHIPPING | HUMAN
 *
 * Usage:
 *   node scripts/builders/build_hinode_bot.mjs
 *
 * Prerequisites:
 *   - Migration 032_hinode_schema.sql applied
 *   - onboard_hinode_store.mjs executed (get the STORE_ID)
 *   - Chatwoot webhook configured to point to this workflow's webhook URL
 */

const API_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const BASE     = 'https://workflows.n8n.redsolucionesti.com';
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const TG_CRED  = { telegramApi: { id: 'cSaxAEvIePNLpINc', name: 'Telegram account' } };

// ── Nodes ────────────────────────────────────────────────────────────────────

const nodes = [

  // ── [1] Chatwoot Webhook ─────────────────────────────────────────────────
  {
    id: 'hinode-webhook', name: 'Chatwoot Webhook Hinode',
    type: 'n8n-nodes-base.webhook', typeVersion: 2,
    position: [0, 300],
    parameters: {
      httpMethod: 'POST',
      path: 'chatwoot-hinode',
      responseMode: 'onReceived',
      options: {}
    },
    webhookId: 'chatwoot-hinode'
  },

  // ── [2] Validar Input ────────────────────────────────────────────────────
  {
    id: 'hinode-validate', name: 'Validar Input Hinode',
    type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [240, 300],
    parameters: {
      jsCode: [
        'const payload = $input.item.json.body || $input.item.json;',
        'const event        = payload.event;',
        'const content      = payload.content || "";',
        'const conv_id      = payload.conversation && payload.conversation.id;',
        'const inbox_id     = payload.conversation && payload.conversation.inbox_id;',
        'const account_id   = (payload.account && payload.account.id) || 2;',
        'const message_type = payload.message_type;',
        'const created_at   = payload.created_at;',
        'const contact_phone= payload.conversation && payload.conversation.contact_inbox && payload.conversation.contact_inbox.source_id;',
        'const contact_id   = payload.sender && payload.sender.id;',
        'const sender_name  = (payload.sender && payload.sender.name) || "Cliente";',
        'const bot_count    = (payload.conversation && payload.conversation.custom_attributes && payload.conversation.custom_attributes.hinode_bot_count) || 0;',
        '',
        'return [{',
        '  json: {',
        '    message_text:         (content || "").trim(),',
        '    conversation_id:      conv_id,',
        '    inbox_id:             inbox_id,',
        '    account_id:           account_id,',
        '    message_type:         message_type,',
        '    message_timestamp:    created_at,',
        '    contact_phone:        contact_phone,',
        '    contact_id:           contact_id,',
        '    sender_name:          sender_name,',
        '    bot_interaction_count:bot_count,',
        '    conversation_status:  payload.conversation && payload.conversation.status',
        '  }',
        '}];'
      ].join('\n')
    }
  },

  // ── [3] Es Mensaje Entrante? ─────────────────────────────────────────────
  {
    id: 'hinode-is-incoming', name: 'Es Mensaje Entrante?',
    type: 'n8n-nodes-base.if', typeVersion: 2,
    position: [480, 300],
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' },
        conditions: [{
          id: 'c1',
          leftValue: '={{ $json.message_type }}',
          rightValue: 'incoming',
          operator: { type: 'string', operation: 'equals' }
        }],
        combinator: 'and'
      }
    }
  },

  // ── [4] WhatsApp Safe Check ──────────────────────────────────────────────
  {
    id: 'hinode-safe', name: 'WhatsApp Safe Check Hinode',
    type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [720, 180],
    parameters: {
      jsCode: [
        'const ctx       = $input.first().json;',
        'const bot_count = ctx.bot_interaction_count || 0;',
        'const raw       = (ctx.message_text || "").toLowerCase().trim();',
        'const msgNorm   = raw.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");',
        '',
        '// Límite de interacciones automáticas',
        'if (bot_count >= 15) {',
        '  return [{ json: { ...ctx, should_escalate: true, escalation_reason: "MAX_INTERACTIONS",',
        '    escalation_message: "Te conecto con un asesor ahora mismo. Un momento \\uD83D\\uDE4F" } }];',
        '}',
        '',
        '// Mensaje muy antiguo (> 24h)',
        'const age_h = (Date.now() - (ctx.message_timestamp * 1000)) / 3600000;',
        'if (age_h > 24) {',
        '  return [{ json: { ...ctx, should_escalate: false, skip: true } }];',
        '}',
        '',
        '// Opt-out / solicitud de humano',
        'const escalate_kws = ["agente","humano","persona real","hablar con alguien","stop","basta","detente","quiero hablar"];',
        'if (escalate_kws.some(function(k) { return raw.includes(k); })) {',
        '  return [{ json: { ...ctx, should_escalate: true, escalation_reason: "USER_OPT_OUT",',
        '    escalation_message: "Entendido, te conecto con un asesor \\uD83D\\uDE4F" } }];',
        '}',
        '',
        'return [{ json: { ...ctx, should_escalate: false, whatsapp_safe: true } }];'
      ].join('\n')
    }
  },

  // ── [5] ¿Escalar? ────────────────────────────────────────────────────────
  {
    id: 'hinode-if-escalate', name: '¿Escalar?',
    type: 'n8n-nodes-base.if', typeVersion: 2,
    position: [960, 180],
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' },
        conditions: [{
          id: 'c1',
          leftValue: '={{ $json.should_escalate }}',
          rightValue: true,
          operator: { type: 'boolean', operation: 'true' }
        }],
        combinator: 'and'
      }
    }
  },

  // ── [6] Bot Pause Check ──────────────────────────────────────────────────
  {
    id: 'hinode-pause-check', name: 'Bot Pause Check Hinode',
    type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [1200, 300],
    parameters: {
      jsCode: [
        'const ctx          = $input.first().json;',
        'const SUPA_URL     = $env.N8N_HINODE_SUPABASE_URL;',
        'const SERVICE_KEY  = $env.N8N_HINODE_SUPABASE_SERVICE_KEY;',
        'const conv_id      = String(ctx.conversation_id || "");',
        'const inbox_id     = ctx.inbox_id;',
        '',
        '// 1. Resolver tienda por inbox_id',
        'let store = null;',
        'try {',
        '  const sr = await this.helpers.httpRequest({',
        '    method: "GET",',
        '    url: SUPA_URL + "/rest/v1/hinode_stores?chatwoot_inbox_id=eq." + inbox_id + "&active=eq.true&select=id,name,bot_config,telegram_chat_id,chatwoot_account_id&limit=1",',
        '    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY }',
        '  });',
        '  store = sr && sr[0] ? sr[0] : null;',
        '} catch(e) {',
        '  console.warn("Store lookup failed:", e.message);',
        '}',
        '',
        'if (!store) {',
        '  return [{ json: { ...ctx, bot_paused: false, store_not_found: true,',
        '    store_id: null, chatwoot_api_token: "yypAwZDH2dV3crfbqJqWCgj1" } }];',
        '}',
        '',
        'const bot_config       = store.bot_config || {};',
        'const chatwoot_token   = bot_config.chatwoot_api_token || "yypAwZDH2dV3crfbqJqWCgj1";',
        'const store_id         = store.id;',
        '',
        '// 2. Upsert conversation + check bot_paused',
        'let bot_paused = false;',
        'let conv_draft = null;',
        'try {',
        '  // Upsert conversation row',
        '  await this.helpers.httpRequest({',
        '    method: "POST",',
        '    url: SUPA_URL + "/rest/v1/hinode_conversations",',
        '    headers: {',
        '      apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY,',
        '      "Content-Type": "application/json",',
        '      Prefer: "resolution=merge-duplicates"',
        '    },',
        '    body: {',
        '      store_id:                store_id,',
        '      chatwoot_conversation_id:conv_id,',
        '      customer_phone:          ctx.contact_phone || "",',
        '      customer_name:           ctx.sender_name || "",',
        '      last_activity_at:        new Date().toISOString()',
        '    },',
        '    json: true',
        '  });',
        '  // Fetch current state',
        '  const rows = await this.helpers.httpRequest({',
        '    method: "GET",',
        '    url: SUPA_URL + "/rest/v1/hinode_conversations?store_id=eq." + store_id + "&chatwoot_conversation_id=eq." + encodeURIComponent(conv_id) + "&select=bot_paused,current_order_draft,interaction_count&limit=1",',
        '    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY }',
        '  });',
        '  if (rows && rows[0]) {',
        '    bot_paused = rows[0].bot_paused === true;',
        '    conv_draft = rows[0].current_order_draft || null;',
        '  }',
        '} catch(e) {',
        '  console.warn("Conv upsert failed:", e.message);',
        '}',
        '',
        '// 3. Increment interaction count',
        'try {',
        '  await this.helpers.httpRequest({',
        '    method: "POST",',
        '    url: SUPA_URL + "/rest/v1/rpc/increment_hinode_interactions",',
        '    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json" },',
        '    body: { p_store_id: store_id, p_conv_id: conv_id },',
        '    json: true',
        '  });',
        '} catch(e) { /* No-op: function may not exist yet */ }',
        '',
        'return [{ json: {',
        '  ...ctx,',
        '  store_id:          store_id,',
        '  store_name:        store.name,',
        '  chatwoot_api_token:chatwoot_token,',
        '  bot_config:        bot_config,',
        '  telegram_chat_id:  store.telegram_chat_id || "-4523041658",',
        '  bot_paused:        bot_paused,',
        '  current_order_draft: conv_draft',
        '} }];'
      ].join('\n')
    }
  },

  // ── [7] ¿Bot Pausado? ────────────────────────────────────────────────────
  {
    id: 'hinode-if-paused', name: '¿Bot Pausado?',
    type: 'n8n-nodes-base.if', typeVersion: 2,
    position: [1440, 300],
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' },
        conditions: [{
          id: 'c1',
          leftValue: '={{ $json.bot_paused }}',
          rightValue: true,
          operator: { type: 'boolean', operation: 'true' }
        }],
        combinator: 'and'
      }
    }
  },

  // ── [8] Pre-Clasificador Keywords ────────────────────────────────────────
  {
    id: 'hinode-preclasif', name: 'Pre-Clasificador Keywords Hinode',
    type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [1680, 420],
    parameters: {
      jsCode: [
        'const msg  = ($json.message_text || "").toLowerCase().trim();',
        'const norm = msg.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");',
        '',
        '// Si el bot fue escalado antes (no debería llegar aquí, pero safety check)',
        'if ($json.should_escalate) {',
        '  return [{ json: { ...$json, intent: "HUMAN", skip_ai: true, classified_by: "SAFE_CHECK" } }];',
        '}',
        '',
        '// Si hay un pedido en progreso → continuar flujo ORDER',
        'const draft = $json.current_order_draft;',
        'if (draft && draft.step && draft.step !== "done") {',
        '  return [{ json: { ...$json, intent: "ORDER", skip_ai: true, classified_by: "ORDER_IN_PROGRESS" } }];',
        '}',
        '',
        '// GREETING / MENU',
        'const greet_kws = ["hola","buenos dias","buenas tardes","buenas noches","buen dia","hi","menu","catalogo","inicio","empezar","comenzar"];',
        'if (greet_kws.some(function(k) { return norm.startsWith(k) || norm === k; })) {',
        '  return [{ json: { ...$json, intent: "GREETING", skip_ai: true, classified_by: "KEYWORD" } }];',
        '}',
        '',
        '// PRODUCT_INQUIRY',
        'const product_kws = ["precio","cuanto","cuesta","fragancia","perfume","crema","serum","kit","combo","catalogo","producto","disponible","tienes","tienen","venden"];',
        'if (product_kws.some(function(k) { return norm.includes(k); })) {',
        '  return [{ json: { ...$json, intent: "PRODUCT_INQUIRY", skip_ai: true, classified_by: "KEYWORD" } }];',
        '}',
        '',
        '// ORDER',
        'const order_kws = ["quiero pedir","quiero comprar","deseo comprar","quiero uno","quiero una","pedir","comprar","ordenar","hacer pedido","un pedido"];',
        'if (order_kws.some(function(k) { return norm.includes(k); })) {',
        '  return [{ json: { ...$json, intent: "ORDER", skip_ai: true, classified_by: "KEYWORD" } }];',
        '}',
        '',
        '// ORDER_STATUS',
        'const status_kws = ["mi pedido","estado pedido","cuando llega","seguimiento","rastreo","donde esta mi","ya llego"];',
        'if (status_kws.some(function(k) { return norm.includes(k); })) {',
        '  return [{ json: { ...$json, intent: "ORDER_STATUS", skip_ai: true, classified_by: "KEYWORD" } }];',
        '}',
        '',
        '// PAYMENT',
        'const pay_kws = ["pago","pagar","yape","plin","transferencia","deposito","bcp","efectivo","como pago","metodo de pago"];',
        'if (pay_kws.some(function(k) { return norm.includes(k); })) {',
        '  return [{ json: { ...$json, intent: "PAYMENT", skip_ai: true, classified_by: "KEYWORD" } }];',
        '}',
        '',
        '// SHIPPING',
        'const ship_kws = ["envio","delivery","despacho","cuanto demora","llega","entrega","despachan","envian","mandan","envian","provincias","lima","costo envio"];',
        'if (ship_kws.some(function(k) { return norm.includes(k); })) {',
        '  return [{ json: { ...$json, intent: "SHIPPING", skip_ai: true, classified_by: "KEYWORD" } }];',
        '}',
        '',
        '// Sin clasificar → pasar a IA',
        'return [{ json: { ...$json, skip_ai: false } }];'
      ].join('\n')
    }
  },

  // ── [9] ¿Ya Clasificado? ─────────────────────────────────────────────────
  {
    id: 'hinode-if-classified', name: '¿Ya Clasificado?',
    type: 'n8n-nodes-base.if', typeVersion: 2,
    position: [1920, 420],
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' },
        conditions: [{
          id: 'c1',
          leftValue: '={{ $json.skip_ai }}',
          rightValue: true,
          operator: { type: 'boolean', operation: 'true' }
        }],
        combinator: 'and'
      }
    }
  },

  // ── [10] Clasificador AI ─────────────────────────────────────────────────
  {
    id: 'hinode-ai-clasif', name: 'Clasificador AI Hinode',
    type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
    position: [2160, 540],
    parameters: {
      method: 'POST',
      url: 'https://api.openai.com/v1/chat/completions',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'Authorization', value: 'Bearer ' + OPENAI_KEY },
          { name: 'Content-Type',  value: 'application/json' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={\n  "model": "gpt-4o-mini",\n  "temperature": 0,\n  "max_tokens": 20,\n  "messages": [\n    {\n      "role": "system",\n      "content": "Eres clasificador de intención para un bot de ventas de cosméticos Hinode.\\nClasifica en EXACTAMENTE UNO de: GREETING, PRODUCT_INQUIRY, ORDER, ORDER_STATUS, PAYMENT, SHIPPING, HUMAN.\\nResponde SOLO el nombre del intent, sin explicación ni puntuación."\n    },\n    {\n      "role": "user",\n      "content": "{{ $json.message_text }}"\n    }\n  ]\n}',
      options: {}
    }
  },

  // ── [11] Normalizar Intent ───────────────────────────────────────────────
  {
    id: 'hinode-normalize', name: 'Normalizar Intent Hinode',
    type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [2400, 420],
    parameters: {
      jsCode: [
        '// Path keyword: intent ya viene en $json',
        'if ($json.skip_ai === true && $json.intent) {',
        '  return [{ json: { ...$json, classified_at: new Date().toISOString() } }];',
        '}',
        '',
        '// Path AI: restaurar contexto y parsear respuesta',
        'const ctx  = $node["Pre-Clasificador Keywords Hinode"].json;',
        'const raw  = $json.choices && $json.choices[0] && $json.choices[0].message',
        '  ? $json.choices[0].message.content.trim().toUpperCase()',
        '  : "HUMAN";',
        '',
        'const valid = ["GREETING","PRODUCT_INQUIRY","ORDER","ORDER_STATUS","PAYMENT","SHIPPING","HUMAN"];',
        'const intent = valid.includes(raw) ? raw : "HUMAN";',
        '',
        'return [{ json: { ...ctx, intent: intent, classified_by: "AI", classified_at: new Date().toISOString() } }];'
      ].join('\n')
    }
  },

  // ── [12] ¿Es GREETING? ───────────────────────────────────────────────────
  {
    id: 'hinode-if-greeting', name: '¿Es GREETING?',
    type: 'n8n-nodes-base.if', typeVersion: 2,
    position: [2640, 420],
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' },
        conditions: [{
          id: 'c1',
          leftValue: '={{ $json.intent }}',
          rightValue: 'GREETING',
          operator: { type: 'string', operation: 'equals' }
        }],
        combinator: 'and'
      }
    }
  },

  // ── [13] Preparar Menú ───────────────────────────────────────────────────
  {
    id: 'hinode-gen-menu', name: 'Preparar Menú Hinode',
    type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [2880, 300],
    parameters: {
      jsCode: [
        'const ctx = $json;',
        'const welcome = (ctx.bot_config && ctx.bot_config.welcome_message) ||',
        '  "¡Hola! Bienvenido/a a *Hinode Perú* \\uD83C\\uDDF5\\uD83C\\uDDEA\\n\\nSomos distribuidores oficiales de la marca brasileña de cosméticos premium Hinode.";',
        '',
        'const menu = welcome + "\\n\\n" +',
        '  "¿Qué te gustaría ver hoy?\\n\\n" +',
        '  "\\uD83C\\uDF38 *1. Fragancias* — Perfumes premium desde S/. 79\\n" +',
        '  "\\uD83D\\uDCAB *2. Cremas Corporales* — Hidratantes y reafirmantes desde S/. 55\\n" +',
        '  "\\uD83E\\uDDD4 *3. Cuidado Facial* — Sérums y contorno desde S/. 72\\n" +',
        '  "\\uD83C\\uDF81 *4. Kits y Combos* — Sets especiales desde S/. 65\\n" +',
        '  "\\uD83D\\uDCE6 *5. Hacer un pedido*\\n" +',
        '  "\\uD83D\\uDE9A *6. Info de envíos*\\n" +',
        '  "\\uD83D\\uDCB3 *7. Métodos de pago*\\n\\n" +',
        '  "Escríbeme lo que buscas o el número de la opción \\uD83D\\uDE0A";',
        '',
        'return [{ json: { ...ctx, response_text: menu } }];'
      ].join('\n')
    }
  },

  // ── [14] Enviar Menú ─────────────────────────────────────────────────────
  {
    id: 'hinode-send-menu', name: 'Enviar Menú Hinode',
    type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
    position: [3120, 300],
    parameters: {
      method: 'POST',
      url: '=https://chat.redsolucionesti.com/api/v1/accounts/{{ $json.account_id }}/conversations/{{ $json.conversation_id }}/messages',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'api_access_token', value: '={{ $json.chatwoot_api_token }}' }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify({ content: $json.response_text, message_type: "outgoing", private: false }) }}',
      options: {}
    },
    continueOnFail: true
  },

  // ── [15] ¿Es PRODUCT_INQUIRY? ────────────────────────────────────────────
  {
    id: 'hinode-if-product', name: '¿Es PRODUCT_INQUIRY?',
    type: 'n8n-nodes-base.if', typeVersion: 2,
    position: [2640, 540],
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' },
        conditions: [{
          id: 'c1',
          leftValue: '={{ $json.intent }}',
          rightValue: 'PRODUCT_INQUIRY',
          operator: { type: 'string', operation: 'equals' }
        }],
        combinator: 'and'
      }
    }
  },

  // ── [16] Buscar y Preparar Productos ─────────────────────────────────────
  {
    id: 'hinode-search-products', name: 'Buscar Productos Hinode',
    type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [2880, 420],
    parameters: {
      jsCode: [
        'const ctx         = $json;',
        'const SUPA_URL    = $env.N8N_HINODE_SUPABASE_URL;',
        'const SERVICE_KEY = $env.N8N_HINODE_SUPABASE_SERVICE_KEY;',
        'const msg         = (ctx.message_text || "").toLowerCase();',
        '',
        '// Detectar categoría desde el mensaje',
        'let category_filter = "";',
        'if (msg.includes("fragancia") || msg.includes("perfume") || msg.includes("pocket")) category_filter = "fragancia";',
        'else if (msg.includes("crema") || msg.includes("corporal") || msg.includes("hidrat")) category_filter = "crema_corporal";',
        'else if (msg.includes("facial") || msg.includes("serum") || msg.includes("sérum") || msg.includes("ojos")) category_filter = "cuidado_facial";',
        'else if (msg.includes("kit") || msg.includes("combo") || msg.includes("set") || msg.includes("regalo")) category_filter = "kit";',
        '',
        '// Construir URL de búsqueda',
        'let url = SUPA_URL + "/rest/v1/hinode_products?store_id=eq." + ctx.store_id + "&active=eq.true&select=name,description,category,price_sale,sku&order=category.asc,price_sale.asc&limit=8";',
        'if (category_filter) url += "&category=eq." + category_filter;',
        '',
        'let products = [];',
        'try {',
        '  products = await this.helpers.httpRequest({',
        '    method: "GET", url: url,',
        '    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY }',
        '  });',
        '  if (!Array.isArray(products)) products = [];',
        '} catch(e) { console.warn("Products fetch failed:", e.message); }',
        '',
        '// Si no hay productos de la categoría, traer todos',
        'if (products.length === 0 && category_filter) {',
        '  try {',
        '    const all_url = SUPA_URL + "/rest/v1/hinode_products?store_id=eq." + ctx.store_id + "&active=eq.true&select=name,description,category,price_sale,sku&limit=6";',
        '    products = await this.helpers.httpRequest({ method: "GET", url: all_url, headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY } });',
        '    if (!Array.isArray(products)) products = [];',
        '  } catch(e) {}',
        '}',
        '',
        '// Llamar OpenAI con contexto de productos',
        'const OPENAI_KEY = "' + OPENAI_KEY + '";',
        'const product_ctx = products.map(function(p) {',
        '  return "- *" + p.name + "* (" + p.category + "): " + (p.description || "") + " — S/. " + p.price_sale;',
        '}).join("\\n");',
        '',
        'const prompt_sys = "Eres asesor de ventas de cosméticos Hinode. Responde en español, de forma amigable y concisa (máx 200 palabras). No inventes productos. Si no tienes info de un producto específico, ofrece los disponibles.";',
        'const prompt_usr = "Catálogo disponible:\\n" + (product_ctx || "Sin productos en esta categoría aún.") + "\\n\\nPregunta del cliente: " + ctx.message_text;',
        '',
        'let ai_response = "";',
        'try {',
        '  const ai_res = await this.helpers.httpRequest({',
        '    method: "POST",',
        '    url: "https://api.openai.com/v1/chat/completions",',
        '    headers: { Authorization: "Bearer " + OPENAI_KEY, "Content-Type": "application/json" },',
        '    body: { model: "gpt-4o-mini", temperature: 0.5, max_tokens: 350,',
        '      messages: [{ role: "system", content: prompt_sys }, { role: "user", content: prompt_usr }] },',
        '    json: true',
        '  });',
        '  ai_response = ai_res.choices && ai_res.choices[0] ? ai_res.choices[0].message.content.trim() : "";',
        '} catch(e) {',
        '  ai_response = product_ctx || "Lo siento, no pude cargar el catálogo en este momento. Escríbenos y te ayudamos \\uD83D\\uDE0A";',
        '}',
        '',
        'return [{ json: { ...ctx, response_text: ai_response } }];'
      ].join('\n')
    }
  },

  // ── [17] Enviar Respuesta Producto ────────────────────────────────────────
  {
    id: 'hinode-send-product', name: 'Enviar Respuesta Producto Hinode',
    type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
    position: [3120, 420],
    parameters: {
      method: 'POST',
      url: '=https://chat.redsolucionesti.com/api/v1/accounts/{{ $json.account_id }}/conversations/{{ $json.conversation_id }}/messages',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'api_access_token', value: '={{ $json.chatwoot_api_token }}' }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify({ content: $json.response_text, message_type: "outgoing", private: false }) }}',
      options: {}
    },
    continueOnFail: true
  },

  // ── [18] ¿Es ORDER? ──────────────────────────────────────────────────────
  {
    id: 'hinode-if-order', name: '¿Es ORDER?',
    type: 'n8n-nodes-base.if', typeVersion: 2,
    position: [2640, 660],
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' },
        conditions: [{
          id: 'c1',
          leftValue: '={{ $json.intent }}',
          rightValue: 'ORDER',
          operator: { type: 'string', operation: 'equals' }
        }],
        combinator: 'and'
      }
    }
  },

  // ── [19] Gestionar Pedido (State Machine) ─────────────────────────────────
  {
    id: 'hinode-order-machine', name: 'Gestionar Pedido Hinode',
    type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [2880, 560],
    parameters: {
      jsCode: [
        'const ctx         = $json;',
        'const SUPA_URL    = $env.N8N_HINODE_SUPABASE_URL;',
        'const SERVICE_KEY = $env.N8N_HINODE_SUPABASE_SERVICE_KEY;',
        'const msg         = (ctx.message_text || "").trim();',
        'const conv_id     = String(ctx.conversation_id || "");',
        'const store_id    = ctx.store_id;',
        'let   draft       = ctx.current_order_draft || null;',
        '',
        '// ── Helper: guardar draft en Supabase ──',
        'async function saveDraft(new_draft) {',
        '  try {',
        '    await this.helpers.httpRequest({',
        '      method: "PATCH",',
        '      url: SUPA_URL + "/rest/v1/hinode_conversations?store_id=eq." + store_id + "&chatwoot_conversation_id=eq." + encodeURIComponent(conv_id),',
        '      headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json" },',
        '      body: { current_order_draft: new_draft, last_intent: "ORDER" },',
        '      json: true',
        '    });',
        '  } catch(e) { console.warn("Draft save error:", e.message); }',
        '}',
        '',
        '// ── STEP 0: Sin draft → iniciar pedido ──',
        'if (!draft || !draft.step) {',
        '  const new_draft = { step: "awaiting_product", started_at: new Date().toISOString() };',
        '  await saveDraft.call(this, new_draft);',
        '  return [{ json: { ...ctx,',
        '    order_complete: false,',
        '    response_text: "¡Genial! \\uD83D\\uDE0A Vamos a armar tu pedido.\\n\\n" +',
        '      "\\uD83D\\uDCCB ¿Qué producto(s) deseas pedir?\\n\\n" +',
        '      "Ejemplo: *\\"1 Crema Corporal Acaí y 1 Kit Bienvenida\\"*\\n\\n" +',
        '      "También puedes escribir *\\"catálogo\\"* para ver todos nuestros productos."',
        '  } }];',
        '}',
        '',
        '// ── STEP 1: Tiene producto → pedir nombre y dirección ──',
        'if (draft.step === "awaiting_product") {',
        '  const updated = { ...draft, step: "awaiting_info", product_desc: msg, updated_at: new Date().toISOString() };',
        '  await saveDraft.call(this, updated);',
        '  return [{ json: { ...ctx,',
        '    order_complete: false,',
        '    response_text: "Perfecto \\u2705 Anotado: *" + msg + "*\\n\\n" +',
        '      "Ahora necesito tus datos de entrega:\\n" +',
        '      "\\uD83D\\uDC64 *Nombre completo:*\\n" +',
        '      "\\uD83D\\uDCCD *Dirección exacta (distrito, ciudad):*\\n\\n" +',
        '      "Escríbelos en un solo mensaje, ejemplo:\\n" +',
        '      "\\"María García — Av. Javier Prado 123, Miraflores, Lima\\""',
        '  } }];',
        '}',
        '',
        '// ── STEP 2: Tiene info → pedir método de pago ──',
        'if (draft.step === "awaiting_info") {',
        '  const bot_config = ctx.bot_config || {};',
        '  const yape  = bot_config.payment_yape  || "977588512";',
        '  const plin  = bot_config.payment_plin  || "977588512";',
        '  const bcp   = bot_config.payment_bcp   || "191-123456789-0-12";',
        '  const updated = { ...draft, step: "awaiting_payment", customer_info: msg, updated_at: new Date().toISOString() };',
        '  await saveDraft.call(this, updated);',
        '  return [{ json: { ...ctx,',
        '    order_complete: false,',
        '    response_text: "Datos guardados \\u2705\\n\\n" +',
        '      "\\uD83D\\uDCB3 *¿Cómo deseas pagar?*\\n\\n" +',
        '      "\\uD83D\\uDFE1 *Yape:* " + yape + "\\n" +',
        '      "\\uD83D\\uDD35 *Plin:* " + plin + "\\n" +',
        '      "\\uD83C\\uDFE6 *Transferencia BCP:* " + bcp + "\\n\\n" +',
        '      "Responde: *yape*, *plin* o *transferencia*"',
        '  } }];',
        '}',
        '',
        '// ── STEP 3: Tiene pago → crear pedido ──',
        'if (draft.step === "awaiting_payment") {',
        '  const payment_method = msg.toLowerCase().includes("yape") ? "yape"',
        '    : msg.toLowerCase().includes("plin") ? "plin"',
        '    : msg.toLowerCase().includes("transf") ? "transferencia"',
        '    : msg.toLowerCase().includes("efectivo") ? "efectivo"',
        '    : "yape";',
        '',
        '  // Crear pedido en Supabase',
        '  let order_number = "???";',
        '  try {',
        '    const order_data = {',
        '      store_id:                store_id,',
        '      chatwoot_conversation_id:conv_id,',
        '      customer_phone:          ctx.contact_phone || "",',
        '      customer_name:           draft.customer_info ? draft.customer_info.split("—")[0].trim() : ctx.sender_name,',
        '      customer_address:        draft.customer_info || "",',
        '      items:                   [{ product_desc: draft.product_desc, qty: 1 }],',
        '      payment_method:          payment_method,',
        '      notes:                   "Pedido via WhatsApp Bot"',
        '    };',
        '    const created = await this.helpers.httpRequest({',
        '      method: "POST",',
        '      url: SUPA_URL + "/rest/v1/hinode_orders",',
        '      headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY,',
        '        "Content-Type": "application/json", Prefer: "return=representation" },',
        '      body: order_data, json: true',
        '    });',
        '    if (Array.isArray(created) && created[0]) order_number = created[0].order_number || "N/A";',
        '  } catch(e) { console.warn("Order create error:", e.message); }',
        '',
        '  // Limpiar draft',
        '  await saveDraft.call(this, null);',
        '',
        '  return [{ json: { ...ctx,',
        '    order_complete: true,',
        '    order_number:   order_number,',
        '    product_desc:   draft.product_desc,',
        '    customer_info:  draft.customer_info,',
        '    payment_method: payment_method,',
        '    response_text:  "\\uD83C\\uDF89 ¡Pedido confirmado! Aquí tienes tu resumen:\\n\\n" +',
        '      "\\uD83D\\uDCE6 *Pedido #" + order_number + "*\\n" +',
        '      "\\uD83D\\uDED2 Producto: " + (draft.product_desc || "") + "\\n" +',
        '      "\\uD83D\\uDCCD Entrega: " + (draft.customer_info || "") + "\\n" +',
        '      "\\uD83D\\uDCB3 Pago: " + payment_method + "\\n\\n" +',
        '      "\\uD83D\\uDCE9 Te contactaremos para coordinar la entrega y confirmar el pago.\\n" +',
        '      "Gracias por tu compra \\u2764\\uFE0F"',
        '  } }];',
        '}',
        '',
        '// Fallback',
        'return [{ json: { ...ctx, order_complete: false,',
        '  response_text: "Disculpa, hubo un problema con tu pedido. ¿Puedes volver a intentarlo escribiendo \\"quiero pedir\\"?" } }];'
      ].join('\n')
    }
  },

  // ── [20] Enviar Resp Pedido ───────────────────────────────────────────────
  {
    id: 'hinode-send-order-msg', name: 'Enviar Resp Pedido Hinode',
    type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
    position: [3120, 540],
    parameters: {
      method: 'POST',
      url: '=https://chat.redsolucionesti.com/api/v1/accounts/{{ $json.account_id }}/conversations/{{ $json.conversation_id }}/messages',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'api_access_token', value: '={{ $json.chatwoot_api_token }}' }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify({ content: $json.response_text, message_type: "outgoing", private: false }) }}',
      options: {}
    },
    continueOnFail: true
  },

  // ── [21] ¿Pedido Completo? ────────────────────────────────────────────────
  {
    id: 'hinode-if-order-done', name: '¿Pedido Completo?',
    type: 'n8n-nodes-base.if', typeVersion: 2,
    position: [3360, 540],
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' },
        conditions: [{
          id: 'c1',
          leftValue: '={{ $json.order_complete }}',
          rightValue: true,
          operator: { type: 'boolean', operation: 'true' }
        }],
        combinator: 'and'
      }
    }
  },

  // ── [22] Notificar Telegram Nuevo Pedido ──────────────────────────────────
  {
    id: 'hinode-tg-order', name: 'Notificar Telegram Pedido Hinode',
    type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
    position: [3600, 480],
    parameters: {
      method: 'POST',
      url: 'https://api.telegram.org/bot{{ $credentials.telegramApi.accessToken }}/sendMessage',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={\n  "chat_id": "{{ $json.telegram_chat_id }}",\n  "parse_mode": "Markdown",\n  "text": "\\uD83D\\uDED2 *NUEVO PEDIDO HINODE*\\n\\n*Pedido #{{ $json.order_number }}*\\n\\uD83D\\uDC64 Cliente: {{ $json.sender_name }}\\n\\uD83D\\uDCF1 Tel: {{ $json.contact_phone }}\\n\\uD83D\\uDED2 Producto: {{ $json.product_desc }}\\n\\uD83D\\uDCCD Dirección: {{ $json.customer_info }}\\n\\uD83D\\uDCB3 Pago: {{ $json.payment_method }}\\n\\uD83D\\uDCC5 {{ $now.format(\'DD/MM/YYYY HH:mm\') }}"\n}',
      options: {}
    },
    credentials: TG_CRED,
    continueOnFail: true
  },

  // ── [23] ¿Es ORDER_STATUS? ────────────────────────────────────────────────
  {
    id: 'hinode-if-status', name: '¿Es ORDER_STATUS?',
    type: 'n8n-nodes-base.if', typeVersion: 2,
    position: [2640, 780],
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' },
        conditions: [{
          id: 'c1',
          leftValue: '={{ $json.intent }}',
          rightValue: 'ORDER_STATUS',
          operator: { type: 'string', operation: 'equals' }
        }],
        combinator: 'and'
      }
    }
  },

  // ── [24] Buscar Pedido ────────────────────────────────────────────────────
  {
    id: 'hinode-search-order', name: 'Buscar Pedido Hinode',
    type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [2880, 700],
    parameters: {
      jsCode: [
        'const ctx         = $json;',
        'const SUPA_URL    = $env.N8N_HINODE_SUPABASE_URL;',
        'const SERVICE_KEY = $env.N8N_HINODE_SUPABASE_SERVICE_KEY;',
        'const phone       = ctx.contact_phone || "";',
        'const store_id    = ctx.store_id;',
        '',
        'let orders = [];',
        'try {',
        '  orders = await this.helpers.httpRequest({',
        '    method: "GET",',
        '    url: SUPA_URL + "/rest/v1/hinode_orders?store_id=eq." + store_id + "&customer_phone=eq." + encodeURIComponent(phone) + "&select=order_number,items,payment_status,delivery_status,created_at&order=created_at.desc&limit=3",',
        '    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY }',
        '  });',
        '  if (!Array.isArray(orders)) orders = [];',
        '} catch(e) { orders = []; }',
        '',
        'let response_text = "";',
        'if (orders.length === 0) {',
        '  response_text = "No encontré pedidos registrados para tu número. \\n\\nSi hiciste un pedido reciente, escribe *\\"quiero hacer seguimiento\\"* y un asesor te ayudará \\uD83D\\uDE0A";',
        '} else {',
        '  const status_map = { new: "\\uD83D\\uDD50 Nuevo", preparing: "\\uD83D\\uDCE6 Preparando", shipped: "\\uD83D\\uDE9A En camino", delivered: "\\u2705 Entregado", cancelled: "\\u274C Cancelado" };',
        '  const pay_map    = { pending: "\\u23F3 Pendiente", paid: "\\u2705 Pagado", cancelled: "\\u274C Cancelado" };',
        '  response_text = "\\uD83D\\uDCCB *Tus últimos pedidos:*\\n\\n";',
        '  orders.forEach(function(o) {',
        '    const fecha = o.created_at ? o.created_at.slice(0,10) : "";',
        '    response_text += "*Pedido #" + o.order_number + "* (" + fecha + ")\\n";',
        '    response_text += "\\uD83D\\uDECB Estado: " + (status_map[o.delivery_status] || o.delivery_status) + "\\n";',
        '    response_text += "\\uD83D\\uDCB3 Pago: " + (pay_map[o.payment_status] || o.payment_status) + "\\n\\n";',
        '  });',
        '  response_text += "¿Necesitas más info? Escribe *\\"hablar con asesor\\"* \\uD83D\\uDE0A";',
        '}',
        '',
        'return [{ json: { ...ctx, response_text: response_text } }];'
      ].join('\n')
    }
  },

  // ── [25] Enviar Estado Pedido ─────────────────────────────────────────────
  {
    id: 'hinode-send-status', name: 'Enviar Estado Pedido Hinode',
    type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
    position: [3120, 700],
    parameters: {
      method: 'POST',
      url: '=https://chat.redsolucionesti.com/api/v1/accounts/{{ $json.account_id }}/conversations/{{ $json.conversation_id }}/messages',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'api_access_token', value: '={{ $json.chatwoot_api_token }}' }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify({ content: $json.response_text, message_type: "outgoing", private: false }) }}',
      options: {}
    },
    continueOnFail: true
  },

  // ── [26] ¿Es PAYMENT? ────────────────────────────────────────────────────
  {
    id: 'hinode-if-payment', name: '¿Es PAYMENT?',
    type: 'n8n-nodes-base.if', typeVersion: 2,
    position: [2640, 900],
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' },
        conditions: [{
          id: 'c1',
          leftValue: '={{ $json.intent }}',
          rightValue: 'PAYMENT',
          operator: { type: 'string', operation: 'equals' }
        }],
        combinator: 'and'
      }
    }
  },

  // ── [27] Enviar Métodos de Pago ───────────────────────────────────────────
  {
    id: 'hinode-send-payment', name: 'Enviar Métodos Pago Hinode',
    type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
    position: [2880, 840],
    parameters: {
      method: 'POST',
      url: '=https://chat.redsolucionesti.com/api/v1/accounts/{{ $json.account_id }}/conversations/{{ $json.conversation_id }}/messages',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'api_access_token', value: '={{ $json.chatwoot_api_token }}' }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={\n  "content": "\\uD83D\\uDCB3 *Métodos de pago aceptados:*\\n\\n\\uD83D\\uDFE1 *Yape:* {{ $json.bot_config.payment_yape || \"977588512\" }}\\n\\uD83D\\uDD35 *Plin:* {{ $json.bot_config.payment_plin || \"977588512\" }}\\n\\uD83C\\uDFE6 *Transferencia BCP:* {{ $json.bot_config.payment_bcp || \"191-123456789-0-12\" }}\\n\\uD83D\\uDCB5 *Efectivo:* Contra entrega (solo Lima)\\n\\nDespués de hacer el pago, envíanos el comprobante por aquí y coordinamos la entrega \\uD83D\\uDE0A",\n  "message_type": "outgoing",\n  "private": false\n}',
      options: {}
    },
    continueOnFail: true
  },

  // ── [28] ¿Es SHIPPING? ────────────────────────────────────────────────────
  {
    id: 'hinode-if-shipping', name: '¿Es SHIPPING?',
    type: 'n8n-nodes-base.if', typeVersion: 2,
    position: [2640, 1020],
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' },
        conditions: [{
          id: 'c1',
          leftValue: '={{ $json.intent }}',
          rightValue: 'SHIPPING',
          operator: { type: 'string', operation: 'equals' }
        }],
        combinator: 'and'
      }
    }
  },

  // ── [29] Enviar Info Envío ────────────────────────────────────────────────
  {
    id: 'hinode-send-shipping', name: 'Enviar Info Envío Hinode',
    type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
    position: [2880, 960],
    parameters: {
      method: 'POST',
      url: '=https://chat.redsolucionesti.com/api/v1/accounts/{{ $json.account_id }}/conversations/{{ $json.conversation_id }}/messages',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'api_access_token', value: '={{ $json.chatwoot_api_token }}' }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={\n  "content": "\\uD83D\\uDE9A *Información de envíos:*\\n\\n\\uD83C\\uDFD9\\uFE0F *Lima Metropolitana:*\\n• Costo: {{ $json.bot_config.shipping_lima || \"S/. 10\" }}\\n• Tiempo: 24-48 horas hábiles\\n• Coordinamos por WhatsApp\\n\\n\\uD83C\\uDDF5\\uD83C\\uDDEA *Provincias:*\\n• Costo: {{ $json.bot_config.shipping_provincias || \"S/. 20\" }}\\n• Tiempo: 3-5 días hábiles\\n• Enviamos por Olva Courier u Shalom\\n\\n\\uD83D\\uDCE6 Los pedidos se preparan en 24h después de confirmar el pago.\\n\\n¿Quieres hacer un pedido? Escribe *\\"quiero pedir\\"* \\uD83D\\uDE0A",\n  "message_type": "outgoing",\n  "private": false\n}',
      options: {}
    },
    continueOnFail: true
  },

  // ── [30] Pausar Bot + Notificar (HUMAN path) ──────────────────────────────
  {
    id: 'hinode-pause-bot', name: 'Pausar Bot Hinode',
    type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [1200, 60],
    parameters: {
      jsCode: [
        '// Pause bot in hinode_conversations',
        'const ctx         = $json;',
        'const SUPA_URL    = $env.N8N_HINODE_SUPABASE_URL;',
        'const SERVICE_KEY = $env.N8N_HINODE_SUPABASE_SERVICE_KEY;',
        'const conv_id     = String(ctx.conversation_id || "");',
        'const store_id    = ctx.store_id || null;',
        '',
        'if (store_id && conv_id) {',
        '  try {',
        '    await this.helpers.httpRequest({',
        '      method: "PATCH",',
        '      url: SUPA_URL + "/rest/v1/hinode_conversations?store_id=eq." + store_id + "&chatwoot_conversation_id=eq." + encodeURIComponent(conv_id),',
        '      headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json" },',
        '      body: { bot_paused: true, last_intent: "HUMAN" },',
        '      json: true',
        '    });',
        '  } catch(e) { console.warn("Pause failed:", e.message); }',
        '}',
        '',
        'const esc_msg = ctx.escalation_message || "Entendido \\uD83D\\uDE4F Te conecto con un asesor. Un momento...";',
        'return [{ json: { ...ctx, escalation_message_final: esc_msg } }];'
      ].join('\n')
    }
  },

  // ── [31] Enviar Mensaje Escalado ──────────────────────────────────────────
  {
    id: 'hinode-send-escalation', name: 'Enviar Escalado Hinode',
    type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
    position: [1440, 60],
    parameters: {
      method: 'POST',
      url: '=https://chat.redsolucionesti.com/api/v1/accounts/{{ $json.account_id }}/conversations/{{ $json.conversation_id }}/messages',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'api_access_token', value: '={{ $json.chatwoot_api_token }}' }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify({ content: $json.escalation_message_final, message_type: "outgoing", private: false }) }}',
      options: {}
    },
    continueOnFail: true
  },

  // ── [32] Notificar Telegram Escalado ──────────────────────────────────────
  {
    id: 'hinode-tg-escalation', name: 'Notificar Telegram Escalado Hinode',
    type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
    position: [1680, 60],
    parameters: {
      method: 'POST',
      url: 'https://api.telegram.org/bot{{ $credentials.telegramApi.accessToken }}/sendMessage',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={\n  "chat_id": "{{ $json.telegram_chat_id || \"-4523041658\" }}",\n  "parse_mode": "Markdown",\n  "text": "\\u26A0\\uFE0F *ESCALADO HINODE*\\n\\n\\uD83D\\uDC64 Cliente: {{ $json.sender_name }}\\n\\uD83D\\uDCF1 Tel: {{ $json.contact_phone }}\\n\\uD83D\\uDCAC Mensaje: {{ $json.message_text }}\\n\\uD83D\\uDD17 Conv: {{ $json.conversation_id }}\\n\\n\\uD83D\\uDCCB Requiere atención humana"\n}',
      options: {}
    },
    credentials: TG_CRED,
    continueOnFail: true
  }

];

// ── Connections ───────────────────────────────────────────────────────────────
const connections = {
  'Chatwoot Webhook Hinode': {
    main: [[{ node: 'Validar Input Hinode', type: 'main', index: 0 }]]
  },
  'Validar Input Hinode': {
    main: [[{ node: 'Es Mensaje Entrante?', type: 'main', index: 0 }]]
  },
  'Es Mensaje Entrante?': {
    main: [
      [{ node: 'WhatsApp Safe Check Hinode', type: 'main', index: 0 }],
      [] // false: ignorar (outgoing messages, etc.)
    ]
  },
  'WhatsApp Safe Check Hinode': {
    main: [[{ node: '¿Escalar?', type: 'main', index: 0 }]]
  },
  '¿Escalar?': {
    main: [
      [{ node: 'Pausar Bot Hinode',        type: 'main', index: 0 }],  // true: escalar
      [{ node: 'Bot Pause Check Hinode',   type: 'main', index: 0 }]   // false: continuar
    ]
  },
  'Pausar Bot Hinode': {
    main: [[{ node: 'Enviar Escalado Hinode', type: 'main', index: 0 }]]
  },
  'Enviar Escalado Hinode': {
    main: [[{ node: 'Notificar Telegram Escalado Hinode', type: 'main', index: 0 }]]
  },
  'Bot Pause Check Hinode': {
    main: [[{ node: '¿Bot Pausado?', type: 'main', index: 0 }]]
  },
  '¿Bot Pausado?': {
    main: [
      [], // true: ignorar — humano está atendiendo
      [{ node: 'Pre-Clasificador Keywords Hinode', type: 'main', index: 0 }]
    ]
  },
  'Pre-Clasificador Keywords Hinode': {
    main: [[{ node: '¿Ya Clasificado?', type: 'main', index: 0 }]]
  },
  '¿Ya Clasificado?': {
    main: [
      [{ node: 'Normalizar Intent Hinode',  type: 'main', index: 0 }],  // true: skip AI
      [{ node: 'Clasificador AI Hinode',    type: 'main', index: 0 }]   // false: usar AI
    ]
  },
  'Clasificador AI Hinode': {
    main: [[{ node: 'Normalizar Intent Hinode', type: 'main', index: 0 }]]
  },
  'Normalizar Intent Hinode': {
    main: [[{ node: '¿Es GREETING?', type: 'main', index: 0 }]]
  },
  '¿Es GREETING?': {
    main: [
      [{ node: 'Preparar Menú Hinode',     type: 'main', index: 0 }],
      [{ node: '¿Es PRODUCT_INQUIRY?',     type: 'main', index: 0 }]
    ]
  },
  'Preparar Menú Hinode': {
    main: [[{ node: 'Enviar Menú Hinode',  type: 'main', index: 0 }]]
  },
  '¿Es PRODUCT_INQUIRY?': {
    main: [
      [{ node: 'Buscar Productos Hinode',       type: 'main', index: 0 }],
      [{ node: '¿Es ORDER?',                    type: 'main', index: 0 }]
    ]
  },
  'Buscar Productos Hinode': {
    main: [[{ node: 'Enviar Respuesta Producto Hinode', type: 'main', index: 0 }]]
  },
  '¿Es ORDER?': {
    main: [
      [{ node: 'Gestionar Pedido Hinode',  type: 'main', index: 0 }],
      [{ node: '¿Es ORDER_STATUS?',        type: 'main', index: 0 }]
    ]
  },
  'Gestionar Pedido Hinode': {
    main: [[{ node: 'Enviar Resp Pedido Hinode', type: 'main', index: 0 }]]
  },
  'Enviar Resp Pedido Hinode': {
    main: [[{ node: '¿Pedido Completo?', type: 'main', index: 0 }]]
  },
  '¿Pedido Completo?': {
    main: [
      [{ node: 'Notificar Telegram Pedido Hinode', type: 'main', index: 0 }],
      [] // false: pedido en progreso, no notificar
    ]
  },
  '¿Es ORDER_STATUS?': {
    main: [
      [{ node: 'Buscar Pedido Hinode',     type: 'main', index: 0 }],
      [{ node: '¿Es PAYMENT?',             type: 'main', index: 0 }]
    ]
  },
  'Buscar Pedido Hinode': {
    main: [[{ node: 'Enviar Estado Pedido Hinode', type: 'main', index: 0 }]]
  },
  '¿Es PAYMENT?': {
    main: [
      [{ node: 'Enviar Métodos Pago Hinode', type: 'main', index: 0 }],
      [{ node: '¿Es SHIPPING?',             type: 'main', index: 0 }]
    ]
  },
  '¿Es SHIPPING?': {
    main: [
      [{ node: 'Enviar Info Envío Hinode', type: 'main', index: 0 }],
      [{ node: 'Pausar Bot Hinode',        type: 'main', index: 0 }]  // HUMAN o desconocido
    ]
  }
};

// ── Build & Deploy ─────────────────────────────────────────────────────────────
const workflow = {
  name: 'Hinode - WhatsApp Sales Bot',
  nodes,
  connections,
  settings: { executionOrder: 'v1' },
  staticData: null
};

console.log('Building Hinode WhatsApp Sales Bot...');
console.log('Nodes:', nodes.length);

const res = await fetch(`${BASE}/api/v1/workflows`, {
  method: 'POST',
  headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify(workflow)
});

const json = await res.json();
if (!res.ok) {
  console.error('❌ Error creating workflow:', JSON.stringify(json).slice(0, 500));
  process.exit(1);
}

console.log('✅ Workflow created:', json.id);
console.log('   URL:', `${BASE}/workflow/${json.id}`);

// Activate
const actRes = await fetch(`${BASE}/api/v1/workflows/${json.id}/activate`, {
  method: 'POST',
  headers: { 'X-N8N-API-KEY': API_KEY }
});
if (actRes.ok) {
  console.log('✅ Workflow activated');
} else {
  const actJson = await actRes.json();
  console.warn('⚠️  Could not activate:', JSON.stringify(actJson).slice(0, 200));
}

console.log('');
console.log('=== Next Steps ===');
console.log('1. Copy webhook URL:');
console.log(`   ${BASE}/webhook/chatwoot-hinode`);
console.log('2. In Chatwoot → Settings → Integrations → Webhooks:');
console.log('   Add the URL above, enable "Message Created" events');
console.log('   Select inbox ID that matches your Hinode store (chatwoot_inbox_id)');
console.log('3. Send "hola" to your WhatsApp number to test');
console.log('');
console.log('Workflow ID (save this):', json.id);
