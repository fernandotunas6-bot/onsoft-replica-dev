BEGIN;

SELECT plan(9);

SELECT has_function(
  'public',
  'save_academic_calendar',
  ARRAY['uuid','uuid','uuid','text','date','date','jsonb'],
  'transactional academic calendar RPC exists'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.save_academic_calendar(uuid,uuid,uuid,text,date,date,jsonb)',
    'EXECUTE'
  ),
  'authenticated cannot call privileged calendar RPC directly'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.save_academic_calendar(uuid,uuid,uuid,text,date,date,jsonb)',
    'EXECUTE'
  ),
  'anon cannot call privileged calendar RPC directly'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.save_academic_calendar(uuid,uuid,uuid,text,date,date,jsonb)',
    'EXECUTE'
  ),
  'service_role can call guarded calendar RPC'
);

SELECT ok(
  to_regclass('public.academic_years') IS NULL OR EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('public.academic_years')
      AND tgname = 'enforce_academic_calendar_manager_scope'
      AND NOT tgisinternal
  ),
  'academic years have manager-only service-role guard'
);

SELECT ok(
  to_regclass('public.terms') IS NULL OR EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('public.terms')
      AND tgname = 'enforce_academic_calendar_manager_scope'
      AND NOT tgisinternal
  ),
  'terms have manager-only service-role guard'
);

SELECT ok(
  to_regclass('public.academic_years') IS NULL OR (
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'academic_years' AND column_name = 'created_by'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'academic_years' AND column_name = 'updated_by'
    )
  ),
  'academic years carry actor audit columns'
);

SELECT ok(
  to_regclass('public.terms') IS NULL OR (
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'terms' AND column_name = 'created_by'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'terms' AND column_name = 'updated_by'
    )
  ),
  'terms carry actor audit columns'
);

SELECT ok(
  position(
    'jsonb_array_length(p_terms) <> 3' in lower(
      pg_get_functiondef(
        to_regprocedure('public.save_academic_calendar(uuid,uuid,uuid,text,date,date,jsonb)')
      )
    )
  ) > 0
  AND position(
    'sobrepõe o trimestre anterior' in lower(
      pg_get_functiondef(
        to_regprocedure('public.save_academic_calendar(uuid,uuid,uuid,text,date,date,jsonb)')
      )
    )
  ) > 0,
  'calendar RPC validates exactly three non-overlapping terms'
);

SELECT * FROM finish();
ROLLBACK;
