BEGIN;

SELECT plan(15);

SELECT has_index('public', 'invoices', 'invoices_reporting_idx',
  'invoice reporting uses a filtered index');
SELECT has_index('public', 'cash_entries', 'cash_entries_reporting_idx',
  'cash reporting uses a filtered index');
SELECT has_index('public', 'cash_entries', 'cash_entries_category_reporting_idx',
  'category reporting uses a filtered index');
SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.finance_summary()'::regprocedure),
  'finance summary runs with caller privileges');
SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc
       WHERE oid = 'public.finance_monthly_summary(integer)'::regprocedure),
  'monthly summary runs with caller privileges');
SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc
       WHERE oid = 'public.finance_category_summary()'::regprocedure),
  'category summary runs with caller privileges');
SELECT ok(has_function_privilege('authenticated', 'public.finance_summary()', 'EXECUTE'),
  'authenticated finance clients can request the summary');
SELECT ok(has_function_privilege(
  'authenticated', 'public.finance_monthly_summary(integer)', 'EXECUTE'),
  'authenticated finance clients can request monthly reporting');
SELECT ok(has_function_privilege(
  'authenticated', 'public.finance_category_summary()', 'EXECUTE'),
  'authenticated finance clients can request category reporting');
SELECT ok(NOT has_function_privilege('anon', 'public.finance_summary()', 'EXECUTE'),
  'anonymous clients cannot request the summary');
SELECT ok(NOT has_function_privilege(
  'anon', 'public.finance_monthly_summary(integer)', 'EXECUTE'),
  'anonymous clients cannot request monthly reporting');
SELECT ok(NOT has_function_privilege(
  'anon', 'public.finance_category_summary()', 'EXECUTE'),
  'anonymous clients cannot request category reporting');
SELECT is(
  (SELECT proretset FROM pg_proc WHERE oid = 'public.finance_summary()'::regprocedure),
  true,
  'finance summary has a stable tabular API');
SELECT is(
  (SELECT proretset FROM pg_proc
   WHERE oid = 'public.finance_monthly_summary(integer)'::regprocedure),
  true,
  'monthly reporting has a stable tabular API');
SELECT is(
  (SELECT proretset FROM pg_proc
   WHERE oid = 'public.finance_category_summary()'::regprocedure),
  true,
  'category reporting has a stable tabular API');

SELECT * FROM finish();
ROLLBACK;
