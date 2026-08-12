BEGIN;

SELECT plan(7);

SELECT has_table('public', 'class_schedule_slots', 'class_schedule_slots table exists');

SELECT ok(
  (SELECT relrowsecurity AND relforcerowsecurity
   FROM pg_class WHERE oid = 'public.class_schedule_slots'::regclass),
  'class_schedule_slots enforces RLS'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.class_schedule_slots', 'DELETE'),
  'clients cannot hard-delete schedule slots'
);

SELECT is(
  (SELECT count(*)::integer FROM pg_policy
   WHERE polrelid = 'public.class_schedule_slots'::regclass),
  3,
  'schedule slots expose read/create/update policies'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.class_schedule_slots'::regclass
      AND conname = 'class_schedule_slots_unique_cell'
  ),
  'one slot per class/weekday/start time'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.class_schedule_slots'::regclass
      AND tgname = 'class_schedule_slots_protect_identity'
      AND NOT tgisinternal
  ),
  'schedule identity columns are immutable'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.class_schedule_slots', 'SELECT')
  AND has_table_privilege('authenticated', 'public.class_schedule_slots', 'INSERT'),
  'authenticated academic clients can read/create schedule slots'
);

SELECT * FROM finish();
ROLLBACK;
