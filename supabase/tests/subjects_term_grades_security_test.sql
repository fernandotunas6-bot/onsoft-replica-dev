BEGIN;

SELECT plan(9);

SELECT has_table('public', 'subjects', 'subjects table exists');
SELECT has_table('public', 'term_grades', 'term_grades table exists');

SELECT ok(
  (SELECT count(*) = 2 FROM pg_class
   WHERE oid IN ('public.subjects'::regclass, 'public.term_grades'::regclass)
     AND relrowsecurity AND relforcerowsecurity),
  'subjects and term_grades enforce RLS'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.subjects', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'public.term_grades', 'DELETE'),
  'clients cannot hard-delete academic assessment records'
);

SELECT is(
  (SELECT count(*)::integer FROM pg_policy
   WHERE polrelid IN ('public.subjects'::regclass, 'public.term_grades'::regclass)),
  6,
  'subjects and term_grades expose read/create/update policies'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'subjects_school_active_idx'
  ),
  'active subjects index exists'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.term_grades'::regclass
      AND conname = 'term_grades_enrollment_subject_term_key'
  ),
  'one grade row per enrollment/subject/term'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.term_grades'::regclass
      AND tgname = 'term_grades_protect_identity'
      AND NOT tgisinternal
  ),
  'term grade identity columns are immutable'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.subjects', 'SELECT')
  AND has_table_privilege('authenticated', 'public.term_grades', 'INSERT'),
  'authenticated academic clients can read subjects and insert grades'
);

SELECT * FROM finish();
ROLLBACK;
