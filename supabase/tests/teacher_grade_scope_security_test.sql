BEGIN;

SELECT plan(10);

SELECT has_function(
  'private',
  'sga_actor_has_role',
  ARRAY['uuid','uuid','text[]'],
  'actor role helper exists'
);

SELECT has_function(
  'private',
  'sga_actor_is_academic_manager',
  ARRAY['uuid','uuid'],
  'academic manager helper exists'
);

SELECT has_function(
  'private',
  'sga_actor_is_teacher',
  ARRAY['uuid','uuid'],
  'teacher helper exists'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'private.sga_actor_has_role(uuid,uuid,text[])', 'EXECUTE'),
  'authenticated cannot call privileged actor-role helper directly'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'private.sga_actor_is_teacher(uuid,uuid)', 'EXECUTE'),
  'authenticated cannot call privileged teacher helper directly'
);

SELECT ok(
  to_regclass('public.class_subjects') IS NULL OR EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.class_subjects'::regclass
      AND tgname = 'enforce_teacher_class_subject_scope'
      AND NOT tgisinternal
  ),
  'class_subject assignment has teacher-scope trigger when table exists'
);

SELECT ok(
  to_regclass('public.grade_scores') IS NULL OR EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.grade_scores'::regclass
      AND tgname = 'enforce_teacher_grade_score_scope'
      AND NOT tgisinternal
  ),
  'grade scores have teacher-scope trigger when table exists'
);

SELECT ok(
  to_regclass('public.siga_assessment_items') IS NULL OR EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.siga_assessment_items'::regclass
      AND tgname = 'enforce_teacher_assessment_item_scope'
      AND NOT tgisinternal
  ),
  'assessment items have teacher-scope trigger when table exists'
);

SELECT ok(
  to_regclass('public.siga_assessment_scores') IS NULL OR EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.siga_assessment_scores'::regclass
      AND tgname = 'enforce_teacher_assessment_score_scope'
      AND NOT tgisinternal
  ),
  'assessment scores have teacher-scope trigger when table exists'
);

SELECT ok(
  NOT has_function_privilege('anon', 'private.sga_actor_has_role(uuid,uuid,text[])', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'private.sga_actor_is_academic_manager(uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'private.sga_actor_is_teacher(uuid,uuid)', 'EXECUTE'),
  'anon cannot call internal authorization helpers'
);

SELECT * FROM finish();
ROLLBACK;
