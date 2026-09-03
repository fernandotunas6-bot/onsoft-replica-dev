BEGIN;

SELECT plan(9);

SELECT has_function(
  'public',
  'delete_sga_assessment_item',
  ARRAY['uuid','uuid','uuid','boolean'],
  'guarded assessment delete RPC exists'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.delete_sga_assessment_item(uuid,uuid,uuid,boolean)',
    'EXECUTE'
  ),
  'authenticated cannot call destructive service-role RPC directly'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.delete_sga_assessment_item(uuid,uuid,uuid,boolean)',
    'EXECUTE'
  ),
  'anon cannot call destructive service-role RPC directly'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.delete_sga_assessment_item(uuid,uuid,uuid,boolean)',
    'EXECUTE'
  ),
  'service_role can call guarded assessment delete RPC'
);

SELECT ok(
  position(
    'school_settings' in lower(
      pg_get_functiondef(to_regprocedure('public.delete_sga_assessment_item(uuid,uuid,uuid,boolean)'))
    )
  ) > 0
  AND position(
    'closedterms' in lower(
      pg_get_functiondef(to_regprocedure('public.delete_sga_assessment_item(uuid,uuid,uuid,boolean)'))
    )
  ) > 0,
  'destructive RPC checks closed academic terms before deleting'
);

SELECT ok(
  to_regclass('public.siga_assessment_items') IS NULL OR EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('public.siga_assessment_items')
      AND tgname = 'enforce_assessment_item_delete_scope'
      AND NOT tgisinternal
  ),
  'assessment items have a BEFORE DELETE authorization trigger when table exists'
);

SELECT ok(
  to_regclass('public.siga_assessment_scores') IS NULL OR EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('public.siga_assessment_scores')
      AND tgname = 'enforce_assessment_score_delete_scope'
      AND NOT tgisinternal
  ),
  'assessment scores have a BEFORE DELETE authorization trigger when table exists'
);

SELECT ok(
  to_regclass('public.class_subjects') IS NULL OR EXISTS (
    SELECT 1
    FROM pg_trigger t
    WHERE t.tgrelid = to_regclass('public.class_subjects')
      AND t.tgname = 'enforce_teacher_class_subject_scope'
      AND NOT t.tgisinternal
      AND pg_get_triggerdef(t.oid) ILIKE '%BEFORE INSERT OR UPDATE ON%'
      AND pg_get_triggerdef(t.oid) NOT ILIKE '%UPDATE OF%'
  ),
  'class_subject guard covers every UPDATE, including destructive unassignment/status changes'
);

SELECT ok(
  to_regclass('public.siga_assessment_items') IS NULL
  OR NOT has_table_privilege('authenticated', 'public.siga_assessment_items', 'DELETE'),
  'authenticated has no direct DELETE privilege on assessment items'
);

SELECT * FROM finish();
ROLLBACK;
