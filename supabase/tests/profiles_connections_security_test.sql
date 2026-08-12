BEGIN;
SELECT plan(65);

SELECT has_table('public', 'profiles', 'profiles exists');
SELECT has_table('public', 'app_user_connections', 'connector credential store exists');
SELECT has_table('public', 'schools', 'schools exists');
SELECT has_table('public', 'attachments', 'attachments exists');
SELECT has_table('public', 'audit_logs', 'audit log exists');
SELECT has_table('public', 'school_billing_settings', 'reusable billing settings exist');
SELECT ok(
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.school_billing_settings'::regclass),
  'billing settings force RLS'
);
SELECT policies_are(
  'public', 'school_billing_settings',
  ARRAY['Finance roles can read billing settings', 'Finance roles can update billing settings'],
  'billing settings expose only finance-role policies'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.school_billing_settings', 'INSERT'),
  'clients cannot create competing billing settings rows'
);
SELECT ok(
  has_column_privilege('authenticated', 'public.school_billing_settings', 'due_day', 'UPDATE'),
  'finance roles may submit an authorized due-day update'
);
SELECT ok(
  NOT has_column_privilege('authenticated', 'public.school_billing_settings', 'version', 'UPDATE'),
  'clients cannot forge billing settings versions'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.school_billing_settings'::regclass
      AND tgname = 'school_billing_settings_audit'
      AND NOT tgisinternal
  ),
  'billing settings changes are audited automatically'
);
SELECT ok(
  to_regclass('public.audit_logs_school_recent_idx') IS NOT NULL,
  'recent school audit query has a supporting index'
);

SELECT ok(
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.schools'::regclass),
  'schools forces RLS'
);
SELECT policies_are(
  'public',
  'schools',
  ARRAY['Users can view their own school', 'Administrators can update their own school'],
  'schools exposes only school-scoped read and administrator update policies'
);
SELECT ok(
  has_column_privilege('authenticated', 'public.schools', 'name', 'UPDATE'),
  'authenticated role may submit an authorized school name update'
);
SELECT ok(
  NOT has_column_privilege('authenticated', 'public.schools', 'status', 'UPDATE'),
  'clients cannot archive or reactivate schools'
);
SELECT ok(
  NOT has_column_privilege('authenticated', 'public.schools', 'version', 'UPDATE'),
  'clients cannot forge the school concurrency version'
);
SELECT ok(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'private.audit_school_change()'::regprocedure),
  'school audit trigger is security definer'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'private.audit_school_change()', 'EXECUTE'),
  'clients cannot invoke the school audit writer directly'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.schools'::regclass
      AND tgname = 'schools_audit_change'
      AND NOT tgisinternal
  ),
  'school updates are audited automatically'
);
SELECT ok(
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.attachments'::regclass),
  'attachments forces RLS'
);
SELECT ok(
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.audit_logs'::regclass),
  'audit log forces RLS'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.current_profile_role()', 'EXECUTE'),
  'authenticated may resolve its server-managed profile role'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.current_profile_role()', 'EXECUTE'),
  'anonymous clients cannot resolve profile roles'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.audit_logs', 'INSERT'),
  'clients cannot forge audit events'
);
SELECT ok(
  NOT has_column_privilege('authenticated', 'public.attachments', 'school_id', 'UPDATE'),
  'clients cannot move attachments between schools'
);
SELECT ok(
  has_column_privilege('authenticated', 'public.attachments', 'updated_by', 'UPDATE'),
  'authorized clients can attribute attachment updates'
);
SELECT policies_are(
  'public', 'audit_logs', ARRAY['Read audit logs of own school'],
  'audit log exposes only its administrator read policy'
);
SELECT policies_are(
  'public',
  'attachments',
  ARRAY[
    'Read attachments in own school',
    'Create attachments in own school',
    'Update attachments in own school'
  ],
  'attachments exposes only the expected school-scoped policies'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass),
  'profiles has RLS enabled'
);
SELECT ok(
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass),
  'profiles forces RLS'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.app_user_connections'::regclass),
  'connector credential store has RLS enabled'
);
SELECT ok(
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.app_user_connections'::regclass),
  'connector credential store forces RLS'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.app_user_connections'::regclass
      AND confrelid = 'auth.users'::regclass
      AND contype = 'f'
      AND confdeltype = 'c'
  ),
  'connector rows reference auth.users with cascade delete'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.app_user_connections'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE 'UNIQUE (user_id, connector_id)%'
  ),
  'one connector row is allowed per user and connector'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.app_user_connections'::regclass
      AND conname = 'app_user_connections_connector_id_valid'
      AND contype = 'c'
  ),
  'connector identifiers are validated'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.app_user_connections'::regclass
      AND conname = 'app_user_connections_ciphertext_not_blank'
      AND contype = 'c'
  ),
  'blank connector ciphertext is rejected'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_full_name_valid'
      AND contype = 'c'
  ),
  'profile names are validated'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_cargo_valid'
      AND contype = 'c'
  ),
  'profile roles are restricted to supported values'
);

SELECT ok(
  to_regprocedure('private.handle_new_user()') IS NOT NULL,
  'Auth profile trigger function lives in private schema'
);
SELECT ok(
  to_regprocedure('public.handle_new_user()') IS NULL,
  'privileged Auth profile trigger function is absent from public schema'
);
SELECT ok(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'private.handle_new_user()'::regprocedure),
  'Auth profile trigger is security definer'
);
SELECT ok(
  NOT has_schema_privilege('authenticated', 'private', 'USAGE'),
  'authenticated cannot access private schema'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.profiles', 'SELECT'),
  'authenticated can select profiles subject to RLS'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.profiles', 'SELECT'),
  'anonymous clients cannot select profiles'
);
SELECT ok(
  has_column_privilege('authenticated', 'public.profiles', 'full_name', 'UPDATE'),
  'authenticated can update full_name'
);
SELECT ok(
  NOT has_column_privilege('authenticated', 'public.profiles', 'cargo', 'UPDATE'),
  'authenticated cannot update cargo'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.profiles', 'INSERT'),
  'authenticated cannot insert profiles because the Auth trigger owns creation'
);
SELECT ok(
  NOT has_column_privilege('authenticated', 'public.profiles', 'cargo', 'INSERT'),
  'authenticated cannot choose cargo on insert'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.app_user_connections', 'SELECT'),
  'authenticated cannot read connector credentials'
);
SELECT ok(
  has_table_privilege('service_role', 'public.app_user_connections', 'SELECT, INSERT, UPDATE, DELETE'),
  'service role can manage connector credentials'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'auth.users'::regclass
      AND tgname = 'on_auth_user_created'
      AND tgfoid = 'private.handle_new_user()'::regprocedure
      AND NOT tgisinternal
  ),
  'auth.users trigger calls the private profile function'
);

SELECT policies_are(
  'public',
  'profiles',
  ARRAY[
    'Users can view their own profile',
    'Users can update their own profile'
  ],
  'profiles exposes only the expected RLS policies'
);
SELECT policy_roles_are(
  'public', 'profiles', 'Users can view their own profile', ARRAY['authenticated'],
  'profile select policy is limited to authenticated'
);
SELECT policy_roles_are(
  'public', 'profiles', 'Users can update their own profile', ARRAY['authenticated'],
  'profile update policy is limited to authenticated'
);
SELECT policy_cmd_is(
  'public', 'profiles', 'Users can view their own profile', 'SELECT',
  'profile view policy applies to SELECT'
);
SELECT policy_cmd_is(
  'public', 'profiles', 'Users can update their own profile', 'UPDATE',
  'profile update policy applies to UPDATE'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid = 'public.profiles'::regclass
      AND polname = 'Users can view their own profile'
      AND pg_get_expr(polqual, polrelid) LIKE '%auth.uid()%id%'
  ),
  'profile select policy checks auth.uid ownership'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid = 'public.profiles'::regclass
      AND polcmd = 'a'
  ),
  'profiles exposes no client INSERT policy'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid = 'public.profiles'::regclass
      AND polname = 'Users can update their own profile'
      AND pg_get_expr(polqual, polrelid) LIKE '%auth.uid()%id%'
      AND pg_get_expr(polwithcheck, polrelid) LIKE '%auth.uid()%id%'
  ),
  'profile update policy has ownership checks for existing and new rows'
);

SELECT ok(
  to_regprocedure('public.set_updated_at()') IS NOT NULL,
  'timestamp trigger function exists'
);
SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.set_updated_at()'::regprocedure),
  'timestamp trigger function is security invoker'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.set_updated_at()', 'EXECUTE'),
  'authenticated cannot call timestamp trigger function directly'
);
SELECT ok(
  (
    SELECT count(*) = 2
    FROM pg_trigger
    WHERE tgfoid = 'public.set_updated_at()'::regprocedure
      AND tgrelid IN (
        'public.profiles'::regclass,
        'public.app_user_connections'::regclass
      )
      AND NOT tgisinternal
  ),
  'both updated_at columns are maintained by triggers'
);

SELECT * FROM finish();
ROLLBACK;
