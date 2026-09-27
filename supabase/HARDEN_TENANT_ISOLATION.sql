-- ⚠️  NÃO CORRER NA PRODUÇÃO (2026-09-28).
-- Este script manual antigo recria políticas que as migrações de 2026-09-25 a
-- 2026-09-28 corrigiram (matrículas abertas a alunos, logótipos sem escola,
-- arquivo legível por qualquer membro, escrita só com is_school_member…).
-- A fonte de verdade é supabase/migrations/. Ver docs/agents/CONTINUE.md.

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
--   4. Impedir membros comuns de administrarem grants, integrações, pagamentos
--      e avaliações apenas por possuírem uma membership activa.
--   5. Separar isolamento (school_id) de autorização (role/cargo).
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
    WHEN count(*) = 1 THEN min(sm.school_id::text)::uuid
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

ALTER TABLE public.member_roles ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

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
      ORDER BY r.code ASC
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

-- Helper central para policies. Os nomes são comparados sem distinção de
-- maiúsculas/minúsculas; cada policy continua a declarar explicitamente quais
-- funções podem efectuar a operação.
CREATE OR REPLACE FUNCTION public.current_school_role_is(p_allowed_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    public.current_school_id() IS NOT NULL
    AND lower(public.current_profile_role()) = ANY (p_allowed_roles);
$$;

REVOKE ALL ON FUNCTION public.current_school_role_is(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_school_role_is(text[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.current_school_role_is(text[]) IS
  'Confirma que existe uma escola corrente não ambígua e que a role dessa escola pertence à allowlist recebida.';

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
-- 4. Grants de módulos.
--    - cada colaborador lê apenas os próprios grants;
--    - administração/direcção pode ler e gerir grants da escola corrente.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Read own or admin staff grants" ON public.staff_module_grants;
CREATE POLICY "Read own or admin staff grants"
  ON public.staff_module_grants
  FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND public.is_school_member(school_id)
    AND (
      user_id = (SELECT auth.uid())
      OR public.current_school_role_is(
        ARRAY['owner','admin','administrator','administrador','diretor geral','director geral']::text[]
      )
    )
  );

DROP POLICY IF EXISTS "Admins manage staff grants" ON public.staff_module_grants;
CREATE POLICY "Admins manage staff grants"
  ON public.staff_module_grants
  FOR ALL TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND public.is_school_member(school_id)
    AND public.current_school_role_is(
      ARRAY['owner','admin','administrator','administrador','diretor geral','director geral']::text[]
    )
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND public.is_school_member(school_id)
    AND public.current_school_role_is(
      ARRAY['owner','admin','administrator','administrador','diretor geral','director geral']::text[]
    )
  );

-- -----------------------------------------------------------------------------
-- 5. Integrações da escola.
--    Configuração de providers pode conter parâmetros operacionais sensíveis;
--    somente administração/direcção pode ler ou alterar.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Manage school integrations in own school" ON public.school_integrations;
CREATE POLICY "Manage school integrations in own school"
  ON public.school_integrations
  FOR ALL TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND public.is_school_member(school_id)
    AND public.current_school_role_is(
      ARRAY['owner','admin','administrator','administrador','diretor geral','director geral']::text[]
    )
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND public.is_school_member(school_id)
    AND public.current_school_role_is(
      ARRAY['owner','admin','administrator','administrador','diretor geral','director geral']::text[]
    )
  );

-- -----------------------------------------------------------------------------
-- 6. Planos de pagamento.
--    Escrita/leitura operacional limitada à administração e financeiro.
--    Portais de aluno/encarregado devem usar endpoints próprios e filtros por
--    aluno/conta, em vez de conceder SELECT global nesta tabela.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Manage payment plans in own school" ON public.finance_payment_plans;
CREATE POLICY "Manage payment plans in own school"
  ON public.finance_payment_plans
  FOR ALL TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND public.is_school_member(school_id)
    AND public.current_school_role_is(
      ARRAY['owner','admin','administrator','administrador','diretor geral','director geral','tesouraria','treasury','finance','financeiro']::text[]
    )
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND public.is_school_member(school_id)
    AND public.current_school_role_is(
      ARRAY['owner','admin','administrator','administrador','diretor geral','director geral','tesouraria','treasury','finance','financeiro']::text[]
    )
  );

-- -----------------------------------------------------------------------------
-- 7. Estrutura e lançamento de avaliações.
--    Professores podem trabalhar nas avaliações da escola corrente; membros
--    comuns/encarregados não ganham escrita apenas por serem membros.
--    O refinamento por disciplina/turma atribuída deve continuar no backend.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Manage assessment items in own school" ON public.siga_assessment_items;
CREATE POLICY "Manage assessment items in own school"
  ON public.siga_assessment_items
  FOR ALL TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND public.is_school_member(school_id)
    AND public.current_school_role_is(
      ARRAY['owner','admin','administrator','administrador','diretor geral','director geral','coordenação pedagógica','coordenacao pedagogica','professor','teacher']::text[]
    )
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND public.is_school_member(school_id)
    AND public.current_school_role_is(
      ARRAY['owner','admin','administrator','administrador','diretor geral','director geral','coordenação pedagógica','coordenacao pedagogica','professor','teacher']::text[]
    )
  );

DROP POLICY IF EXISTS "Manage assessment scores in own school" ON public.siga_assessment_scores;
CREATE POLICY "Manage assessment scores in own school"
  ON public.siga_assessment_scores
  FOR ALL TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND public.is_school_member(school_id)
    AND public.current_school_role_is(
      ARRAY['owner','admin','administrator','administrador','diretor geral','director geral','coordenação pedagógica','coordenacao pedagogica','professor','teacher']::text[]
    )
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND public.is_school_member(school_id)
    AND public.current_school_role_is(
      ARRAY['owner','admin','administrator','administrador','diretor geral','director geral','coordenação pedagógica','coordenacao pedagogica','professor','teacher']::text[]
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
-- 3. Utilizador da Escola A deve falhar ao INSERT/UPDATE em recursos da Escola B:
--      storage.objects (school-logos), staff_module_grants,
--      school_integrations, finance_payment_plans,
--      siga_assessment_items e siga_assessment_scores.
--
-- 4. Membro comum da Escola A:
--      - pode ler apenas os próprios staff_module_grants;
--      - não pode gerir grants, integrações, planos de pagamento ou avaliações.
--
-- 5. Tesouraria/financeiro:
--      - pode gerir finance_payment_plans da escola corrente;
--      - não ganha acesso de gestão a avaliações ou integrações.
--
-- 6. Professor:
--      - pode gerir assessment_items/scores da escola corrente;
--      - não ganha acesso a grants, integrações ou planos financeiros.
--
-- IMPORTANTE: para professores, esta policy é apenas o primeiro portão. O
-- backend deve ainda validar disciplina/turma atribuída antes de aceitar uma
-- alteração de nota.
-- =============================================================================
