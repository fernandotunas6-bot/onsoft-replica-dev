-- Migração: Central Unificada de OTP e Mensagens Multicanal (Resend + WhatsApp + SMS)
-- Data: 2026-09-11

-- 1. ENUMS E TIPOS
DO $$ BEGIN
  CREATE TYPE communication_channel AS ENUM ('email', 'sms', 'whatsapp');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE otp_purpose AS ENUM (
    'signup_verification',
    'login_2fa',
    'password_reset',
    'phone_change',
    'email_change',
    'payflow_sensitive_op',
    'grade_approval',
    'admin_step_up'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE dispatch_status AS ENUM (
    'pending',
    'queued',
    'sent',
    'delivered',
    'opened',
    'clicked',
    'failed',
    'bounced'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. TABELA DE VERIFICAÇÃO POR CÓDIGO (OTP SEGURO)
CREATE TABLE IF NOT EXISTS public.verification_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  target_identifier VARCHAR(255) NOT NULL, -- Telefone (+244...) ou E-mail normalizado
  channel_sent communication_channel NOT NULL,
  purpose otp_purpose NOT NULL,
  code_hash VARCHAR(255) NOT NULL, -- Hash HMAC-SHA256 (NUNCA plaintext)
  attempts_left SMALLINT NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  requested_ip VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices otimizados para busca de códigos ativos
CREATE INDEX IF NOT EXISTS idx_verification_otps_active 
  ON public.verification_otps (target_identifier, purpose) 
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_verification_otps_school 
  ON public.verification_otps (school_id, created_at DESC);

-- 3. TABELA DE REGISTO DE DESPACHOS DE COMUNICAÇÃO
CREATE TABLE IF NOT EXISTS public.communication_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  channel communication_channel NOT NULL,
  provider VARCHAR(50) NOT NULL, -- 'resend', 'meta_whatsapp', 'infobip', 'africas_talking', 'local_sms'
  external_message_id VARCHAR(255),
  sender_address VARCHAR(255) NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  subject_or_template VARCHAR(255),
  status dispatch_status NOT NULL DEFAULT 'pending',
  error_details TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_communication_dispatches_school 
  ON public.communication_dispatches (school_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_communication_dispatches_ext_id 
  ON public.communication_dispatches (external_message_id);

CREATE INDEX IF NOT EXISTS idx_communication_dispatches_recipient 
  ON public.communication_dispatches (recipient, created_at DESC);

-- 4. TABELA DE EVENTOS DE WEBHOOKS (Resend, Meta, Gateways de SMS)
CREATE TABLE IF NOT EXISTS public.communication_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id UUID REFERENCES public.communication_dispatches(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  event_type VARCHAR(50) NOT NULL, -- 'delivered', 'bounce', 'opened', 'clicked', 'complaint'
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_communication_events_dispatch 
  ON public.communication_events (dispatch_id, occurred_at DESC);

-- 5. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.verification_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_events ENABLE ROW LEVEL SECURITY;

-- Service Role tem acesso total irrestrito (essencial para server functions de auth e webhooks)
DO $$ BEGIN
  CREATE POLICY "service_role_full_otps" ON public.verification_otps
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "service_role_full_dispatches" ON public.communication_dispatches
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "service_role_full_events" ON public.communication_events
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Utilizadores autenticados podem consultar os despachos da sua própria escola
DO $$ BEGIN
  CREATE POLICY "auth_view_school_dispatches" ON public.communication_dispatches
    FOR SELECT TO authenticated
    USING (
      school_id IN (
        SELECT school_id FROM public.school_memberships 
        WHERE user_id = auth.uid() AND is_active = true
      )
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;
