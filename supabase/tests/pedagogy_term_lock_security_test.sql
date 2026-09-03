BEGIN;

SELECT plan(6);

SELECT has_function(
  'private',
  'enforce_pedagogy_term_lock_scope',
  ARRAY[]::text[],
  'pedagogy term-lock guard exists'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'private.enforce_pedagogy_term_lock_scope()',
    'EXECUTE'
  ),
  'authenticated cannot execute internal term-lock guard directly'
);

SELECT ok(
  to_regclass('public.school_settings') IS NULL OR EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('public.school_settings')
      AND tgname = 'enforce_pedagogy_term_lock_scope'
      AND NOT tgisinternal
  ),
  'school pedagogy settings have term-lock trigger'
);

SELECT ok(
  position(
    'owner' in lower(pg_get_functiondef(to_regprocedure('private.enforce_pedagogy_term_lock_scope()')))
  ) > 0
  AND position(
    'administrador' in lower(pg_get_functiondef(to_regprocedure('private.enforce_pedagogy_term_lock_scope()')))
  ) > 0,
  'term-lock guard is restricted to administrative roles'
);

SELECT ok(
  position(
    'closedterms' in lower(pg_get_functiondef(to_regprocedure('private.enforce_pedagogy_term_lock_scope()')))
  ) > 0
  AND position(
    'academic_years' in lower(pg_get_functiondef(to_regprocedure('private.enforce_pedagogy_term_lock_scope()')))
  ) > 0,
  'term-lock guard validates closedTerms against the active academic calendar'
);

SELECT ok(
  position(
    'new.school_id is distinct from old.school_id' in lower(
      pg_get_functiondef(to_regprocedure('private.enforce_pedagogy_term_lock_scope()'))
    )
  ) > 0,
  'pedagogy settings cannot move between tenants'
);

SELECT * FROM finish();
ROLLBACK;
