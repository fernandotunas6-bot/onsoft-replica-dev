BEGIN;

SELECT plan(20);

SELECT has_table('public', 'document_templates', 'reusable document templates exist');
SELECT has_table('public', 'document_requests', 'document requests exist');
SELECT has_table('public', 'document_request_status_history', 'document status history exists');
SELECT ok(
  (SELECT count(*) = 3 FROM pg_class WHERE oid IN (
    'public.document_templates'::regclass,
    'public.document_requests'::regclass,
    'public.document_request_status_history'::regclass
  ) AND relrowsecurity AND relforcerowsecurity),
  'all document tables force RLS'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.document_templates', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'public.document_requests', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'public.document_request_status_history', 'DELETE'),
  'clients cannot hard-delete document records'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.document_request_status_history', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.document_request_status_history', 'UPDATE'),
  'clients cannot forge document history'
);
SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc
       WHERE oid = 'public.create_document_request(uuid,uuid,text,text,date,text)'::regprocedure),
  'document creation runs with caller privileges'
);
SELECT ok(has_function_privilege(
  'authenticated', 'public.create_document_request(uuid,uuid,text,text,date,text)', 'EXECUTE'),
  'authenticated document roles can invoke request creation');
SELECT ok(NOT has_function_privilege(
  'anon', 'public.create_document_request(uuid,uuid,text,text,date,text)', 'EXECUTE'),
  'anonymous clients cannot create document requests');
SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc
       WHERE oid = 'private.require_document_workflow()'::regprocedure),
  'document workflow guard does not elevate privileges'
);
SELECT ok(NOT has_function_privilege(
  'authenticated', 'private.require_document_workflow()', 'EXECUTE'),
  'clients cannot invoke document workflow guard');
SELECT ok(
  (SELECT prosecdef FROM pg_proc
   WHERE oid = 'private.record_document_status_change()'::regprocedure),
  'status history trigger can append behind RLS'
);
SELECT ok(NOT has_function_privilege(
  'authenticated', 'private.record_document_status_change()', 'EXECUTE'),
  'clients cannot invoke status history trigger');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger
  WHERE tgrelid = 'public.document_requests'::regclass
    AND tgname = 'document_requests_require_workflow' AND NOT tgisinternal),
  'direct protected request writes require a workflow');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger
  WHERE tgrelid = 'public.document_requests'::regclass
    AND tgname = 'document_requests_record_status' AND NOT tgisinternal),
  'request status changes append history');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger
  WHERE tgrelid = 'public.document_requests'::regclass
    AND tgname = 'document_requests_audit_change' AND NOT tgisinternal),
  'request changes are audited');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint
  WHERE conrelid = 'public.document_requests'::regclass
    AND conname = 'document_requests_student_fkey'),
  'requests cannot reference students from another school');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint
  WHERE conrelid = 'public.document_requests'::regclass
    AND conname = 'document_requests_template_fkey'),
  'requests cannot reference templates from another school');
SELECT is((SELECT count(*)::integer FROM pg_indexes
  WHERE schemaname = 'public' AND indexname IN (
    'document_requests_queue_idx', 'document_requests_student_recent_idx',
    'document_request_history_request_idx'
  )), 3, 'document queue, student lookup and history are indexed');
SELECT is((SELECT count(*)::integer FROM pg_policy WHERE polrelid IN (
  'public.document_templates'::regclass,
  'public.document_requests'::regclass,
  'public.document_request_status_history'::regclass
)), 5, 'document tables expose only intended policies');

SELECT * FROM finish();
ROLLBACK;
