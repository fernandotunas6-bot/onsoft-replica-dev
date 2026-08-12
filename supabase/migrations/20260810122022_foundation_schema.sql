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
