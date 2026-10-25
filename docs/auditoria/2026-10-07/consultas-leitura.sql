-- Recolha reproduzível do catálogo, sem linhas pessoais e sem qualquer escrita.
-- Executar apenas com autorização de leitura e confirmar o projecto de destino.
-- Colunas confirmadas no snapshot de produção e no catálogo da auditoria.
BEGIN READ ONLY;

SELECT version();
SELECT count(*) AS tables,
       count(*) FILTER (WHERE c.relrowsecurity) AS rls_enabled,
       count(*) FILTER (WHERE c.relforcerowsecurity) AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r';
SELECT count(*) AS policies FROM pg_policies WHERE schemaname = 'public';
SELECT extname, extversion FROM pg_extension ORDER BY extname;
SELECT count(*) AS accounts FROM auth.users;
SELECT count(*) AS verified_factors, count(DISTINCT user_id) AS users_with_mfa
FROM auth.mfa_factors WHERE status = 'verified';
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets ORDER BY id;

-- ALL não implica permissividade: cruzar políticas, ACL e triggers.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('students', 'staff_module_grants', 'hr_payment_destinations')
ORDER BY tablename, cmd, policyname;
SELECT t.tablename,
       has_table_privilege('authenticated', format('public.%I', t.tablename), 'SELECT') AS can_select,
       has_table_privilege('authenticated', format('public.%I', t.tablename), 'INSERT') AS can_insert,
       has_table_privilege('authenticated', format('public.%I', t.tablename), 'UPDATE') AS can_update,
       has_table_privilege('authenticated', format('public.%I', t.tablename), 'DELETE') AS can_delete
FROM pg_tables t WHERE schemaname = 'public'
  AND tablename IN ('students', 'staff_module_grants', 'hr_payment_destinations');
SELECT c.relname, t.tgname, pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
  AND c.relname IN ('students', 'staff_module_grants', 'hr_payment_destinations');
SELECT pg_get_functiondef('public.is_school_admin(uuid)'::regprocedure);

-- Agregados; não devolver nomes, contactos, documentos ou IDs de pessoas.
SELECT (SELECT count(*) FROM public.schools) AS schools,
       (SELECT count(*) FROM public.tenants) AS tenants,
       (SELECT count(*) FROM public.invoices) AS invoices,
       (SELECT count(*) FROM public.receipts) AS receipts,
       (SELECT count(*) FROM public.enrollments) AS enrollments;
SELECT status, count(*) FROM public.receipts GROUP BY status ORDER BY status;
SELECT status, count(*) FROM public.invoices GROUP BY status ORDER BY status;

ROLLBACK;
