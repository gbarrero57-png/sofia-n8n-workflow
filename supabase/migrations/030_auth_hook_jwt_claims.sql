-- ============================================================
-- Migration 030: Custom Access Token Hook — JWT claims automáticos
--
-- PROBLEMA ANTERIOR:
--   Las funciones del portal (022) necesitan clinic_id y user_role
--   en el JWT. Sin este hook, hay que actualizar raw_app_meta_data
--   manualmente para cada usuario nuevo → error humano garantizado.
--
-- SOLUCIÓN:
--   Hook que Supabase llama al generar cada JWT. Lee la tabla staff
--   y añade clinic_id + user_role automáticamente para cualquier
--   usuario que esté en staff, sin intervención manual.
--
-- REGISTRO (post-apply):
--   Supabase Dashboard → Authentication → Hooks
--   → Custom Access Token Hook → seleccionar esta función
-- ============================================================

-- Dar permiso al schema supabase_auth_admin para ejecutar la función
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id   uuid;
    v_clinic_id uuid;
    v_role      text;
    v_claims    jsonb;
BEGIN
    v_user_id := (event ->> 'user_id')::uuid;

    -- Buscar en staff table: clínica y rol del usuario
    SELECT s.clinic_id, s.role
    INTO   v_clinic_id, v_role
    FROM   public.staff s
    WHERE  s.user_id  = v_user_id
      AND  s.active   = true
    ORDER BY s.created_at DESC   -- Si está en varias clínicas, toma la más reciente
    LIMIT 1;

    -- Obtener claims actuales del evento
    v_claims := COALESCE(event -> 'claims', '{}'::jsonb);

    -- Añadir claims si el usuario está en staff
    IF v_clinic_id IS NOT NULL THEN
        v_claims := v_claims
            || jsonb_build_object(
                'clinic_id',  v_clinic_id::text,
                'user_role',  v_role
               );
    END IF;

    -- Devolver el evento con claims actualizados
    RETURN jsonb_set(event, '{claims}', v_claims);

EXCEPTION WHEN OTHERS THEN
    -- Nunca bloquear el login por error del hook
    RETURN event;
END;
$$;

-- Permisos necesarios para que el hook pueda ejecutarse
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.custom_access_token_hook IS
    'Hook de Supabase Auth: añade clinic_id y user_role al JWT de cualquier usuario '
    'registrado en la tabla staff. Requiere registro manual en Dashboard → Auth → Hooks. '
    'Reemplaza la necesidad de actualizar raw_app_meta_data manualmente.';
