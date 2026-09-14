-- Colunas que a verificação de domínio personalizado já escrevia e lia, e que
-- `tenant_domains` nunca teve.
--
-- `persistPollResult` (src/features/saas/domain-polling.ts) grava
-- `last_checked_at` e `updated_at`; `school-domain-ops.ts` lê essas e ainda
-- `check_count`. Sem elas, o PostgREST recusa tanto a escrita como a leitura:
-- o painel de domínio personalizado mostrava «sem domínio» mesmo com um
-- configurado, e cada verificação DNS falhava em silêncio.
--
-- Aditiva e idempotente. Verificado contra a produção a 2026-09-14: a tabela
-- tinha id, tenant_id, hostname, type, status, ssl_status, verified_at,
-- created_at.

ALTER TABLE public.tenant_domains
  ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS check_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

COMMENT ON COLUMN public.tenant_domains.last_checked_at IS
  'Momento da última verificação DNS (domain-polling.ts).';
COMMENT ON COLUMN public.tenant_domains.check_count IS
  'Quantas verificações DNS já correram para este domínio.';
