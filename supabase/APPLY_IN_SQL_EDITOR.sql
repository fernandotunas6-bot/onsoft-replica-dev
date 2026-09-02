-- =============================================================================
-- SGA (xodgfmxiaunpamctfeea) — EXECUTE NO SQL EDITOR (Run)
-- Projecto: https://supabase.com/dashboard/project/xodgfmxiaunpamctfeea/sql
-- =============================================================================

-- Fix mínimo (pode correr só isto se o resto falhar):
ALTER TABLE public.finance_invoices
  ADD COLUMN IF NOT EXISTS penalty_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS in_app_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS email_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS sms_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS whatsapp_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS school_id uuid;

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS user_id uuid;

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Se a tabela ainda não existir:
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid,
  user_id uuid,
  in_app_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT true,
  sms_enabled boolean NOT NULL DEFAULT false,
  whatsapp_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Verificação (deve devolver linhas com as 4 colunas boolean):
-- SELECT in_app_enabled, email_enabled, sms_enabled, whatsapp_enabled
-- FROM public.notification_preferences LIMIT 1;

-- Perfil: telefone, nome e identificação do utilizador (self-service em Definições → Conta e Auth)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_path text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cargo text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS locale text DEFAULT 'pt-AO';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Africa/Luanda';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_status text DEFAULT 'completed';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

UPDATE public.profiles
SET full_name = display_name
WHERE full_name IS NULL AND display_name IS NOT NULL;

-- Trigger para criação automática de perfil a partir do Supabase Auth (Resiliente, Security Definer)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_full_name text;
  v_first_name text;
  v_last_name text;
  v_avatar_url text;
  v_phone text;
BEGIN
  v_full_name := COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    split_part(NEW.email, '@', 1)
  );
  v_first_name := NEW.raw_user_meta_data ->> 'first_name';
  v_last_name := NEW.raw_user_meta_data ->> 'last_name';
  v_avatar_url := NEW.raw_user_meta_data ->> 'avatar_url';
  v_phone := COALESCE(
    NEW.raw_user_meta_data ->> 'phone_primary',
    NEW.raw_user_meta_data ->> 'phone'
  );

  INSERT INTO public.profiles (
    id,
    full_name,
    first_name,
    last_name,
    avatar_url,
    phone,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    v_full_name,
    v_first_name,
    v_last_name,
    v_avatar_url,
    v_phone,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
    first_name = COALESCE(public.profiles.first_name, EXCLUDED.first_name),
    last_name = COALESCE(public.profiles.last_name, EXCLUDED.last_name),
    avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url),
    phone = COALESCE(public.profiles.phone, EXCLUDED.phone),
    updated_at = now();

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'public.handle_new_user trigger error: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

-- Presença na matrícula (ficha do aluno + média no dashboard)
ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS attendance_rate numeric(5,2);

-- Média final da matrícula (ficha do aluno) — students/server.ts espera esta coluna.
ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS final_average numeric(5,2);

-- Pessoa (registo biográfico humano — Conta é opcional)
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS photo_url text;

CREATE INDEX IF NOT EXISTS people_user_id_idx
  ON public.people (school_id, user_id)
  WHERE user_id IS NOT NULL AND deleted_at IS NULL;

-- Domínios school_settings usados pelo SIGA (branding, banking, agt, spotlight) — JSON em value, sem DDL extra.

-- Logótipos da escola (Definições → Escola)
INSERT INTO storage.buckets (id, name, public)
VALUES ('school-logos', 'school-logos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "School logos are publicly accessible" ON storage.objects;
CREATE POLICY "School logos are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'school-logos');

DROP POLICY IF EXISTS "Authenticated users can upload school logos" ON storage.objects;
CREATE POLICY "Authenticated users can upload school logos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'school-logos'
    -- O bucket é público: aceita apenas o nome de ficheiro gerado pela UI de branding,
    -- nunca imagens de pessoas nem caminhos arbitrários.
    AND name ~ '^[0-9a-f-]{36}/logo-[0-9]{13}\.(png|jpg|jpeg|webp|svg)$'
  );

DROP POLICY IF EXISTS "Authenticated users can replace school logos" ON storage.objects;
CREATE POLICY "Authenticated users can replace school logos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'school-logos'
    AND name ~ '^[0-9a-f-]{36}/logo-[0-9]{13}\.(png|jpg|jpeg|webp|svg)$'
  )
  WITH CHECK (
    bucket_id = 'school-logos'
    AND name ~ '^[0-9a-f-]{36}/logo-[0-9]{13}\.(png|jpg|jpeg|webp|svg)$'
  );

-- Fotografia de perfil (Definições → Conta). O bucket é privado: a aplicação
-- entrega URLs assinadas somente a colaboradores da mesma escola.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;

DROP POLICY IF EXISTS "Users can read avatars" ON storage.objects;
CREATE POLICY "Users can read avatars"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.school_memberships sm1
        JOIN public.school_memberships sm2 ON sm1.school_id = sm2.school_id
        WHERE sm1.user_id = auth.uid()
          AND sm2.user_id::text = (storage.foldername(name))[1]
          AND sm1.status = 'active'
          AND sm2.status = 'active'
      )
    )
  );

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can replace their own avatar" ON storage.objects;
CREATE POLICY "Users can replace their own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Matrícula pública + ciclos premium (grants, ICS, WhatsApp, planos):
-- correr de seguida supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql
-- (não usar as migrações 2026081114* isoladas — dependiam de current_school_id() Lovable).

-- Funções de segurança fundamentais para RLS
CREATE OR REPLACE FUNCTION public.current_school_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT school_id
  FROM public.school_memberships
  WHERE user_id = (SELECT auth.uid())
    AND status = 'active'
  ORDER BY created_at ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_school_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_school_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    (
      SELECT r.code
      FROM public.school_memberships sm
      JOIN public.member_roles mr ON mr.membership_id = sm.id
      JOIN public.roles r ON r.id = mr.role_id
      WHERE sm.user_id = (SELECT auth.uid())
        AND sm.status = 'active'
      ORDER BY sm.created_at ASC
      LIMIT 1
    ),
    (
      SELECT cargo
      FROM public.profiles
      WHERE id = (SELECT auth.uid())
      LIMIT 1
    ),
    'Utilizador'
  );
$$;

REVOKE ALL ON FUNCTION public.current_profile_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_role() TO authenticated, service_role;

-- Telemetria de webhooks EMIS/Unitel (observabilidade produção)
CREATE TABLE IF NOT EXISTS public.finance_gateway_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  channel text NOT NULL,
  http_status integer NOT NULL,
  ok boolean NOT NULL,
  message text,
  reference text,
  invoice_id uuid,
  amount numeric,
  provider text,
  dev_mode boolean NOT NULL DEFAULT false,
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_gateway_webhook_events_school_recent_idx
  ON public.finance_gateway_webhook_events (school_id, created_at DESC);

CREATE INDEX IF NOT EXISTS finance_gateway_webhook_events_failures_idx
  ON public.finance_gateway_webhook_events (created_at DESC)
  WHERE ok = false;

GRANT SELECT ON public.finance_gateway_webhook_events TO authenticated;
GRANT ALL ON public.finance_gateway_webhook_events TO service_role;

ALTER TABLE public.finance_gateway_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_gateway_webhook_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read gateway webhook events in own school" ON public.finance_gateway_webhook_events;
CREATE POLICY "Read gateway webhook events in own school" ON public.finance_gateway_webhook_events
  FOR SELECT TO authenticated
  USING (
    public.is_school_member(school_id)
    AND (
      (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria', 'owner', 'admin', 'treasury', 'finance')
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid()) AND cargo IN ('Administrador', 'Tesouraria')
      )
    )
  );
