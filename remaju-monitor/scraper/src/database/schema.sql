-- =====================================================
-- REMAJU MONITOR — Schema SQLite
-- =====================================================

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ─── AUCTIONS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auctions (
  id                   TEXT PRIMARY KEY,
  source               TEXT NOT NULL DEFAULT 'remaju',
  external_id          TEXT NOT NULL,
  expediente           TEXT,
  juzgado              TEXT,
  title                TEXT,
  description          TEXT,

  -- Tipo de propiedad
  property_type        TEXT CHECK(property_type IN ('casa','departamento','terreno','local','otro')),
  property_type_raw    TEXT,

  -- Ubicación
  location_department  TEXT,
  location_province    TEXT,
  location_district    TEXT,
  location_raw         TEXT,
  address              TEXT,
  area_m2              REAL,

  -- Precio
  price_original       REAL NOT NULL,
  currency_original    TEXT NOT NULL CHECK(currency_original IN ('PEN','USD')),
  exchange_rate        REAL,
  price_usd            REAL NOT NULL,
  price_usd_tier       TEXT CHECK(price_usd_tier IN ('super_ganga','muy_bueno','bueno','aceptable','fuera_rango')),

  -- Remate
  auction_phase        TEXT,
  auction_date         TEXT,
  detail_url           TEXT,
  images               TEXT DEFAULT '[]',

  -- Raw
  raw_data             TEXT DEFAULT '{}',
  price_history        TEXT DEFAULT '[]',

  -- Estado
  first_seen_at        TEXT NOT NULL,
  last_seen_at         TEXT NOT NULL,
  status               TEXT DEFAULT 'active' CHECK(status IN ('active','expired','sold','unknown')),
  alerted              INTEGER DEFAULT 0,
  alert_count          INTEGER DEFAULT 0,

  -- IA (futuro)
  ai_score             REAL,
  ai_summary           TEXT,

  created_at           TEXT DEFAULT (datetime('now')),
  updated_at           TEXT DEFAULT (datetime('now')),

  UNIQUE(source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_auctions_price    ON auctions(price_usd);
CREATE INDEX IF NOT EXISTS idx_auctions_location ON auctions(location_department, location_district);
CREATE INDEX IF NOT EXISTS idx_auctions_status   ON auctions(status);
CREATE INDEX IF NOT EXISTS idx_auctions_alerted  ON auctions(alerted);
CREATE INDEX IF NOT EXISTS idx_auctions_date     ON auctions(auction_date);
CREATE INDEX IF NOT EXISTS idx_auctions_type     ON auctions(property_type);

-- ─── ALERT HISTORY ────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_history (
  id           TEXT PRIMARY KEY,
  auction_id   TEXT NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  channel      TEXT NOT NULL DEFAULT 'telegram',
  recipient    TEXT NOT NULL,
  trigger      TEXT NOT NULL CHECK(trigger IN ('new','price_drop','urgency','digest','test')),
  message_text TEXT,
  sent_at      TEXT NOT NULL,
  status       TEXT DEFAULT 'sent' CHECK(status IN ('sent','failed','delivered'))
);

CREATE INDEX IF NOT EXISTS idx_alerts_auction ON alert_history(auction_id);
CREATE INDEX IF NOT EXISTS idx_alerts_sent    ON alert_history(sent_at);

-- ─── SCRAPING RUNS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS scraping_runs (
  id              TEXT PRIMARY KEY,
  source          TEXT NOT NULL DEFAULT 'remaju',
  mode            TEXT NOT NULL DEFAULT 'delta' CHECK(mode IN ('full','delta')),
  started_at      TEXT NOT NULL,
  completed_at    TEXT,
  pages_scraped   INTEGER DEFAULT 0,
  records_found   INTEGER DEFAULT 0,
  new_records     INTEGER DEFAULT 0,
  updated_records INTEGER DEFAULT 0,
  qualifying      INTEGER DEFAULT 0,
  alerts_sent     INTEGER DEFAULT 0,
  errors          INTEGER DEFAULT 0,
  duration_ms     INTEGER,
  status          TEXT DEFAULT 'running' CHECK(status IN ('running','success','failed','partial')),
  error_message   TEXT
);

-- ─── EXCHANGE RATES ───────────────────────────────────
CREATE TABLE IF NOT EXISTS exchange_rates (
  id         TEXT PRIMARY KEY,
  date       TEXT NOT NULL UNIQUE,
  usd_to_pen REAL NOT NULL,
  pen_to_usd REAL NOT NULL,
  source     TEXT DEFAULT 'bcrp',
  created_at TEXT DEFAULT (datetime('now'))
);

-- ─── SOURCES REGISTRY ────────────────────────────────
CREATE TABLE IF NOT EXISTS sources (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK(type IN ('judicial','bank','private','marketplace')),
  url           TEXT NOT NULL,
  country       TEXT DEFAULT 'PE',
  scraper_class TEXT,
  active        INTEGER DEFAULT 1,
  schedule      TEXT DEFAULT '0 6 * * *',
  config        TEXT DEFAULT '{}',
  last_scraped  TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO sources (id, name, type, url, scraper_class, active)
VALUES (
  'remaju',
  'REMAJU - Poder Judicial Peru',
  'judicial',
  'https://remaju.pj.gob.pe/remaju/pages/publico/remateExterno.xhtml',
  'RemajuScraper',
  1
);
