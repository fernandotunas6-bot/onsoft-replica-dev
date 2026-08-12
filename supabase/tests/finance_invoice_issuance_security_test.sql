BEGIN;

SELECT plan(13);

SELECT has_table('public', 'finance_students', 'minimal finance student directory exists');
SELECT ok(
  (SELECT relrowsecurity AND relforcerowsecurity
   FROM pg_class WHERE oid = 'public.finance_students'::regclass),
  'finance student directory forces RLS'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.finance_students', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.finance_students', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.finance_students', 'DELETE'),
  'clients cannot forge the synchronized billing directory'
);
SELECT ok(
  (SELECT bool_and(prosecdef) FROM pg_proc WHERE oid IN (
    'private.sync_finance_student_from_student()'::regprocedure,
    'private.sync_finance_student_from_person()'::regprocedure
  )),
  'directory synchronization can bypass source-table RLS'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'private.sync_finance_student_from_student()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'private.sync_finance_student_from_person()', 'EXECUTE'),
  'clients cannot invoke directory synchronization functions'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_trigger
   WHERE tgfoid IN (
     'private.sync_finance_student_from_student()'::regprocedure,
     'private.sync_finance_student_from_person()'::regprocedure
   ) AND NOT tgisinternal),
  2,
  'student billing identity is synchronized by two triggers'
);
SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc
       WHERE oid = 'private.require_finance_workflow()'::regprocedure),
  'financial workflow guard never elevates privileges'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'private.require_finance_workflow()', 'EXECUTE'),
  'clients cannot invoke the financial guard directly'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_trigger
   WHERE tgfoid = 'private.require_finance_workflow()'::regprocedure
     AND NOT tgisinternal),
  6,
  'all accounting write surfaces require an approved workflow'
);
SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc
       WHERE oid = 'public.issue_invoice(uuid,text,date,text,jsonb,uuid,date)'::regprocedure),
  'invoice issuance runs with caller privileges'
);
SELECT ok(
  has_function_privilege(
    'authenticated', 'public.issue_invoice(uuid,text,date,text,jsonb,uuid,date)', 'EXECUTE'
  ),
  'authenticated finance clients can issue invoices through the workflow'
);
SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.issue_invoice(uuid,text,date,text,jsonb,uuid,date)', 'EXECUTE'
  ),
  'anonymous clients cannot issue invoices'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint
          WHERE conrelid = 'public.finance_students'::regclass
            AND conname = 'finance_students_school_student_fkey'),
  'billing directory rows cannot cross schools'
);

SELECT * FROM finish();
ROLLBACK;
