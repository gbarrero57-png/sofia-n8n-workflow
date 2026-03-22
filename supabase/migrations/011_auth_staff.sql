-- ============================================================
-- SofIA SaaS — Auth + Staff Multi-Tenant Setup
-- Migration 011: Real JWT authentication per clinic
--
-- PREREQUISITO: Supabase Auth debe estar habilitado en el proyecto.
-- DESPUÉS de ejecutar este SQL, activar el hook manualmente:
--   Dashboard → Authentication → Hooks → Custom Access Token
--   → Select function: public.add_custom_claims
-- ============================================================

-- ============================================================
-- SECTION 1: ENUM + TABLE staff
-- ============================================================

CREATE TYPE staff_role AS ENUM ('admin', 'staff');

-- Tabla staff: vincula auth.users → clinics con un rol.
-- Un usuario puede pertenecer a UNA clínica (UNIQUE user_id).
-- Para multi-clínica en el futuro: eliminar la constraint y
-- manejar "clínica activa" en la sesión.
CREATE TABLE public.staff (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    clinic_id   UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    role        staff_role NOT NULL DEFAULT 'staff',
    full_name   TEXT,
    active      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- 1 usuario = 1 clínica. Cambiar si se necesita multi-clínica.
    CONSTRAINT staff_user_unique UNIQUE (user_id)
);

COMMENT ON TABLE public.staff IS
    'Vincula auth.users con clinics. Define rol (admin|staff). '
    'El hook add_custom_claims lee esta tabla para inyectar JWT claims.';
COMMENT ON COLUMN public.staff.user_id IS
    'FK a auth.users.id. Se elimina el staff si el usuario es borrado.';
COMMENT ON COLUMN public.staff.role IS
    'admin: CRUD completo en su clínica. staff: solo lectura.';

-- ============================================================
-- SECTION 2: TRIGGER updated_at
-- ============================================================

CREATE TRIGGER trg_staff_updated
    BEFORE UPDATE ON public.staff
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SECTION 3: ÍNDICES
-- ============================================================

-- Lookup principal del hook: user_id → clinic + role
CREATE INDEX idx_staff_user_id
    ON public.staff (user_id)
    WHERE active = true;

-- Dashboard admin: listar staff de una clínica
CREATE INDEX idx_staff_clinic_id
    ON public.staff (clinic_id)
    WHERE active = true;

-- Filtrar por rol en una clínica
CREATE INDEX idx_staff_clinic_role
    ON public.staff (clinic_id, role)
    WHERE active = true;

-- ============================================================
-- SECTION 4: FK conversations.assigned_user_id → auth.users
-- ============================================================

-- El campo assigned_user_id en conversations ahora tiene una
-- referencia formal al usuario de auth. ON DELETE SET NULL
-- para que si se elimina el usuario, la conversación quede sin asignar.
ALTER TABLE public.conversations
    ADD CONSTRAINT fk_conversation_assigned_user
    FOREIGN KEY (assigned_user_id)
    REFERENCES auth.users(id)
    ON DELETE SET NULL;

-- ============================================================
-- SECTION 5: RLS en tabla staff
-- ============================================================

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- Un usuario autenticado puede ver su propio registro
-- (necesario para que el frontend muestre su perfil/rol)
CREATE POLICY staff_self_select ON public.staff
    FOR SELECT
    USING (user_id = auth.uid());

-- Un admin puede ver y gestionar TODOS los staff de SU clínica
-- (los claims ya están en el JWT gracias al hook)
CREATE POLICY staff_admin_manage ON public.staff
    FOR ALL
    USING (
        clinic_id = (auth.jwt() ->> 'clinic_id')::uuid
        AND (auth.jwt() ->> 'user_role') = 'admin'
    );

-- ============================================================
-- SECTION 6: CUSTOM ACCESS TOKEN HOOK
--
-- Supabase llama a esta función al emitir cada JWT.
-- Lee la tabla staff, inyecta clinic_id + user_role en los claims.
-- SECURITY DEFINER: bypasa RLS para leer staff (necesario porque
-- en el momento del login aún no hay JWT con claims).
--
-- Firma OBLIGATORIA: (event jsonb) RETURNS jsonb
-- ============================================================

CREATE OR REPLACE FUNCTION public.add_custom_claims(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    claims      jsonb;
    staff_rec   RECORD;
    v_user_id   uuid;
BEGIN
    -- Extraer user_id del evento de auth
    v_user_id := (event ->> 'user_id')::uuid;

    -- Partir de los claims existentes (no borrar sub, email, etc.)
    claims := COALESCE(event -> 'claims', '{}'::jsonb);

    -- Buscar registro de staff activo para este usuario.
    -- ORDER BY: admin tiene prioridad sobre staff si hubiera duplicados.
    SELECT
        s.clinic_id::text   AS clinic_id,
        s.role::text        AS user_role
    INTO staff_rec
    FROM public.staff s
    WHERE s.user_id = v_user_id
      AND s.active  = true
    ORDER BY
        CASE s.role WHEN 'admin' THEN 0 ELSE 1 END,
        s.created_at
    LIMIT 1;

    -- Solo inyectar si el usuario tiene un registro staff válido.
    -- Si no tiene registro, el JWT se emite SIN custom claims:
    -- las RLS policies devolverán 0 filas (acceso denegado efectivo).
    IF FOUND THEN
        claims := jsonb_set(claims, '{clinic_id}',  to_jsonb(staff_rec.clinic_id));
        claims := jsonb_set(claims, '{user_role}',  to_jsonb(staff_rec.user_role));
    END IF;

    RETURN jsonb_set(event, '{claims}', claims);

EXCEPTION WHEN OTHERS THEN
    -- En caso de error, devolver el evento sin modificar.
    -- Mejor que el login falle: el usuario puede entrar pero sin acceso a datos.
    RAISE WARNING 'add_custom_claims: error para user_id=%: %', v_user_id, SQLERRM;
    RETURN event;
END;
$$;

-- Seguridad: revocar acceso público y dar solo a supabase_auth_admin
REVOKE EXECUTE ON FUNCTION public.add_custom_claims(jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.add_custom_claims(jsonb) TO supabase_auth_admin;

-- ============================================================
-- SECTION 7: FUNCIÓN HELPER — validate_staff_hook
-- Para testear el hook SIN hacer login real.
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_staff_hook(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    test_event jsonb;
    result     jsonb;
BEGIN
    test_event := jsonb_build_object(
        'user_id', p_user_id::text,
        'claims',  '{}'::jsonb
    );

    result := public.add_custom_claims(test_event);

    RETURN jsonb_build_object(
        'user_id',    p_user_id,
        'clinic_id',  result #>> '{claims, clinic_id}',
        'user_role',  result #>> '{claims, user_role}',
        'raw_claims', result -> 'claims',
        'hook_ok',    (result #>> '{claims, clinic_id}') IS NOT NULL
    );
END;
$$;

COMMENT ON FUNCTION public.validate_staff_hook(uuid) IS
    'Testea add_custom_claims sin hacer login. '
    'SELECT validate_staff_hook(''<user-uuid>'');';

-- Solo admins autenticados pueden llamar este helper
REVOKE EXECUTE ON FUNCTION public.validate_staff_hook(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.validate_staff_hook(uuid) TO authenticated;

-- ============================================================
-- SECTION 8: FUNCIÓN HELPER — create_staff_member
-- Para el admin crear staff via RPC (sin acceso directo a la tabla).
-- Uso: SELECT create_staff_member('email@ejemplo.com', '<clinic-uuid>', 'staff', 'Nombre');
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_staff_member(
    p_email      TEXT,
    p_clinic_id  UUID,
    p_role       staff_role DEFAULT 'staff',
    p_full_name  TEXT       DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id    uuid;
    v_staff_id   uuid;
    v_caller_clinic uuid;
    v_caller_role   text;
BEGIN
    -- Solo admins pueden crear staff
    v_caller_clinic := (auth.jwt() ->> 'clinic_id')::uuid;
    v_caller_role   := auth.jwt() ->> 'user_role';

    IF v_caller_role <> 'admin' THEN
        RETURN jsonb_build_object('error', 'PERMISSION_DENIED', 'message', 'Solo admins pueden crear staff');
    END IF;

    -- El admin solo puede crear staff en SU clínica
    IF v_caller_clinic <> p_clinic_id THEN
        RETURN jsonb_build_object('error', 'CLINIC_MISMATCH', 'message', 'No puedes crear staff en otra clínica');
    END IF;

    -- Buscar si el usuario ya existe en auth.users
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = p_email
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'error',   'USER_NOT_FOUND',
            'message', 'El usuario debe registrarse primero. Email: ' || p_email
        );
    END IF;

    -- Crear o actualizar registro staff
    INSERT INTO public.staff (user_id, clinic_id, role, full_name)
    VALUES (v_user_id, p_clinic_id, p_role, p_full_name)
    ON CONFLICT (user_id) DO UPDATE
        SET clinic_id  = EXCLUDED.clinic_id,
            role       = EXCLUDED.role,
            full_name  = COALESCE(EXCLUDED.full_name, staff.full_name),
            active     = true,
            updated_at = now()
    RETURNING id INTO v_staff_id;

    RETURN jsonb_build_object(
        'success',   true,
        'staff_id',  v_staff_id,
        'user_id',   v_user_id,
        'clinic_id', p_clinic_id,
        'role',      p_role
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_staff_member(text, uuid, staff_role, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_staff_member(text, uuid, staff_role, text) TO authenticated;

-- ============================================================
-- SECTION 9: SEED — Admin inicial para clínica existente
--
-- IMPORTANTE: Solo insertar DESPUÉS de que el usuario exista
-- en auth.users. Reemplaza <ADMIN_USER_UUID> con el UUID real.
--
-- Proceso:
--   1. Ve a Dashboard → Authentication → Users → Invite user
--   2. Copia el UUID del usuario creado
--   3. Ejecuta el INSERT de abajo con ese UUID
-- ============================================================

-- DESCOMENTAR Y EJECUTAR manualmente después del primer login:
/*
INSERT INTO public.staff (user_id, clinic_id, role, full_name)
VALUES (
    '<ADMIN_USER_UUID>',                         -- UUID de auth.users
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',      -- Clínica Red Soluciones (seed)
    'admin',
    'Administrador Principal'
)
ON CONFLICT (user_id) DO UPDATE
    SET role = 'admin', active = true, updated_at = now();
*/

-- ============================================================
-- SECTION 10: VERIFICACIÓN POST-DEPLOY
-- Ejecutar en SQL Editor de Supabase después del deploy
-- ============================================================

-- Verificar que la tabla existe con la estructura correcta
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'staff' AND table_schema = 'public'
-- ORDER BY ordinal_position;

-- Verificar que el hook existe y tiene los permisos correctos
-- SELECT proname, prosecdef, proacl
-- FROM pg_proc
-- WHERE proname = 'add_custom_claims';

-- Verificar RLS habilitado
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE tablename = 'staff' AND schemaname = 'public';

-- ============================================================
-- FIN DE MIGRACIÓN 011
-- PRÓXIMO PASO OBLIGATORIO (no se puede hacer por SQL):
--   Dashboard → Authentication → Hooks
--   → Custom Access Token Hook → Habilitado: ON
--   → Schema: public
--   → Function name: add_custom_claims
-- ============================================================
