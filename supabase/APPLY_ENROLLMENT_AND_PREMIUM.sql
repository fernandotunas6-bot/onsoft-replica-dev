-- =============================================================================
-- SGA — matrícula pública + ciclos premium (WhatsApp, grants, ICS, pagamentos)
-- Projecto: https://supabase.com/dashboard/project/xodgfmxiaunpamctfeea/sql
-- Idempotente: pode voltar a correr se a tentativa anterior falhou a meio.
-- =============================================================================

-- A função Lovable current_school_id() NÃO existe no SGA.
-- Aqui fica o equivalente com school_memberships (membership activa do utilizador).
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

-- APPLY_IN_SQL_EDITOR.sql cria o bucket antes desta função existir. Ao reaplicar
-- este script, as políticas passam a limitar os uploads ao prefixo da própria escola.
DROP POLICY IF EXISTS "Authenticated users can upload school logos" ON storage.objects;
CREATE POLICY "Authenticated users can upload school logos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'school-logos'
    AND split_part(name, '/', 1) = (SELECT public.current_school_id())::text
    AND name ~ (
      '^' || (SELECT public.current_school_id())::text
      || '/logo-[0-9]{13}\.(png|jpg|jpeg|webp|svg)$'
    )
  );

DROP POLICY IF EXISTS "Authenticated users can replace school logos" ON storage.objects;
CREATE POLICY "Authenticated users can replace school logos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'school-logos'
    AND split_part(name, '/', 1) = (SELECT public.current_school_id())::text
    AND name ~ (
      '^' || (SELECT public.current_school_id())::text
      || '/logo-[0-9]{13}\.(png|jpg|jpeg|webp|svg)$'
    )
  )
  WITH CHECK (
    bucket_id = 'school-logos'
    AND split_part(name, '/', 1) = (SELECT public.current_school_id())::text
    AND name ~ (
      '^' || (SELECT public.current_school_id())::text
      || '/logo-[0-9]{13}\.(png|jpg|jpeg|webp|svg)$'
    )
  );

CREATE OR REPLACE FUNCTION public.siga_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Matrícula pública
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.enrollment_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  slug text NOT NULL,
  title text NOT NULL,
  subtitle text,
  hero_text text,
  accent_color text NOT NULL DEFAULT '#1d4ed8',
  logo_url text,
  is_open boolean NOT NULL DEFAULT true,
  visible_fields jsonb NOT NULL DEFAULT '["birth_date","sex","phone_primary","email","guardian_name","guardian_phone","guardian_relationship"]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS enrollment_forms_slug_idx
  ON public.enrollment_forms (slug)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS enrollment_forms_school_idx
  ON public.enrollment_forms (school_id)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS enrollment_forms_set_updated_at ON public.enrollment_forms;
CREATE TRIGGER enrollment_forms_set_updated_at
  BEFORE UPDATE ON public.enrollment_forms
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.enrollment_forms TO authenticated;
GRANT SELECT ON public.enrollment_forms TO anon;
GRANT ALL ON public.enrollment_forms TO service_role;

ALTER TABLE public.enrollment_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_forms FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read enrollment forms in own school" ON public.enrollment_forms;
CREATE POLICY "Read enrollment forms in own school"
  ON public.enrollment_forms
  FOR SELECT TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Public read open enrollment forms" ON public.enrollment_forms;
CREATE POLICY "Public read open enrollment forms"
  ON public.enrollment_forms
  FOR SELECT TO anon
  USING (is_open = true AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Manage enrollment forms in own school" ON public.enrollment_forms;
CREATE POLICY "Manage enrollment forms in own school"
  ON public.enrollment_forms
  FOR ALL TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND deleted_at IS NULL)
  WITH CHECK (school_id = (SELECT public.current_school_id()));

CREATE TABLE IF NOT EXISTS public.enrollment_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES public.enrollment_forms(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  decided_at timestamptz,
  decided_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

ALTER TABLE public.enrollment_applications
  ADD COLUMN IF NOT EXISTS student_id uuid;

CREATE INDEX IF NOT EXISTS enrollment_applications_school_status_idx
  ON public.enrollment_applications (school_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS enrollment_applications_set_updated_at ON public.enrollment_applications;
CREATE TRIGGER enrollment_applications_set_updated_at
  BEFORE UPDATE ON public.enrollment_applications
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.enrollment_applications TO authenticated;
GRANT INSERT ON public.enrollment_applications TO anon;
GRANT ALL ON public.enrollment_applications TO service_role;

ALTER TABLE public.enrollment_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_applications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read enrollment applications in own school" ON public.enrollment_applications;
CREATE POLICY "Read enrollment applications in own school"
  ON public.enrollment_applications
  FOR SELECT TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Update enrollment applications in own school" ON public.enrollment_applications;
CREATE POLICY "Update enrollment applications in own school"
  ON public.enrollment_applications
  FOR UPDATE TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND deleted_at IS NULL)
  WITH CHECK (school_id = (SELECT public.current_school_id()));

DROP POLICY IF EXISTS "Public insert open enrollment applications" ON public.enrollment_applications;
CREATE POLICY "Public insert open enrollment applications"
  ON public.enrollment_applications
  FOR INSERT TO anon
  WITH CHECK (
    status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.enrollment_forms forms
      WHERE forms.id = form_id
        AND forms.school_id = school_id
        AND forms.is_open = true
        AND forms.deleted_at IS NULL
    )
  );

-- ---------------------------------------------------------------------------
-- WhatsApp da turma, grants, ICS, integrações, planos de pagamento
-- ---------------------------------------------------------------------------
ALTER TABLE public.class_groups
  ADD COLUMN IF NOT EXISTS whatsapp_invite_url text,
  ADD COLUMN IF NOT EXISTS whatsapp_group_name text;

CREATE TABLE IF NOT EXISTS public.staff_module_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  level text NOT NULL CHECK (level IN ('Nenhum', 'Leitura', 'Escrita', 'Total')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  UNIQUE (school_id, user_id, module_key)
);

CREATE INDEX IF NOT EXISTS staff_module_grants_user_idx
  ON public.staff_module_grants (school_id, user_id);

ALTER TABLE public.staff_module_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_module_grants FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_module_grants TO authenticated;
GRANT ALL ON public.staff_module_grants TO service_role;

DROP POLICY IF EXISTS "Read own or admin staff grants" ON public.staff_module_grants;
CREATE POLICY "Read own or admin staff grants"
  ON public.staff_module_grants
  FOR SELECT TO authenticated
  USING (school_id = (SELECT public.current_school_id()));

DROP POLICY IF EXISTS "Admins manage staff grants" ON public.staff_module_grants;
CREATE POLICY "Admins manage staff grants"
  ON public.staff_module_grants
  FOR ALL TO authenticated
  USING (school_id = (SELECT public.current_school_id()))
  WITH CHECK (school_id = (SELECT public.current_school_id()));

CREATE TABLE IF NOT EXISTS public.calendar_feed_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, user_id)
);

ALTER TABLE public.calendar_feed_tokens ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.calendar_feed_tokens TO authenticated;
GRANT ALL ON public.calendar_feed_tokens TO service_role;

DROP POLICY IF EXISTS "Read own calendar feed token" ON public.calendar_feed_tokens;
CREATE POLICY "Read own calendar feed token"
  ON public.calendar_feed_tokens
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.school_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected' CHECK (
    status IN ('disconnected', 'configured', 'connected', 'error')
  ),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  UNIQUE (school_id, provider)
);

ALTER TABLE public.school_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_integrations FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.school_integrations TO authenticated;
GRANT ALL ON public.school_integrations TO service_role;

DROP POLICY IF EXISTS "Manage school integrations in own school" ON public.school_integrations;
CREATE POLICY "Manage school integrations in own school"
  ON public.school_integrations
  FOR ALL TO authenticated
  USING (school_id = (SELECT public.current_school_id()))
  WITH CHECK (school_id = (SELECT public.current_school_id()));

CREATE TABLE IF NOT EXISTS public.finance_payment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  invoice_id uuid,
  student_id uuid,
  channel text NOT NULL DEFAULT 'cash' CHECK (
    channel IN (
      'cash',
      'multicaixa',
      'transfer',
      'express',
      'multicaixa_express',
      'unitel_money'
    )
  ),
  installments integer NOT NULL DEFAULT 1 CHECK (installments BETWEEN 1 AND 24),
  reference text,
  status text NOT NULL DEFAULT 'pending_gateway' CHECK (
    status IN ('pending_gateway', 'scheduled', 'settled', 'cancelled')
  ),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.finance_payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_payment_plans FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.finance_payment_plans TO authenticated;
GRANT ALL ON public.finance_payment_plans TO service_role;

DROP POLICY IF EXISTS "Manage payment plans in own school" ON public.finance_payment_plans;
CREATE POLICY "Manage payment plans in own school"
  ON public.finance_payment_plans
  FOR ALL TO authenticated
  USING (school_id = (SELECT public.current_school_id()))
  WITH CHECK (school_id = (SELECT public.current_school_id()));

CREATE TABLE IF NOT EXISTS public.siga_assessment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_group_id uuid,
  subject_id uuid,
  term integer NOT NULL CHECK (term BETWEEN 1 AND 3),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'teste',
  component text NOT NULL DEFAULT 'NPP',
  assessed_on date,
  max_score numeric NOT NULL DEFAULT 20,
  counts_toward_pauta boolean NOT NULL DEFAULT true,
  allow_recovery boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.siga_assessment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_assessment_items FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.siga_assessment_items TO authenticated;
GRANT ALL ON public.siga_assessment_items TO service_role;

DROP POLICY IF EXISTS "Manage assessment items in own school" ON public.siga_assessment_items;
CREATE POLICY "Manage assessment items in own school"
  ON public.siga_assessment_items
  FOR ALL TO authenticated
  USING (school_id = (SELECT public.current_school_id()))
  WITH CHECK (school_id = (SELECT public.current_school_id()));

CREATE TABLE IF NOT EXISTS public.siga_assessment_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.siga_assessment_items(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL,
  score numeric,
  previous_score numeric,
  status text NOT NULL DEFAULT 'draft',
  recorded_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, enrollment_id)
);

ALTER TABLE public.siga_assessment_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_assessment_scores FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.siga_assessment_scores TO authenticated;
GRANT ALL ON public.siga_assessment_scores TO service_role;

DROP POLICY IF EXISTS "Manage assessment scores in own school" ON public.siga_assessment_scores;
CREATE POLICY "Manage assessment scores in own school"
  ON public.siga_assessment_scores
  FOR ALL TO authenticated
  USING (school_id = (SELECT public.current_school_id()))
  WITH CHECK (school_id = (SELECT public.current_school_id()));

-- Mensagens internas entre contas da mesma escola (painel da conta)
CREATE TABLE IF NOT EXISTS public.siga_direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS siga_direct_messages_thread_idx
  ON public.siga_direct_messages (school_id, sender_id, recipient_id, created_at);

ALTER TABLE public.siga_direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_direct_messages FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.siga_direct_messages TO authenticated;
GRANT ALL ON public.siga_direct_messages TO service_role;

DROP POLICY IF EXISTS "Read own school direct messages" ON public.siga_direct_messages;
CREATE POLICY "Read own school direct messages"
  ON public.siga_direct_messages
  FOR SELECT TO authenticated
  USING (school_id = (SELECT public.current_school_id()));

DROP POLICY IF EXISTS "Send school direct messages" ON public.siga_direct_messages;
CREATE POLICY "Send school direct messages"
  ON public.siga_direct_messages
  FOR INSERT TO authenticated
  WITH CHECK (school_id = (SELECT public.current_school_id()) AND sender_id = auth.uid());

-- Documentos por pessoa (BI/NIF e outros) — src/features/people/server.ts espera esta tabela.
CREATE TABLE IF NOT EXISTS public.person_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  document_number text NOT NULL,
  issued_at date,
  expires_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz,
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS person_documents_unique_active_idx
  ON public.person_documents (school_id, person_id, document_type, document_number)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS person_documents_person_idx
  ON public.person_documents (school_id, person_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.person_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_documents FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.person_documents TO authenticated;
GRANT ALL ON public.person_documents TO service_role;

DROP POLICY IF EXISTS "Read school person documents" ON public.person_documents;
CREATE POLICY "Read school person documents"
  ON public.person_documents
  FOR SELECT TO authenticated
  USING (school_id = (SELECT public.current_school_id()));

DROP POLICY IF EXISTS "Manage school person documents" ON public.person_documents;
CREATE POLICY "Manage school person documents"
  ON public.person_documents
  FOR ALL TO authenticated
  USING (school_id = (SELECT public.current_school_id()))
  WITH CHECK (school_id = (SELECT public.current_school_id()));

-- Referência opcional a ficheiro da biblioteca SIGA (sem FK para não bloquear SQL antigo)
ALTER TABLE public.person_documents
  ADD COLUMN IF NOT EXISTS file_id uuid;
ALTER TABLE public.person_documents
  ADD COLUMN IF NOT EXISTS file_name text;

-- A FK isolada não garante que pessoa e documento pertencem à mesma escola.
-- Este trigger impede a criação de referências cruzadas, inclusive via Data API.
CREATE OR REPLACE FUNCTION public.enforce_person_document_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.people
    WHERE id = NEW.person_id
      AND school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'A pessoa do documento deve pertencer à mesma escola';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_person_document_school() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS person_documents_enforce_school ON public.person_documents;
CREATE TRIGGER person_documents_enforce_school
  BEFORE INSERT OR UPDATE OF school_id, person_id ON public.person_documents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_person_document_school();

-- Arquivos da escola: metadados no Postgres, bytes no bucket privado (não no SQL).
INSERT INTO storage.buckets (id, name, public)
VALUES ('siga-files', 'siga-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Staff can read siga files" ON storage.objects;
CREATE POLICY "Staff can read siga files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'siga-files'
    AND split_part(name, '/', 1) = (SELECT public.current_school_id())::text
  );

DROP POLICY IF EXISTS "Staff can upload siga files" ON storage.objects;
CREATE POLICY "Staff can upload siga files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'siga-files'
    AND split_part(name, '/', 1) = (SELECT public.current_school_id())::text
    AND (storage.foldername(name))[5] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "Staff can replace siga files" ON storage.objects;
CREATE POLICY "Staff can replace siga files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'siga-files'
    AND split_part(name, '/', 1) = (SELECT public.current_school_id())::text
    AND (storage.foldername(name))[5] = (SELECT auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'siga-files'
    AND split_part(name, '/', 1) = (SELECT public.current_school_id())::text
    AND (storage.foldername(name))[5] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "Staff can delete siga files" ON storage.objects;
CREATE POLICY "Staff can delete siga files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'siga-files'
    AND split_part(name, '/', 1) = (SELECT public.current_school_id())::text
    AND (storage.foldername(name))[5] = (SELECT auth.uid())::text
  );

CREATE TABLE IF NOT EXISTS public.siga_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  mime text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 8388608),
  area text NOT NULL CHECK (area IN ('escola', 'secretaria', 'pessoal', 'publico')),
  visibility text NOT NULL CHECK (visibility IN ('private', 'school', 'public')),
  storage_backend text NOT NULL DEFAULT 'sga' CHECK (storage_backend IN ('sga', 'local')),
  storage_path text NOT NULL,
  class_group_id uuid,
  is_folder boolean NOT NULL DEFAULT false,
  parent_id uuid REFERENCES public.siga_files(id) ON DELETE CASCADE,
  title text,
  description text,
  category text CHECK (
    category IS NULL OR category IN (
      'bilhete', 'certificado', 'contrato', 'fatura', 'recibo', 'talao',
      'pauta', 'comunicado', 'material_aula', 'foto', 'outro'
    )
  ),
  document_date date,
  reference_code text,
  related_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  related_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz,
  updated_by uuid REFERENCES auth.users(id),
  last_action text,
  last_action_at timestamptz,
  last_action_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.siga_files
  ADD COLUMN IF NOT EXISTS class_group_id uuid;
ALTER TABLE public.siga_files
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE public.siga_files
  ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.siga_files
  ADD COLUMN IF NOT EXISTS last_action text;
ALTER TABLE public.siga_files
  ADD COLUMN IF NOT EXISTS last_action_at timestamptz;
ALTER TABLE public.siga_files
  ADD COLUMN IF NOT EXISTS last_action_by uuid;
ALTER TABLE public.siga_files
  ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.siga_files
  ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.siga_files
  ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.siga_files
  ADD COLUMN IF NOT EXISTS document_date date;
ALTER TABLE public.siga_files
  ADD COLUMN IF NOT EXISTS reference_code text;
ALTER TABLE public.siga_files
  ADD COLUMN IF NOT EXISTS related_user_id uuid;
ALTER TABLE public.siga_files
  ADD COLUMN IF NOT EXISTS related_person_id uuid;

ALTER TABLE public.siga_files
  ADD COLUMN IF NOT EXISTS is_folder boolean NOT NULL DEFAULT false;
ALTER TABLE public.siga_files
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.siga_files(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS siga_files_school_area_idx
  ON public.siga_files (school_id, area, created_at DESC);

CREATE INDEX IF NOT EXISTS siga_files_parent_idx
  ON public.siga_files (school_id, area, parent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS siga_files_class_idx
  ON public.siga_files (school_id, class_group_id)
  WHERE class_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS siga_files_related_user_idx
  ON public.siga_files (school_id, related_user_id)
  WHERE related_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS siga_files_related_person_idx
  ON public.siga_files (school_id, related_person_id)
  WHERE related_person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS siga_files_reference_idx
  ON public.siga_files (school_id, reference_code)
  WHERE reference_code IS NOT NULL;

ALTER TABLE public.siga_files DROP CONSTRAINT IF EXISTS siga_files_category_check;
ALTER TABLE public.siga_files
  ADD CONSTRAINT siga_files_category_check CHECK (
    category IS NULL OR category IN (
      'bilhete', 'certificado', 'contrato', 'fatura', 'recibo', 'talao',
      'pauta', 'comunicado', 'material_aula', 'foto', 'outro'
    )
  );

CREATE TABLE IF NOT EXISTS public.siga_file_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES public.siga_files(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.siga_file_events DROP CONSTRAINT IF EXISTS siga_file_events_action_check;
ALTER TABLE public.siga_file_events
  ADD CONSTRAINT siga_file_events_action_check CHECK (
    action IN (
      'created',
      'renamed',
      'deleted',
      'opened',
      'downloaded',
      'visibility_changed',
      'linked_class',
      'unlinked_class',
      'metadata_updated',
      'moved',
      'folder_created'
    )
  );

CREATE INDEX IF NOT EXISTS siga_file_events_file_idx
  ON public.siga_file_events (school_id, file_id, created_at DESC);

ALTER TABLE public.siga_file_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_file_events FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.siga_file_events TO authenticated;
GRANT ALL ON public.siga_file_events TO service_role;

DROP POLICY IF EXISTS "Read school file events" ON public.siga_file_events;
CREATE POLICY "Read school file events"
  ON public.siga_file_events
  FOR SELECT TO authenticated
  USING (school_id = (SELECT public.current_school_id()));

DROP POLICY IF EXISTS "Write school file events" ON public.siga_file_events;
CREATE POLICY "Write school file events"
  ON public.siga_file_events
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND actor_user_id = auth.uid()
  );

ALTER TABLE public.siga_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_files FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.siga_files TO authenticated;
GRANT ALL ON public.siga_files TO service_role;

DROP POLICY IF EXISTS "Read school files" ON public.siga_files;
CREATE POLICY "Read school files"
  ON public.siga_files
  FOR SELECT TO authenticated
  USING (school_id = (SELECT public.current_school_id()));

DROP POLICY IF EXISTS "Write school files" ON public.siga_files;
CREATE POLICY "Write school files"
  ON public.siga_files
  FOR ALL TO authenticated
  USING (school_id = (SELECT public.current_school_id()))
  WITH CHECK (school_id = (SELECT public.current_school_id()) AND owner_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Planos de Aula (ciclo 34): documento título/conteúdo/anexo por turma+disciplina
-- +trimestre, com estrutura de avaliações/provas nomeadas pelo professor que se
-- materializa em siga_assessment_items (Centro de Avaliação já existente) — não
-- cria um motor de notas paralelo, só gera os itens nomeados que já alimentam
-- MAC/NPP/NPT via componentAverage + upsertTermGradesBatch.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.siga_lesson_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_group_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  term integer NOT NULL CHECK (term BETWEEN 1 AND 3),
  title text NOT NULL,
  content text,
  file_id uuid REFERENCES public.siga_files(id) ON DELETE SET NULL,
  file_name text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.siga_lesson_plans DROP CONSTRAINT IF EXISTS siga_lesson_plans_status_check;
ALTER TABLE public.siga_lesson_plans
  ADD CONSTRAINT siga_lesson_plans_status_check CHECK (status IN ('draft', 'published'));

CREATE INDEX IF NOT EXISTS siga_lesson_plans_scope_idx
  ON public.siga_lesson_plans (school_id, class_group_id, subject_id, term);

DROP TRIGGER IF EXISTS siga_lesson_plans_set_updated_at ON public.siga_lesson_plans;
CREATE TRIGGER siga_lesson_plans_set_updated_at
  BEFORE UPDATE ON public.siga_lesson_plans
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

ALTER TABLE public.siga_lesson_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_lesson_plans FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.siga_lesson_plans TO authenticated;
GRANT ALL ON public.siga_lesson_plans TO service_role;

DROP POLICY IF EXISTS "Manage lesson plans in own school" ON public.siga_lesson_plans;
CREATE POLICY "Manage lesson plans in own school"
  ON public.siga_lesson_plans
  FOR ALL TO authenticated
  USING (school_id = (SELECT public.current_school_id()))
  WITH CHECK (school_id = (SELECT public.current_school_id()));

CREATE TABLE IF NOT EXISTS public.siga_lesson_plan_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  lesson_plan_id uuid NOT NULL REFERENCES public.siga_lesson_plans(id) ON DELETE CASCADE,
  kind text NOT NULL,
  name text NOT NULL,
  planned_count integer NOT NULL DEFAULT 1,
  sequence integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.siga_lesson_plan_components
  DROP CONSTRAINT IF EXISTS siga_lesson_plan_components_kind_check;
ALTER TABLE public.siga_lesson_plan_components
  ADD CONSTRAINT siga_lesson_plan_components_kind_check CHECK (kind IN ('avaliacao', 'prova'));

ALTER TABLE public.siga_lesson_plan_components
  DROP CONSTRAINT IF EXISTS siga_lesson_plan_components_count_check;
ALTER TABLE public.siga_lesson_plan_components
  ADD CONSTRAINT siga_lesson_plan_components_count_check CHECK (planned_count BETWEEN 1 AND 20);

CREATE INDEX IF NOT EXISTS siga_lesson_plan_components_plan_idx
  ON public.siga_lesson_plan_components (lesson_plan_id, sequence);

ALTER TABLE public.siga_lesson_plan_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_lesson_plan_components FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.siga_lesson_plan_components TO authenticated;
GRANT ALL ON public.siga_lesson_plan_components TO service_role;

DROP POLICY IF EXISTS "Manage lesson plan components in own school" ON public.siga_lesson_plan_components;
CREATE POLICY "Manage lesson plan components in own school"
  ON public.siga_lesson_plan_components
  FOR ALL TO authenticated
  USING (school_id = (SELECT public.current_school_id()))
  WITH CHECK (school_id = (SELECT public.current_school_id()));

-- Liga os itens do Centro de Avaliação gerados por um Plano de Aula de volta à
-- definição que os originou, para conseguir sincronizar (criar/remover) quando o
-- plano é editado, sem nunca apagar um item que já tenha notas lançadas.
ALTER TABLE public.siga_assessment_items
  ADD COLUMN IF NOT EXISTS lesson_plan_component_id uuid
    REFERENCES public.siga_lesson_plan_components(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS siga_assessment_items_plan_component_idx
  ON public.siga_assessment_items (lesson_plan_component_id)
  WHERE lesson_plan_component_id IS NOT NULL;

-- Despesas de caixa: separadas dos recibos SGA para não adulterar a liquidação
-- de faturas. A escrita passa exclusivamente pelos server functions, que validam
-- Administrador/Tesouraria antes de usar o cliente de serviço.
CREATE TABLE IF NOT EXISTS public.siga_cash_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  document_number text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  amount numeric NOT NULL,
  method text NOT NULL DEFAULT 'cash',
  reference text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'posted',
  reversal_reason text,
  reversed_at timestamptz,
  reversed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  UNIQUE (school_id, document_number)
);

ALTER TABLE public.siga_cash_expenses DROP CONSTRAINT IF EXISTS siga_cash_expenses_document_number_check;
ALTER TABLE public.siga_cash_expenses
  ADD CONSTRAINT siga_cash_expenses_document_number_check
  CHECK (document_number = btrim(document_number) AND char_length(document_number) BETWEEN 1 AND 64);

ALTER TABLE public.siga_cash_expenses DROP CONSTRAINT IF EXISTS siga_cash_expenses_description_check;
ALTER TABLE public.siga_cash_expenses
  ADD CONSTRAINT siga_cash_expenses_description_check
  CHECK (description = btrim(description) AND char_length(description) BETWEEN 1 AND 500);

ALTER TABLE public.siga_cash_expenses DROP CONSTRAINT IF EXISTS siga_cash_expenses_category_check;
ALTER TABLE public.siga_cash_expenses
  ADD CONSTRAINT siga_cash_expenses_category_check
  CHECK (category = btrim(category) AND char_length(category) BETWEEN 1 AND 80);

ALTER TABLE public.siga_cash_expenses DROP CONSTRAINT IF EXISTS siga_cash_expenses_amount_check;
ALTER TABLE public.siga_cash_expenses
  ADD CONSTRAINT siga_cash_expenses_amount_check CHECK (amount > 0);

ALTER TABLE public.siga_cash_expenses DROP CONSTRAINT IF EXISTS siga_cash_expenses_method_check;
ALTER TABLE public.siga_cash_expenses
  ADD CONSTRAINT siga_cash_expenses_method_check CHECK (
    method IN ('cash', 'multicaixa', 'transfer', 'express', 'multicaixa_express', 'unitel_money')
  );

ALTER TABLE public.siga_cash_expenses DROP CONSTRAINT IF EXISTS siga_cash_expenses_status_check;
ALTER TABLE public.siga_cash_expenses
  ADD CONSTRAINT siga_cash_expenses_status_check CHECK (status IN ('posted', 'reversed'));

CREATE INDEX IF NOT EXISTS siga_cash_expenses_school_occurred_idx
  ON public.siga_cash_expenses (school_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS siga_cash_expenses_school_category_idx
  ON public.siga_cash_expenses (school_id, category, occurred_at DESC);

DROP TRIGGER IF EXISTS siga_cash_expenses_set_updated_at ON public.siga_cash_expenses;
CREATE TRIGGER siga_cash_expenses_set_updated_at
  BEFORE UPDATE ON public.siga_cash_expenses
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

ALTER TABLE public.siga_cash_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_cash_expenses FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_cash_expenses FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.siga_cash_expenses TO authenticated;
GRANT ALL ON public.siga_cash_expenses TO service_role;

DROP POLICY IF EXISTS "Read school cash expenses" ON public.siga_cash_expenses;
CREATE POLICY "Read school cash expenses"
  ON public.siga_cash_expenses
  FOR SELECT TO authenticated
  USING (school_id = (SELECT public.current_school_id()));

-- Comunicados institucionais: o portal pode ler os da própria escola; criação,
-- edição e arquivo passam pelos server functions, que exigem Administrador/Secretaria.
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'school',
  channel text NOT NULL DEFAULT 'portal',
  status text NOT NULL DEFAULT 'draft',
  scheduled_for date,
  published_at timestamptz,
  archived_at timestamptz,
  priority text NOT NULL DEFAULT 'normal',
  role_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Algumas instalações SGA já tinham a tabela-base antes do módulo. Completar
-- as colunas sem tocar nos comunicados históricos.
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'portal';
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS scheduled_for date;
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);

ALTER TABLE public.announcements DROP CONSTRAINT IF EXISTS announcements_title_check;
ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_title_check
  CHECK (title = btrim(title) AND char_length(title) BETWEEN 2 AND 160);

ALTER TABLE public.announcements DROP CONSTRAINT IF EXISTS announcements_body_check;
ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_body_check
  CHECK (body = btrim(body) AND char_length(body) BETWEEN 2 AND 4000);

ALTER TABLE public.announcements DROP CONSTRAINT IF EXISTS announcements_audience_check;
ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_audience_check CHECK (audience IN ('school'));

ALTER TABLE public.announcements DROP CONSTRAINT IF EXISTS announcements_channel_check;
ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_channel_check CHECK (channel IN ('sms', 'email', 'portal'));

ALTER TABLE public.announcements DROP CONSTRAINT IF EXISTS announcements_status_check;
ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_status_check CHECK (status IN ('draft', 'scheduled', 'published', 'archived'));

ALTER TABLE public.announcements DROP CONSTRAINT IF EXISTS announcements_scheduled_for_check;
ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_scheduled_for_check
  CHECK (status <> 'scheduled' OR scheduled_for IS NOT NULL);

CREATE INDEX IF NOT EXISTS announcements_school_created_idx
  ON public.announcements (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS announcements_school_status_schedule_idx
  ON public.announcements (school_id, status, scheduled_for)
  WHERE status IN ('scheduled', 'published');

DROP TRIGGER IF EXISTS announcements_set_updated_at ON public.announcements;
CREATE TRIGGER announcements_set_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.announcements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;

DROP POLICY IF EXISTS "Read school announcements" ON public.announcements;
CREATE POLICY "Read school announcements"
  ON public.announcements
  FOR SELECT TO authenticated
  USING (school_id = (SELECT public.current_school_id()));

-- Verificação: deve devolver as relações novas.
SELECT c.relname AS tabela
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'enrollment_forms',
    'enrollment_applications',
    'staff_module_grants',
    'calendar_feed_tokens',
    'school_integrations',
    'finance_payment_plans',
    'siga_assessment_items',
    'siga_assessment_scores',
    'siga_direct_messages',
    'siga_files',
    'siga_file_events',
    'person_documents',
    'siga_lesson_plans',
    'siga_lesson_plan_components',
    'siga_cash_expenses',
    'announcements'
  )
ORDER BY 1;
