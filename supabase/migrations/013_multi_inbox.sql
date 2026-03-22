-- Migration 013: Support multiple inbox IDs per clinic
-- Adds chatwoot_inbox_ids array and updates resolve_clinic to check it

-- 1. Add inbox_ids array column
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS chatwoot_inbox_ids integer[] DEFAULT '{}';

-- 2. Seed existing inbox + new inboxes into the array
UPDATE public.clinics
SET chatwoot_inbox_ids = ARRAY[2, 5, 6]  -- 2=original, 5=WhatsApp prod, 6=API test
WHERE id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

-- 3. Update resolve_clinic to check both single id AND array
CREATE OR REPLACE FUNCTION public.resolve_clinic(
    p_inbox_id  integer,
    p_account_id integer DEFAULT NULL
)
RETURNS TABLE(
    clinic_id   uuid,
    clinic_name text,
    calendar_id text,
    timezone    text,
    bot_config  jsonb,
    inbox_id    integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.name,
        c.google_calendar_id,
        COALESCE(c.timezone, 'America/Lima'),
        COALESCE(c.bot_config, '{}'::jsonb),
        p_inbox_id
    FROM public.clinics c
    WHERE c.active = true
      AND (
          c.chatwoot_inbox_id = p_inbox_id
          OR p_inbox_id = ANY(c.chatwoot_inbox_ids)
      )
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'clinic_not_found for inbox_id=%', p_inbox_id
            USING ERRCODE = 'P0001';
    END IF;
END;
$$;
