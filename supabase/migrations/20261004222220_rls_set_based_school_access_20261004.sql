-- CAPTURADA da produção (supabase_migrations.schema_migrations, versão 20261004222220).
-- Aplicada a 2026-10-04 fora do repositório (conta do dono). Trazida para cá a 2026-10-05.
-- Corpo sem alterações, md5 confirmado. Correcções vão numa migração nova.
-- @@corpo-capturado@@
-- Funções de conjunto: calculadas uma vez por consulta (hashed subplan),
-- em vez de uma chamada por linha. Lógica idêntica às funções booleanas originais.
CREATE OR REPLACE FUNCTION private.user_member_school_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT sm.school_id FROM public.school_memberships sm
  WHERE sm.user_id = (SELECT auth.uid()) AND sm.status = 'active' AND sm.school_id IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION private.user_role_school_ids(p_codes text[])
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT sm.school_id
  FROM public.school_memberships sm
  JOIN public.member_roles mr ON mr.membership_id = sm.id
  JOIN public.roles r ON r.id = mr.role_id
  WHERE sm.user_id = (SELECT auth.uid()) AND sm.status = 'active' AND sm.school_id IS NOT NULL
    AND lower(btrim(r.code)) = ANY (p_codes)
$$;

CREATE OR REPLACE FUNCTION private.user_permission_school_ids(permission_code text)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT m.school_id
  FROM public.school_memberships m
  JOIN public.member_roles mr ON mr.school_id = m.school_id AND mr.membership_id = m.id
  JOIN public.role_permissions rp ON rp.school_id = mr.school_id AND rp.role_id = mr.role_id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND m.user_id = (SELECT auth.uid()) AND m.status = 'active' AND m.school_id IS NOT NULL
    AND p.code = permission_code
$$;

REVOKE ALL ON FUNCTION private.user_member_school_ids(), private.user_role_school_ids(text[]),
  private.user_permission_school_ids(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.user_member_school_ids(), private.user_role_school_ids(text[]),
  private.user_permission_school_ids(text) TO authenticated;

-- Reescrita das políticas SELECT
DO $$
DECLARE p record; q text;
  office text := $q$ARRAY['owner','admin','administrador','secretary','secretaria']$q$;
  admin  text := $q$ARRAY['owner','admin','administrador']$q$;
  staff  text := $q$ARRAY['owner','admin','administrador','secretary','secretaria','treasury','tesouraria','finance','teacher','professor']$q$;
BEGIN
  FOR p IN SELECT tablename, policyname, qual FROM pg_policies
           WHERE schemaname='public' AND cmd='SELECT'
             AND qual ~ '(is_school_member|is_school_office|is_school_admin)\(school_id\)|private\.(has_permission|is_active_member|is_school_staff)\(school_id\M'
  LOOP
    q := p.qual;
    q := regexp_replace(q, '\m(public\.)?is_school_member\(school_id\)',
           '(school_id IS NOT NULL AND school_id IN (SELECT private.user_member_school_ids()))', 'g');
    q := regexp_replace(q, '\mprivate\.is_active_member\(school_id\)',
           '(school_id IS NOT NULL AND school_id IN (SELECT private.user_member_school_ids()))', 'g');
    q := regexp_replace(q, '\m(public\.)?is_school_office\(school_id\)',
           '(school_id IS NOT NULL AND school_id IN (SELECT private.user_role_school_ids(' || office || ')))', 'g');
    q := regexp_replace(q, '\m(public\.)?is_school_admin\(school_id\)',
           '(school_id IS NOT NULL AND school_id IN (SELECT private.user_role_school_ids(' || admin || ')))', 'g');
    q := regexp_replace(q, '\mprivate\.is_school_staff\(school_id\)',
           '(school_id IS NOT NULL AND school_id IN (SELECT private.user_role_school_ids(' || staff || ')))', 'g');
    q := regexp_replace(q, $r$\mprivate\.has_permission\(school_id, ('(?:[^']|'')*'::text)\)$r$,
           '(school_id IS NOT NULL AND school_id IN (SELECT private.user_permission_school_ids(\1)))', 'g');
    EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)', p.policyname, p.tablename, q);
  END LOOP;
END $$;
