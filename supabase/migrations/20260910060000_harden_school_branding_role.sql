-- =============================================================================
-- SIGA PLUS — HARDEN SCHOOL BRANDING ROLE
-- =============================================================================
-- Restringe a gestão de identidade visual escolar (school_branding)
-- exclusivamente aos papéis administrativos da escola ou platform_admin,
-- impedindo que membros comuns (alunos, professores, encarregados) alterem
-- logótipos, títulos ou cores da instituição via cliente Supabase.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS "school_admin_manage_branding" ON public.school_branding;
CREATE POLICY "school_admin_manage_branding" ON public.school_branding
  FOR ALL TO authenticated
  USING (
    (
      school_id = (SELECT public.current_school_id())
      AND public.current_school_role_is(
        ARRAY['owner','admin','administrator','administrador','diretor geral','director geral']::text[]
      )
    )
    OR public.is_platform_admin()
  )
  WITH CHECK (
    (
      school_id = (SELECT public.current_school_id())
      AND public.current_school_role_is(
        ARRAY['owner','admin','administrator','administrador','diretor geral','director geral']::text[]
      )
    )
    OR public.is_platform_admin()
  );

COMMENT ON POLICY "school_admin_manage_branding" ON public.school_branding IS
  'Permite escrita na identidade visual apenas a administradores da escola corrente ou platform admins.';

COMMIT;
