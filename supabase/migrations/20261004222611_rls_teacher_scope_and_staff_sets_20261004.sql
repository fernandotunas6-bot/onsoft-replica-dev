-- CAPTURADA da produção (supabase_migrations.schema_migrations, versão 20261004222611).
-- Aplicada a 2026-10-04 fora do repositório (conta do dono). Trazida para cá a 2026-10-05.
-- Corpo sem alterações, md5 confirmado. Correcções vão numa migração nova.
-- @@corpo-capturado@@
-- ===== Funções de âmbito do professor (lidas sem cascata de RLS) =====
CREATE OR REPLACE FUNCTION private.teacher_class_subjects(p_require_active_teacher boolean)
RETURNS TABLE(school_id uuid, class_subject_id uuid, class_group_id uuid, subject_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT cs.school_id, cs.id, cs.class_group_id, cs.subject_id
  FROM public.class_subjects cs
  JOIN public.teachers t ON t.id = cs.teacher_id AND t.school_id = cs.school_id
  WHERE cs.status = 'active' AND t.user_id = (SELECT auth.uid())
    AND (NOT p_require_active_teacher OR t.status = 'active')
$$;

CREATE OR REPLACE FUNCTION private.current_teacher_rows()
RETURNS TABLE(school_id uuid, teacher_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT t.school_id, t.id FROM public.teachers t
  WHERE t.status = 'active' AND t.user_id = (SELECT auth.uid()) AND t.school_id IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION private.teacher_gradebooks()
RETURNS TABLE(school_id uuid, gradebook_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT gb.school_id, gb.id
  FROM public.gradebooks gb
  JOIN public.class_subjects cs ON cs.id = gb.class_subject_id AND cs.school_id = gb.school_id
  JOIN public.teachers t ON t.id = cs.teacher_id AND t.school_id = cs.school_id
  WHERE cs.status = 'active' AND t.user_id = (SELECT auth.uid())
$$;

CREATE OR REPLACE FUNCTION private.teacher_grade_items()
RETURNS TABLE(school_id uuid, grade_item_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT gi.school_id, gi.id
  FROM public.grade_items gi
  JOIN public.gradebooks gb ON gb.id = gi.gradebook_id AND gb.school_id = gi.school_id
  JOIN public.class_subjects cs ON cs.id = gb.class_subject_id AND cs.school_id = gb.school_id
  JOIN public.teachers t ON t.id = cs.teacher_id AND t.school_id = cs.school_id
  WHERE cs.status = 'active' AND t.user_id = (SELECT auth.uid())
$$;

CREATE OR REPLACE FUNCTION private.teacher_students()
RETURNS TABLE(school_id uuid, student_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT e.school_id, e.student_id
  FROM public.enrollments e
  JOIN public.class_subjects cs ON cs.school_id = e.school_id AND cs.class_group_id = e.class_group_id
  JOIN public.teachers t ON t.id = cs.teacher_id AND t.school_id = cs.school_id
  WHERE e.status IN ('active','pending') AND cs.status = 'active'
    AND t.status = 'active' AND t.user_id = (SELECT auth.uid())
$$;

CREATE OR REPLACE FUNCTION private.teacher_people()
RETURNS TABLE(school_id uuid, person_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT s.school_id, s.person_id
  FROM public.students s
  JOIN public.enrollments e ON e.school_id = s.school_id AND e.student_id = s.id
  JOIN public.class_subjects cs ON cs.school_id = e.school_id AND cs.class_group_id = e.class_group_id
  JOIN public.teachers t ON t.id = cs.teacher_id AND t.school_id = cs.school_id
  WHERE e.status IN ('active','pending') AND cs.status = 'active'
    AND t.status = 'active' AND t.user_id = (SELECT auth.uid())
$$;

CREATE OR REPLACE FUNCTION private.user_import_job_ids(p_staff_only boolean)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT j.id FROM public.import_jobs j
  WHERE CASE WHEN p_staff_only
    THEN j.school_id IN (SELECT private.user_role_school_ids(ARRAY['owner','admin','administrador','secretary','secretaria','treasury','tesouraria','finance','teacher','professor']))
    ELSE j.school_id IN (SELECT private.user_member_school_ids()) END
$$;

REVOKE ALL ON FUNCTION private.teacher_class_subjects(boolean), private.current_teacher_rows(),
  private.teacher_gradebooks(), private.teacher_grade_items(), private.teacher_students(),
  private.teacher_people(), private.user_import_job_ids(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.teacher_class_subjects(boolean), private.current_teacher_rows(),
  private.teacher_gradebooks(), private.teacher_grade_items(), private.teacher_students(),
  private.teacher_people(), private.user_import_job_ids(boolean) TO authenticated;

-- ===== Políticas de leitura (mesma lógica, verificações baratas primeiro) =====
ALTER POLICY class_groups_read ON public.class_groups USING (
  school_id IN (SELECT private.user_permission_school_ids('academic.classes.read'))
  OR (school_id IN (SELECT private.user_member_school_ids())
      AND (school_id IN (SELECT private.user_role_school_ids(ARRAY['owner','admin','administrador','secretary','secretaria']))
           OR (school_id, id) IN (SELECT tc.school_id, tc.class_group_id FROM private.teacher_class_subjects(true) tc))));

ALTER POLICY enrollments_read ON public.enrollments USING (
  school_id IN (SELECT private.user_permission_school_ids('students.enrollments.read'))
  OR (school_id IN (SELECT private.user_member_school_ids())
      AND (school_id IN (SELECT private.user_role_school_ids(ARRAY['owner','admin','administrador','secretary','secretaria']))
           OR (status IN ('active','pending')
               AND (school_id, class_group_id) IN (SELECT tc.school_id, tc.class_group_id FROM private.teacher_class_subjects(true) tc)))));

ALTER POLICY subjects_read ON public.subjects USING (
  school_id IN (SELECT private.user_permission_school_ids('academic.subjects.read'))
  OR (school_id IN (SELECT private.user_member_school_ids())
      AND (school_id, id) IN (SELECT tc.school_id, tc.subject_id FROM private.teacher_class_subjects(true) tc)));

ALTER POLICY class_subjects_read ON public.class_subjects USING (
  school_id IN (SELECT private.user_permission_school_ids('academic.timetable.read'))
  OR (school_id IN (SELECT private.user_member_school_ids())
      AND (school_id IN (SELECT private.user_role_school_ids(ARRAY['owner','admin','administrador','secretary','secretaria']))
           OR (school_id, teacher_id) IN (SELECT ct.school_id, ct.teacher_id FROM private.current_teacher_rows() ct)
           OR school_id NOT IN (SELECT ct.school_id FROM private.current_teacher_rows() ct))));

ALTER POLICY timetable_slots_read ON public.timetable_slots USING (
  school_id IN (SELECT private.user_permission_school_ids('academic.timetable.read'))
  OR (school_id IN (SELECT private.user_member_school_ids())
      AND (school_id IN (SELECT private.user_role_school_ids(ARRAY['owner','admin','administrador','secretary','secretaria']))
           OR (school_id, class_subject_id) IN (SELECT tc.school_id, tc.class_subject_id FROM private.teacher_class_subjects(true) tc)
           OR school_id NOT IN (SELECT ct.school_id FROM private.current_teacher_rows() ct))));

ALTER POLICY gradebooks_read ON public.gradebooks USING (
  school_id IN (SELECT private.user_permission_school_ids('assessment.grades.read'))
  OR (school_id IN (SELECT private.user_member_school_ids())
      AND (school_id IN (SELECT private.user_role_school_ids(ARRAY['owner','admin','administrador','secretary','secretaria']))
           OR (school_id, class_subject_id) IN (SELECT tc.school_id, tc.class_subject_id FROM private.teacher_class_subjects(false) tc))));

ALTER POLICY grade_items_read ON public.grade_items USING (
  school_id IN (SELECT private.user_permission_school_ids('assessment.grades.read'))
  OR (school_id IN (SELECT private.user_member_school_ids())
      AND (school_id IN (SELECT private.user_role_school_ids(ARRAY['owner','admin','administrador','secretary','secretaria']))
           OR (school_id, gradebook_id) IN (SELECT tg.school_id, tg.gradebook_id FROM private.teacher_gradebooks() tg))));

ALTER POLICY grade_scores_read ON public.grade_scores USING (
  school_id IN (SELECT private.user_permission_school_ids('assessment.grades.read'))
  OR (school_id IN (SELECT private.user_member_school_ids())
      AND (school_id IN (SELECT private.user_role_school_ids(ARRAY['owner','admin','administrador','secretary','secretaria']))
           OR (school_id, grade_item_id) IN (SELECT ti.school_id, ti.grade_item_id FROM private.teacher_grade_items() ti))));

ALTER POLICY students_read ON public.students USING (
  school_id IN (SELECT private.user_permission_school_ids('students.records.read'))
  OR (school_id IN (SELECT private.user_member_school_ids())
      AND (school_id IN (SELECT private.user_role_school_ids(ARRAY['owner','admin','administrador','secretary','secretaria']))
           OR (school_id, id) IN (SELECT ts.school_id, ts.student_id FROM private.teacher_students() ts))));

ALTER POLICY people_read ON public.people USING (
  school_id IN (SELECT private.user_permission_school_ids('people.records.read'))
  OR (school_id IN (SELECT private.user_member_school_ids())
      AND (school_id IN (SELECT private.user_role_school_ids(ARRAY['owner','admin','administrador','secretary','secretaria']))
           OR (school_id, id) IN (SELECT tp.school_id, tp.person_id FROM private.teacher_people() tp))));

-- ===== Políticas restritivas "School staff only" =====
DO $$
DECLARE p record;
  staff text := $q$(school_id IN (SELECT private.user_role_school_ids(ARRAY['owner','admin','administrador','secretary','secretaria','treasury','tesouraria','finance','teacher','professor'])))$q$;
BEGIN
  FOR p IN SELECT tablename, policyname FROM pg_policies
           WHERE schemaname='public' AND permissive='RESTRICTIVE' AND cmd='ALL'
             AND qual = 'private.is_school_staff(school_id)'
             AND with_check = 'private.is_school_staff(school_id)'
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I USING %s WITH CHECK %s', p.policyname, p.tablename, staff, staff);
  END LOOP;
END $$;

ALTER POLICY "School staff only" ON public.import_rows
  USING (import_job_id IN (SELECT private.user_import_job_ids(true)))
  WITH CHECK (import_job_id IN (SELECT private.user_import_job_ids(true)));
ALTER POLICY "Read school import rows" ON public.import_rows
  USING (import_job_id IN (SELECT private.user_import_job_ids(false)));
ALTER POLICY "School staff only" ON public.import_audits
  USING (import_job_id IN (SELECT private.user_import_job_ids(true)))
  WITH CHECK (import_job_id IN (SELECT private.user_import_job_ids(true)));
ALTER POLICY "Read school import audits" ON public.import_audits
  USING (import_job_id IN (SELECT private.user_import_job_ids(false)));
