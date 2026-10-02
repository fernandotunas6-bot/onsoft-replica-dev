-- CAPTURADA da produção (supabase_migrations.schema_migrations, versão 20260930162029).
-- Aplicada a 2026-09-30 16:20 UTC fora do repositório; trazida para cá a 2026-10-02
-- (auditoria 11, O4). Corpo sem alterações, confirmado por md5 contra o registo.
-- @@corpo-capturado@@
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
