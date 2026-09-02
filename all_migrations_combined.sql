-- ============================================================
-- MIGRATION: 20260809200135_3438a1c4-be84-444a-a21a-bfaeefe940b0.sql
-- ============================================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  cargo text NOT NULL DEFAULT 'Administrador',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.app_user_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connector_id text NOT NULL,
  connection_key_ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, connector_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_user_connections TO service_role;
ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- MIGRATION: 20260809200146_4236f4a3-4298-4845-ac87-2190c22ec1cd.sql
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;

-- ============================================================
-- MIGRATION: 20260810072425_f2400ab4-e35b-4c94-a714-1a52d424e831.sql
-- ============================================================
-- Harden public.app_user_connections: strictly server-only, explicit deny-all for client roles.
ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_user_connections FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.app_user_connections FROM anon;
REVOKE ALL ON public.app_user_connections FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_user_connections TO service_role;

DROP POLICY IF EXISTS "No client access to connection credentials" ON public.app_user_connections;
CREATE POLICY "No client access to connection credentials"
  ON public.app_user_connections
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.app_user_connections IS
  'Server-only store of encrypted per-user connector keys. Deny-all for anon/authenticated by design: rows are read and written exclusively by server functions using the service role. Never expose connection_key_ciphertext to browser clients.';
COMMENT ON COLUMN public.app_user_connections.connection_key_ciphertext IS
  'AES-256-GCM ciphertext of the per-user connector key. Never returned to clients.';

-- ============================================================
-- MIGRATION: 20260810115513_harden_profiles_connections_integrity.sql
-- ============================================================
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


-- ============================================================
-- MIGRATION: 20260810122022_foundation_schema.sql
-- ============================================================
-- Fundação para os módulos Pessoas/Alunos: extensões de pesquisa, escola única,
-- anexos e auditoria genéricos, e o padrão de trigger reutilizável para updated_at/version.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ---------------------------------------------------------------------------
-- schools: uma linha por instalação (sem camada de tenants/organizações).
-- Todas as tabelas de domínio a partir daqui referenciam schools(id).
-- ---------------------------------------------------------------------------
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

COMMENT ON TABLE public.schools IS
  'Escola única desta instalação. Nome/dados reais preenchidos pelo administrador em Configurações — a linha inicial é só o placeholder necessário para o school_id existir.';

INSERT INTO public.schools (name) VALUES ('Minha Escola');

-- ---------------------------------------------------------------------------
-- Trigger utilitário: updated_at + controlo de concorrência optimista (version).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- profiles ganha school_id (só há uma escola, mas fica pronto para mais).
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN school_id uuid REFERENCES public.schools(id);

UPDATE public.profiles
SET school_id = (SELECT id FROM public.schools ORDER BY created_at LIMIT 1)
WHERE school_id IS NULL;

ALTER TABLE public.profiles ALTER COLUMN school_id SET NOT NULL;

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
    left(
      COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''), NEW.email),
      160
    ),
    (SELECT id FROM public.schools ORDER BY created_at LIMIT 1)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.handle_new_user() FROM anon, authenticated, PUBLIC;

-- ---------------------------------------------------------------------------
-- current_school_id(): helper de RLS reutilizado por todas as tabelas novas.
-- SECURITY INVOKER — cada utilizador só lê a sua própria linha em profiles,
-- já permitido pela policy "Users can view their own profile".
-- ---------------------------------------------------------------------------
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

GRANT SELECT ON public.schools TO authenticated;
GRANT ALL ON public.schools TO service_role;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schools FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own school" ON public.schools
  FOR SELECT TO authenticated USING (id = (SELECT public.current_school_id()));

-- ---------------------------------------------------------------------------
-- attachments: ficheiros genéricos ligados polimorficamente a qualquer entidade
-- (owner_type/owner_id) — usado por documentos de pessoas, alunos, etc.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- audit_logs: registo de auditoria genérico, apenas leitura/escrita — nunca
-- UPDATE/DELETE (sem policy para isso == negado por omissão). Histórico permanente.
-- ---------------------------------------------------------------------------
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

COMMENT ON TABLE public.audit_logs IS
  'Histórico permanente gravado somente por código servidor confiável. Clientes não podem inserir, editar ou apagar eventos; administradores podem consultar os eventos da própria escola.';


-- ============================================================
-- MIGRATION: 20260810122220_people_module.sql
-- ============================================================
-- Módulo Pessoas: entidade central. Um único registo de pessoa pode acumular
-- vários papéis (aluno, encarregado, professor, ...) via person_roles — nunca duplicar.

-- unaccent() não é IMMUTABLE por si só (depende do dicionário) — wrapper para
-- poder ser usado em índices de expressão e nas funções de pesquisa abaixo.
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT public.unaccent('public.unaccent', $1);
$$;

REVOKE EXECUTE ON FUNCTION public.immutable_unaccent(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.immutable_unaccent(text) TO authenticated;

CREATE TABLE public.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  internal_code text,
  full_name text NOT NULL,
  first_name text,
  last_name text,
  preferred_name text,
  photo_url text,
  sex text CHECK (sex IN ('M', 'F', 'outro')),
  birth_date date,
  marital_status text,
  nationality text,
  birth_place text,
  province text,
  municipality text,
  commune text,
  address text,
  phone_primary text,
  phone_alternative text,
  whatsapp text,
  email text,
  nif text,
  profession text,
  religion text,
  special_needs text,
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX people_school_internal_code_idx ON public.people (school_id, internal_code)
  WHERE deleted_at IS NULL AND internal_code IS NOT NULL;
CREATE UNIQUE INDEX people_school_nif_idx ON public.people (school_id, nif)
  WHERE deleted_at IS NULL AND nif IS NOT NULL;
CREATE INDEX people_full_name_trgm_idx ON public.people
  USING gin (public.immutable_unaccent(lower(full_name)) gin_trgm_ops);
CREATE INDEX people_school_status_idx ON public.people (school_id, status) WHERE deleted_at IS NULL;

CREATE TRIGGER people_set_updated_at
  BEFORE UPDATE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

GRANT SELECT, INSERT, UPDATE ON public.people TO authenticated;
GRANT ALL ON public.people TO service_role;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read people in own school" ON public.people
  FOR SELECT TO authenticated USING (school_id = (SELECT public.current_school_id()));
CREATE POLICY "Create people in own school" ON public.people
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
  );
CREATE POLICY "Update people in own school" ON public.people
  FOR UPDATE TO authenticated
  USING (school_id = (SELECT public.current_school_id()))
  WITH CHECK (school_id = (SELECT public.current_school_id()));

-- ---------------------------------------------------------------------------
-- person_documents: BI/passaporte/cédula — únicos por tipo+número dentro da escola.
-- ---------------------------------------------------------------------------
CREATE TABLE public.person_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('bi', 'passaporte', 'cedula', 'outro')),
  document_number text NOT NULL,
  issued_at date,
  expires_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX person_documents_school_number_idx ON public.person_documents (school_id, document_type, document_number)
  WHERE deleted_at IS NULL;
CREATE INDEX person_documents_person_idx ON public.person_documents (person_id) WHERE deleted_at IS NULL;

CREATE TRIGGER person_documents_set_updated_at
  BEFORE UPDATE ON public.person_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

GRANT SELECT, INSERT, UPDATE ON public.person_documents TO authenticated;
GRANT ALL ON public.person_documents TO service_role;
ALTER TABLE public.person_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read person documents in own school" ON public.person_documents
  FOR SELECT TO authenticated USING (school_id = (SELECT public.current_school_id()));
CREATE POLICY "Create person documents in own school" ON public.person_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
  );
CREATE POLICY "Update person documents in own school" ON public.person_documents
  FOR UPDATE TO authenticated
  USING (school_id = (SELECT public.current_school_id()))
  WITH CHECK (school_id = (SELECT public.current_school_id()));

-- ---------------------------------------------------------------------------
-- person_roles: os papéis que uma pessoa acumula (aluno, encarregado, ...).
-- ---------------------------------------------------------------------------
CREATE TABLE public.person_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN (
    'aluno', 'encarregado', 'professor', 'funcionario', 'diretor',
    'coordenador', 'utilizador', 'fornecedor', 'contacto_institucional'
  )),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  UNIQUE (person_id, role)
);

CREATE INDEX person_roles_school_role_idx ON public.person_roles (school_id, role) WHERE active AND deleted_at IS NULL;

CREATE TRIGGER person_roles_set_updated_at
  BEFORE UPDATE ON public.person_roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

GRANT SELECT, INSERT, UPDATE ON public.person_roles TO authenticated;
GRANT ALL ON public.person_roles TO service_role;
ALTER TABLE public.person_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read person roles in own school" ON public.person_roles
  FOR SELECT TO authenticated USING (school_id = (SELECT public.current_school_id()));
CREATE POLICY "Create person roles in own school" ON public.person_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
  );
CREATE POLICY "Update person roles in own school" ON public.person_roles
  FOR UPDATE TO authenticated
  USING (school_id = (SELECT public.current_school_id()))
  WITH CHECK (school_id = (SELECT public.current_school_id()));

-- ---------------------------------------------------------------------------
-- person_relationships: pai/mãe/encarregado/tutor/cônjuge/... entre duas pessoas.
-- ---------------------------------------------------------------------------
CREATE TABLE public.person_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  related_person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  relationship_type text NOT NULL CHECK (relationship_type IN (
    'pai', 'mae', 'encarregado', 'tutor', 'conjuge', 'irmao',
    'contacto_emergencia', 'responsavel_financeiro', 'responsavel_autorizado_buscar'
  )),
  priority integer,
  authorized boolean NOT NULL DEFAULT true,
  valid_from date,
  valid_until date,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CHECK (person_id <> related_person_id)
);

CREATE INDEX person_relationships_person_idx ON public.person_relationships (person_id) WHERE deleted_at IS NULL;
CREATE INDEX person_relationships_related_idx ON public.person_relationships (related_person_id) WHERE deleted_at IS NULL;

CREATE TRIGGER person_relationships_set_updated_at
  BEFORE UPDATE ON public.person_relationships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

GRANT SELECT, INSERT, UPDATE ON public.person_relationships TO authenticated;
GRANT ALL ON public.person_relationships TO service_role;
ALTER TABLE public.person_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read person relationships in own school" ON public.person_relationships
  FOR SELECT TO authenticated USING (school_id = (SELECT public.current_school_id()));
CREATE POLICY "Create person relationships in own school" ON public.person_relationships
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
  );
CREATE POLICY "Update person relationships in own school" ON public.person_relationships
  FOR UPDATE TO authenticated
  USING (school_id = (SELECT public.current_school_id()))
  WITH CHECK (school_id = (SELECT public.current_school_id()));

-- ---------------------------------------------------------------------------
-- person_school_links: liga uma pessoa a uma escola antes de ter um papel
-- formal (ex.: encarregado pré-registado antes do aluno estar matriculado).
-- ---------------------------------------------------------------------------
CREATE TABLE public.person_school_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  link_type text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  UNIQUE (school_id, person_id)
);

CREATE TRIGGER person_school_links_set_updated_at
  BEFORE UPDATE ON public.person_school_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

GRANT SELECT, INSERT, UPDATE ON public.person_school_links TO authenticated;
GRANT ALL ON public.person_school_links TO service_role;
ALTER TABLE public.person_school_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read person school links in own school" ON public.person_school_links
  FOR SELECT TO authenticated USING (school_id = (SELECT public.current_school_id()));
CREATE POLICY "Create person school links in own school" ON public.person_school_links
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
  );
CREATE POLICY "Update person school links in own school" ON public.person_school_links
  FOR UPDATE TO authenticated
  USING (school_id = (SELECT public.current_school_id()))
  WITH CHECK (school_id = (SELECT public.current_school_id()));

-- ---------------------------------------------------------------------------
-- Pesquisa fuzzy (pg_trgm) — usada pela pesquisa livre em /pessoas.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_people(p_query text, p_limit integer DEFAULT 20)
RETURNS SETOF public.people
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT *
  FROM public.people
  WHERE school_id = (SELECT public.current_school_id())
    AND deleted_at IS NULL
    AND (
      btrim(p_query) = ''
      OR public.immutable_unaccent(lower(full_name))
        OPERATOR(public.%) public.immutable_unaccent(lower(p_query))
      OR lower(coalesce(email, '')) = lower(p_query)
      OR phone_primary = p_query
      OR nif = p_query
    )
  ORDER BY
    CASE WHEN btrim(p_query) = '' THEN 0 ELSE public.similarity(
      public.immutable_unaccent(lower(full_name)),
      public.immutable_unaccent(lower(p_query))
    ) END DESC,
    full_name
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
$$;

REVOKE EXECUTE ON FUNCTION public.search_people(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_people(text, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- Deteção de duplicados — nunca bloqueia, devolve candidatos com o motivo do
-- match para o utilizador decidir (ver 3.3 do prompt original).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_person_duplicates(
  p_full_name text,
  p_birth_date date DEFAULT NULL,
  p_document_number text DEFAULT NULL,
  p_nif text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL
)
RETURNS TABLE (person_id uuid, full_name text, match_reason text, score real)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH candidates AS (
    SELECT p.id, p.full_name, 'documento'::text AS match_reason, 1.0::real AS score
    FROM public.person_documents pd
    JOIN public.people p ON p.id = pd.person_id
    WHERE pd.school_id = (SELECT public.current_school_id())
      AND pd.deleted_at IS NULL
      AND p_document_number IS NOT NULL
      AND pd.document_number = p_document_number

    UNION ALL
    SELECT p.id, p.full_name, 'nif', 1.0
    FROM public.people p
    WHERE p.school_id = (SELECT public.current_school_id())
      AND p.deleted_at IS NULL
      AND p_nif IS NOT NULL
      AND p.nif = p_nif

    UNION ALL
    SELECT p.id, p.full_name, 'telefone', 0.9
    FROM public.people p
    WHERE p.school_id = (SELECT public.current_school_id())
      AND p.deleted_at IS NULL
      AND p_phone IS NOT NULL
      AND p_phone IN (p.phone_primary, p.phone_alternative, p.whatsapp)

    UNION ALL
    SELECT p.id, p.full_name, 'email', 0.9
    FROM public.people p
    WHERE p.school_id = (SELECT public.current_school_id())
      AND p.deleted_at IS NULL
      AND p_email IS NOT NULL
      AND lower(p.email) = lower(p_email)

    UNION ALL
    SELECT p.id, p.full_name, 'nome_data_nascimento', 0.85
    FROM public.people p
    WHERE p.school_id = (SELECT public.current_school_id())
      AND p.deleted_at IS NULL
      AND p_birth_date IS NOT NULL
      AND p.birth_date = p_birth_date
      AND public.immutable_unaccent(lower(p.full_name))
        OPERATOR(public.%) public.immutable_unaccent(lower(p_full_name))

    UNION ALL
    SELECT p.id, p.full_name, 'nome_similar',
      public.similarity(
        public.immutable_unaccent(lower(p.full_name)),
        public.immutable_unaccent(lower(p_full_name))
      )
    FROM public.people p
    WHERE p.school_id = (SELECT public.current_school_id())
      AND p.deleted_at IS NULL
      AND public.immutable_unaccent(lower(p.full_name))
        OPERATOR(public.%) public.immutable_unaccent(lower(p_full_name))
  )
  SELECT DISTINCT ON (id) id AS person_id, full_name, match_reason, score
  FROM candidates
  ORDER BY id, score DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.find_person_duplicates(text, date, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_person_duplicates(text, date, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- mergePeople: mescla duas pessoas duplicadas sem apagar histórico — reaponta
-- FKs da duplicada para a sobrevivente e arquiva a duplicada (nunca elimina).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_people(p_survivor_id uuid, p_duplicate_id uuid, p_reason text)
RETURNS public.people
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school_id uuid;
  v_survivor public.people;
BEGIN
  IF NOT COALESCE((SELECT public.can_manage_students()), false) THEN
    RAISE EXCEPTION 'insufficient permissions to merge people' USING ERRCODE = '42501';
  END IF;

  IF p_survivor_id = p_duplicate_id THEN
    RAISE EXCEPTION 'survivor and duplicate must be different people';
  END IF;

  SELECT school_id INTO v_school_id FROM public.people WHERE id = p_survivor_id;
  IF v_school_id IS NULL OR v_school_id <> (SELECT public.current_school_id()) THEN
    RAISE EXCEPTION 'person not found in current school';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.people WHERE id = p_duplicate_id AND school_id = v_school_id) THEN
    RAISE EXCEPTION 'duplicate person not found in current school';
  END IF;

  UPDATE public.person_documents SET person_id = p_survivor_id WHERE person_id = p_duplicate_id;
  UPDATE public.person_roles SET person_id = p_survivor_id WHERE person_id = p_duplicate_id
    AND NOT EXISTS (
      SELECT 1 FROM public.person_roles existing
      WHERE existing.person_id = p_survivor_id AND existing.role = public.person_roles.role
    );
  UPDATE public.person_relationships SET person_id = p_survivor_id WHERE person_id = p_duplicate_id;
  UPDATE public.person_relationships SET related_person_id = p_survivor_id WHERE related_person_id = p_duplicate_id;
  UPDATE public.person_school_links SET person_id = p_survivor_id WHERE person_id = p_duplicate_id
    AND NOT EXISTS (
      SELECT 1 FROM public.person_school_links existing
      WHERE existing.person_id = p_survivor_id AND existing.school_id = public.person_school_links.school_id
    );
  UPDATE public.attachments SET owner_id = p_survivor_id WHERE owner_type = 'person' AND owner_id = p_duplicate_id;

  UPDATE public.people
  SET status = 'archived', updated_by = (SELECT auth.uid()), notes = coalesce(notes, '') || format(E'\n[merged into %s: %s]', p_survivor_id, p_reason)
  WHERE id = p_duplicate_id;

  SELECT * INTO v_survivor FROM public.people WHERE id = p_survivor_id;
  RETURN v_survivor;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.merge_people(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_people(uuid, uuid, text) TO authenticated;

-- Required only by the manager-only merge workflow; RLS still limits the row
-- to the current school and the attachment type itself remains immutable.
GRANT UPDATE (owner_id) ON public.attachments TO authenticated;

-- ---------------------------------------------------------------------------
-- create_person: cria a pessoa e (opcionalmente) documentos/papéis/relações
-- na mesma transação — nunca fica um registo activo a meio, e a decisão sobre
-- duplicados encontrados (p_duplicate_decision) fica sempre na auditoria.
-- SECURITY INVOKER: every write remains subject to the caller's RLS policies.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_person(
  p_person jsonb,
  p_roles text[] DEFAULT '{}',
  p_documents jsonb DEFAULT '[]'::jsonb,
  p_relationships jsonb DEFAULT '[]'::jsonb,
  p_duplicate_decision text DEFAULT NULL
)
RETURNS public.people
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school_id uuid := (SELECT public.current_school_id());
  v_person public.people;
  v_role text;
  v_doc jsonb;
  v_rel jsonb;
BEGIN
  IF NOT COALESCE((SELECT public.can_manage_students()), false) THEN
    RAISE EXCEPTION 'insufficient permissions to create person' USING ERRCODE = '42501';
  END IF;

  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'no school associated with current user';
  END IF;

  PERFORM set_config('app.audit_reason', COALESCE(p_duplicate_decision, ''), true);

  INSERT INTO public.people (
    school_id, full_name, first_name, last_name, preferred_name, photo_url, sex, birth_date,
    marital_status, nationality, birth_place, province, municipality, commune, address,
    phone_primary, phone_alternative, whatsapp, email, nif, profession, religion, special_needs,
    notes, created_by
  )
  SELECT
    v_school_id,
    p_person ->> 'full_name',
    p_person ->> 'first_name',
    p_person ->> 'last_name',
    p_person ->> 'preferred_name',
    p_person ->> 'photo_url',
    p_person ->> 'sex',
    NULLIF(p_person ->> 'birth_date', '')::date,
    p_person ->> 'marital_status',
    p_person ->> 'nationality',
    p_person ->> 'birth_place',
    p_person ->> 'province',
    p_person ->> 'municipality',
    p_person ->> 'commune',
    p_person ->> 'address',
    p_person ->> 'phone_primary',
    p_person ->> 'phone_alternative',
    p_person ->> 'whatsapp',
    p_person ->> 'email',
    p_person ->> 'nif',
    p_person ->> 'profession',
    p_person ->> 'religion',
    p_person ->> 'special_needs',
    p_person ->> 'notes',
    (SELECT auth.uid())
  RETURNING * INTO v_person;

  PERFORM set_config('app.audit_reason', '', true);

  FOREACH v_role IN ARRAY p_roles LOOP
    INSERT INTO public.person_roles (school_id, person_id, role, created_by)
    VALUES (v_school_id, v_person.id, v_role, (SELECT auth.uid()));
  END LOOP;

  FOR v_doc IN SELECT * FROM jsonb_array_elements(p_documents) LOOP
    INSERT INTO public.person_documents (school_id, person_id, document_type, document_number, issued_at, expires_at, created_by)
    VALUES (
      v_school_id, v_person.id,
      v_doc ->> 'document_type', v_doc ->> 'document_number',
      NULLIF(v_doc ->> 'issued_at', '')::date, NULLIF(v_doc ->> 'expires_at', '')::date,
      (SELECT auth.uid())
    );
  END LOOP;

  FOR v_rel IN SELECT * FROM jsonb_array_elements(p_relationships) LOOP
    INSERT INTO public.person_relationships (
      school_id, person_id, related_person_id, relationship_type, priority, authorized,
      valid_from, valid_until, notes, created_by
    )
    VALUES (
      v_school_id, v_person.id, (v_rel ->> 'related_person_id')::uuid, v_rel ->> 'relationship_type',
      NULLIF(v_rel ->> 'priority', '')::integer,
      COALESCE((v_rel ->> 'authorized')::boolean, true),
      NULLIF(v_rel ->> 'valid_from', '')::date, NULLIF(v_rel ->> 'valid_until', '')::date,
      v_rel ->> 'notes', (SELECT auth.uid())
    );
  END LOOP;

  RETURN v_person;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_person(jsonb, text[], jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_person(jsonb, text[], jsonb, jsonb, text) TO authenticated;

-- Reusable, school-scoped academic directory. Stable codes are stored in
-- English while user-facing labels remain configurable Portuguese text.

CREATE OR REPLACE FUNCTION public.can_read_students()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT public.current_profile_role()) IN ('Administrador', 'Secretaria'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_students()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT public.current_profile_role()) IN ('Administrador', 'Secretaria'),
    false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_read_students() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_students() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_students() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_students() TO authenticated;

CREATE TABLE public.academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'closed', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT academic_years_dates_valid CHECK (starts_on < ends_on),
  CONSTRAINT academic_years_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT academic_years_school_code_key UNIQUE (school_id, code)
);

CREATE UNIQUE INDEX academic_years_one_active_per_school_idx
  ON public.academic_years (school_id)
  WHERE status = 'active' AND deleted_at IS NULL;

CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT courses_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT courses_school_code_key UNIQUE (school_id, code)
);

CREATE TABLE public.grade_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  sort_order smallint NOT NULL CHECK (sort_order BETWEEN 1 AND 99),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT grade_levels_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT grade_levels_school_code_key UNIQUE (school_id, code),
  CONSTRAINT grade_levels_school_sort_key UNIQUE (school_id, sort_order)
);

CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT rooms_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT rooms_school_code_key UNIQUE (school_id, code)
);

ALTER TABLE public.people
  ADD CONSTRAINT people_school_id_id_key UNIQUE (school_id, id),
  ADD CONSTRAINT people_full_name_valid CHECK (
    full_name = btrim(full_name) AND char_length(full_name) BETWEEN 2 AND 160
  ),
  ADD CONSTRAINT people_birth_date_valid CHECK (
    birth_date IS NULL OR birth_date >= DATE '1900-01-01'
  ),
  ADD CONSTRAINT people_email_valid CHECK (
    email IS NULL OR email = btrim(email) AND char_length(email) BETWEEN 3 AND 254
  );

CREATE OR REPLACE FUNCTION private.validate_person_birth_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.birth_date IS NOT NULL AND NEW.birth_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'birth_date cannot be in the future';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.validate_person_birth_date() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER people_validate_birth_date
  BEFORE INSERT OR UPDATE OF birth_date ON public.people
  FOR EACH ROW EXECUTE FUNCTION private.validate_person_birth_date();

CREATE INDEX people_school_phone_idx
  ON public.people (school_id, phone_primary)
  WHERE phone_primary IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX people_school_email_idx
  ON public.people (school_id, lower(email))
  WHERE email IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  person_id uuid NOT NULL,
  registration_number text NOT NULL CHECK (
    registration_number = btrim(registration_number)
    AND char_length(registration_number) BETWEEN 1 AND 64
  ),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'transferred', 'graduated')),
  admitted_on date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT students_school_person_fkey
    FOREIGN KEY (school_id, person_id)
    REFERENCES public.people (school_id, id),
  CONSTRAINT students_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT students_school_registration_key UNIQUE (school_id, registration_number),
  CONSTRAINT students_school_person_key UNIQUE (school_id, person_id)
);

CREATE INDEX students_school_status_idx
  ON public.students (school_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX students_registration_search_idx
  ON public.students USING gin (registration_number gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE TABLE public.student_guardians (
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  guardian_person_id uuid NOT NULL,
  relationship text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  authorized_pickup boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  PRIMARY KEY (student_id, guardian_person_id),
  CONSTRAINT student_guardians_student_fkey
    FOREIGN KEY (school_id, student_id)
    REFERENCES public.students (school_id, id) ON DELETE CASCADE,
  CONSTRAINT student_guardians_person_fkey
    FOREIGN KEY (school_id, guardian_person_id)
    REFERENCES public.people (school_id, id)
);

CREATE UNIQUE INDEX student_guardians_one_primary_idx
  ON public.student_guardians (student_id)
  WHERE is_primary;
CREATE INDEX student_guardians_person_idx
  ON public.student_guardians (school_id, guardian_person_id);

CREATE TABLE public.class_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL,
  course_id uuid NOT NULL,
  grade_level_id uuid NOT NULL,
  room_id uuid,
  code text NOT NULL,
  name text NOT NULL,
  shift text NOT NULL CHECK (shift IN ('morning', 'afternoon', 'evening')),
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT class_groups_year_fkey FOREIGN KEY (school_id, academic_year_id)
    REFERENCES public.academic_years (school_id, id),
  CONSTRAINT class_groups_course_fkey FOREIGN KEY (school_id, course_id)
    REFERENCES public.courses (school_id, id),
  CONSTRAINT class_groups_grade_fkey FOREIGN KEY (school_id, grade_level_id)
    REFERENCES public.grade_levels (school_id, id),
  CONSTRAINT class_groups_room_fkey FOREIGN KEY (school_id, room_id)
    REFERENCES public.rooms (school_id, id),
  CONSTRAINT class_groups_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT class_groups_school_year_code_key UNIQUE (school_id, academic_year_id, code)
);

CREATE INDEX class_groups_directory_idx
  ON public.class_groups (school_id, academic_year_id, grade_level_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX class_groups_course_idx
  ON public.class_groups (school_id, course_id);
CREATE INDEX class_groups_grade_idx
  ON public.class_groups (school_id, grade_level_id);
CREATE INDEX class_groups_room_idx
  ON public.class_groups (school_id, room_id)
  WHERE room_id IS NOT NULL;

CREATE TABLE public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  class_group_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'cancelled', 'completed', 'transferred')),
  payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('settled', 'pending', 'overdue')),
  enrolled_on date NOT NULL DEFAULT CURRENT_DATE,
  final_average numeric(4,2) CHECK (final_average BETWEEN 0 AND 20),
  attendance_rate numeric(5,2) CHECK (attendance_rate BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT enrollments_student_fkey FOREIGN KEY (school_id, student_id)
    REFERENCES public.students (school_id, id),
  CONSTRAINT enrollments_year_fkey FOREIGN KEY (school_id, academic_year_id)
    REFERENCES public.academic_years (school_id, id),
  CONSTRAINT enrollments_group_fkey FOREIGN KEY (school_id, class_group_id)
    REFERENCES public.class_groups (school_id, id),
  CONSTRAINT enrollments_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT enrollments_student_year_key UNIQUE (student_id, academic_year_id)
);

CREATE INDEX enrollments_active_directory_idx
  ON public.enrollments (school_id, academic_year_id, class_group_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX enrollments_group_idx
  ON public.enrollments (school_id, class_group_id);
CREATE UNIQUE INDEX enrollments_one_current_per_student_idx
  ON public.enrollments (student_id)
  WHERE status IN ('pending', 'active') AND deleted_at IS NULL;

-- Harden the prebuilt People tables before sharing the same authorization model.
ALTER TABLE public.people ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.person_documents ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.person_roles ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.person_relationships ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.person_school_links ALTER COLUMN created_by SET DEFAULT auth.uid();

ALTER TABLE public.person_documents
  DROP CONSTRAINT person_documents_person_id_fkey,
  ADD CONSTRAINT person_documents_school_person_fkey
    FOREIGN KEY (school_id, person_id) REFERENCES public.people (school_id, id) ON DELETE CASCADE;
ALTER TABLE public.person_roles
  DROP CONSTRAINT person_roles_person_id_fkey,
  ADD CONSTRAINT person_roles_school_person_fkey
    FOREIGN KEY (school_id, person_id) REFERENCES public.people (school_id, id) ON DELETE CASCADE;
ALTER TABLE public.person_relationships
  DROP CONSTRAINT person_relationships_person_id_fkey,
  DROP CONSTRAINT person_relationships_related_person_id_fkey,
  ADD CONSTRAINT person_relationships_school_person_fkey
    FOREIGN KEY (school_id, person_id) REFERENCES public.people (school_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT person_relationships_school_related_fkey
    FOREIGN KEY (school_id, related_person_id) REFERENCES public.people (school_id, id) ON DELETE CASCADE;
ALTER TABLE public.person_school_links
  DROP CONSTRAINT person_school_links_person_id_fkey,
  ADD CONSTRAINT person_school_links_school_person_fkey
    FOREIGN KEY (school_id, person_id) REFERENCES public.people (school_id, id) ON DELETE CASCADE;

DROP POLICY "Read people in own school" ON public.people;
DROP POLICY "Create people in own school" ON public.people;
DROP POLICY "Update people in own school" ON public.people;
DROP POLICY "Read person documents in own school" ON public.person_documents;
DROP POLICY "Create person documents in own school" ON public.person_documents;
DROP POLICY "Update person documents in own school" ON public.person_documents;
DROP POLICY "Read person roles in own school" ON public.person_roles;
DROP POLICY "Create person roles in own school" ON public.person_roles;
DROP POLICY "Update person roles in own school" ON public.person_roles;
DROP POLICY "Read person relationships in own school" ON public.person_relationships;
DROP POLICY "Create person relationships in own school" ON public.person_relationships;
DROP POLICY "Update person relationships in own school" ON public.person_relationships;
DROP POLICY "Read person school links in own school" ON public.person_school_links;
DROP POLICY "Create person school links in own school" ON public.person_school_links;
DROP POLICY "Update person school links in own school" ON public.person_school_links;

ALTER TABLE public.people FORCE ROW LEVEL SECURITY;
ALTER TABLE public.person_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.person_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.person_relationships FORCE ROW LEVEL SECURITY;
ALTER TABLE public.person_school_links FORCE ROW LEVEL SECURITY;

-- Every mutable domain table shares optimistic concurrency and fresh timestamps.
CREATE TRIGGER academic_years_set_updated_at BEFORE UPDATE ON public.academic_years
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER courses_set_updated_at BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER grade_levels_set_updated_at BEFORE UPDATE ON public.grade_levels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER rooms_set_updated_at BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER students_set_updated_at BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER student_guardians_set_updated_at BEFORE UPDATE ON public.student_guardians
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER class_groups_set_updated_at BEFORE UPDATE ON public.class_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER enrollments_set_updated_at BEFORE UPDATE ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

-- Direct Data API access remains fast, while RLS keeps every row school-scoped.
GRANT SELECT, INSERT, UPDATE ON
  public.academic_years, public.courses, public.grade_levels, public.rooms,
  public.people, public.students, public.student_guardians,
  public.class_groups, public.enrollments
TO authenticated;
GRANT ALL ON
  public.academic_years, public.courses, public.grade_levels, public.rooms,
  public.people, public.students, public.student_guardians,
  public.class_groups, public.enrollments
TO service_role;

ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_years FORCE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.grade_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_levels FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms FORCE ROW LEVEL SECURITY;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people FORCE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students FORCE ROW LEVEL SECURITY;
ALTER TABLE public.student_guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_guardians FORCE ROW LEVEL SECURITY;
ALTER TABLE public.class_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_groups FORCE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'academic_years', 'courses', 'grade_levels', 'rooms', 'people',
    'person_documents', 'person_roles', 'person_relationships', 'person_school_links',
    'students', 'student_guardians', 'class_groups', 'enrollments'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING '
      || '(school_id = (SELECT public.current_school_id()) '
      || 'AND (SELECT public.can_read_students()))',
      'Read ' || table_name || ' in own school',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK '
      || '(school_id = (SELECT public.current_school_id()) '
      || 'AND created_by = (SELECT auth.uid()) '
      || 'AND (SELECT public.can_manage_students()))',
      'Create ' || table_name || ' in own school',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING '
      || '(school_id = (SELECT public.current_school_id()) '
      || 'AND (SELECT public.can_manage_students())) WITH CHECK '
      || '(school_id = (SELECT public.current_school_id()) '
      || 'AND (SELECT public.can_manage_students()))',
      'Update ' || table_name || ' in own school',
      table_name
    );
  END LOOP;
END;
$$;

-- A security-invoker view provides the exact shape needed by fast student lists.
CREATE VIEW public.student_directory
WITH (security_invoker = true)
AS
SELECT
  student.id,
  student.school_id,
  student.person_id,
  student.registration_number,
  person.full_name,
  person.sex AS gender,
  person.birth_date,
  person.email,
  person.phone_primary AS phone,
  person.address,
  person.version AS person_version,
  student.status AS student_status,
  enrollment.status AS enrollment_status,
  enrollment.payment_status,
  enrollment.enrolled_on,
  enrollment.final_average,
  enrollment.attendance_rate,
  year.code AS academic_year,
  course.name AS course_name,
  grade.name AS grade_name,
  group_row.code AS class_code,
  group_row.name AS class_name,
  group_row.shift,
  room.name AS room_name,
  guardian.full_name AS primary_guardian_name,
  guardian.phone_primary AS primary_guardian_phone
FROM public.students AS student
JOIN public.people AS person
  ON person.school_id = student.school_id AND person.id = student.person_id
LEFT JOIN public.enrollments AS enrollment
  ON enrollment.school_id = student.school_id
  AND enrollment.student_id = student.id
  AND enrollment.deleted_at IS NULL
  AND enrollment.status IN ('pending', 'active')
LEFT JOIN public.academic_years AS year
  ON year.school_id = enrollment.school_id AND year.id = enrollment.academic_year_id
LEFT JOIN public.class_groups AS group_row
  ON group_row.school_id = enrollment.school_id AND group_row.id = enrollment.class_group_id
LEFT JOIN public.courses AS course
  ON course.school_id = group_row.school_id AND course.id = group_row.course_id
LEFT JOIN public.grade_levels AS grade
  ON grade.school_id = group_row.school_id AND grade.id = group_row.grade_level_id
LEFT JOIN public.rooms AS room
  ON room.school_id = group_row.school_id AND room.id = group_row.room_id
LEFT JOIN public.student_guardians AS link
  ON link.school_id = student.school_id AND link.student_id = student.id AND link.is_primary
LEFT JOIN public.people AS guardian
  ON guardian.school_id = link.school_id AND guardian.id = link.guardian_person_id
WHERE student.deleted_at IS NULL AND person.deleted_at IS NULL;

GRANT SELECT ON public.student_directory TO authenticated, service_role;

COMMENT ON VIEW public.student_directory IS
  'Security-invoker read model for responsive student lists; all underlying RLS policies still apply.';

-- ---------------------------------------------------------------------------
-- create_student: matrícula transacional — aluno + inscrição na turma do ano
-- lectivo + encarregados, tudo ou nada. person_id tem de já existir (ver
-- create_person) — Aluno nunca duplica dados pessoais.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_student(
  p_person_id uuid,
  p_registration_number text,
  p_class_group_id uuid DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_admitted_on date DEFAULT CURRENT_DATE,
  p_guardians jsonb DEFAULT '[]'::jsonb
)
RETURNS public.students
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school_id uuid := (SELECT public.current_school_id());
  v_student public.students;
  v_guardian jsonb;
BEGIN
  IF NOT COALESCE((SELECT public.can_manage_students()), false) THEN
    RAISE EXCEPTION 'insufficient permissions to create student' USING ERRCODE = '42501';
  END IF;

  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'no school associated with current user';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.people WHERE id = p_person_id AND school_id = v_school_id) THEN
    RAISE EXCEPTION 'person not found in current school';
  END IF;

  INSERT INTO public.students (school_id, person_id, registration_number, admitted_on, created_by)
  VALUES (v_school_id, p_person_id, p_registration_number, COALESCE(p_admitted_on, CURRENT_DATE), (SELECT auth.uid()))
  RETURNING * INTO v_student;

  INSERT INTO public.person_roles (school_id, person_id, role, created_by)
  VALUES (v_school_id, p_person_id, 'aluno', (SELECT auth.uid()))
  ON CONFLICT (person_id, role) DO NOTHING;

  IF p_class_group_id IS NOT NULL AND p_academic_year_id IS NOT NULL THEN
    INSERT INTO public.enrollments (school_id, student_id, academic_year_id, class_group_id, status, created_by)
    VALUES (v_school_id, v_student.id, p_academic_year_id, p_class_group_id, 'active', (SELECT auth.uid()));
  END IF;

  FOR v_guardian IN SELECT * FROM jsonb_array_elements(p_guardians) LOOP
    INSERT INTO public.student_guardians (
      school_id, student_id, guardian_person_id, relationship, is_primary, authorized_pickup, created_by
    )
    VALUES (
      v_school_id, v_student.id, (v_guardian ->> 'guardian_person_id')::uuid,
      v_guardian ->> 'relationship',
      COALESCE((v_guardian ->> 'is_primary')::boolean, false),
      COALESCE((v_guardian ->> 'authorized_pickup')::boolean, true),
      (SELECT auth.uid())
    );
  END LOOP;

  RETURN v_student;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_student(uuid, text, uuid, uuid, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_student(uuid, text, uuid, uuid, date, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- change_student_status: transição de estado com histórico obrigatório.
-- ---------------------------------------------------------------------------
CREATE TABLE public.student_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  previous_status text,
  new_status text NOT NULL,
  reason text,
  changed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_status_history_student_fkey
    FOREIGN KEY (school_id, student_id) REFERENCES public.students (school_id, id) ON DELETE CASCADE
);

CREATE INDEX student_status_history_student_idx ON public.student_status_history (school_id, student_id);

GRANT SELECT ON public.student_status_history TO authenticated;
GRANT ALL ON public.student_status_history TO service_role;
ALTER TABLE public.student_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_status_history FORCE ROW LEVEL SECURITY;

CREATE POLICY "Read student status history in own school" ON public.student_status_history
  FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.can_read_students())
  );
CREATE OR REPLACE FUNCTION private.record_student_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.student_status_history (
      school_id, student_id, previous_status, new_status, reason, changed_by
    )
    VALUES (
      NEW.school_id,
      NEW.id,
      OLD.status,
      NEW.status,
      NULLIF(current_setting('app.status_change_reason', true), ''),
      (SELECT auth.uid())
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.record_student_status_change()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER students_record_status_change
  AFTER UPDATE OF status ON public.students
  FOR EACH ROW EXECUTE FUNCTION private.record_student_status_change();

CREATE OR REPLACE FUNCTION public.change_student_status(p_student_id uuid, p_new_status text, p_reason text DEFAULT NULL)
RETURNS public.students
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school_id uuid := (SELECT public.current_school_id());
  v_student public.students;
BEGIN
  IF NOT COALESCE((SELECT public.can_manage_students()), false) THEN
    RAISE EXCEPTION 'insufficient permissions to change student status' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_student FROM public.students WHERE id = p_student_id AND school_id = v_school_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'student not found in current school';
  END IF;

  IF p_new_status NOT IN ('active', 'inactive', 'transferred', 'graduated') THEN
    RAISE EXCEPTION 'invalid student status: %', p_new_status;
  END IF;

  PERFORM set_config('app.status_change_reason', COALESCE(p_reason, ''), true);

  UPDATE public.students SET status = p_new_status WHERE id = p_student_id
  RETURNING * INTO v_student;

  RETURN v_student;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.change_student_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_student_status(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_students(p_query text DEFAULT NULL, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
RETURNS SETOF public.student_directory
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT *
  FROM public.student_directory
  WHERE school_id = (SELECT public.current_school_id())
    AND (
      p_query IS NULL
      OR public.immutable_unaccent(lower(full_name))
        OPERATOR(public.%) public.immutable_unaccent(lower(p_query))
      OR registration_number ILIKE '%' || p_query || '%'
      OR lower(coalesce(email, '')) = lower(p_query)
    )
  ORDER BY full_name
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

REVOKE EXECUTE ON FUNCTION public.search_students(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_students(text, integer, integer) TO authenticated;

-- Audit domain changes without exposing INSERT on audit_logs. Only field names,
-- entity id and row version are recorded here to avoid duplicating personal data.
CREATE OR REPLACE FUNCTION private.audit_domain_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := (SELECT auth.uid());
  current_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  previous_row jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  row_school_id uuid := (current_row ->> 'school_id')::uuid;
  changed_fields text[];
BEGIN
  IF actor IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF row_school_id IS DISTINCT FROM (SELECT public.current_school_id()) THEN
    RAISE EXCEPTION 'cannot audit a row outside the current school' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(entry.key ORDER BY entry.key), ARRAY[]::text[])
  INTO changed_fields
  FROM jsonb_each(current_row) AS entry
  WHERE TG_OP <> 'UPDATE' OR previous_row -> entry.key IS DISTINCT FROM entry.value;

  INSERT INTO public.audit_logs (
    school_id, actor_id, action, entity_type, entity_id, reason, after_data
  )
  VALUES (
    row_school_id,
    actor,
    lower(TG_TABLE_NAME || '.' || TG_OP),
    TG_TABLE_NAME,
    (current_row ->> 'id')::uuid,
    NULLIF(current_setting('app.audit_reason', true), ''),
    jsonb_build_object(
      'version', current_row -> 'version',
      'changed_fields', to_jsonb(changed_fields)
    )
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.audit_domain_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER people_audit_change
  AFTER INSERT OR UPDATE ON public.people
  FOR EACH ROW EXECUTE FUNCTION private.audit_domain_change();
CREATE TRIGGER students_audit_change
  AFTER INSERT OR UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION private.audit_domain_change();
CREATE TRIGGER enrollments_audit_change
  AFTER INSERT OR UPDATE ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION private.audit_domain_change();

-- One-touch registration: person and student are created in the same database
-- transaction. Any failure rolls back both records automatically.
CREATE OR REPLACE FUNCTION public.enroll_new_student(
  p_person jsonb,
  p_registration_number text,
  p_class_group_id uuid DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_admitted_on date DEFAULT CURRENT_DATE,
  p_guardians jsonb DEFAULT '[]'::jsonb,
  p_duplicate_decision text DEFAULT NULL
)
RETURNS public.students
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  new_person public.people;
  new_student public.students;
BEGIN
  new_person := public.create_person(
    p_person,
    ARRAY['aluno']::text[],
    '[]'::jsonb,
    '[]'::jsonb,
    p_duplicate_decision
  );

  new_student := public.create_student(
    new_person.id,
    p_registration_number,
    p_class_group_id,
    p_academic_year_id,
    p_admitted_on,
    p_guardians
  );

  RETURN new_student;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enroll_new_student(
  jsonb, text, uuid, uuid, date, jsonb, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enroll_new_student(
  jsonb, text, uuid, uuid, date, jsonb, text
) TO authenticated;


-- ============================================================
-- MIGRATION: 20260810130035_audit_logs_recent_index.sql
-- ============================================================
-- Supports the administrator dashboard's bounded, school-scoped recent audit
-- query without sorting the complete immutable history on every page load.
CREATE INDEX audit_logs_school_recent_idx
  ON public.audit_logs (school_id, created_at DESC);


-- ============================================================
-- MIGRATION: 20260810130207_school_settings_admin_update.sql
-- ============================================================
-- Typed, reusable settings that belong to the school itself. Preferences stay
-- extensible without turning core academic rules into unvalidated JSON.
ALTER TABLE public.schools
  ADD COLUMN director_name text,
  ADD COLUMN evaluation_periods smallint NOT NULL DEFAULT 3,
  ADD COLUMN passing_grade numeric(4,2) NOT NULL DEFAULT 10,
  ADD COLUMN preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT schools_director_name_valid CHECK (
    director_name IS NULL
    OR (director_name = btrim(director_name) AND char_length(director_name) BETWEEN 3 AND 120)
  ),
  ADD CONSTRAINT schools_evaluation_periods_valid CHECK (evaluation_periods BETWEEN 2 AND 4),
  ADD CONSTRAINT schools_passing_grade_valid CHECK (passing_grade BETWEEN 0 AND 20),
  ADD CONSTRAINT schools_preferences_object CHECK (jsonb_typeof(preferences) = 'object');

REVOKE INSERT, UPDATE, DELETE ON public.schools FROM authenticated;
GRANT UPDATE (
  name,
  short_name,
  nif,
  email,
  phone,
  address,
  academic_year,
  currency,
  director_name,
  evaluation_periods,
  passing_grade,
  preferences
) ON public.schools TO authenticated;

CREATE POLICY "Administrators can update their own school"
  ON public.schools
  FOR UPDATE
  TO authenticated
  USING (
    id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) = 'Administrador'
  )
  WITH CHECK (
    id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) = 'Administrador'
  );

COMMENT ON COLUMN public.schools.preferences IS
  'Non-secret, school-wide UI/workflow preferences. Authorization roles and credentials never belong here.';

CREATE OR REPLACE FUNCTION private.audit_school_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := (SELECT auth.uid());
  changed_fields text[];
BEGIN
  IF actor IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM (SELECT public.current_school_id()) THEN
    RAISE EXCEPTION 'cannot audit a school outside the current profile'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(entry.key ORDER BY entry.key), ARRAY[]::text[])
  INTO changed_fields
  FROM jsonb_each(to_jsonb(NEW)) AS entry
  WHERE to_jsonb(OLD) -> entry.key IS DISTINCT FROM entry.value;

  INSERT INTO public.audit_logs (
    school_id, actor_id, action, entity_type, entity_id, after_data
  )
  VALUES (
    NEW.id,
    actor,
    'schools.update',
    'schools',
    NEW.id,
    jsonb_build_object(
      'version', to_jsonb(NEW.version),
      'changed_fields', to_jsonb(changed_fields)
    )
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.audit_school_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER schools_audit_change
  AFTER UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION private.audit_school_change();


-- ============================================================
-- MIGRATION: 20260810130726_school_billing_settings.sql
-- ============================================================
CREATE TABLE public.school_billing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,
  due_day smallint NOT NULL DEFAULT 10 CHECK (due_day BETWEEN 1 AND 28),
  late_fee_percent numeric(5,2) NOT NULL DEFAULT 2 CHECK (late_fee_percent BETWEEN 0 AND 100),
  grace_days smallint NOT NULL DEFAULT 5 CHECK (grace_days BETWEEN 0 AND 60),
  sibling_discount_percent numeric(5,2) NOT NULL DEFAULT 10
    CHECK (sibling_discount_percent BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1
);

INSERT INTO public.school_billing_settings (school_id)
SELECT id FROM public.schools
ON CONFLICT (school_id) DO NOTHING;

CREATE TRIGGER school_billing_settings_set_updated_at
  BEFORE UPDATE ON public.school_billing_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

CREATE TRIGGER school_billing_settings_audit
  AFTER UPDATE ON public.school_billing_settings
  FOR EACH ROW EXECUTE FUNCTION private.audit_domain_change();

GRANT SELECT ON public.school_billing_settings TO authenticated;
GRANT UPDATE (due_day, late_fee_percent, grace_days, sibling_discount_percent)
  ON public.school_billing_settings TO authenticated;
GRANT ALL ON public.school_billing_settings TO service_role;
ALTER TABLE public.school_billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_billing_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY "Finance roles can read billing settings"
  ON public.school_billing_settings FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  );

CREATE POLICY "Finance roles can update billing settings"
  ON public.school_billing_settings FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  );

COMMENT ON TABLE public.school_billing_settings IS
  'Reusable, versioned billing rules. Exactly one server-created row per school.';


-- ============================================================
-- MIGRATION: 20260810131922_harden_domain_immutable_columns.sql
-- ============================================================
-- Identity, tenancy and creation metadata must never be rewritten after a row
-- exists. RLS already prevents moving a row to another visible school, while
-- this trigger also protects privileged/server-side writes and future policies.
CREATE OR REPLACE FUNCTION private.reject_immutable_column_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  column_name text;
BEGIN
  FOREACH column_name IN ARRAY TG_ARGV LOOP
    IF (to_jsonb(NEW) -> column_name) IS DISTINCT FROM (to_jsonb(OLD) -> column_name) THEN
      RAISE EXCEPTION 'column %.% is immutable', TG_TABLE_NAME, column_name
        USING ERRCODE = '22000';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.reject_immutable_column_changes()
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'attachments',
    'people',
    'person_documents',
    'person_roles',
    'person_relationships',
    'person_school_links',
    'academic_years',
    'courses',
    'grade_levels',
    'rooms',
    'students',
    'student_guardians',
    'class_groups',
    'enrollments',
    'school_billing_settings'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_column_changes('
      || quote_literal('id') || ', '
      || quote_literal('school_id') || ', '
      || quote_literal('created_at') || ', '
      || quote_literal('created_by') || ')',
      table_name || '_protect_identity',
      table_name
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION private.reject_immutable_column_changes() IS
  'Reusable trigger that prevents mutation of identity, tenant and creation metadata.';


-- ============================================================
-- MIGRATION: 20260810132146_add_domain_relationship_indexes.sql
-- ============================================================
-- Full (non-partial) indexes for tenant filters and the referencing side of
-- frequently used foreign-key joins. Partial search indexes remain useful for
-- active rows, but cannot accelerate integrity checks for every stored row.
CREATE INDEX profiles_school_id_idx ON public.profiles (school_id);
CREATE INDEX attachments_school_id_idx ON public.attachments (school_id);
CREATE INDEX person_documents_school_person_idx
  ON public.person_documents (school_id, person_id);
CREATE INDEX person_roles_school_person_idx
  ON public.person_roles (school_id, person_id);
CREATE INDEX person_relationships_school_person_idx
  ON public.person_relationships (school_id, person_id);
CREATE INDEX person_relationships_school_related_idx
  ON public.person_relationships (school_id, related_person_id);
CREATE INDEX student_guardians_school_student_idx
  ON public.student_guardians (school_id, student_id);
CREATE INDEX enrollments_school_student_idx
  ON public.enrollments (school_id, student_id);
CREATE INDEX enrollments_school_year_idx
  ON public.enrollments (school_id, academic_year_id);


-- ============================================================
-- MIGRATION: 20260810132342_finance_core.sql
-- ============================================================
-- Reusable finance core: invoices, line items, payments, allocations and cash.
-- Money is numeric(14,2); integer/float client arithmetic is never authoritative.

CREATE OR REPLACE FUNCTION public.can_manage_finance()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria'),
    false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_finance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_finance() TO authenticated;

ALTER TABLE public.enrollments
  ADD CONSTRAINT enrollments_school_id_student_key
  UNIQUE (school_id, id, student_id);

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  enrollment_id uuid,
  number text NOT NULL CHECK (number = btrim(number) AND char_length(number) BETWEEN 1 AND 64),
  description text,
  issued_on date NOT NULL DEFAULT CURRENT_DATE,
  due_on date NOT NULL,
  currency text NOT NULL DEFAULT 'AOA' CHECK (currency = 'AOA'),
  status text NOT NULL DEFAULT 'issued'
    CHECK (status IN ('draft', 'issued', 'partial', 'paid', 'void')),
  subtotal numeric(14,2) NOT NULL CHECK (subtotal >= 0),
  discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  late_fee_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (late_fee_amount >= 0),
  total_amount numeric(14,2) NOT NULL CHECK (total_amount >= 0),
  amount_paid numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT invoices_dates_valid CHECK (due_on >= issued_on),
  CONSTRAINT invoices_totals_valid CHECK (
    total_amount = subtotal - discount_amount + late_fee_amount
    AND amount_paid <= total_amount
  ),
  CONSTRAINT invoices_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT invoices_school_id_student_key UNIQUE (school_id, id, student_id),
  CONSTRAINT invoices_school_number_key UNIQUE (school_id, number),
  CONSTRAINT invoices_student_fkey FOREIGN KEY (school_id, student_id)
    REFERENCES public.students (school_id, id),
  CONSTRAINT invoices_enrollment_fkey FOREIGN KEY (school_id, enrollment_id, student_id)
    REFERENCES public.enrollments (school_id, id, student_id)
);

CREATE TABLE public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  line_total numeric(14,2) GENERATED ALWAYS AS
    ((quantity * unit_price) - discount_amount) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  CONSTRAINT invoice_items_total_valid CHECK ((quantity * unit_price) >= discount_amount),
  CONSTRAINT invoice_items_invoice_fkey FOREIGN KEY (school_id, invoice_id)
    REFERENCES public.invoices (school_id, id) ON DELETE CASCADE
);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  receipt_number text NOT NULL CHECK (
    receipt_number = btrim(receipt_number) AND char_length(receipt_number) BETWEEN 1 AND 64
  ),
  paid_at timestamptz NOT NULL DEFAULT now(),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'AOA' CHECK (currency = 'AOA'),
  method text NOT NULL CHECK (method IN ('cash', 'multicaixa', 'transfer', 'express')),
  reference text,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'reversed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT payments_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT payments_school_id_student_key UNIQUE (school_id, id, student_id),
  CONSTRAINT payments_school_receipt_key UNIQUE (school_id, receipt_number),
  CONSTRAINT payments_student_fkey FOREIGN KEY (school_id, student_id)
    REFERENCES public.students (school_id, id)
);

CREATE TABLE public.payment_allocations (
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  student_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  PRIMARY KEY (payment_id, invoice_id),
  CONSTRAINT payment_allocations_payment_fkey
    FOREIGN KEY (school_id, payment_id, student_id)
    REFERENCES public.payments (school_id, id, student_id),
  CONSTRAINT payment_allocations_invoice_fkey
    FOREIGN KEY (school_id, invoice_id, student_id)
    REFERENCES public.invoices (school_id, id, student_id)
);

CREATE TABLE public.cash_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  payment_id uuid,
  document_number text NOT NULL CHECK (
    document_number = btrim(document_number) AND char_length(document_number) BETWEEN 1 AND 64
  ),
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  category text NOT NULL,
  description text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('cash', 'multicaixa', 'transfer', 'express')),
  reference text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT cash_entries_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT cash_entries_school_document_key UNIQUE (school_id, document_number),
  CONSTRAINT cash_entries_payment_fkey FOREIGN KEY (school_id, payment_id)
    REFERENCES public.payments (school_id, id)
);

CREATE INDEX invoices_open_idx
  ON public.invoices (school_id, due_on, student_id)
  WHERE status IN ('issued', 'partial') AND deleted_at IS NULL;
CREATE INDEX invoice_items_invoice_idx ON public.invoice_items (school_id, invoice_id);
CREATE INDEX payments_student_recent_idx ON public.payments (school_id, student_id, paid_at DESC);
CREATE INDEX payment_allocations_invoice_idx ON public.payment_allocations (school_id, invoice_id);
CREATE INDEX cash_entries_recent_idx ON public.cash_entries (school_id, occurred_at DESC);
CREATE UNIQUE INDEX cash_entries_confirmed_payment_idx ON public.cash_entries (payment_id)
  WHERE payment_id IS NOT NULL AND status = 'posted';

CREATE TRIGGER invoices_set_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER cash_entries_set_updated_at BEFORE UPDATE ON public.cash_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

CREATE TRIGGER invoices_protect_identity BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_column_changes(
    'id', 'school_id', 'student_id', 'created_at', 'created_by'
  );
CREATE TRIGGER payments_protect_identity BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_column_changes(
    'id', 'school_id', 'student_id', 'amount', 'created_at', 'created_by'
  );
CREATE TRIGGER cash_entries_protect_identity BEFORE UPDATE ON public.cash_entries
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_column_changes(
    'id', 'school_id', 'payment_id', 'document_number', 'direction', 'amount',
    'created_at', 'created_by'
  );

GRANT SELECT ON public.invoices, public.invoice_items, public.payments,
  public.payment_allocations, public.cash_entries TO authenticated;
GRANT INSERT, UPDATE ON public.invoices TO authenticated;
GRANT INSERT ON public.invoice_items, public.payments, public.payment_allocations,
  public.cash_entries TO authenticated;
GRANT UPDATE ON public.payments, public.cash_entries TO authenticated;
GRANT ALL ON public.invoices, public.invoice_items, public.payments,
  public.payment_allocations, public.cash_entries TO service_role;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cash_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_entries FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'invoices', 'invoice_items', 'payments', 'payment_allocations', 'cash_entries'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated '
      || 'USING (school_id = (SELECT public.current_school_id()) '
      || 'AND (SELECT public.can_manage_finance()))',
      'Finance roles read ' || table_name,
      table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated '
      || 'WITH CHECK (school_id = (SELECT public.current_school_id()) '
      || 'AND created_by = (SELECT auth.uid()) '
      || 'AND (SELECT public.can_manage_finance()))',
      'Finance roles create ' || table_name,
      table_name
    );
  END LOOP;
END;
$$;

CREATE POLICY "Finance roles update invoices" ON public.invoices
  FOR UPDATE TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND (SELECT public.can_manage_finance()))
  WITH CHECK (school_id = (SELECT public.current_school_id()) AND (SELECT public.can_manage_finance()));
CREATE POLICY "Finance roles update payments" ON public.payments
  FOR UPDATE TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND (SELECT public.can_manage_finance()))
  WITH CHECK (school_id = (SELECT public.current_school_id()) AND (SELECT public.can_manage_finance()));
CREATE POLICY "Finance roles update cash entries" ON public.cash_entries
  FOR UPDATE TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND (SELECT public.can_manage_finance()))
  WITH CHECK (school_id = (SELECT public.current_school_id()) AND (SELECT public.can_manage_finance()));

-- Atomic one-touch payment. The row lock serializes concurrent payments for
-- the same invoice and an existing identical receipt makes retries idempotent.
CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_invoice_id uuid,
  p_receipt_number text,
  p_amount numeric,
  p_method text,
  p_reference text DEFAULT NULL,
  p_paid_at timestamptz DEFAULT now()
)
RETURNS public.payments
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  school uuid := (SELECT public.current_school_id());
  invoice public.invoices;
  payment public.payments;
BEGIN
  IF NOT COALESCE((SELECT public.can_manage_finance()), false) THEN
    RAISE EXCEPTION 'insufficient permissions to record payment' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'payment amount must be positive';
  END IF;
  IF NULLIF(btrim(p_receipt_number), '') IS NULL THEN
    RAISE EXCEPTION 'receipt number is required';
  END IF;
  IF p_method NOT IN ('cash', 'multicaixa', 'transfer', 'express') THEN
    RAISE EXCEPTION 'invalid payment method';
  END IF;

  PERFORM set_config('app.finance_workflow_user', (SELECT auth.uid())::text, true);

  SELECT * INTO invoice FROM public.invoices
  WHERE id = p_invoice_id AND school_id = school AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice not found';
  END IF;

  SELECT * INTO payment FROM public.payments
  WHERE school_id = school AND receipt_number = btrim(p_receipt_number);
  IF FOUND THEN
    IF payment.amount = p_amount
      AND payment.method = p_method
      AND EXISTS (
        SELECT 1 FROM public.payment_allocations
        WHERE school_id = school
          AND payment_id = payment.id
          AND invoice_id = invoice.id
      )
    THEN
      RETURN payment;
    END IF;
    RAISE EXCEPTION 'receipt number already used for another payment';
  END IF;

  IF invoice.status NOT IN ('issued', 'partial') THEN
    RAISE EXCEPTION 'invoice is not payable';
  END IF;
  IF p_amount > invoice.total_amount - invoice.amount_paid THEN
    RAISE EXCEPTION 'payment exceeds outstanding invoice amount';
  END IF;

  INSERT INTO public.payments (
    school_id, student_id, receipt_number, paid_at, amount, method, reference, created_by
  ) VALUES (
    school, invoice.student_id, btrim(p_receipt_number), COALESCE(p_paid_at, now()),
    p_amount, p_method, NULLIF(btrim(p_reference), ''), (SELECT auth.uid())
  ) RETURNING * INTO payment;

  INSERT INTO public.payment_allocations (
    school_id, payment_id, invoice_id, student_id, amount, created_by
  ) VALUES (
    school, payment.id, invoice.id, invoice.student_id, p_amount, (SELECT auth.uid())
  );

  INSERT INTO public.cash_entries (
    school_id, payment_id, document_number, direction, category, description, amount, method,
    reference, occurred_at, created_by
  ) VALUES (
    school, payment.id, payment.receipt_number, 'in', 'invoice_payment',
    'Payment ' || payment.receipt_number || ' for invoice ' || invoice.number,
    p_amount, p_method, payment.reference, payment.paid_at, (SELECT auth.uid())
  );

  UPDATE public.invoices
  SET amount_paid = amount_paid + p_amount,
      status = CASE
        WHEN amount_paid + p_amount = total_amount THEN 'paid'
        ELSE 'partial'
      END
  WHERE id = invoice.id;

  RETURN payment;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_invoice_payment(uuid, text, numeric, text, text, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid, text, numeric, text, text, timestamptz)
  TO authenticated;

CREATE TRIGGER invoices_audit_change AFTER INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION private.audit_domain_change();
CREATE TRIGGER payments_audit_change AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION private.audit_domain_change();
CREATE TRIGGER cash_entries_audit_change AFTER INSERT OR UPDATE ON public.cash_entries
  FOR EACH ROW EXECUTE FUNCTION private.audit_domain_change();


-- ============================================================
-- MIGRATION: 20260810133021_finance_invoice_issuance.sql
-- ============================================================
-- Minimal finance directory: treasury sees billing identity, never the full
-- personal profile. Trigger-maintained rows keep invoice lookup fast.
CREATE TABLE public.finance_students (
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  full_name text NOT NULL,
  registration_number text NOT NULL,
  student_status text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id),
  CONSTRAINT finance_students_school_student_fkey
    FOREIGN KEY (school_id, student_id)
    REFERENCES public.students (school_id, id) ON DELETE CASCADE
);

CREATE INDEX finance_students_school_name_idx
  ON public.finance_students (school_id, full_name);

INSERT INTO public.finance_students (
  school_id, student_id, full_name, registration_number, student_status
)
SELECT student.school_id, student.id, person.full_name,
  student.registration_number, student.status
FROM public.students AS student
JOIN public.people AS person
  ON person.school_id = student.school_id AND person.id = student.person_id;

CREATE OR REPLACE FUNCTION private.sync_finance_student_from_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.finance_students (
    school_id, student_id, full_name, registration_number, student_status, updated_at
  )
  SELECT NEW.school_id, NEW.id, person.full_name,
    NEW.registration_number, NEW.status, now()
  FROM public.people AS person
  WHERE person.school_id = NEW.school_id AND person.id = NEW.person_id
  ON CONFLICT (student_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    registration_number = EXCLUDED.registration_number,
    student_status = EXCLUDED.student_status,
    updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_finance_student_from_person()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.finance_students AS finance_student
  SET full_name = NEW.full_name, updated_at = now()
  FROM public.students AS student
  WHERE student.school_id = NEW.school_id
    AND student.person_id = NEW.id
    AND finance_student.school_id = student.school_id
    AND finance_student.student_id = student.id;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.sync_finance_student_from_student()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.sync_finance_student_from_person()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER students_sync_finance_directory
  AFTER INSERT OR UPDATE OF registration_number, status ON public.students
  FOR EACH ROW EXECUTE FUNCTION private.sync_finance_student_from_student();
CREATE TRIGGER people_sync_finance_directory
  AFTER UPDATE OF full_name ON public.people
  FOR EACH ROW EXECUTE FUNCTION private.sync_finance_student_from_person();

-- A student record may never be reassigned to another person after financial
-- history exists. Replace the generic identity trigger with this stricter set.
DROP TRIGGER students_protect_identity ON public.students;
CREATE TRIGGER students_protect_identity BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_column_changes(
    'id', 'school_id', 'person_id', 'created_at', 'created_by'
  );

GRANT SELECT ON public.finance_students TO authenticated;
GRANT ALL ON public.finance_students TO service_role;
ALTER TABLE public.finance_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_students FORCE ROW LEVEL SECURITY;

CREATE POLICY "Finance roles read billing student directory"
  ON public.finance_students FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.can_manage_finance())
  );

-- Direct Data API writes cannot create accounting records. SECURITY INVOKER
-- workflows set this transaction-local marker only after validating the role.
CREATE OR REPLACE FUNCTION private.require_finance_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('app.finance_workflow_user', true)
    IS DISTINCT FROM (SELECT auth.uid())::text
  THEN
    RAISE EXCEPTION 'financial writes require an approved workflow'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.require_finance_workflow()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER invoices_require_workflow
  BEFORE INSERT OR UPDATE OF student_id, enrollment_id, status, subtotal,
    discount_amount, late_fee_amount, total_amount, amount_paid
  ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION private.require_finance_workflow();
CREATE TRIGGER invoice_items_require_workflow BEFORE INSERT ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION private.require_finance_workflow();
CREATE TRIGGER payments_require_workflow BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION private.require_finance_workflow();
CREATE TRIGGER payment_allocations_require_workflow BEFORE INSERT ON public.payment_allocations
  FOR EACH ROW EXECUTE FUNCTION private.require_finance_workflow();
CREATE TRIGGER cash_entries_require_workflow BEFORE INSERT OR UPDATE ON public.cash_entries
  FOR EACH ROW EXECUTE FUNCTION private.require_finance_workflow();

CREATE OR REPLACE FUNCTION public.issue_invoice(
  p_student_id uuid,
  p_number text,
  p_due_on date,
  p_description text,
  p_items jsonb,
  p_enrollment_id uuid DEFAULT NULL,
  p_issued_on date DEFAULT CURRENT_DATE
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  school uuid := (SELECT public.current_school_id());
  invoice public.invoices;
  item jsonb;
  subtotal numeric(14,2) := 0;
  quantity numeric(10,2);
  unit_price numeric(14,2);
  discount numeric(14,2);
BEGIN
  IF NOT COALESCE((SELECT public.can_manage_finance()), false) THEN
    RAISE EXCEPTION 'insufficient permissions to issue invoice' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_number), '') IS NULL THEN
    RAISE EXCEPTION 'invoice number is required';
  END IF;
  IF p_due_on IS NULL OR p_due_on < COALESCE(p_issued_on, CURRENT_DATE) THEN
    RAISE EXCEPTION 'invoice due date is invalid';
  END IF;
  IF p_items IS NULL
    OR jsonb_typeof(p_items) <> 'array'
    OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 50
  THEN
    RAISE EXCEPTION 'invoice requires between 1 and 50 items';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.finance_students
    WHERE school_id = school AND student_id = p_student_id
  ) THEN
    RAISE EXCEPTION 'billing student not found';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    quantity := COALESCE(NULLIF(item ->> 'quantity', '')::numeric, 1);
    unit_price := NULLIF(item ->> 'unit_price', '')::numeric;
    discount := COALESCE(NULLIF(item ->> 'discount_amount', '')::numeric, 0);
    IF NULLIF(btrim(item ->> 'category'), '') IS NULL
      OR NULLIF(btrim(item ->> 'description'), '') IS NULL
      OR quantity <= 0 OR unit_price IS NULL OR unit_price < 0
      OR discount < 0 OR discount > quantity * unit_price
    THEN
      RAISE EXCEPTION 'invalid invoice item';
    END IF;
    subtotal := subtotal + (quantity * unit_price) - discount;
  END LOOP;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(school::text || ':' || btrim(p_number), 0)
  );

  SELECT * INTO invoice FROM public.invoices
  WHERE school_id = school AND number = btrim(p_number);
  IF FOUND THEN
    IF invoice.student_id = p_student_id
      AND invoice.total_amount = subtotal
      AND invoice.due_on = p_due_on
    THEN
      RETURN invoice;
    END IF;
    RAISE EXCEPTION 'invoice number already used';
  END IF;

  PERFORM set_config('app.finance_workflow_user', (SELECT auth.uid())::text, true);

  INSERT INTO public.invoices (
    school_id, student_id, enrollment_id, number, description,
    issued_on, due_on, subtotal, total_amount, created_by
  ) VALUES (
    school, p_student_id, p_enrollment_id, btrim(p_number), NULLIF(btrim(p_description), ''),
    COALESCE(p_issued_on, CURRENT_DATE), p_due_on, subtotal, subtotal, (SELECT auth.uid())
  ) RETURNING * INTO invoice;

  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.invoice_items (
      school_id, invoice_id, category, description, quantity,
      unit_price, discount_amount, created_by
    ) VALUES (
      school, invoice.id, btrim(item ->> 'category'), btrim(item ->> 'description'),
      COALESCE(NULLIF(item ->> 'quantity', '')::numeric, 1),
      NULLIF(item ->> 'unit_price', '')::numeric,
      COALESCE(NULLIF(item ->> 'discount_amount', '')::numeric, 0),
      (SELECT auth.uid())
    );
  END LOOP;

  RETURN invoice;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.issue_invoice(uuid, text, date, text, jsonb, uuid, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_invoice(uuid, text, date, text, jsonb, uuid, date)
  TO authenticated;


-- ============================================================
-- MIGRATION: 20260810133319_finance_reporting.sql
-- ============================================================
-- Server-side financial aggregates stay accurate beyond client pagination.
CREATE INDEX invoices_reporting_idx
  ON public.invoices (school_id, issued_on, due_on)
  WHERE deleted_at IS NULL AND status <> 'void';

CREATE INDEX cash_entries_reporting_idx
  ON public.cash_entries (school_id, occurred_at, direction)
  WHERE status = 'posted';

CREATE OR REPLACE FUNCTION public.finance_summary()
RETURNS TABLE (
  billed numeric,
  received numeric,
  outstanding numeric,
  overdue numeric,
  cash_in numeric,
  cash_out numeric,
  cash_balance numeric,
  invoice_count bigint,
  open_invoice_count bigint,
  overdue_invoice_count bigint,
  billed_student_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  school uuid := (SELECT public.current_school_id());
BEGIN
  IF NOT COALESCE((SELECT public.can_manage_finance()), false) THEN
    RAISE EXCEPTION 'insufficient permissions to read finance summary' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH invoice_totals AS (
    SELECT
      COALESCE(sum(total_amount), 0) AS billed,
      COALESCE(sum(amount_paid), 0) AS received,
      COALESCE(sum(total_amount - amount_paid), 0) AS outstanding,
      COALESCE(sum(total_amount - amount_paid) FILTER (
        WHERE due_on < CURRENT_DATE AND status IN ('issued', 'partial')
      ), 0) AS overdue,
      count(*) AS invoice_count,
      count(*) FILTER (WHERE status IN ('issued', 'partial')) AS open_invoice_count,
      count(*) FILTER (
        WHERE due_on < CURRENT_DATE AND status IN ('issued', 'partial')
      ) AS overdue_invoice_count,
      count(DISTINCT student_id) AS billed_student_count
    FROM public.invoices
    WHERE school_id = school AND deleted_at IS NULL AND status <> 'void'
  ), cash_totals AS (
    SELECT
      COALESCE(sum(amount) FILTER (WHERE direction = 'in'), 0) AS cash_in,
      COALESCE(sum(amount) FILTER (WHERE direction = 'out'), 0) AS cash_out
    FROM public.cash_entries
    WHERE school_id = school AND status = 'posted'
  )
  SELECT invoice_totals.billed, invoice_totals.received,
    invoice_totals.outstanding, invoice_totals.overdue,
    cash_totals.cash_in, cash_totals.cash_out,
    cash_totals.cash_in - cash_totals.cash_out,
    invoice_totals.invoice_count, invoice_totals.open_invoice_count,
    invoice_totals.overdue_invoice_count, invoice_totals.billed_student_count
  FROM invoice_totals CROSS JOIN cash_totals;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_monthly_summary(p_months integer DEFAULT 12)
RETURNS TABLE (
  month_start date,
  billed numeric,
  received numeric,
  cash_in numeric,
  cash_out numeric
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  school uuid := (SELECT public.current_school_id());
  month_count integer := LEAST(GREATEST(COALESCE(p_months, 12), 1), 36);
BEGIN
  IF NOT COALESCE((SELECT public.can_manage_finance()), false) THEN
    RAISE EXCEPTION 'insufficient permissions to read finance reporting' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH months AS (
    SELECT generate_series(
      date_trunc('month', CURRENT_DATE) - make_interval(months => month_count - 1),
      date_trunc('month', CURRENT_DATE),
      interval '1 month'
    )::date AS month_start
  ), invoices_by_month AS (
    SELECT date_trunc('month', issued_on)::date AS month_start,
      sum(total_amount) AS billed, sum(amount_paid) AS received
    FROM public.invoices
    WHERE school_id = school AND deleted_at IS NULL AND status <> 'void'
      AND issued_on >= (SELECT min(months.month_start) FROM months)
    GROUP BY 1
  ), cash_by_month AS (
    SELECT date_trunc('month', occurred_at)::date AS month_start,
      sum(amount) FILTER (WHERE direction = 'in') AS cash_in,
      sum(amount) FILTER (WHERE direction = 'out') AS cash_out
    FROM public.cash_entries
    WHERE school_id = school AND status = 'posted'
      AND occurred_at >= (SELECT min(months.month_start) FROM months)
    GROUP BY 1
  )
  SELECT months.month_start,
    COALESCE(invoices_by_month.billed, 0), COALESCE(invoices_by_month.received, 0),
    COALESCE(cash_by_month.cash_in, 0), COALESCE(cash_by_month.cash_out, 0)
  FROM months
  LEFT JOIN invoices_by_month
    ON invoices_by_month.month_start = months.month_start
  LEFT JOIN cash_by_month
    ON cash_by_month.month_start = months.month_start
  ORDER BY months.month_start;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finance_summary() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.finance_monthly_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_monthly_summary(integer) TO authenticated;


-- ============================================================
-- MIGRATION: 20260810133528_finance_expense_workflow.sql
-- ============================================================
-- Idempotent treasury expense workflow. Accounting rows remain append-only;
-- reversals will be represented by explicit counter-entries, never deletion.
CREATE OR REPLACE FUNCTION public.record_cash_expense(
  p_document_number text,
  p_description text,
  p_category text,
  p_amount numeric,
  p_method text,
  p_reference text DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT now()
)
RETURNS public.cash_entries
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  school uuid := (SELECT public.current_school_id());
  entry public.cash_entries;
BEGIN
  IF NOT COALESCE((SELECT public.can_manage_finance()), false) THEN
    RAISE EXCEPTION 'insufficient permissions to record expense' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_document_number), '') IS NULL THEN
    RAISE EXCEPTION 'expense document number is required';
  END IF;
  IF NULLIF(btrim(p_description), '') IS NULL OR char_length(btrim(p_description)) > 500 THEN
    RAISE EXCEPTION 'expense description is invalid';
  END IF;
  IF NULLIF(btrim(p_category), '') IS NULL OR char_length(btrim(p_category)) > 80 THEN
    RAISE EXCEPTION 'expense category is invalid';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'expense amount must be positive';
  END IF;
  IF p_method NOT IN ('cash', 'multicaixa', 'transfer', 'express') THEN
    RAISE EXCEPTION 'invalid expense method';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(school::text || ':' || btrim(p_document_number), 0)
  );

  SELECT * INTO entry FROM public.cash_entries
  WHERE school_id = school AND document_number = btrim(p_document_number);
  IF FOUND THEN
    IF entry.direction = 'out'
      AND entry.description = btrim(p_description)
      AND entry.category = btrim(p_category)
      AND entry.amount = p_amount
      AND entry.method = p_method
    THEN
      RETURN entry;
    END IF;
    RAISE EXCEPTION 'cash document number already used';
  END IF;

  PERFORM set_config('app.finance_workflow_user', (SELECT auth.uid())::text, true);

  INSERT INTO public.cash_entries (
    school_id, document_number, direction, category, description, amount,
    method, reference, occurred_at, created_by
  ) VALUES (
    school, btrim(p_document_number), 'out', btrim(p_category), btrim(p_description),
    p_amount, p_method, NULLIF(btrim(p_reference), ''), COALESCE(p_occurred_at, now()),
    (SELECT auth.uid())
  ) RETURNING * INTO entry;

  RETURN entry;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_cash_expense(
  text, text, text, numeric, text, text, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_cash_expense(
  text, text, text, numeric, text, text, timestamptz
) TO authenticated;


-- ============================================================
-- MIGRATION: 20260810133724_finance_reversals.sql
-- ============================================================
-- Append-only reversal ledger. Original rows are retained and marked reversed;
-- invoice balances are restored atomically when the entry came from a payment.
CREATE TABLE public.financial_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  cash_entry_id uuid NOT NULL,
  payment_id uuid,
  reason text NOT NULL CHECK (
    reason = btrim(reason) AND char_length(reason) BETWEEN 3 AND 500
  ),
  reversed_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_reversals_cash_entry_key UNIQUE (cash_entry_id),
  CONSTRAINT financial_reversals_cash_entry_fkey
    FOREIGN KEY (school_id, cash_entry_id)
    REFERENCES public.cash_entries (school_id, id),
  CONSTRAINT financial_reversals_payment_fkey
    FOREIGN KEY (school_id, payment_id)
    REFERENCES public.payments (school_id, id)
);

CREATE INDEX financial_reversals_school_recent_idx
  ON public.financial_reversals (school_id, created_at DESC);

GRANT SELECT, INSERT ON public.financial_reversals TO authenticated;
GRANT ALL ON public.financial_reversals TO service_role;
ALTER TABLE public.financial_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_reversals FORCE ROW LEVEL SECURITY;

CREATE POLICY "Finance roles read reversals"
  ON public.financial_reversals FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.can_manage_finance())
  );
CREATE POLICY "Finance workflows create reversals"
  ON public.financial_reversals FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND reversed_by = (SELECT auth.uid())
    AND (SELECT public.can_manage_finance())
  );

CREATE TRIGGER financial_reversals_require_workflow
  BEFORE INSERT ON public.financial_reversals
  FOR EACH ROW EXECUTE FUNCTION private.require_finance_workflow();

CREATE OR REPLACE FUNCTION public.reverse_cash_entry(
  p_cash_entry_id uuid,
  p_reason text
)
RETURNS public.financial_reversals
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  school uuid := (SELECT public.current_school_id());
  entry public.cash_entries;
  payment public.payments;
  reversal public.financial_reversals;
  allocation record;
  new_paid numeric(14,2);
BEGIN
  IF NOT COALESCE((SELECT public.can_manage_finance()), false) THEN
    RAISE EXCEPTION 'insufficient permissions to reverse cash entry' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'reversal reason must contain between 3 and 500 characters';
  END IF;

  SELECT * INTO entry FROM public.cash_entries
  WHERE school_id = school AND id = p_cash_entry_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cash entry not found';
  END IF;

  SELECT * INTO reversal FROM public.financial_reversals
  WHERE school_id = school AND cash_entry_id = entry.id;
  IF FOUND THEN
    RETURN reversal;
  END IF;
  IF entry.status <> 'posted' THEN
    RAISE EXCEPTION 'cash entry is not reversible';
  END IF;

  PERFORM set_config('app.finance_workflow_user', (SELECT auth.uid())::text, true);
  PERFORM set_config('app.audit_reason', btrim(p_reason), true);

  IF entry.payment_id IS NOT NULL THEN
    SELECT * INTO payment FROM public.payments
    WHERE school_id = school AND id = entry.payment_id
    FOR UPDATE;
    IF NOT FOUND OR payment.status <> 'confirmed' THEN
      RAISE EXCEPTION 'confirmed payment not found for cash entry';
    END IF;

    FOR allocation IN
      SELECT invoice_id, sum(amount) AS amount
      FROM public.payment_allocations
      WHERE school_id = school AND payment_id = payment.id
      GROUP BY invoice_id
      ORDER BY invoice_id
    LOOP
      UPDATE public.invoices
      SET amount_paid = amount_paid - allocation.amount,
          status = CASE
            WHEN amount_paid - allocation.amount = 0 THEN 'issued'
            ELSE 'partial'
          END
      WHERE school_id = school
        AND id = allocation.invoice_id
        AND amount_paid >= allocation.amount
      RETURNING amount_paid INTO new_paid;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'invoice balance is inconsistent during reversal';
      END IF;
    END LOOP;

    UPDATE public.payments SET status = 'reversed' WHERE id = payment.id;
  END IF;

  UPDATE public.cash_entries SET status = 'reversed' WHERE id = entry.id;

  INSERT INTO public.financial_reversals (
    school_id, cash_entry_id, payment_id, reason, reversed_by
  ) VALUES (
    school, entry.id, entry.payment_id, btrim(p_reason), (SELECT auth.uid())
  ) RETURNING * INTO reversal;

  RETURN reversal;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reverse_cash_entry(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_cash_entry(uuid, text) TO authenticated;


-- ============================================================
-- MIGRATION: 20260810133951_finance_category_reporting.sql
-- ============================================================
CREATE INDEX cash_entries_category_reporting_idx
  ON public.cash_entries (school_id, direction, category)
  WHERE status = 'posted';

CREATE OR REPLACE FUNCTION public.finance_category_summary()
RETURNS TABLE (
  direction text,
  category text,
  amount numeric,
  entry_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  school uuid := (SELECT public.current_school_id());
BEGIN
  IF NOT COALESCE((SELECT public.can_manage_finance()), false) THEN
    RAISE EXCEPTION 'insufficient permissions to read finance categories' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT entry.direction, entry.category, sum(entry.amount), count(*)
  FROM public.cash_entries AS entry
  WHERE entry.school_id = school AND entry.status = 'posted'
  GROUP BY entry.direction, entry.category
  ORDER BY entry.direction, sum(entry.amount) DESC, entry.category;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finance_category_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_category_summary() TO authenticated;


-- ============================================================
-- MIGRATION: 20260810134139_document_workflow.sql
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_manage_documents()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT public.current_profile_role()) IN ('Administrador', 'Secretaria'),
    false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_documents() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_documents() TO authenticated;

CREATE TABLE public.document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  fee_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  turnaround_days smallint NOT NULL DEFAULT 1 CHECK (turnaround_days BETWEEN 0 AND 120),
  requires_payment boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT document_templates_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT document_templates_school_code_key UNIQUE (school_id, code),
  CONSTRAINT document_templates_name_valid CHECK (
    name = btrim(name) AND char_length(name) BETWEEN 2 AND 160
  )
);

INSERT INTO public.document_templates (
  school_id, code, name, fee_amount, turnaround_days, requires_payment
)
SELECT school.id, seed.code, seed.name, seed.fee, seed.days, true
FROM public.schools AS school
CROSS JOIN (VALUES
  ('enrollment_declaration', 'Declaração de Matrícula', 2500::numeric, 1::smallint),
  ('grade_declaration', 'Declaração com Notas', 3500::numeric, 2::smallint),
  ('completion_certificate', 'Certificado de Habilitações', 15000::numeric, 5::smallint),
  ('report_card', 'Boletim de Notas', 1500::numeric, 1::smallint),
  ('transfer_request', 'Pedido de Transferência', 5000::numeric, 3::smallint)
) AS seed(code, name, fee, days)
ON CONFLICT (school_id, code) DO NOTHING;

CREATE TABLE public.document_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  request_number text NOT NULL CHECK (
    request_number = btrim(request_number)
    AND char_length(request_number) BETWEEN 1 AND 64
  ),
  student_id uuid NOT NULL,
  template_id uuid NOT NULL,
  template_name text NOT NULL,
  fee_amount numeric(14,2) NOT NULL CHECK (fee_amount >= 0),
  status text NOT NULL CHECK (
    status IN ('pending_payment', 'queued', 'processing', 'ready', 'delivered', 'cancelled')
  ),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'urgent')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  due_on date NOT NULL,
  completed_at timestamptz,
  assigned_to uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT document_requests_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT document_requests_school_number_key UNIQUE (school_id, request_number),
  CONSTRAINT document_requests_student_fkey FOREIGN KEY (school_id, student_id)
    REFERENCES public.students (school_id, id),
  CONSTRAINT document_requests_template_fkey FOREIGN KEY (school_id, template_id)
    REFERENCES public.document_templates (school_id, id)
);

CREATE TABLE public.document_request_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  previous_status text,
  new_status text NOT NULL,
  reason text,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_request_history_request_fkey
    FOREIGN KEY (school_id, request_id)
    REFERENCES public.document_requests (school_id, id) ON DELETE CASCADE
);

CREATE INDEX document_requests_queue_idx
  ON public.document_requests (school_id, status, due_on, priority);
CREATE INDEX document_requests_student_recent_idx
  ON public.document_requests (school_id, student_id, requested_at DESC);
CREATE INDEX document_request_history_request_idx
  ON public.document_request_status_history (school_id, request_id, created_at DESC);

CREATE TRIGGER document_templates_set_updated_at BEFORE UPDATE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER document_requests_set_updated_at BEFORE UPDATE ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER document_templates_protect_identity BEFORE UPDATE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_column_changes(
    'id', 'school_id', 'created_at', 'created_by'
  );
CREATE TRIGGER document_requests_protect_identity BEFORE UPDATE ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_column_changes(
    'id', 'school_id', 'request_number', 'student_id', 'template_id', 'template_name',
    'fee_amount', 'requested_at', 'created_at', 'created_by'
  );

CREATE OR REPLACE FUNCTION private.require_document_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('app.document_workflow_user', true)
    IS DISTINCT FROM (SELECT auth.uid())::text
  THEN
    RAISE EXCEPTION 'document writes require an approved workflow' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.require_document_workflow()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER document_requests_require_workflow
  BEFORE INSERT OR UPDATE OF status, student_id, template_id, fee_amount
  ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION private.require_document_workflow();

CREATE OR REPLACE FUNCTION private.record_document_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.document_request_status_history (
      school_id, request_id, previous_status, new_status, reason, changed_by
    ) VALUES (
      NEW.school_id,
      NEW.id,
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
      NEW.status,
      NULLIF(current_setting('app.document_status_reason', true), ''),
      (SELECT auth.uid())
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.record_document_status_change()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER document_requests_record_status
  AFTER INSERT OR UPDATE OF status ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION private.record_document_status_change();

GRANT SELECT ON public.document_templates, public.document_requests,
  public.document_request_status_history TO authenticated;
GRANT INSERT, UPDATE ON public.document_requests TO authenticated;
GRANT ALL ON public.document_templates, public.document_requests,
  public.document_request_status_history TO service_role;

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.document_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.document_request_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_request_status_history FORCE ROW LEVEL SECURITY;

CREATE POLICY "Document roles read templates" ON public.document_templates
  FOR SELECT TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND (SELECT public.can_manage_documents()));
CREATE POLICY "Document roles read requests" ON public.document_requests
  FOR SELECT TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND (SELECT public.can_manage_documents()));
CREATE POLICY "Document workflows create requests" ON public.document_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
    AND (SELECT public.can_manage_documents())
  );
CREATE POLICY "Document roles update requests" ON public.document_requests
  FOR UPDATE TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND (SELECT public.can_manage_documents()))
  WITH CHECK (school_id = (SELECT public.current_school_id()) AND (SELECT public.can_manage_documents()));
CREATE POLICY "Document roles read request history" ON public.document_request_status_history
  FOR SELECT TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND (SELECT public.can_manage_documents()));

CREATE OR REPLACE FUNCTION public.create_document_request(
  p_student_id uuid,
  p_template_id uuid,
  p_request_number text,
  p_priority text DEFAULT 'normal',
  p_due_on date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS public.document_requests
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  school uuid := (SELECT public.current_school_id());
  template public.document_templates;
  request public.document_requests;
  calculated_due date;
BEGIN
  IF NOT COALESCE((SELECT public.can_manage_documents()), false) THEN
    RAISE EXCEPTION 'insufficient permissions to create document request' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_request_number), '') IS NULL THEN
    RAISE EXCEPTION 'document request number is required';
  END IF;
  IF p_priority NOT IN ('normal', 'urgent') THEN
    RAISE EXCEPTION 'invalid document priority';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.students
    WHERE school_id = school AND id = p_student_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'student not found';
  END IF;

  SELECT * INTO template FROM public.document_templates
  WHERE school_id = school AND id = p_template_id AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'document template not found';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(school::text || ':' || btrim(p_request_number), 0)
  );
  SELECT * INTO request FROM public.document_requests
  WHERE school_id = school AND request_number = btrim(p_request_number);
  IF FOUND THEN
    IF request.student_id = p_student_id AND request.template_id = p_template_id THEN
      RETURN request;
    END IF;
    RAISE EXCEPTION 'document request number already used';
  END IF;

  calculated_due := COALESCE(
    p_due_on,
    CURRENT_DATE + CASE
      WHEN p_priority = 'urgent' THEN GREATEST(1, CEIL(template.turnaround_days / 2.0)::integer)
      ELSE template.turnaround_days
    END
  );
  IF calculated_due < CURRENT_DATE THEN
    RAISE EXCEPTION 'document due date cannot be in the past';
  END IF;

  PERFORM set_config('app.document_workflow_user', (SELECT auth.uid())::text, true);
  PERFORM set_config('app.document_status_reason', 'Pedido registado', true);

  INSERT INTO public.document_requests (
    school_id, request_number, student_id, template_id, template_name,
    fee_amount, status, priority, due_on, assigned_to, notes, created_by
  ) VALUES (
    school, btrim(p_request_number), p_student_id, template.id, template.name,
    template.fee_amount,
    CASE WHEN template.requires_payment AND template.fee_amount > 0
      THEN 'pending_payment' ELSE 'queued' END,
    p_priority, calculated_due, (SELECT auth.uid()), NULLIF(btrim(p_notes), ''),
    (SELECT auth.uid())
  ) RETURNING * INTO request;

  RETURN request;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_document_request(uuid, uuid, text, text, date, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_document_request(uuid, uuid, text, text, date, text)
  TO authenticated;

CREATE TRIGGER document_requests_audit_change
  AFTER INSERT OR UPDATE ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION private.audit_domain_change();


-- ============================================================
-- MIGRATION: 20260810140500_profile_avatar.sql
-- ============================================================
ALTER TABLE public.profiles ADD COLUMN avatar_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can replace their own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);


-- FASE 5: ROW LEVEL SECURITY (RLS) PARA TABELAS ACADÉMICAS

-- 1. Activar RLS para todas as tabelas académicas que ainda não têm
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.term_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_schedule_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_status_history ENABLE ROW LEVEL SECURITY;

-- 2. Conceder acessos básicos (GRANTS)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_guardians TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grade_levels TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.term_grades TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_schedule_slots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrollments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_status_history TO authenticated;

-- 3. Criar Políticas Baseadas na Função is_school_member (já existente no APPLY_ENROLLMENT)

-- Students
CREATE POLICY "School members can access students" ON public.students
  FOR ALL TO authenticated USING (public.is_school_member(school_id));

-- Student Guardians
CREATE POLICY "School members can access student guardians" ON public.student_guardians
  FOR ALL TO authenticated USING (public.is_school_member(school_id));

-- Courses
CREATE POLICY "School members can access courses" ON public.courses
  FOR ALL TO authenticated USING (public.is_school_member(school_id));

-- Grade Levels
CREATE POLICY "School members can access grade levels" ON public.grade_levels
  FOR ALL TO authenticated USING (public.is_school_member(school_id));

-- Rooms
CREATE POLICY "School members can access rooms" ON public.rooms
  FOR ALL TO authenticated USING (public.is_school_member(school_id));

-- Class Groups
CREATE POLICY "School members can access class groups" ON public.class_groups
  FOR ALL TO authenticated USING (public.is_school_member(school_id));

-- Subjects
CREATE POLICY "School members can access subjects" ON public.subjects
  FOR ALL TO authenticated USING (public.is_school_member(school_id));

-- Term Grades
CREATE POLICY "School members can access term grades" ON public.term_grades
  FOR ALL TO authenticated USING (public.is_school_member(school_id));

-- Class Schedule Slots
CREATE POLICY "School members can access class schedule slots" ON public.class_schedule_slots
  FOR ALL TO authenticated USING (public.is_school_member(school_id));

-- Enrollments
CREATE POLICY "School members can access enrollments" ON public.enrollments
  FOR ALL TO authenticated USING (public.is_school_member(school_id));

-- Student Status History
CREATE POLICY "School members can access student status history" ON public.student_status_history
  FOR ALL TO authenticated USING (public.is_school_member(school_id));
-- FASE 11: Activar Supabase Realtime para mensagens diretas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'siga_direct_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.siga_direct_messages;
  END IF;
END $$;
-- FASE 11: Activar Supabase Realtime para comunicados
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'school_announcements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.school_announcements;
  END IF;
END $$;
-- FASE 11: Activar Supabase Realtime para todos os canais da UI
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'students',
    'enrollments',
    'siga_document_requests',
    'invoices',
    'payments'
  ]) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
