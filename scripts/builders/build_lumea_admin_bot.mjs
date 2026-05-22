#!/usr/bin/env node
/**
 * build_lumea_admin_bot.mjs
 * Crea en n8n el workflow "Luméa Admin Bot" — Telegram bot para gestionar
 * productos Luméa/Hinode y recibir fotos para animación con Higgsfield.
 *
 * Comandos Telegram:
 *   /agregar SKU|Nombre|Precio|categoria|stock|descripcion
 *   /editar  SKU campo=valor  (ej: /editar HIN-F001 stock=18)
 *   /stock   SKU cantidad     (ej: /stock HIN-F001 25)
 *   /listar  [categoria]      (ej: /listar fragancias)
 *   /borrar  SKU
 *   foto + caption = SKU      → guarda image_url en Supabase, notifica para animar
 *
 * Prerequisito: migration 062 aplicada en Supabase Hinode.
 * Run: node scripts/builders/build_lumea_admin_bot.mjs
 */

const N8N_URL  = 'https://workflows.n8n.redsolucionesti.com';
const API_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const TG_CRED  = { telegramApi: { id: 'cSaxAEvIePNLpINc', name: 'Telegram account' } };
const TG_CHAT  = '-4523041658';
const SUPA_URL = 'https://mzprgmwcaegtkxmuzkrp.supabase.co';
const SUPA_KEY = '$env.N8N_HINODE_SUPABASE_SERVICE_KEY';
const TG_TOKEN = '$env.N8N_TELEGRAM_BOT_TOKEN'; // token del bot para descargar fotos

// ── helpers ────────────────────────────────────────────────────────────────
const api = (path, body) => fetch(`${N8N_URL}/api/v1${path}`, {
  method: body ? 'POST' : 'GET',
  headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
}).then(r => r.json());

const put = (path, body) => fetch(`${N8N_URL}/api/v1${path}`, {
  method: 'PUT',
  headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}).then(r => r.json());

// ── nodos ──────────────────────────────────────────────────────────────────
const nodes = [

  // [0] Telegram Trigger
  {
    id: 'n0', name: 'Telegram Trigger', type: 'n8n-nodes-base.telegramTrigger',
    typeVersion: 1, position: [0, 300],
    parameters: { updates: ['message'] },
    credentials: TG_CRED,
  },

  // [1] Parsear mensaje
  {
    id: 'n1', name: 'Parsear Mensaje', type: 'n8n-nodes-base.code',
    typeVersion: 2, position: [200, 300],
    parameters: { jsCode: `
const msg   = $input.first().json.message || {};
const text  = (msg.text || msg.caption || '').trim();
const photo = msg.photo ? msg.photo[msg.photo.length - 1] : null;
const chatId = String(msg.chat?.id || '${TG_CHAT}');

// Detectar tipo
let type = 'unknown';
let sku = '', args = [];

if (photo) {
  type = 'photo';
  sku  = text.toUpperCase().replace(/[^A-Z0-9-]/g,'');
} else if (text.startsWith('/agregar')) {
  type = 'agregar';
  args = text.replace('/agregar','').trim().split('|').map(s=>s.trim());
} else if (text.startsWith('/editar')) {
  type = 'editar';
  args = text.replace('/editar','').trim().split(' ');
  sku  = args[0]?.toUpperCase();
} else if (text.startsWith('/stock')) {
  type = 'stock';
  args = text.replace('/stock','').trim().split(' ');
  sku  = args[0]?.toUpperCase();
} else if (text.startsWith('/listar')) {
  type = 'listar';
  args = [text.replace('/listar','').trim()];
} else if (text.startsWith('/borrar')) {
  type = 'borrar';
  sku  = text.replace('/borrar','').trim().toUpperCase();
}

return [{ json: { type, sku, args, chatId,
  photo_file_id: photo?.file_id || null,
  raw_text: text } }];
` },
  },

  // [2] Router por tipo
  {
    id: 'n2', name: 'Router', type: 'n8n-nodes-base.switch',
    typeVersion: 3, position: [420, 300],
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          { conditions: { options: { caseSensitive: false }, conditions: [{ leftValue: '={{ $json.type }}', operator: { type:'string', operation:'equals' }, rightValue: 'photo' }] } },
          { conditions: { options: { caseSensitive: false }, conditions: [{ leftValue: '={{ $json.type }}', operator: { type:'string', operation:'equals' }, rightValue: 'agregar' }] } },
          { conditions: { options: { caseSensitive: false }, conditions: [{ leftValue: '={{ $json.type }}', operator: { type:'string', operation:'equals' }, rightValue: 'stock' }] } },
          { conditions: { options: { caseSensitive: false }, conditions: [{ leftValue: '={{ $json.type }}', operator: { type:'string', operation:'equals' }, rightValue: 'editar' }] } },
          { conditions: { options: { caseSensitive: false }, conditions: [{ leftValue: '={{ $json.type }}', operator: { type:'string', operation:'equals' }, rightValue: 'listar' }] } },
          { conditions: { options: { caseSensitive: false }, conditions: [{ leftValue: '={{ $json.type }}', operator: { type:'string', operation:'equals' }, rightValue: 'borrar' }] } },
        ],
      },
      fallbackOutput: 'extra',
    },
  },

  // ── FOTO BRANCH ──────────────────────────────────────────────────────────

  // [3] Obtener URL de la foto (Telegram getFile)
  {
    id: 'n3', name: 'Obtener URL Foto', type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4, position: [680, 80],
    parameters: {
      method: 'GET',
      url: '=https://api.telegram.org/bot{{ $env.N8N_TELEGRAM_BOT_TOKEN }}/getFile?file_id={{ $json.photo_file_id }}',
      options: {},
    },
  },

  // [4] Construir public URL + validar SKU
  {
    id: 'n4', name: 'Build Image URL', type: 'n8n-nodes-base.code',
    typeVersion: 2, position: [880, 80],
    parameters: { jsCode: `
const prev   = $node['Parsear Mensaje'].json;
const result = $input.first().json;
const filePath = result.result?.file_path;
if (!filePath) throw new Error('No se pudo obtener file_path de Telegram');

const botToken = $env.N8N_TELEGRAM_BOT_TOKEN;
const imageUrl = \`https://api.telegram.org/file/bot\${botToken}/\${filePath}\`;
const sku = prev.sku;

if (!sku) throw new Error('Caption vacío — envía la foto con el SKU como caption (ej: HIN-F001)');

return [{ json: { sku, imageUrl, chatId: prev.chatId } }];
` },
  },

  // [5] Guardar image_url en Supabase
  {
    id: 'n5', name: 'Guardar image_url', type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4, position: [1080, 80],
    parameters: {
      method: 'PATCH',
      url: `=${SUPA_URL}/rest/v1/hinode_products?sku=eq.{{ $json.sku }}`,
      sendHeaders: true,
      headerParameters: { parameters: [
        { name: 'apikey',        value: `=${SUPA_KEY}` },
        { name: 'Authorization', value: `=Bearer ${SUPA_KEY}` },
        { name: 'Content-Type',  value: 'application/json' },
        { name: 'Prefer',        value: 'return=representation' },
      ]},
      sendBody: true, specifyBody: 'json',
      jsonBody: '={"image_url": "{{ $json.imageUrl }}"}',
    },
  },

  // [6] Confirmar foto recibida
  {
    id: 'n6', name: 'Confirmar Foto', type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2, position: [1280, 80],
    parameters: {
      chatId: `={{ $node['Build Image URL'].json.chatId }}`,
      text: `=✅ *Foto guardada para {{ $node['Build Image URL'].json.sku }}*\n\n📸 image\\_url actualizada en Supabase.\n\n🎬 Para animar: dile a Claude "anima el producto {{ $node['Build Image URL'].json.sku }}" y usaré Higgsfield para generar el video y subirlo a la web.\n\n🔗 URL: {{ $node['Guardar image_url'].json[0]?.image_url || 'ver Supabase' }}`,
      additionalFields: { parse_mode: 'Markdown' },
    },
    credentials: TG_CRED,
  },

  // ── AGREGAR BRANCH ───────────────────────────────────────────────────────

  // [7] Parsear /agregar
  {
    id: 'n7', name: 'Parsear Agregar', type: 'n8n-nodes-base.code',
    typeVersion: 2, position: [680, 220],
    parameters: { jsCode: `
const { args, chatId } = $input.first().json;
// formato: SKU|Nombre|Precio|categoria|stock|descripcion
const [sku, name, price, category, stock, ...descParts] = args;
if (!sku || !name || !price) throw new Error('Formato: /agregar SKU|Nombre|Precio|categoria|stock|descripcion');

const CATEGORY_MAP = {
  fragancia: 'fragancia', fragancias: 'fragancia',
  crema: 'crema_corporal', cremas: 'crema_corporal',
  facial: 'cuidado_facial',
  kit: 'kit', kits: 'kit',
};
const cat = CATEGORY_MAP[category?.toLowerCase()] || category?.toLowerCase() || 'fragancia';

return [{ json: {
  chatId,
  product: {
    sku: sku.toUpperCase(),
    name,
    price_sale: parseFloat(price.replace('S/.','').replace(',','.')),
    category: cat,
    stock: parseInt(stock) || 0,
    description: descParts.join('|').trim() || null,
    active: true,
  }
}}];
` },
  },

  // [8] INSERT producto
  {
    id: 'n8', name: 'INSERT Producto', type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4, position: [880, 220],
    parameters: {
      method: 'POST',
      url: `=${SUPA_URL}/rest/v1/hinode_products`,
      sendHeaders: true,
      headerParameters: { parameters: [
        { name: 'apikey',        value: `=${SUPA_KEY}` },
        { name: 'Authorization', value: `=Bearer ${SUPA_KEY}` },
        { name: 'Content-Type',  value: 'application/json' },
        { name: 'Prefer',        value: 'return=representation,resolution=merge-duplicates' },
      ]},
      sendBody: true, specifyBody: 'json',
      jsonBody: `={"sku":"{{ $json.product.sku }}","name":"{{ $json.product.name }}","price_sale":{{ $json.product.price_sale }},"category":"{{ $json.product.category }}","stock":{{ $json.product.stock }},"description":{{ $json.product.description ? '"' + $json.product.description + '"' : 'null' }},"active":true,"store_id":"fe3860cf-7213-4dc7-bc2e-367ab92fc160"}`,
    },
  },

  // [9] Confirmar agregado
  {
    id: 'n9', name: 'Confirmar Agregar', type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2, position: [1080, 220],
    parameters: {
      chatId: `={{ $node['Parsear Agregar'].json.chatId }}`,
      text: `=✅ *Producto agregado:*\n\n🏷️ SKU: {{ $node['Parsear Agregar'].json.product.sku }}\n📦 Nombre: {{ $node['Parsear Agregar'].json.product.name }}\n💰 Precio: S/.{{ $node['Parsear Agregar'].json.product.price_sale }}\n📊 Stock: {{ $node['Parsear Agregar'].json.product.stock }}\n\nYa aparece en la web. Envía una foto con caption={{ $node['Parsear Agregar'].json.product.sku }} para agregar imagen.`,
      additionalFields: { parse_mode: 'Markdown' },
    },
    credentials: TG_CRED,
  },

  // ── STOCK BRANCH ─────────────────────────────────────────────────────────

  // [10] UPDATE stock
  {
    id: 'n10', name: 'UPDATE Stock', type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4, position: [680, 360],
    parameters: {
      method: 'PATCH',
      url: `=${SUPA_URL}/rest/v1/hinode_products?sku=eq.{{ $json.sku }}`,
      sendHeaders: true,
      headerParameters: { parameters: [
        { name: 'apikey',        value: `=${SUPA_KEY}` },
        { name: 'Authorization', value: `=Bearer ${SUPA_KEY}` },
        { name: 'Content-Type',  value: 'application/json' },
        { name: 'Prefer',        value: 'return=representation' },
      ]},
      sendBody: true, specifyBody: 'json',
      jsonBody: '={"stock": {{ parseInt($json.args[1]) }} }',
    },
  },

  // [11] Confirmar stock
  {
    id: 'n11', name: 'Confirmar Stock', type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2, position: [880, 360],
    parameters: {
      chatId: `={{ $node['Parsear Mensaje'].json.chatId }}`,
      text: `=✅ Stock actualizado\n\n🏷️ {{ $node['Parsear Mensaje'].json.sku }}: {{ $node['Parsear Mensaje'].json.args[1] }} unidades\n\n⚡ La web se actualiza en tiempo real vía Supabase Realtime.`,
      additionalFields: { parse_mode: 'Markdown' },
    },
    credentials: TG_CRED,
  },

  // ── EDITAR BRANCH ────────────────────────────────────────────────────────

  // [12] Parsear /editar y hacer PATCH
  {
    id: 'n12', name: 'Parsear y Editar', type: 'n8n-nodes-base.code',
    typeVersion: 2, position: [680, 480],
    parameters: { jsCode: `
const { sku, args, chatId } = $input.first().json;
// args[1..] = campo=valor pares
const patch = {};
args.slice(1).forEach(pair => {
  const [k, v] = pair.split('=');
  if (!k || v === undefined) return;
  const numFields = ['price_sale','price_cost','stock'];
  patch[k.trim()] = numFields.includes(k.trim()) ? parseFloat(v) : v.trim();
});
if (Object.keys(patch).length === 0) throw new Error('Sin cambios — usa campo=valor (ej: stock=20 price_sale=89)');
return [{ json: { sku, patch, chatId, patchJson: JSON.stringify(patch) } }];
` },
  },

  // [13] PATCH campo
  {
    id: 'n13', name: 'PATCH Campo', type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4, position: [880, 480],
    parameters: {
      method: 'PATCH',
      url: `=${SUPA_URL}/rest/v1/hinode_products?sku=eq.{{ $json.sku }}`,
      sendHeaders: true,
      headerParameters: { parameters: [
        { name: 'apikey',        value: `=${SUPA_KEY}` },
        { name: 'Authorization', value: `=Bearer ${SUPA_KEY}` },
        { name: 'Content-Type',  value: 'application/json' },
        { name: 'Prefer',        value: 'return=representation' },
      ]},
      sendBody: true, specifyBody: 'json',
      jsonBody: '={{ $json.patchJson }}',
    },
  },

  // [14] Confirmar editar
  {
    id: 'n14', name: 'Confirmar Editar', type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2, position: [1080, 480],
    parameters: {
      chatId: `={{ $node['Parsear y Editar'].json.chatId }}`,
      text: `=✅ *Producto editado: {{ $node['Parsear y Editar'].json.sku }}*\n\nCambios: \`{{ $node['Parsear y Editar'].json.patchJson }}\`\n\n⚡ Actualizado en tiempo real en la web.`,
      additionalFields: { parse_mode: 'Markdown' },
    },
    credentials: TG_CRED,
  },

  // ── LISTAR BRANCH ────────────────────────────────────────────────────────

  // [15] GET productos
  {
    id: 'n15', name: 'GET Productos', type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4, position: [680, 600],
    parameters: {
      method: 'GET',
      url: `=${SUPA_URL}/rest/v1/hinode_products?active=eq.true&select=sku,name,price_sale,stock,category,image_url,video_url{{ $json.args[0] ? '&category=eq.' + $json.args[0].toLowerCase() : '' }}&order=category.asc,price_sale.asc`,
      sendHeaders: true,
      headerParameters: { parameters: [
        { name: 'apikey',        value: `=${SUPA_KEY}` },
        { name: 'Authorization', value: `=Bearer ${SUPA_KEY}` },
      ]},
    },
  },

  // [16] Formatear lista
  {
    id: 'n16', name: 'Formatear Lista', type: 'n8n-nodes-base.code',
    typeVersion: 2, position: [880, 600],
    parameters: { jsCode: `
const products = $input.first().json;
const chatId   = $node['Parsear Mensaje'].json.chatId;
if (!Array.isArray(products) || products.length === 0) {
  return [{ json: { chatId, text: '📦 Sin productos en esa categoría.' } }];
}
const icons = { fragancia:'🌸', crema_corporal:'💆', cuidado_facial:'✨', kit:'🎁' };
let text = '*📦 Catálogo Luméa*\n\n';
let lastCat = '';
products.forEach(p => {
  if (p.category !== lastCat) {
    text += \`\n*\${icons[p.category]||'📦'} \${p.category.replace('_',' ').toUpperCase()}*\n\`;
    lastCat = p.category;
  }
  const hasImg   = p.image_url ? '📸' : '⬜';
  const hasVideo = p.video_url ? '🎬' : '';
  const stockBadge = p.stock === 0 ? '🔴' : p.stock <= 5 ? '🟡' : '🟢';
  text += \`\`\`\${p.sku}\`\`\` \${p.name} — S/.\${p.price_sale} \${stockBadge}\${p.stock} \${hasImg}\${hasVideo}\n\`;
});
text += '\n🟢=disponible 🟡=últimas 🔴=agotado 📸=tiene foto 🎬=tiene video';
return [{ json: { chatId, text } }];
` },
  },

  // [17] Enviar lista
  {
    id: 'n17', name: 'Enviar Lista', type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2, position: [1080, 600],
    parameters: {
      chatId: '={{ $json.chatId }}',
      text: '={{ $json.text }}',
      additionalFields: { parse_mode: 'Markdown' },
    },
    credentials: TG_CRED,
  },

  // ── BORRAR BRANCH ────────────────────────────────────────────────────────

  // [18] Desactivar producto (soft delete)
  {
    id: 'n18', name: 'Desactivar Producto', type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4, position: [680, 720],
    parameters: {
      method: 'PATCH',
      url: `=${SUPA_URL}/rest/v1/hinode_products?sku=eq.{{ $json.sku }}`,
      sendHeaders: true,
      headerParameters: { parameters: [
        { name: 'apikey',        value: `=${SUPA_KEY}` },
        { name: 'Authorization', value: `=Bearer ${SUPA_KEY}` },
        { name: 'Content-Type',  value: 'application/json' },
        { name: 'Prefer',        value: 'return=representation' },
      ]},
      sendBody: true, specifyBody: 'json',
      jsonBody: '{"active": false}',
    },
  },

  // [19] Confirmar borrado
  {
    id: 'n19', name: 'Confirmar Borrar', type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2, position: [880, 720],
    parameters: {
      chatId: `={{ $node['Parsear Mensaje'].json.chatId }}`,
      text: `=🗑️ Producto {{ $node['Parsear Mensaje'].json.sku }} desactivado.\nYa no aparece en la web. Usa /agregar para restaurarlo.`,
      additionalFields: { parse_mode: 'Markdown' },
    },
    credentials: TG_CRED,
  },

  // ── FALLBACK ─────────────────────────────────────────────────────────────

  // [20] Ayuda
  {
    id: 'n20', name: 'Enviar Ayuda', type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2, position: [680, 840],
    parameters: {
      chatId: `={{ $node['Parsear Mensaje'].json.chatId }}`,
      text: `🌿 *Luméa Admin Bot*\n\n*Comandos disponibles:*\n\n📦 \`/agregar SKU|Nombre|Precio|cat|stock|desc\`\n✏️ \`/editar SKU campo=valor\`\n📊 \`/stock SKU cantidad\`\n📋 \`/listar [categoria]\`\n🗑️ \`/borrar SKU\`\n\n📸 *Foto + caption = SKU* → guarda imagen y prepara para animación Higgsfield\n\n*Categorías:* fragancia, crema, facial, kit\n*Ejemplo:*\n\`/agregar HIN-F006|Rouge Élégant|92|fragancia|20|Fragancia premium floral\``,
      additionalFields: { parse_mode: 'Markdown' },
    },
    credentials: TG_CRED,
  },
];

// ── Conexiones ─────────────────────────────────────────────────────────────
const connections = {
  'Telegram Trigger':    { main: [[{ node: 'Parsear Mensaje',      type: 'main', index: 0 }]] },
  'Parsear Mensaje':     { main: [[{ node: 'Router',               type: 'main', index: 0 }]] },
  'Router': { main: [
    [{ node: 'Obtener URL Foto',    type: 'main', index: 0 }],  // 0: photo
    [{ node: 'Parsear Agregar',     type: 'main', index: 0 }],  // 1: agregar
    [{ node: 'UPDATE Stock',        type: 'main', index: 0 }],  // 2: stock
    [{ node: 'Parsear y Editar',    type: 'main', index: 0 }],  // 3: editar
    [{ node: 'GET Productos',       type: 'main', index: 0 }],  // 4: listar
    [{ node: 'Desactivar Producto', type: 'main', index: 0 }],  // 5: borrar
    [{ node: 'Enviar Ayuda',        type: 'main', index: 0 }],  // fallback
  ]},
  // Foto
  'Obtener URL Foto':    { main: [[{ node: 'Build Image URL',      type: 'main', index: 0 }]] },
  'Build Image URL':     { main: [[{ node: 'Guardar image_url',    type: 'main', index: 0 }]] },
  'Guardar image_url':   { main: [[{ node: 'Confirmar Foto',       type: 'main', index: 0 }]] },
  // Agregar
  'Parsear Agregar':     { main: [[{ node: 'INSERT Producto',      type: 'main', index: 0 }]] },
  'INSERT Producto':     { main: [[{ node: 'Confirmar Agregar',    type: 'main', index: 0 }]] },
  // Stock
  'UPDATE Stock':        { main: [[{ node: 'Confirmar Stock',      type: 'main', index: 0 }]] },
  // Editar
  'Parsear y Editar':    { main: [[{ node: 'PATCH Campo',          type: 'main', index: 0 }]] },
  'PATCH Campo':         { main: [[{ node: 'Confirmar Editar',     type: 'main', index: 0 }]] },
  // Listar
  'GET Productos':       { main: [[{ node: 'Formatear Lista',      type: 'main', index: 0 }]] },
  'Formatear Lista':     { main: [[{ node: 'Enviar Lista',         type: 'main', index: 0 }]] },
  // Borrar
  'Desactivar Producto': { main: [[{ node: 'Confirmar Borrar',     type: 'main', index: 0 }]] },
};

// ── Crear workflow ──────────────────────────────────────────────────────────
async function main() {
  console.log('Building Luméa Admin Bot...');

  const wf = await api('/workflows', {
    name: 'Luméa — Admin Bot Telegram',
    nodes,
    connections,
    settings: { executionOrder: 'v1', saveManualExecutions: false },
  });

  if (!wf.id) { console.error('Error:', JSON.stringify(wf)); process.exit(1); }
  console.log('✅ Workflow created:', wf.id);

  await api(`/workflows/${wf.id}/activate`, {});
  console.log('✅ Activated');

  console.log('\n=== Configuración requerida ===');
  console.log('1. En n8n → Settings → Environment variables, agrega:');
  console.log('   N8N_HINODE_SUPABASE_SERVICE_KEY = (service key de mzprgmwcaegtkxmuzkrp)');
  console.log('   N8N_TELEGRAM_BOT_TOKEN          = (token del bot de Telegram)');
  console.log('\n2. En Telegram → BotFather → /setwebhook:');
  console.log(`   O usa el Telegram Trigger que ya configura el webhook automáticamente.`);
  console.log('\n3. Agrega al grupo de alertas Hinode al bot.');
  console.log('\n4. Aplica migration 062 en Supabase Dashboard (SQL Editor).');
  console.log('\nWorkflow ID:', wf.id);
}

main().catch(console.error);
