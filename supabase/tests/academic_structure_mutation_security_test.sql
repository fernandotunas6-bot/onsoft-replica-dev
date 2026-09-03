BEGIN;

SELECT plan(8);

SELECT has_function(
  'private',
  'enforce_academic_manager_structure_scope',
  ARRAY[]::text[],
  'academic structure service-role guard exists'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'private.enforce_academic_manager_structure_scope()',
    'EXECUTE'
  ),
  'authenticated cannot execute internal structure guard directly'
);

SELECT ok(
  to_regclass('public.class_groups') IS NULL OR EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = to_regclass('public.class_groups')
      AND tgname = 'enforce_academic_manager_structure_scope'
      AND NOT tgisinternal
  ),
  'class groups are guarded on privileged structural writes'
);

SELECT ok(
  to_regclass('public.subjects') IS NULL OR EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = to_regclass('public.subjects')
      AND tgname = 'enforce_academic_manager_structure_scope'
      AND NOT tgisinternal
  ),
  'subjects are guarded on privileged structural writes'
);

SELECT ok(
  to_regclass('public.timetable_slots') IS NULL OR EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = to_regclass('public.timetable_slots')
      AND tgname = 'enforce_academic_manager_structure_scope'
      AND NOT tgisinternal
  ),
  'timetable slots are guarded on privileged structural writes'
);

SELECT ok(
  to_regclass('public.timetable_slots') IS NULL OR EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'timetable_slots'
      AND column_name = 'updated_by'
      AND udt_name = 'uuid'
  ),
  'timetable slots carry updated_by actor identity'
);

SELECT ok(
  position(
    'sga_actor_is_academic_manager' in lower(
      pg_get_functiondef(to_regprocedure('private.enforce_academic_manager_structure_scope()'))
    )
  ) > 0,
  'structure guard explicitly requires academic manager role'
);

SELECT ok(
  position(
    'new.school_id is distinct from old.school_id' in lower(
      pg_get_functiondef(to_regprocedure('private.enforce_academic_manager_structure_scope()'))
    )
  ) > 0,
  'structure guard prevents moving records between tenants'
);

SELECT * FROM finish();
ROLLBACK;
