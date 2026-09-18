-- Parte 1: reforço de profiles/app_user_connections
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.app_user_connections AS connection
    LEFT JOIN auth.users AS auth_user ON auth_user.id = connection.user_id
    WHERE auth_user.id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot add app_user_connections user foreign key: orphaned rows exist';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_user_connections_user_id_fkey'
      AND conrelid = 'public.app_user_connections'::regclass
  ) THEN
    ALTER TABLE public.app_user_connections
      ADD CONSTRAINT app_user_connections_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES auth.users(id)
      ON DELETE CASCADE;
  END IF;
END;
$$;

ALTER TABLE public.profiles
  ALTER COLUMN cargo SET DEFAULT 'Utilizador';

DO $$
DECLARE
  invalid_roles text;
BEGIN
  SELECT string_agg(DISTINCT cargo, ', ' ORDER BY cargo)
  INTO invalid_roles
  FROM public.profiles
  WHERE cargo NOT IN (
    'Administrador','Secretaria','Tesouraria','Professor','Encarregado','Utilizador'
  );

  IF invalid_roles IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot constrain profiles.cargo: unsupported roles exist (%)', invalid_roles;
  END IF;
END;
$$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_cargo_valid
  CHECK (
    cargo IN ('Administrador','Secretaria','Tesouraria','Professor','Encarregado','Utilizador')
  );

UPDATE public.profiles
SET full_name = NULLIF(btrim(full_name), '')
WHERE full_name IS DISTINCT FROM NULLIF(btrim(full_name), '');

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_full_name_valid
  CHECK (
    full_name IS NULL
    OR (full_name = btrim(full_name) AND char_length(full_name) BETWEEN 1 AND 160)
  );

ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    left(COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''), NEW.email), 160)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.handle_new_user();

DROP FUNCTION IF EXISTS public.handle_new_user();

ALTER TABLE public.app_user_connections
  ADD CONSTRAINT app_user_connections_connector_id_valid
  CHECK (
    connector_id = btrim(connector_id)
    AND char_length(connector_id) BETWEEN 1 AND 128
  ),
  ADD CONSTRAINT app_user_connections_ciphertext_not_blank
  CHECK (char_length(btrim(connection_key_ciphertext)) > 0);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_app_user_connections_updated_at ON public.app_user_connections;
CREATE TRIGGER set_app_user_connections_updated_at
  BEFORE UPDATE ON public.app_user_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Parte 2: fundação (escola, anexos, auditoria)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TABLE public.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_name text,
  nif text,
  email text,
  phone text,
  address text,
  academic_year text,
  currency text NOT NULL DEFAULT 'AOA',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

INSERT INTO public.schools (name) VALUES ('Minha Escola');

CREATE OR REPLACE FUNCTION public.set_updated_at_and_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.created_by = OLD.created_by;
  NEW.updated_by = COALESCE((SELECT auth.uid()), NEW.updated_by);
  NEW.updated_at = now();
  NEW.version = COALESCE(OLD.version, 0) + 1;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_updated_at_and_version() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER schools_set_updated_at
  BEFORE UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

ALTER TABLE public.profiles ADD COLUMN school_id uuid REFERENCES public.schools(id);

UPDATE public.profiles
SET school_id = (SELECT id FROM public.schools ORDER BY created_at LIMIT 1)
WHERE school_id IS NULL;

CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, school_id)
  VALUES (
    NEW.id,
    left(COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''), NEW.email), 160),
    (SELECT id FROM public.schools ORDER BY created_at LIMIT 1)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.handle_new_user() FROM anon, authenticated, PUBLIC;

CREATE OR REPLACE FUNCTION public.current_school_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT school_id FROM public.profiles WHERE id = (SELECT auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION public.current_school_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_school_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT cargo FROM public.profiles WHERE id = (SELECT auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION public.current_profile_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_role() TO authenticated;

-- Helper de pertença usado pelas policies dos módulos seguintes.
CREATE OR REPLACE FUNCTION public.is_school_member(p_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT p_school_id IS NOT NULL
     AND p_school_id = (SELECT public.current_school_id());
$$;

REVOKE EXECUTE ON FUNCTION public.is_school_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_school_member(uuid) TO authenticated, service_role;

GRANT SELECT ON public.schools TO authenticated;
GRANT ALL ON public.schools TO service_role;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schools FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own school" ON public.schools
  FOR SELECT TO authenticated USING (id = (SELECT public.current_school_id()));

CREATE TABLE public.attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  owner_type text NOT NULL,
  owner_id uuid NOT NULL,
  category text,
  bucket text NOT NULL DEFAULT 'attachments',
  path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX attachments_owner_idx ON public.attachments (school_id, owner_type, owner_id) WHERE deleted_at IS NULL;

CREATE TRIGGER attachments_set_updated_at
  BEFORE UPDATE ON public.attachments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

GRANT SELECT ON public.attachments TO authenticated;
GRANT INSERT (
  school_id, owner_type, owner_id, category, bucket, path, file_name,
  mime_type, size_bytes, created_by
) ON public.attachments TO authenticated;
GRANT UPDATE (
  category, path, file_name, mime_type, size_bytes, updated_by, deleted_at
) ON public.attachments TO authenticated;
GRANT ALL ON public.attachments TO service_role;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments FORCE ROW LEVEL SECURITY;

CREATE POLICY "Read attachments in own school" ON public.attachments
  FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Secretaria')
  );
CREATE POLICY "Create attachments in own school" ON public.attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Secretaria')
  );
CREATE POLICY "Update attachments in own school" ON public.attachments
  FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Secretaria')
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND updated_by = (SELECT auth.uid())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Secretaria')
  );

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  reason text,
  before_data jsonb,
  after_data jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_entity_idx ON public.audit_logs (school_id, entity_type, entity_id);
CREATE INDEX audit_logs_actor_idx ON public.audit_logs (school_id, actor_id);

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY "Read audit logs of own school" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) = 'Administrador'
  );
