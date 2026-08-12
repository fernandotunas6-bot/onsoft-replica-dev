BEGIN;

SELECT plan(8);

SELECT has_table('public', 'school_announcements', 'school_announcements table exists');

SELECT ok(
  (SELECT relrowsecurity AND relforcerowsecurity
   FROM pg_class WHERE oid = 'public.school_announcements'::regclass),
  'school_announcements enforces RLS'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.school_announcements', 'DELETE'),
  'clients cannot hard-delete announcements'
);

SELECT is(
  (SELECT count(*)::integer FROM pg_policy
   WHERE polrelid = 'public.school_announcements'::regclass),
  3,
  'announcements expose read, create and update policies'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.school_announcements', 'SELECT')
  AND has_table_privilege('authenticated', 'public.school_announcements', 'INSERT')
  AND has_table_privilege('authenticated', 'public.school_announcements', 'UPDATE'),
  'authenticated clients have select/insert/update on announcements'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'school_announcements_school_recent_idx'
  ),
  'recent announcements index exists'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.school_announcements'::regclass
      AND tgname = 'school_announcements_protect_identity'
      AND NOT tgisinternal
  ),
  'immutable identity columns are protected'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.school_announcements'::regclass
      AND conname = 'school_announcements_sent_published'
  ),
  'sent announcements require published_at'
);

SELECT * FROM finish();
ROLLBACK;
