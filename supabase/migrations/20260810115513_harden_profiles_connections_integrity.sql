-- Fail early with an actionable error instead of letting the foreign key emit
-- an opaque deployment failure after locks have already been acquired.
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

-- Keep connector rows tied to real Supabase Auth users.
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

-- The UNIQUE (user_id, connector_id) constraint already provides a left-prefix
-- index for user_id lookups, so no additional index is required.

-- Profile creation and roles are server-managed. Client users may only update
-- their own display name; cargo must never become a self-service authorization claim.
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
    'Administrador',
    'Secretaria',
    'Tesouraria',
    'Professor',
    'Encarregado',
    'Utilizador'
  );

  IF invalid_roles IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot constrain profiles.cargo: unsupported roles exist (%)',
      invalid_roles;
  END IF;
END;
$$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_cargo_valid
  CHECK (
    cargo IN (
      'Administrador',
      'Secretaria',
      'Tesouraria',
      'Professor',
      'Encarregado',
      'Utilizador'
    )
  );

-- Earlier versions accepted untrimmed names. Normalize those rows before the
-- constraint is installed, while preserving NULL for missing/blank names.
UPDATE public.profiles
SET full_name = NULLIF(btrim(full_name), '')
WHERE full_name IS DISTINCT FROM NULLIF(btrim(full_name), '');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE char_length(full_name) > 160
  ) THEN
    RAISE EXCEPTION
      'Cannot constrain profiles.full_name: values longer than 160 characters exist';
  END IF;
END;
$$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_full_name_valid
  CHECK (
    full_name IS NULL
    OR (
      full_name = btrim(full_name)
      AND char_length(full_name) BETWEEN 1 AND 160
    )
  );

ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;

-- Preserve ownership semantics while allowing Postgres to cache auth.uid()
-- once per statement instead of evaluating it for every candidate row.
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

-- SECURITY DEFINER trigger functions belong outside exposed API schemas.
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
    left(
      COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''), NEW.email),
      160
    )
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

DROP FUNCTION public.handle_new_user();

COMMENT ON FUNCTION private.handle_new_user() IS
  'Creates the matching application profile after an Auth user is inserted. Trigger-only; not exposed through the Data API.';

-- Reject malformed connector records before encrypted credentials reach storage.
-- Connector identifiers are not normalized automatically because doing so could
-- collapse two distinct rows into the same unique (user_id, connector_id) key.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.app_user_connections
    WHERE connector_id <> btrim(connector_id)
       OR char_length(connector_id) NOT BETWEEN 1 AND 128
  ) THEN
    RAISE EXCEPTION
      'Cannot constrain app_user_connections.connector_id: untrimmed, empty, or oversized values exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.app_user_connections
    WHERE char_length(btrim(connection_key_ciphertext)) = 0
  ) THEN
    RAISE EXCEPTION
      'Cannot constrain app_user_connections.connection_key_ciphertext: blank values exist';
  END IF;
END;
$$;

ALTER TABLE public.app_user_connections
  ADD CONSTRAINT app_user_connections_connector_id_valid
  CHECK (
    connector_id = btrim(connector_id)
    AND char_length(connector_id) BETWEEN 1 AND 128
  ),
  ADD CONSTRAINT app_user_connections_ciphertext_not_blank
  CHECK (char_length(btrim(connection_key_ciphertext)) > 0);

COMMENT ON TABLE public.app_user_connections IS
  'Server-only reserved store for encrypted per-user connector credentials. No browser role has access; connector workflows must be implemented in trusted server code.';
COMMENT ON COLUMN public.app_user_connections.connection_key_ciphertext IS
  'Reserved for authenticated ciphertext only. Never store plaintext credentials or return this value to clients.';

-- Reusable timestamp trigger for user-owned application tables.
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

COMMENT ON FUNCTION public.set_updated_at() IS
  'Maintains updated_at timestamps for application tables. Execute permission is revoked from client roles.';
