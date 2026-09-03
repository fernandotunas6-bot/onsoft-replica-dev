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
  USING (public.is_school_member(school_id));

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
    'announcements',
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
    'school_invitations'
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

-- ─── announcements ────────────────────────────────────────────────────────────
-- Comunicados activos por escola (dashboard + campanhas)
CREATE INDEX IF NOT EXISTS announcements_school_created_desc_idx
  ON public.announcements (school_id, created_at DESC);

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
