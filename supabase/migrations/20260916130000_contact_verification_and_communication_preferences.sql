-- Migração: Verificação de contactos e preferências de comunicação por utilizador
-- Data: 2026-09-16
--
-- Fecha o passo 2 da "Próxima fatia" do Ciclo 91. `contact_verification_profiles` e
-- `user_communication_preferences` são as duas únicas tabelas consultadas por
-- `src/features/contacts/contact-verification-service.ts` que não existiam **nem no
-- repositório nem na produção** — ao contrário das 35 capturadas em
-- `20260914151906_capture_undeclared_production_tables.sql`, que existiam na base e
-- faltavam ao repositório. Aqui não há DDL real para capturar: não há tabela nenhuma.
--
-- Por isso o esquema não foi inventado. Cada coluna abaixo corresponde a um campo de
-- `ContactVerificationProfileRow` / `UserCommunicationPreferencesRow`, e cada default
-- existe porque o `insert` do serviço só fornece `user_id` e `school_id` — tudo o resto
-- tem de nascer preenchido ou a criação do perfil falha.
--
-- POR APLICAR: escrita na base, decisão do dono do projecto. Enquanto não for aplicada,
-- as duas tabelas continuam em `TABELAS_AUSENTES_DA_PRODUCAO`
-- (`tests/security/production-snapshot.test.ts`) e a verificação de contactos e as
-- preferências de comunicação devolvem, em produção, o erro de tabela inexistente do
-- PostgREST — não um ecrã vazio.

-- 1. PERFIL DE VERIFICAÇÃO DE CONTACTO
--
-- Uma linha por utilizador: o serviço lê sempre com `.eq("user_id", …).maybeSingle()`,
-- que rebenta com mais do que uma linha. Daí o UNIQUE, e não só o índice.
--
-- `preferred_communication_channel` usa o enum `communication_channel` criado em
-- `20260911120000_central_communication_and_otp.sql` (aplicado a 2026-09-14). O tipo em
-- TypeScript é `string` com cast para `ContactChannel` — o enum é que impede a terceira
-- via de entrar na coluna.
CREATE TABLE IF NOT EXISTS public.contact_verification_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,

  email_address VARCHAR(255),
  email_verified BOOLEAN NOT NULL DEFAULT false,
  email_verified_at TIMESTAMPTZ,

  phone_number VARCHAR(32),
  phone_verified BOOLEAN NOT NULL DEFAULT false,
  phone_verified_at TIMESTAMPTZ,

  whatsapp_number VARCHAR(32),
  whatsapp_verified BOOLEAN NOT NULL DEFAULT false,
  whatsapp_verified_at TIMESTAMPTZ,

  preferred_communication_channel communication_channel NOT NULL DEFAULT 'email',
  preferred_language VARCHAR(10) NOT NULL DEFAULT 'pt',

  -- Registo best-effort do último envio por canal (`registerDispatch` engole o erro).
  last_email_sent_at TIMESTAMPTZ,
  last_sms_sent_at TIMESTAMPTZ,
  last_whatsapp_sent_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_contact_verification_profiles_school
  ON public.contact_verification_profiles (school_id);

-- 2. PREFERÊNCIAS DE COMUNICAÇÃO POR CATEGORIA
--
-- `security_enabled` não tem caminho de escrita: `updateCommunicationCategories` aceita as
-- outras oito categorias e deixa esta de fora de propósito — avisos de segurança são
-- obrigatórios. O CHECK põe essa regra na base em vez de a deixar só na camada
-- TypeScript, que é contornável por qualquer outro cliente com service_role.
CREATE TABLE IF NOT EXISTS public.user_communication_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,

  security_enabled BOOLEAN NOT NULL DEFAULT true CHECK (security_enabled),
  academic_enabled BOOLEAN NOT NULL DEFAULT true,
  financial_enabled BOOLEAN NOT NULL DEFAULT true,
  attendance_enabled BOOLEAN NOT NULL DEFAULT true,
  calendar_enabled BOOLEAN NOT NULL DEFAULT true,
  announcements_enabled BOOLEAN NOT NULL DEFAULT true,
  events_enabled BOOLEAN NOT NULL DEFAULT true,
  documents_enabled BOOLEAN NOT NULL DEFAULT true,
  -- A única que nasce desligada: comunicação comercial é opt-in.
  marketing_enabled BOOLEAN NOT NULL DEFAULT false,

  -- `Record<string, ContactChannel[]>` no serviço: por categoria, os canais a usar.
  channel_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_user_communication_preferences_school
  ON public.user_communication_preferences (school_id);

-- 3. `updated_at` e `version`
--
-- A escolha óbvia era `public.set_updated_at_and_version()`, que `subjects`, `term_grades`
-- e a família `hr_*` usam. Não serve aqui, e a razão só apareceu ao exercitar um UPDATE
-- contra a base: a função faz `NEW.created_by = OLD.created_by` e
-- `NEW.updated_by = COALESCE(auth.uid(), NEW.updated_by)`. Numa tabela sem essas duas
-- colunas, **todos** os UPDATE rebentam com 42703 — `markEmailAsVerified`,
-- `setPreferredChannel` e `updateCommunicationCategories` incluídos. O INSERT passa, o que
-- torna a falha invisível até ao primeiro utilizador que verifica um contacto.
--
-- Estas tabelas não têm autoria: o serviço corre com `service_role` e não regista quem
-- alterou. Acrescentar `created_by`/`updated_by` só para alimentar a função seria declarar
-- duas colunas que ninguém escreve nem lê. Fica a variante sem autoria — o mesmo contrato
-- (`updated_at` + `version`) para tabelas com essas duas colunas e mais nenhuma.
CREATE OR REPLACE FUNCTION public.siga_touch_updated_at_and_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at = now();
  NEW.version = COALESCE(OLD.version, 0) + 1;
  RETURN NEW;
END;
$function$;

-- `DROP … IF EXISTS` em vez do bloco guardado por `duplicate_object`: um guarda desses
-- deixaria em pé um trigger antigo a apontar para a função errada, que é exactamente o
-- estado que esta secção corrige.
DROP TRIGGER IF EXISTS contact_verification_profiles_set_updated_at
  ON public.contact_verification_profiles;
CREATE TRIGGER contact_verification_profiles_set_updated_at
  BEFORE UPDATE ON public.contact_verification_profiles
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at_and_version();

DROP TRIGGER IF EXISTS user_communication_preferences_set_updated_at
  ON public.user_communication_preferences;
CREATE TRIGGER user_communication_preferences_set_updated_at
  BEFORE UPDATE ON public.user_communication_preferences
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at_and_version();

-- 4. ROW LEVEL SECURITY
--
-- Escrita só por `service_role`: todo o serviço corre com `loadSgaAdminClient()`, e é a
-- camada de serviço que garante invariantes como "marcar verificado exige um OTP
-- consumido". Dar UPDATE ao papel `authenticated` permitiria a um utilizador marcar-se a
-- si próprio como verificado a partir do browser.
--
-- Leitura da própria linha é concedida a `authenticated` — é o que um ecrã de
-- definições precisa, e `auth.uid()` não deixa ver a de outro.
ALTER TABLE public.contact_verification_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_communication_preferences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_role_full_contact_profiles" ON public.contact_verification_profiles
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "service_role_full_communication_prefs" ON public.user_communication_preferences
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "auth_view_own_contact_profile" ON public.contact_verification_profiles
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "auth_view_own_communication_prefs" ON public.user_communication_preferences
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null;
END $$;
