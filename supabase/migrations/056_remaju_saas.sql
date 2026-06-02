-- ============================================================
-- REMAJU SaaS — Tablas de usuarios, filtros y log de alertas
-- ============================================================

-- Usuarios registrados vía Telegram bot
CREATE TABLE IF NOT EXISTS remaju_users (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id           BIGINT      UNIQUE NOT NULL,
  telegram_username     TEXT,
  first_name            TEXT,
  last_name             TEXT,
  subscription_status   TEXT        NOT NULL DEFAULT 'trial'
                        CHECK (subscription_status IN ('trial', 'active', 'expired', 'cancelled')),
  trial_ends_at         TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  subscription_ends_at  TIMESTAMPTZ,
  active                BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Filtros personalizados por usuario (1:1)
CREATE TABLE IF NOT EXISTS remaju_filters (
  id              UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID    NOT NULL REFERENCES remaju_users(id) ON DELETE CASCADE,
  min_price_usd   INTEGER NOT NULL DEFAULT 0,
  max_price_usd   INTEGER NOT NULL DEFAULT 90000,
  tiers           TEXT[]  NOT NULL DEFAULT ARRAY['super_ganga','muy_bueno','bueno','aceptable'],
  property_types  TEXT[]  NOT NULL DEFAULT ARRAY['casa','departamento','terreno','local','otro'],
  districts       TEXT[]  NOT NULL DEFAULT ARRAY[]::TEXT[],  -- vacío = todos Lima
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Log de alertas enviadas (evita duplicados por usuario)
CREATE TABLE IF NOT EXISTS remaju_alert_log (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID        NOT NULL REFERENCES remaju_users(id) ON DELETE CASCADE,
  auction_external_id TEXT        NOT NULL,
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, auction_external_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_remaju_users_telegram_id  ON remaju_users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_remaju_users_status        ON remaju_users(subscription_status, active);
CREATE INDEX IF NOT EXISTS idx_remaju_filters_user_id     ON remaju_filters(user_id);
CREATE INDEX IF NOT EXISTS idx_remaju_alert_log_user      ON remaju_alert_log(user_id, sent_at);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_remaju_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_remaju_users_updated_at
  BEFORE UPDATE ON remaju_users
  FOR EACH ROW EXECUTE FUNCTION update_remaju_updated_at();

CREATE TRIGGER trg_remaju_filters_updated_at
  BEFORE UPDATE ON remaju_filters
  FOR EACH ROW EXECUTE FUNCTION update_remaju_updated_at();
