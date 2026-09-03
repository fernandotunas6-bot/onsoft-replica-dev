-- SIGA / SGA — corrigir RLS do motor de importação e domínio académico.
-- Esta migration é defensiva: os objectos premium podem existir apenas no SGA remoto,
-- por isso as políticas desses objectos são instaladas apenas quando a tabela existe.

-- ---------------------------------------------------------------------------
-- 1) Remover políticas académicas demasiado amplas introduzidas em 2026-09-01.
-- As migrations originais de cada módulo já têm políticas por operação; uma política
-- FOR ALL permissiva é combinada por OR com elas e acaba por alargar o acesso.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "School members can access students" ON public.students;
DROP POLICY IF EXISTS "School members can access student guardians" ON public.student_guardians;
DROP POLICY IF EXISTS "School members can access courses" ON public.courses;
DROP POLICY IF EXISTS "School members can access grade levels" ON public.grade_levels;
DROP POLICY IF EXISTS "School members can access rooms" ON public.rooms;
DROP POLICY IF EXISTS "School members can access class groups" ON public.class_groups;
DROP POLICY IF EXISTS "School members can access subjects" ON public.subjects;
DROP POLICY IF EXISTS "School members can access term grades" ON public.term_grades;
DROP POLICY IF EXISTS "School members can access class schedule slots" ON public.class_schedule_slots;
DROP POLICY IF EXISTS "School members can access enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "School members can access student status history" ON public.student_status_history;

-- ---------------------------------------------------------------------------
-- 2) Corrigir RLS do motor de importação.
-- A versão APPLY_IMPORT_ENGINE.sql continha j.public.is_school_member(...),
-- que é SQL inválido. As políticas abaixo usam EXISTS e qualificam j.school_id.
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regclass('public.import_rows') IS NOT NULL
     AND to_regclass('public.import_jobs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.import_rows FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Read school import rows" ON public.import_rows';
    EXECUTE $policy$
      CREATE POLICY "Read school import rows"
        ON public.import_rows
        FOR SELECT TO authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.import_jobs j
            WHERE j.id = import_job_id
              AND public.is_school_member(j.school_id)
          )
        )
    $policy$;
  END IF;

  IF to_regclass('public.import_audits') IS NOT NULL
     AND to_regclass('public.import_jobs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.import_audits ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.import_audits FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Read school import audits" ON public.import_audits';
    EXECUTE $policy$
      CREATE POLICY "Read school import audits"
        ON public.import_audits
        FOR SELECT TO authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.import_jobs j
            WHERE j.id = import_job_id
              AND public.is_school_member(j.school_id)
          )
        )
    $policy$;
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- 3) Estrutura académica actual: turma + disciplina + professor + período.
-- Leitura: membros da escola. Escrita estrutural: apenas gestão académica.
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regclass('public.class_subjects') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.class_subjects FORCE ROW LEVEL SECURITY';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.class_subjects TO authenticated';
    EXECUTE 'DROP POLICY IF EXISTS "Academic read class subjects" ON public.class_subjects';
    EXECUTE 'DROP POLICY IF EXISTS "Academic create class subjects" ON public.class_subjects';
    EXECUTE 'DROP POLICY IF EXISTS "Academic update class subjects" ON public.class_subjects';
    EXECUTE $policy$
      CREATE POLICY "Academic read class subjects"
      ON public.class_subjects FOR SELECT TO authenticated
      USING (public.is_school_member(class_subjects.school_id))
    $policy$;
    EXECUTE $policy$
      CREATE POLICY "Academic create class subjects"
      ON public.class_subjects FOR INSERT TO authenticated
      WITH CHECK (
        public.is_school_member(class_subjects.school_id)
        AND (SELECT public.can_manage_students())
      )
    $policy$;
    EXECUTE $policy$
      CREATE POLICY "Academic update class subjects"
      ON public.class_subjects FOR UPDATE TO authenticated
      USING (
        public.is_school_member(class_subjects.school_id)
        AND (SELECT public.can_manage_students())
      )
      WITH CHECK (
        public.is_school_member(class_subjects.school_id)
        AND (SELECT public.can_manage_students())
      )
    $policy$;
  END IF;

  IF to_regclass('public.terms') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.terms FORCE ROW LEVEL SECURITY';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.terms TO authenticated';
    EXECUTE 'DROP POLICY IF EXISTS "Academic read terms" ON public.terms';
    EXECUTE 'DROP POLICY IF EXISTS "Academic create terms" ON public.terms';
    EXECUTE 'DROP POLICY IF EXISTS "Academic update terms" ON public.terms';
    EXECUTE $policy$
      CREATE POLICY "Academic read terms"
      ON public.terms FOR SELECT TO authenticated
      USING (public.is_school_member(terms.school_id))
    $policy$;
    EXECUTE $policy$
      CREATE POLICY "Academic create terms"
      ON public.terms FOR INSERT TO authenticated
      WITH CHECK (
        public.is_school_member(terms.school_id)
        AND (SELECT public.can_manage_students())
      )
    $policy$;
    EXECUTE $policy$
      CREATE POLICY "Academic update terms"
      ON public.terms FOR UPDATE TO authenticated
      USING (
        public.is_school_member(terms.school_id)
        AND (SELECT public.can_manage_students())
      )
      WITH CHECK (
        public.is_school_member(terms.school_id)
        AND (SELECT public.can_manage_students())
      )
    $policy$;
  END IF;

  IF to_regclass('public.timetable_slots') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.timetable_slots ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.timetable_slots FORCE ROW LEVEL SECURITY';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.timetable_slots TO authenticated';
    EXECUTE 'DROP POLICY IF EXISTS "Academic read timetable slots" ON public.timetable_slots';
    EXECUTE 'DROP POLICY IF EXISTS "Academic create timetable slots" ON public.timetable_slots';
    EXECUTE 'DROP POLICY IF EXISTS "Academic update timetable slots" ON public.timetable_slots';
    EXECUTE $policy$
      CREATE POLICY "Academic read timetable slots"
      ON public.timetable_slots FOR SELECT TO authenticated
      USING (public.is_school_member(timetable_slots.school_id))
    $policy$;
    EXECUTE $policy$
      CREATE POLICY "Academic create timetable slots"
      ON public.timetable_slots FOR INSERT TO authenticated
      WITH CHECK (
        public.is_school_member(timetable_slots.school_id)
        AND (SELECT public.can_manage_students())
      )
    $policy$;
    EXECUTE $policy$
      CREATE POLICY "Academic update timetable slots"
      ON public.timetable_slots FOR UPDATE TO authenticated
      USING (
        public.is_school_member(timetable_slots.school_id)
        AND (SELECT public.can_manage_students())
      )
      WITH CHECK (
        public.is_school_member(timetable_slots.school_id)
        AND (SELECT public.can_manage_students())
      )
    $policy$;
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- 4) Diário de notas actual.
-- Professor pode consultar/gravar apenas o diário ligado à sua atribuição activa.
-- Administração/Secretaria continuam cobertas por can_manage_students().
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regclass('public.gradebooks') IS NOT NULL
     AND to_regclass('public.class_subjects') IS NOT NULL
     AND to_regclass('public.teachers') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.gradebooks ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.gradebooks FORCE ROW LEVEL SECURITY';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.gradebooks TO authenticated';
    EXECUTE 'DROP POLICY IF EXISTS "Academic read gradebooks" ON public.gradebooks';
    EXECUTE 'DROP POLICY IF EXISTS "Academic create gradebooks" ON public.gradebooks';
    EXECUTE 'DROP POLICY IF EXISTS "Academic update gradebooks" ON public.gradebooks';
    EXECUTE $policy$
      CREATE POLICY "Academic read gradebooks"
      ON public.gradebooks FOR SELECT TO authenticated
      USING (
        public.is_school_member(gradebooks.school_id)
        AND (
          (SELECT public.can_manage_students())
          OR EXISTS (
            SELECT 1
            FROM public.class_subjects cs
            JOIN public.teachers t
              ON t.id = cs.teacher_id
             AND t.school_id = cs.school_id
            WHERE cs.id = gradebooks.class_subject_id
              AND cs.school_id = gradebooks.school_id
              AND cs.status = 'active'
              AND t.user_id = (SELECT auth.uid())
          )
        )
      )
    $policy$;
    EXECUTE $policy$
      CREATE POLICY "Academic create gradebooks"
      ON public.gradebooks FOR INSERT TO authenticated
      WITH CHECK (
        public.is_school_member(gradebooks.school_id)
        AND (SELECT public.can_manage_students())
      )
    $policy$;
    EXECUTE $policy$
      CREATE POLICY "Academic update gradebooks"
      ON public.gradebooks FOR UPDATE TO authenticated
      USING (
        public.is_school_member(gradebooks.school_id)
        AND (SELECT public.can_manage_students())
      )
      WITH CHECK (
        public.is_school_member(gradebooks.school_id)
        AND (SELECT public.can_manage_students())
      )
    $policy$;
  END IF;

  IF to_regclass('public.grade_items') IS NOT NULL
     AND to_regclass('public.gradebooks') IS NOT NULL
     AND to_regclass('public.class_subjects') IS NOT NULL
     AND to_regclass('public.teachers') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.grade_items ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.grade_items FORCE ROW LEVEL SECURITY';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.grade_items TO authenticated';
    EXECUTE 'DROP POLICY IF EXISTS "Academic read grade items" ON public.grade_items';
    EXECUTE 'DROP POLICY IF EXISTS "Academic create grade items" ON public.grade_items';
    EXECUTE 'DROP POLICY IF EXISTS "Academic update grade items" ON public.grade_items';
    EXECUTE $policy$
      CREATE POLICY "Academic read grade items"
      ON public.grade_items FOR SELECT TO authenticated
      USING (
        public.is_school_member(grade_items.school_id)
        AND (
          (SELECT public.can_manage_students())
          OR EXISTS (
            SELECT 1
            FROM public.gradebooks gb
            JOIN public.class_subjects cs
              ON cs.id = gb.class_subject_id
             AND cs.school_id = gb.school_id
            JOIN public.teachers t
              ON t.id = cs.teacher_id
             AND t.school_id = cs.school_id
            WHERE gb.id = grade_items.gradebook_id
              AND gb.school_id = grade_items.school_id
              AND cs.status = 'active'
              AND t.user_id = (SELECT auth.uid())
          )
        )
      )
    $policy$;
    EXECUTE $policy$
      CREATE POLICY "Academic create grade items"
      ON public.grade_items FOR INSERT TO authenticated
      WITH CHECK (
        public.is_school_member(grade_items.school_id)
        AND (SELECT public.can_manage_students())
      )
    $policy$;
    EXECUTE $policy$
      CREATE POLICY "Academic update grade items"
      ON public.grade_items FOR UPDATE TO authenticated
      USING (
        public.is_school_member(grade_items.school_id)
        AND (SELECT public.can_manage_students())
      )
      WITH CHECK (
        public.is_school_member(grade_items.school_id)
        AND (SELECT public.can_manage_students())
      )
    $policy$;
  END IF;

  IF to_regclass('public.grade_scores') IS NOT NULL
     AND to_regclass('public.grade_items') IS NOT NULL
     AND to_regclass('public.gradebooks') IS NOT NULL
     AND to_regclass('public.class_subjects') IS NOT NULL
     AND to_regclass('public.teachers') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.grade_scores ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.grade_scores FORCE ROW LEVEL SECURITY';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.grade_scores TO authenticated';
    EXECUTE 'DROP POLICY IF EXISTS "Academic read grade scores" ON public.grade_scores';
    EXECUTE 'DROP POLICY IF EXISTS "Academic create grade scores" ON public.grade_scores';
    EXECUTE 'DROP POLICY IF EXISTS "Academic update grade scores" ON public.grade_scores';
    EXECUTE $policy$
      CREATE POLICY "Academic read grade scores"
      ON public.grade_scores FOR SELECT TO authenticated
      USING (
        public.is_school_member(grade_scores.school_id)
        AND (
          (SELECT public.can_manage_students())
          OR EXISTS (
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
            WHERE gi.id = grade_scores.grade_item_id
              AND gi.school_id = grade_scores.school_id
              AND cs.status = 'active'
              AND t.user_id = (SELECT auth.uid())
          )
        )
      )
    $policy$;
    EXECUTE $policy$
      CREATE POLICY "Academic create grade scores"
      ON public.grade_scores FOR INSERT TO authenticated
      WITH CHECK (
        public.is_school_member(grade_scores.school_id)
        AND (
          (SELECT public.can_manage_students())
          OR EXISTS (
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
            WHERE gi.id = grade_scores.grade_item_id
              AND gi.school_id = grade_scores.school_id
              AND cs.status = 'active'
              AND t.user_id = (SELECT auth.uid())
          )
        )
      )
    $policy$;
    EXECUTE $policy$
      CREATE POLICY "Academic update grade scores"
      ON public.grade_scores FOR UPDATE TO authenticated
      USING (
        public.is_school_member(grade_scores.school_id)
        AND (
          (SELECT public.can_manage_students())
          OR EXISTS (
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
            WHERE gi.id = grade_scores.grade_item_id
              AND gi.school_id = grade_scores.school_id
              AND cs.status = 'active'
              AND t.user_id = (SELECT auth.uid())
          )
        )
      )
      WITH CHECK (
        public.is_school_member(grade_scores.school_id)
        AND (
          (SELECT public.can_manage_students())
          OR EXISTS (
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
            WHERE gi.id = grade_scores.grade_item_id
              AND gi.school_id = grade_scores.school_id
              AND cs.status = 'active'
              AND t.user_id = (SELECT auth.uid())
          )
        )
      )
    $policy$;
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- 5) term_grades legado: manter compatibilidade, mas nunca permitir que qualquer
-- membro da escola altere todas as notas. Professor limita-se à sua atribuição.
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regclass('public.term_grades') IS NOT NULL
     AND to_regclass('public.enrollments') IS NOT NULL
     AND to_regclass('public.class_subjects') IS NOT NULL
     AND to_regclass('public.teachers') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Create term grades in own school" ON public.term_grades';
    EXECUTE 'DROP POLICY IF EXISTS "Update term grades in own school" ON public.term_grades';
    EXECUTE 'DROP POLICY IF EXISTS "Academic create assigned term grades" ON public.term_grades';
    EXECUTE 'DROP POLICY IF EXISTS "Academic update assigned term grades" ON public.term_grades';
    EXECUTE $policy$
      CREATE POLICY "Academic create assigned term grades"
      ON public.term_grades FOR INSERT TO authenticated
      WITH CHECK (
        public.is_school_member(term_grades.school_id)
        AND (
          (SELECT public.can_manage_students())
          OR EXISTS (
            SELECT 1
            FROM public.enrollments e
            JOIN public.class_subjects cs
              ON cs.class_group_id = e.class_group_id
             AND cs.school_id = e.school_id
             AND cs.subject_id = term_grades.subject_id
            JOIN public.teachers t
              ON t.id = cs.teacher_id
             AND t.school_id = cs.school_id
            WHERE e.id = term_grades.enrollment_id
              AND e.school_id = term_grades.school_id
              AND cs.status = 'active'
              AND t.user_id = (SELECT auth.uid())
          )
        )
      )
    $policy$;
    EXECUTE $policy$
      CREATE POLICY "Academic update assigned term grades"
      ON public.term_grades FOR UPDATE TO authenticated
      USING (
        public.is_school_member(term_grades.school_id)
        AND (
          (SELECT public.can_manage_students())
          OR EXISTS (
            SELECT 1
            FROM public.enrollments e
            JOIN public.class_subjects cs
              ON cs.class_group_id = e.class_group_id
             AND cs.school_id = e.school_id
             AND cs.subject_id = term_grades.subject_id
            JOIN public.teachers t
              ON t.id = cs.teacher_id
             AND t.school_id = cs.school_id
            WHERE e.id = term_grades.enrollment_id
              AND e.school_id = term_grades.school_id
              AND cs.status = 'active'
              AND t.user_id = (SELECT auth.uid())
          )
        )
      )
      WITH CHECK (
        public.is_school_member(term_grades.school_id)
        AND (
          (SELECT public.can_manage_students())
          OR EXISTS (
            SELECT 1
            FROM public.enrollments e
            JOIN public.class_subjects cs
              ON cs.class_group_id = e.class_group_id
             AND cs.school_id = e.school_id
             AND cs.subject_id = term_grades.subject_id
            JOIN public.teachers t
              ON t.id = cs.teacher_id
             AND t.school_id = cs.school_id
            WHERE e.id = term_grades.enrollment_id
              AND e.school_id = term_grades.school_id
              AND cs.status = 'active'
              AND t.user_id = (SELECT auth.uid())
          )
        )
      )
    $policy$;
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
