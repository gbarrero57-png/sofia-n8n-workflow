#!/usr/bin/env node
/**
 * onboard_hinode_store.mjs
 * Seeds the Hinode Supabase project with a store + initial product catalog.
 *
 * Prerequisites:
 *   - New Supabase project created (separate from SofIA).
 *   - Migration 032_hinode_schema.sql applied in that NEW project.
 *   - Set env vars before running:
 *       N8N_HINODE_SUPABASE_URL=https://xxxx.supabase.co
 *       N8N_HINODE_SUPABASE_SERVICE_KEY=eyJ...
 *
 * Run:
 *   N8N_HINODE_SUPABASE_URL=https://xxxx.supabase.co \
 *   N8N_HINODE_SUPABASE_SERVICE_KEY=eyJ... \
 *   node scripts/ops/onboard_hinode_store.mjs
 *
 * What it does:
 *   1. INSERT hinode_stores (config, Chatwoot inbox, Telegram chat)
 *   2. INSERT hinode_products (catálogo inicial Hinode Perú)
 *   3. Prints store_id to use in build_hinode_bot.mjs
 */

import https from 'https';

const SUPABASE_URL = process.env.N8N_HINODE_SUPABASE_URL || 'https://mzprgmwcaegtkxmuzkrp.supabase.co';
const SERVICE_KEY  = process.env.N8N_HINODE_SUPABASE_SERVICE_KEY;

if (!SERVICE_KEY) {
  console.error('❌ Falta variable de entorno: N8N_HINODE_SUPABASE_SERVICE_KEY');
  console.error('   Obtén el service role key desde Supabase Dashboard → Settings → API');
  process.exit(1);
}

// ── Configuración de la tienda ─────────────────────────────────────────────
// Ajusta estos valores antes de ejecutar:
const STORE_CONFIG = {
  name:                 'Hinode Perú — Tienda Demo',
  owner_name:           'Gabriel Barrero',
  whatsapp_number:      '+51977588512',   // número WhatsApp del distribuidor
  chatwoot_account_id:  2,                // account ID en Chatwoot
  chatwoot_inbox_id:    10,               // inbox ID en Chatwoot (SofIA WhatsApp Peru demo)
  telegram_chat_id:     '-4523041658',    // chat Telegram para alertas de pedidos
  bot_config: {
    chatwoot_api_token:  'yypAwZDH2dV3crfbqJqWCgj1',  // Chatwoot superadmin token
    max_interactions:    15,
    welcome_message:     '¡Hola! 👋 Soy el asistente de *Hinode Perú*. ¿En qué te puedo ayudar hoy?',
    payment_yape:        '977588512',      // número Yape
    payment_plin:        '977588512',      // número Plin
    payment_bcp:         '191-123456789-0-12',  // cuenta BCP
    shipping_lima:       'S/. 10 — entrega 24-48h',
    shipping_provincias: 'S/. 20 — entrega 3-5 días',
  }
};

// ── Catálogo inicial Hinode Perú ───────────────────────────────────────────
// Basado en el catálogo ciclo 2 2026. Ajustar precios según distribuidor.
const PRODUCTS = [
  // === FRAGANCIAS ===
  {
    sku: 'HIN-F001', name: 'Absolue Night for Men', category: 'fragancia',
    description: 'Fragancia masculina intensa, inspirada en Bleu de Chanel. Notas de cedro, ámbar y almizcle.',
    price_sale: 89.00, price_cost: 53.40, stock: 20,
    keywords: ['perfume', 'fragancia', 'masculino', 'noche', 'bleu', 'chanel', 'hombre']
  },
  {
    sku: 'HIN-F002', name: 'Esplêndida Rose', category: 'fragancia',
    description: 'Fragancia femenina floral-frutal, inspirada en Good Girl de Carolina Herrera. Notas de pera, rosa y vainilla.',
    price_sale: 85.00, price_cost: 51.00, stock: 20,
    keywords: ['perfume', 'fragancia', 'femenino', 'rosa', 'floral', 'good girl', 'carolina', 'mujer']
  },
  {
    sku: 'HIN-F003', name: 'Billion Man Sport', category: 'fragancia',
    description: 'Fragancia deportiva masculina. Notas de cítricos, menta y madera. Larga duración.',
    price_sale: 79.00, price_cost: 47.40, stock: 25,
    keywords: ['perfume', 'fragancia', 'masculino', 'sport', 'deportivo', 'hombre', 'fresco']
  },
  {
    sku: 'HIN-F004', name: 'Dolce Sense', category: 'fragancia',
    description: 'Fragancia femenina oriental dulce. Inspirada en La Vie est Belle de Lancôme. Notas de iris, jazmín y caramelo.',
    price_sale: 87.00, price_cost: 52.20, stock: 15,
    keywords: ['perfume', 'fragancia', 'femenino', 'dulce', 'oriental', 'lancôme', 'vie est belle', 'mujer']
  },
  {
    sku: 'HIN-F005', name: 'Pocket Fragrance Pack x4', category: 'fragancia',
    description: 'Set de 4 pockets de fragancia (15ml c/u): masculino + femenino. Ideales para regalo o viaje.',
    price_sale: 65.00, price_cost: 39.00, stock: 30,
    keywords: ['pocket', 'kit', 'pack', 'regalo', 'viaje', 'mini', 'set', 'combo']
  },
  // === CREMAS CORPORALES ===
  {
    sku: 'HIN-C001', name: 'Corporal Hidratante Acai', category: 'crema_corporal',
    description: 'Crema corporal hidratante con aceite de açaí brasileño. Piel suave y luminosa en 7 días. 200ml.',
    price_sale: 55.00, price_cost: 33.00, stock: 30,
    keywords: ['crema', 'corporal', 'hidratante', 'acai', 'açaí', 'piel', 'suave', 'brasil']
  },
  {
    sku: 'HIN-C002', name: 'Corporal Reafirmante Colágeno', category: 'crema_corporal',
    description: 'Crema reafirmante con colágeno y elastina. Reduce flacidez visible en 4 semanas. 200ml.',
    price_sale: 65.00, price_cost: 39.00, stock: 25,
    keywords: ['crema', 'corporal', 'reafirmante', 'colágeno', 'flacidez', 'elastina', 'firmeza']
  },
  {
    sku: 'HIN-C003', name: 'Corporal Iluminadora Vitamina C', category: 'crema_corporal',
    description: 'Crema iluminadora con vitamina C y niacinamida. Unifica el tono y aporta luminosidad. 200ml.',
    price_sale: 60.00, price_cost: 36.00, stock: 20,
    keywords: ['crema', 'corporal', 'iluminadora', 'vitamina c', 'brillo', 'tono', 'niacinamida']
  },
  // === CUIDADO FACIAL ===
  {
    sku: 'HIN-CF001', name: 'Sérum Facial Antienvejecimiento', category: 'cuidado_facial',
    description: 'Sérum concentrado con retinol y ácido hialurónico. Reduce arrugas y líneas de expresión. 30ml.',
    price_sale: 95.00, price_cost: 57.00, stock: 15,
    keywords: ['sérum', 'serum', 'facial', 'retinol', 'antiedad', 'arrugas', 'hialurónico', 'antienvejecimiento']
  },
  {
    sku: 'HIN-CF002', name: 'Contorno de Ojos', category: 'cuidado_facial',
    description: 'Crema para contorno de ojos. Reduce ojeras y bolsas. Con cafeína y vitamina K. 15ml.',
    price_sale: 72.00, price_cost: 43.20, stock: 12,
    keywords: ['contorno', 'ojos', 'ojeras', 'bolsas', 'cafeína', 'facial']
  },
  // === KITS / COMBOS ===
  {
    sku: 'HIN-K001', name: 'Kit Bienvenida Hinode', category: 'kit',
    description: 'Set de introducción: 9 muestras de cremas corporales más vendidas + 4 pockets de fragancia. Perfecto para regalo.',
    price_sale: 130.00, price_cost: 78.00, stock: 10,
    keywords: ['kit', 'combo', 'regalo', 'bienvenida', 'set', 'pack', 'inicio', 'muestras']
  },
  {
    sku: 'HIN-K002', name: 'Kit Bienestar Completo', category: 'kit',
    description: 'Combo: 1 fragancia a elegir + crema corporal hidratante + sérum facial. Ahorra S/. 50 vs precio individual.',
    price_sale: 190.00, price_cost: 114.00, stock: 8,
    keywords: ['kit', 'combo', 'bienestar', 'completo', 'ahorro', 'set']
  },
];

// ── Helper: llamada HTTP a Supabase ───────────────────────────────────────
function supaReq(method, path, body) {
  const data = body ? JSON.stringify(body) : null;
  return new Promise((res, rej) => {
    const req = https.request({
      hostname: new URL(SUPABASE_URL).hostname,
      path,
      method,
      headers: {
        apikey: SERVICE_KEY,
        Authorization: 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, resp => {
      let d = '';
      resp.on('data', c => d += c);
      resp.on('end', () => {
        try {
          const parsed = JSON.parse(d || 'null');
          if (resp.statusCode >= 400) {
            rej(new Error(`HTTP ${resp.statusCode}: ${JSON.stringify(parsed).slice(0, 200)}`));
          } else {
            res(parsed);
          }
        } catch (e) {
          rej(new Error('Invalid JSON: ' + d.slice(0, 100)));
        }
      });
    });
    req.on('error', rej);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  console.log('=== Hinode Store Onboarding ===\n');

  // ── 1. Crear tienda ──────────────────────────────────────────────────────
  console.log('1. Creando tienda...');
  let store;
  try {
    const existing = await supaReq('GET',
      `/rest/v1/hinode_stores?chatwoot_inbox_id=eq.${STORE_CONFIG.chatwoot_inbox_id}&select=id,name`
    );
    if (existing && existing.length > 0) {
      store = existing[0];
      console.log('   ⚠️  Tienda ya existe:', store.name, '— ID:', store.id);
    } else {
      const result = await supaReq('POST', '/rest/v1/hinode_stores', STORE_CONFIG);
      store = Array.isArray(result) ? result[0] : result;
      console.log('   ✅ Tienda creada:', store.name);
    }
  } catch (e) {
    console.error('   ❌ Error creando tienda:', e.message);
    process.exit(1);
  }
  const storeId = store.id;
  console.log('   Store ID:', storeId);

  // ── 2. Crear productos ───────────────────────────────────────────────────
  console.log('\n2. Insertando catálogo de productos...');
  let inserted = 0, skipped = 0;
  for (const product of PRODUCTS) {
    try {
      // Check if SKU already exists for this store
      const existing = await supaReq('GET',
        `/rest/v1/hinode_products?store_id=eq.${storeId}&sku=eq.${product.sku}&select=id`
      );
      if (existing && existing.length > 0) {
        console.log('   ⚠️  Omitido (ya existe):', product.sku, '-', product.name);
        skipped++;
        continue;
      }
      await supaReq('POST', '/rest/v1/hinode_products', {
        store_id: storeId,
        ...product
      });
      console.log('   ✅', product.sku, '-', product.name, '(S/.', product.price_sale + ')');
      inserted++;
    } catch (e) {
      console.error('   ❌ Error en', product.sku, ':', e.message);
    }
  }
  console.log(`\n   Total: ${inserted} insertados, ${skipped} omitidos`);

  // ── 3. Resumen final ─────────────────────────────────────────────────────
  console.log('\n=== ✅ Onboarding completado ===');
  console.log('');
  console.log('Store ID (copiar para build_hinode_bot.mjs):');
  console.log('  STORE_ID =', storeId);
  console.log('');
  console.log('Siguiente paso:');
  console.log('  node scripts/builders/build_hinode_bot.mjs');
  console.log('');
  console.log('Configuración activa:');
  console.log('  Chatwoot inbox:', STORE_CONFIG.chatwoot_inbox_id);
  console.log('  Telegram chat:', STORE_CONFIG.telegram_chat_id);
  console.log('  Productos cargados:', inserted);
}

main().catch(err => {
  console.error('\n❌ Error fatal:', err.message);
  process.exit(1);
});
