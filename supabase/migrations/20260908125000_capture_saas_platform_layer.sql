-- Migration: 20260908125000_capture_saas_platform_layer
-- Objetivo: Versionar a camada SaaS da plataforma (Control Center) que só
--   existia em supabase/APPLY_SAAS_PLATFORM.sql (script manual, aplicado ao
--   vivo em ambos os projectos, nunca capturado em supabase/migrations/).
--   Fecha o gap sinalizado inline em 20260908130000_school_branding_versioned.sql
--   ("função is_platform_admin() não existe num ambiente aplicado só a
--   partir das migrações, sem nunca ter corrido o script manual").
-- Metodologia: espelho fiel de APPLY_SAAS_PLATFORM.sql (o script continua a
--   ser a referência para o passo manual de bootstrap do primeiro platform
--   admin) — 100% idempotente (IF NOT EXISTS / OR REPLACE / ON CONFLICT DO
--   NOTHING / DROP POLICY IF EXISTS), seguro para reaplicar num ambiente
--   onde já corre ao vivo.
-- NUNCA executar via Lovable. Usar: npm run siga:sql (colar no SQL Editor do SGA)

-- 1. PLANOS SAAS --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  description text,
  max_students integer NOT NULL DEFAULT 500,
  max_staff integer NOT NULL DEFAULT 50,
  max_storage_gb integer NOT NULL DEFAULT 10,
  price_aoa_monthly numeric(12,2) NOT NULL DEFAULT 0.00,
  price_aoa_yearly numeric(12,2) NOT NULL DEFAULT 0.00,
  features jsonb NOT NULL DEFAULT '{"academic": true, "finance": true, "attendance": true, "documents": true}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.plans (name, code, description, max_students, max_staff, max_storage_gb, price_aoa_monthly, price_aoa_yearly)
VALUES
  ('Start', 'start', 'Plano inicial para pequenas escolas', 250, 25, 5, 50000.00, 500000.00),
  ('Professional', 'professional', 'Para colégios em crescimento', 750, 75, 20, 120000.00, 1200000.00),
  ('Business', 'business', 'Para grandes instituições de ensino', 2000, 200, 50, 250000.00, 2500000.00),
  ('Enterprise', 'enterprise', 'Redes escolares e grandes complexos', 10000, 1000, 200, 500000.00, 5000000.00)
ON CONFLICT (code) DO NOTHING;

-- 2. TENANTS — perfil comercial (1 tenant = 1 escola) ------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'provisioning'
    CHECK (status IN ('provisioning', 'provisioning_failed', 'trial', 'active', 'past_due', 'suspended', 'cancelled', 'archived')),
  plan_id uuid REFERENCES public.plans(id),
  subscription_status text DEFAULT 'active',
  trial_ends_at timestamptz,
  contact_name text,
  contact_phone text,
  contact_email text,
  max_students integer DEFAULT 500,
  max_storage_gb integer DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. DOMÍNIOS DOS TENANTS -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hostname text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('siga_subdomain', 'custom_domain')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'failed')),
  ssl_status text DEFAULT 'active',
  verified_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. SUBSCRIÇÕES E USO --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid')),
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL DEFAULT (now() + interval '1 year'),
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  active_students_count integer NOT NULL DEFAULT 0,
  active_staff_count integer NOT NULL DEFAULT 0,
  storage_bytes_used bigint NOT NULL DEFAULT 0,
  api_calls_count integer NOT NULL DEFAULT 0,
  last_calculated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. AUDIT LOG DA PLATAFORMA --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saas_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. ADMINISTRADORES DA PLATAFORMA --------------------------------------------
-- Conceito novo e independente de `profiles.cargo` (que é sempre por-escola).
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = (SELECT auth.uid())
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

-- 7. LIGAR schools -> tenants (1:1) --------------------------------------------
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS commercial_name text;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS logo_url text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schools_tenant_id_key') THEN
    ALTER TABLE public.schools ADD CONSTRAINT schools_tenant_id_key UNIQUE (tenant_id);
  END IF;
END $$;

-- 8. RLS — só administradores da plataforma tocam nestas tabelas -------------
-- (escrita real do Control Center passa sempre pela service role no servidor,
-- que ignora RLS depois de validar is_platform_admin() em código — isto aqui
-- é a rede de segurança contra acesso directo pela chave anon/publishable.)
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admin_all_plans" ON public.plans;
CREATE POLICY "platform_admin_all_plans" ON public.plans
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "platform_admin_all_tenants" ON public.tenants;
CREATE POLICY "platform_admin_all_tenants" ON public.tenants
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "platform_admin_all_tenant_domains" ON public.tenant_domains;
CREATE POLICY "platform_admin_all_tenant_domains" ON public.tenant_domains
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "platform_admin_all_subscriptions" ON public.subscriptions;
CREATE POLICY "platform_admin_all_subscriptions" ON public.subscriptions
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "platform_admin_all_tenant_usage" ON public.tenant_usage;
CREATE POLICY "platform_admin_all_tenant_usage" ON public.tenant_usage
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "platform_admin_all_saas_audit_logs" ON public.saas_audit_logs;
CREATE POLICY "platform_admin_all_saas_audit_logs" ON public.saas_audit_logs
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "platform_admin_read_self" ON public.platform_admins;
CREATE POLICY "platform_admin_read_self" ON public.platform_admins
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_platform_admin());
-- Sem policy de INSERT/UPDATE/DELETE para "authenticated": só a service role
-- (servidor) ou um humano no SQL Editor podem alterar platform_admins.
