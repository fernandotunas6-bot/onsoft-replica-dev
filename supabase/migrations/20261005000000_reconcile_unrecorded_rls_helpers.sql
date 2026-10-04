-- Reconciliação (auditoria 12, 2026-10-04): funções auxiliares de RLS que existem na produção
-- mas nunca tiveram migração. Foram criadas directamente na base na noite de 04/10, em conjunto
-- com a reescrita de 116 políticas (`school_id IN (SELECT private.user_*_school_ids(...))`, que
-- permite ao planeador avaliar a função uma só vez). As políticas reescritas estão em
-- supabase/PRODUCTION_SNAPSHOT.json (fonte de verdade); aqui ficam só as funções de que
-- dependem, para que uma base reconstruída a partir do repositório as tenha.
-- Definições copiadas da produção (pg_get_functiondef). Idempotente.

CREATE OR REPLACE FUNCTION private.user_member_school_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT sm.school_id FROM public.school_memberships sm
  WHERE sm.user_id = (SELECT auth.uid()) AND sm.status = 'active' AND sm.school_id IS NOT NULL
$function$;

CREATE OR REPLACE FUNCTION private.user_permission_school_ids(permission_code text)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT m.school_id
  FROM public.school_memberships m
  JOIN public.member_roles mr ON mr.school_id = m.school_id AND mr.membership_id = m.id
  JOIN public.role_permissions rp ON rp.school_id = mr.school_id AND rp.role_id = mr.role_id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND m.user_id = (SELECT auth.uid()) AND m.status = 'active' AND m.school_id IS NOT NULL
    AND p.code = permission_code
$function$;

CREATE OR REPLACE FUNCTION private.user_role_school_ids(p_codes text[])
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT sm.school_id
  FROM public.school_memberships sm
  JOIN public.member_roles mr ON mr.membership_id = sm.id
  JOIN public.roles r ON r.id = mr.role_id
  WHERE sm.user_id = (SELECT auth.uid()) AND sm.status = 'active' AND sm.school_id IS NOT NULL
    AND lower(btrim(r.code)) = ANY (p_codes)
$function$;

CREATE OR REPLACE FUNCTION private.user_import_job_ids(p_staff_only boolean)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT j.id FROM public.import_jobs j
  WHERE CASE WHEN p_staff_only
    THEN j.school_id IN (SELECT private.user_role_school_ids(ARRAY['owner','admin','administrador','secretary','secretaria','treasury','tesouraria','finance','teacher','professor']))
    ELSE j.school_id IN (SELECT private.user_member_school_ids()) END
$function$;

CREATE OR REPLACE FUNCTION private.current_teacher_rows()
 RETURNS TABLE(school_id uuid, teacher_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT t.school_id, t.id FROM public.teachers t
  WHERE t.status = 'active' AND t.user_id = (SELECT auth.uid()) AND t.school_id IS NOT NULL
$function$;

CREATE OR REPLACE FUNCTION private.teacher_class_subjects(p_require_active_teacher boolean)
 RETURNS TABLE(school_id uuid, class_subject_id uuid, class_group_id uuid, subject_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT cs.school_id, cs.id, cs.class_group_id, cs.subject_id
  FROM public.class_subjects cs
  JOIN public.teachers t ON t.id = cs.teacher_id AND t.school_id = cs.school_id
  WHERE cs.status = 'active' AND t.user_id = (SELECT auth.uid())
    AND (NOT p_require_active_teacher OR t.status = 'active')
$function$;

CREATE OR REPLACE FUNCTION private.teacher_grade_items()
 RETURNS TABLE(school_id uuid, grade_item_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT gi.school_id, gi.id
  FROM public.grade_items gi
  JOIN public.gradebooks gb ON gb.id = gi.gradebook_id AND gb.school_id = gi.school_id
  JOIN public.class_subjects cs ON cs.id = gb.class_subject_id AND cs.school_id = gb.school_id
  JOIN public.teachers t ON t.id = cs.teacher_id AND t.school_id = cs.school_id
  WHERE cs.status = 'active' AND t.user_id = (SELECT auth.uid())
$function$;

CREATE OR REPLACE FUNCTION private.teacher_gradebooks()
 RETURNS TABLE(school_id uuid, gradebook_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT gb.school_id, gb.id
  FROM public.gradebooks gb
  JOIN public.class_subjects cs ON cs.id = gb.class_subject_id AND cs.school_id = gb.school_id
  JOIN public.teachers t ON t.id = cs.teacher_id AND t.school_id = cs.school_id
  WHERE cs.status = 'active' AND t.user_id = (SELECT auth.uid())
$function$;

CREATE OR REPLACE FUNCTION private.teacher_people()
 RETURNS TABLE(school_id uuid, person_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT s.school_id, s.person_id
  FROM public.students s
  JOIN public.enrollments e ON e.school_id = s.school_id AND e.student_id = s.id
  JOIN public.class_subjects cs ON cs.school_id = e.school_id AND cs.class_group_id = e.class_group_id
  JOIN public.teachers t ON t.id = cs.teacher_id AND t.school_id = cs.school_id
  WHERE e.status IN ('active','pending') AND cs.status = 'active'
    AND t.status = 'active' AND t.user_id = (SELECT auth.uid())
$function$;

CREATE OR REPLACE FUNCTION private.teacher_students()
 RETURNS TABLE(school_id uuid, student_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT e.school_id, e.student_id
  FROM public.enrollments e
  JOIN public.class_subjects cs ON cs.school_id = e.school_id AND cs.class_group_id = e.class_group_id
  JOIN public.teachers t ON t.id = cs.teacher_id AND t.school_id = cs.school_id
  WHERE e.status IN ('active','pending') AND cs.status = 'active'
    AND t.status = 'active' AND t.user_id = (SELECT auth.uid())
$function$;

-- Permissões iguais às da produção: só postgres e authenticated executam.
REVOKE ALL ON FUNCTION private.user_member_school_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.user_permission_school_ids(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.user_role_school_ids(text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.user_import_job_ids(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_teacher_rows() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.teacher_class_subjects(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.teacher_grade_items() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.teacher_gradebooks() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.teacher_people() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.teacher_students() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.user_member_school_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION private.user_permission_school_ids(text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.user_role_school_ids(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION private.user_import_job_ids(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_teacher_rows() TO authenticated;
GRANT EXECUTE ON FUNCTION private.teacher_class_subjects(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION private.teacher_grade_items() TO authenticated;
GRANT EXECUTE ON FUNCTION private.teacher_gradebooks() TO authenticated;
GRANT EXECUTE ON FUNCTION private.teacher_people() TO authenticated;
GRANT EXECUTE ON FUNCTION private.teacher_students() TO authenticated;
