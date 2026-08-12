BEGIN;

SELECT plan(8);

SELECT ok(
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'cash_entries'
            AND column_name = 'document_number' AND is_nullable = 'NO'),
  'every cash entry has a document number'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint
          WHERE conrelid = 'public.cash_entries'::regclass
            AND conname = 'cash_entries_school_document_key'
            AND contype = 'u'),
  'cash document numbers are unique per school'
);
SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc WHERE oid =
    'public.record_cash_expense(text,text,text,numeric,text,text,timestamptz)'::regprocedure),
  'expense workflow runs with caller privileges'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.record_cash_expense(text,text,text,numeric,text,text,timestamptz)',
    'EXECUTE'
  ),
  'authenticated finance clients can invoke expense workflow'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.record_cash_expense(text,text,text,numeric,text,text,timestamptz)',
    'EXECUTE'
  ),
  'anonymous clients cannot invoke expense workflow'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_trigger
          WHERE tgrelid = 'public.cash_entries'::regclass
            AND tgname = 'cash_entries_require_workflow'
            AND NOT tgisinternal),
  'direct expense inserts remain protected by the workflow guard'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.cash_entries', 'DELETE'),
  'expenses cannot be hard-deleted by clients'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_trigger
          WHERE tgrelid = 'public.cash_entries'::regclass
            AND tgname = 'cash_entries_audit_change'
            AND NOT tgisinternal),
  'expense entries are audited automatically'
);

SELECT * FROM finish();
ROLLBACK;
