-- ============================================================================
-- SIGA — CAMADA SAAS DA PLATAFORMA (SaaS Control Center)
-- ============================================================================
-- Aplicar SÓ no SQL Editor do projecto SGA (ver scripts/siga/modules.json →
-- sgaRef), DEPOIS de:
--   1. supabase/APPLY_IN_SQL_EDITOR.sql
--   2. supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql
--
-- O QUE ESTE SCRIPT NÃO FAZ: não toca em nenhuma tabela de domínio (people,
-- students, teachers, classes, subjects, enrollments, grades, attendance,
-- invoices, payments, documents, academic_years, ...) nem nas suas políticas
-- RLS. O isolamento entre escolas continua a ser feito por
-- school_id / current_school_id(), exactamente como hoje — já funciona.
--
-- O QUE ESTE SCRIPT FAZ: acrescenta uma camada comercial por cima de
-- `schools` (quantas escolas existem, em que plano, com que subdomínio) e um
-- conceito novo — "administrador da plataforma" — separado de `cargo`, que é
-- sempre por-escola. 1 tenant = 1 escola (schools.tenant_id é único).
--
-- PASSO MANUAL OBRIGATÓRIO DEPOIS DE APLICAR:
--   1. Descubra o seu user_id em Authentication → Users no dashboard Supabase.
--   2. Corra:  INSERT INTO public.platform_admins (user_id) VALUES ('<uid>');
--   Sem isto, ninguém consegue abrir /saas-admin — é essa a intenção.
-- ============================================================================

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
-- Fica vazio depois deste script — ver "PASSO MANUAL OBRIGATÓRIO" acima.
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

-- 7. LIGAR schools -> tenants (1:1) E MIGRAR A ESCOLA JÁ EXISTENTE ------------
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Colunas de perfil comercial que provisionSchoolTenant()/signupSchoolPublic()
-- (src/features/saas/provisioning-core.ts) escrevem em `schools` — existiam
-- no antigo APPLY_MULTI_TENANT_SAAS.sql (removido) e não tinham sido
-- migradas para este ficheiro; sem isto o provisionamento falhava com
-- "column ... does not exist".
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS commercial_name text;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS logo_url text;

DO $$
DECLARE
  v_default_plan_id uuid;
  v_school_id uuid;
  v_tenant_id uuid;
  v_school_name text;
BEGIN
  SELECT id INTO v_default_plan_id FROM public.plans WHERE code = 'professional' LIMIT 1;

  SELECT id, name, tenant_id INTO v_school_id, v_school_name, v_tenant_id
  FROM public.schools ORDER BY created_at LIMIT 1;

  IF v_school_id IS NOT NULL AND v_tenant_id IS NULL THEN
    INSERT INTO public.tenants (name, slug, status, plan_id, subscription_status)
    VALUES (COALESCE(v_school_name, 'Minha Escola'), 'minha-escola', 'active', v_default_plan_id, 'active')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_tenant_id;

    UPDATE public.schools SET tenant_id = v_tenant_id WHERE id = v_school_id;

    INSERT INTO public.tenant_domains (tenant_id, hostname, type, status)
    VALUES (v_tenant_id, 'minha-escola.portal-siga.com', 'siga_subdomain', 'active')
    ON CONFLICT (hostname) DO NOTHING;

    INSERT INTO public.tenant_usage (tenant_id)
    VALUES (v_tenant_id)
    ON CONFLICT (tenant_id) DO NOTHING;
  END IF;
END $$;

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
