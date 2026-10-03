-- `tenant_mailboxes`: caixas de correio institucionais por tenant.
--
-- A tabela não existe em produção e quatro sítios do código escrevem ou lêem dela
-- (`saas/server.ts`, `saas/school-domain-ops.ts`, `api/saas/mailboxes.tsx` ×2), pelo que o
-- aprovisionamento de caixas no Control Center não grava nem lista nada — devolve o erro
-- de tabela inexistente do PostgREST, não um ecrã vazio.
--
-- POR QUE É QUE ISTO NÃO É SÓ COPIAR O `supabase/APPLY_MAILBOXES.sql`:
--
-- Esse ficheiro está por aplicar desde 2026-09-02 e **falharia hoje**. A segunda política
-- que declara faz `SELECT tenant_id FROM tenant_members`, e `tenant_members` não existe em
-- produção — verificado contra `supabase/PRODUCTION_SNAPSHOT.json`. Quem o corresse ficava
-- com a tabela criada, a primeira política aplicada e a segunda a rebentar com 42P01.
--
-- O papel que `tenant_members` teria é desempenhado por `school_memberships`, e a ponte
-- para o tenant é `schools.tenant_id`. A política abaixo segue esse caminho real. As
-- colunas são as que o código grava: `tenant_id`, `email`, `display_name`, `provider`,
-- `provider_account_id`, `status`.
--
-- Aditiva e idempotente. **Não foi aplicada** — é escrita na base, decisão do dono.
-- Depois de aplicar: `npm run siga:db-snapshot`, que é contra quem os testes medem, e
-- retirar `tenant_mailboxes` de `TABELAS_AUSENTES_DA_PRODUCAO`.

CREATE TABLE IF NOT EXISTS public.tenant_mailboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  provider text NOT NULL DEFAULT 'simulated',
  provider_account_id text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_mailboxes_email_key UNIQUE (email),
  CONSTRAINT tenant_mailboxes_provider_check
    CHECK (provider IN ('zoho', 'google', 'simulated')),
  CONSTRAINT tenant_mailboxes_status_check
    CHECK (status IN ('active', 'suspended', 'deleted'))
);

CREATE INDEX IF NOT EXISTS idx_tenant_mailboxes_tenant_id
  ON public.tenant_mailboxes (tenant_id);

ALTER TABLE public.tenant_mailboxes ENABLE ROW LEVEL SECURITY;

-- Administradores da plataforma: acesso total.
DROP POLICY IF EXISTS tenant_mailboxes_platform_admin_all ON public.tenant_mailboxes;
CREATE POLICY tenant_mailboxes_platform_admin_all ON public.tenant_mailboxes
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = (SELECT auth.uid())))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = (SELECT auth.uid()))
  );

-- A escola vê as suas próprias caixas.
--
-- `APPLY_MAILBOXES.sql` fazia isto por `tenant_members`, que não existe. O caminho real é
-- `school_memberships` (quem pertence a que escola) → `schools.tenant_id` (a que tenant a
-- escola pertence). Só associações activas contam.
DROP POLICY IF EXISTS tenant_mailboxes_tenant_select ON public.tenant_mailboxes;
CREATE POLICY tenant_mailboxes_tenant_select ON public.tenant_mailboxes
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (
      SELECT s.tenant_id
      FROM public.schools s
      JOIN public.school_memberships m ON m.school_id = s.id
      WHERE m.user_id = (SELECT auth.uid())
        AND m.status = 'active'
        AND s.tenant_id IS NOT NULL
    )
  );
