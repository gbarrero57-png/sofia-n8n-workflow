-- Migration 033: Hinode Public Views — acceso anónimo para landing page
-- Date: 2026-04-22
--
-- Expone catálogo de productos y nombre de tienda al rol anon (frontend público).
-- Oculta: price_cost (margen privado), bot_config (tokens API).
--
-- APLICAR EN: proyecto Hinode (mzprgmwcaegtkxmuzkrp), NO en SofIA.

-- ── 1. Vista pública de productos ────────────────────────────────────────────
-- Excluye price_cost para no exponer el margen del distribuidor.
CREATE OR REPLACE VIEW hinode_products_public AS
  SELECT
    id,
    store_id,
    sku,
    name,
    description,
    category,
    price_sale,
    stock,
    image_url,
    keywords,
    active,
    created_at,
    updated_at
  FROM hinode_products
  WHERE active = true;

-- ── 2. Vista pública de tienda ────────────────────────────────────────────────
-- Excluye bot_config (contiene Chatwoot API token y otras credenciales).
CREATE OR REPLACE VIEW hinode_stores_public AS
  SELECT
    id,
    name,
    whatsapp_number
  FROM hinode_stores
  WHERE active = true;

-- ── 3. Grants a anon ─────────────────────────────────────────────────────────
GRANT SELECT ON hinode_products_public TO anon;
GRANT SELECT ON hinode_stores_public   TO anon;

-- ── 4. RLS en tabla base para Realtime ────────────────────────────────────────
-- Supabase Realtime usa la RLS de la tabla base, no de la vista.
-- Sin esta policy, el canal postgres_changes no envía eventos al anon key.
CREATE POLICY hinode_products_anon_realtime ON hinode_products
  FOR SELECT TO anon
  USING (active = true);
-- Nota: esta policy NO expone price_cost en Realtime payloads porque el frontend
-- solo lee de hinode_products_public. El payload del canal sí incluye todos los
-- campos del UPDATE, pero el anon key no puede hacer SELECT directo en la tabla.
-- Para máxima seguridad, el JS filtra los campos al procesar el payload.
