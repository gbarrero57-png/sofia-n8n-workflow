-- ============================================================
-- REMAJU — Tabla de subastas (reemplaza SQLite en scraper VPS)
-- Alimentada por el scraper local vía script run_local.mjs
-- ============================================================

CREATE TABLE IF NOT EXISTS remaju_auctions (
  id                    TEXT        PRIMARY KEY,
  source                TEXT        NOT NULL DEFAULT 'remaju',
  external_id           TEXT        NOT NULL,
  expediente            TEXT,
  juzgado               TEXT,
  title                 TEXT,
  description           TEXT,
  property_type         TEXT,
  property_type_raw     TEXT,
  location_department   TEXT,
  location_province     TEXT,
  location_district     TEXT,
  location_raw          TEXT,
  area_m2               NUMERIC,
  price_original        NUMERIC,
  currency_original     TEXT,
  exchange_rate         NUMERIC,
  price_usd             NUMERIC,
  price_usd_tier        TEXT,
  auction_phase         TEXT,
  auction_date          TEXT,
  detail_url            TEXT,
  images                JSONB       DEFAULT '[]'::jsonb,
  raw_data              JSONB       DEFAULT '{}'::jsonb,
  price_history         JSONB       DEFAULT '[]'::jsonb,
  first_seen_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status                TEXT        NOT NULL DEFAULT 'active',
  alerted               INTEGER     NOT NULL DEFAULT 0,
  alert_count           INTEGER     NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_remaju_auctions_external_id
  ON remaju_auctions(source, external_id);

CREATE INDEX IF NOT EXISTS idx_remaju_auctions_status_price
  ON remaju_auctions(status, price_usd, location_department);

CREATE INDEX IF NOT EXISTS idx_remaju_auctions_tier
  ON remaju_auctions(price_usd_tier);

-- Función para updated_at automático
CREATE OR REPLACE FUNCTION update_remaju_auctions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_remaju_auctions_updated_at
  BEFORE UPDATE ON remaju_auctions
  FOR EACH ROW EXECUTE FUNCTION update_remaju_auctions_updated_at();

-- RLS: solo service_role puede escribir; anon puede leer
ALTER TABLE remaju_auctions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "remaju_auctions_read" ON remaju_auctions
  FOR SELECT USING (true);

CREATE POLICY "remaju_auctions_service_write" ON remaju_auctions
  FOR ALL USING (auth.role() = 'service_role');
