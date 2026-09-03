BEGIN;

SELECT plan(6);

SELECT has_function(
  'private',
  'sga_request_is_service_role',
  ARRAY[]::text[],
  'service-role request helper exists'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'private.sga_request_is_service_role()', 'EXECUTE'),
  'authenticated cannot call service-role helper directly'
);

SELECT ok(
  NOT has_function_privilege('anon', 'private.sga_request_is_service_role()', 'EXECUTE'),
  'anon cannot call service-role helper directly'
);

SELECT ok(
  position('privilegiad' in lower(pg_get_functiondef(to_regprocedure('private.enforce_teacher_grade_score_scope()')))) > 0,
  'grade-score trigger fails closed for privileged writes without a trusted actor'
);

SELECT ok(
  to_regclass('public.class_subjects') IS NULL OR EXISTS (
    SELECT 1
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'class_subjects'
      AND p.policyname = 'Academic read class subjects'
      AND p.cmd = 'SELECT'
      AND p.qual ILIKE '%teachers%'
      AND p.qual ILIKE '%auth.uid%'
  ),
  'class_subjects SELECT policy scopes authenticated teachers to their own assignments'
);

SELECT ok(
  to_regclass('public.timetable_slots') IS NULL OR EXISTS (
    SELECT 1
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'timetable_slots'
      AND p.policyname = 'Academic read timetable slots'
      AND p.cmd = 'SELECT'
      AND p.qual ILIKE '%class_subjects%'
      AND p.qual ILIKE '%teachers%'
      AND p.qual ILIKE '%auth.uid%'
  ),
  'timetable SELECT policy scopes authenticated teachers to assigned class subjects'
);

SELECT * FROM finish();
ROLLBACK;
