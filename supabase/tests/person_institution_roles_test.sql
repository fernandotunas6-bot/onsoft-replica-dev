BEGIN;

SELECT plan(7);

SELECT has_table('public', 'person_roles', 'person roles table exists');
SELECT has_column('public', 'person_roles', 'school_id', 'person roles is tenant scoped');
SELECT has_column('public', 'person_roles', 'person_id', 'person roles references a person');
SELECT has_column('public', 'person_roles', 'role', 'person roles stores the role');
SELECT ok(
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.person_roles'::regclass),
  'person roles forces RLS'
);
SELECT ok(
  to_regclass('public.person_roles_school_role_active_idx') IS NOT NULL,
  'active role lookup index exists'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.person_roles', 'INSERT'),
  'client cannot forge institutional person roles directly'
);

SELECT * FROM finish();
ROLLBACK;
