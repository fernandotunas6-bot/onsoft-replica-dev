BEGIN;

SELECT plan(16);

SELECT has_table('public', 'invoices', 'invoices table exists');
SELECT has_table('public', 'invoice_items', 'invoice items table exists');
SELECT has_table('public', 'payments', 'payments table exists');
SELECT has_table('public', 'payment_allocations', 'payment allocations table exists');
SELECT has_table('public', 'cash_entries', 'cash entries table exists');

SELECT ok(
  (SELECT count(*) = 5 FROM pg_class
   WHERE oid IN (
     'public.invoices'::regclass, 'public.invoice_items'::regclass,
     'public.payments'::regclass, 'public.payment_allocations'::regclass,
     'public.cash_entries'::regclass
   ) AND relrowsecurity AND relforcerowsecurity),
  'all finance tables enforce RLS'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.invoices', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'public.invoice_items', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'public.payments', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'public.payment_allocations', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'public.cash_entries', 'DELETE'),
  'clients cannot hard-delete financial records'
);

SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc
       WHERE oid = 'public.record_invoice_payment(uuid,text,numeric,text,text,timestamptz)'::regprocedure),
  'payment workflow runs with caller privileges'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.record_invoice_payment(uuid,text,numeric,text,text,timestamptz)',
    'EXECUTE'
  ),
  'authenticated finance clients can invoke payment workflow'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.record_invoice_payment(uuid,text,numeric,text,text,timestamptz)',
    'EXECUTE'
  ),
  'anonymous clients cannot invoke payment workflow'
);

SELECT is(
  (SELECT count(*)::integer FROM pg_policy
   WHERE polrelid IN (
     'public.invoices'::regclass, 'public.invoice_items'::regclass,
     'public.payments'::regclass, 'public.payment_allocations'::regclass,
     'public.cash_entries'::regclass
   )),
  13,
  'finance tables expose only the intended read, create and update policies'
);

SELECT is(
  (SELECT count(*)::integer FROM pg_trigger
   WHERE tgfoid = 'private.audit_domain_change()'::regprocedure
     AND tgrelid IN (
       'public.invoices'::regclass, 'public.payments'::regclass,
       'public.cash_entries'::regclass
     ) AND NOT tgisinternal),
  3,
  'financial headers and cash changes are audited'
);

SELECT is(
  (SELECT count(*)::integer FROM pg_indexes
   WHERE schemaname = 'public' AND indexname IN (
     'invoices_open_idx', 'invoice_items_invoice_idx',
     'payments_student_recent_idx', 'payment_allocations_invoice_idx',
     'cash_entries_recent_idx', 'cash_entries_confirmed_payment_idx'
   )),
  6,
  'finance read and integrity paths are indexed'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint
          WHERE conrelid = 'public.invoices'::regclass
            AND conname = 'invoices_totals_valid'),
  'invoice totals have a database invariant'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint
          WHERE conrelid = 'public.payment_allocations'::regclass
            AND conname = 'payment_allocations_invoice_fkey'),
  'allocations cannot cross invoice tenants'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint
          WHERE conrelid = 'public.cash_entries'::regclass
            AND conname = 'cash_entries_payment_fkey'),
  'cash entries cannot cross payment tenants'
);

SELECT * FROM finish();
ROLLBACK;
