BEGIN;

SELECT plan(20);

SELECT has_table('public', 'payflow_bank_accounts', 'payflow bank accounts exist');
SELECT has_table('public', 'payflow_checkouts', 'payflow checkouts exist');
SELECT has_table('public', 'payflow_checkout_items', 'payflow checkout items exist');
SELECT has_table('public', 'payflow_payment_intents', 'payflow payment intents exist');
SELECT has_table('public', 'payflow_bank_transfers', 'payflow bank transfers exist');
SELECT has_table('public', 'payflow_transactions', 'payflow transactions exist');
SELECT has_table('public', 'payflow_refunds', 'payflow refunds exist');
SELECT has_table('public', 'payflow_reconciliation_events', 'payflow reconciliation events exist');
SELECT has_table('public', 'payflow_webhook_events', 'payflow webhook events exist');
SELECT has_table('public', 'payflow_notification_events', 'payflow notification events exist');
SELECT has_table('public', 'payflow_audit_events', 'payflow audit events exist');

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_class
    WHERE oid IN (
      'public.payflow_bank_accounts'::regclass,
      'public.payflow_checkouts'::regclass,
      'public.payflow_checkout_items'::regclass,
      'public.payflow_payment_intents'::regclass,
      'public.payflow_bank_transfers'::regclass,
      'public.payflow_transactions'::regclass,
      'public.payflow_refunds'::regclass,
      'public.payflow_reconciliation_events'::regclass,
      'public.payflow_webhook_events'::regclass,
      'public.payflow_notification_events'::regclass,
      'public.payflow_audit_events'::regclass
    )
      AND relrowsecurity
      AND relforcerowsecurity
  ),
  11,
  'all PayFlow tables enable and force RLS'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.payflow_checkouts', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.payflow_transactions', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.payflow_bank_accounts', 'SELECT'),
  'anonymous clients cannot read PayFlow tables directly'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.payflow_checkouts', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.payflow_transactions', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.payflow_bank_accounts', 'UPDATE'),
  'authenticated clients use trusted PayFlow APIs instead of direct table access'
);

SELECT ok(
  has_table_privilege('service_role', 'public.payflow_checkouts', 'SELECT')
  AND has_table_privilege('service_role', 'public.payflow_transactions', 'INSERT')
  AND has_table_privilege('service_role', 'public.payflow_bank_transfers', 'UPDATE'),
  'trusted server role can operate PayFlow'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public'
      AND indexname='payflow_intents_provider_external_unique_idx'
  ),
  'provider transaction id is protected against duplicate settlement'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public'
      AND indexname='payflow_bank_transfer_bank_tx_unique_idx'
  ),
  'bank transaction id is unique per school'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public'
      AND indexname='payflow_bank_accounts_one_default_idx'
  ),
  'only one active default bank account is allowed per school'
);

SELECT ok(
  col_description('public.payflow_bank_transfers'::regclass, (
    SELECT ordinal_position
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='payflow_bank_transfers'
      AND column_name='proof_storage_path'
  )) ILIKE '%never set%paid%'
  OR col_description('public.payflow_bank_transfers'::regclass, (
    SELECT ordinal_position
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='payflow_bank_transfers'
      AND column_name='proof_storage_path'
  )) ILIKE '%never confirm%',
  'proof column documents that evidence is not settlement'
);

SELECT ok(
  CASE
    WHEN to_regclass('storage.buckets') IS NULL THEN true
    ELSE EXISTS (
      SELECT 1 FROM storage.buckets
      WHERE id='payflow-proofs'
        AND public=false
    )
  END,
  'PayFlow proof bucket is private when Storage is available'
);

SELECT * FROM finish();
ROLLBACK;
