-- ============================================================
-- Migration 023: Fix clinic isolation in resolve_clinic
-- Problem: resolve_clinic ignores p_account_id parameter,
-- allowing cross-account inbox_id collisions.
-- ============================================================

-- Step 1: Create a unique constraint helper to prevent duplicate inbox_id assignments
-- (partial: can't use UNIQUE on array elements directly, so we enforce via trigger)

CREATE OR REPLACE FUNCTION check_inbox_id_uniqueness()
RETURNS TRIGGER AS $$
DECLARE
  conflict_clinic TEXT;
  inbox_val INT;
BEGIN
  -- Check each inbox_id in the new array
  FOREACH inbox_val IN ARRAY COALESCE(NEW.chatwoot_inbox_ids, ARRAY[]::INT[])
  LOOP
    SELECT name INTO conflict_clinic
    FROM clinics
    WHERE id != NEW.id
      AND chatwoot_inbox_ids @> ARRAY[inbox_val]
      AND chatwoot_account_id = NEW.chatwoot_account_id;

    IF FOUND THEN
      RAISE EXCEPTION 'inbox_id % (account %) already assigned to clinic "%"',
        inbox_val, NEW.chatwoot_account_id, conflict_clinic;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inbox_uniqueness ON clinics;
CREATE TRIGGER trg_inbox_uniqueness
  BEFORE INSERT OR UPDATE ON clinics
  FOR EACH ROW EXECUTE FUNCTION check_inbox_id_uniqueness();

-- Step 2: Fix resolve_clinic to enforce chatwoot_account_id
-- The function should only return clinics belonging to the given account_id

CREATE OR REPLACE FUNCTION resolve_clinic(p_inbox_id INT, p_account_id INT)
RETURNS TABLE(
  clinic_id    UUID,
  clinic_name  TEXT,
  calendar_id  TEXT,
  timezone     TEXT,
  bot_config   JSONB,
  inbox_id     INT
) AS $$
BEGIN
  -- Primary: search in chatwoot_inbox_ids array (new format), filtered by account_id
  RETURN QUERY
  SELECT
    c.id::UUID,
    c.name::TEXT,
    c.calendar_id::TEXT,
    c.timezone::TEXT,
    c.bot_config,
    p_inbox_id
  FROM clinics c
  WHERE c.chatwoot_inbox_ids @> ARRAY[p_inbox_id]
    AND c.chatwoot_account_id = p_account_id
    AND c.is_active = true
  LIMIT 1;

  -- Fallback: legacy single inbox_id field
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      c.id::UUID,
      c.name::TEXT,
      c.calendar_id::TEXT,
      c.timezone::TEXT,
      c.bot_config,
      p_inbox_id
    FROM clinics c
    WHERE c.chatwoot_inbox_id = p_inbox_id
      AND c.chatwoot_account_id = p_account_id
      AND c.is_active = true
    LIMIT 1;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant access
GRANT EXECUTE ON FUNCTION resolve_clinic(INT, INT) TO anon, authenticated, service_role;

COMMENT ON FUNCTION resolve_clinic IS
  'Resolves clinic from Chatwoot inbox_id + account_id.
   Enforces account isolation: inbox_ids from different accounts do not collide.
   Migration 023 - 2026-03-21';
