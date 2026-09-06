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

-- -----------------------------------------------------------------------------
-- Funções Utilitárias de Segurança / RLS (necessárias para policies abaixo)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_school_member(p_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_memberships
    WHERE school_id = p_school_id
      AND user_id = (SELECT auth.uid())
      AND status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_school_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_school_member(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_school_permission(p_school_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.school_memberships sm
    JOIN public.member_roles mr ON mr.membership_id = sm.id
    JOIN public.roles r ON r.id = mr.role_id
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE sm.school_id = p_school_id
      AND sm.user_id = (SELECT auth.uid())
      AND sm.status = 'active'
      AND p.code = p_permission
  ) OR EXISTS (
    SELECT 1
    FROM public.school_memberships sm
    JOIN public.member_roles mr ON mr.membership_id = sm.id
    JOIN public.roles r ON r.id = mr.role_id
    WHERE sm.school_id = p_school_id
      AND sm.user_id = (SELECT auth.uid())
      AND sm.status = 'active'
      AND r.code IN ('owner', 'admin', 'administrator', 'director')
  );
$$;

REVOKE ALL ON FUNCTION public.has_school_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_school_permission(uuid, text) TO authenticated, service_role;

-- Garantir colunas soft-delete para pessoas e alunos
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS deleted_at timestamptz;


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
  USING (public.is_school_member(school_id) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Public read open enrollment forms" ON public.enrollment_forms;
CREATE POLICY "Public read open enrollment forms"
  ON public.enrollment_forms
  FOR SELECT TO anon
  USING (is_open = true AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Manage enrollment forms in own school" ON public.enrollment_forms;
CREATE POLICY "Manage enrollment forms in own school"
  ON public.enrollment_forms
  FOR ALL TO authenticated
  USING (public.is_school_member(school_id) AND deleted_at IS NULL)
  WITH CHECK (public.is_school_member(school_id));

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
  USING (public.is_school_member(school_id) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Update enrollment applications in own school" ON public.enrollment_applications;
CREATE POLICY "Update enrollment applications in own school"
  ON public.enrollment_applications
  FOR UPDATE TO authenticated
  USING (public.is_school_member(school_id) AND deleted_at IS NULL)
  WITH CHECK (public.is_school_member(school_id));

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
  USING (public.is_school_member(school_id));

DROP POLICY IF EXISTS "Admins manage staff grants" ON public.staff_module_grants;
CREATE POLICY "Admins manage staff grants"
  ON public.staff_module_grants
  FOR ALL TO authenticated
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

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
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

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
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

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
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

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
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

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

-- Anexo opcional da biblioteca de arquivos (ciclo 35): mensagem pode ir só com
-- ficheiro, por isso body deixa de ser obrigatório.
ALTER TABLE public.siga_direct_messages ALTER COLUMN body DROP NOT NULL;
ALTER TABLE public.siga_direct_messages
  ADD COLUMN IF NOT EXISTS attachment_file_id uuid REFERENCES public.siga_files(id) ON DELETE SET NULL;
ALTER TABLE public.siga_direct_messages
  ADD COLUMN IF NOT EXISTS attachment_file_name text;

ALTER TABLE public.siga_direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_direct_messages FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.siga_direct_messages TO authenticated;
GRANT ALL ON public.siga_direct_messages TO service_role;

DROP POLICY IF EXISTS "Read own school direct messages" ON public.siga_direct_messages;
CREATE POLICY "Read own school direct messages"
  ON public.siga_direct_messages
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

DROP POLICY IF EXISTS "Send school direct messages" ON public.siga_direct_messages;
CREATE POLICY "Send school direct messages"
  ON public.siga_direct_messages
  FOR INSERT TO authenticated
  WITH CHECK (public.is_school_member(school_id) AND sender_id = auth.uid());

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
  USING (public.is_school_member(school_id));

DROP POLICY IF EXISTS "Manage school person documents" ON public.person_documents;
CREATE POLICY "Manage school person documents"
  ON public.person_documents
  FOR ALL TO authenticated
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

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
  is_system boolean NOT NULL DEFAULT false,
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
ALTER TABLE public.siga_files
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;
ALTER TABLE public.siga_files
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

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

CREATE INDEX IF NOT EXISTS siga_files_system_idx
  ON public.siga_files (school_id)
  WHERE is_system;

-- Todo documento fica ligado a um utilizador; arquivos financeiros = sistema.
UPDATE public.siga_files
SET related_user_id = owner_user_id
WHERE related_user_id IS NULL;

UPDATE public.siga_files
SET is_system = true
WHERE COALESCE(is_system, false) = false
  AND category IN ('recibo', 'talao', 'fatura');

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
      'folder_created',
      'access_denied'
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
  USING (public.is_school_member(school_id));

DROP POLICY IF EXISTS "Write school file events" ON public.siga_file_events;
CREATE POLICY "Write school file events"
  ON public.siga_file_events
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_school_member(school_id)
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
  USING (public.is_school_member(school_id));

DROP POLICY IF EXISTS "Write school files" ON public.siga_files;
CREATE POLICY "Write school files"
  ON public.siga_files
  FOR ALL TO authenticated
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id) AND owner_user_id = auth.uid());

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
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

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
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

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
  USING (public.is_school_member(school_id));

-- Comunicados institucionais: o portal pode ler os da própria escola; criação,
-- edição e arquivo passam pelos server functions, que exigem Administrador/Secretaria.
-- Esta é a tabela canónica do módulo Comunicações e do feed do Dashboard.
CREATE TABLE IF NOT EXISTS public.school_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'all_guardians',
  channel text NOT NULL DEFAULT 'portal',
  status text NOT NULL DEFAULT 'draft',
  scheduled_for date,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT school_announcements_school_id_id_key UNIQUE (school_id, id)
);

-- Algumas instalações SGA já tinham a tabela-base antes do módulo. Completar
-- as colunas sem tocar nos comunicados históricos.
ALTER TABLE public.school_announcements
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'portal';
ALTER TABLE public.school_announcements
  ADD COLUMN IF NOT EXISTS scheduled_for date;
ALTER TABLE public.school_announcements
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);
ALTER TABLE public.school_announcements
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.school_announcements
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

ALTER TABLE public.school_announcements DROP CONSTRAINT IF EXISTS school_announcements_title_check;
ALTER TABLE public.school_announcements
  ADD CONSTRAINT school_announcements_title_check
  CHECK (title = btrim(title) AND char_length(title) BETWEEN 2 AND 160);

ALTER TABLE public.school_announcements DROP CONSTRAINT IF EXISTS school_announcements_body_check;
ALTER TABLE public.school_announcements
  ADD CONSTRAINT school_announcements_body_check
  CHECK (body = btrim(body) AND char_length(body) BETWEEN 2 AND 4000);

ALTER TABLE public.school_announcements DROP CONSTRAINT IF EXISTS school_announcements_audience_check;
ALTER TABLE public.school_announcements
  ADD CONSTRAINT school_announcements_audience_check CHECK (
    audience IN (
      'all_guardians',
      'guardians_with_debt',
      'students_secondary',
      'students_finalists',
      'teaching_staff'
    )
  );

ALTER TABLE public.school_announcements DROP CONSTRAINT IF EXISTS school_announcements_channel_check;
ALTER TABLE public.school_announcements
  ADD CONSTRAINT school_announcements_channel_check
  CHECK (channel IN ('sms', 'email', 'portal'));

ALTER TABLE public.school_announcements DROP CONSTRAINT IF EXISTS school_announcements_status_check;
ALTER TABLE public.school_announcements
  ADD CONSTRAINT school_announcements_status_check
  CHECK (status IN ('draft', 'scheduled', 'sent'));

ALTER TABLE public.school_announcements
  DROP CONSTRAINT IF EXISTS school_announcements_schedule_required;
ALTER TABLE public.school_announcements
  ADD CONSTRAINT school_announcements_schedule_required
  CHECK (status <> 'scheduled' OR scheduled_for IS NOT NULL);

ALTER TABLE public.school_announcements
  DROP CONSTRAINT IF EXISTS school_announcements_sent_published;
ALTER TABLE public.school_announcements
  ADD CONSTRAINT school_announcements_sent_published
  CHECK (status <> 'sent' OR published_at IS NOT NULL);

CREATE INDEX IF NOT EXISTS school_announcements_school_recent_idx
  ON public.school_announcements (school_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS school_announcements_school_status_idx
  ON public.school_announcements (school_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS school_announcements_set_updated_at ON public.school_announcements;
CREATE TRIGGER school_announcements_set_updated_at
  BEFORE UPDATE ON public.school_announcements
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

ALTER TABLE public.school_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_announcements FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_announcements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.school_announcements TO authenticated;
GRANT ALL ON public.school_announcements TO service_role;

DROP POLICY IF EXISTS "Read school announcements" ON public.school_announcements;
DROP POLICY IF EXISTS "Read school announcements in own school" ON public.school_announcements;
DROP POLICY IF EXISTS "Create school announcements in own school" ON public.school_announcements;
DROP POLICY IF EXISTS "Update school announcements in own school" ON public.school_announcements;
CREATE POLICY "Read school announcements"
  ON public.school_announcements
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id) AND deleted_at IS NULL);

-- Realtime necessário para actualizar Comunicações, Dashboard e Documentos.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'school_announcements'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.school_announcements;
    END IF;

    IF to_regclass('public.document_requests') IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'document_requests'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.document_requests;
    END IF;
  END IF;
END
$$;

-- ============================================================================
-- MOTOR CENTRAL DE IMPORTAÇÃO DE DADOS ESCOLARES (STAGING, AUDIT & JOBS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  module text NOT NULL,
  file_name text NOT NULL,
  file_path text,
  status text NOT NULL DEFAULT 'uploaded',
  total_rows integer NOT NULL DEFAULT 0,
  valid_rows integer NOT NULL DEFAULT 0,
  invalid_rows integer NOT NULL DEFAULT 0,
  duplicate_rows integer NOT NULL DEFAULT 0,
  inserted_rows integer NOT NULL DEFAULT 0,
  updated_rows integer NOT NULL DEFAULT 0,
  ignored_rows integer NOT NULL DEFAULT 0,
  job_metadata jsonb DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.import_jobs DROP CONSTRAINT IF EXISTS import_jobs_status_check;
ALTER TABLE public.import_jobs
  ADD CONSTRAINT import_jobs_status_check CHECK (status IN (
    'uploaded', 'analyzing', 'mapping', 'validating', 'ready', 'importing', 'completed', 'failed', 'cancelled', 'rolled_back'
  ));

CREATE INDEX IF NOT EXISTS import_jobs_school_idx ON public.import_jobs (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS import_jobs_module_idx ON public.import_jobs (school_id, module, created_at DESC);

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_jobs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.import_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.import_jobs TO authenticated;
GRANT ALL ON public.import_jobs TO service_role;

DROP POLICY IF EXISTS "Read school import jobs" ON public.import_jobs;
CREATE POLICY "Read school import jobs"
  ON public.import_jobs
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

CREATE TABLE IF NOT EXISTS public.import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id uuid NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  sheet_name text NOT NULL DEFAULT 'Sheet1',
  row_number integer NOT NULL,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'valid',
  warnings jsonb DEFAULT '[]'::jsonb,
  errors jsonb DEFAULT '[]'::jsonb,
  duplicate_of uuid,
  target_record_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.import_rows DROP CONSTRAINT IF EXISTS import_rows_status_check;
ALTER TABLE public.import_rows
  ADD CONSTRAINT import_rows_status_check CHECK (status IN (
    'valid', 'warning', 'error', 'duplicate', 'will_update', 'will_insert', 'ignored', 'imported'
  ));

CREATE INDEX IF NOT EXISTS import_rows_job_idx ON public.import_rows (import_job_id, row_number);
CREATE INDEX IF NOT EXISTS import_rows_status_idx ON public.import_rows (import_job_id, status);

ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_rows FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.import_rows FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.import_rows TO authenticated;
GRANT ALL ON public.import_rows TO service_role;

DROP POLICY IF EXISTS "Read school import rows" ON public.import_rows;
CREATE POLICY "Read school import rows"
  ON public.import_rows
  FOR SELECT TO authenticated
  USING (
    import_job_id IN (
      SELECT j.id FROM public.import_jobs j WHERE public.is_school_member(j.school_id)
    )
  );

CREATE TABLE IF NOT EXISTS public.import_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  module text NOT NULL,
  name text NOT NULL,
  header_signature jsonb NOT NULL DEFAULT '[]'::jsonb,
  mappings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS import_templates_school_idx ON public.import_templates (school_id, module);

ALTER TABLE public.import_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_templates FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.import_templates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.import_templates TO authenticated;
GRANT ALL ON public.import_templates TO service_role;

DROP POLICY IF EXISTS "Read school import templates" ON public.import_templates;
CREATE POLICY "Read school import templates"
  ON public.import_templates
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

CREATE TABLE IF NOT EXISTS public.import_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id uuid NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  row_id uuid REFERENCES public.import_rows(id) ON DELETE SET NULL,
  table_name text NOT NULL,
  target_id uuid NOT NULL,
  action_type text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.import_audits DROP CONSTRAINT IF EXISTS import_audits_action_check;
ALTER TABLE public.import_audits
  ADD CONSTRAINT import_audits_action_check CHECK (action_type IN ('inserted', 'updated', 'deleted'));

CREATE INDEX IF NOT EXISTS import_audits_job_idx ON public.import_audits (import_job_id);

ALTER TABLE public.import_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_audits FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.import_audits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.import_audits TO authenticated;
GRANT ALL ON public.import_audits TO service_role;

DROP POLICY IF EXISTS "Read school import audits" ON public.import_audits;
CREATE POLICY "Read school import audits"
  ON public.import_audits
  FOR SELECT TO authenticated
  USING (
    import_job_id IN (
      SELECT j.id FROM public.import_jobs j WHERE public.is_school_member(j.school_id)
    )
  );

-- ============================================================================
-- MÓDULO DE PRESENÇAS RIGOROSAS POR AULA, AUDITORIA E JUSTIFICAÇÕES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.siga_attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  class_group_id uuid NOT NULL REFERENCES public.class_groups(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES public.teachers(id) ON DELETE SET NULL,
  timetable_slot_id uuid REFERENCES public.timetable_slots(id) ON DELETE SET NULL,
  lesson_date date NOT NULL DEFAULT CURRENT_DATE,
  period_number integer NOT NULL DEFAULT 1,
  starts_at text,
  ends_at text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS siga_attendance_sessions_school_class_date_idx
  ON public.siga_attendance_sessions (school_id, class_group_id, lesson_date DESC);
CREATE INDEX IF NOT EXISTS siga_attendance_sessions_teacher_date_idx
  ON public.siga_attendance_sessions (school_id, teacher_id, lesson_date DESC);

ALTER TABLE public.siga_attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_attendance_sessions FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.siga_attendance_sessions TO authenticated;
GRANT ALL ON public.siga_attendance_sessions TO service_role;

DROP POLICY IF EXISTS "Manage attendance sessions in own school" ON public.siga_attendance_sessions;
CREATE POLICY "Manage attendance sessions in own school"
  ON public.siga_attendance_sessions
  FOR ALL TO authenticated
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

CREATE TABLE IF NOT EXISTS public.siga_attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.siga_attendance_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_registered' CHECK (status IN ('present', 'absent', 'excused', 'late', 'early_exit', 'not_registered')),
  notes text,
  recorded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS siga_attendance_records_student_idx
  ON public.siga_attendance_records (school_id, student_id, created_at DESC);

ALTER TABLE public.siga_attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_attendance_records FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.siga_attendance_records TO authenticated;
GRANT ALL ON public.siga_attendance_records TO service_role;

DROP POLICY IF EXISTS "Manage attendance records in own school" ON public.siga_attendance_records;
CREATE POLICY "Manage attendance records in own school"
  ON public.siga_attendance_records
  FOR ALL TO authenticated
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

CREATE TABLE IF NOT EXISTS public.siga_attendance_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.siga_attendance_sessions(id) ON DELETE CASCADE,
  attendance_record_id uuid REFERENCES public.siga_attendance_records(id) ON DELETE SET NULL,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  old_status text NOT NULL,
  new_status text NOT NULL,
  reason text NOT NULL,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  device_info text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS siga_attendance_audits_session_idx
  ON public.siga_attendance_audits (school_id, session_id, created_at DESC);

ALTER TABLE public.siga_attendance_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_attendance_audits FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.siga_attendance_audits TO authenticated;
GRANT ALL ON public.siga_attendance_audits TO service_role;

DROP POLICY IF EXISTS "Read attendance audits in own school" ON public.siga_attendance_audits;
CREATE POLICY "Read attendance audits in own school"
  ON public.siga_attendance_audits
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

CREATE TABLE IF NOT EXISTS public.siga_attendance_justifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  attendance_record_id uuid REFERENCES public.siga_attendance_records(id) ON DELETE SET NULL,
  session_id uuid REFERENCES public.siga_attendance_sessions(id) ON DELETE SET NULL,
  reason text NOT NULL,
  file_id uuid REFERENCES public.siga_files(id) ON DELETE SET NULL,
  file_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_by uuid NOT NULL REFERENCES auth.users(id),
  reviewed_by uuid REFERENCES auth.users(id),
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS siga_attendance_justifications_student_idx
  ON public.siga_attendance_justifications (school_id, student_id, created_at DESC);

ALTER TABLE public.siga_attendance_justifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_attendance_justifications FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.siga_attendance_justifications TO authenticated;
GRANT ALL ON public.siga_attendance_justifications TO service_role;

DROP POLICY IF EXISTS "Manage attendance justifications in own school" ON public.siga_attendance_justifications;
CREATE POLICY "Manage attendance justifications in own school"
  ON public.siga_attendance_justifications
  FOR ALL TO authenticated
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

-- ============================================================================
-- CATRACAS DE ACESSO, CARTÕES VIRTUAIS & CONTROLO DE RECINTO
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.siga_access_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  card_number text NOT NULL,
  barcode text NOT NULL,
  qr_secret text NOT NULL DEFAULT gen_random_uuid()::text,
  rfid_tag text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'lost', 'expired')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT siga_access_cards_number_key UNIQUE (school_id, card_number)
);

CREATE INDEX IF NOT EXISTS siga_access_cards_person_idx
  ON public.siga_access_cards (school_id, person_id);
CREATE INDEX IF NOT EXISTS siga_access_cards_student_idx
  ON public.siga_access_cards (school_id, student_id);

ALTER TABLE public.siga_access_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_access_cards FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.siga_access_cards TO authenticated;
GRANT ALL ON public.siga_access_cards TO service_role;

DROP POLICY IF EXISTS "Access cards in own school" ON public.siga_access_cards;
CREATE POLICY "Access cards in own school"
  ON public.siga_access_cards
  FOR ALL TO authenticated
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

CREATE TABLE IF NOT EXISTS public.siga_turnstile_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  location text NOT NULL,
  device_type text NOT NULL DEFAULT 'turnstile' CHECK (device_type IN ('turnstile', 'gate', 'door', 'scanner_app')),
  direction_capability text NOT NULL DEFAULT 'bidirectional' CHECK (direction_capability IN ('entry', 'exit', 'bidirectional')),
  ip_address text,
  mac_address text,
  api_key text,
  status text NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'offline', 'maintenance')),
  last_ping_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS siga_turnstile_devices_school_idx
  ON public.siga_turnstile_devices (school_id, status);

ALTER TABLE public.siga_turnstile_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_turnstile_devices FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.siga_turnstile_devices TO authenticated;
GRANT ALL ON public.siga_turnstile_devices TO service_role;

DROP POLICY IF EXISTS "Turnstile devices in own school" ON public.siga_turnstile_devices;
CREATE POLICY "Turnstile devices in own school"
  ON public.siga_turnstile_devices
  FOR ALL TO authenticated
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

CREATE TABLE IF NOT EXISTS public.siga_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  card_id uuid REFERENCES public.siga_access_cards(id) ON DELETE SET NULL,
  device_id uuid REFERENCES public.siga_turnstile_devices(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('entry', 'exit')),
  status text NOT NULL CHECK (status IN ('granted', 'denied')),
  denial_reason text,
  device_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS siga_access_logs_school_person_idx
  ON public.siga_access_logs (school_id, person_id, created_at DESC);
CREATE INDEX IF NOT EXISTS siga_access_logs_student_idx
  ON public.siga_access_logs (school_id, student_id, created_at DESC);

ALTER TABLE public.siga_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_access_logs FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.siga_access_logs TO authenticated;
GRANT ALL ON public.siga_access_logs TO service_role;

DROP POLICY IF EXISTS "Access logs in own school" ON public.siga_access_logs;
CREATE POLICY "Access logs in own school"
  ON public.siga_access_logs
  FOR ALL TO authenticated
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

-- ---------------------------------------------------------------------------
-- MULTI-TENANT & RBAC ENTERPRISE: Memberships, Papéis, Permissões e Convites
-- ---------------------------------------------------------------------------

-- 1. school_memberships
CREATE TABLE IF NOT EXISTS public.school_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended', 'archived', 'inactive')),
  joined_at timestamptz DEFAULT now(),
  invited_at timestamptz,
  activated_at timestamptz DEFAULT now(),
  suspended_at timestamptz,
  last_access_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.school_memberships ADD COLUMN IF NOT EXISTS joined_at timestamptz DEFAULT now();
ALTER TABLE public.school_memberships ADD COLUMN IF NOT EXISTS invited_at timestamptz;
ALTER TABLE public.school_memberships ADD COLUMN IF NOT EXISTS activated_at timestamptz DEFAULT now();
ALTER TABLE public.school_memberships ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
ALTER TABLE public.school_memberships ADD COLUMN IF NOT EXISTS last_access_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS school_memberships_school_user_idx
  ON public.school_memberships (school_id, user_id);

CREATE INDEX IF NOT EXISTS school_memberships_user_status_idx
  ON public.school_memberships (user_id, status);

CREATE INDEX IF NOT EXISTS school_memberships_school_status_idx
  ON public.school_memberships (school_id, status);

DROP TRIGGER IF EXISTS school_memberships_set_updated_at ON public.school_memberships;
CREATE TRIGGER school_memberships_set_updated_at
  BEFORE UPDATE ON public.school_memberships
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.school_memberships TO authenticated;
GRANT ALL ON public.school_memberships TO service_role;
ALTER TABLE public.school_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_memberships FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own memberships" ON public.school_memberships;
CREATE POLICY "Users can read own memberships"
  ON public.school_memberships FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_school_member(school_id));

-- 2. roles
CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS roles_school_code_idx ON public.roles (school_id, code);

-- 3. permissions
CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  module text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. role_permissions
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, permission_id)
);

-- 5. member_roles
CREATE TABLE IF NOT EXISTS public.member_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES public.school_memberships(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (membership_id, role_id)
);

GRANT SELECT ON public.roles TO authenticated;
GRANT ALL ON public.roles TO service_role;
GRANT SELECT ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_roles TO authenticated;
GRANT ALL ON public.member_roles TO service_role;

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read roles authenticated" ON public.roles;
CREATE POLICY "Read roles authenticated" ON public.roles
  FOR SELECT TO authenticated USING (school_id IS NULL OR public.is_school_member(school_id));

DROP POLICY IF EXISTS "Read permissions authenticated" ON public.permissions;
CREATE POLICY "Read permissions authenticated" ON public.permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Read role_permissions authenticated" ON public.role_permissions;
CREATE POLICY "Read role_permissions authenticated" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Read member_roles in own school" ON public.member_roles;
CREATE POLICY "Read member_roles in own school" ON public.member_roles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.school_memberships sm
      WHERE sm.id = public.member_roles.membership_id
        AND (sm.user_id = (SELECT auth.uid()) OR public.is_school_member(sm.school_id))
    )
  );

-- 6. school_invitations
CREATE TABLE IF NOT EXISTS public.school_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  email text NOT NULL,
  role_code text NOT NULL DEFAULT 'teacher',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS school_invitations_school_email_idx
  ON public.school_invitations (school_id, lower(email));
CREATE INDEX IF NOT EXISTS school_invitations_token_hash_idx
  ON public.school_invitations (token_hash)
  WHERE status = 'pending';

DROP TRIGGER IF EXISTS school_invitations_set_updated_at ON public.school_invitations;
CREATE TRIGGER school_invitations_set_updated_at
  BEFORE UPDATE ON public.school_invitations
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.school_invitations TO authenticated;
GRANT ALL ON public.school_invitations TO service_role;
ALTER TABLE public.school_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_invitations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Manage invitations in own school" ON public.school_invitations;
CREATE POLICY "Manage invitations in own school" ON public.school_invitations
  FOR ALL TO authenticated
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

-- 7. Funções Utilitárias de Segurança / RLS
CREATE OR REPLACE FUNCTION public.is_school_member(p_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_memberships
    WHERE school_id = p_school_id
      AND user_id = (SELECT auth.uid())
      AND status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_school_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_school_member(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_school_permission(p_school_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.school_memberships sm
    JOIN public.member_roles mr ON mr.membership_id = sm.id
    JOIN public.roles r ON r.id = mr.role_id
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE sm.school_id = p_school_id
      AND sm.user_id = (SELECT auth.uid())
      AND sm.status = 'active'
      AND p.code = p_permission
  ) OR EXISTS (
    SELECT 1
    FROM public.school_memberships sm
    JOIN public.member_roles mr ON mr.membership_id = sm.id
    JOIN public.roles r ON r.id = mr.role_id
    WHERE sm.school_id = p_school_id
      AND sm.user_id = (SELECT auth.uid())
      AND sm.status = 'active'
      AND r.code IN ('owner', 'admin', 'administrator', 'director')
  );
$$;

REVOKE ALL ON FUNCTION public.has_school_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_school_permission(uuid, text) TO authenticated, service_role;

-- =============================================================================
-- Histórico de estados académicos (Ciclo 55)
-- Auditoria append-only de transições: candidato → activo → transferido/etc.
-- O código escreve via admin client; a leitura usa membership da escola.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.student_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  previous_status text,
  new_status text NOT NULL,
  reason text,
  changed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_status_history_student_fkey'
  ) THEN
    ALTER TABLE public.student_status_history
      ADD CONSTRAINT student_status_history_student_fkey
      FOREIGN KEY (school_id, student_id)
      REFERENCES public.students (school_id, id)
      ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS student_status_history_student_idx
  ON public.student_status_history (school_id, student_id, created_at DESC);

ALTER TABLE public.student_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_status_history FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.student_status_history TO authenticated;
GRANT ALL ON public.student_status_history TO service_role;

DROP POLICY IF EXISTS "Read student status history in own school" ON public.student_status_history;
DROP POLICY IF EXISTS "School members can access student status history" ON public.student_status_history;
CREATE POLICY "School members can access student status history" ON public.student_status_history
  FOR ALL TO authenticated
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

-- =============================================================================
-- Histórico escolar anterior (Ciclo 55c — importador historico_academico)
-- Registos de anos/classes de proveniência, distintos das matrículas activas.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.student_academic_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  academic_year_label text NOT NULL,
  grade_level text NOT NULL,
  previous_school text,
  final_average numeric(5,2),
  outcome text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_academic_history_student_fkey'
  ) THEN
    ALTER TABLE public.student_academic_history
      ADD CONSTRAINT student_academic_history_student_fkey
      FOREIGN KEY (school_id, student_id)
      REFERENCES public.students (school_id, id)
      ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS student_academic_history_unique_year_grade_idx
  ON public.student_academic_history (school_id, student_id, academic_year_label, grade_level);

CREATE INDEX IF NOT EXISTS student_academic_history_student_idx
  ON public.student_academic_history (school_id, student_id, created_at DESC);

ALTER TABLE public.student_academic_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_academic_history FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.student_academic_history TO authenticated;
GRANT ALL ON public.student_academic_history TO service_role;

DROP POLICY IF EXISTS "School members can access student academic history" ON public.student_academic_history;
CREATE POLICY "School members can access student academic history" ON public.student_academic_history
  FOR ALL TO authenticated
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

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
    'school_announcements',
    'import_jobs',
    'import_rows',
    'import_templates',
    'import_audits',
    'siga_attendance_sessions',
    'siga_attendance_records',
    'siga_attendance_audits',
    'siga_attendance_justifications',
    'school_memberships',
    'roles',
    'permissions',
    'role_permissions',
    'member_roles',
    'school_invitations',
    'student_status_history',
    'student_academic_history'
  )
ORDER BY 1;

-- =============================================================================
-- FASE 14 — ÍNDICES COMPOSTOS DE PERFORMANCE (Multi-Tenant & Queries Críticas)
-- Idempotentes: CREATE INDEX IF NOT EXISTS
-- =============================================================================

-- ─── people ──────────────────────────────────────────────────────────────────
-- Listagem de pessoas activas por escola (filtros frequentes: activo/inactivo)
CREATE INDEX IF NOT EXISTS people_school_status_idx
  ON public.people (school_id, status)
  WHERE deleted_at IS NULL;

-- ─── students ─────────────────────────────────────────────────────────────────
-- Listagem e exportação de alunos por escola e estado
CREATE INDEX IF NOT EXISTS students_school_status_idx
  ON public.students (school_id, status)
  WHERE deleted_at IS NULL;

-- ─── enrollments ──────────────────────────────────────────────────────────────
-- Dashboard e pautas: escola → ano lectivo → status (active/cancelled)
CREATE INDEX IF NOT EXISTS enrollments_school_year_status_idx
  ON public.enrollments (school_id, academic_year_id, status);

-- Histórico e relatórios: criação mais recente por escola
CREATE INDEX IF NOT EXISTS enrollments_school_created_desc_idx
  ON public.enrollments (school_id, created_at DESC);

-- ─── finance_invoices ─────────────────────────────────────────────────────────
-- Tesouraria: faturas pendentes ou vencidas por escola
CREATE INDEX IF NOT EXISTS finance_invoices_school_status_idx
  ON public.finance_invoices (school_id, status);

-- Relatórios financeiros: facturas recentes por escola
CREATE INDEX IF NOT EXISTS finance_invoices_school_created_desc_idx
  ON public.finance_invoices (school_id, created_at DESC);

-- ─── school_memberships ───────────────────────────────────────────────────────
-- Resolução rápida do contexto activo: (school_id, user_id) já tem UNIQUE;
-- este índice adicional optimiza a direcção inversa (listar escolas de um user)
CREATE INDEX IF NOT EXISTS school_memberships_user_status_idx
  ON public.school_memberships (user_id, status);

-- ─── member_roles ─────────────────────────────────────────────────────────────
-- Resolução de papéis por membership (usado em current_profile_role e has_school_permission)
CREATE INDEX IF NOT EXISTS member_roles_membership_role_idx
  ON public.member_roles (membership_id, role_id);

-- ─── school_invitations ───────────────────────────────────────────────────────
-- Listagem de convites pendentes por escola e data (painel Acessos)
CREATE INDEX IF NOT EXISTS school_invitations_school_created_desc_idx
  ON public.school_invitations (school_id, created_at DESC)
  WHERE status = 'pending';

-- ─── school_announcements ─────────────────────────────────────────────────────
-- O índice parcial school_announcements_school_recent_idx é criado com a tabela
-- e cobre os comunicados activos por escola (Dashboard + Comunicações).

-- ─── siga_files ───────────────────────────────────────────────────────────────
-- Biblioteca de arquivos: escola → pasta recente
CREATE INDEX IF NOT EXISTS siga_files_school_created_desc_idx
  ON public.siga_files (school_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- ─── roles ────────────────────────────────────────────────────────────────────
-- Lookup de papel por escola e código (único, mas índice explícito para planners)
CREATE INDEX IF NOT EXISTS roles_school_code_idx
  ON public.roles (school_id, code);

-- Verificação: listar índices criados neste bloco
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'people_school_status_idx',
    'students_school_status_idx',
    'enrollments_school_year_status_idx',
    'enrollments_school_created_desc_idx',
    'finance_invoices_school_status_idx',
    'finance_invoices_school_created_desc_idx',
    'school_memberships_user_status_idx',
    'member_roles_membership_role_idx',
    'school_invitations_school_created_desc_idx',
    'announcements_school_created_desc_idx',
    'siga_files_school_created_desc_idx',
    'roles_school_code_idx'
  )
ORDER BY tablename, indexname;

-- =============================================================================
-- Ciclo 56 — RH / Folha Salarial / Assiduidade docente (2026-09-06)
-- Fonte: supabase/migrations/20260906*_hr_*.sql + hardening pós-revisão
-- =============================================================================

-- >>> BEGIN 20260906124500_hr_payroll_foundation.sql
-- SIGA / Onsoft — RH e Folha Salarial (fundação)
-- Reutiliza public.people + public.person_roles como fonte única de identidade.
-- Não altera nem substitui tabelas financeiras existentes.

-- ---------------------------------------------------------------------------
-- Departamentos / unidades funcionais
-- ---------------------------------------------------------------------------
CREATE TABLE public.hr_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  name text NOT NULL,
  code text,
  description text,
  parent_department_id uuid REFERENCES public.hr_departments(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX hr_departments_school_name_idx
  ON public.hr_departments (school_id, lower(name)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX hr_departments_school_code_idx
  ON public.hr_departments (school_id, lower(code))
  WHERE deleted_at IS NULL AND code IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Cargos / funções
-- ---------------------------------------------------------------------------
CREATE TABLE public.hr_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  department_id uuid REFERENCES public.hr_departments(id),
  name text NOT NULL,
  code text,
  category text NOT NULL DEFAULT 'staff' CHECK (category IN (
    'teacher', 'staff', 'director', 'management', 'support', 'other'
  )),
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX hr_positions_school_name_idx
  ON public.hr_positions (school_id, lower(name)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX hr_positions_school_code_idx
  ON public.hr_positions (school_id, lower(code))
  WHERE deleted_at IS NULL AND code IS NOT NULL;
CREATE INDEX hr_positions_department_idx
  ON public.hr_positions (department_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Vínculo funcional. Uma pessoa pode ter histórico de vários vínculos.
-- ---------------------------------------------------------------------------
CREATE TABLE public.hr_employments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  person_id uuid NOT NULL REFERENCES public.people(id),
  position_id uuid REFERENCES public.hr_positions(id),
  department_id uuid REFERENCES public.hr_departments(id),
  employee_number text,
  employment_type text NOT NULL CHECK (employment_type IN (
    'permanent', 'fixed_term', 'service_provider', 'intern', 'temporary', 'other'
  )),
  status text NOT NULL DEFAULT 'active' CHECK (status IN (
    'draft', 'active', 'suspended', 'terminated', 'expired'
  )),
  hire_date date NOT NULL,
  termination_date date,
  work_location text,
  weekly_hours numeric(6,2) CHECK (weekly_hours IS NULL OR weekly_hours >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CHECK (termination_date IS NULL OR termination_date >= hire_date)
);

CREATE UNIQUE INDEX hr_employments_school_employee_number_idx
  ON public.hr_employments (school_id, employee_number)
  WHERE deleted_at IS NULL AND employee_number IS NOT NULL;
CREATE INDEX hr_employments_school_person_idx
  ON public.hr_employments (school_id, person_id) WHERE deleted_at IS NULL;
CREATE INDEX hr_employments_school_status_idx
  ON public.hr_employments (school_id, status) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Contratos e regra de remuneração.
-- salary_type permite salário mensal, hora geral ou hora/aula.
-- ---------------------------------------------------------------------------
CREATE TABLE public.hr_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  employment_id uuid NOT NULL REFERENCES public.hr_employments(id),
  contract_number text,
  contract_type text NOT NULL CHECK (contract_type IN (
    'permanent', 'fixed_term', 'service_provider', 'intern', 'temporary', 'other'
  )),
  salary_type text NOT NULL CHECK (salary_type IN ('monthly', 'hourly', 'lesson_hour')),
  base_salary_kz numeric(14,2) NOT NULL DEFAULT 0 CHECK (base_salary_kz >= 0),
  hourly_rate_kz numeric(14,2) CHECK (hourly_rate_kz IS NULL OR hourly_rate_kz >= 0),
  lesson_hour_rate_kz numeric(14,2) CHECK (lesson_hour_rate_kz IS NULL OR lesson_hour_rate_kz >= 0),
  currency char(3) NOT NULL DEFAULT 'AOA' CHECK (currency = 'AOA'),
  starts_on date NOT NULL,
  ends_on date,
  payment_day smallint CHECK (payment_day BETWEEN 1 AND 31),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'active', 'suspended', 'ended', 'cancelled'
  )),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CHECK (
    (salary_type = 'monthly')
    OR (salary_type = 'hourly' AND hourly_rate_kz IS NOT NULL)
    OR (salary_type = 'lesson_hour' AND lesson_hour_rate_kz IS NOT NULL)
  )
);

CREATE UNIQUE INDEX hr_contracts_school_number_idx
  ON public.hr_contracts (school_id, contract_number)
  WHERE deleted_at IS NULL AND contract_number IS NOT NULL;
CREATE INDEX hr_contracts_employment_idx
  ON public.hr_contracts (employment_id) WHERE deleted_at IS NULL;
CREATE INDEX hr_contracts_school_status_idx
  ON public.hr_contracts (school_id, status) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Eventos remuneráveis: horas/aulas validadas, horas extra e ajustes positivos.
-- A ligação a horário/aula é feita por source_type/source_id para evitar acoplar
-- esta fundação a uma tabela académica específica antes da integração seguinte.
-- ---------------------------------------------------------------------------
CREATE TABLE public.hr_compensation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  employment_id uuid NOT NULL REFERENCES public.hr_employments(id),
  contract_id uuid REFERENCES public.hr_contracts(id),
  event_date date NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'worked_hour', 'lesson_hour', 'overtime', 'allowance', 'bonus', 'adjustment'
  )),
  quantity numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_rate_kz numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_rate_kz >= 0),
  amount_kz numeric(14,2) GENERATED ALWAYS AS (round(quantity * unit_rate_kz, 2)) STORED,
  source_type text,
  source_id uuid,
  description text,
  validation_status text NOT NULL DEFAULT 'pending' CHECK (validation_status IN (
    'pending', 'validated', 'rejected', 'cancelled'
  )),
  validated_at timestamptz,
  validated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX hr_compensation_events_payroll_idx
  ON public.hr_compensation_events (school_id, event_date, validation_status)
  WHERE deleted_at IS NULL;
CREATE INDEX hr_compensation_events_employment_idx
  ON public.hr_compensation_events (employment_id, event_date)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX hr_compensation_events_source_idx
  ON public.hr_compensation_events (school_id, source_type, source_id, employment_id, event_type)
  WHERE deleted_at IS NULL AND source_type IS NOT NULL AND source_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Folhas salariais por competência.
-- ---------------------------------------------------------------------------
CREATE TABLE public.hr_payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  competence_year integer NOT NULL CHECK (competence_year BETWEEN 2000 AND 2200),
  competence_month smallint NOT NULL CHECK (competence_month BETWEEN 1 AND 12),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'calculating', 'review', 'approved', 'processing', 'paid', 'cancelled'
  )),
  total_gross_kz numeric(16,2) NOT NULL DEFAULT 0 CHECK (total_gross_kz >= 0),
  total_deductions_kz numeric(16,2) NOT NULL DEFAULT 0 CHECK (total_deductions_kz >= 0),
  total_net_kz numeric(16,2) NOT NULL DEFAULT 0 CHECK (total_net_kz >= 0),
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  CHECK (period_end >= period_start),
  UNIQUE (school_id, competence_year, competence_month)
);

CREATE INDEX hr_payroll_runs_school_status_idx
  ON public.hr_payroll_runs (school_id, status, competence_year DESC, competence_month DESC);

CREATE TABLE public.hr_payroll_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  payroll_run_id uuid NOT NULL REFERENCES public.hr_payroll_runs(id) ON DELETE CASCADE,
  employment_id uuid NOT NULL REFERENCES public.hr_employments(id),
  contract_id uuid REFERENCES public.hr_contracts(id),
  base_amount_kz numeric(14,2) NOT NULL DEFAULT 0,
  hourly_amount_kz numeric(14,2) NOT NULL DEFAULT 0,
  allowances_kz numeric(14,2) NOT NULL DEFAULT 0,
  bonuses_kz numeric(14,2) NOT NULL DEFAULT 0,
  overtime_kz numeric(14,2) NOT NULL DEFAULT 0,
  deductions_kz numeric(14,2) NOT NULL DEFAULT 0,
  gross_amount_kz numeric(14,2) NOT NULL DEFAULT 0,
  net_amount_kz numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'calculated', 'approved', 'processing', 'paid', 'cancelled'
  )),
  calculation_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (payroll_run_id, employment_id),
  CHECK (gross_amount_kz >= 0),
  CHECK (deductions_kz >= 0),
  CHECK (net_amount_kz >= 0)
);

CREATE INDEX hr_payroll_items_employment_idx
  ON public.hr_payroll_items (school_id, employment_id, payroll_run_id);

-- Componentes detalhados da folha: salário, subsídio, bónus, imposto/desconto etc.
CREATE TABLE public.hr_payroll_item_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  payroll_item_id uuid NOT NULL REFERENCES public.hr_payroll_items(id) ON DELETE CASCADE,
  component_type text NOT NULL CHECK (component_type IN ('earning', 'deduction')),
  code text NOT NULL,
  name text NOT NULL,
  amount_kz numeric(14,2) NOT NULL CHECK (amount_kz >= 0),
  source_type text,
  source_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX hr_payroll_components_item_idx
  ON public.hr_payroll_item_components (payroll_item_id);

-- ---------------------------------------------------------------------------
-- Integridade multi-tenant entre FKs de domínio.
-- Impede referenciar uma pessoa/cargo/contrato de outra escola mesmo que o UUID
-- seja conhecido. Funções de trigger são SECURITY INVOKER.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_assert_same_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school uuid;
BEGIN
  IF TG_TABLE_NAME = 'hr_positions' AND NEW.department_id IS NOT NULL THEN
    SELECT school_id INTO v_school FROM public.hr_departments WHERE id = NEW.department_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school department reference'; END IF;
  ELSIF TG_TABLE_NAME = 'hr_employments' THEN
    SELECT school_id INTO v_school FROM public.people WHERE id = NEW.person_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school person reference'; END IF;
    IF NEW.position_id IS NOT NULL THEN
      SELECT school_id INTO v_school FROM public.hr_positions WHERE id = NEW.position_id;
      IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school position reference'; END IF;
    END IF;
    IF NEW.department_id IS NOT NULL THEN
      SELECT school_id INTO v_school FROM public.hr_departments WHERE id = NEW.department_id;
      IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school department reference'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'hr_contracts' THEN
    SELECT school_id INTO v_school FROM public.hr_employments WHERE id = NEW.employment_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school employment reference'; END IF;
  ELSIF TG_TABLE_NAME = 'hr_compensation_events' THEN
    SELECT school_id INTO v_school FROM public.hr_employments WHERE id = NEW.employment_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school employment reference'; END IF;
    IF NEW.contract_id IS NOT NULL THEN
      SELECT school_id INTO v_school FROM public.hr_contracts WHERE id = NEW.contract_id;
      IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school contract reference'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'hr_payroll_items' THEN
    SELECT school_id INTO v_school FROM public.hr_payroll_runs WHERE id = NEW.payroll_run_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school payroll reference'; END IF;
    SELECT school_id INTO v_school FROM public.hr_employments WHERE id = NEW.employment_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school employment reference'; END IF;
  ELSIF TG_TABLE_NAME = 'hr_payroll_item_components' THEN
    SELECT school_id INTO v_school FROM public.hr_payroll_items WHERE id = NEW.payroll_item_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school payroll item reference'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER hr_positions_same_school BEFORE INSERT OR UPDATE ON public.hr_positions
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_same_school();
CREATE TRIGGER hr_employments_same_school BEFORE INSERT OR UPDATE ON public.hr_employments
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_same_school();
CREATE TRIGGER hr_contracts_same_school BEFORE INSERT OR UPDATE ON public.hr_contracts
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_same_school();
CREATE TRIGGER hr_compensation_events_same_school BEFORE INSERT OR UPDATE ON public.hr_compensation_events
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_same_school();
CREATE TRIGGER hr_payroll_items_same_school BEFORE INSERT OR UPDATE ON public.hr_payroll_items
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_same_school();
CREATE TRIGGER hr_payroll_components_same_school BEFORE INSERT OR UPDATE ON public.hr_payroll_item_components
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_same_school();

-- Consistência do departamento-pai.
CREATE OR REPLACE FUNCTION public.hr_assert_department_parent_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE v_school uuid;
BEGIN
  IF NEW.parent_department_id IS NOT NULL THEN
    IF NEW.parent_department_id = NEW.id THEN RAISE EXCEPTION 'Department cannot be its own parent'; END IF;
    SELECT school_id INTO v_school FROM public.hr_departments WHERE id = NEW.parent_department_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school parent department reference'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER hr_departments_parent_same_school BEFORE INSERT OR UPDATE ON public.hr_departments
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_department_parent_school();

-- updated_at/version conforme convenção já existente no SIGA.
CREATE TRIGGER hr_departments_set_updated_at BEFORE UPDATE ON public.hr_departments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER hr_positions_set_updated_at BEFORE UPDATE ON public.hr_positions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER hr_employments_set_updated_at BEFORE UPDATE ON public.hr_employments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER hr_contracts_set_updated_at BEFORE UPDATE ON public.hr_contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER hr_compensation_events_set_updated_at BEFORE UPDATE ON public.hr_compensation_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER hr_payroll_runs_set_updated_at BEFORE UPDATE ON public.hr_payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER hr_payroll_items_set_updated_at BEFORE UPDATE ON public.hr_payroll_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

-- ---------------------------------------------------------------------------
-- RLS: mesma política multi-tenant utilizada pelo módulo Pessoas.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hr_departments','hr_positions','hr_employments','hr_contracts',
    'hr_compensation_events','hr_payroll_runs','hr_payroll_items',
    'hr_payroll_item_components'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_school_member(school_id))',
      'Read ' || t || ' in own school', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_school_member(school_id) AND created_by = (SELECT auth.uid()))',
      'Create ' || t || ' in own school', t
    );
  END LOOP;
END $$;

-- Tabelas com updated_by suportam UPDATE com isolamento por escola.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hr_departments','hr_positions','hr_employments','hr_contracts',
    'hr_compensation_events','hr_payroll_runs','hr_payroll_items'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_school_member(school_id)) WITH CHECK (public.is_school_member(school_id))',
      'Update ' || t || ' in own school', t
    );
  END LOOP;
END $$;

-- Componentes são imutáveis por UPDATE nesta primeira fase; correções devem ser
-- feitas por recálculo do item enquanto a folha estiver em draft/review.

-- ---------------------------------------------------------------------------
-- Função de cálculo inicial de um item mensal.
-- Soma apenas eventos validados dentro do período da folha e mantém o cálculo
-- auditável em calculation_details. Descontos legais serão acrescentados em
-- migração própria, para não codificar taxas fiscais sem configuração versionada.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_calculate_payroll_item(
  p_payroll_run_id uuid,
  p_employment_id uuid
)
RETURNS public.hr_payroll_items
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_run public.hr_payroll_runs;
  v_emp public.hr_employments;
  v_contract public.hr_contracts;
  v_base numeric(14,2) := 0;
  v_hourly numeric(14,2) := 0;
  v_allowances numeric(14,2) := 0;
  v_bonuses numeric(14,2) := 0;
  v_overtime numeric(14,2) := 0;
  v_gross numeric(14,2) := 0;
  v_item public.hr_payroll_items;
BEGIN
  SELECT * INTO v_run FROM public.hr_payroll_runs WHERE id = p_payroll_run_id;
  IF NOT FOUND OR NOT public.is_school_member(v_run.school_id) THEN
    RAISE EXCEPTION 'Payroll run not accessible';
  END IF;
  IF v_run.status NOT IN ('draft', 'calculating', 'review') THEN
    RAISE EXCEPTION 'Payroll run is locked for calculation';
  END IF;

  SELECT * INTO v_emp FROM public.hr_employments
  WHERE id = p_employment_id AND school_id = v_run.school_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employment not found in payroll school'; END IF;

  SELECT * INTO v_contract
  FROM public.hr_contracts
  WHERE employment_id = p_employment_id
    AND school_id = v_run.school_id
    AND deleted_at IS NULL
    AND status = 'active'
    AND starts_on <= v_run.period_end
    AND (ends_on IS NULL OR ends_on >= v_run.period_start)
  ORDER BY starts_on DESC, created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN RAISE EXCEPTION 'No active contract for payroll period'; END IF;

  IF v_contract.salary_type = 'monthly' THEN
    v_base := v_contract.base_salary_kz;
  END IF;

  SELECT
    COALESCE(sum(amount_kz) FILTER (WHERE event_type IN ('worked_hour','lesson_hour')), 0),
    COALESCE(sum(amount_kz) FILTER (WHERE event_type = 'allowance'), 0),
    COALESCE(sum(amount_kz) FILTER (WHERE event_type = 'bonus'), 0),
    COALESCE(sum(amount_kz) FILTER (WHERE event_type = 'overtime'), 0)
  INTO v_hourly, v_allowances, v_bonuses, v_overtime
  FROM public.hr_compensation_events
  WHERE school_id = v_run.school_id
    AND employment_id = p_employment_id
    AND event_date BETWEEN v_run.period_start AND v_run.period_end
    AND validation_status = 'validated'
    AND deleted_at IS NULL;

  v_gross := v_base + v_hourly + v_allowances + v_bonuses + v_overtime;

  INSERT INTO public.hr_payroll_items (
    school_id, payroll_run_id, employment_id, contract_id,
    base_amount_kz, hourly_amount_kz, allowances_kz, bonuses_kz, overtime_kz,
    deductions_kz, gross_amount_kz, net_amount_kz, status,
    calculation_details, created_by, updated_by
  ) VALUES (
    v_run.school_id, v_run.id, v_emp.id, v_contract.id,
    v_base, v_hourly, v_allowances, v_bonuses, v_overtime,
    0, v_gross, v_gross, 'calculated',
    jsonb_build_object(
      'salary_type', v_contract.salary_type,
      'contract_id', v_contract.id,
      'calculated_at', now(),
      'period_start', v_run.period_start,
      'period_end', v_run.period_end
    ),
    auth.uid(), auth.uid()
  )
  ON CONFLICT (payroll_run_id, employment_id) DO UPDATE SET
    contract_id = EXCLUDED.contract_id,
    base_amount_kz = EXCLUDED.base_amount_kz,
    hourly_amount_kz = EXCLUDED.hourly_amount_kz,
    allowances_kz = EXCLUDED.allowances_kz,
    bonuses_kz = EXCLUDED.bonuses_kz,
    overtime_kz = EXCLUDED.overtime_kz,
    deductions_kz = EXCLUDED.deductions_kz,
    gross_amount_kz = EXCLUDED.gross_amount_kz,
    net_amount_kz = EXCLUDED.net_amount_kz,
    status = EXCLUDED.status,
    calculation_details = EXCLUDED.calculation_details,
    updated_by = auth.uid()
  RETURNING * INTO v_item;

  RETURN v_item;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_calculate_payroll_item(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_calculate_payroll_item(uuid, uuid) TO authenticated;

COMMENT ON TABLE public.hr_employments IS 'Vínculos laborais sobre a entidade central public.people.';
COMMENT ON TABLE public.hr_contracts IS 'Contratos e regras de remuneração mensal, por hora ou hora/aula.';
COMMENT ON TABLE public.hr_compensation_events IS 'Eventos remuneráveis validados, preparados para integração com presença/horário.';
COMMENT ON TABLE public.hr_payroll_runs IS 'Folhas salariais mensais por escola.';
COMMENT ON FUNCTION public.hr_calculate_payroll_item(uuid, uuid) IS 'Calcula/recalcula um item de folha sem aplicar descontos fiscais não configurados.';

-- >>> END 20260906124500_hr_payroll_foundation.sql

-- >>> BEGIN 20260906133000_hr_teacher_timetable_bridge.sql
-- SIGA / Onsoft — ponte RH ↔ Professores ↔ Horários
-- Depende da fundação de RH (20260906124500) e do modelo académico actual
-- teachers -> class_subjects -> timetable_slots.
-- Um horário programado NÃO gera pagamento sozinho. A ocorrência precisa de
-- confirmação/evidência antes de ser transformada em hr_compensation_events.

-- ---------------------------------------------------------------------------
-- Vínculo explícito entre a ficha académica do professor e o vínculo funcional.
-- Evita inferências frágeis e permite histórico/controlos administrativos.
-- ---------------------------------------------------------------------------
CREATE TABLE public.hr_teacher_employment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id),
  employment_id uuid NOT NULL REFERENCES public.hr_employments(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  starts_on date NOT NULL DEFAULT CURRENT_DATE,
  ends_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

CREATE UNIQUE INDEX hr_teacher_employment_active_teacher_idx
  ON public.hr_teacher_employment_links (school_id, teacher_id)
  WHERE deleted_at IS NULL AND status = 'active';
CREATE UNIQUE INDEX hr_teacher_employment_active_employment_idx
  ON public.hr_teacher_employment_links (school_id, employment_id)
  WHERE deleted_at IS NULL AND status = 'active';

-- ---------------------------------------------------------------------------
-- Ocorrência concreta de uma aula. timetable_slots é semanal/recorrente;
-- esta tabela materializa a aula numa data real e guarda a prova de execução.
-- evidence_method já prevê QR sem obrigar a implementação do leitor nesta fase.
-- ---------------------------------------------------------------------------
CREATE TABLE public.hr_teacher_lesson_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  timetable_slot_id uuid NOT NULL REFERENCES public.timetable_slots(id),
  class_subject_id uuid NOT NULL REFERENCES public.class_subjects(id),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id),
  employment_id uuid NOT NULL REFERENCES public.hr_employments(id),
  contract_id uuid REFERENCES public.hr_contracts(id),
  lesson_date date NOT NULL,
  scheduled_starts_at time NOT NULL,
  scheduled_ends_at time NOT NULL,
  actual_started_at timestamptz,
  actual_ended_at timestamptz,
  quantity numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'confirmed', 'rejected', 'cancelled'
  )),
  evidence_method text CHECK (evidence_method IS NULL OR evidence_method IN (
    'manual', 'qr', 'attendance_import', 'system'
  )),
  evidence_ref text,
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES auth.users(id),
  compensation_event_id uuid REFERENCES public.hr_compensation_events(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CHECK (scheduled_ends_at > scheduled_starts_at),
  CHECK (actual_ended_at IS NULL OR actual_started_at IS NULL OR actual_ended_at >= actual_started_at),
  CHECK (
    status <> 'confirmed'
    OR (evidence_method IS NOT NULL AND confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL)
  )
);

CREATE UNIQUE INDEX hr_teacher_lesson_occurrence_slot_date_idx
  ON public.hr_teacher_lesson_occurrences (school_id, timetable_slot_id, lesson_date)
  WHERE deleted_at IS NULL;
CREATE INDEX hr_teacher_lesson_occurrence_teacher_date_idx
  ON public.hr_teacher_lesson_occurrences (school_id, teacher_id, lesson_date, status)
  WHERE deleted_at IS NULL;
CREATE INDEX hr_teacher_lesson_occurrence_payroll_idx
  ON public.hr_teacher_lesson_occurrences (school_id, employment_id, lesson_date, status)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Integridade: tudo deve pertencer à mesma escola e o slot deve apontar para a
-- mesma class_subject/teacher que originou a ocorrência.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_assert_teacher_lesson_same_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school uuid;
  v_slot_subject uuid;
  v_subject_teacher uuid;
BEGIN
  SELECT school_id, class_subject_id
    INTO v_school, v_slot_subject
  FROM public.timetable_slots
  WHERE id = NEW.timetable_slot_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'HR cross-school timetable slot reference';
  END IF;
  IF v_slot_subject IS DISTINCT FROM NEW.class_subject_id THEN
    RAISE EXCEPTION 'HR timetable slot/class subject mismatch';
  END IF;

  SELECT school_id, teacher_id
    INTO v_school, v_subject_teacher
  FROM public.class_subjects
  WHERE id = NEW.class_subject_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'HR cross-school class subject reference';
  END IF;
  IF v_subject_teacher IS DISTINCT FROM NEW.teacher_id THEN
    RAISE EXCEPTION 'HR class subject/teacher mismatch';
  END IF;

  SELECT school_id INTO v_school FROM public.teachers WHERE id = NEW.teacher_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'HR cross-school teacher reference';
  END IF;

  SELECT school_id INTO v_school FROM public.hr_employments WHERE id = NEW.employment_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'HR cross-school employment reference';
  END IF;

  IF NEW.contract_id IS NOT NULL THEN
    SELECT school_id INTO v_school FROM public.hr_contracts WHERE id = NEW.contract_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION 'HR cross-school contract reference';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.hr_assert_teacher_employment_link_same_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school uuid;
BEGIN
  SELECT school_id INTO v_school FROM public.teachers WHERE id = NEW.teacher_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'HR cross-school teacher reference';
  END IF;
  SELECT school_id INTO v_school FROM public.hr_employments WHERE id = NEW.employment_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'HR cross-school employment reference';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER hr_teacher_employment_link_same_school
  BEFORE INSERT OR UPDATE ON public.hr_teacher_employment_links
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_teacher_employment_link_same_school();

CREATE TRIGGER hr_teacher_lesson_same_school
  BEFORE INSERT OR UPDATE ON public.hr_teacher_lesson_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_teacher_lesson_same_school();

CREATE TRIGGER hr_teacher_employment_links_set_updated_at
  BEFORE UPDATE ON public.hr_teacher_employment_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER hr_teacher_lesson_occurrences_set_updated_at
  BEFORE UPDATE ON public.hr_teacher_lesson_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

-- ---------------------------------------------------------------------------
-- Confirmação atómica: apenas uma aula confirmada e com contrato lesson_hour
-- activo pode criar o evento remunerável. Idempotente por compensation_event_id.
-- A chamada operacional ficará no servidor autenticado do módulo RH.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_confirm_teacher_lesson(
  p_occurrence_id uuid,
  p_evidence_method text,
  p_evidence_ref text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_occ public.hr_teacher_lesson_occurrences%ROWTYPE;
  v_rate numeric(14,2);
  v_event_id uuid;
BEGIN
  IF p_evidence_method NOT IN ('manual', 'qr', 'attendance_import', 'system') THEN
    RAISE EXCEPTION 'Invalid lesson evidence method';
  END IF;

  SELECT * INTO v_occ
  FROM public.hr_teacher_lesson_occurrences
  WHERE id = p_occurrence_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Lesson occurrence not found'; END IF;
  IF v_occ.school_id IS DISTINCT FROM (SELECT public.current_school_id()) THEN
    RAISE EXCEPTION 'Lesson occurrence outside current school';
  END IF;
  IF v_occ.compensation_event_id IS NOT NULL THEN
    RETURN v_occ.compensation_event_id;
  END IF;
  IF v_occ.status IN ('rejected', 'cancelled') THEN
    RAISE EXCEPTION 'Rejected/cancelled lesson cannot be paid';
  END IF;
  IF v_occ.contract_id IS NULL THEN
    RAISE EXCEPTION 'Lesson occurrence has no payroll contract';
  END IF;

  SELECT lesson_hour_rate_kz INTO v_rate
  FROM public.hr_contracts
  WHERE id = v_occ.contract_id
    AND school_id = v_occ.school_id
    AND employment_id = v_occ.employment_id
    AND salary_type = 'lesson_hour'
    AND status = 'active'
    AND deleted_at IS NULL
    AND starts_on <= v_occ.lesson_date
    AND (ends_on IS NULL OR ends_on >= v_occ.lesson_date);

  IF v_rate IS NULL THEN
    RAISE EXCEPTION 'No active lesson-hour contract for this occurrence';
  END IF;

  INSERT INTO public.hr_compensation_events (
    school_id, employment_id, contract_id, event_date, event_type,
    quantity, unit_rate_kz, source_type, source_id, description,
    validation_status, validated_at, validated_by, created_by
  ) VALUES (
    v_occ.school_id, v_occ.employment_id, v_occ.contract_id, v_occ.lesson_date,
    'lesson_hour', v_occ.quantity, v_rate, 'teacher_lesson_occurrence', v_occ.id,
    'Aula confirmada a partir do horário académico', 'validated', now(),
    (SELECT auth.uid()), (SELECT auth.uid())
  )
  ON CONFLICT (school_id, source_type, source_id, employment_id, event_type)
    WHERE deleted_at IS NULL AND source_type IS NOT NULL AND source_id IS NOT NULL
  DO UPDATE SET updated_by = (SELECT auth.uid())
  RETURNING id INTO v_event_id;

  UPDATE public.hr_teacher_lesson_occurrences
  SET status = 'confirmed',
      evidence_method = p_evidence_method,
      evidence_ref = NULLIF(btrim(p_evidence_ref), ''),
      confirmed_at = now(),
      confirmed_by = (SELECT auth.uid()),
      compensation_event_id = v_event_id,
      updated_by = (SELECT auth.uid())
  WHERE id = v_occ.id;

  RETURN v_event_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_confirm_teacher_lesson(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_confirm_teacher_lesson(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS: dados salariais/operacionais apenas Administração/Tesouraria nesta fase.
-- O professor receberá posteriormente uma visão limitada às próprias ocorrências.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.hr_teacher_employment_links TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.hr_teacher_lesson_occurrences TO authenticated;
GRANT ALL ON public.hr_teacher_employment_links TO service_role;
GRANT ALL ON public.hr_teacher_lesson_occurrences TO service_role;

ALTER TABLE public.hr_teacher_employment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_teacher_employment_links FORCE ROW LEVEL SECURITY;
ALTER TABLE public.hr_teacher_lesson_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_teacher_lesson_occurrences FORCE ROW LEVEL SECURITY;

CREATE POLICY "HR reads teacher employment links in own school"
  ON public.hr_teacher_employment_links FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
    AND deleted_at IS NULL
  );
CREATE POLICY "HR creates teacher employment links in own school"
  ON public.hr_teacher_employment_links FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  );
CREATE POLICY "HR updates teacher employment links in own school"
  ON public.hr_teacher_employment_links FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  );

CREATE POLICY "HR reads teacher lesson occurrences in own school"
  ON public.hr_teacher_lesson_occurrences FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
    AND deleted_at IS NULL
  );
CREATE POLICY "HR creates teacher lesson occurrences in own school"
  ON public.hr_teacher_lesson_occurrences FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  );
CREATE POLICY "HR updates teacher lesson occurrences in own school"
  ON public.hr_teacher_lesson_occurrences FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  );

NOTIFY pgrst, 'reload schema';

-- >>> END 20260906133000_hr_teacher_timetable_bridge.sql

-- >>> BEGIN 20260906141000_hr_teacher_qr_attendance.sql
-- SIGA / Onsoft — presença do professor por QR temporário
-- Complementa a ponte RH ↔ horários sem transformar um simples slot semanal em pagamento.
-- O QR é um desafio efémero por ocorrência e propósito (check-in/check-out).

CREATE TABLE public.hr_teacher_qr_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  occurrence_id uuid NOT NULL REFERENCES public.hr_teacher_lesson_occurrences(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('check_in', 'check_out')),
  token_hash text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (expires_at > issued_at),
  CHECK ((status = 'used') = (used_at IS NOT NULL))
);

CREATE UNIQUE INDEX hr_teacher_qr_sessions_token_hash_idx
  ON public.hr_teacher_qr_sessions (token_hash);
CREATE INDEX hr_teacher_qr_sessions_occurrence_idx
  ON public.hr_teacher_qr_sessions (school_id, occurrence_id, purpose, status, expires_at DESC);

CREATE OR REPLACE FUNCTION public.hr_assert_teacher_qr_same_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school uuid;
BEGIN
  SELECT school_id INTO v_school
  FROM public.hr_teacher_lesson_occurrences
  WHERE id = NEW.occurrence_id;

  IF v_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'HR cross-school QR occurrence reference';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER hr_teacher_qr_same_school
  BEFORE INSERT OR UPDATE ON public.hr_teacher_qr_sessions
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_teacher_qr_same_school();

-- Expira automaticamente desafios antigos antes de emitir/usar novos.
CREATE OR REPLACE FUNCTION public.hr_expire_teacher_qr_sessions(p_occurrence_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.hr_teacher_qr_sessions
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at <= now()
    AND (p_occurrence_id IS NULL OR occurrence_id = p_occurrence_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_expire_teacher_qr_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_expire_teacher_qr_sessions(uuid) TO service_role;

-- Resgate atómico do QR pelo professor autenticado.
-- No check-in marca início real. No check-out marca fim real e confirma a aula,
-- gerando o evento remunerável apenas se existir contrato lesson_hour activo.
CREATE OR REPLACE FUNCTION public.hr_redeem_teacher_qr(
  p_token_hash text
)
RETURNS TABLE (
  occurrence_id uuid,
  purpose text,
  compensation_event_id uuid,
  occurrence_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_session public.hr_teacher_qr_sessions%ROWTYPE;
  v_occ public.hr_teacher_lesson_occurrences%ROWTYPE;
  v_teacher_user uuid;
  v_rate numeric(14,2);
  v_event_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_token_hash IS NULL OR char_length(p_token_hash) < 32 THEN
    RAISE EXCEPTION 'Invalid QR token';
  END IF;

  PERFORM public.hr_expire_teacher_qr_sessions(NULL);

  SELECT * INTO v_session
  FROM public.hr_teacher_qr_sessions
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'QR challenge not found'; END IF;
  IF v_session.status <> 'active' OR v_session.expires_at <= now() THEN
    RAISE EXCEPTION 'QR challenge expired or unavailable';
  END IF;

  SELECT * INTO v_occ
  FROM public.hr_teacher_lesson_occurrences
  WHERE id = v_session.occurrence_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Lesson occurrence not found'; END IF;
  IF v_occ.status IN ('rejected', 'cancelled') THEN
    RAISE EXCEPTION 'Lesson occurrence is not eligible for attendance';
  END IF;

  SELECT user_id INTO v_teacher_user
  FROM public.teachers
  WHERE id = v_occ.teacher_id
    AND school_id = v_occ.school_id
    AND status = 'active';

  IF v_teacher_user IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'QR challenge belongs to another teacher';
  END IF;

  IF v_session.purpose = 'check_in' THEN
    IF v_occ.actual_started_at IS NOT NULL THEN
      RAISE EXCEPTION 'Teacher already checked in for this lesson';
    END IF;

    UPDATE public.hr_teacher_lesson_occurrences
    SET actual_started_at = now(),
        evidence_method = 'qr',
        evidence_ref = v_session.id::text,
        updated_by = v_user_id
    WHERE id = v_occ.id;

  ELSIF v_session.purpose = 'check_out' THEN
    IF v_occ.actual_started_at IS NULL THEN
      RAISE EXCEPTION 'Check-in is required before check-out';
    END IF;
    IF v_occ.actual_ended_at IS NOT NULL THEN
      RAISE EXCEPTION 'Teacher already checked out for this lesson';
    END IF;
    IF v_occ.contract_id IS NULL THEN
      RAISE EXCEPTION 'Lesson occurrence has no payroll contract';
    END IF;

    SELECT lesson_hour_rate_kz INTO v_rate
    FROM public.hr_contracts
    WHERE id = v_occ.contract_id
      AND school_id = v_occ.school_id
      AND employment_id = v_occ.employment_id
      AND salary_type = 'lesson_hour'
      AND status = 'active'
      AND deleted_at IS NULL
      AND starts_on <= v_occ.lesson_date
      AND (ends_on IS NULL OR ends_on >= v_occ.lesson_date);

    IF v_rate IS NULL THEN
      RAISE EXCEPTION 'No active lesson-hour contract for this occurrence';
    END IF;

    INSERT INTO public.hr_compensation_events (
      school_id, employment_id, contract_id, event_date, event_type,
      quantity, unit_rate_kz, source_type, source_id, description,
      validation_status, validated_at, validated_by, created_by
    ) VALUES (
      v_occ.school_id, v_occ.employment_id, v_occ.contract_id, v_occ.lesson_date,
      'lesson_hour', v_occ.quantity, v_rate, 'teacher_lesson_occurrence', v_occ.id,
      'Aula confirmada por check-in/check-out QR', 'validated', now(),
      v_user_id, v_user_id
    )
    ON CONFLICT (school_id, source_type, source_id, employment_id, event_type)
      WHERE deleted_at IS NULL AND source_type IS NOT NULL AND source_id IS NOT NULL
    DO UPDATE SET updated_by = v_user_id
    RETURNING id INTO v_event_id;

    UPDATE public.hr_teacher_lesson_occurrences
    SET actual_ended_at = now(),
        status = 'confirmed',
        evidence_method = 'qr',
        evidence_ref = v_session.id::text,
        confirmed_at = now(),
        confirmed_by = v_user_id,
        compensation_event_id = v_event_id,
        updated_by = v_user_id
    WHERE id = v_occ.id;
  END IF;

  UPDATE public.hr_teacher_qr_sessions
  SET status = 'used', used_at = now(), used_by = v_user_id
  WHERE id = v_session.id;

  RETURN QUERY
  SELECT v_occ.id,
         v_session.purpose,
         CASE WHEN v_session.purpose = 'check_out' THEN v_event_id ELSE NULL::uuid END,
         CASE WHEN v_session.purpose = 'check_out' THEN 'confirmed'::text ELSE 'scheduled'::text END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_redeem_teacher_qr(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_redeem_teacher_qr(text) TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.hr_teacher_qr_sessions TO authenticated;
GRANT ALL ON public.hr_teacher_qr_sessions TO service_role;
ALTER TABLE public.hr_teacher_qr_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_teacher_qr_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY "HR reads teacher QR sessions in own school"
  ON public.hr_teacher_qr_sessions FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  );

CREATE POLICY "HR creates teacher QR sessions in own school"
  ON public.hr_teacher_qr_sessions FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  );

CREATE POLICY "HR updates teacher QR sessions in own school"
  ON public.hr_teacher_qr_sessions FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  );

COMMENT ON TABLE public.hr_teacher_qr_sessions IS
  'Desafios QR temporários e de uso único para check-in/check-out do professor em uma ocorrência concreta de aula.';

NOTIFY pgrst, 'reload schema';

-- >>> END 20260906141000_hr_teacher_qr_attendance.sql

-- >>> BEGIN 20260906150000_hr_materialize_teacher_lessons.sql
-- SIGA / Onsoft — materialização automática de ocorrências docentes
-- Gera ocorrências concretas a partir de timetable_slots apenas em dias lectivos
-- válidos do calendário académico, excluindo feriados cadastrados em calendar_events.

CREATE OR REPLACE FUNCTION public.hr_materialize_teacher_lessons(
  p_from date,
  p_to date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school_id uuid := (SELECT public.current_school_id());
  v_role text := (SELECT public.current_profile_role());
  v_inserted integer := 0;
BEGIN
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'School context required'; END IF;
  IF v_role NOT IN ('Administrador', 'Tesouraria') THEN
    RAISE EXCEPTION 'Insufficient HR permission';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'Invalid materialization range';
  END IF;
  IF (p_to - p_from) > 31 THEN
    RAISE EXCEPTION 'Materialization range cannot exceed 31 days';
  END IF;

  INSERT INTO public.hr_teacher_lesson_occurrences (
    school_id,
    timetable_slot_id,
    class_subject_id,
    teacher_id,
    employment_id,
    contract_id,
    lesson_date,
    scheduled_starts_at,
    scheduled_ends_at,
    quantity,
    status,
    created_by
  )
  SELECT
    v_school_id,
    ts.id,
    cs.id,
    cs.teacher_id,
    link.employment_id,
    contract.id,
    d::date,
    ts.starts_at,
    ts.ends_at,
    1,
    'scheduled',
    (SELECT auth.uid())
  FROM generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') AS g(d)
  JOIN public.timetable_slots ts
    ON ts.school_id = v_school_id
   AND ts.status = 'active'
   AND ts.weekday = EXTRACT(ISODOW FROM d)::integer
  JOIN public.class_subjects cs
    ON cs.id = ts.class_subject_id
   AND cs.school_id = v_school_id
   AND cs.status = 'active'
   AND cs.teacher_id IS NOT NULL
  JOIN public.class_groups cg
    ON cg.id = cs.class_group_id
   AND cg.school_id = v_school_id
   AND cg.status = 'active'
  JOIN public.terms term
    ON term.school_id = v_school_id
   AND term.academic_year_id = cg.academic_year_id
   AND d::date BETWEEN term.starts_on AND term.ends_on
  JOIN public.hr_teacher_employment_links link
    ON link.school_id = v_school_id
   AND link.teacher_id = cs.teacher_id
   AND link.status = 'active'
   AND link.deleted_at IS NULL
   AND link.starts_on <= d::date
   AND (link.ends_on IS NULL OR link.ends_on >= d::date)
  JOIN LATERAL (
    SELECT hc.id
    FROM public.hr_contracts hc
    WHERE hc.school_id = v_school_id
      AND hc.employment_id = link.employment_id
      AND hc.salary_type = 'lesson_hour'
      AND hc.status = 'active'
      AND hc.deleted_at IS NULL
      AND hc.starts_on <= d::date
      AND (hc.ends_on IS NULL OR hc.ends_on >= d::date)
    ORDER BY hc.starts_on DESC, hc.created_at DESC
    LIMIT 1
  ) contract ON true
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.calendar_events ce
    WHERE ce.school_id = v_school_id
      AND ce.deleted_at IS NULL
      AND ce.category = 'holiday'
      AND d::date BETWEEN ce.event_date AND COALESCE(ce.ends_on, ce.event_date)
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_materialize_teacher_lessons(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_materialize_teacher_lessons(date, date) TO authenticated;

COMMENT ON FUNCTION public.hr_materialize_teacher_lessons(date, date) IS
  'Materializa ocorrências docentes por horário, trimestre, feriados, vínculo RH e contrato hora/aula; idempotente por slot/data.';

NOTIFY pgrst, 'reload schema';

-- >>> END 20260906150000_hr_materialize_teacher_lessons.sql

-- >>> BEGIN 20260906154500_hr_teacher_lesson_exceptions.sql
-- SIGA / Onsoft — exceções de aula, substituições e tolerâncias de presença
-- Complementa o fluxo horário -> ocorrência -> QR -> remuneração sem criar um motor paralelo.

-- ---------------------------------------------------------------------------
-- Política de tolerância por escola.
-- Fora da tolerância, o padrão seguro é revisão manual antes de gerar pagamento.
-- ---------------------------------------------------------------------------
CREATE TABLE public.hr_teacher_attendance_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  name text NOT NULL DEFAULT 'Política padrão',
  late_grace_minutes integer NOT NULL DEFAULT 10 CHECK (late_grace_minutes BETWEEN 0 AND 120),
  early_leave_grace_minutes integer NOT NULL DEFAULT 10 CHECK (early_leave_grace_minutes BETWEEN 0 AND 120),
  minimum_attendance_percent numeric(5,2) NOT NULL DEFAULT 80
    CHECK (minimum_attendance_percent BETWEEN 0 AND 100),
  outside_grace_mode text NOT NULL DEFAULT 'review'
    CHECK (outside_grace_mode IN ('review', 'proportional')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX hr_teacher_attendance_policy_active_school_idx
  ON public.hr_teacher_attendance_policies (school_id)
  WHERE active AND deleted_at IS NULL;

CREATE TRIGGER hr_teacher_attendance_policies_set_updated_at
  BEFORE UPDATE ON public.hr_teacher_attendance_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

-- ---------------------------------------------------------------------------
-- A ocorrência passa a distinguir aula normal, substituição e extraordinária.
-- timetable_slot_id fica opcional apenas para aula extraordinária.
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_teacher_lesson_occurrences
  ALTER COLUMN timetable_slot_id DROP NOT NULL,
  ADD COLUMN occurrence_kind text NOT NULL DEFAULT 'scheduled'
    CHECK (occurrence_kind IN ('scheduled', 'substitution', 'extra')),
  ADD COLUMN original_teacher_id uuid REFERENCES public.teachers(id),
  ADD COLUMN adjustment_reason text,
  ADD COLUMN late_minutes integer NOT NULL DEFAULT 0 CHECK (late_minutes >= 0),
  ADD COLUMN early_leave_minutes integer NOT NULL DEFAULT 0 CHECK (early_leave_minutes >= 0),
  ADD COLUMN attendance_percent numeric(5,2) CHECK (attendance_percent IS NULL OR attendance_percent BETWEEN 0 AND 100),
  ADD COLUMN payable_quantity numeric(10,2) CHECK (payable_quantity IS NULL OR payable_quantity >= 0),
  ADD COLUMN attendance_exception_status text NOT NULL DEFAULT 'none'
    CHECK (attendance_exception_status IN ('none', 'within_grace', 'proportional', 'pending_review', 'approved', 'rejected'));

DROP INDEX IF EXISTS public.hr_teacher_lesson_occurrence_slot_date_idx;
CREATE UNIQUE INDEX hr_teacher_lesson_occurrence_slot_date_idx
  ON public.hr_teacher_lesson_occurrences (school_id, timetable_slot_id, lesson_date)
  WHERE deleted_at IS NULL AND timetable_slot_id IS NOT NULL;

CREATE INDEX hr_teacher_lesson_exception_idx
  ON public.hr_teacher_lesson_occurrences (school_id, attendance_exception_status, lesson_date)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Integridade actualizada: substituto pode diferir do professor da disciplina,
-- desde que original_teacher_id preserve o professor originalmente atribuído.
-- Aula extra mantém class_subject e professor normal, mas não exige timetable_slot.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_assert_teacher_lesson_same_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school uuid;
  v_slot_subject uuid;
  v_subject_teacher uuid;
BEGIN
  IF NEW.timetable_slot_id IS NOT NULL THEN
    SELECT school_id, class_subject_id INTO v_school, v_slot_subject
    FROM public.timetable_slots WHERE id = NEW.timetable_slot_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION 'HR cross-school timetable slot reference';
    END IF;
    IF v_slot_subject IS DISTINCT FROM NEW.class_subject_id THEN
      RAISE EXCEPTION 'HR timetable slot/class subject mismatch';
    END IF;
  ELSIF NEW.occurrence_kind <> 'extra' THEN
    RAISE EXCEPTION 'Only extra lessons may omit timetable slot';
  END IF;

  SELECT school_id, teacher_id INTO v_school, v_subject_teacher
  FROM public.class_subjects WHERE id = NEW.class_subject_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'HR cross-school class subject reference';
  END IF;

  IF NEW.occurrence_kind = 'substitution' THEN
    IF NEW.original_teacher_id IS NULL OR NEW.original_teacher_id IS DISTINCT FROM v_subject_teacher THEN
      RAISE EXCEPTION 'Substitution must preserve original assigned teacher';
    END IF;
  ELSIF NEW.teacher_id IS DISTINCT FROM v_subject_teacher THEN
    RAISE EXCEPTION 'HR class subject/teacher mismatch';
  END IF;

  SELECT school_id INTO v_school FROM public.teachers WHERE id = NEW.teacher_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'HR cross-school teacher reference';
  END IF;

  IF NEW.original_teacher_id IS NOT NULL THEN
    SELECT school_id INTO v_school FROM public.teachers WHERE id = NEW.original_teacher_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION 'HR cross-school original teacher reference';
    END IF;
  END IF;

  SELECT school_id INTO v_school FROM public.hr_employments WHERE id = NEW.employment_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'HR cross-school employment reference';
  END IF;

  IF NEW.contract_id IS NOT NULL THEN
    SELECT school_id INTO v_school FROM public.hr_contracts WHERE id = NEW.contract_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION 'HR cross-school contract reference';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Substituição formal: troca apenas a ocorrência concreta. O horário base e a
-- atribuição académica original não são alterados.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_assign_teacher_substitute(
  p_occurrence_id uuid,
  p_substitute_teacher_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_occ public.hr_teacher_lesson_occurrences%ROWTYPE;
  v_employment uuid;
  v_contract uuid;
BEGIN
  SELECT * INTO v_occ
  FROM public.hr_teacher_lesson_occurrences
  WHERE id = p_occurrence_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Lesson occurrence not found'; END IF;
  IF v_occ.school_id IS DISTINCT FROM (SELECT public.current_school_id()) THEN
    RAISE EXCEPTION 'Lesson occurrence outside current school';
  END IF;
  IF v_occ.status <> 'scheduled' OR v_occ.actual_started_at IS NOT NULL THEN
    RAISE EXCEPTION 'Only untouched scheduled lessons may be substituted';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Substitution reason is required';
  END IF;

  SELECT l.employment_id INTO v_employment
  FROM public.hr_teacher_employment_links l
  JOIN public.hr_employments e ON e.id = l.employment_id AND e.school_id = l.school_id
  WHERE l.school_id = v_occ.school_id
    AND l.teacher_id = p_substitute_teacher_id
    AND l.status = 'active'
    AND l.deleted_at IS NULL
    AND l.starts_on <= v_occ.lesson_date
    AND (l.ends_on IS NULL OR l.ends_on >= v_occ.lesson_date)
    AND e.status = 'active'
    AND e.deleted_at IS NULL
  LIMIT 1;

  IF v_employment IS NULL THEN
    RAISE EXCEPTION 'Substitute teacher has no active HR employment link';
  END IF;

  SELECT c.id INTO v_contract
  FROM public.hr_contracts c
  WHERE c.school_id = v_occ.school_id
    AND c.employment_id = v_employment
    AND c.salary_type = 'lesson_hour'
    AND c.status = 'active'
    AND c.deleted_at IS NULL
    AND c.starts_on <= v_occ.lesson_date
    AND (c.ends_on IS NULL OR c.ends_on >= v_occ.lesson_date)
  ORDER BY c.starts_on DESC
  LIMIT 1;

  IF v_contract IS NULL THEN
    RAISE EXCEPTION 'Substitute teacher has no active lesson-hour contract';
  END IF;

  UPDATE public.hr_teacher_lesson_occurrences
  SET original_teacher_id = COALESCE(original_teacher_id, teacher_id),
      teacher_id = p_substitute_teacher_id,
      employment_id = v_employment,
      contract_id = v_contract,
      occurrence_kind = 'substitution',
      adjustment_reason = btrim(p_reason),
      updated_by = (SELECT auth.uid())
  WHERE id = v_occ.id;

  RETURN v_occ.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_assign_teacher_substitute(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_assign_teacher_substitute(uuid, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Aula extraordinária: usa uma disciplina/turma existente, mas nasce fora do
-- timetable semanal. Continua a exigir professor, vínculo RH e contrato válidos.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_create_extra_teacher_lesson(
  p_class_subject_id uuid,
  p_lesson_date date,
  p_starts_at time,
  p_ends_at time,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := (SELECT public.current_school_id());
  v_teacher uuid;
  v_employment uuid;
  v_contract uuid;
  v_id uuid;
BEGIN
  IF v_school IS NULL THEN RAISE EXCEPTION 'No active school'; END IF;
  IF p_ends_at <= p_starts_at THEN RAISE EXCEPTION 'Invalid lesson time interval'; END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Extra lesson reason is required'; END IF;

  SELECT teacher_id INTO v_teacher
  FROM public.class_subjects
  WHERE id = p_class_subject_id
    AND school_id = v_school
    AND status = 'active';
  IF v_teacher IS NULL THEN RAISE EXCEPTION 'Active class subject/teacher not found'; END IF;

  SELECT l.employment_id INTO v_employment
  FROM public.hr_teacher_employment_links l
  JOIN public.hr_employments e ON e.id = l.employment_id AND e.school_id = l.school_id
  WHERE l.school_id = v_school
    AND l.teacher_id = v_teacher
    AND l.status = 'active'
    AND l.deleted_at IS NULL
    AND l.starts_on <= p_lesson_date
    AND (l.ends_on IS NULL OR l.ends_on >= p_lesson_date)
    AND e.status = 'active'
    AND e.deleted_at IS NULL
  LIMIT 1;
  IF v_employment IS NULL THEN RAISE EXCEPTION 'Teacher has no active HR employment link'; END IF;

  SELECT id INTO v_contract
  FROM public.hr_contracts
  WHERE school_id = v_school
    AND employment_id = v_employment
    AND salary_type = 'lesson_hour'
    AND status = 'active'
    AND deleted_at IS NULL
    AND starts_on <= p_lesson_date
    AND (ends_on IS NULL OR ends_on >= p_lesson_date)
  ORDER BY starts_on DESC
  LIMIT 1;
  IF v_contract IS NULL THEN RAISE EXCEPTION 'Teacher has no active lesson-hour contract'; END IF;

  INSERT INTO public.hr_teacher_lesson_occurrences (
    school_id, timetable_slot_id, class_subject_id, teacher_id, employment_id, contract_id,
    lesson_date, scheduled_starts_at, scheduled_ends_at, occurrence_kind,
    adjustment_reason, status, created_by
  ) VALUES (
    v_school, NULL, p_class_subject_id, v_teacher, v_employment, v_contract,
    p_lesson_date, p_starts_at, p_ends_at, 'extra', btrim(p_reason), 'scheduled', (SELECT auth.uid())
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_create_extra_teacher_lesson(uuid, date, time, time, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_create_extra_teacher_lesson(uuid, date, time, time, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Cálculo auditável de presença após check-out.
-- Não gera pagamento por si só; prepara quantidade/status a ser usada no fecho.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_evaluate_teacher_lesson_attendance(p_occurrence_id uuid)
RETURNS TABLE (
  attendance_percent numeric,
  payable_quantity numeric,
  exception_status text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_occ public.hr_teacher_lesson_occurrences%ROWTYPE;
  v_policy public.hr_teacher_attendance_policies%ROWTYPE;
  v_scheduled_start timestamptz;
  v_scheduled_end timestamptz;
  v_scheduled_seconds numeric;
  v_actual_seconds numeric;
  v_percent numeric;
  v_late integer;
  v_early integer;
  v_payable numeric;
  v_status text;
BEGIN
  SELECT * INTO v_occ FROM public.hr_teacher_lesson_occurrences
  WHERE id = p_occurrence_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lesson occurrence not found'; END IF;
  IF v_occ.actual_started_at IS NULL OR v_occ.actual_ended_at IS NULL THEN
    RAISE EXCEPTION 'Check-in and check-out are required';
  END IF;

  SELECT * INTO v_policy
  FROM public.hr_teacher_attendance_policies
  WHERE school_id = v_occ.school_id AND active AND deleted_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    v_policy.late_grace_minutes := 10;
    v_policy.early_leave_grace_minutes := 10;
    v_policy.minimum_attendance_percent := 80;
    v_policy.outside_grace_mode := 'review';
  END IF;

  v_scheduled_start := ((v_occ.lesson_date + v_occ.scheduled_starts_at)::timestamp AT TIME ZONE 'Africa/Luanda');
  v_scheduled_end := ((v_occ.lesson_date + v_occ.scheduled_ends_at)::timestamp AT TIME ZONE 'Africa/Luanda');
  v_scheduled_seconds := GREATEST(EXTRACT(EPOCH FROM (v_scheduled_end - v_scheduled_start)), 1);
  v_actual_seconds := GREATEST(EXTRACT(EPOCH FROM (v_occ.actual_ended_at - v_occ.actual_started_at)), 0);
  v_percent := LEAST(100, round((v_actual_seconds / v_scheduled_seconds) * 100, 2));
  v_late := GREATEST(floor(EXTRACT(EPOCH FROM (v_occ.actual_started_at - v_scheduled_start)) / 60), 0)::integer;
  v_early := GREATEST(floor(EXTRACT(EPOCH FROM (v_scheduled_end - v_occ.actual_ended_at)) / 60), 0)::integer;

  IF v_percent < v_policy.minimum_attendance_percent THEN
    v_payable := 0;
    v_status := 'pending_review';
  ELSIF v_late <= v_policy.late_grace_minutes
     AND v_early <= v_policy.early_leave_grace_minutes THEN
    v_payable := v_occ.quantity;
    v_status := 'within_grace';
  ELSIF v_policy.outside_grace_mode = 'proportional' THEN
    v_payable := round(v_occ.quantity * (v_percent / 100), 2);
    v_status := 'proportional';
  ELSE
    v_payable := NULL;
    v_status := 'pending_review';
  END IF;

  UPDATE public.hr_teacher_lesson_occurrences
  SET late_minutes = v_late,
      early_leave_minutes = v_early,
      attendance_percent = v_percent,
      payable_quantity = v_payable,
      attendance_exception_status = v_status,
      updated_by = (SELECT auth.uid())
  WHERE id = v_occ.id;

  RETURN QUERY SELECT v_percent, v_payable, v_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_evaluate_teacher_lesson_attendance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_evaluate_teacher_lesson_attendance(uuid) TO authenticated;

-- Política multi-tenant.
GRANT SELECT, INSERT, UPDATE ON public.hr_teacher_attendance_policies TO authenticated;
GRANT ALL ON public.hr_teacher_attendance_policies TO service_role;
ALTER TABLE public.hr_teacher_attendance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_teacher_attendance_policies FORCE ROW LEVEL SECURITY;

CREATE POLICY "HR reads teacher attendance policy in own school"
  ON public.hr_teacher_attendance_policies FOR SELECT TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND deleted_at IS NULL);
CREATE POLICY "HR creates teacher attendance policy in own school"
  ON public.hr_teacher_attendance_policies FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  );
CREATE POLICY "HR updates teacher attendance policy in own school"
  ON public.hr_teacher_attendance_policies FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  );

COMMENT ON TABLE public.hr_teacher_attendance_policies IS
  'Tolerâncias de atraso/saída antecipada e regra de revisão/proporcionalidade da hora-aula.';

NOTIFY pgrst, 'reload schema';
-- >>> END 20260906154500_hr_teacher_lesson_exceptions.sql

-- >>> BEGIN 20260906155500_hr_teacher_qr_tolerance_finalize.sql
-- SIGA / Onsoft — aplicar tolerância da presença no check-out QR.
-- Mantém o mesmo contrato da RPC hr_redeem_teacher_qr usado pelo frontend.

CREATE OR REPLACE FUNCTION public.hr_redeem_teacher_qr(
  p_token_hash text
)
RETURNS TABLE (
  occurrence_id uuid,
  purpose text,
  compensation_event_id uuid,
  occurrence_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_session public.hr_teacher_qr_sessions%ROWTYPE;
  v_occ public.hr_teacher_lesson_occurrences%ROWTYPE;
  v_teacher_user uuid;
  v_rate numeric(14,2);
  v_event_id uuid;
  v_now timestamptz := now();
  v_policy public.hr_teacher_attendance_policies%ROWTYPE;
  v_scheduled_start timestamptz;
  v_scheduled_end timestamptz;
  v_scheduled_seconds numeric;
  v_actual_seconds numeric;
  v_percent numeric;
  v_late integer;
  v_early integer;
  v_payable numeric;
  v_exception_status text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_token_hash IS NULL OR char_length(p_token_hash) < 32 THEN
    RAISE EXCEPTION 'Invalid QR token';
  END IF;

  PERFORM public.hr_expire_teacher_qr_sessions(NULL);

  SELECT * INTO v_session
  FROM public.hr_teacher_qr_sessions
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'QR challenge not found'; END IF;
  IF v_session.status <> 'active' OR v_session.expires_at <= v_now THEN
    RAISE EXCEPTION 'QR challenge expired or unavailable';
  END IF;

  SELECT * INTO v_occ
  FROM public.hr_teacher_lesson_occurrences
  WHERE id = v_session.occurrence_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Lesson occurrence not found'; END IF;
  IF v_occ.status IN ('rejected', 'cancelled') THEN
    RAISE EXCEPTION 'Lesson occurrence is not eligible for attendance';
  END IF;

  SELECT user_id INTO v_teacher_user
  FROM public.teachers
  WHERE id = v_occ.teacher_id
    AND school_id = v_occ.school_id
    AND status = 'active';

  IF v_teacher_user IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'QR challenge belongs to another teacher';
  END IF;

  IF v_session.purpose = 'check_in' THEN
    IF v_occ.actual_started_at IS NOT NULL THEN
      RAISE EXCEPTION 'Teacher already checked in for this lesson';
    END IF;

    UPDATE public.hr_teacher_lesson_occurrences
    SET actual_started_at = v_now,
        evidence_method = 'qr',
        evidence_ref = v_session.id::text,
        updated_by = v_user_id
    WHERE id = v_occ.id;

  ELSIF v_session.purpose = 'check_out' THEN
    IF v_occ.actual_started_at IS NULL THEN
      RAISE EXCEPTION 'Check-in is required before check-out';
    END IF;
    IF v_occ.actual_ended_at IS NOT NULL THEN
      RAISE EXCEPTION 'Teacher already checked out for this lesson';
    END IF;
    IF v_occ.contract_id IS NULL THEN
      RAISE EXCEPTION 'Lesson occurrence has no payroll contract';
    END IF;

    SELECT lesson_hour_rate_kz INTO v_rate
    FROM public.hr_contracts
    WHERE id = v_occ.contract_id
      AND school_id = v_occ.school_id
      AND employment_id = v_occ.employment_id
      AND salary_type = 'lesson_hour'
      AND status = 'active'
      AND deleted_at IS NULL
      AND starts_on <= v_occ.lesson_date
      AND (ends_on IS NULL OR ends_on >= v_occ.lesson_date);

    IF v_rate IS NULL THEN
      RAISE EXCEPTION 'No active lesson-hour contract for this occurrence';
    END IF;

    SELECT * INTO v_policy
    FROM public.hr_teacher_attendance_policies
    WHERE school_id = v_occ.school_id
      AND active
      AND deleted_at IS NULL
    LIMIT 1;

    IF NOT FOUND THEN
      v_policy.late_grace_minutes := 10;
      v_policy.early_leave_grace_minutes := 10;
      v_policy.minimum_attendance_percent := 80;
      v_policy.outside_grace_mode := 'review';
    END IF;

    v_scheduled_start := ((v_occ.lesson_date + v_occ.scheduled_starts_at)::timestamp AT TIME ZONE 'Africa/Luanda');
    v_scheduled_end := ((v_occ.lesson_date + v_occ.scheduled_ends_at)::timestamp AT TIME ZONE 'Africa/Luanda');
    v_scheduled_seconds := GREATEST(EXTRACT(EPOCH FROM (v_scheduled_end - v_scheduled_start)), 1);
    v_actual_seconds := GREATEST(EXTRACT(EPOCH FROM (v_now - v_occ.actual_started_at)), 0);
    v_percent := LEAST(100, round((v_actual_seconds / v_scheduled_seconds) * 100, 2));
    v_late := GREATEST(floor(EXTRACT(EPOCH FROM (v_occ.actual_started_at - v_scheduled_start)) / 60), 0)::integer;
    v_early := GREATEST(floor(EXTRACT(EPOCH FROM (v_scheduled_end - v_now)) / 60), 0)::integer;

    IF v_percent < v_policy.minimum_attendance_percent THEN
      v_payable := NULL;
      v_exception_status := 'pending_review';
    ELSIF v_late <= v_policy.late_grace_minutes
       AND v_early <= v_policy.early_leave_grace_minutes THEN
      v_payable := v_occ.quantity;
      v_exception_status := 'within_grace';
    ELSIF v_policy.outside_grace_mode = 'proportional' THEN
      v_payable := round(v_occ.quantity * (v_percent / 100), 2);
      v_exception_status := 'proportional';
    ELSE
      v_payable := NULL;
      v_exception_status := 'pending_review';
    END IF;

    -- Check-out sempre é gravado. Pagamento só nasce quando a política o permite.
    UPDATE public.hr_teacher_lesson_occurrences
    SET actual_ended_at = v_now,
        evidence_method = 'qr',
        evidence_ref = v_session.id::text,
        late_minutes = v_late,
        early_leave_minutes = v_early,
        attendance_percent = v_percent,
        payable_quantity = v_payable,
        attendance_exception_status = v_exception_status,
        updated_by = v_user_id
    WHERE id = v_occ.id;

    IF v_payable IS NOT NULL AND v_payable > 0 THEN
      INSERT INTO public.hr_compensation_events (
        school_id, employment_id, contract_id, event_date, event_type,
        quantity, unit_rate_kz, source_type, source_id, description,
        validation_status, validated_at, validated_by, created_by
      ) VALUES (
        v_occ.school_id, v_occ.employment_id, v_occ.contract_id, v_occ.lesson_date,
        'lesson_hour', v_payable, v_rate, 'teacher_lesson_occurrence', v_occ.id,
        CASE
          WHEN v_occ.occurrence_kind = 'substitution' THEN 'Aula de substituição confirmada por QR'
          WHEN v_occ.occurrence_kind = 'extra' THEN 'Aula extraordinária confirmada por QR'
          WHEN v_exception_status = 'proportional' THEN 'Aula confirmada por QR com remuneração proporcional'
          ELSE 'Aula confirmada por check-in/check-out QR'
        END,
        'validated', v_now, v_user_id, v_user_id
      )
      ON CONFLICT (school_id, source_type, source_id, employment_id, event_type)
        WHERE deleted_at IS NULL AND source_type IS NOT NULL AND source_id IS NOT NULL
      DO UPDATE SET quantity = EXCLUDED.quantity, updated_by = v_user_id
      RETURNING id INTO v_event_id;

      UPDATE public.hr_teacher_lesson_occurrences
      SET status = 'confirmed',
          confirmed_at = v_now,
          confirmed_by = v_user_id,
          compensation_event_id = v_event_id,
          updated_by = v_user_id
      WHERE id = v_occ.id;
    ELSE
      -- Fora da política: check-out concluído, mas remuneração fica bloqueada para revisão.
      v_event_id := NULL;
    END IF;
  END IF;

  UPDATE public.hr_teacher_qr_sessions
  SET status = 'used', used_at = v_now, used_by = v_user_id
  WHERE id = v_session.id;

  RETURN QUERY
  SELECT v_occ.id,
         v_session.purpose,
         CASE WHEN v_session.purpose = 'check_out' THEN v_event_id ELSE NULL::uuid END,
         CASE
           WHEN v_session.purpose = 'check_in' THEN 'scheduled'::text
           WHEN v_event_id IS NOT NULL THEN 'confirmed'::text
           ELSE 'pending_review'::text
         END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_redeem_teacher_qr(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_redeem_teacher_qr(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
-- >>> END 20260906155500_hr_teacher_qr_tolerance_finalize.sql

-- >>> BEGIN 20260906162000_hr_attendance_assurance_engine.sql
-- SIGA / Onsoft — motor avançado de confiança para presença docente
-- Combina QR, identidade autenticada, janela temporal, geofence e sinais de integridade.
-- Nenhum sinal isolado é tratado como prova absoluta.

CREATE TABLE public.hr_attendance_assurance_policies (
  school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  center_latitude double precision,
  center_longitude double precision,
  geofence_radius_m integer NOT NULL DEFAULT 150 CHECK (geofence_radius_m BETWEEN 20 AND 5000),
  max_location_accuracy_m integer NOT NULL DEFAULT 100 CHECK (max_location_accuracy_m BETWEEN 10 AND 5000),
  require_location boolean NOT NULL DEFAULT false,
  store_exact_location boolean NOT NULL DEFAULT false,
  checkin_early_minutes integer NOT NULL DEFAULT 20 CHECK (checkin_early_minutes BETWEEN 0 AND 180),
  checkin_late_minutes integer NOT NULL DEFAULT 20 CHECK (checkin_late_minutes BETWEEN 0 AND 180),
  checkout_early_minutes integer NOT NULL DEFAULT 20 CHECK (checkout_early_minutes BETWEEN 0 AND 180),
  checkout_late_minutes integer NOT NULL DEFAULT 60 CHECK (checkout_late_minutes BETWEEN 0 AND 360),
  qr_weight smallint NOT NULL DEFAULT 30 CHECK (qr_weight BETWEEN 0 AND 100),
  identity_weight smallint NOT NULL DEFAULT 20 CHECK (identity_weight BETWEEN 0 AND 100),
  time_weight smallint NOT NULL DEFAULT 20 CHECK (time_weight BETWEEN 0 AND 100),
  location_weight smallint NOT NULL DEFAULT 20 CHECK (location_weight BETWEEN 0 AND 100),
  device_integrity_weight smallint NOT NULL DEFAULT 10 CHECK (device_integrity_weight BETWEEN 0 AND 100),
  auto_approve_score smallint NOT NULL DEFAULT 70 CHECK (auto_approve_score BETWEEN 0 AND 100),
  review_score smallint NOT NULL DEFAULT 45 CHECK (review_score BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  CHECK ((center_latitude IS NULL) = (center_longitude IS NULL)),
  CHECK (center_latitude IS NULL OR center_latitude BETWEEN -90 AND 90),
  CHECK (center_longitude IS NULL OR center_longitude BETWEEN -180 AND 180),
  CHECK (qr_weight + identity_weight + time_weight + location_weight + device_integrity_weight <= 100),
  CHECK (auto_approve_score >= review_score)
);

CREATE TRIGGER hr_attendance_assurance_policies_set_updated_at
  BEFORE UPDATE ON public.hr_attendance_assurance_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

CREATE TABLE public.hr_attendance_assurance_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  occurrence_id uuid NOT NULL REFERENCES public.hr_teacher_lesson_occurrences(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('check_in', 'check_out')),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  captured_at timestamptz NOT NULL DEFAULT now(),
  qr_valid boolean NOT NULL DEFAULT false,
  identity_valid boolean NOT NULL DEFAULT false,
  time_valid boolean,
  location_supplied boolean NOT NULL DEFAULT false,
  location_accuracy_m numeric(10,2),
  distance_from_school_m numeric(12,2),
  inside_geofence boolean,
  latitude double precision,
  longitude double precision,
  device_integrity_provider text CHECK (device_integrity_provider IS NULL OR device_integrity_provider IN ('play_integrity','app_attest','webauthn','none')),
  device_integrity_valid boolean,
  assurance_score smallint NOT NULL DEFAULT 0 CHECK (assurance_score BETWEEN 0 AND 100),
  decision text NOT NULL CHECK (decision IN ('auto_approve','review','reject')),
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX hr_attendance_assurance_occurrence_idx
  ON public.hr_attendance_assurance_evidence (school_id, occurrence_id, captured_at DESC);
CREATE INDEX hr_attendance_assurance_decision_idx
  ON public.hr_attendance_assurance_evidence (school_id, decision, captured_at DESC);

CREATE OR REPLACE FUNCTION public.hr_haversine_distance_m(
  p_lat1 double precision,
  p_lon1 double precision,
  p_lat2 double precision,
  p_lon2 double precision
)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT 6371000.0 * 2.0 * asin(
    sqrt(
      power(sin(radians(p_lat2 - p_lat1) / 2.0), 2) +
      cos(radians(p_lat1)) * cos(radians(p_lat2)) *
      power(sin(radians(p_lon2 - p_lon1) / 2.0), 2)
    )
  );
$$;

REVOKE ALL ON FUNCTION public.hr_haversine_distance_m(double precision,double precision,double precision,double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_haversine_distance_m(double precision,double precision,double precision,double precision) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hr_evaluate_teacher_attendance_assurance(
  p_occurrence_id uuid,
  p_purpose text,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_accuracy_m double precision DEFAULT NULL
)
RETURNS TABLE (
  evidence_id uuid,
  assurance_score integer,
  decision text,
  inside_geofence boolean,
  distance_from_school_m numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_occ public.hr_teacher_lesson_occurrences%ROWTYPE;
  v_teacher_user uuid;
  v_policy public.hr_attendance_assurance_policies%ROWTYPE;
  v_score integer := 0;
  v_time_valid boolean := false;
  v_location_supplied boolean := false;
  v_inside boolean := NULL;
  v_distance double precision := NULL;
  v_decision text;
  v_reasons jsonb := '[]'::jsonb;
  v_scheduled timestamptz;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_purpose NOT IN ('check_in','check_out') THEN RAISE EXCEPTION 'Invalid attendance purpose'; END IF;
  IF (p_latitude IS NULL) <> (p_longitude IS NULL) THEN RAISE EXCEPTION 'Incomplete location'; END IF;
  IF p_latitude IS NOT NULL AND (p_latitude < -90 OR p_latitude > 90 OR p_longitude < -180 OR p_longitude > 180) THEN
    RAISE EXCEPTION 'Invalid location';
  END IF;

  SELECT * INTO v_occ
  FROM public.hr_teacher_lesson_occurrences
  WHERE id = p_occurrence_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lesson occurrence not found'; END IF;

  SELECT user_id INTO v_teacher_user
  FROM public.teachers
  WHERE id = v_occ.teacher_id AND school_id = v_occ.school_id AND status = 'active';
  IF v_teacher_user IS DISTINCT FROM v_user THEN RAISE EXCEPTION 'Attendance belongs to another teacher'; END IF;

  SELECT * INTO v_policy
  FROM public.hr_attendance_assurance_policies
  WHERE school_id = v_occ.school_id;

  IF NOT FOUND THEN
    v_policy.school_id := v_occ.school_id;
    v_policy.enabled := true;
    v_policy.geofence_radius_m := 150;
    v_policy.max_location_accuracy_m := 100;
    v_policy.require_location := false;
    v_policy.store_exact_location := false;
    v_policy.checkin_early_minutes := 20;
    v_policy.checkin_late_minutes := 20;
    v_policy.checkout_early_minutes := 20;
    v_policy.checkout_late_minutes := 60;
    v_policy.qr_weight := 30;
    v_policy.identity_weight := 20;
    v_policy.time_weight := 20;
    v_policy.location_weight := 20;
    v_policy.device_integrity_weight := 10;
    v_policy.auto_approve_score := 70;
    v_policy.review_score := 45;
  END IF;

  v_score := v_score + v_policy.qr_weight + v_policy.identity_weight;

  IF p_purpose = 'check_in' THEN
    v_scheduled := (v_occ.lesson_date::text || ' ' || v_occ.scheduled_starts_at::text || ' Africa/Luanda')::timestamptz;
    v_window_start := v_scheduled - make_interval(mins => v_policy.checkin_early_minutes);
    v_window_end := v_scheduled + make_interval(mins => v_policy.checkin_late_minutes);
  ELSE
    v_scheduled := (v_occ.lesson_date::text || ' ' || v_occ.scheduled_ends_at::text || ' Africa/Luanda')::timestamptz;
    v_window_start := v_scheduled - make_interval(mins => v_policy.checkout_early_minutes);
    v_window_end := v_scheduled + make_interval(mins => v_policy.checkout_late_minutes);
  END IF;

  v_time_valid := now() BETWEEN v_window_start AND v_window_end;
  IF v_time_valid THEN
    v_score := v_score + v_policy.time_weight;
  ELSE
    v_reasons := v_reasons || jsonb_build_array('outside_time_window');
  END IF;

  v_location_supplied := p_latitude IS NOT NULL;
  IF v_location_supplied AND v_policy.center_latitude IS NOT NULL THEN
    v_distance := public.hr_haversine_distance_m(
      p_latitude, p_longitude, v_policy.center_latitude, v_policy.center_longitude
    );
    v_inside := v_distance <= v_policy.geofence_radius_m
      AND COALESCE(p_accuracy_m, v_policy.max_location_accuracy_m + 1) <= v_policy.max_location_accuracy_m;
    IF v_inside THEN
      v_score := v_score + v_policy.location_weight;
    ELSE
      v_reasons := v_reasons || jsonb_build_array(
        CASE WHEN COALESCE(p_accuracy_m, v_policy.max_location_accuracy_m + 1) > v_policy.max_location_accuracy_m
          THEN 'location_accuracy_too_low' ELSE 'outside_geofence' END
      );
    END IF;
  ELSIF v_policy.require_location THEN
    v_reasons := v_reasons || jsonb_build_array('location_required');
  END IF;

  IF v_policy.require_location AND COALESCE(v_inside, false) = false THEN
    v_decision := CASE WHEN v_score >= v_policy.review_score THEN 'review' ELSE 'reject' END;
  ELSIF v_score >= v_policy.auto_approve_score THEN
    v_decision := 'auto_approve';
  ELSIF v_score >= v_policy.review_score THEN
    v_decision := 'review';
  ELSE
    v_decision := 'reject';
  END IF;

  INSERT INTO public.hr_attendance_assurance_evidence (
    school_id, occurrence_id, purpose, actor_user_id,
    qr_valid, identity_valid, time_valid,
    location_supplied, location_accuracy_m, distance_from_school_m, inside_geofence,
    latitude, longitude, device_integrity_provider, device_integrity_valid,
    assurance_score, decision, reasons
  ) VALUES (
    v_occ.school_id, v_occ.id, p_purpose, v_user,
    true, true, v_time_valid,
    v_location_supplied, p_accuracy_m, v_distance, v_inside,
    CASE WHEN v_policy.store_exact_location THEN p_latitude ELSE NULL END,
    CASE WHEN v_policy.store_exact_location THEN p_longitude ELSE NULL END,
    NULL, NULL,
    LEAST(v_score,100), v_decision, v_reasons
  ) RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, LEAST(v_score,100), v_decision, v_inside, v_distance::numeric;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_evaluate_teacher_attendance_assurance(uuid,text,double precision,double precision,double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_evaluate_teacher_attendance_assurance(uuid,text,double precision,double precision,double precision) TO authenticated;

-- Se uma aula chegar ao motor financeiro com um check-out cuja confiança não é
-- auto_approve, o evento continua auditável mas fica pending e não entra no cálculo
-- da folha (o cálculo actual só soma eventos validated).
CREATE OR REPLACE FUNCTION public.hr_gate_teacher_compensation_by_assurance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_decision text;
BEGIN
  IF NEW.source_type = 'teacher_lesson_occurrence' AND NEW.source_id IS NOT NULL THEN
    SELECT decision INTO v_decision
    FROM public.hr_attendance_assurance_evidence
    WHERE occurrence_id = NEW.source_id
      AND school_id = NEW.school_id
      AND purpose = 'check_out'
    ORDER BY captured_at DESC
    LIMIT 1;

    IF v_decision IS NOT NULL AND v_decision <> 'auto_approve' THEN
      NEW.validation_status := 'pending';
      NEW.validated_at := NULL;
      NEW.validated_by := NULL;
      NEW.description := concat_ws(' · ', NEW.description, 'Presença pendente por confiança multifator');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER hr_gate_teacher_compensation_by_assurance
  BEFORE INSERT OR UPDATE OF validation_status ON public.hr_compensation_events
  FOR EACH ROW EXECUTE FUNCTION public.hr_gate_teacher_compensation_by_assurance();

GRANT SELECT ON public.hr_attendance_assurance_policies TO authenticated;
GRANT SELECT ON public.hr_attendance_assurance_evidence TO authenticated;
GRANT ALL ON public.hr_attendance_assurance_policies, public.hr_attendance_assurance_evidence TO service_role;
ALTER TABLE public.hr_attendance_assurance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_attendance_assurance_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.hr_attendance_assurance_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_attendance_assurance_evidence FORCE ROW LEVEL SECURITY;

CREATE POLICY "HR reads attendance assurance policy"
  ON public.hr_attendance_assurance_policies FOR SELECT TO authenticated
  USING (school_id = (SELECT public.current_school_id()));

CREATE POLICY "HR reads attendance assurance evidence"
  ON public.hr_attendance_assurance_evidence FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (
      (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria')
      OR actor_user_id = (SELECT auth.uid())
    )
  );

COMMENT ON TABLE public.hr_attendance_assurance_evidence IS
  'Evidências e score multifator da presença docente: QR, identidade, tempo, localização e integridade de dispositivo.';

NOTIFY pgrst, 'reload schema';

-- >>> END 20260906162000_hr_attendance_assurance_engine.sql

-- >>> BEGIN 20260906170000_hr_remuneration_models_and_absences.sql
-- SIGA / Onsoft — modelos remuneratórios por contrato e tratamento de faltas
-- Suporta três realidades sem inferir regime jurídico apenas pelo tipo de escola:
-- 1) fixed_deduct_absence: vencimento-base mensal menos faltas não remuneradas;
-- 2) validated_units: soma apenas horas/aulas efectivamente validadas;
-- 3) hybrid: vencimento-base + unidades adicionais, com descontos de faltas quando aplicável.
--
-- As fórmulas de desconto são configuráveis por contrato/política. O sistema não
-- hard-codeia um divisor legal único nem presume que toda falta justificada é paga.

CREATE TABLE public.hr_contract_remuneration_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.hr_contracts(id) ON DELETE CASCADE,
  remuneration_model text NOT NULL CHECK (remuneration_model IN (
    'fixed_deduct_absence', 'validated_units', 'hybrid'
  )),
  -- Usado para converter uma falta em valor quando o contrato é mensal/híbrido.
  -- Ex.: divisor mensal configurado pela instituição e duração padrão de um dia.
  monthly_divisor_days numeric(8,2) CHECK (monthly_divisor_days IS NULL OR monthly_divisor_days > 0),
  standard_workday_minutes integer CHECK (standard_workday_minutes IS NULL OR standard_workday_minutes BETWEEN 30 AND 1440),
  deduct_unjustified_absence boolean NOT NULL DEFAULT true,
  deduct_justified_unpaid_absence boolean NOT NULL DEFAULT true,
  deduct_justified_paid_absence boolean NOT NULL DEFAULT false,
  allow_validated_hour_additions boolean NOT NULL DEFAULT false,
  allow_validated_lesson_additions boolean NOT NULL DEFAULT false,
  allow_overtime_additions boolean NOT NULL DEFAULT true,
  policy_source text NOT NULL DEFAULT 'institution' CHECK (policy_source IN (
    'institution', 'contract', 'public_service', 'collective_agreement', 'other'
  )),
  legal_reference text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (contract_id),
  CHECK (
    remuneration_model = 'validated_units'
    OR (monthly_divisor_days IS NOT NULL AND standard_workday_minutes IS NOT NULL)
  )
);

CREATE INDEX hr_contract_remuneration_policies_school_idx
  ON public.hr_contract_remuneration_policies (school_id, remuneration_model, active);

CREATE TABLE public.hr_absence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  employment_id uuid NOT NULL REFERENCES public.hr_employments(id),
  contract_id uuid REFERENCES public.hr_contracts(id),
  absence_date date NOT NULL,
  absence_type text NOT NULL CHECK (absence_type IN (
    'justified_paid', 'justified_unpaid', 'unjustified'
  )),
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
  -- Multiplicador fica configurável para regimes especiais; 1.0 é o normal.
  deduction_multiplier numeric(6,3) NOT NULL DEFAULT 1 CHECK (deduction_multiplier > 0 AND deduction_multiplier <= 10),
  source_type text,
  source_id uuid,
  reason text,
  evidence_ref text,
  validation_status text NOT NULL DEFAULT 'pending' CHECK (validation_status IN (
    'pending', 'validated', 'rejected', 'cancelled'
  )),
  validated_at timestamptz,
  validated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX hr_absence_events_payroll_idx
  ON public.hr_absence_events (school_id, employment_id, absence_date, validation_status)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX hr_absence_events_source_idx
  ON public.hr_absence_events (school_id, source_type, source_id, employment_id)
  WHERE deleted_at IS NULL AND source_type IS NOT NULL AND source_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.hr_assert_remuneration_policy_same_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE v_school uuid;
BEGIN
  SELECT school_id INTO v_school FROM public.hr_contracts WHERE id = NEW.contract_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'HR cross-school remuneration policy reference';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.hr_assert_absence_same_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE v_school uuid;
DECLARE v_contract_employment uuid;
BEGIN
  SELECT school_id INTO v_school FROM public.hr_employments WHERE id = NEW.employment_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'HR cross-school absence employment reference';
  END IF;

  IF NEW.contract_id IS NOT NULL THEN
    SELECT school_id, employment_id INTO v_school, v_contract_employment
    FROM public.hr_contracts WHERE id = NEW.contract_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION 'HR cross-school absence contract reference';
    END IF;
    IF v_contract_employment IS DISTINCT FROM NEW.employment_id THEN
      RAISE EXCEPTION 'HR absence contract/employment mismatch';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER hr_contract_remuneration_policy_same_school
  BEFORE INSERT OR UPDATE ON public.hr_contract_remuneration_policies
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_remuneration_policy_same_school();
CREATE TRIGGER hr_absence_same_school
  BEFORE INSERT OR UPDATE ON public.hr_absence_events
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_absence_same_school();
CREATE TRIGGER hr_contract_remuneration_policies_set_updated_at
  BEFORE UPDATE ON public.hr_contract_remuneration_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER hr_absence_events_set_updated_at
  BEFORE UPDATE ON public.hr_absence_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

GRANT SELECT, INSERT, UPDATE ON public.hr_contract_remuneration_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.hr_absence_events TO authenticated;
GRANT ALL ON public.hr_contract_remuneration_policies, public.hr_absence_events TO service_role;
ALTER TABLE public.hr_contract_remuneration_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_contract_remuneration_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.hr_absence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_absence_events FORCE ROW LEVEL SECURITY;

CREATE POLICY "HR reads remuneration policies in own school"
  ON public.hr_contract_remuneration_policies FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria')
  );
CREATE POLICY "HR creates remuneration policies in own school"
  ON public.hr_contract_remuneration_policies FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
    AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria')
  );
CREATE POLICY "HR updates remuneration policies in own school"
  ON public.hr_contract_remuneration_policies FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria')
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria')
  );

CREATE POLICY "HR reads absence events in own school"
  ON public.hr_absence_events FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria')
    AND deleted_at IS NULL
  );
CREATE POLICY "HR creates absence events in own school"
  ON public.hr_absence_events FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
    AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria')
  );
CREATE POLICY "HR updates absence events in own school"
  ON public.hr_absence_events FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria')
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria')
  );

-- Motor unificado de cálculo da folha.
-- Mantém compatibilidade com a assinatura existente e acrescenta os três modelos.
CREATE OR REPLACE FUNCTION public.hr_calculate_payroll_item(
  p_payroll_run_id uuid,
  p_employment_id uuid
)
RETURNS public.hr_payroll_items
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_run public.hr_payroll_runs;
  v_emp public.hr_employments;
  v_contract public.hr_contracts;
  v_policy public.hr_contract_remuneration_policies;
  v_model text;
  v_base numeric(14,2) := 0;
  v_hourly numeric(14,2) := 0;
  v_allowances numeric(14,2) := 0;
  v_bonuses numeric(14,2) := 0;
  v_overtime numeric(14,2) := 0;
  v_absence_deduction numeric(14,2) := 0;
  v_gross numeric(14,2) := 0;
  v_net numeric(14,2) := 0;
  v_item public.hr_payroll_items;
BEGIN
  SELECT * INTO v_run FROM public.hr_payroll_runs WHERE id = p_payroll_run_id;
  IF NOT FOUND OR NOT public.is_school_member(v_run.school_id) THEN
    RAISE EXCEPTION 'Payroll run not accessible';
  END IF;
  IF v_run.status NOT IN ('draft', 'calculating', 'review') THEN
    RAISE EXCEPTION 'Payroll run is locked for calculation';
  END IF;

  SELECT * INTO v_emp FROM public.hr_employments
  WHERE id = p_employment_id AND school_id = v_run.school_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employment not found in payroll school'; END IF;

  SELECT * INTO v_contract
  FROM public.hr_contracts
  WHERE employment_id = p_employment_id
    AND school_id = v_run.school_id
    AND deleted_at IS NULL
    AND status = 'active'
    AND starts_on <= v_run.period_end
    AND (ends_on IS NULL OR ends_on >= v_run.period_start)
  ORDER BY starts_on DESC, created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No active contract for payroll period'; END IF;

  SELECT * INTO v_policy
  FROM public.hr_contract_remuneration_policies
  WHERE contract_id = v_contract.id AND school_id = v_run.school_id AND active = true;

  IF FOUND THEN
    v_model := v_policy.remuneration_model;
  ELSE
    -- Compatibilidade segura com contratos existentes.
    v_model := CASE
      WHEN v_contract.salary_type = 'monthly' THEN 'fixed_deduct_absence'
      ELSE 'validated_units'
    END;
  END IF;

  IF v_model IN ('fixed_deduct_absence','hybrid') THEN
    v_base := v_contract.base_salary_kz;
  END IF;

  SELECT
    COALESCE(sum(amount_kz) FILTER (
      WHERE event_type = 'worked_hour'
        AND (v_model = 'validated_units' OR (FOUND AND v_policy.allow_validated_hour_additions))
    ), 0),
    COALESCE(sum(amount_kz) FILTER (
      WHERE event_type = 'lesson_hour'
        AND (v_model = 'validated_units' OR (FOUND AND v_policy.allow_validated_lesson_additions))
    ), 0),
    COALESCE(sum(amount_kz) FILTER (WHERE event_type = 'allowance'), 0),
    COALESCE(sum(amount_kz) FILTER (WHERE event_type = 'bonus'), 0),
    COALESCE(sum(amount_kz) FILTER (
      WHERE event_type = 'overtime'
        AND (NOT FOUND OR v_policy.allow_overtime_additions)
    ), 0)
  INTO v_hourly, v_hourly, v_allowances, v_bonuses, v_overtime
  FROM public.hr_compensation_events
  WHERE school_id = v_run.school_id
    AND employment_id = p_employment_id
    AND event_date BETWEEN v_run.period_start AND v_run.period_end
    AND validation_status = 'validated'
    AND deleted_at IS NULL;

  -- Recalcular hourly total numa única soma para evitar dupla contagem e manter
  -- worked_hour/lesson_hour governados pela política.
  SELECT COALESCE(sum(amount_kz), 0)
  INTO v_hourly
  FROM public.hr_compensation_events
  WHERE school_id = v_run.school_id
    AND employment_id = p_employment_id
    AND event_date BETWEEN v_run.period_start AND v_run.period_end
    AND validation_status = 'validated'
    AND deleted_at IS NULL
    AND (
      (event_type = 'worked_hour' AND (v_model = 'validated_units' OR (FOUND AND v_policy.allow_validated_hour_additions)))
      OR
      (event_type = 'lesson_hour' AND (v_model = 'validated_units' OR (FOUND AND v_policy.allow_validated_lesson_additions)))
    );

  IF v_model IN ('fixed_deduct_absence','hybrid') THEN
    IF NOT FOUND THEN
      -- Contrato mensal legado sem política: mantém salário-base e não inventa
      -- fórmula de desconto. O administrador deve configurar a política antes
      -- de processar faltas remuneratórias automáticas.
      IF EXISTS (
        SELECT 1 FROM public.hr_absence_events ae
        WHERE ae.school_id = v_run.school_id
          AND ae.employment_id = p_employment_id
          AND ae.absence_date BETWEEN v_run.period_start AND v_run.period_end
          AND ae.validation_status = 'validated'
          AND ae.deleted_at IS NULL
      ) THEN
        RAISE EXCEPTION 'Monthly contract has validated absences but no remuneration policy';
      END IF;
    ELSE
      SELECT COALESCE(sum(
        CASE
          WHEN ae.absence_type = 'unjustified' AND v_policy.deduct_unjustified_absence THEN
            ((v_contract.base_salary_kz / v_policy.monthly_divisor_days)
              * (ae.duration_minutes::numeric / v_policy.standard_workday_minutes)
              * ae.deduction_multiplier)
          WHEN ae.absence_type = 'justified_unpaid' AND v_policy.deduct_justified_unpaid_absence THEN
            ((v_contract.base_salary_kz / v_policy.monthly_divisor_days)
              * (ae.duration_minutes::numeric / v_policy.standard_workday_minutes)
              * ae.deduction_multiplier)
          WHEN ae.absence_type = 'justified_paid' AND v_policy.deduct_justified_paid_absence THEN
            ((v_contract.base_salary_kz / v_policy.monthly_divisor_days)
              * (ae.duration_minutes::numeric / v_policy.standard_workday_minutes)
              * ae.deduction_multiplier)
          ELSE 0
        END
      ), 0)
      INTO v_absence_deduction
      FROM public.hr_absence_events ae
      WHERE ae.school_id = v_run.school_id
        AND ae.employment_id = p_employment_id
        AND (ae.contract_id IS NULL OR ae.contract_id = v_contract.id)
        AND ae.absence_date BETWEEN v_run.period_start AND v_run.period_end
        AND ae.validation_status = 'validated'
        AND ae.deleted_at IS NULL;
    END IF;
  END IF;

  v_gross := v_base + v_hourly + v_allowances + v_bonuses + v_overtime;
  v_absence_deduction := LEAST(v_absence_deduction, v_gross);
  v_net := GREATEST(v_gross - v_absence_deduction, 0);

  INSERT INTO public.hr_payroll_items (
    school_id, payroll_run_id, employment_id, contract_id,
    base_amount_kz, hourly_amount_kz, allowances_kz, bonuses_kz, overtime_kz,
    deductions_kz, gross_amount_kz, net_amount_kz, status,
    calculation_details, created_by, updated_by
  ) VALUES (
    v_run.school_id, v_run.id, v_emp.id, v_contract.id,
    v_base, v_hourly, v_allowances, v_bonuses, v_overtime,
    v_absence_deduction, v_gross, v_net, 'calculated',
    jsonb_build_object(
      'salary_type', v_contract.salary_type,
      'remuneration_model', v_model,
      'contract_id', v_contract.id,
      'absence_deduction_kz', v_absence_deduction,
      'calculated_at', now(),
      'period_start', v_run.period_start,
      'period_end', v_run.period_end
    ),
    auth.uid(), auth.uid()
  )
  ON CONFLICT (payroll_run_id, employment_id) DO UPDATE SET
    contract_id = EXCLUDED.contract_id,
    base_amount_kz = EXCLUDED.base_amount_kz,
    hourly_amount_kz = EXCLUDED.hourly_amount_kz,
    allowances_kz = EXCLUDED.allowances_kz,
    bonuses_kz = EXCLUDED.bonuses_kz,
    overtime_kz = EXCLUDED.overtime_kz,
    deductions_kz = EXCLUDED.deductions_kz,
    gross_amount_kz = EXCLUDED.gross_amount_kz,
    net_amount_kz = EXCLUDED.net_amount_kz,
    status = EXCLUDED.status,
    calculation_details = EXCLUDED.calculation_details,
    updated_by = auth.uid()
  RETURNING * INTO v_item;

  RETURN v_item;
END;
$$;

COMMENT ON TABLE public.hr_contract_remuneration_policies IS
  'Define se o contrato remunera por vencimento-base menos faltas, por unidades validadas, ou em modelo híbrido.';
COMMENT ON TABLE public.hr_absence_events IS
  'Faltas funcionais validadas com classificação remuneratória, duração e multiplicador auditável.';

NOTIFY pgrst, 'reload schema';

-- >>> END 20260906170000_hr_remuneration_models_and_absences.sql

-- >>> BEGIN 20260906171000_hr_public_private_attendance_payroll.sql
-- SIGA / Onsoft — presença docente para mensalistas, horistas e hora/aula
-- Corrige o cálculo por política, amplia materialização para contratos mensais/horários
-- e transforma ausência sem check-in em falta PENDENTE (nunca desconto automático).

-- ---------------------------------------------------------------------------
-- 1) Materializar aulas para qualquer contrato docente activo.
-- A ocorrência é prova de assiduidade; o contrato decide se presença soma remuneração
-- ou se a ausência validada desconta do salário-base.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_materialize_teacher_lessons(
  p_from date,
  p_to date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school_id uuid := (SELECT public.current_school_id());
  v_role text := (SELECT public.current_profile_role());
  v_inserted integer := 0;
BEGIN
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'School context required'; END IF;
  IF v_role NOT IN ('Administrador', 'Tesouraria') THEN RAISE EXCEPTION 'Insufficient HR permission'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'Invalid materialization range'; END IF;
  IF (p_to - p_from) > 31 THEN RAISE EXCEPTION 'Materialization range cannot exceed 31 days'; END IF;

  INSERT INTO public.hr_teacher_lesson_occurrences (
    school_id, timetable_slot_id, class_subject_id, teacher_id,
    employment_id, contract_id, lesson_date,
    scheduled_starts_at, scheduled_ends_at, quantity, status, created_by
  )
  SELECT
    v_school_id, ts.id, cs.id, cs.teacher_id,
    link.employment_id, contract.id, d::date,
    ts.starts_at, ts.ends_at, 1, 'scheduled', (SELECT auth.uid())
  FROM generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') AS g(d)
  JOIN public.timetable_slots ts
    ON ts.school_id = v_school_id
   AND ts.status = 'active'
   AND ts.weekday = EXTRACT(ISODOW FROM d)::integer
  JOIN public.class_subjects cs
    ON cs.id = ts.class_subject_id
   AND cs.school_id = v_school_id
   AND cs.status = 'active'
   AND cs.teacher_id IS NOT NULL
  JOIN public.class_groups cg
    ON cg.id = cs.class_group_id
   AND cg.school_id = v_school_id
   AND cg.status = 'active'
  JOIN public.terms term
    ON term.school_id = v_school_id
   AND term.academic_year_id = cg.academic_year_id
   AND d::date BETWEEN term.starts_on AND term.ends_on
  JOIN public.hr_teacher_employment_links link
    ON link.school_id = v_school_id
   AND link.teacher_id = cs.teacher_id
   AND link.status = 'active'
   AND link.deleted_at IS NULL
   AND link.starts_on <= d::date
   AND (link.ends_on IS NULL OR link.ends_on >= d::date)
  JOIN LATERAL (
    SELECT hc.id
    FROM public.hr_contracts hc
    WHERE hc.school_id = v_school_id
      AND hc.employment_id = link.employment_id
      AND hc.status = 'active'
      AND hc.deleted_at IS NULL
      AND hc.starts_on <= d::date
      AND (hc.ends_on IS NULL OR hc.ends_on >= d::date)
    ORDER BY hc.starts_on DESC, hc.created_at DESC
    LIMIT 1
  ) contract ON true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.calendar_events ce
    WHERE ce.school_id = v_school_id
      AND ce.deleted_at IS NULL
      AND ce.category = 'holiday'
      AND d::date BETWEEN ce.event_date AND COALESCE(ce.ends_on, ce.event_date)
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.hr_materialize_teacher_lessons(date, date) IS
  'Materializa aulas para contratos mensais, horários ou hora/aula; a política remuneratória decide o efeito financeiro.';

-- ---------------------------------------------------------------------------
-- 2) QR unificado por tipo de contrato.
-- mensal: confirma presença, sem criar acréscimo;
-- hourly: cria worked_hour pelas horas efectivas/pagáveis;
-- lesson_hour: cria lesson_hour pela quantidade pagável.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_redeem_teacher_qr(
  p_token_hash text
)
RETURNS TABLE (
  occurrence_id uuid,
  purpose text,
  compensation_event_id uuid,
  occurrence_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_session public.hr_teacher_qr_sessions%ROWTYPE;
  v_occ public.hr_teacher_lesson_occurrences%ROWTYPE;
  v_contract public.hr_contracts%ROWTYPE;
  v_teacher_user uuid;
  v_rate numeric(14,2);
  v_event_id uuid;
  v_now timestamptz := now();
  v_policy public.hr_teacher_attendance_policies%ROWTYPE;
  v_scheduled_start timestamptz;
  v_scheduled_end timestamptz;
  v_scheduled_seconds numeric;
  v_actual_seconds numeric;
  v_percent numeric;
  v_late integer;
  v_early integer;
  v_payable numeric;
  v_exception_status text;
  v_event_type text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_token_hash IS NULL OR char_length(p_token_hash) < 32 THEN RAISE EXCEPTION 'Invalid QR token'; END IF;

  PERFORM public.hr_expire_teacher_qr_sessions(NULL);

  SELECT * INTO v_session
  FROM public.hr_teacher_qr_sessions
  WHERE token_hash = p_token_hash
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'QR challenge not found'; END IF;
  IF v_session.status <> 'active' OR v_session.expires_at <= v_now THEN
    RAISE EXCEPTION 'QR challenge expired or unavailable';
  END IF;

  SELECT * INTO v_occ
  FROM public.hr_teacher_lesson_occurrences
  WHERE id = v_session.occurrence_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lesson occurrence not found'; END IF;
  IF v_occ.status IN ('rejected', 'cancelled') THEN RAISE EXCEPTION 'Lesson occurrence is not eligible for attendance'; END IF;

  SELECT user_id INTO v_teacher_user
  FROM public.teachers
  WHERE id = v_occ.teacher_id AND school_id = v_occ.school_id AND status = 'active';
  IF v_teacher_user IS DISTINCT FROM v_user_id THEN RAISE EXCEPTION 'QR challenge belongs to another teacher'; END IF;

  IF v_session.purpose = 'check_in' THEN
    IF v_occ.actual_started_at IS NOT NULL THEN RAISE EXCEPTION 'Teacher already checked in for this lesson'; END IF;
    UPDATE public.hr_teacher_lesson_occurrences
    SET actual_started_at = v_now,
        evidence_method = 'qr',
        evidence_ref = v_session.id::text,
        updated_by = v_user_id
    WHERE id = v_occ.id;

  ELSIF v_session.purpose = 'check_out' THEN
    IF v_occ.actual_started_at IS NULL THEN RAISE EXCEPTION 'Check-in is required before check-out'; END IF;
    IF v_occ.actual_ended_at IS NOT NULL THEN RAISE EXCEPTION 'Teacher already checked out for this lesson'; END IF;
    IF v_occ.contract_id IS NULL THEN RAISE EXCEPTION 'Lesson occurrence has no payroll contract'; END IF;

    SELECT * INTO v_contract
    FROM public.hr_contracts
    WHERE id = v_occ.contract_id
      AND school_id = v_occ.school_id
      AND employment_id = v_occ.employment_id
      AND status = 'active'
      AND deleted_at IS NULL
      AND starts_on <= v_occ.lesson_date
      AND (ends_on IS NULL OR ends_on >= v_occ.lesson_date);
    IF NOT FOUND THEN RAISE EXCEPTION 'No active contract for this occurrence'; END IF;

    SELECT * INTO v_policy
    FROM public.hr_teacher_attendance_policies
    WHERE school_id = v_occ.school_id AND active AND deleted_at IS NULL
    LIMIT 1;
    IF NOT FOUND THEN
      v_policy.late_grace_minutes := 10;
      v_policy.early_leave_grace_minutes := 10;
      v_policy.minimum_attendance_percent := 80;
      v_policy.outside_grace_mode := 'review';
    END IF;

    v_scheduled_start := ((v_occ.lesson_date + v_occ.scheduled_starts_at)::timestamp AT TIME ZONE 'Africa/Luanda');
    v_scheduled_end := ((v_occ.lesson_date + v_occ.scheduled_ends_at)::timestamp AT TIME ZONE 'Africa/Luanda');
    v_scheduled_seconds := GREATEST(EXTRACT(EPOCH FROM (v_scheduled_end - v_scheduled_start)), 1);
    v_actual_seconds := GREATEST(EXTRACT(EPOCH FROM (v_now - v_occ.actual_started_at)), 0);
    v_percent := LEAST(100, round((v_actual_seconds / v_scheduled_seconds) * 100, 2));
    v_late := GREATEST(floor(EXTRACT(EPOCH FROM (v_occ.actual_started_at - v_scheduled_start)) / 60), 0)::integer;
    v_early := GREATEST(floor(EXTRACT(EPOCH FROM (v_scheduled_end - v_now)) / 60), 0)::integer;

    IF v_percent < v_policy.minimum_attendance_percent THEN
      v_payable := NULL;
      v_exception_status := 'pending_review';
    ELSIF v_late <= v_policy.late_grace_minutes AND v_early <= v_policy.early_leave_grace_minutes THEN
      v_payable := CASE
        WHEN v_contract.salary_type = 'hourly' THEN round(v_scheduled_seconds / 3600.0, 2)
        ELSE v_occ.quantity
      END;
      v_exception_status := 'within_grace';
    ELSIF v_policy.outside_grace_mode = 'proportional' THEN
      v_payable := CASE
        WHEN v_contract.salary_type = 'hourly' THEN round((v_actual_seconds / 3600.0), 2)
        ELSE round(v_occ.quantity * (v_percent / 100), 2)
      END;
      v_exception_status := 'proportional';
    ELSE
      v_payable := NULL;
      v_exception_status := 'pending_review';
    END IF;

    UPDATE public.hr_teacher_lesson_occurrences
    SET actual_ended_at = v_now,
        evidence_method = 'qr',
        evidence_ref = v_session.id::text,
        late_minutes = v_late,
        early_leave_minutes = v_early,
        attendance_percent = v_percent,
        payable_quantity = v_payable,
        attendance_exception_status = v_exception_status,
        updated_by = v_user_id
    WHERE id = v_occ.id;

    IF v_payable IS NOT NULL AND v_payable > 0 AND v_contract.salary_type IN ('hourly','lesson_hour') THEN
      IF v_contract.salary_type = 'lesson_hour' THEN
        v_rate := v_contract.lesson_hour_rate_kz;
        v_event_type := 'lesson_hour';
      ELSE
        v_rate := v_contract.hourly_rate_kz;
        v_event_type := 'worked_hour';
      END IF;
      IF v_rate IS NULL THEN RAISE EXCEPTION 'Active contract has no applicable unit rate'; END IF;

      INSERT INTO public.hr_compensation_events (
        school_id, employment_id, contract_id, event_date, event_type,
        quantity, unit_rate_kz, source_type, source_id, description,
        validation_status, validated_at, validated_by, created_by
      ) VALUES (
        v_occ.school_id, v_occ.employment_id, v_occ.contract_id, v_occ.lesson_date,
        v_event_type, v_payable, v_rate, 'teacher_lesson_occurrence', v_occ.id,
        CASE
          WHEN v_contract.salary_type = 'hourly' THEN 'Horas docentes confirmadas por presença'
          WHEN v_occ.occurrence_kind = 'substitution' THEN 'Aula de substituição confirmada por QR'
          WHEN v_occ.occurrence_kind = 'extra' THEN 'Aula extraordinária confirmada por QR'
          WHEN v_exception_status = 'proportional' THEN 'Aula confirmada por QR com remuneração proporcional'
          ELSE 'Aula confirmada por check-in/check-out QR'
        END,
        'validated', v_now, v_user_id, v_user_id
      )
      ON CONFLICT (school_id, source_type, source_id, employment_id, event_type)
        WHERE deleted_at IS NULL AND source_type IS NOT NULL AND source_id IS NOT NULL
      DO UPDATE SET quantity = EXCLUDED.quantity, updated_by = v_user_id
      RETURNING id INTO v_event_id;
    ELSE
      v_event_id := NULL;
    END IF;

    IF v_payable IS NOT NULL AND v_payable > 0 THEN
      UPDATE public.hr_teacher_lesson_occurrences
      SET status = 'confirmed',
          confirmed_at = v_now,
          confirmed_by = v_user_id,
          compensation_event_id = v_event_id,
          updated_by = v_user_id
      WHERE id = v_occ.id;
    END IF;
  END IF;

  UPDATE public.hr_teacher_qr_sessions
  SET status = 'used', used_at = v_now, used_by = v_user_id
  WHERE id = v_session.id;

  RETURN QUERY
  SELECT v_occ.id,
         v_session.purpose,
         CASE WHEN v_session.purpose = 'check_out' THEN v_event_id ELSE NULL::uuid END,
         CASE
           WHEN v_session.purpose = 'check_in' THEN 'scheduled'::text
           WHEN v_payable IS NOT NULL AND v_payable > 0 THEN 'confirmed'::text
           ELSE 'pending_review'::text
         END;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Detectar automaticamente aula mensalista/horista sem presença.
-- Cria falta PENDENTE; não desconta nem classifica definitivamente sozinho.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_detect_missed_teacher_lessons(
  p_until date DEFAULT CURRENT_DATE
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school_id uuid := (SELECT public.current_school_id());
  v_role text := (SELECT public.current_profile_role());
  v_inserted integer := 0;
BEGIN
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'School context required'; END IF;
  IF v_role NOT IN ('Administrador','Tesouraria') THEN RAISE EXCEPTION 'Insufficient HR permission'; END IF;

  INSERT INTO public.hr_absence_events (
    school_id, employment_id, contract_id, absence_date,
    absence_type, duration_minutes, deduction_multiplier,
    source_type, source_id, reason, validation_status, created_by
  )
  SELECT
    o.school_id,
    o.employment_id,
    o.contract_id,
    o.lesson_date,
    'unjustified',
    GREATEST(
      1,
      floor(EXTRACT(EPOCH FROM (
        ((o.lesson_date + o.scheduled_ends_at)::timestamp AT TIME ZONE 'Africa/Luanda') -
        ((o.lesson_date + o.scheduled_starts_at)::timestamp AT TIME ZONE 'Africa/Luanda')
      )) / 60)::integer
    ),
    1,
    'teacher_lesson_missed',
    o.id,
    'Ausência detectada automaticamente a partir do horário; aguarda classificação/justificação',
    'pending',
    (SELECT auth.uid())
  FROM public.hr_teacher_lesson_occurrences o
  JOIN public.hr_contracts c
    ON c.id = o.contract_id
   AND c.school_id = o.school_id
   AND c.employment_id = o.employment_id
   AND c.status = 'active'
   AND c.deleted_at IS NULL
  WHERE o.school_id = v_school_id
    AND o.deleted_at IS NULL
    AND o.lesson_date <= p_until
    AND o.status = 'scheduled'
    AND o.actual_started_at IS NULL
    AND ((o.lesson_date + o.scheduled_ends_at)::timestamp AT TIME ZONE 'Africa/Luanda') < now()
    AND c.salary_type IN ('monthly','hourly')
  ON CONFLICT (school_id, source_type, source_id, employment_id)
    WHERE deleted_at IS NULL AND source_type IS NOT NULL AND source_id IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_detect_missed_teacher_lessons(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_detect_missed_teacher_lessons(date) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Corrigir cálculo de folha com estado explícito de existência da política.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_calculate_payroll_item(
  p_payroll_run_id uuid,
  p_employment_id uuid
)
RETURNS public.hr_payroll_items
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_run public.hr_payroll_runs;
  v_emp public.hr_employments;
  v_contract public.hr_contracts;
  v_policy public.hr_contract_remuneration_policies;
  v_has_policy boolean := false;
  v_model text;
  v_base numeric(14,2) := 0;
  v_hourly numeric(14,2) := 0;
  v_allowances numeric(14,2) := 0;
  v_bonuses numeric(14,2) := 0;
  v_overtime numeric(14,2) := 0;
  v_absence_deduction numeric(14,2) := 0;
  v_gross numeric(14,2) := 0;
  v_net numeric(14,2) := 0;
  v_item public.hr_payroll_items;
BEGIN
  SELECT * INTO v_run FROM public.hr_payroll_runs WHERE id = p_payroll_run_id;
  IF NOT FOUND OR NOT public.is_school_member(v_run.school_id) THEN RAISE EXCEPTION 'Payroll run not accessible'; END IF;
  IF v_run.status NOT IN ('draft','calculating','review') THEN RAISE EXCEPTION 'Payroll run is locked for calculation'; END IF;

  SELECT * INTO v_emp FROM public.hr_employments
  WHERE id = p_employment_id AND school_id = v_run.school_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employment not found in payroll school'; END IF;

  SELECT * INTO v_contract
  FROM public.hr_contracts
  WHERE employment_id = p_employment_id
    AND school_id = v_run.school_id
    AND deleted_at IS NULL
    AND status = 'active'
    AND starts_on <= v_run.period_end
    AND (ends_on IS NULL OR ends_on >= v_run.period_start)
  ORDER BY starts_on DESC, created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No active contract for payroll period'; END IF;

  SELECT * INTO v_policy
  FROM public.hr_contract_remuneration_policies
  WHERE contract_id = v_contract.id AND school_id = v_run.school_id AND active = true;
  v_has_policy := FOUND;

  IF v_has_policy THEN
    v_model := v_policy.remuneration_model;
  ELSE
    v_model := CASE WHEN v_contract.salary_type = 'monthly' THEN 'fixed_deduct_absence' ELSE 'validated_units' END;
  END IF;

  IF v_model IN ('fixed_deduct_absence','hybrid') THEN v_base := v_contract.base_salary_kz; END IF;

  SELECT
    COALESCE(sum(amount_kz) FILTER (WHERE event_type = 'allowance'),0),
    COALESCE(sum(amount_kz) FILTER (WHERE event_type = 'bonus'),0),
    COALESCE(sum(amount_kz) FILTER (
      WHERE event_type = 'overtime' AND (NOT v_has_policy OR v_policy.allow_overtime_additions)
    ),0)
  INTO v_allowances, v_bonuses, v_overtime
  FROM public.hr_compensation_events
  WHERE school_id = v_run.school_id
    AND employment_id = p_employment_id
    AND event_date BETWEEN v_run.period_start AND v_run.period_end
    AND validation_status = 'validated'
    AND deleted_at IS NULL;

  SELECT COALESCE(sum(amount_kz),0)
  INTO v_hourly
  FROM public.hr_compensation_events
  WHERE school_id = v_run.school_id
    AND employment_id = p_employment_id
    AND event_date BETWEEN v_run.period_start AND v_run.period_end
    AND validation_status = 'validated'
    AND deleted_at IS NULL
    AND (
      (event_type = 'worked_hour' AND (v_model = 'validated_units' OR (v_has_policy AND v_policy.allow_validated_hour_additions)))
      OR
      (event_type = 'lesson_hour' AND (v_model = 'validated_units' OR (v_has_policy AND v_policy.allow_validated_lesson_additions)))
    );

  IF v_model IN ('fixed_deduct_absence','hybrid') THEN
    IF NOT v_has_policy THEN
      IF EXISTS (
        SELECT 1 FROM public.hr_absence_events ae
        WHERE ae.school_id = v_run.school_id
          AND ae.employment_id = p_employment_id
          AND ae.absence_date BETWEEN v_run.period_start AND v_run.period_end
          AND ae.validation_status = 'validated'
          AND ae.deleted_at IS NULL
      ) THEN
        RAISE EXCEPTION 'Monthly contract has validated absences but no remuneration policy';
      END IF;
    ELSE
      SELECT COALESCE(sum(
        CASE
          WHEN ae.absence_type = 'unjustified' AND v_policy.deduct_unjustified_absence THEN
            (v_contract.base_salary_kz / v_policy.monthly_divisor_days)
            * (ae.duration_minutes::numeric / v_policy.standard_workday_minutes)
            * ae.deduction_multiplier
          WHEN ae.absence_type = 'justified_unpaid' AND v_policy.deduct_justified_unpaid_absence THEN
            (v_contract.base_salary_kz / v_policy.monthly_divisor_days)
            * (ae.duration_minutes::numeric / v_policy.standard_workday_minutes)
            * ae.deduction_multiplier
          WHEN ae.absence_type = 'justified_paid' AND v_policy.deduct_justified_paid_absence THEN
            (v_contract.base_salary_kz / v_policy.monthly_divisor_days)
            * (ae.duration_minutes::numeric / v_policy.standard_workday_minutes)
            * ae.deduction_multiplier
          ELSE 0
        END
      ),0)
      INTO v_absence_deduction
      FROM public.hr_absence_events ae
      WHERE ae.school_id = v_run.school_id
        AND ae.employment_id = p_employment_id
        AND (ae.contract_id IS NULL OR ae.contract_id = v_contract.id)
        AND ae.absence_date BETWEEN v_run.period_start AND v_run.period_end
        AND ae.validation_status = 'validated'
        AND ae.deleted_at IS NULL;
    END IF;
  END IF;

  v_gross := v_base + v_hourly + v_allowances + v_bonuses + v_overtime;
  v_absence_deduction := LEAST(round(v_absence_deduction,2), v_gross);
  v_net := GREATEST(v_gross - v_absence_deduction,0);

  INSERT INTO public.hr_payroll_items (
    school_id, payroll_run_id, employment_id, contract_id,
    base_amount_kz, hourly_amount_kz, allowances_kz, bonuses_kz, overtime_kz,
    deductions_kz, gross_amount_kz, net_amount_kz, status,
    calculation_details, created_by, updated_by
  ) VALUES (
    v_run.school_id, v_run.id, v_emp.id, v_contract.id,
    v_base, v_hourly, v_allowances, v_bonuses, v_overtime,
    v_absence_deduction, v_gross, v_net, 'calculated',
    jsonb_build_object(
      'salary_type',v_contract.salary_type,
      'remuneration_model',v_model,
      'policy_configured',v_has_policy,
      'contract_id',v_contract.id,
      'absence_deduction_kz',v_absence_deduction,
      'calculated_at',now(),
      'period_start',v_run.period_start,
      'period_end',v_run.period_end
    ),
    auth.uid(),auth.uid()
  )
  ON CONFLICT (payroll_run_id, employment_id) DO UPDATE SET
    contract_id = EXCLUDED.contract_id,
    base_amount_kz = EXCLUDED.base_amount_kz,
    hourly_amount_kz = EXCLUDED.hourly_amount_kz,
    allowances_kz = EXCLUDED.allowances_kz,
    bonuses_kz = EXCLUDED.bonuses_kz,
    overtime_kz = EXCLUDED.overtime_kz,
    deductions_kz = EXCLUDED.deductions_kz,
    gross_amount_kz = EXCLUDED.gross_amount_kz,
    net_amount_kz = EXCLUDED.net_amount_kz,
    status = EXCLUDED.status,
    calculation_details = EXCLUDED.calculation_details,
    updated_by = auth.uid()
  RETURNING * INTO v_item;

  RETURN v_item;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- >>> END 20260906171000_hr_public_private_attendance_payroll.sql

-- >>> BEGIN 20260906180000_hr_payroll_operational_cycle.sql
-- SIGA / Onsoft — ciclo operacional de folha salarial
-- Criação de competência, cálculo em lote, totais e aprovação/bloqueio.

CREATE OR REPLACE FUNCTION public.hr_recompute_payroll_run_totals(p_payroll_run_id uuid)
RETURNS public.hr_payroll_runs
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_run public.hr_payroll_runs;
  v_gross numeric(16,2);
  v_deductions numeric(16,2);
  v_net numeric(16,2);
BEGIN
  SELECT * INTO v_run FROM public.hr_payroll_runs WHERE id = p_payroll_run_id;
  IF NOT FOUND OR NOT public.is_school_member(v_run.school_id) THEN
    RAISE EXCEPTION 'Payroll run not accessible';
  END IF;

  SELECT
    COALESCE(sum(gross_amount_kz), 0),
    COALESCE(sum(deductions_kz), 0),
    COALESCE(sum(net_amount_kz), 0)
  INTO v_gross, v_deductions, v_net
  FROM public.hr_payroll_items
  WHERE payroll_run_id = v_run.id
    AND school_id = v_run.school_id
    AND status <> 'cancelled';

  UPDATE public.hr_payroll_runs
  SET total_gross_kz = v_gross,
      total_deductions_kz = v_deductions,
      total_net_kz = v_net,
      updated_by = auth.uid()
  WHERE id = v_run.id
  RETURNING * INTO v_run;

  RETURN v_run;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_recompute_payroll_run_totals(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_recompute_payroll_run_totals(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_create_payroll_run(
  p_year integer,
  p_month integer,
  p_notes text DEFAULT NULL
)
RETURNS public.hr_payroll_runs
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := public.current_school_id();
  v_role text := public.current_profile_role();
  v_start date;
  v_end date;
  v_run public.hr_payroll_runs;
BEGIN
  IF v_school IS NULL THEN RAISE EXCEPTION 'School context required'; END IF;
  IF v_role NOT IN ('Administrador','Tesouraria') THEN RAISE EXCEPTION 'Insufficient payroll permission'; END IF;
  IF p_year < 2000 OR p_year > 2200 OR p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Invalid payroll competence';
  END IF;

  v_start := make_date(p_year, p_month, 1);
  v_end := (v_start + interval '1 month - 1 day')::date;

  INSERT INTO public.hr_payroll_runs (
    school_id, competence_year, competence_month, period_start, period_end,
    status, notes, created_by, updated_by
  ) VALUES (
    v_school, p_year, p_month, v_start, v_end,
    'draft', NULLIF(trim(p_notes), ''), auth.uid(), auth.uid()
  )
  ON CONFLICT (school_id, competence_year, competence_month) DO NOTHING
  RETURNING * INTO v_run;

  IF v_run.id IS NULL THEN
    SELECT * INTO v_run FROM public.hr_payroll_runs
    WHERE school_id = v_school AND competence_year = p_year AND competence_month = p_month;
  END IF;

  RETURN v_run;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_create_payroll_run(integer,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_create_payroll_run(integer,integer,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_calculate_payroll_run(p_payroll_run_id uuid)
RETURNS TABLE (
  payroll_run_id uuid,
  calculated_items integer,
  skipped_items integer,
  total_gross_kz numeric,
  total_deductions_kz numeric,
  total_net_kz numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_run public.hr_payroll_runs;
  v_emp record;
  v_calculated integer := 0;
  v_skipped integer := 0;
  v_totals public.hr_payroll_runs;
BEGIN
  SELECT * INTO v_run FROM public.hr_payroll_runs WHERE id = p_payroll_run_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_school_member(v_run.school_id) THEN
    RAISE EXCEPTION 'Payroll run not accessible';
  END IF;
  IF public.current_profile_role() NOT IN ('Administrador','Tesouraria') THEN
    RAISE EXCEPTION 'Insufficient payroll permission';
  END IF;
  IF v_run.status NOT IN ('draft','calculating','review') THEN
    RAISE EXCEPTION 'Payroll run is locked for calculation';
  END IF;

  UPDATE public.hr_payroll_runs
  SET status = 'calculating', updated_by = auth.uid()
  WHERE id = v_run.id;

  FOR v_emp IN
    SELECT DISTINCT e.id
    FROM public.hr_employments e
    WHERE e.school_id = v_run.school_id
      AND e.deleted_at IS NULL
      AND e.status = 'active'
      AND e.hire_date <= v_run.period_end
      AND (e.termination_date IS NULL OR e.termination_date >= v_run.period_start)
      AND EXISTS (
        SELECT 1 FROM public.hr_contracts c
        WHERE c.school_id = v_run.school_id
          AND c.employment_id = e.id
          AND c.deleted_at IS NULL
          AND c.status = 'active'
          AND c.starts_on <= v_run.period_end
          AND (c.ends_on IS NULL OR c.ends_on >= v_run.period_start)
      )
  LOOP
    BEGIN
      PERFORM public.hr_calculate_payroll_item(v_run.id, v_emp.id);
      v_calculated := v_calculated + 1;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
    END;
  END LOOP;

  SELECT * INTO v_totals FROM public.hr_recompute_payroll_run_totals(v_run.id);

  UPDATE public.hr_payroll_runs
  SET status = 'review', updated_by = auth.uid()
  WHERE id = v_run.id
  RETURNING * INTO v_totals;

  RETURN QUERY SELECT
    v_run.id,
    v_calculated,
    v_skipped,
    v_totals.total_gross_kz,
    v_totals.total_deductions_kz,
    v_totals.total_net_kz;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_calculate_payroll_run(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_calculate_payroll_run(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_approve_payroll_run(p_payroll_run_id uuid)
RETURNS public.hr_payroll_runs
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_run public.hr_payroll_runs;
  v_problem_count integer;
BEGIN
  SELECT * INTO v_run FROM public.hr_payroll_runs WHERE id = p_payroll_run_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_school_member(v_run.school_id) THEN
    RAISE EXCEPTION 'Payroll run not accessible';
  END IF;
  IF public.current_profile_role() NOT IN ('Administrador','Tesouraria') THEN
    RAISE EXCEPTION 'Insufficient payroll approval permission';
  END IF;
  IF v_run.status <> 'review' THEN
    RAISE EXCEPTION 'Payroll run must be in review before approval';
  END IF;

  SELECT count(*) INTO v_problem_count
  FROM public.hr_payroll_items
  WHERE payroll_run_id = v_run.id
    AND school_id = v_run.school_id
    AND status NOT IN ('calculated','approved','cancelled');

  IF v_problem_count > 0 THEN
    RAISE EXCEPTION 'Payroll run has unresolved items';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.hr_payroll_items
    WHERE payroll_run_id = v_run.id AND school_id = v_run.school_id AND status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Payroll run has no calculated items';
  END IF;

  UPDATE public.hr_payroll_items
  SET status = 'approved', updated_by = auth.uid()
  WHERE payroll_run_id = v_run.id
    AND school_id = v_run.school_id
    AND status = 'calculated';

  PERFORM public.hr_recompute_payroll_run_totals(v_run.id);

  UPDATE public.hr_payroll_runs
  SET status = 'approved',
      approved_at = now(),
      approved_by = auth.uid(),
      updated_by = auth.uid()
  WHERE id = v_run.id
  RETURNING * INTO v_run;

  RETURN v_run;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_approve_payroll_run(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_approve_payroll_run(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_block_locked_payroll_item_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_payroll_run_id uuid;
  v_status text;
BEGIN
  v_payroll_run_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.payroll_run_id ELSE NEW.payroll_run_id END;
  SELECT status INTO v_status FROM public.hr_payroll_runs WHERE id = v_payroll_run_id;
  IF v_status IN ('approved','processing','paid','cancelled') THEN
    RAISE EXCEPTION 'Payroll run is locked';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER hr_payroll_items_lock_after_approval
  BEFORE INSERT OR UPDATE OR DELETE ON public.hr_payroll_items
  FOR EACH ROW EXECUTE FUNCTION public.hr_block_locked_payroll_item_mutation();

COMMENT ON FUNCTION public.hr_calculate_payroll_run(uuid) IS
  'Calcula todos os vínculos elegíveis da competência, preserva falhas individuais para revisão e recomputa totais.';

NOTIFY pgrst, 'reload schema';

-- >>> END 20260906180000_hr_payroll_operational_cycle.sql

-- >>> BEGIN 20260906183000_hr_payroll_payment_orders.sql
-- SIGA / Onsoft — ordens de pagamento salarial
-- Separa folha aprovada, ordem de pagamento e saída efectiva de caixa.

CREATE TABLE public.hr_payment_settings (
  school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  require_dual_control boolean NOT NULL DEFAULT true,
  default_method text NOT NULL DEFAULT 'transfer' CHECK (default_method IN ('transfer','cash','other')),
  allow_manual_confirmation boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE public.hr_payment_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  employment_id uuid NOT NULL REFERENCES public.hr_employments(id),
  method text NOT NULL DEFAULT 'transfer' CHECK (method IN ('transfer','cash','other')),
  beneficiary_name text NOT NULL,
  bank_name text,
  iban text,
  account_number text,
  destination_reference text,
  is_primary boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CHECK (
    method <> 'transfer'
    OR iban IS NOT NULL
    OR account_number IS NOT NULL
    OR destination_reference IS NOT NULL
  )
);

CREATE UNIQUE INDEX hr_payment_destinations_primary_idx
  ON public.hr_payment_destinations (school_id, employment_id)
  WHERE is_primary AND active AND deleted_at IS NULL;

CREATE TABLE public.hr_payroll_payment_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  payroll_run_id uuid NOT NULL REFERENCES public.hr_payroll_runs(id),
  batch_number text NOT NULL,
  method text NOT NULL DEFAULT 'transfer' CHECK (method IN ('transfer','cash','other')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','awaiting_authorization','authorized','processing','partial','completed','failed','cancelled'
  )),
  total_amount_kz numeric(16,2) NOT NULL DEFAULT 0 CHECK (total_amount_kz >= 0),
  payable_count integer NOT NULL DEFAULT 0 CHECK (payable_count >= 0),
  blocked_count integer NOT NULL DEFAULT 0 CHECK (blocked_count >= 0),
  prepared_at timestamptz NOT NULL DEFAULT now(),
  prepared_by uuid NOT NULL REFERENCES auth.users(id),
  authorized_at timestamptz,
  authorized_by uuid REFERENCES auth.users(id),
  execution_reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (school_id, payroll_run_id),
  UNIQUE (school_id, batch_number)
);

CREATE TABLE public.hr_payroll_payment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.hr_payroll_payment_batches(id) ON DELETE CASCADE,
  payroll_item_id uuid NOT NULL REFERENCES public.hr_payroll_items(id),
  employment_id uuid NOT NULL REFERENCES public.hr_employments(id),
  destination_id uuid REFERENCES public.hr_payment_destinations(id),
  beneficiary_name text NOT NULL,
  destination_label text,
  amount_kz numeric(14,2) NOT NULL CHECK (amount_kz >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'blocked','pending','authorized','processing','paid','failed','cancelled'
  )),
  block_reason text,
  provider_reference text,
  failure_reason text,
  paid_at timestamptz,
  confirmed_by uuid REFERENCES auth.users(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (batch_id, payroll_item_id)
);

CREATE INDEX hr_payroll_payment_batches_status_idx
  ON public.hr_payroll_payment_batches (school_id, status, created_at DESC);
CREATE INDEX hr_payroll_payment_items_status_idx
  ON public.hr_payroll_payment_items (school_id, batch_id, status);

CREATE OR REPLACE FUNCTION public.hr_assert_payment_destination_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE v_school uuid;
BEGIN
  SELECT school_id INTO v_school FROM public.hr_employments WHERE id = NEW.employment_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'HR cross-school payment destination reference';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.hr_assert_payment_item_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE v_school uuid;
BEGIN
  SELECT school_id INTO v_school FROM public.hr_payroll_payment_batches WHERE id = NEW.batch_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school payment batch reference'; END IF;
  SELECT school_id INTO v_school FROM public.hr_payroll_items WHERE id = NEW.payroll_item_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school payroll item payment reference'; END IF;
  SELECT school_id INTO v_school FROM public.hr_employments WHERE id = NEW.employment_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school payment employment reference'; END IF;
  IF NEW.destination_id IS NOT NULL THEN
    SELECT school_id INTO v_school FROM public.hr_payment_destinations WHERE id = NEW.destination_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school destination reference'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER hr_payment_destinations_same_school
  BEFORE INSERT OR UPDATE ON public.hr_payment_destinations
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_payment_destination_school();
CREATE TRIGGER hr_payroll_payment_items_same_school
  BEFORE INSERT OR UPDATE ON public.hr_payroll_payment_items
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_payment_item_school();

CREATE TRIGGER hr_payment_settings_set_updated_at BEFORE UPDATE ON public.hr_payment_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER hr_payment_destinations_set_updated_at BEFORE UPDATE ON public.hr_payment_destinations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER hr_payroll_payment_batches_set_updated_at BEFORE UPDATE ON public.hr_payroll_payment_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER hr_payroll_payment_items_set_updated_at BEFORE UPDATE ON public.hr_payroll_payment_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

GRANT SELECT, INSERT, UPDATE ON public.hr_payment_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.hr_payment_destinations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.hr_payroll_payment_batches TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.hr_payroll_payment_items TO authenticated;
GRANT ALL ON public.hr_payment_settings, public.hr_payment_destinations,
  public.hr_payroll_payment_batches, public.hr_payroll_payment_items TO service_role;

ALTER TABLE public.hr_payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payment_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payment_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payment_destinations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_payment_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_payment_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_payment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_payment_items FORCE ROW LEVEL SECURITY;

CREATE POLICY "HR payment settings own school" ON public.hr_payment_settings
  FOR ALL TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria'))
  WITH CHECK (school_id = (SELECT public.current_school_id()) AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria'));
CREATE POLICY "HR payment destinations own school" ON public.hr_payment_destinations
  FOR ALL TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria'))
  WITH CHECK (school_id = (SELECT public.current_school_id()) AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria'));
CREATE POLICY "HR payment batches own school" ON public.hr_payroll_payment_batches
  FOR ALL TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria'))
  WITH CHECK (school_id = (SELECT public.current_school_id()) AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria'));
CREATE POLICY "HR payment items own school" ON public.hr_payroll_payment_items
  FOR ALL TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria'))
  WITH CHECK (school_id = (SELECT public.current_school_id()) AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria'));

CREATE OR REPLACE FUNCTION public.hr_create_payroll_payment_batch(p_payroll_run_id uuid)
RETURNS public.hr_payroll_payment_batches
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := public.current_school_id();
  v_role text := public.current_profile_role();
  v_run public.hr_payroll_runs;
  v_settings public.hr_payment_settings;
  v_batch public.hr_payroll_payment_batches;
  v_batch_number text;
BEGIN
  IF v_school IS NULL OR v_role NOT IN ('Administrador','Tesouraria') THEN
    RAISE EXCEPTION 'Insufficient payroll payment permission';
  END IF;

  SELECT * INTO v_run FROM public.hr_payroll_runs
  WHERE id = p_payroll_run_id AND school_id = v_school FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run not found'; END IF;
  IF v_run.status <> 'approved' THEN RAISE EXCEPTION 'Payroll run must be approved before payment order'; END IF;

  SELECT * INTO v_batch FROM public.hr_payroll_payment_batches
  WHERE school_id = v_school AND payroll_run_id = v_run.id;
  IF FOUND THEN RETURN v_batch; END IF;

  SELECT * INTO v_settings FROM public.hr_payment_settings WHERE school_id = v_school;
  IF NOT FOUND THEN
    v_settings.require_dual_control := true;
    v_settings.default_method := 'transfer';
  END IF;

  v_batch_number := format('SAL-%s-%s-%s', v_run.competence_year, lpad(v_run.competence_month::text,2,'0'), substr(replace(v_run.id::text,'-',''),1,8));

  INSERT INTO public.hr_payroll_payment_batches (
    school_id, payroll_run_id, batch_number, method, status,
    total_amount_kz, payable_count, blocked_count,
    prepared_by, created_by, updated_by
  ) VALUES (
    v_school, v_run.id, v_batch_number, v_settings.default_method, 'draft',
    0, 0, 0, auth.uid(), auth.uid(), auth.uid()
  ) RETURNING * INTO v_batch;

  INSERT INTO public.hr_payroll_payment_items (
    school_id, batch_id, payroll_item_id, employment_id, destination_id,
    beneficiary_name, destination_label, amount_kz, status, block_reason,
    created_by, updated_by
  )
  SELECT
    v_school,
    v_batch.id,
    pi.id,
    pi.employment_id,
    dest.id,
    COALESCE(dest.beneficiary_name, p.full_name, 'Beneficiário'),
    CASE
      WHEN dest.method = 'transfer' AND dest.iban IS NOT NULL THEN concat('IBAN ••••', right(regexp_replace(dest.iban, '\s', '', 'g'), 4))
      WHEN dest.method = 'transfer' AND dest.account_number IS NOT NULL THEN concat('Conta ••••', right(dest.account_number, 4))
      WHEN dest.method = 'cash' THEN 'Pagamento em numerário'
      ELSE dest.destination_reference
    END,
    pi.net_amount_kz,
    CASE WHEN dest.id IS NULL THEN 'blocked' ELSE 'pending' END,
    CASE WHEN dest.id IS NULL THEN 'Destino de pagamento não configurado' ELSE NULL END,
    auth.uid(), auth.uid()
  FROM public.hr_payroll_items pi
  JOIN public.hr_employments e ON e.id = pi.employment_id AND e.school_id = v_school
  JOIN public.people p ON p.id = e.person_id AND p.school_id = v_school
  LEFT JOIN LATERAL (
    SELECT d.* FROM public.hr_payment_destinations d
    WHERE d.school_id = v_school
      AND d.employment_id = pi.employment_id
      AND d.active
      AND d.deleted_at IS NULL
    ORDER BY d.is_primary DESC, d.created_at DESC
    LIMIT 1
  ) dest ON true
  WHERE pi.payroll_run_id = v_run.id
    AND pi.school_id = v_school
    AND pi.status = 'approved'
    AND pi.net_amount_kz > 0;

  UPDATE public.hr_payroll_payment_batches b
  SET total_amount_kz = COALESCE((SELECT sum(i.amount_kz) FROM public.hr_payroll_payment_items i WHERE i.batch_id = b.id AND i.status <> 'cancelled'),0),
      payable_count = COALESCE((SELECT count(*) FROM public.hr_payroll_payment_items i WHERE i.batch_id = b.id AND i.status = 'pending'),0),
      blocked_count = COALESCE((SELECT count(*) FROM public.hr_payroll_payment_items i WHERE i.batch_id = b.id AND i.status = 'blocked'),0),
      status = CASE WHEN EXISTS (SELECT 1 FROM public.hr_payroll_payment_items i WHERE i.batch_id = b.id AND i.status = 'blocked') THEN 'draft' ELSE 'awaiting_authorization' END,
      updated_by = auth.uid()
  WHERE b.id = v_batch.id
  RETURNING * INTO v_batch;

  RETURN v_batch;
END;
$$;

CREATE OR REPLACE FUNCTION public.hr_authorize_payroll_payment_batch(p_batch_id uuid)
RETURNS public.hr_payroll_payment_batches
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := public.current_school_id();
  v_role text := public.current_profile_role();
  v_settings public.hr_payment_settings;
  v_batch public.hr_payroll_payment_batches;
BEGIN
  IF v_school IS NULL OR v_role NOT IN ('Administrador','Tesouraria') THEN RAISE EXCEPTION 'Insufficient payment authorization permission'; END IF;
  SELECT * INTO v_batch FROM public.hr_payroll_payment_batches WHERE id = p_batch_id AND school_id = v_school FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment batch not found'; END IF;
  IF v_batch.status NOT IN ('draft','awaiting_authorization') THEN RAISE EXCEPTION 'Payment batch is not awaiting authorization'; END IF;
  IF EXISTS (SELECT 1 FROM public.hr_payroll_payment_items WHERE batch_id = v_batch.id AND status = 'blocked') THEN
    RAISE EXCEPTION 'Payment batch has blocked beneficiaries';
  END IF;

  SELECT * INTO v_settings FROM public.hr_payment_settings WHERE school_id = v_school;
  IF COALESCE(v_settings.require_dual_control, true) AND v_batch.prepared_by = auth.uid() THEN
    RAISE EXCEPTION 'Dual control requires a different user to authorize the payment batch';
  END IF;

  UPDATE public.hr_payroll_payment_items
  SET status = 'authorized', updated_by = auth.uid()
  WHERE batch_id = v_batch.id AND status = 'pending';

  UPDATE public.hr_payroll_payment_batches
  SET status = 'authorized', authorized_at = now(), authorized_by = auth.uid(), updated_by = auth.uid()
  WHERE id = v_batch.id
  RETURNING * INTO v_batch;
  RETURN v_batch;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_create_payroll_payment_batch(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hr_authorize_payroll_payment_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_create_payroll_payment_batch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_authorize_payroll_payment_batch(uuid) TO authenticated;

COMMENT ON TABLE public.hr_payroll_payment_batches IS
  'Ordem salarial derivada de folha aprovada; autorização não equivale a transferência nem saída de caixa.';

NOTIFY pgrst, 'reload schema';
-- >>> END 20260906183000_hr_payroll_payment_orders.sql

-- >>> BEGIN 20260906183500_hr_refresh_payroll_payment_batch.sql
-- SIGA / Onsoft — sincronizar destinos adicionados após criação da ordem salarial.

CREATE OR REPLACE FUNCTION public.hr_refresh_payroll_payment_batch(p_batch_id uuid)
RETURNS public.hr_payroll_payment_batches
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := public.current_school_id();
  v_role text := public.current_profile_role();
  v_batch public.hr_payroll_payment_batches;
BEGIN
  IF v_school IS NULL OR v_role NOT IN ('Administrador','Tesouraria') THEN
    RAISE EXCEPTION 'Insufficient payroll payment permission';
  END IF;

  SELECT * INTO v_batch
  FROM public.hr_payroll_payment_batches
  WHERE id = p_batch_id AND school_id = v_school
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment batch not found'; END IF;
  IF v_batch.status NOT IN ('draft','awaiting_authorization') THEN
    RAISE EXCEPTION 'Payment batch can no longer refresh beneficiaries';
  END IF;

  UPDATE public.hr_payroll_payment_items i
  SET destination_id = dest.id,
      beneficiary_name = COALESCE(dest.beneficiary_name, i.beneficiary_name),
      destination_label = CASE
        WHEN dest.method = 'transfer' AND dest.iban IS NOT NULL THEN concat('IBAN ••••', right(regexp_replace(dest.iban, '\s', '', 'g'), 4))
        WHEN dest.method = 'transfer' AND dest.account_number IS NOT NULL THEN concat('Conta ••••', right(dest.account_number, 4))
        WHEN dest.method = 'cash' THEN 'Pagamento em numerário'
        ELSE dest.destination_reference
      END,
      status = 'pending',
      block_reason = NULL,
      updated_by = auth.uid()
  FROM public.hr_payment_destinations dest
  WHERE i.batch_id = v_batch.id
    AND i.school_id = v_school
    AND i.status = 'blocked'
    AND dest.id = (
      SELECT d2.id
      FROM public.hr_payment_destinations d2
      WHERE d2.school_id = v_school
        AND d2.employment_id = i.employment_id
        AND d2.active
        AND d2.deleted_at IS NULL
      ORDER BY d2.is_primary DESC, d2.created_at DESC
      LIMIT 1
    );

  UPDATE public.hr_payroll_payment_batches b
  SET payable_count = COALESCE((SELECT count(*) FROM public.hr_payroll_payment_items i WHERE i.batch_id = b.id AND i.status = 'pending'),0),
      blocked_count = COALESCE((SELECT count(*) FROM public.hr_payroll_payment_items i WHERE i.batch_id = b.id AND i.status = 'blocked'),0),
      status = CASE
        WHEN EXISTS (SELECT 1 FROM public.hr_payroll_payment_items i WHERE i.batch_id = b.id AND i.status = 'blocked') THEN 'draft'
        ELSE 'awaiting_authorization'
      END,
      updated_by = auth.uid()
  WHERE b.id = v_batch.id
  RETURNING * INTO v_batch;

  RETURN v_batch;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_refresh_payroll_payment_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_refresh_payroll_payment_batch(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
-- >>> END 20260906183500_hr_refresh_payroll_payment_batch.sql

-- >>> BEGIN 20260906184500_hr_payroll_payment_execution.sql
-- SIGA / Onsoft — execução e confirmação de pagamentos salariais.
-- Cada item pago pode ligar-se a uma saída real de caixa já existente no módulo financeiro.

ALTER TABLE public.hr_payroll_payment_items
  ADD COLUMN IF NOT EXISTS cash_expense_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS hr_payroll_payment_items_cash_expense_idx
  ON public.hr_payroll_payment_items (cash_expense_id)
  WHERE cash_expense_id IS NOT NULL;

COMMENT ON COLUMN public.hr_payroll_payment_items.cash_expense_id IS
  'Referência à saída real de caixa criada somente após confirmação do pagamento salarial.';

NOTIFY pgrst, 'reload schema';
-- >>> END 20260906184500_hr_payroll_payment_execution.sql

-- >>> BEGIN 20260906185000_hr_payroll_locked_status_transitions.sql
-- SIGA / Onsoft — folha aprovada é financeiramente imutável, mas o estado
-- operacional ainda precisa avançar de approved -> processing -> paid.

CREATE OR REPLACE FUNCTION public.hr_block_locked_payroll_item_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_payroll_run_id uuid;
  v_run_status text;
  v_status_transition_allowed boolean := false;
BEGIN
  v_payroll_run_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.payroll_run_id ELSE NEW.payroll_run_id END;
  SELECT status INTO v_run_status FROM public.hr_payroll_runs WHERE id = v_payroll_run_id;

  IF v_run_status NOT IN ('approved','processing','paid','cancelled') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP IN ('INSERT','DELETE') THEN
    RAISE EXCEPTION 'Payroll run is locked';
  END IF;

  -- Nenhum valor/identidade/snapshot de cálculo pode mudar após aprovação.
  IF NEW.school_id IS DISTINCT FROM OLD.school_id
     OR NEW.payroll_run_id IS DISTINCT FROM OLD.payroll_run_id
     OR NEW.employment_id IS DISTINCT FROM OLD.employment_id
     OR NEW.contract_id IS DISTINCT FROM OLD.contract_id
     OR NEW.base_amount_kz IS DISTINCT FROM OLD.base_amount_kz
     OR NEW.hourly_amount_kz IS DISTINCT FROM OLD.hourly_amount_kz
     OR NEW.allowances_kz IS DISTINCT FROM OLD.allowances_kz
     OR NEW.bonuses_kz IS DISTINCT FROM OLD.bonuses_kz
     OR NEW.overtime_kz IS DISTINCT FROM OLD.overtime_kz
     OR NEW.deductions_kz IS DISTINCT FROM OLD.deductions_kz
     OR NEW.gross_amount_kz IS DISTINCT FROM OLD.gross_amount_kz
     OR NEW.net_amount_kz IS DISTINCT FROM OLD.net_amount_kz
     OR NEW.calculation_details IS DISTINCT FROM OLD.calculation_details THEN
    RAISE EXCEPTION 'Approved payroll financial values are immutable';
  END IF;

  v_status_transition_allowed :=
       (OLD.status = NEW.status)
    OR (OLD.status = 'approved' AND NEW.status IN ('processing','paid'))
    OR (OLD.status = 'processing' AND NEW.status = 'paid')
    OR (OLD.status = 'paid' AND NEW.status = 'paid');

  IF NOT v_status_transition_allowed THEN
    RAISE EXCEPTION 'Invalid locked payroll item status transition: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

-- Ao autorizar a ordem, a folha entra em processamento e os seus itens aprovados
-- passam para processing. Isto não altera qualquer valor calculado.
CREATE OR REPLACE FUNCTION public.hr_authorize_payroll_payment_batch(p_batch_id uuid)
RETURNS public.hr_payroll_payment_batches
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := public.current_school_id();
  v_role text := public.current_profile_role();
  v_settings public.hr_payment_settings;
  v_batch public.hr_payroll_payment_batches;
BEGIN
  IF v_school IS NULL OR v_role NOT IN ('Administrador','Tesouraria') THEN
    RAISE EXCEPTION 'Insufficient payment authorization permission';
  END IF;

  SELECT * INTO v_batch
  FROM public.hr_payroll_payment_batches
  WHERE id = p_batch_id AND school_id = v_school
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment batch not found'; END IF;
  IF v_batch.status NOT IN ('draft','awaiting_authorization') THEN
    RAISE EXCEPTION 'Payment batch is not awaiting authorization';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.hr_payroll_payment_items
    WHERE batch_id = v_batch.id AND status = 'blocked'
  ) THEN
    RAISE EXCEPTION 'Payment batch has blocked beneficiaries';
  END IF;

  SELECT * INTO v_settings FROM public.hr_payment_settings WHERE school_id = v_school;
  IF COALESCE(v_settings.require_dual_control, true) AND v_batch.prepared_by = auth.uid() THEN
    RAISE EXCEPTION 'Dual control requires a different user to authorize the payment batch';
  END IF;

  UPDATE public.hr_payroll_payment_items
  SET status = 'authorized', updated_by = auth.uid()
  WHERE batch_id = v_batch.id AND status = 'pending';

  UPDATE public.hr_payroll_items pi
  SET status = 'processing', updated_by = auth.uid()
  WHERE pi.payroll_run_id = v_batch.payroll_run_id
    AND pi.school_id = v_school
    AND pi.status = 'approved';

  UPDATE public.hr_payroll_runs
  SET status = 'processing', updated_by = auth.uid()
  WHERE id = v_batch.payroll_run_id
    AND school_id = v_school
    AND status = 'approved';

  UPDATE public.hr_payroll_payment_batches
  SET status = 'authorized',
      authorized_at = now(),
      authorized_by = auth.uid(),
      updated_by = auth.uid()
  WHERE id = v_batch.id
  RETURNING * INTO v_batch;

  RETURN v_batch;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_authorize_payroll_payment_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_authorize_payroll_payment_batch(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
-- >>> END 20260906185000_hr_payroll_locked_status_transitions.sql


-- >>> BEGIN 20260906190000_hr_security_hardening.sql
-- Ciclo 56 hardening: fechar bypass de assurance no QR e restringir RLS sensível de RH.
-- 1) Compensação de aula só fica validated com evidência check_out auto_approve.
-- 2) Folha/contratos: escrita só Admin/Tesouraria (SELECT mantém membros da escola onde faz sentido).

CREATE OR REPLACE FUNCTION public.hr_gate_teacher_compensation_by_assurance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_decision text;
BEGIN
  IF NEW.source_type = 'teacher_lesson_occurrence' AND NEW.source_id IS NOT NULL THEN
    SELECT decision INTO v_decision
    FROM public.hr_attendance_assurance_evidence
    WHERE occurrence_id = NEW.source_id
      AND school_id = NEW.school_id
      AND purpose = 'check_out'
    ORDER BY captured_at DESC
    LIMIT 1;

    -- Sem evidência (bypass directo da RPC de redeem) ou rejeição → nunca validated.
    IF v_decision IS NULL OR v_decision = 'reject' THEN
      NEW.validation_status := 'pending';
      NEW.validated_at := NULL;
      NEW.validated_by := NULL;
    ELSIF v_decision <> 'auto_approve' THEN
      NEW.validation_status := 'pending';
      NEW.validated_at := NULL;
      NEW.validated_by := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Restringir INSERT/UPDATE nas tabelas de folha e vínculo (SELECT continua por membro).
DO $$
DECLARE
  t text;
  pol text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hr_employments','hr_contracts',
    'hr_compensation_events','hr_payroll_runs','hr_payroll_items',
    'hr_payroll_item_components'
  ] LOOP
    FOREACH pol IN ARRAY ARRAY[
      'Create ' || t || ' in own school',
      'Update ' || t || ' in own school'
    ] LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (
         school_id = (SELECT public.current_school_id())
         AND (SELECT public.current_profile_role()) IN (''Administrador'',''Tesouraria'')
         AND created_by = (SELECT auth.uid())
       )',
      'Create ' || t || ' finance role', t
    );

    IF t <> 'hr_payroll_item_components' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (
           school_id = (SELECT public.current_school_id())
           AND (SELECT public.current_profile_role()) IN (''Administrador'',''Tesouraria'')
         ) WITH CHECK (
           school_id = (SELECT public.current_school_id())
           AND (SELECT public.current_profile_role()) IN (''Administrador'',''Tesouraria'')
         )',
        'Update ' || t || ' finance role', t
      );
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
-- >>> END 20260906190000_hr_security_hardening.sql
