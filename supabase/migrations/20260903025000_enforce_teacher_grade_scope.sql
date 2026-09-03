-- SIGA / SGA — defesa em profundidade para lançamentos de notas feitos pelo backend.
-- O backend académico usa service_role depois de autenticar o utilizador. Como service_role
-- ignora RLS, estas triggers validam o actor real gravado em created_by/updated_by/recorded_by.
-- Um Professor sem papel administrativo só pode actuar na turma+disciplina que lhe foi atribuída.

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.sga_actor_has_role(
  p_user_id uuid,
  p_school_id uuid,
  p_codes text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT COALESCE(EXISTS (
    SELECT 1
    FROM public.school_memberships sm
    JOIN public.member_roles mr ON mr.membership_id = sm.id
    JOIN public.roles r ON r.id = mr.role_id
    WHERE sm.user_id = p_user_id
      AND sm.school_id = p_school_id
      AND sm.status = 'active'
      AND lower(r.code) = ANY(p_codes)
  ), false);
$$;

REVOKE ALL ON FUNCTION private.sga_actor_has_role(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.sga_actor_has_role(uuid, uuid, text[]) TO service_role;

CREATE OR REPLACE FUNCTION private.sga_actor_is_academic_manager(
  p_user_id uuid,
  p_school_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT private.sga_actor_has_role(
    p_user_id,
    p_school_id,
    ARRAY['owner','admin','administrador','secretary','secretaria']::text[]
  );
$$;

REVOKE ALL ON FUNCTION private.sga_actor_is_academic_manager(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.sga_actor_is_academic_manager(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION private.sga_actor_is_teacher(
  p_user_id uuid,
  p_school_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT private.sga_actor_has_role(
    p_user_id,
    p_school_id,
    ARRAY['teacher','professor']::text[]
  );
$$;

REVOKE ALL ON FUNCTION private.sga_actor_is_teacher(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.sga_actor_is_teacher(uuid, uuid) TO service_role;

-- Garante que uma alteração estrutural iniciada por Professor nunca atribui a disciplina
-- a outro docente. Administração/Secretaria continuam livres para gerir atribuições.
CREATE OR REPLACE FUNCTION private.enforce_teacher_class_subject_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_actor uuid;
  v_teacher_id uuid;
BEGIN
  v_actor := COALESCE(NEW.updated_by, NEW.created_by);
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF private.sga_actor_is_academic_manager(v_actor, NEW.school_id) THEN
    RETURN NEW;
  END IF;

  IF NOT private.sga_actor_is_teacher(v_actor, NEW.school_id) THEN
    RETURN NEW;
  END IF;

  SELECT t.id
    INTO v_teacher_id
  FROM public.teachers t
  WHERE t.school_id = NEW.school_id
    AND t.user_id = v_actor
    AND t.status = 'active'
  LIMIT 1;

  IF v_teacher_id IS NULL OR NEW.teacher_id IS DISTINCT FROM v_teacher_id THEN
    RAISE EXCEPTION 'Professor sem permissão para atribuir esta turma/disciplina.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_teacher_class_subject_scope() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_teacher_class_subject_scope() TO service_role;

DO $do$
BEGIN
  IF to_regclass('public.class_subjects') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_teacher_class_subject_scope ON public.class_subjects';
    EXECUTE 'CREATE TRIGGER enforce_teacher_class_subject_scope BEFORE INSERT OR UPDATE OF teacher_id ON public.class_subjects FOR EACH ROW EXECUTE FUNCTION private.enforce_teacher_class_subject_scope()';
  END IF;
END
$do$;

-- Notas MAC/NPP/NPT no diário actual.
CREATE OR REPLACE FUNCTION private.enforce_teacher_grade_score_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_actor uuid;
  v_allowed boolean;
BEGIN
  v_actor := COALESCE(NEW.updated_by, NEW.recorded_by);
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF private.sga_actor_is_academic_manager(v_actor, NEW.school_id) THEN
    RETURN NEW;
  END IF;

  IF NOT private.sga_actor_is_teacher(v_actor, NEW.school_id) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.grade_items gi
    JOIN public.gradebooks gb
      ON gb.id = gi.gradebook_id
     AND gb.school_id = gi.school_id
    JOIN public.class_subjects cs
      ON cs.id = gb.class_subject_id
     AND cs.school_id = gb.school_id
    JOIN public.teachers t
      ON t.id = cs.teacher_id
     AND t.school_id = cs.school_id
    JOIN public.enrollments e
      ON e.id = NEW.enrollment_id
     AND e.school_id = NEW.school_id
     AND e.class_group_id = gb.class_group_id
    WHERE gi.id = NEW.grade_item_id
      AND gi.school_id = NEW.school_id
      AND cs.status = 'active'
      AND t.status = 'active'
      AND t.user_id = v_actor
      AND e.status IN ('active','pending')
  ) INTO v_allowed;

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'Professor só pode lançar notas na turma e disciplina que lhe foram atribuídas.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_teacher_grade_score_scope() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_teacher_grade_score_scope() TO service_role;

DO $do$
BEGIN
  IF to_regclass('public.grade_scores') IS NOT NULL
     AND to_regclass('public.grade_items') IS NOT NULL
     AND to_regclass('public.gradebooks') IS NOT NULL
     AND to_regclass('public.class_subjects') IS NOT NULL
     AND to_regclass('public.teachers') IS NOT NULL
     AND to_regclass('public.enrollments') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_teacher_grade_score_scope ON public.grade_scores';
    EXECUTE 'CREATE TRIGGER enforce_teacher_grade_score_scope BEFORE INSERT OR UPDATE OF score, grade_item_id, enrollment_id ON public.grade_scores FOR EACH ROW EXECUTE FUNCTION private.enforce_teacher_grade_score_scope()';
  END IF;
END
$do$;

-- Avaliações contínuas: criação/edição do item deve corresponder à atribuição do Professor.
CREATE OR REPLACE FUNCTION private.enforce_teacher_assessment_item_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_actor uuid;
  v_allowed boolean;
BEGIN
  v_actor := COALESCE(NEW.updated_by, NEW.created_by);
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF private.sga_actor_is_academic_manager(v_actor, NEW.school_id) THEN
    RETURN NEW;
  END IF;

  IF NOT private.sga_actor_is_teacher(v_actor, NEW.school_id) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.class_subjects cs
    JOIN public.teachers t
      ON t.id = cs.teacher_id
     AND t.school_id = cs.school_id
    WHERE cs.school_id = NEW.school_id
      AND cs.class_group_id = NEW.class_group_id
      AND cs.subject_id = NEW.subject_id
      AND cs.status = 'active'
      AND t.status = 'active'
      AND t.user_id = v_actor
  ) INTO v_allowed;

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'Professor só pode gerir avaliações da sua turma e disciplina.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_teacher_assessment_item_scope() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_teacher_assessment_item_scope() TO service_role;

DO $do$
BEGIN
  IF to_regclass('public.siga_assessment_items') IS NOT NULL
     AND to_regclass('public.class_subjects') IS NOT NULL
     AND to_regclass('public.teachers') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_teacher_assessment_item_scope ON public.siga_assessment_items';
    EXECUTE 'CREATE TRIGGER enforce_teacher_assessment_item_scope BEFORE INSERT OR UPDATE OF class_group_id, subject_id ON public.siga_assessment_items FOR EACH ROW EXECUTE FUNCTION private.enforce_teacher_assessment_item_scope()';
  END IF;
END
$do$;

-- Notas de avaliações: o item, matrícula e atribuição têm de pertencer ao mesmo contexto.
CREATE OR REPLACE FUNCTION private.enforce_teacher_assessment_score_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_actor uuid;
  v_allowed boolean;
BEGIN
  v_actor := NEW.recorded_by;
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF private.sga_actor_is_academic_manager(v_actor, NEW.school_id) THEN
    RETURN NEW;
  END IF;

  IF NOT private.sga_actor_is_teacher(v_actor, NEW.school_id) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.siga_assessment_items ai
    JOIN public.class_subjects cs
      ON cs.school_id = ai.school_id
     AND cs.class_group_id = ai.class_group_id
     AND cs.subject_id = ai.subject_id
    JOIN public.teachers t
      ON t.id = cs.teacher_id
     AND t.school_id = cs.school_id
    JOIN public.enrollments e
      ON e.id = NEW.enrollment_id
     AND e.school_id = NEW.school_id
     AND e.class_group_id = ai.class_group_id
    WHERE ai.id = NEW.item_id
      AND ai.school_id = NEW.school_id
      AND cs.status = 'active'
      AND t.status = 'active'
      AND t.user_id = v_actor
      AND e.status IN ('active','pending')
  ) INTO v_allowed;

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'Professor só pode lançar esta avaliação aos alunos da turma atribuída.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_teacher_assessment_score_scope() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_teacher_assessment_score_scope() TO service_role;

DO $do$
BEGIN
  IF to_regclass('public.siga_assessment_scores') IS NOT NULL
     AND to_regclass('public.siga_assessment_items') IS NOT NULL
     AND to_regclass('public.class_subjects') IS NOT NULL
     AND to_regclass('public.teachers') IS NOT NULL
     AND to_regclass('public.enrollments') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_teacher_assessment_score_scope ON public.siga_assessment_scores';
    EXECUTE 'CREATE TRIGGER enforce_teacher_assessment_score_scope BEFORE INSERT OR UPDATE OF score, item_id, enrollment_id ON public.siga_assessment_scores FOR EACH ROW EXECUTE FUNCTION private.enforce_teacher_assessment_score_scope()';
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
