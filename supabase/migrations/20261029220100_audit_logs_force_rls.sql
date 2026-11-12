-- Registo de auditoria das escolas (audit_logs): RLS forçada e sem escrita pela API.
--
-- Leitura do retrato de 2026-10-29: RLS activa mas não forçada, uma política de leitura
-- (`audit_select_authorized`, permissão `audit.logs.read` por escola) e o gatilho
-- `audit_logs_immutable` (private.prevent_audit_mutation) que já recusa alterar ou apagar.
-- Os privilégios de tabela de anon/authenticated não estão no retrato.
--
-- Todo o código que escreve ou lê esta tabela é do servidor, com a chave de serviço
-- (record-audit.ts, documents/verification.ts, …) ou funções SECURITY DEFINER
-- (matrícula atómica, comandos do chat). Aqui:
--   · RLS forçada, também para o dono da tabela;
--   · anon perde todos os privilégios;
--   · authenticated perde a escrita (INSERT/UPDATE/DELETE/TRUNCATE) e mantém só a leitura
--     que a política autorizada já limitava — nada que hoje funcione deixa de funcionar;
--   · service_role mantém tudo.
-- Não mexe em dados nem na política existente. Idempotente.
--
-- Conservação: o registo é só de acrescentar (gatilho de imutabilidade). Apagar registos
-- antigos, quando houver regra de retenção, é uma operação própria e auditada — não se faz
-- por esta via.

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_logs FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.audit_logs FROM authenticated;
GRANT ALL ON public.audit_logs TO service_role;
