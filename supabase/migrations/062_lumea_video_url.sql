-- Migration 062: Luméa — video_url + keywords en hinode_products
-- Agrega video_url para animaciones Higgsfield y keywords para búsqueda.
-- Actualiza la vista pública para exponer ambas columnas al anon key.

ALTER TABLE hinode_products
  ADD COLUMN IF NOT EXISTS video_url  TEXT,
  ADD COLUMN IF NOT EXISTS keywords   TEXT[];

-- Actualiza vista pública: incluye video_url y keywords
CREATE OR REPLACE VIEW hinode_products_public AS
  SELECT
    id, store_id, sku, name, description, category,
    price_sale, stock, image_url, video_url, keywords, active,
    created_at, updated_at
  FROM hinode_products
  WHERE active = true;

GRANT SELECT ON hinode_products_public TO anon;

-- Trigger updated_at automático (si no existe)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'hinode_products_updated_at'
  ) THEN
    CREATE TRIGGER hinode_products_updated_at
      BEFORE UPDATE ON hinode_products
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
