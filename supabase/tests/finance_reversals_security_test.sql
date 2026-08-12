BEGIN;

SELECT plan(12);

SELECT has_table('public', 'financial_reversals', 'append-only reversal ledger exists');
SELECT ok(
  (SELECT relrowsecurity AND relforcerowsecurity
   FROM pg_class WHERE oid = 'public.financial_reversals'::regclass),
  'reversal ledger forces RLS'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.financial_reversals', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.financial_reversals', 'DELETE'),
  'clients cannot alter or delete reversal history'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_policy
   WHERE polrelid = 'public.financial_reversals'::regclass),
  2,
  'reversal ledger exposes only read and workflow insert policies'
);
SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc
       WHERE oid = 'public.reverse_cash_entry(uuid,text)'::regprocedure),
  'reversal workflow runs with caller privileges'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.reverse_cash_entry(uuid,text)', 'EXECUTE'),
  'authenticated finance clients can invoke reversal workflow'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.reverse_cash_entry(uuid,text)', 'EXECUTE'),
  'anonymous clients cannot invoke reversal workflow'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint
          WHERE conrelid = 'public.financial_reversals'::regclass
            AND conname = 'financial_reversals_cash_entry_key'),
  'each cash entry can be reversed only once'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint
          WHERE conrelid = 'public.financial_reversals'::regclass
            AND conname = 'financial_reversals_cash_entry_fkey'),
  'reversals cannot reference cash entries from another school'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint
          WHERE conrelid = 'public.financial_reversals'::regclass
            AND conname = 'financial_reversals_payment_fkey'),
  'reversals cannot reference payments from another school'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_trigger
          WHERE tgrelid = 'public.financial_reversals'::regclass
            AND tgname = 'financial_reversals_require_workflow'
            AND NOT tgisinternal),
  'direct reversal inserts require an approved workflow'
);
SELECT has_index(
  'public', 'financial_reversals', 'financial_reversals_school_recent_idx',
  'recent reversal history is indexed by school'
);

SELECT * FROM finish();
ROLLBACK;
