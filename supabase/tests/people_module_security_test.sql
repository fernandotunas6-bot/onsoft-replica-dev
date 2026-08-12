BEGIN;
SELECT plan(44);

SELECT has_table('public', 'academic_years', 'academic years table exists');
SELECT has_table('public', 'courses', 'courses table exists');
SELECT has_table('public', 'grade_levels', 'grade levels table exists');
SELECT has_table('public', 'rooms', 'rooms table exists');
SELECT has_table('public', 'people', 'reusable people table exists');
SELECT has_table('public', 'person_documents', 'person documents table exists');
SELECT has_table('public', 'person_roles', 'person roles table exists');
SELECT has_table('public', 'person_relationships', 'person relationships table exists');
SELECT has_table('public', 'person_school_links', 'person school links table exists');
SELECT has_table('public', 'students', 'students table exists');
SELECT has_table('public', 'student_guardians', 'student guardians table exists');
SELECT has_table('public', 'class_groups', 'class groups table exists');
SELECT has_table('public', 'enrollments', 'enrollments table exists');
SELECT has_view('public', 'student_directory', 'student directory read model exists');

SELECT ok(
  has_function_privilege('authenticated', 'public.can_read_students()', 'EXECUTE'),
  'authenticated users can evaluate student read authorization'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.can_manage_students()', 'EXECUTE'),
  'authenticated users can evaluate student write authorization'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.can_read_students()', 'EXECUTE'),
  'anonymous users cannot evaluate student authorization'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.can_manage_students()', 'EXECUTE'),
  'anonymous users cannot evaluate student write authorization'
);

SELECT ok(
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.people'::regclass),
  'people forces RLS'
);
SELECT ok(
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.person_documents'::regclass),
  'person documents forces RLS'
);
SELECT ok(
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.students'::regclass),
  'students forces RLS'
);
SELECT ok(
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.class_groups'::regclass),
  'class groups forces RLS'
);
SELECT ok(
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.enrollments'::regclass),
  'enrollments forces RLS'
);

SELECT ok(to_regclass('public.people_full_name_trgm_idx') IS NOT NULL, 'name search index exists');
SELECT ok(
  to_regclass('public.students_registration_search_idx') IS NOT NULL,
  'registration search index exists'
);
SELECT ok(
  to_regclass('public.enrollments_one_current_per_student_idx') IS NOT NULL,
  'one current enrollment index exists'
);
SELECT ok(
  (SELECT reloptions @> ARRAY['security_invoker=true']
   FROM pg_class WHERE oid = 'public.student_directory'::regclass),
  'student directory honors underlying RLS'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.students'::regclass
      AND conname = 'students_school_person_fkey'
      AND contype = 'f'
  ),
  'students cannot reference a person from another school'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.enrollments'::regclass
      AND conname = 'enrollments_group_fkey'
      AND contype = 'f'
  ),
  'enrollments cannot reference a class group from another school'
);
SELECT ok(
  (SELECT count(*) = 3 FROM pg_policy WHERE polrelid = 'public.students'::regclass),
  'students exposes exactly read, create, and update policies'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.students', 'DELETE'),
  'clients cannot hard-delete students'
);
SELECT ok(
  has_function_privilege(
    'authenticated', 'public.merge_people(uuid,uuid,text)', 'EXECUTE'
  ),
  'authorized clients can invoke the RLS-protected people merge workflow'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.person_documents'::regclass
      AND conname = 'person_documents_school_person_fkey'
      AND contype = 'f'
  ),
  'person documents cannot reference another school'
);
SELECT ok(
  (SELECT count(*) = 3 FROM pg_policy WHERE polrelid = 'public.people'::regclass),
  'people exposes exactly read, create, and update policies'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.people'::regclass
      AND tgname = 'people_validate_birth_date'
      AND tgfoid = 'private.validate_person_birth_date()'::regprocedure
      AND NOT tgisinternal
  ),
  'future birth dates are rejected by a runtime-safe trigger'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated', 'private.validate_person_birth_date()', 'EXECUTE'
  ),
  'clients cannot call the birth date trigger function directly'
);
SELECT ok(
  (
    SELECT bool_and(NOT prosecdef)
    FROM pg_proc
    WHERE oid IN (
      'public.merge_people(uuid,uuid,text)'::regprocedure,
      'public.create_person(jsonb,text[],jsonb,jsonb,text)'::regprocedure,
      'public.create_student(uuid,text,uuid,uuid,date,jsonb)'::regprocedure,
      'public.enroll_new_student(jsonb,text,uuid,uuid,date,jsonb,text)'::regprocedure,
      'public.change_student_status(uuid,text,text)'::regprocedure
    )
  ),
  'public write workflows run as security invoker'
);
SELECT ok(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'private.audit_domain_change()'::regprocedure),
  'private audit trigger is security definer'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'private.audit_domain_change()', 'EXECUTE'),
  'clients cannot invoke the privileged audit writer directly'
);
SELECT ok(
  (
    SELECT count(*) = 3
    FROM pg_trigger
    WHERE tgfoid = 'private.audit_domain_change()'::regprocedure
      AND NOT tgisinternal
  ),
  'people, students, and enrollments are audited automatically'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.student_status_history', 'UPDATE'),
  'student status history is immutable to clients'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.student_status_history', 'INSERT'),
  'clients cannot forge student status history'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.students'::regclass
      AND tgname = 'students_record_status_change'
      AND tgfoid = 'private.record_student_status_change()'::regprocedure
      AND NOT tgisinternal
  ),
  'student status changes create history automatically'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.enroll_new_student(jsonb,text,uuid,uuid,date,jsonb,text)',
    'EXECUTE'
  ),
  'authorized clients can perform one-transaction student registration'
);

SELECT * FROM finish();
ROLLBACK;
