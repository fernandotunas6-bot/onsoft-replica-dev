-- =============================================================================
-- SIGA Plus — PACOTE DE IDENTIDADE DIGITAL MULTI-TENANT
-- DDL Idempotente: Subdomínios, E-mails, Branding, Add-ons e Provisionamento
-- Aplicar com: npm run siga:sql
-- =============================================================================

-- 1. SUBDOMÍNIOS RESERVADOS (Sistema / Infraestrutura)
CREATE TABLE IF NOT EXISTS public.reserved_subdomains (
  slug text PRIMARY KEY,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reserved_subdomains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_reserved_subdomains" ON public.reserved_subdomains;
CREATE POLICY "public_read_reserved_subdomains" ON public.reserved_subdomains
  FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "platform_admin_manage_reserved_subdomains" ON public.reserved_subdomains;
CREATE POLICY "platform_admin_manage_reserved_subdomains" ON public.reserved_subdomains
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- Seed inicial de slugs reservados
INSERT INTO public.reserved_subdomains (slug, reason) VALUES
  ('www',          'landing page'),
  ('app',          'portal geral'),
  ('admin',        'painel saas'),
  ('saas-admin',   'painel saas admin'),
  ('api',          'api rest'),
  ('auth',         'supabase auth'),
  ('status',       'status page'),
  ('mail',         'infra email'),
  ('smtp',         'infra email'),
  ('imap',         'infra email'),
  ('pop',          'infra email'),
  ('support',      'suporte'),
  ('suporte',      'suporte'),
  ('billing',      'billing saas'),
  ('financeiro',   'billing saas'),
  ('commercial',   'comercial'),
  ('comercial',    'comercial'),
  ('docs',         'documentacao'),
  ('documentation','documentacao'),
  ('help',         'ajuda'),
  ('ajuda',        'ajuda'),
  ('system',       'sistema'),
  ('sistema',      'sistema'),
  ('cdn',          'infra cdn'),
  ('static',       'infra cdn'),
  ('assets',       'infra cdn'),
  ('security',     'seguranca'),
  ('seguranca',    'seguranca'),
  ('login',        'auth'),
  ('signup',       'auth'),
  ('register',     'auth'),
  ('root',         'infra'),
  ('cloud',        'infra'),
  ('noreply',      'email transacional'),
  ('notificacoes', 'email transacional'),
  ('portal',       'infra portal'),
  ('web',          'infra web')
ON CONFLICT (slug) DO NOTHING;

-- 2. BRANDING E IDENTIDADE VISUAL POR ESCOLA
CREATE TABLE IF NOT EXISTS public.school_branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,
  logo_url text,
  favicon_url text,
  primary_color text CHECK (primary_color IS NULL OR primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text CHECK (secondary_color IS NULL OR secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  school_name text,
  short_name text,
  portal_title text,
  login_background text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.school_branding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "school_members_view_branding" ON public.school_branding;
CREATE POLICY "school_members_view_branding" ON public.school_branding
  FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "school_admin_manage_branding" ON public.school_branding;
CREATE POLICY "school_admin_manage_branding" ON public.school_branding
  FOR ALL TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    OR public.is_platform_admin()
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    OR public.is_platform_admin()
  );

-- 3. ROTAS DE E-MAIL INSTITUCIONAL (ENCAMINHAMENTO)
CREATE TABLE IF NOT EXISTS public.school_email_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  source_address text NOT NULL,
  destination_address text NOT NULL,
  provider text NOT NULL DEFAULT 'cloudflare_email',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'failed', 'suspended')),
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, source_address)
);

ALTER TABLE public.school_email_routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admin_all_email_routes" ON public.school_email_routes;
CREATE POLICY "platform_admin_all_email_routes" ON public.school_email_routes
  FOR ALL TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    OR public.is_platform_admin()
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    OR public.is_platform_admin()
  );

-- 4. CAIXAS DE CORREIO PROFISSIONAIS (ADD-ON)
CREATE TABLE IF NOT EXISTS public.mailboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  address text NOT NULL UNIQUE,
  provider text NOT NULL,
  external_id text,
  plan_id uuid REFERENCES public.plans(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
  storage_limit_gb integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mailboxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admin_all_mailboxes" ON public.mailboxes;
CREATE POLICY "platform_admin_all_mailboxes" ON public.mailboxes
  FOR ALL TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    OR public.is_platform_admin()
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    OR public.is_platform_admin()
  );

-- 5. ALIASES DE E-MAIL
CREATE TABLE IF NOT EXISTS public.email_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id uuid NOT NULL REFERENCES public.mailboxes(id) ON DELETE CASCADE,
  alias_address text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admin_all_aliases" ON public.email_aliases;
CREATE POLICY "platform_admin_all_aliases" ON public.email_aliases
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- 6. HISTÓRICO DE MUDANÇA DE SLUG (COM REDIRECT TEMPORÁRIO)
CREATE TABLE IF NOT EXISTS public.school_slug_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  old_slug text NOT NULL,
  new_slug text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  redirect_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.school_slug_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admin_all_slug_history" ON public.school_slug_history;
CREATE POLICY "platform_admin_all_slug_history" ON public.school_slug_history
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- 7. RESERVAS TEMPORÁRIAS DE SLUG (DURANTE CHECKOUT)
CREATE TABLE IF NOT EXISTS public.slug_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  session_id text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_slug_reservations_slug ON public.slug_reservations (slug);
CREATE INDEX IF NOT EXISTS idx_slug_reservations_expires ON public.slug_reservations (expires_at);

-- 8. ADD-ONS DA SUBSCRIÇÃO (Identidade Digital, Domínio Customizado, Mailboxes)
CREATE TABLE IF NOT EXISTS public.subscription_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  addon_code text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
  activated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, addon_code)
);

ALTER TABLE public.subscription_addons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admin_all_addons" ON public.subscription_addons;
CREATE POLICY "platform_admin_all_addons" ON public.subscription_addons
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- 9. ESTADOS DE PROVISIONAMENTO DE ESCOLA / TENANT
CREATE TABLE IF NOT EXISTS public.tenant_provisioning (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,
  domain_status text NOT NULL DEFAULT 'pending',
  email_status text NOT NULL DEFAULT 'pending',
  subscription_status text NOT NULL DEFAULT 'pending',
  ssl_status text NOT NULL DEFAULT 'pending',
  provisioning_status text NOT NULL DEFAULT 'pending'
    CHECK (provisioning_status IN ('pending', 'processing', 'active', 'failed', 'suspended', 'cancelled')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.tenant_provisioning ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admin_all_provisioning" ON public.tenant_provisioning;
CREATE POLICY "platform_admin_all_provisioning" ON public.tenant_provisioning
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- 10. ÍNDICES DE PERFORMANCE PARA IDENTIDADE DIGITAL
CREATE INDEX IF NOT EXISTS idx_school_branding_school_id ON public.school_branding (school_id);
CREATE INDEX IF NOT EXISTS idx_school_email_routes_school_id ON public.school_email_routes (school_id);
CREATE INDEX IF NOT EXISTS idx_mailboxes_school_id ON public.mailboxes (school_id);
CREATE INDEX IF NOT EXISTS idx_subscription_addons_subscription_id ON public.subscription_addons (subscription_id);
CREATE INDEX IF NOT EXISTS idx_slug_history_tenant_id ON public.school_slug_history (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_provisioning_school_id ON public.tenant_provisioning (school_id);
