-- school_branding ficava apenas em supabase/APPLY_DIGITAL_IDENTITY.sql (script
-- manual, fora do fluxo de migrations versionado) apesar de já ser a fonte de
-- primary_color/secondary_color usada tanto pelo painel Definições → Escola
-- (src/features/school/server.ts) como pelos e-mails institucionais de Auth
-- (src/features/auth/reset-password-server.ts). Esta migration formaliza a
-- tabela sob controlo de versão, sem alterar dados existentes.
--
-- DEPENDÊNCIA (resolvida em 20260908125000_capture_saas_platform_layer.sql):
-- a policy abaixo chama public.is_platform_admin(), que até essa migração só
-- existia em supabase/APPLY_SAAS_PLATFORM.sql (script manual). A migração
-- 20260908125000 versiona toda a camada SaaS (plans/tenants/subscriptions/
-- is_platform_admin()) e aplica-se antes desta na ordem cronológica dos
-- ficheiros — um ambiente novo aplicado do zero já a tem disponível aqui.

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

CREATE INDEX IF NOT EXISTS idx_school_branding_school_id ON public.school_branding (school_id);

ALTER TABLE public.school_branding ENABLE ROW LEVEL SECURITY;

-- Leitura pública (authenticated + anon): a página de login/reset precisa do
-- logo/cor da escola antes de haver sessão autenticada.
DROP POLICY IF EXISTS "school_members_view_branding" ON public.school_branding;
CREATE POLICY "school_members_view_branding" ON public.school_branding
  FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "school_admin_manage_branding" ON public.school_branding;
CREATE POLICY "school_admin_manage_branding" ON public.school_branding
  FOR ALL TO authenticated
  USING (
    (
      school_id = (SELECT public.current_school_id())
      AND public.current_school_role_is(
        ARRAY['owner','admin','administrator','administrador','diretor geral','director geral']::text[]
      )
    )
    OR public.is_platform_admin()
  )
  WITH CHECK (
    (
      school_id = (SELECT public.current_school_id())
      AND public.current_school_role_is(
        ARRAY['owner','admin','administrator','administrador','diretor geral','director geral']::text[]
      )
    )
    OR public.is_platform_admin()
  );

COMMENT ON TABLE public.school_branding IS
  'Identidade visual por escola (logo, cores, título do portal). Leitura pública (necessária para telas pré-auth), escrita restrita ao admin da própria escola ou platform admin.';
