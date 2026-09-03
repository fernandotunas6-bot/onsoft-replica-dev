-- SIGA / SGA — fechar os dois últimos bypasses defensivos do domínio académico.
-- 1) service_role não pode gravar como actor nulo/desconhecido em operações de Professor.
-- 2) Professor autenticado não pode usar acesso directo ao Supabase para listar
--    atribuições/horários de outros docentes. Outros perfis mantêm o comportamento
--    escolar anterior; Administração/Secretaria mantêm acesso total da escola.

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.sga_request_is_service_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user) = 'service_role';
$$;

REVOKE ALL ON FUNCTION private.sga_request_is_service_role() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.sga_request_is_service_role() TO service_role;

-- class_subjects: se o backend privilegiado iniciou a operação, actor é obrigatório.
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
    IF private.sga_request_is_service_role() THEN
      RAISE EXCEPTION 'Operação académica privilegiada sem actor autenticado.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF private.sga_actor_is_academic_manager(v_actor, NEW.school_id) THEN
    RETURN NEW;
  END IF;

  IF NOT private.sga_actor_is_teacher(v_actor, NEW.school_id) THEN
    IF private.sga_request_is_service_role() THEN
      RAISE EXCEPTION 'Actor sem permissão para gerir atribuições académicas.'
        USING ERRCODE = '42501';
    END IF;
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

-- grade_scores: MAC/NPP/NPT.
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
    IF private.sga_request_is_service_role() THEN
      RAISE EXCEPTION 'Lançamento de nota privilegiado sem actor autenticado.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF private.sga_actor_is_academic_manager(v_actor, NEW.school_id) THEN
    RETURN NEW;
  END IF;

  IF NOT private.sga_actor_is_teacher(v_actor, NEW.school_id) THEN
    IF private.sga_request_is_service_role() THEN
      RAISE EXCEPTION 'Actor sem permissão para lançar notas.' USING ERRCODE = '42501';
    END IF;
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

-- Avaliações contínuas.
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
    IF private.sga_request_is_service_role() THEN
      RAISE EXCEPTION 'Operação de avaliação privilegiada sem actor autenticado.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF private.sga_actor_is_academic_manager(v_actor, NEW.school_id) THEN
    RETURN NEW;
  END IF;

  IF NOT private.sga_actor_is_teacher(v_actor, NEW.school_id) THEN
    IF private.sga_request_is_service_role() THEN
      RAISE EXCEPTION 'Actor sem permissão para gerir avaliações.' USING ERRCODE = '42501';
    END IF;
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
    IF private.sga_request_is_service_role() THEN
      RAISE EXCEPTION 'Lançamento de avaliação privilegiado sem actor autenticado.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF private.sga_actor_is_academic_manager(v_actor, NEW.school_id) THEN
    RETURN NEW;
  END IF;

  IF NOT private.sga_actor_is_teacher(v_actor, NEW.school_id) THEN
    IF private.sga_request_is_service_role() THEN
      RAISE EXCEPTION 'Actor sem permissão para lançar avaliações.' USING ERRCODE = '42501';
    END IF;
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

-- Restringir apenas o utilizador que é Professor. Perfis não-docentes mantêm a
-- leitura escolar existente; gestores continuam com acesso completo.
DO $do$
BEGIN
  IF to_regclass('public.class_subjects') IS NOT NULL
     AND to_regclass('public.teachers') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Academic read class subjects" ON public.class_subjects';
    EXECUTE $policy$
      CREATE POLICY "Academic read class subjects"
      ON public.class_subjects FOR SELECT TO authenticated
      USING (
        public.is_school_member(class_subjects.school_id)
        AND (
          (SELECT public.can_manage_students())
          OR EXISTS (
            SELECT 1
            FROM public.teachers t
            WHERE t.id = class_subjects.teacher_id
              AND t.school_id = class_subjects.school_id
              AND t.status = 'active'
              AND t.user_id = (SELECT auth.uid())
          )
          OR NOT EXISTS (
            SELECT 1
            FROM public.teachers self_teacher
            WHERE self_teacher.school_id = class_subjects.school_id
              AND self_teacher.status = 'active'
              AND self_teacher.user_id = (SELECT auth.uid())
          )
        )
      )
    $policy$;
  END IF;

  IF to_regclass('public.timetable_slots') IS NOT NULL
     AND to_regclass('public.class_subjects') IS NOT NULL
     AND to_regclass('public.teachers') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Academic read timetable slots" ON public.timetable_slots';
    EXECUTE $policy$
      CREATE POLICY "Academic read timetable slots"
      ON public.timetable_slots FOR SELECT TO authenticated
      USING (
        public.is_school_member(timetable_slots.school_id)
        AND (
          (SELECT public.can_manage_students())
          OR EXISTS (
            SELECT 1
            FROM public.class_subjects cs
            JOIN public.teachers t
              ON t.id = cs.teacher_id
             AND t.school_id = cs.school_id
            WHERE cs.id = timetable_slots.class_subject_id
              AND cs.school_id = timetable_slots.school_id
              AND cs.status = 'active'
              AND t.status = 'active'
              AND t.user_id = (SELECT auth.uid())
          )
          OR NOT EXISTS (
            SELECT 1
            FROM public.teachers self_teacher
            WHERE self_teacher.school_id = timetable_slots.school_id
              AND self_teacher.status = 'active'
              AND self_teacher.user_id = (SELECT auth.uid())
          )
        )
      )
    $policy$;
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
