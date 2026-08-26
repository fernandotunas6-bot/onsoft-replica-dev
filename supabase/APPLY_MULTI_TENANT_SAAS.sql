-- ============================================================================
-- SIGA SAAS MULTI-TENANT ARCHITECTURE (FASE 1 & FASE 2 MIGRAÇÃO)
-- ============================================================================
-- Este script adiciona o suporte Multi-Tenant ao SIGA sem quebrar nenhuma
-- funcionalidade existente. Transforma a instalação atual no Tenant 1 (Padrão).
-- ============================================================================

-- 1. TABELA DE PLANOS SAAS
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

-- Planos por defeito
INSERT INTO public.plans (name, code, description, max_students, max_staff, max_storage_gb, price_aoa_monthly, price_aoa_yearly)
VALUES 
  ('Start', 'start', 'Plano inicial para pequenas escolas', 250, 25, 5, 50000.00, 500000.00),
  ('Professional', 'professional', 'Para colégios em crescimento', 750, 75, 20, 120000.00, 1200000.00),
  ('Business', 'business', 'Para grandes instituições de ensino', 2000, 200, 50, 250000.00, 2500000.00),
  ('Enterprise', 'enterprise', 'Redes escolares e grandes complexos', 10000, 1000, 200, 500000.00, 5000000.00)
ON CONFLICT (code) DO NOTHING;

-- 2. TABELA CENTRAL DE TENANTS
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

-- 3. DOMÍNIOS DOS TENANTS
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

-- 4. TENANT MEMBERSHIPS (ASSOCIAÇÃO UTILIZADOR <-> TENANT)
CREATE TABLE IF NOT EXISTS public.tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('school_owner', 'director', 'pedagogical_director', 'secretary', 'treasury', 'teacher', 'employee', 'student', 'guardian')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

-- 5. SUBSCRIÇÕES E USO SAAS
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

-- 6. MIGRAÇÃO SEGURA: CRIAR TENANT PADRÃO PARA O SIGA ATUAL
DO $$
DECLARE
  v_default_plan_id uuid;
  v_default_tenant_id uuid;
BEGIN
  -- Obter plano Professional como padrão
  SELECT id INTO v_default_plan_id FROM public.plans WHERE code = 'professional' LIMIT 1;
  
  -- Verificar se já existe Tenant Padrão
  SELECT id INTO v_default_tenant_id FROM public.tenants WHERE slug = 'padrao' OR slug = 'minha-escola' LIMIT 1;
  
  IF v_default_tenant_id IS NULL THEN
    INSERT INTO public.tenants (name, slug, status, plan_id, subscription_status)
    VALUES ('Minha Escola (Tenant Principal)', 'minha-escola', 'active', v_default_plan_id, 'active')
    RETURNING id INTO v_default_tenant_id;
  END IF;

  -- Registar subdomínio padrão
  INSERT INTO public.tenant_domains (tenant_id, hostname, type, status)
  VALUES (v_default_tenant_id, 'minha-escola.portal-siga.com', 'siga_subdomain', 'active')
  ON CONFLICT (hostname) DO NOTHING;

  -- Adicionar coluna tenant_id à tabela public.schools se ainda não existir
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'schools' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE public.schools ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
  END IF;

  -- Associar escolas existentes ao tenant padrão
  UPDATE public.schools SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;

  -- Adicionar tenant_id e migrar todas as tabelas institucionais
  FOR r IN SELECT unnest(ARRAY[
    'people', 'students', 'teachers', 'employees', 'guardians', 
    'classes', 'classrooms', 'subjects', 'enrollments', 'academic_years', 
    'terms', 'assessments', 'grades', 'attendance', 'invoices', 
    'payments', 'documents', 'notifications', 'schedules', 'reports', 
    'settings', 'audit_logs'
  ]) AS tbl_name
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = r.tbl_name) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = r.tbl_name AND column_name = 'tenant_id'
      ) THEN
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);', r.tbl_name);
      END IF;
      EXECUTE format('UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS NULL;', r.tbl_name, v_default_tenant_id);
    END IF;
  END LOOP;

END $$;

-- 7. FUNÇÃO AUXILIAR DO TENANT ATUAL
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT tenant_id 
  FROM public.tenant_memberships 
  WHERE user_id = (SELECT auth.uid()) 
    AND status = 'active'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated, service_role;

-- 8. AUDIT LOGS MULTI-TENANT
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

-- Ativar RLS em audit_logs
ALTER TABLE public.saas_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Utilizadores lêem apenas audit_logs do seu tenant"
  ON public.saas_audit_logs FOR SELECT
  TO authenticated
  USING (tenant_id = public.current_tenant_id());

