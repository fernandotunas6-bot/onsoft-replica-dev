-- SIGA AI — módulo de inteligência artificial local (Project NOMAD integrado).
--
-- Seis tabelas novas, nenhuma existente é alterada. Nenhuma existia em produção
-- (supabase/PRODUCTION_SNAPSHOT.json).
--
-- Todas só-servidor: FORCE ROW LEVEL SECURITY, sem políticas, REVOKE a PUBLIC,
-- anon e authenticated. O acesso é feito pelo gateway
-- (src/features/siga-ai/gateway.server.ts), que resolve a escola pela membership
-- (resolveSgaMembershipAdmin / requireSgaWriter) antes de qualquer leitura.
--
-- Porque é que nada disto é legível pelo browser: `is_school_member` é verdadeiro
-- para alunos e encarregados, e estas tabelas guardam conversas de outras
-- pessoas, documentos institucionais e métricas de utilização. Um aluno com
-- SELECT em `siga_ai_messages` leria as conversas de toda a escola.
--
-- Idempotente: pode correr duas vezes. Não apaga dados.

-- 1. Configuração por escola -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.siga_ai_settings (
  school_id uuid PRIMARY KEY REFERENCES public.schools (id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'local',
  endpoint_url text,
  vector_url text,
  chat_model text,
  remote_allowed boolean NOT NULL DEFAULT false,
  allowed_profiles text[] NOT NULL DEFAULT ARRAY['professor','aluno','secretaria','administrador'],
  hourly_limit integer NOT NULL DEFAULT 40,
  retention_days integer NOT NULL DEFAULT 365,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT siga_ai_settings_mode_check CHECK (mode IN ('local', 'school_server', 'remote')),
  CONSTRAINT siga_ai_settings_endpoint_check CHECK (endpoint_url IS NULL OR endpoint_url ~ '^https?://'),
  CONSTRAINT siga_ai_settings_vector_check CHECK (vector_url IS NULL OR vector_url ~ '^https?://'),
  CONSTRAINT siga_ai_settings_hourly_check CHECK (hourly_limit BETWEEN 1 AND 500),
  CONSTRAINT siga_ai_settings_retention_check CHECK (retention_days BETWEEN 0 AND 3650)
);

DROP TRIGGER IF EXISTS siga_ai_settings_touch_updated_at ON public.siga_ai_settings;
CREATE TRIGGER siga_ai_settings_touch_updated_at
  BEFORE UPDATE ON public.siga_ai_settings
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

ALTER TABLE public.siga_ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_ai_settings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_ai_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_ai_settings TO service_role;

-- 2. Conversas ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.siga_ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Nova conversa',
  profile text NOT NULL DEFAULT 'secretaria',
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT siga_ai_conversations_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  CONSTRAINT siga_ai_conversations_profile_check
    CHECK (profile IN ('professor', 'aluno', 'secretaria', 'administrador'))
);

CREATE INDEX IF NOT EXISTS siga_ai_conversations_owner_idx
  ON public.siga_ai_conversations (school_id, user_id, last_message_at DESC);

DROP TRIGGER IF EXISTS siga_ai_conversations_touch_updated_at ON public.siga_ai_conversations;
CREATE TRIGGER siga_ai_conversations_touch_updated_at
  BEFORE UPDATE ON public.siga_ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

ALTER TABLE public.siga_ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_ai_conversations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_ai_conversations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_ai_conversations TO service_role;

-- 3. Mensagens ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.siga_ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.siga_ai_conversations (id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools (id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  model text,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT siga_ai_messages_role_check CHECK (role IN ('user', 'assistant')),
  CONSTRAINT siga_ai_messages_content_check CHECK (char_length(content) <= 40000)
);

CREATE INDEX IF NOT EXISTS siga_ai_messages_conversation_idx
  ON public.siga_ai_messages (conversation_id, created_at);

ALTER TABLE public.siga_ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_ai_messages FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_ai_messages FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_ai_messages TO service_role;

-- 4. Documentos indexados -----------------------------------------------------
-- Os fragmentos e os vectores vivem no Qdrant (colecção `siga_ai_kb`, com
-- `school_id` em payload). Esta tabela é o registo autoritativo do que existe,
-- para a escola poder listar e remover sem depender do Qdrant estar de pé.
CREATE TABLE IF NOT EXISTS public.siga_ai_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools (id) ON DELETE CASCADE,
  title text NOT NULL,
  scope text NOT NULL DEFAULT 'school',
  owner_user_id uuid,
  source_name text,
  mime_type text,
  chunk_count integer NOT NULL DEFAULT 0,
  char_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT siga_ai_documents_title_check CHECK (char_length(btrim(title)) BETWEEN 2 AND 200),
  CONSTRAINT siga_ai_documents_scope_check CHECK (scope IN ('personal', 'school', 'public')),
  -- Documento pessoal sem dono seria um documento sem fronteira de acesso.
  CONSTRAINT siga_ai_documents_owner_check
    CHECK (scope <> 'personal' OR owner_user_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS siga_ai_documents_school_idx
  ON public.siga_ai_documents (school_id, created_at DESC);

DROP TRIGGER IF EXISTS siga_ai_documents_touch_updated_at ON public.siga_ai_documents;
CREATE TRIGGER siga_ai_documents_touch_updated_at
  BEFORE UPDATE ON public.siga_ai_documents
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

ALTER TABLE public.siga_ai_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_ai_documents FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_ai_documents FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_ai_documents TO service_role;

-- 5. Utilização (métricas da área administrativa) -----------------------------
CREATE TABLE IF NOT EXISTS public.siga_ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  model text NOT NULL,
  mode text NOT NULL DEFAULT 'local',
  elapsed_ms integer NOT NULL DEFAULT 0,
  question_chars integer NOT NULL DEFAULT 0,
  answer_chars integer NOT NULL DEFAULT 0,
  citations integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT siga_ai_usage_mode_check CHECK (mode IN ('local', 'school_server', 'remote'))
);

CREATE INDEX IF NOT EXISTS siga_ai_usage_school_idx
  ON public.siga_ai_usage (school_id, created_at DESC);

ALTER TABLE public.siga_ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_ai_usage FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_ai_usage FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_ai_usage TO service_role;
