BEGIN;

SELECT plan(4);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'private.reject_immutable_column_changes()',
    'EXECUTE'
  ),
  'clients cannot invoke the immutable-column trigger directly'
);

SELECT ok(
  NOT (SELECT prosecdef
       FROM pg_proc
       WHERE oid = 'private.reject_immutable_column_changes()'::regprocedure),
  'immutable-column protection does not elevate privileges'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_trigger
    WHERE tgfoid = 'private.reject_immutable_column_changes()'::regprocedure
      AND NOT tgisinternal
  ),
  20,
  'all mutable tenant-domain tables protect identity metadata'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.audit_logs', 'UPDATE'),
  'append-only audit rows remain immutable without an update privilege'
);

SELECT * FROM finish();
ROLLBACK;
