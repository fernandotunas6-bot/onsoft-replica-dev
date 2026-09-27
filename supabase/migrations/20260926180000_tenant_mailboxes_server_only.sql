-- Caixas de correio institucionais por tenant (Control Center, Fase 5).
--
-- Substitui `supabase/APPLY_MAILBOXES.sql`, que nunca foi aplicado e não podia
-- ser: as políticas liam `tenant_members`, tabela que a base SGA não tem.
-- Todo o código (`saas/server.ts`, `saas/school-domain-ops.ts`,
-- `api/saas/mailboxes.tsx`) usa a chave de serviço depois de validar o acesso
-- ao tenant, por isso a tabela fica só do servidor: sem políticas de cliente.
--
-- Aditiva e idempotente: não altera nenhuma tabela existente.

CREATE TABLE IF NOT EXISTS public.tenant_mailboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  display_name text CHECK (display_name IS NULL OR char_length(display_name) <= 160),
  provider text NOT NULL DEFAULT 'simulated' CHECK (provider IN ('simulated', 'zoho', 'google')),
  provider_account_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_mailboxes_email_key UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS tenant_mailboxes_tenant_created_idx
  ON public.tenant_mailboxes (tenant_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_tenant_mailboxes_touch ON public.tenant_mailboxes;
CREATE TRIGGER trg_tenant_mailboxes_touch
  BEFORE UPDATE ON public.tenant_mailboxes
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

ALTER TABLE public.tenant_mailboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_mailboxes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_mailboxes FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.tenant_mailboxes IS
  'Caixas de correio institucionais por tenant. Só o servidor (chave de serviço) lê e escreve.';
