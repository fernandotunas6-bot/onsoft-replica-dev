-- Registo comercial: acompanhamento de quem não conclui o registo, e
-- comprovativos de pagamento do plano enviados pela escola.
--
-- saas_signup_leads: uma linha por visita ao assistente WEB /start (id de sessão
-- gerado no navegador). Até a pessoa confirmar o e-mail só guarda o passo e o
-- plano — sem dados pessoais. Depois da confirmação guarda e-mail, nome e
-- telefone para lhe lembrar de terminar (com ligação para deixar de receber).
--
-- billing-proofs: comprovativos de transferência do plano (PDF/imagem). Bucket
-- privado sem políticas: só o servidor (chave de serviço) lê e escreve.
--
-- Idempotente; tabela sensível só para o servidor (DATABASE_RULES.md, regra 5).

CREATE TABLE IF NOT EXISTS public.saas_signup_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  last_step smallint NOT NULL DEFAULT 1,
  plan_code text,
  school_name text,
  email text,
  contact_name text,
  contact_phone text,
  email_verified_at timestamptz,
  completed_at timestamptz,
  tenant_id uuid REFERENCES public.tenants (id) ON DELETE SET NULL,
  reminder_count smallint NOT NULL DEFAULT 0,
  last_reminder_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saas_signup_leads_session_key UNIQUE (session_id),
  CONSTRAINT saas_signup_leads_step_check CHECK (last_step BETWEEN 1 AND 10),
  CONSTRAINT saas_signup_leads_email_check CHECK (email IS NULL OR email = lower(btrim(email)))
);

CREATE INDEX IF NOT EXISTS saas_signup_leads_email_idx
  ON public.saas_signup_leads (email)
  WHERE email IS NOT NULL;

-- Lembretes: leads confirmados, por concluir, a ordenar pela última actividade.
CREATE INDEX IF NOT EXISTS saas_signup_leads_followup_idx
  ON public.saas_signup_leads (updated_at)
  WHERE completed_at IS NULL AND email_verified_at IS NOT NULL AND unsubscribed_at IS NULL;

CREATE INDEX IF NOT EXISTS saas_signup_leads_tenant_idx
  ON public.saas_signup_leads (tenant_id)
  WHERE tenant_id IS NOT NULL;

DROP TRIGGER IF EXISTS saas_signup_leads_touch_updated_at ON public.saas_signup_leads;
CREATE TRIGGER saas_signup_leads_touch_updated_at
  BEFORE UPDATE ON public.saas_signup_leads
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

ALTER TABLE public.saas_signup_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_signup_leads FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.saas_signup_leads FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.saas_signup_leads TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'billing-proofs',
  'billing-proofs',
  false,
  5242880,
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
