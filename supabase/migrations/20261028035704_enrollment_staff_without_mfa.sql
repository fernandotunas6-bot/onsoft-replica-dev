-- Requested by the owner on 2026-10-28: enrollment operations accept AAL1.
-- Authentication, active school membership, staff role, action permissions,
-- module grants, capacity, identity, numbering and RLS remain enforced.
-- Do not change private.is_aal2 or any unrelated MFA rule.
DO $migration$
DECLARE
  item record;
  source text;
  found_count integer := 0;
BEGIN
  FOR item IN
    SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='private' AND p.prokind='f'
      AND p.proname IN ('register_student','enroll_student','enroll_new_student_atomic','create_person_bundle')
  LOOP
    found_count := found_count + 1;
    source := pg_get_functiondef(item.oid);
    IF item.proname='create_person_bundle' THEN
      -- Only the student-only branch is exempt; teacher/staff/account creation
      -- through the person bundle still requires MFA.
      source := replace(source, 'OR NOT private.is_aal2()',
        'OR (NOT COALESCE(private.is_aal2(), false) AND p_roles IS DISTINCT FROM ARRAY[''aluno'']::text[])');
      IF position('enrollment_staff_policy_20261028' in source)=0 THEN
        source := replace(source, 'IF auth.uid() IS NULL',
          'IF auth.uid() IS NULL /* enrollment_staff_policy_20261028 */ OR NOT public.is_school_member(p_school_id)');
      END IF;
    ELSE
      source := regexp_replace(source, '\s+or not private\.is_aal2\(\)', '', 'gi');
      IF item.proname IN ('register_student','enroll_student')
        AND position('enrollment_staff_policy_20261028' in source)=0 THEN
        source := replace(source, 'if (select auth.uid()) is null',
          'if (select auth.uid()) is null /* enrollment_staff_policy_20261028 */
            or not public.is_school_member(target_school_id)
            or private.sga_app_role(target_school_id) not in (''Administrador'',''Secretaria'')
            or exists (select 1 from public.staff_module_grants where school_id=target_school_id
              and user_id=auth.uid() and module_key=''pessoas'' and level in (''Nenhum'',''Leitura''))');
      END IF;
      IF position('is_aal2()' in source)>0 THEN
        RAISE EXCEPTION 'Unexpected MFA predicate in %', item.proname;
      END IF;
    END IF;
    source := replace(source, 'Confirme o vínculo e o 2FA.', 'Confirme o vínculo e as permissões de escrita.');
    IF position('public.is_school_member(' in source)=0
      OR position('private.has_permission(' in source)=0
      OR position('private.sga_app_role(' in source)=0 THEN
      RAISE EXCEPTION 'Required authorization guard missing in %', item.proname;
    END IF;
    EXECUTE source;
  END LOOP;
  IF found_count<>4 THEN RAISE EXCEPTION 'Expected four enrollment functions, found %',found_count; END IF;
END;
$migration$;
