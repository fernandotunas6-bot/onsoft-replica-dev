-- Retrato mínimo da produção (2026-10-04, só leitura) para ensaiar a leitura de
-- school_announcements: colunas, tipos, defaults e NOT NULL da tabela; a definição
-- de public.is_school_member e a única política de leitura que existia.
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
GRANT USAGE ON SCHEMA public, private, auth TO authenticated;

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE public.school_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active'
);
CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL
);
CREATE TABLE public.member_roles (
  school_id uuid NOT NULL,
  membership_id uuid NOT NULL REFERENCES public.school_memberships(id),
  role_id uuid NOT NULL REFERENCES public.roles(id),
  PRIMARY KEY (school_id, membership_id, role_id)
);

CREATE TABLE public.school_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'all_guardians',
  channel text NOT NULL DEFAULT 'portal',
  status text NOT NULL DEFAULT 'draft',
  scheduled_for date,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE OR REPLACE FUNCTION public.is_school_member(p_school_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.school_memberships
    WHERE school_id = p_school_id
      AND user_id = (SELECT auth.uid())
      AND status = 'active'
  );
$function$;

ALTER TABLE public.school_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_announcements FORCE ROW LEVEL SECURITY;
GRANT SELECT ON public.school_announcements TO authenticated;
CREATE POLICY "Read school announcements" ON public.school_announcements
  FOR SELECT TO authenticated
  USING (is_school_member(school_id) AND (deleted_at IS NULL));
