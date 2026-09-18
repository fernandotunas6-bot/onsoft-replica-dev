-- RBAC: memberships, roles, permissions, member roles, invitations
CREATE TABLE IF NOT EXISTS public.school_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','suspended','archived','inactive')),
  joined_at timestamptz DEFAULT now(),
  invited_at timestamptz,
  activated_at timestamptz DEFAULT now(),
  suspended_at timestamptz,
  last_access_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS school_memberships_school_user_idx ON public.school_memberships (school_id, user_id);
CREATE INDEX IF NOT EXISTS school_memberships_user_status_idx ON public.school_memberships (user_id, status);
CREATE INDEX IF NOT EXISTS school_memberships_school_status_idx ON public.school_memberships (school_id, status);

DROP TRIGGER IF EXISTS school_memberships_set_updated_at ON public.school_memberships;
CREATE TRIGGER school_memberships_set_updated_at
  BEFORE UPDATE ON public.school_memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS roles_global_code_idx ON public.roles (code) WHERE school_id IS NULL;
CREATE INDEX IF NOT EXISTS roles_school_code_idx ON public.roles (school_id, code);

CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  module text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.member_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES public.school_memberships(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (membership_id, role_id)
);

CREATE TABLE IF NOT EXISTS public.school_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  email text NOT NULL,
  role_code text NOT NULL DEFAULT 'teacher',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired','revoked')),
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS school_invitations_school_email_idx ON public.school_invitations (school_id, lower(email));
CREATE INDEX IF NOT EXISTS school_invitations_token_hash_idx ON public.school_invitations (token_hash) WHERE status = 'pending';

DROP TRIGGER IF EXISTS school_invitations_set_updated_at ON public.school_invitations;
CREATE TRIGGER school_invitations_set_updated_at
  BEFORE UPDATE ON public.school_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Grants
GRANT SELECT ON public.school_memberships TO authenticated;
GRANT ALL ON public.school_memberships TO service_role;
GRANT SELECT ON public.roles TO authenticated;
GRANT ALL ON public.roles TO service_role;
GRANT SELECT ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
GRANT SELECT ON public.member_roles TO authenticated;
GRANT ALL ON public.member_roles TO service_role;
GRANT SELECT ON public.school_invitations TO authenticated;
GRANT ALL ON public.school_invitations TO service_role;

ALTER TABLE public.school_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own memberships" ON public.school_memberships;
CREATE POLICY "Users can read own memberships"
  ON public.school_memberships FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_school_member(school_id));

DROP POLICY IF EXISTS "Read roles authenticated" ON public.roles;
CREATE POLICY "Read roles authenticated" ON public.roles
  FOR SELECT TO authenticated USING (school_id IS NULL OR public.is_school_member(school_id));

DROP POLICY IF EXISTS "Read permissions authenticated" ON public.permissions;
CREATE POLICY "Read permissions authenticated" ON public.permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Read role_permissions authenticated" ON public.role_permissions;
CREATE POLICY "Read role_permissions authenticated" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Read member_roles in own school" ON public.member_roles;
CREATE POLICY "Read member_roles in own school" ON public.member_roles
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.school_memberships sm
    WHERE sm.id = public.member_roles.membership_id
      AND (sm.user_id = (SELECT auth.uid()) OR public.is_school_member(sm.school_id))
  ));

DROP POLICY IF EXISTS "Read invitations in own school" ON public.school_invitations;
CREATE POLICY "Read invitations in own school" ON public.school_invitations
  FOR SELECT TO authenticated USING (public.is_school_member(school_id));

-- System roles
INSERT INTO public.roles (school_id, code, name, description, is_system)
SELECT NULL, v.code, v.name, v.description, true
FROM (VALUES
  ('admin','Administrador','Acesso total à escola'),
  ('secretary','Secretaria','Alunos, matrículas e documentos'),
  ('treasury','Tesouraria','Financeiro e caixa'),
  ('teacher','Professor','Turmas, notas e presenças'),
  ('guardian','Encarregado','Consulta do aluno'),
  ('student','Aluno','Consulta pessoal')
) AS v(code, name, description)
WHERE NOT EXISTS (SELECT 1 FROM public.roles r WHERE r.school_id IS NULL AND r.code = v.code);

-- Membership sync from profiles (a profile always implies a membership + role)
CREATE OR REPLACE FUNCTION public.sync_membership_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_membership uuid;
  v_role_code text;
  v_role uuid;
BEGIN
  IF NEW.school_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.school_memberships (school_id, user_id, status)
  VALUES (NEW.school_id, NEW.id, 'active')
  ON CONFLICT (school_id, user_id) DO UPDATE SET status = 'active', updated_at = now()
  RETURNING id INTO v_membership;

  IF v_membership IS NULL THEN
    SELECT id INTO v_membership FROM public.school_memberships
    WHERE school_id = NEW.school_id AND user_id = NEW.id;
  END IF;

  v_role_code := CASE NEW.cargo
    WHEN 'Administrador' THEN 'admin'
    WHEN 'Secretaria' THEN 'secretary'
    WHEN 'Tesouraria' THEN 'treasury'
    WHEN 'Professor' THEN 'teacher'
    WHEN 'Encarregado' THEN 'guardian'
    WHEN 'Aluno' THEN 'student'
    ELSE 'secretary'
  END;

  SELECT id INTO v_role FROM public.roles WHERE school_id IS NULL AND code = v_role_code LIMIT 1;
  IF v_role IS NULL THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.member_roles WHERE membership_id = v_membership AND role_id <> v_role;
  INSERT INTO public.member_roles (school_id, membership_id, role_id)
  VALUES (NEW.school_id, v_membership, v_role)
  ON CONFLICT (membership_id, role_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_membership_from_profile() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS profiles_sync_membership ON public.profiles;
CREATE TRIGGER profiles_sync_membership
  AFTER INSERT OR UPDATE OF school_id, cargo ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_membership_from_profile();

-- is_school_member now also honours memberships
CREATE OR REPLACE FUNCTION public.is_school_member(p_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_school_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid()) AND school_id = p_school_id
    )
    OR EXISTS (
      SELECT 1 FROM public.school_memberships
      WHERE user_id = (SELECT auth.uid()) AND school_id = p_school_id AND status = 'active'
    )
  );
$$;

REVOKE ALL ON FUNCTION public.is_school_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_school_member(uuid) TO authenticated, service_role;
