-- ============================================================
-- REMAJU — Auto-expiración de trials y suscripciones vencidas
-- Corre diario a las 6AM Lima (11:00 UTC) via pg_cron
-- ============================================================

-- Función que marca vencidos
CREATE OR REPLACE FUNCTION expire_remaju_subscriptions()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE remaju_users
  SET
    subscription_status = 'expired',
    active = false,
    updated_at = NOW()
  WHERE
    active = true
    AND (
      (subscription_status = 'trial'  AND trial_ends_at        < NOW())
      OR
      (subscription_status = 'active' AND subscription_ends_at < NOW())
    );

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- Cron diario 6AM Lima (11:00 UTC)
SELECT cron.schedule(
  'remaju-expire-subscriptions',
  '0 11 * * *',
  $$ SELECT expire_remaju_subscriptions(); $$
);
