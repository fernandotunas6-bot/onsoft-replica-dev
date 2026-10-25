-- Registo de auditoria do ADMIN (saas_audit_logs) só com o servidor.
--
-- Leitura de 2026-10-17: `authenticated` tinha todos os privilégios (incluindo UPDATE,
-- DELETE e TRUNCATE) e a política `platform_admin_all_saas_audit_logs` (FOR ALL,
-- `is_platform_admin()`) deixava qualquer um dos 4 administradores da plataforma
-- alterar ou apagar, pela API, o registo que guarda as suas próprias acções
-- (pagamentos confirmados, escolas suspensas, administradores criados). E ler sem 2FA.
--
-- Todo o código que lê ou escreve esta tabela é do servidor, com a chave de serviço
-- (platform-ops.ts, tenant-billing.ts, subscription-server.ts, auth/*-server.ts…); o
-- painel ADMIN lê pela API /api/saas/*. Fica o padrão das tabelas sensíveis
-- (docs/agents/DATABASE_RULES.md, regra 5). Não mexe em dados. Idempotente.

ALTER TABLE public.saas_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_admin_all_saas_audit_logs ON public.saas_audit_logs;
REVOKE ALL ON public.saas_audit_logs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.saas_audit_logs TO service_role;
