BEGIN;

SELECT plan(6);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'teachers'
      AND policyname = 'Professor reads own teacher record'
      AND COALESCE(qual, '') ~ 'auth\.uid'
  ),
  'Professor reads only own teacher record'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'class_groups'
      AND policyname = 'Professor reads assigned class groups'
      AND COALESCE(qual, '') ~ 'class_subjects'
      AND COALESCE(qual, '') ~ 'teacher_id'
  ),
  'Professor class groups are derived from active class-subject assignments'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'subjects'
      AND policyname = 'Professor reads assigned subjects'
      AND COALESCE(qual, '') ~ 'subject_id'
  ),
  'Professor reads only assigned subjects'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'enrollments'
      AND policyname = 'Professor reads assigned enrollments'
      AND COALESCE(qual, '') ~ 'class_group_id'
  ),
  'Professor reads enrollments only in assigned classes'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'students'
      AND policyname = 'Professor reads students in assigned classes'
      AND COALESCE(qual, '') ~ 'enrollments'
      AND COALESCE(qual, '') ~ 'class_subjects'
  ),
  'Professor reads students through assigned active enrollments'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'people'
      AND policyname = 'Professor reads people for assigned students'
      AND COALESCE(qual, '') ~ 'students'
      AND COALESCE(qual, '') ~ 'enrollments'
      AND COALESCE(qual, '') ~ 'class_subjects'
  ),
  'Professor personal-data read is limited to assigned students'
);

SELECT * FROM finish();
ROLLBACK;
