-- SIGA / SGA — leitura académica do Professor por atribuição activa.
-- Policies permissivas SELECT são intencionais aqui: somam-se às policies de
-- Administração/Secretaria sem conceder escrita estrutural ao Professor.

-- ---------------------------------------------------------------------------
-- teachers: Professor autenticado só precisa de ler a própria ficha docente.
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regclass('public.teachers') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.teachers FORCE ROW LEVEL SECURITY';
    EXECUTE 'GRANT SELECT ON public.teachers TO authenticated';
    EXECUTE 'DROP POLICY IF EXISTS "Professor reads own teacher record" ON public.teachers';
    EXECUTE $policy$
      CREATE POLICY "Professor reads own teacher record"
      ON public.teachers
      FOR SELECT TO authenticated
      USING (
        public.is_school_member(teachers.school_id)
        AND teachers.user_id = (SELECT auth.uid())
        AND teachers.status = 'active'
      )
    $policy$;
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- class_groups: apenas turmas ligadas a class_subjects activos do Professor.
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regclass('public.class_groups') IS NOT NULL
     AND to_regclass('public.class_subjects') IS NOT NULL
     AND to_regclass('public.teachers') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Professor reads assigned class groups" ON public.class_groups';
    EXECUTE $policy$
      CREATE POLICY "Professor reads assigned class groups"
      ON public.class_groups
      FOR SELECT TO authenticated
      USING (
        public.is_school_member(class_groups.school_id)
        AND EXISTS (
          SELECT 1
          FROM public.class_subjects cs
          JOIN public.teachers t
            ON t.id = cs.teacher_id
           AND t.school_id = cs.school_id
          WHERE cs.school_id = class_groups.school_id
            AND cs.class_group_id = class_groups.id
            AND cs.status = 'active'
            AND t.status = 'active'
            AND t.user_id = (SELECT auth.uid())
        )
      )
    $policy$;
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- subjects: apenas disciplinas efectivamente atribuídas ao Professor.
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regclass('public.subjects') IS NOT NULL
     AND to_regclass('public.class_subjects') IS NOT NULL
     AND to_regclass('public.teachers') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.subjects FORCE ROW LEVEL SECURITY';
    EXECUTE 'GRANT SELECT ON public.subjects TO authenticated';
    EXECUTE 'DROP POLICY IF EXISTS "Professor reads assigned subjects" ON public.subjects';
    EXECUTE $policy$
      CREATE POLICY "Professor reads assigned subjects"
      ON public.subjects
      FOR SELECT TO authenticated
      USING (
        public.is_school_member(subjects.school_id)
        AND EXISTS (
          SELECT 1
          FROM public.class_subjects cs
          JOIN public.teachers t
            ON t.id = cs.teacher_id
           AND t.school_id = cs.school_id
          WHERE cs.school_id = subjects.school_id
            AND cs.subject_id = subjects.id
            AND cs.status = 'active'
            AND t.status = 'active'
            AND t.user_id = (SELECT auth.uid())
        )
      )
    $policy$;
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- enrollments: alunos inscritos nas turmas atribuídas ao Professor.
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regclass('public.enrollments') IS NOT NULL
     AND to_regclass('public.class_subjects') IS NOT NULL
     AND to_regclass('public.teachers') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Professor reads assigned enrollments" ON public.enrollments';
    EXECUTE $policy$
      CREATE POLICY "Professor reads assigned enrollments"
      ON public.enrollments
      FOR SELECT TO authenticated
      USING (
        public.is_school_member(enrollments.school_id)
        AND enrollments.status IN ('active', 'pending')
        AND EXISTS (
          SELECT 1
          FROM public.class_subjects cs
          JOIN public.teachers t
            ON t.id = cs.teacher_id
           AND t.school_id = cs.school_id
          WHERE cs.school_id = enrollments.school_id
            AND cs.class_group_id = enrollments.class_group_id
            AND cs.status = 'active'
            AND t.status = 'active'
            AND t.user_id = (SELECT auth.uid())
        )
      )
    $policy$;
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- students: só estudantes com matrícula numa turma atribuída.
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regclass('public.students') IS NOT NULL
     AND to_regclass('public.enrollments') IS NOT NULL
     AND to_regclass('public.class_subjects') IS NOT NULL
     AND to_regclass('public.teachers') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Professor reads students in assigned classes" ON public.students';
    EXECUTE $policy$
      CREATE POLICY "Professor reads students in assigned classes"
      ON public.students
      FOR SELECT TO authenticated
      USING (
        public.is_school_member(students.school_id)
        AND EXISTS (
          SELECT 1
          FROM public.enrollments e
          JOIN public.class_subjects cs
            ON cs.school_id = e.school_id
           AND cs.class_group_id = e.class_group_id
          JOIN public.teachers t
            ON t.id = cs.teacher_id
           AND t.school_id = cs.school_id
          WHERE e.school_id = students.school_id
            AND e.student_id = students.id
            AND e.status IN ('active', 'pending')
            AND cs.status = 'active'
            AND t.status = 'active'
            AND t.user_id = (SELECT auth.uid())
        )
      )
    $policy$;
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- people: dados pessoais apenas dos estudantes que o Professor realmente ensina.
-- Não abre o directório geral de Pessoas.
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regclass('public.people') IS NOT NULL
     AND to_regclass('public.students') IS NOT NULL
     AND to_regclass('public.enrollments') IS NOT NULL
     AND to_regclass('public.class_subjects') IS NOT NULL
     AND to_regclass('public.teachers') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Professor reads people for assigned students" ON public.people';
    EXECUTE $policy$
      CREATE POLICY "Professor reads people for assigned students"
      ON public.people
      FOR SELECT TO authenticated
      USING (
        public.is_school_member(people.school_id)
        AND EXISTS (
          SELECT 1
          FROM public.students s
          JOIN public.enrollments e
            ON e.school_id = s.school_id
           AND e.student_id = s.id
          JOIN public.class_subjects cs
            ON cs.school_id = e.school_id
           AND cs.class_group_id = e.class_group_id
          JOIN public.teachers t
            ON t.id = cs.teacher_id
           AND t.school_id = cs.school_id
          WHERE s.school_id = people.school_id
            AND s.person_id = people.id
            AND e.status IN ('active', 'pending')
            AND cs.status = 'active'
            AND t.status = 'active'
            AND t.user_id = (SELECT auth.uid())
        )
      )
    $policy$;
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
