-- Auditoria 13, F-01 e F-08 (docs/auditoria/13-auditoria-ciclo-completo-2026-10-07.md).
--
-- F-01: o papel `teacher` tem `students.records.read`, `people.records.read` e
-- `students.enrollments.read`, e as políticas aceitavam essa permissão para a escola
-- inteira antes de chegarem ao ramo do professor (`private.teacher_*`). Um professor de
-- uma só turma lia pela API todos os alunos, pessoas, matrículas e encarregados da escola,
-- e — pelo ramo «qualquer membro» — todas as notas e presenças. Ensaiado numa réplica com as
-- políticas da produção (secção 3 do relatório).
--
-- F-08: a tesouraria lia notas e presenças (o mesmo ramo «qualquer membro»).
--
-- O que muda: só leituras (SELECT). A permissão da escola inteira passa a exigir um papel
-- de pessoal que não seja só o de professor; o professor lê pelo ramo das suas turmas.
-- Notas e presenças: escola inteira só administração e secretaria; professor pelas suas
-- turmas. Nada muda para o servidor (chave de serviço) nem para escritas, nem em
-- `role_permissions`. As restritivas «School staff only» ficam como estão.
--
-- Idempotente: CREATE OR REPLACE e DROP POLICY IF EXISTS antes de CREATE POLICY.
-- Ensaio: tests/sql/teacher-scope-reads.mjs (corre duas vezes).

-- Escolas onde a pessoa tem um papel de pessoal além do de professor.
CREATE OR REPLACE FUNCTION private.user_wide_reader_school_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT sm.school_id
  FROM public.school_memberships sm
  JOIN public.member_roles mr ON mr.membership_id = sm.id
  JOIN public.roles r ON r.id = mr.role_id
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND sm.user_id = (SELECT auth.uid()) AND sm.status = 'active' AND sm.school_id IS NOT NULL
    AND lower(btrim(r.code)) = ANY (ARRAY[
      'owner', 'admin', 'administrador', 'secretary', 'secretaria',
      'treasury', 'tesouraria', 'finance'
    ])
$function$;

REVOKE ALL ON FUNCTION private.user_wide_reader_school_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.user_wide_reader_school_ids() TO authenticated;

-- students
DROP POLICY IF EXISTS students_read ON public.students;
CREATE POLICY students_read ON public.students
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (
      school_id IN (SELECT private.user_permission_school_ids('students.records.read'))
      AND school_id IN (SELECT private.user_wide_reader_school_ids())
    )
    OR (
      school_id IN (SELECT private.user_member_school_ids())
      AND (
        school_id IN (SELECT private.user_role_school_ids(ARRAY['owner', 'admin', 'administrador', 'secretary', 'secretaria']))
        OR (school_id, id) IN (SELECT ts.school_id, ts.student_id FROM private.teacher_students() ts(school_id, student_id))
      )
    )
  );

-- people
DROP POLICY IF EXISTS people_read ON public.people;
CREATE POLICY people_read ON public.people
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (
      school_id IN (SELECT private.user_permission_school_ids('people.records.read'))
      AND school_id IN (SELECT private.user_wide_reader_school_ids())
    )
    OR (
      school_id IN (SELECT private.user_member_school_ids())
      AND (
        school_id IN (SELECT private.user_role_school_ids(ARRAY['owner', 'admin', 'administrador', 'secretary', 'secretaria']))
        OR (school_id, id) IN (SELECT tp.school_id, tp.person_id FROM private.teacher_people() tp(school_id, person_id))
      )
    )
  );

-- enrollments
DROP POLICY IF EXISTS enrollments_read ON public.enrollments;
CREATE POLICY enrollments_read ON public.enrollments
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (
      school_id IN (SELECT private.user_permission_school_ids('students.enrollments.read'))
      AND school_id IN (SELECT private.user_wide_reader_school_ids())
    )
    OR (
      school_id IN (SELECT private.user_member_school_ids())
      AND (
        school_id IN (SELECT private.user_role_school_ids(ARRAY['owner', 'admin', 'administrador', 'secretary', 'secretaria']))
        OR (
          status = ANY (ARRAY['active', 'pending'])
          AND (school_id, class_group_id) IN (
            SELECT tc.school_id, tc.class_group_id
            FROM private.teacher_class_subjects(true) tc(school_id, class_subject_id, class_group_id, subject_id)
          )
        )
      )
    )
  );

-- student_guardians: o professor vê os encarregados dos seus alunos.
DROP POLICY IF EXISTS student_guardians_read ON public.student_guardians;
CREATE POLICY student_guardians_read ON public.student_guardians
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (
      school_id IS NOT NULL
      AND school_id IN (SELECT private.user_member_school_ids())
      AND school_id IN (SELECT private.user_role_school_ids(ARRAY['owner', 'admin', 'administrador', 'secretary', 'secretaria']))
    )
    OR (
      school_id IS NOT NULL
      AND school_id IN (SELECT private.user_permission_school_ids('students.records.read'))
      AND school_id IN (SELECT private.user_wide_reader_school_ids())
    )
    OR (school_id, student_id) IN (SELECT ts.school_id, ts.student_id FROM private.teacher_students() ts(school_id, student_id))
  );

-- siga_assessment_scores: escola inteira só administração e secretaria; o professor pelo
-- ramo que já existia (current_user_can_manage_assessment_score).
DROP POLICY IF EXISTS siga_assessment_scores_read ON public.siga_assessment_scores;
CREATE POLICY siga_assessment_scores_read ON public.siga_assessment_scores
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.current_user_can_manage_assessment_score(school_id, item_id, enrollment_id)
    OR (
      school_id IS NOT NULL
      AND school_id IN (SELECT private.user_member_school_ids())
      AND school_id IN (SELECT private.user_role_school_ids(ARRAY['owner', 'admin', 'administrador', 'secretary', 'secretaria']))
    )
  );

-- Presenças: escola inteira só administração e secretaria; o professor, as dos seus alunos.
DROP POLICY IF EXISTS "Members read siga_attendance_records" ON public.siga_attendance_records;
CREATE POLICY "Members read siga_attendance_records" ON public.siga_attendance_records
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (
      school_id IS NOT NULL
      AND school_id IN (SELECT private.user_member_school_ids())
      AND school_id IN (SELECT private.user_role_school_ids(ARRAY['owner', 'admin', 'administrador', 'secretary', 'secretaria']))
    )
    OR (school_id, student_id) IN (SELECT ts.school_id, ts.student_id FROM private.teacher_students() ts(school_id, student_id))
  );

DROP POLICY IF EXISTS "Members read siga_attendance_justifications" ON public.siga_attendance_justifications;
CREATE POLICY "Members read siga_attendance_justifications" ON public.siga_attendance_justifications
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (
      school_id IS NOT NULL
      AND school_id IN (SELECT private.user_member_school_ids())
      AND school_id IN (SELECT private.user_role_school_ids(ARRAY['owner', 'admin', 'administrador', 'secretary', 'secretaria']))
    )
    OR (school_id, student_id) IN (SELECT ts.school_id, ts.student_id FROM private.teacher_students() ts(school_id, student_id))
  );

DROP POLICY IF EXISTS "Members read siga_attendance_sessions" ON public.siga_attendance_sessions;
CREATE POLICY "Members read siga_attendance_sessions" ON public.siga_attendance_sessions
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (
      school_id IS NOT NULL
      AND school_id IN (SELECT private.user_member_school_ids())
      AND school_id IN (SELECT private.user_role_school_ids(ARRAY['owner', 'admin', 'administrador', 'secretary', 'secretaria']))
    )
    OR (school_id, class_group_id) IN (
      SELECT tc.school_id, tc.class_group_id
      FROM private.teacher_class_subjects(true) tc(school_id, class_subject_id, class_group_id, subject_id)
    )
  );
