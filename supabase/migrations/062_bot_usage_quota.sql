-- 062: Bot daily usage quota for @GeneradorPreU_bot
-- Tracks how many Word docs each Telegram user generates per day

CREATE TABLE IF NOT EXISTS bot_usage (
  telegram_id  BIGINT  NOT NULL,
  usage_date   DATE    NOT NULL DEFAULT CURRENT_DATE,
  doc_count    INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (telegram_id, usage_date)
);

-- Atomic increment: inserts row if missing, increments if exists.
-- Returns the NEW count after increment.
CREATE OR REPLACE FUNCTION increment_bot_usage(p_telegram_id BIGINT)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  new_count INTEGER;
BEGIN
  INSERT INTO bot_usage (telegram_id, usage_date, doc_count, updated_at)
  VALUES (p_telegram_id, CURRENT_DATE, 1, NOW())
  ON CONFLICT (telegram_id, usage_date)
  DO UPDATE SET doc_count  = bot_usage.doc_count + 1,
                updated_at = NOW()
  RETURNING doc_count INTO new_count;
  RETURN new_count;
END;
$$;
