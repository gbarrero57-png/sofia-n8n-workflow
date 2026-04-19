-- Migration 032: Hinode E-commerce Bot Schema
-- Date: 2026-04-14
--
-- Bot de ventas WhatsApp para Hinode Group Perú.
-- Completamente aislado de SofIA — sin referencias a clinics, appointments, doctors.
--
-- Tablas: hinode_stores, hinode_products, hinode_orders, hinode_conversations
-- Prefijo `hinode_` en todas las tablas para evitar colisiones.

-- ── 1. hinode_stores ──────────────────────────────────────────────────────────
-- Equivalente a `clinics` pero para e-commerce. Una tienda = un distribuidor Hinode.
CREATE TABLE IF NOT EXISTS hinode_stores (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT        NOT NULL,
  owner_name            TEXT,
  whatsapp_number       TEXT,
  chatwoot_account_id   INTEGER,
  chatwoot_inbox_id     INTEGER     UNIQUE,   -- lookup key: inbox_id del webhook
  telegram_chat_id      TEXT,                 -- para notificaciones de pedido
  bot_config            JSONB       DEFAULT '{}'::JSONB,
  -- bot_config keys:
  --   chatwoot_api_token: TEXT   (token de API para enviar mensajes)
  --   max_interactions:   INT    (límite de interacciones automáticas, default 15)
  --   welcome_message:    TEXT   (mensaje de bienvenida personalizado)
  --   payment_yape:       TEXT   (número Yape)
  --   payment_plin:       TEXT   (número Plin)
  --   payment_bcp:        TEXT   (cuenta BCP)
  --   shipping_lima:      TEXT   (costo envío Lima, default "S/. 10")
  --   shipping_provincias:TEXT   (costo envío provincias, default "S/. 20")
  active                BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hinode_stores_inbox
  ON hinode_stores (chatwoot_inbox_id)
  WHERE active = true;

-- ── 2. hinode_products ────────────────────────────────────────────────────────
-- Catálogo de productos Hinode disponibles para la tienda.
CREATE TABLE IF NOT EXISTS hinode_products (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID        NOT NULL REFERENCES hinode_stores(id) ON DELETE CASCADE,
  sku           TEXT,
  name          TEXT        NOT NULL,
  description   TEXT,
  category      TEXT        NOT NULL,  -- fragancia | crema_corporal | cuidado_facial | kit | otro
  price_sale    NUMERIC(10,2) NOT NULL,  -- precio de venta al público
  price_cost    NUMERIC(10,2),           -- precio de costo (distribuidor) — privado
  stock         INTEGER     NOT NULL DEFAULT 0,
  image_url     TEXT,
  keywords      TEXT[],                  -- para búsqueda por keyword
  active        BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hinode_products_store
  ON hinode_products (store_id, active);

CREATE INDEX IF NOT EXISTS idx_hinode_products_category
  ON hinode_products (store_id, category)
  WHERE active = true;

-- ── 3. hinode_orders ─────────────────────────────────────────────────────────
-- Pedidos recibidos vía WhatsApp.
CREATE TABLE IF NOT EXISTS hinode_orders (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id              UUID        NOT NULL REFERENCES hinode_stores(id) ON DELETE RESTRICT,
  chatwoot_conversation_id TEXT,          -- para vincular con la conversación
  customer_name         TEXT,
  customer_phone        TEXT,
  customer_address      TEXT,
  items                 JSONB       NOT NULL DEFAULT '[]'::JSONB,
  -- items format: [{ product_id, name, category, qty, price_unit, subtotal }]
  total_amount          NUMERIC(10,2),
  payment_method        TEXT,             -- yape | plin | transferencia | efectivo
  payment_status        TEXT        NOT NULL DEFAULT 'pending',
  -- pending | paid | cancelled
  delivery_status       TEXT        NOT NULL DEFAULT 'new',
  -- new | preparing | shipped | delivered | cancelled
  notes                 TEXT,
  order_number          SERIAL,           -- número correlativo amigable
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hinode_orders_store
  ON hinode_orders (store_id, delivery_status);

CREATE INDEX IF NOT EXISTS idx_hinode_orders_phone
  ON hinode_orders (customer_phone, store_id);

-- ── 4. hinode_conversations ───────────────────────────────────────────────────
-- Estado de conversación por sesión WhatsApp.
-- Governance: controla pausa de bot y estado del pedido en progreso.
CREATE TABLE IF NOT EXISTS hinode_conversations (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id                  UUID        NOT NULL REFERENCES hinode_stores(id) ON DELETE CASCADE,
  chatwoot_conversation_id  TEXT        NOT NULL,
  customer_phone            TEXT,
  customer_name             TEXT,
  bot_paused                BOOLEAN     NOT NULL DEFAULT false,
  -- current_order_draft: carrito temporal durante flujo ORDER
  -- format: { step, product_name, product_id, qty, price_unit, subtotal,
  --           customer_name, customer_address, started_at }
  -- steps: 'awaiting_product' → 'awaiting_info' → 'awaiting_payment' → done (null)
  current_order_draft       JSONB,
  interaction_count         INTEGER     NOT NULL DEFAULT 0,
  last_intent               TEXT,                 -- último intent clasificado
  last_activity_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_hinode_conv UNIQUE (store_id, chatwoot_conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_hinode_conv_store
  ON hinode_conversations (store_id, chatwoot_conversation_id);

CREATE INDEX IF NOT EXISTS idx_hinode_conv_active
  ON hinode_conversations (store_id, bot_paused, last_activity_at)
  WHERE bot_paused = false;

-- ── 5. Triggers updated_at ───────────────────────────────────────────────────
-- Reutiliza la función update_updated_at() creada en migraciones anteriores.
CREATE TRIGGER trg_hinode_stores_updated
  BEFORE UPDATE ON hinode_stores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_hinode_products_updated
  BEFORE UPDATE ON hinode_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_hinode_orders_updated
  BEFORE UPDATE ON hinode_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_hinode_conversations_updated
  BEFORE UPDATE ON hinode_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 6. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE hinode_stores        ENABLE ROW LEVEL SECURITY;
ALTER TABLE hinode_products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE hinode_orders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE hinode_conversations ENABLE ROW LEVEL SECURITY;

-- service_role: acceso total (n8n usa service_role)
CREATE POLICY hinode_stores_service        ON hinode_stores        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY hinode_products_service      ON hinode_products      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY hinode_orders_service        ON hinode_orders        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY hinode_conversations_service ON hinode_conversations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- anon: sin acceso (el bot usa service_role, no anon)
-- authenticated: sin acceso por ahora (se puede agregar panel admin después)

-- ── 7. Grants ─────────────────────────────────────────────────────────────────
GRANT ALL ON TABLE hinode_stores        TO service_role;
GRANT ALL ON TABLE hinode_products      TO service_role;
GRANT ALL ON TABLE hinode_orders        TO service_role;
GRANT ALL ON TABLE hinode_conversations TO service_role;
GRANT USAGE, SELECT ON SEQUENCE hinode_orders_order_number_seq TO service_role;
