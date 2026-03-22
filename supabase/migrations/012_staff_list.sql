-- ============================================================
-- SofIA SaaS — Staff Management Helper Function
-- Migration 012: list_staff_members RPC (joins auth.users for email)
-- ============================================================

-- list_staff_members: returns staff for caller's clinic + email from auth.users
-- Only admins can call this (SECURITY DEFINER bypasses RLS to read auth.users)
CREATE OR REPLACE FUNCTION public.list_staff_members()
RETURNS TABLE (
    id          UUID,
    user_id     UUID,
    full_name   TEXT,
    email       TEXT,
    role        TEXT,
    active      BOOLEAN,
    created_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_clinic UUID;
    v_caller_role   TEXT;
BEGIN
    v_caller_clinic := (auth.jwt() ->> 'clinic_id')::uuid;
    v_caller_role   := auth.jwt() ->> 'user_role';

    IF v_caller_role <> 'admin' THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Solo admins pueden listar staff';
    END IF;

    RETURN QUERY
    SELECT
        s.id,
        s.user_id,
        COALESCE(s.full_name, split_part(u.email, '@', 1)) AS full_name,
        u.email::TEXT,
        s.role::TEXT,
        s.active,
        s.created_at
    FROM public.staff s
    JOIN auth.users u ON u.id = s.user_id
    WHERE s.clinic_id = v_caller_clinic
    ORDER BY s.created_at ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_staff_members() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_staff_members() TO authenticated;

COMMENT ON FUNCTION public.list_staff_members() IS
    'Devuelve todos los staff de la clínica del admin que llama, '
    'incluyendo email de auth.users. Solo admins pueden ejecutar.';
