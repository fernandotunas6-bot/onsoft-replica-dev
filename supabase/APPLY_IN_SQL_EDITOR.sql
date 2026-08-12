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

-- Perfil: telefone do utilizador (self-service em Definições → Conta)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;

-- Presença na matrícula (ficha do aluno + média no dashboard)
ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS attendance_rate numeric(5,2);

-- Domínios school_settings usados pelo SIGA (branding, banking, agt, spotlight) — JSON em value, sem DDL extra.

-- Logótipos da escola (Definições → Escola)
INSERT INTO storage.buckets (id, name, public)
VALUES ('school-logos', 'school-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "School logos are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'school-logos');

CREATE POLICY "Authenticated users can upload school logos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'school-logos');

CREATE POLICY "Authenticated users can replace school logos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'school-logos')
  WITH CHECK (bucket_id = 'school-logos');

-- Matrícula pública + ciclos premium (grants, ICS, WhatsApp, planos):
-- correr de seguida supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql
-- (não usar as migrações 2026081114* isoladas — dependiam de current_school_id() Lovable).
