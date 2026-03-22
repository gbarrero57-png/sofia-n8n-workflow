-- Migration 015: Store offered slots in conversations for slot confirmation flow
-- When SofIA offers appointment slots, they need to be persisted so they can
-- be retrieved when the patient replies with their choice (1/2/3).

-- Add offered_slots column to conversations table
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS offered_slots JSONB DEFAULT '[]'::jsonb;

-- Function to store offered slots when bot presents options to patient
CREATE OR REPLACE FUNCTION public.store_offered_slots(
    p_clinic_id uuid,
    p_chatwoot_conv_id TEXT,
    p_slots JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.conversations
    SET offered_slots = p_slots,
        updated_at = now()
    WHERE clinic_id = p_clinic_id
      AND chatwoot_conversation_id = p_chatwoot_conv_id;

    -- If no row updated, upsert it (conversation may not exist yet)
    IF NOT FOUND THEN
        INSERT INTO public.conversations (clinic_id, chatwoot_conversation_id, offered_slots, status)
        VALUES (p_clinic_id, p_chatwoot_conv_id, p_slots, 'active')
        ON CONFLICT (clinic_id, chatwoot_conversation_id) DO UPDATE
        SET offered_slots = EXCLUDED.offered_slots,
            updated_at = now();
    END IF;
END;
$$;

-- Function to get offered slots for a conversation
CREATE OR REPLACE FUNCTION public.get_offered_slots(
    p_clinic_id uuid,
    p_chatwoot_conv_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_slots JSONB;
BEGIN
    SELECT offered_slots INTO v_slots
    FROM public.conversations
    WHERE clinic_id = p_clinic_id
      AND chatwoot_conversation_id = p_chatwoot_conv_id;

    RETURN COALESCE(v_slots, '[]'::jsonb);
END;
$$;

-- Grant execute to service role (n8n uses service key)
GRANT EXECUTE ON FUNCTION public.store_offered_slots(uuid, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_offered_slots(uuid, TEXT) TO service_role;
