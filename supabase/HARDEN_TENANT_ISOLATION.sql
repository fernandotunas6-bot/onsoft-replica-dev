-- =============================================================================
-- SIGA PLUS — HARDEN TENANT / SCHOOL ISOLATION
-- =============================================================================
-- Idempotente. Aplicar no projecto SGA depois de APPLY_IN_SQL_EDITOR.sql e
-- APPLY_ENROLLMENT_AND_PREMIUM.sql.
--
-- Objectivos:
--   1. Nunca escolher silenciosamente a primeira escola quando um utilizador
--      possui mais de uma membership activa.
--   2. Nunca herdar uma role de outra escola.
--   3. Limitar escrita de logos ao prefixo da escola efectivamente resolvida.
--   4. Impedir membros comuns de administrarem staff_module_grants.
--
-- Este patch é fail-closed: se o contexto de escola for ambíguo, helpers de
-- school/role devolvem NULL/Utilizador e as policies bloqueiam a operação.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Escola corrente: exactamente uma membership activa ou NULL.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_school_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN count(*) = 1 THEN min(sm.school_id)
    ELSE NULL::uuid
  END
  FROM public.school_memberships sm
  WHERE sm.user_id = (SELECT auth.uid())
    AND sm.status = 'active';
$$;

REVOKE ALL ON FUNCTION public.current_school_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_school_id() TO authenticated, service_role;

COMMENT ON FUNCTION public.current_school_id() IS
  'Resolve a escola apenas quando o utilizador tem exactamente uma membership activa. Em contexto ambíguo devolve NULL para falhar fechado.';

-- -----------------------------------------------------------------------------
-- 2. Role corrente sempre ligada à escola resolvida.
--    O fallback legado profiles.cargo só é aceite quando profiles.school_id
--    coincide com current_school_id().
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH ctx AS (
    SELECT public.current_school_id() AS school_id
  )
  SELECT COALESCE(
    (
      SELECT r.code
      FROM public.school_memberships sm
      JOIN public.member_roles mr ON mr.membership_id = sm.id
      JOIN public.roles r ON r.id = mr.role_id
      CROSS JOIN ctx
      WHERE sm.user_id = (SELECT auth.uid())
        AND sm.status = 'active'
        AND ctx.school_id IS NOT NULL
        AND sm.school_id = ctx.school_id
      ORDER BY mr.created_at ASC NULLS LAST, r.code ASC
      LIMIT 1
    ),
    (
      SELECT p.cargo
      FROM public.profiles p
      CROSS JOIN ctx
      WHERE p.id = (SELECT auth.uid())
        AND ctx.school_id IS NOT NULL
        AND p.school_id = ctx.school_id
      LIMIT 1
    ),
    'Utilizador'
  );
$$;

REVOKE ALL ON FUNCTION public.current_profile_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_role() TO authenticated, service_role;

COMMENT ON FUNCTION public.current_profile_role() IS
  'Devolve role somente da escola resolvida por current_school_id(); nunca reutiliza role de outra membership.';

-- -----------------------------------------------------------------------------
-- 3. School logos: escrita apenas no prefixo da escola corrente.
--    A leitura pública permanece inalterada.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can upload school logos" ON storage.objects;
CREATE POLICY "Authenticated users can upload school logos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'school-logos'
    AND (SELECT public.current_school_id()) IS NOT NULL
    AND split_part(name, '/', 1) = (SELECT public.current_school_id())::text
    AND name ~ (
      '^' || (SELECT public.current_school_id())::text
      || '/logo-[0-9]{13}\.(png|jpg|jpeg|webp|svg)$'
    )
  );

DROP POLICY IF EXISTS "Authenticated users can replace school logos" ON storage.objects;
CREATE POLICY "Authenticated users can replace school logos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'school-logos'
    AND (SELECT public.current_school_id()) IS NOT NULL
    AND split_part(name, '/', 1) = (SELECT public.current_school_id())::text
    AND name ~ (
      '^' || (SELECT public.current_school_id())::text
      || '/logo-[0-9]{13}\.(png|jpg|jpeg|webp|svg)$'
    )
  )
  WITH CHECK (
    bucket_id = 'school-logos'
    AND (SELECT public.current_school_id()) IS NOT NULL
    AND split_part(name, '/', 1) = (SELECT public.current_school_id())::text
    AND name ~ (
      '^' || (SELECT public.current_school_id())::text
      || '/logo-[0-9]{13}\.(png|jpg|jpeg|webp|svg)$'
    )
  );

-- -----------------------------------------------------------------------------
-- 4. Grants de módulos: leitura continua limitada a membros da escola, mas
--    escrita passa a exigir papel administrativo da própria escola.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins manage staff grants" ON public.staff_module_grants;
CREATE POLICY "Admins manage staff grants"
  ON public.staff_module_grants
  FOR ALL TO authenticated
  USING (
    public.is_school_member(school_id)
    AND school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN (
      'owner', 'admin', 'administrator', 'Administrador', 'Diretor Geral'
    )
  )
  WITH CHECK (
    public.is_school_member(school_id)
    AND school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN (
      'owner', 'admin', 'administrator', 'Administrador', 'Diretor Geral'
    )
  );

COMMIT;

-- =============================================================================
-- VERIFICAÇÃO MANUAL RECOMENDADA
-- =============================================================================
-- 1. Utilizador com uma membership activa:
--      SELECT public.current_school_id(), public.current_profile_role();
--    Deve devolver a escola/role correctas.
--
-- 2. Utilizador com duas memberships activas:
--      SELECT public.current_school_id(), public.current_profile_role();
--    Deve devolver NULL / Utilizador (fail-closed).
--
-- 3. Utilizador da Escola A deve falhar ao INSERT/UPDATE em:
--      storage.objects bucket school-logos com prefixo <school_id_da_B>/...
--      public.staff_module_grants da Escola B.
--
-- 4. Membro comum da Escola A deve conseguir ler apenas o que as policies de
--    leitura permitem, mas não administrar staff_module_grants.
-- =============================================================================
