BEGIN;

SELECT plan(5);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'academic_years', 'courses', 'grade_levels', 'rooms', 'people',
        'person_documents', 'person_roles', 'person_relationships',
        'person_school_links', 'students', 'student_guardians',
        'class_groups', 'enrollments', 'student_status_history'
      ])
      AND (
        COALESCE(qual, '') ~* 'school_id\s*=\s*(\(?select\s+)?public\.is_school_member'
        OR COALESCE(with_check, '') ~* 'school_id\s*=\s*(\(?select\s+)?public\.is_school_member'
      )
  ),
  'tenant policies never compare school_id UUID with is_school_member boolean'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'student_status_history'
      AND COALESCE(qual, '') ~* 'school_id\s*=\s*(\(?select\s+)?public\.is_school_member'
  ),
  'student status history uses boolean membership predicate'
);

SELECT ok(
  to_regprocedure('private.audit_domain_change()') IS NOT NULL
  AND pg_get_functiondef(to_regprocedure('private.audit_domain_change()'))
      ~ 'NOT public\.is_school_member\(row_school_id\)',
  'domain audit validates membership using the row school UUID'
);

SELECT ok(
  CASE
    WHEN to_regprocedure('public.create_student(uuid,text,uuid,uuid,date,jsonb)') IS NULL THEN true
    ELSE NOT has_function_privilege(
      'authenticated',
      'public.create_student(uuid,text,uuid,uuid,date,jsonb)',
      'EXECUTE'
    )
  END,
  'broken legacy create_student RPC is not executable by authenticated clients'
);

SELECT ok(
  CASE
    WHEN to_regprocedure('public.create_person(jsonb,text[],jsonb,jsonb,text)') IS NULL THEN true
    ELSE NOT has_function_privilege(
      'authenticated',
      'public.create_person(jsonb,text[],jsonb,jsonb,text)',
      'EXECUTE'
    )
  END,
  'broken legacy create_person RPC is not executable by authenticated clients'
);

SELECT * FROM finish();
ROLLBACK;
