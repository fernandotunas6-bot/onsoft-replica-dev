-- =============================================================================
-- SIGA PLUS — HARDEN TEACHER ASSESSMENT SCOPE
-- =============================================================================
-- Idempotente. Aplicar depois de HARDEN_TENANT_ISOLATION.sql.
--
-- Regra pedagógica:
--   auth.user -> teachers.user_id -> class_subjects.teacher_id
--             -> class_group_id + subject_id -> assessment -> enrollment.
--
-- Professores só podem gerir avaliações/notas das disciplinas e turmas que lhes
-- estão activamente atribuídas. Administração/direcção/coordenação/secretaria
-- mantêm a capacidade operacional na escola corrente.
-- =============================================================================

BEGIN;

ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
UPDATE public.teachers t
SET user_id = p.user_id
FROM public.people p
WHERE p.id = t.person_id AND t.user_id IS NULL AND p.user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.current_teacher_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN count(*) = 1 THEN min(t.id::text)::uuid
    ELSE NULL::uuid
  END
  FROM public.teachers t
  LEFT JOIN public.people p ON p.id = t.person_id
  WHERE t.school_id = public.current_school_id()
    AND (t.user_id = (SELECT auth.uid()) OR p.user_id = (SELECT auth.uid()));
$$;

REVOKE ALL ON FUNCTION public.current_teacher_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_teacher_id() TO authenticated, service_role;

COMMENT ON FUNCTION public.current_teacher_id() IS
  'Resolve o registo docente do utilizador autenticado apenas quando existe exactamente um professor na escola corrente.';

CREATE OR REPLACE FUNCTION public.current_teacher_can_manage_class_subject(
  p_class_group_id uuid,
  p_subject_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    public.current_school_id() IS NOT NULL
    AND public.current_teacher_id() IS NOT NULL
    AND p_class_group_id IS NOT NULL
    AND p_subject_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.class_subjects cs
      WHERE cs.school_id = public.current_school_id()
        AND cs.class_group_id = p_class_group_id
        AND cs.subject_id = p_subject_id
        AND cs.teacher_id = public.current_teacher_id()
        AND cs.status = 'active'
    );
$$;

REVOKE ALL ON FUNCTION public.current_teacher_can_manage_class_subject(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_teacher_can_manage_class_subject(uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.current_teacher_can_manage_class_subject(uuid, uuid) IS
  'Confirma a atribuição activa do professor autenticado à turma e disciplina indicadas.';

CREATE OR REPLACE FUNCTION public.current_user_can_manage_assessment_item(
  p_school_id uuid,
  p_class_group_id uuid,
  p_subject_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    p_school_id = public.current_school_id()
    AND public.is_school_member(p_school_id)
    AND (
      public.current_school_role_is(
        ARRAY[
          'owner','admin','administrator','administrador',
          'diretor geral','director geral',
          'coordenação pedagógica','coordenacao pedagogica',
          'secretaria','secretary'
        ]::text[]
      )
      OR (
        public.current_school_role_is(ARRAY['professor','teacher']::text[])
        AND public.current_teacher_can_manage_class_subject(p_class_group_id, p_subject_id)
      )
    );
$$;

REVOKE ALL ON FUNCTION public.current_user_can_manage_assessment_item(uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_assessment_item(uuid, uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.current_user_can_manage_assessment_item(uuid, uuid, uuid) IS
  'Autoriza gestão de avaliação: administração pedagógica na escola ou professor atribuído à turma/disciplina.';

CREATE OR REPLACE FUNCTION public.current_user_can_manage_assessment_score(
  p_school_id uuid,
  p_item_id uuid,
  p_enrollment_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    p_school_id = public.current_school_id()
    AND EXISTS (
      SELECT 1
      FROM public.siga_assessment_items ai
      JOIN public.enrollments e
        ON e.id = p_enrollment_id
       AND e.school_id = ai.school_id
       AND e.class_group_id = ai.class_group_id
      WHERE ai.id = p_item_id
        AND ai.school_id = p_school_id
        AND public.current_user_can_manage_assessment_item(
          ai.school_id,
          ai.class_group_id,
          ai.subject_id
        )
    );
$$;

REVOKE ALL ON FUNCTION public.current_user_can_manage_assessment_score(uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_assessment_score(uuid, uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.current_user_can_manage_assessment_score(uuid, uuid, uuid) IS
  'Autoriza nota somente quando avaliação e matrícula pertencem à mesma escola/turma e o utilizador pode gerir a avaliação.';

-- Substitui a policy ampla criada por HARDEN_TENANT_ISOLATION.sql.
DROP POLICY IF EXISTS "Manage assessment items in own school" ON public.siga_assessment_items;
DROP POLICY IF EXISTS "Manage assigned assessment items" ON public.siga_assessment_items;
CREATE POLICY "Manage assigned assessment items"
  ON public.siga_assessment_items
  FOR ALL TO authenticated
  USING (
    public.current_user_can_manage_assessment_item(
      school_id,
      class_group_id,
      subject_id
    )
  )
  WITH CHECK (
    public.current_user_can_manage_assessment_item(
      school_id,
      class_group_id,
      subject_id
    )
  );

DROP POLICY IF EXISTS "Manage assessment scores in own school" ON public.siga_assessment_scores;
DROP POLICY IF EXISTS "Manage assigned assessment scores" ON public.siga_assessment_scores;
CREATE POLICY "Manage assigned assessment scores"
  ON public.siga_assessment_scores
  FOR ALL TO authenticated
  USING (
    public.current_user_can_manage_assessment_score(
      school_id,
      item_id,
      enrollment_id
    )
  )
  WITH CHECK (
    public.current_user_can_manage_assessment_score(
      school_id,
      item_id,
      enrollment_id
    )
  );

COMMIT;

-- =============================================================================
-- TESTES DE REGRESSÃO RECOMENDADOS
-- =============================================================================
-- 1. Professor A atribuído a Turma 1 / Matemática:
--    - pode criar/editar avaliação nessa combinação;
--    - pode lançar nota apenas para matrícula da Turma 1.
-- 2. Mesmo professor:
--    - não pode escrever Turma 2 / Matemática sem atribuição;
--    - não pode escrever Turma 1 / Física sem atribuição;
--    - não pode usar enrollment_id de outra turma no score.
-- 3. Professor da Escola A nunca pode escrever recursos da Escola B.
-- 4. Administrador/direcção/coordenação/secretaria continuam limitados à escola
--    corrente e podem gerir as avaliações dessa escola.
-- 5. Utilizador com contexto de escola ambíguo falha fechado.
-- =============================================================================
