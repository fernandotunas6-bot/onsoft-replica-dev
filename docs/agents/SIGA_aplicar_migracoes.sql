-- SIGA Plus — SQL a aplicar no Supabase (projecto Sga), 2026-09-27
-- Colar TUDO no SQL Editor → Run. Pode correr mais do que uma vez sem problema.
-- 23 migrações: as 8 do SIGA de 25–26/09, as 7 do catálogo de importação
-- (import_table_specs, sem ele a importação fica bloqueada), tenant_mailboxes,
-- a publicação de modelos de avaliação (siga_publish_assessment_rule), os
-- exames (siga_exam_sessions, siga_exam_registrations) e o histórico do aluno
-- só do servidor (alunos e encarregados deixam de ler o dos colegas) e as
-- faltas da pauta oficial lidas da chamada do SIGA e as regras de transição
-- por ciclo no modelo de avaliação, as competências por disciplina e o limite
-- de tentativas partilhado (login por B.I.).
-- Testado em 2026-09-27 num Postgres 16 com o esquema da produção
-- (supabase/PRODUCTION_SNAPSHOT.json): três corridas seguidas sem erros.
-- Depois de aplicar, confirmar com docs/agents/SIGA_confirmar_migracoes.sql.
--
-- A ordem não se inverte, e há duas dependências a saber:
--   · `20260925190000` cria `public.is_school_admin`, e `20260926120000` usa-a em quatro
--     políticas de RH. Trocadas, a segunda falha.
--   · `20260927120000` larga duas políticas que `20260925190000` cria. Invertidas,
--     ficariam criadas.
--
-- Falta aqui, de propósito, `20260925170000_timetable_builder_shifts_versions.sql`
-- (451 linhas, construtor de horários): é grande e independente, e merece ser aplicada
-- e verificada à parte.


-- ══════════ 20260925090000_school_access_requests.sql ══════════
-- Solicitações de vinculação institucional (SIGA Plus).
--
-- Uma identidade autenticada (auth.users) sem vínculo a uma escola pede para
-- ser associada a ela, indicando o perfil pretendido. A secretaria verifica e
-- decide. Só a aprovação cria/activa `school_memberships` + `member_roles` — a
-- tabela em si nunca concede acesso a nada.
--
-- Aditiva: não altera nenhuma tabela existente. Escritas só pelo servidor
-- (service role, com a autorização validada em `requests-server.ts`); o
-- requerente só lê os seus próprios pedidos.

CREATE TABLE IF NOT EXISTS public.school_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_profile text NOT NULL CHECK (
    requested_profile IN ('aluno', 'professor', 'funcionario', 'encarregado', 'outro')
  ),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'in_review', 'info_requested', 'approved', 'rejected', 'cancelled')
  ),
  full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 3 AND 160),
  national_id text CHECK (national_id IS NULL OR char_length(national_id) <= 40),
  institutional_number text CHECK (
    institutional_number IS NULL OR char_length(institutional_number) <= 60
  ),
  contact_phone text CHECK (contact_phone IS NULL OR char_length(contact_phone) <= 30),
  message text CHECK (message IS NULL OR char_length(message) <= 1000),
  -- Cadastro institucional encontrado com segurança (identificador + B.I. na
  -- mesma escola). Nunca é devolvido ao requerente; só a secretaria o vê.
  matched_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  match_kind text,
  granted_role_code text,
  membership_id uuid REFERENCES public.school_memberships(id) ON DELETE SET NULL,
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  decision_note text CHECK (decision_note IS NULL OR char_length(decision_note) <= 1000),
  info_request_note text CHECK (
    info_request_note IS NULL OR char_length(info_request_note) <= 1000
  ),
  requester_reply text CHECK (requester_reply IS NULL OR char_length(requester_reply) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- No máximo um pedido em aberto por pessoa e escola.
CREATE UNIQUE INDEX IF NOT EXISTS school_access_requests_open_uidx
  ON public.school_access_requests (school_id, user_id)
  WHERE status IN ('pending', 'in_review', 'info_requested');

CREATE INDEX IF NOT EXISTS school_access_requests_school_status_idx
  ON public.school_access_requests (school_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS school_access_requests_user_idx
  ON public.school_access_requests (user_id, created_at DESC);

ALTER TABLE public.school_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_access_requests FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.school_access_requests FROM anon;
REVOKE ALL ON public.school_access_requests FROM authenticated;
GRANT SELECT ON public.school_access_requests TO authenticated;
GRANT ALL ON public.school_access_requests TO service_role;

DROP POLICY IF EXISTS "Requester reads own access requests" ON public.school_access_requests;
CREATE POLICY "Requester reads own access requests"
  ON public.school_access_requests
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ══════════ 20260925160000_academic_guards_risk_followup_appypay.sql ══════════
CREATE OR REPLACE FUNCTION public.guard_timetable_slot_conflicts()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_class uuid; v_teacher uuid; v_conflict text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN RETURN NEW; END IF;
  IF NEW.starts_at >= NEW.ends_at THEN
    RAISE EXCEPTION 'A hora de fim tem de ser depois da hora de início.' USING ERRCODE = '23514';
  END IF;
  SELECT class_group_id, teacher_id INTO v_class, v_teacher FROM class_subjects WHERE id = NEW.class_subject_id;

  SELECT 'A turma já tem aula neste horário.' INTO v_conflict
  FROM timetable_slots t JOIN class_subjects c ON c.id = t.class_subject_id
  WHERE t.id <> NEW.id AND t.status = 'active' AND t.weekday = NEW.weekday
    AND t.starts_at < NEW.ends_at AND NEW.starts_at < t.ends_at AND c.class_group_id = v_class LIMIT 1;

  IF v_conflict IS NULL AND v_teacher IS NOT NULL THEN
    SELECT 'O professor já tem aula noutra turma neste horário.' INTO v_conflict
    FROM timetable_slots t JOIN class_subjects c ON c.id = t.class_subject_id
    WHERE t.id <> NEW.id AND t.status = 'active' AND t.weekday = NEW.weekday
      AND t.starts_at < NEW.ends_at AND NEW.starts_at < t.ends_at AND c.teacher_id = v_teacher LIMIT 1;
  END IF;

  IF v_conflict IS NULL AND NULLIF(btrim(NEW.room), '') IS NOT NULL THEN
    SELECT 'A sala já está ocupada neste horário.' INTO v_conflict
    FROM timetable_slots t
    WHERE t.id <> NEW.id AND t.status = 'active' AND t.school_id = NEW.school_id AND t.weekday = NEW.weekday
      AND t.starts_at < NEW.ends_at AND NEW.starts_at < t.ends_at AND t.room = NEW.room LIMIT 1;
  END IF;

  IF v_conflict IS NOT NULL THEN RAISE EXCEPTION '%', v_conflict USING ERRCODE = '23P01'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_timetable_slot_conflicts ON public.timetable_slots;
CREATE TRIGGER trg_guard_timetable_slot_conflicts
BEFORE INSERT OR UPDATE OF weekday, starts_at, ends_at, room, status, class_subject_id ON public.timetable_slots
FOR EACH ROW EXECUTE FUNCTION public.guard_timetable_slot_conflicts();

CREATE OR REPLACE FUNCTION public.guard_term_within_year()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE y record;
BEGIN
  IF NEW.starts_on IS NOT NULL AND NEW.ends_on IS NOT NULL AND NEW.starts_on >= NEW.ends_on THEN
    RAISE EXCEPTION 'O período tem de terminar depois de começar.' USING ERRCODE = '23514';
  END IF;
  SELECT starts_on, ends_on INTO y FROM academic_years WHERE id = NEW.academic_year_id;
  IF FOUND AND (NEW.starts_on < y.starts_on OR NEW.ends_on > y.ends_on) THEN
    RAISE EXCEPTION 'O período tem de ficar dentro das datas do ano lectivo.' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM terms t WHERE t.id <> NEW.id AND t.academic_year_id = NEW.academic_year_id
             AND t.starts_on <= NEW.ends_on AND NEW.starts_on <= t.ends_on) THEN
    RAISE EXCEPTION 'O período sobrepõe-se a outro período do mesmo ano lectivo.' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_term_within_year ON public.terms;
CREATE TRIGGER trg_guard_term_within_year
BEFORE INSERT OR UPDATE OF starts_on, ends_on, academic_year_id ON public.terms
FOR EACH ROW EXECUTE FUNCTION public.guard_term_within_year();

REVOKE EXECUTE ON FUNCTION public.guard_timetable_slot_conflicts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_term_within_year() FROM PUBLIC, anon, authenticated;

-- ── Acompanhamento de alunos em risco e cobranças AppyPay ──────────────────
--
-- Dados sensíveis (casos de risco de menores; telefones e valores de
-- pagamento). O código só lhes acede pelo servidor, com a chave de serviço e
-- depois de `requireSgaWriter` validar o papel (risk-followup.functions.ts,
-- appypay.functions.ts, appypay-reconcile.server.ts, webhook AppyPay). Por
-- isso não há acesso directo pela API: `is_school_member` inclui alunos e
-- encarregados, e com ele qualquer aluno leria ou apagaria os casos de risco
-- de toda a escola. RLS forçada e sem políticas = nega tudo a anon/authenticated.
--
-- Idempotente: pode correr mais do que uma vez. `set_updated_at()` não existe
-- na base SGA; usa-se `siga_touch_updated_at()`, que já existe.

CREATE TABLE IF NOT EXISTS public.student_risk_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL,
  class_group_id uuid,
  student_name text NOT NULL,
  class_group_name text,
  risk_level text NOT NULL DEFAULT 'médio',
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_interventions jsonb NOT NULL DEFAULT '[]'::jsonb,
  baseline_average numeric,
  latest_average numeric,
  status text NOT NULL DEFAULT 'aberto',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, enrollment_id)
);

CREATE TABLE IF NOT EXISTS public.student_risk_interventions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.student_risk_cases(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'nota',
  description text NOT NULL,
  outcome text,
  risk_level text,
  average_snapshot numeric,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_risk_interventions_case
  ON public.student_risk_interventions(case_id, created_at);

CREATE TABLE IF NOT EXISTS public.payment_gateway_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'appypay',
  invoice_id uuid NOT NULL,
  student_name text,
  method text NOT NULL,
  merchant_transaction_id text NOT NULL UNIQUE,
  provider_charge_id text UNIQUE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  reference_entity text,
  reference_number text,
  phone_number text,
  status text NOT NULL DEFAULT 'pending',
  status_message text,
  receipt_number text,
  reconciled_at timestamptz,
  last_webhook_at timestamptz,
  raw_last_payload jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gateway_charges_invoice
  ON public.payment_gateway_charges(school_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_gateway_charges_status
  ON public.payment_gateway_charges(school_id, status);

ALTER TABLE public.student_risk_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_risk_cases FORCE ROW LEVEL SECURITY;
ALTER TABLE public.student_risk_interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_risk_interventions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_gateway_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_gateway_charges FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.student_risk_cases FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.student_risk_interventions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.payment_gateway_charges FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.student_risk_cases TO service_role;
GRANT ALL ON public.student_risk_interventions TO service_role;
GRANT ALL ON public.payment_gateway_charges TO service_role;

-- Versões anteriores desta migração abriam as tabelas a qualquer membro.
DROP POLICY IF EXISTS "Membros da escola gerem casos de risco" ON public.student_risk_cases;
DROP POLICY IF EXISTS "Membros da escola gerem intervenções" ON public.student_risk_interventions;
DROP POLICY IF EXISTS "Membros da escola vêem cobranças" ON public.payment_gateway_charges;

DROP TRIGGER IF EXISTS trg_student_risk_cases_updated ON public.student_risk_cases;
CREATE TRIGGER trg_student_risk_cases_updated BEFORE UPDATE ON public.student_risk_cases
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();
DROP TRIGGER IF EXISTS trg_gateway_charges_updated ON public.payment_gateway_charges;
CREATE TRIGGER trg_gateway_charges_updated BEFORE UPDATE ON public.payment_gateway_charges
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

NOTIFY pgrst, 'reload schema';

-- ══════════ 20260925162000_lesson_plans_and_subject_guards.sql ══════════
CREATE TABLE IF NOT EXISTS public.siga_lesson_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_group_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  term integer NOT NULL CHECK (term BETWEEN 1 AND 3),
  title text NOT NULL,
  content text,
  file_id uuid,
  file_name text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);
CREATE INDEX IF NOT EXISTS siga_lesson_plans_scope_idx ON public.siga_lesson_plans (school_id, class_group_id, subject_id, term);
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
CREATE INDEX IF NOT EXISTS siga_lesson_plan_components_plan_idx ON public.siga_lesson_plan_components (lesson_plan_id, sequence);
-- Planos de aula: acesso só pelo servidor (lesson-plans/server.ts usa a chave de
-- serviço depois de validar o papel). A política anterior, que existe hoje em
-- produção, usava `is_school_member` e deixava alunos e encarregados escrever e
-- apagar planos de aula pela API. Idempotente: a produção já tem as tabelas,
-- as políticas e o trigger.
ALTER TABLE public.siga_lesson_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_lesson_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE public.siga_lesson_plan_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_lesson_plan_components FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_lesson_plans FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.siga_lesson_plan_components FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_lesson_plans TO service_role;
GRANT ALL ON public.siga_lesson_plan_components TO service_role;
DROP POLICY IF EXISTS "Manage lesson plans in own school" ON public.siga_lesson_plans;
DROP POLICY IF EXISTS "Manage lesson plan components in own school" ON public.siga_lesson_plan_components;
DROP TRIGGER IF EXISTS siga_lesson_plans_set_updated_at ON public.siga_lesson_plans;
CREATE TRIGGER siga_lesson_plans_set_updated_at BEFORE UPDATE ON public.siga_lesson_plans
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();
ALTER TABLE public.siga_assessment_items ADD COLUMN IF NOT EXISTS lesson_plan_component_id uuid
  REFERENCES public.siga_lesson_plan_components(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS siga_assessment_items_component_idx ON public.siga_assessment_items (lesson_plan_component_id)
  WHERE lesson_plan_component_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_class_subject_grade_range()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_seq int; v_from int; v_to int; v_subject text;
BEGIN
  -- Lido por jsonb: na base SGA `subjects` não tem grade_from/grade_to nem
  -- `grade_levels` tem sort_order (vêm do esquema Lovable). Coluna ausente dá
  -- NULL e a guarda não se aplica — em vez de partir cada escrita em
  -- class_subjects com "column does not exist".
  SELECT coalesce((to_jsonb(l)->>'sequence')::int, (to_jsonb(l)->>'sort_order')::int) INTO v_seq
  FROM class_groups g JOIN grade_levels l ON l.id = g.grade_level_id WHERE g.id = NEW.class_group_id;
  SELECT (to_jsonb(s)->>'grade_from')::int, (to_jsonb(s)->>'grade_to')::int, s.name
    INTO v_from, v_to, v_subject FROM subjects s WHERE s.id = NEW.subject_id;
  IF v_seq IS NOT NULL AND ((v_from IS NOT NULL AND v_seq < v_from) OR (v_to IS NOT NULL AND v_seq > v_to)) THEN
    RAISE EXCEPTION 'A disciplina % só é leccionada da %ª à %ª classe.', v_subject, v_from, v_to USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_class_subject_grade_range ON public.class_subjects;
CREATE TRIGGER trg_guard_class_subject_grade_range
BEFORE INSERT OR UPDATE OF class_group_id, subject_id ON public.class_subjects
FOR EACH ROW EXECUTE FUNCTION public.guard_class_subject_grade_range();
REVOKE EXECUTE ON FUNCTION public.guard_class_subject_grade_range() FROM PUBLIC, anon, authenticated;
-- ══════════ 20260925190000_harden_member_wide_policies.sql ══════════
-- Endurecimento RLS (2026-09-25): políticas "qualquer membro da escola".
--
-- `is_school_member(school_id)` é verdadeiro para QUALQUER membro activo,
-- incluindo alunos e encarregados. As políticas do Postgres somam-se (basta
-- uma permitir): onde havia uma política correcta por papel ao lado de uma
-- "qualquer membro", a segunda anulava a primeira. Com a API REST do
-- Supabase, um aluno podia, entre outras coisas:
--   · criar um convite com papel de administrador e aceitá-lo;
--   · conceder-se permissões de módulo (staff_module_grants);
--   · alterar notas, presenças, histórico académico e planos de pagamento;
--   · ler todas as mensagens directas da escola.
--
-- Regras desta migração (auditoria sobre supabase/PRODUCTION_SNAPSHOT.json e
-- sobre o código — ver docs/agents/SECURITY_AUDIT_2026-09-25.md):
--   A. Escrita "qualquer membro" passa a só leitura. A escrita continua pelo
--      servidor (chave de serviço + requireSgaWriter) e pelas políticas por
--      papel que já existem. A leitura mantém-se: o dashboard lê algumas destas
--      tabelas com o JWT do utilizador.
--   B. Tabelas que só o servidor usa: sem acesso directo pela API.
--   C. Permissões de módulo: só um Administrador da escola activa (o
--      grants.ts usa o cliente do utilizador — ARQ-01).
--   D. Mensagens directas: só remetente e destinatário (também no Realtime).
--
-- Fora desta migração, por falta de prova: tabelas hr_* (as funções de folha
-- salarial são SECURITY INVOKER e os corpos não estão no retrato).
--
-- Idempotente: DROP ... IF EXISTS antes de cada CREATE.

-- ── A. Escrita de membro → só leitura ───────────────────────────────────────
DROP POLICY IF EXISTS "Manage payment plans in own school" ON public.finance_payment_plans;
DROP POLICY IF EXISTS "Members read finance_payment_plans" ON public.finance_payment_plans;
CREATE POLICY "Members read finance_payment_plans" ON public.finance_payment_plans
  FOR SELECT TO authenticated USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS "Access cards in own school" ON public.siga_access_cards;
DROP POLICY IF EXISTS "Members read siga_access_cards" ON public.siga_access_cards;
CREATE POLICY "Members read siga_access_cards" ON public.siga_access_cards
  FOR SELECT TO authenticated USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS "Access logs in own school" ON public.siga_access_logs;
DROP POLICY IF EXISTS "Members read siga_access_logs" ON public.siga_access_logs;
CREATE POLICY "Members read siga_access_logs" ON public.siga_access_logs
  FOR SELECT TO authenticated USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS "Manage assessment items in own school" ON public.siga_assessment_items;
DROP POLICY IF EXISTS "Members read siga_assessment_items" ON public.siga_assessment_items;
CREATE POLICY "Members read siga_assessment_items" ON public.siga_assessment_items
  FOR SELECT TO authenticated USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS "Manage assessment scores in own school" ON public.siga_assessment_scores;
DROP POLICY IF EXISTS "Members read siga_assessment_scores" ON public.siga_assessment_scores;
CREATE POLICY "Members read siga_assessment_scores" ON public.siga_assessment_scores
  FOR SELECT TO authenticated USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS "Manage attendance justifications in own school" ON public.siga_attendance_justifications;
DROP POLICY IF EXISTS "Members read siga_attendance_justifications" ON public.siga_attendance_justifications;
CREATE POLICY "Members read siga_attendance_justifications" ON public.siga_attendance_justifications
  FOR SELECT TO authenticated USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS "Manage attendance records in own school" ON public.siga_attendance_records;
DROP POLICY IF EXISTS "Members read siga_attendance_records" ON public.siga_attendance_records;
CREATE POLICY "Members read siga_attendance_records" ON public.siga_attendance_records
  FOR SELECT TO authenticated USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS "Manage attendance sessions in own school" ON public.siga_attendance_sessions;
DROP POLICY IF EXISTS "Members read siga_attendance_sessions" ON public.siga_attendance_sessions;
CREATE POLICY "Members read siga_attendance_sessions" ON public.siga_attendance_sessions
  FOR SELECT TO authenticated USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS "Turnstile devices in own school" ON public.siga_turnstile_devices;
DROP POLICY IF EXISTS "Members read siga_turnstile_devices" ON public.siga_turnstile_devices;
CREATE POLICY "Members read siga_turnstile_devices" ON public.siga_turnstile_devices
  FOR SELECT TO authenticated USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS "School members can access student academic history" ON public.student_academic_history;
DROP POLICY IF EXISTS "Members read student_academic_history" ON public.student_academic_history;
CREATE POLICY "Members read student_academic_history" ON public.student_academic_history
  FOR SELECT TO authenticated USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS "School members can access student status history" ON public.student_status_history;
DROP POLICY IF EXISTS "Members read student_status_history" ON public.student_status_history;
CREATE POLICY "Members read student_status_history" ON public.student_status_history
  FOR SELECT TO authenticated USING (public.is_school_member(school_id));

-- ── B. Só servidor ──────────────────────────────────────────────────────────
-- Documentos pessoais: ficam as políticas por papel (can_read_students /
-- can_manage_students) que já existem.
DROP POLICY IF EXISTS "Manage school person documents" ON public.person_documents;
DROP POLICY IF EXISTS "Read school person documents" ON public.person_documents;

-- Convites e integrações (chaves de API): só o servidor.
DROP POLICY IF EXISTS "Manage invitations in own school" ON public.school_invitations;
DROP POLICY IF EXISTS "Manage school integrations in own school" ON public.school_integrations;
ALTER TABLE public.school_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.school_integrations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_invitations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.school_integrations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.school_invitations TO service_role;
GRANT ALL ON public.school_integrations TO service_role;

-- Leituras de membro sem uso no browser (o servidor lê com a chave de serviço).
DROP POLICY IF EXISTS "Read school cash expenses" ON public.siga_cash_expenses;
DROP POLICY IF EXISTS "Read school import templates" ON public.import_templates;
DROP POLICY IF EXISTS "Read attendance audits in own school" ON public.siga_attendance_audits;
DROP POLICY IF EXISTS "auth_view_school_dispatches" ON public.communication_dispatches;
DROP POLICY IF EXISTS "Read school files" ON public.siga_files;
DROP POLICY IF EXISTS "Write school files" ON public.siga_files;
DROP POLICY IF EXISTS "Read school file events" ON public.siga_file_events;
DROP POLICY IF EXISTS "Write school file events" ON public.siga_file_events;

-- ── C. Permissões de módulo: só Administrador daquela escola ───────────────
-- Função própria em vez de current_school_id()/current_profile_role(): essas
-- olham para a PRIMEIRA membership do utilizador (não a escola da linha) e
-- devolvem o código do papel (owner/admin), não o nome. Aqui verifica-se o
-- papel de administrador na escola da própria linha — correcto com várias
-- escolas. Códigos iguais a mapAppRoleToSgaCodes("Administrador").
CREATE OR REPLACE FUNCTION public.is_school_admin(p_school_id uuid)
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
    WHERE sm.user_id = (SELECT auth.uid())
      AND sm.school_id = p_school_id
      AND sm.status = 'active'
      AND lower(r.code) IN ('owner', 'admin', 'administrador')
  );
$$;
REVOKE ALL ON FUNCTION public.is_school_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_school_admin(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Admins manage staff grants" ON public.staff_module_grants;
DROP POLICY IF EXISTS "Read own or admin staff grants" ON public.staff_module_grants;
CREATE POLICY "Admins manage staff grants" ON public.staff_module_grants
  FOR ALL TO authenticated
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));
CREATE POLICY "Read own or admin staff grants" ON public.staff_module_grants
  FOR SELECT TO authenticated
  USING (
    (public.is_school_member(school_id) AND user_id = (SELECT auth.uid()))
    OR public.is_school_admin(school_id)
  );

-- ── D. Mensagens directas: só remetente e destinatário ─────────────────────
DROP POLICY IF EXISTS "Read own school direct messages" ON public.siga_direct_messages;
CREATE POLICY "Read own school direct messages" ON public.siga_direct_messages
  FOR SELECT TO authenticated
  USING (
    public.is_school_member(school_id)
    AND ((SELECT auth.uid()) = sender_id OR (SELECT auth.uid()) = recipient_id)
  );

NOTIFY pgrst, 'reload schema';

-- ══════════ 20260926100000_direct_messages_server_only_insert.sql ══════════
-- SIGA — mensagens directas: só o servidor as grava.
--
-- A política "Send school direct messages" deixava qualquer membro da escola
-- (incluindo alunos e encarregados) inserir mensagens pela API REST para
-- qualquer destinatário. O servidor (sendDirectMessage) passou a aplicar a
-- regra "alunos e encarregados só escrevem ao pessoal da escola"; sem retirar
-- esta política, bastava contorná-lo. O browser só lê (Realtime), e o envio já
-- passa sempre pelo servidor, com a chave de serviço.
--
-- Idempotente.

DROP POLICY IF EXISTS "Send school direct messages" ON public.siga_direct_messages;
REVOKE INSERT, UPDATE, DELETE ON public.siga_direct_messages FROM anon, authenticated;

-- ══════════ 20260926120000_hr_structure_admin_only_writes.sql ══════════
-- Endurecimento RLS (2026-09-26): departamentos e cargos (hr_departments,
-- hr_positions).
--
-- Complemento de 20260925190000_harden_member_wide_policies.sql, que deixou as
-- tabelas hr_* de fora por falta de prova. Para estas duas há prova:
--   · as políticas INSERT e UPDATE usam só is_school_member(school_id), que é
--     verdadeiro para alunos e encarregados — um aluno podia criar ou renomear
--     departamentos e cargos pela API REST;
--   · nenhuma função da base escreve nelas (procurado em todas as migrações);
--   · o único escritor da aplicação é o importador de funcionários, que usa a
--     chave de serviço (src/features/import/server.ts) e não é afectado.
--
-- A escrita directa passa a ser só do Administrador da escola da linha
-- (public.is_school_admin, criada em 20260925190000 — aplicar essa primeiro).
-- A leitura por membro mantém-se: nomes de departamentos e cargos não são
-- dados sensíveis e o painel de RH lê-os com o JWT.
--
-- Idempotente: DROP ... IF EXISTS antes de cada CREATE.

DROP POLICY IF EXISTS "Create hr_departments in own school" ON public.hr_departments;
CREATE POLICY "Create hr_departments in own school" ON public.hr_departments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_school_admin(school_id) AND created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Update hr_departments in own school" ON public.hr_departments;
CREATE POLICY "Update hr_departments in own school" ON public.hr_departments
  FOR UPDATE TO authenticated
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS "Create hr_positions in own school" ON public.hr_positions;
CREATE POLICY "Create hr_positions in own school" ON public.hr_positions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_school_admin(school_id) AND created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Update hr_positions in own school" ON public.hr_positions;
CREATE POLICY "Update hr_positions in own school" ON public.hr_positions
  FOR UPDATE TO authenticated
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

-- O retrato mostra SELECT concedido a anon. Sem política para anon o RLS já
-- devolve zero linhas; retirar a concessão fecha também a porta.
REVOKE ALL ON TABLE public.hr_departments FROM anon;
REVOKE ALL ON TABLE public.hr_positions FROM anon;

-- ══════════ 20260926140000_timetable_lesson_details_tasks_reminders.sql ══════════
-- Horários: detalhes da aula, tarefas da turma e lembretes da véspera (2026-09-26).
--
-- Aditiva: não altera tabelas existentes. Quatro tabelas só do servidor
-- (FORCE RLS + REVOKE a anon/authenticated, sem políticas): a autorização é
-- feita em src/features/academic/timetable-lessons.ts (professor da disciplina,
-- Administrador ou Secretaria para escrever; aluno/encarregado só lêem os da
-- sua turma, pelo servidor).
--
-- Idempotente: pode correr mais do que uma vez.

-- ── 1. Detalhes de cada bloco do horário ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.siga_timetable_slot_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  timetable_slot_id uuid NOT NULL REFERENCES public.timetable_slots(id) ON DELETE CASCADE,
  lesson_type text NOT NULL DEFAULT 'teorica' CHECK (
    lesson_type IN ('teorica', 'pratica', 'laboratorio', 'revisao', 'avaliacao', 'outra')
  ),
  delivery_mode text NOT NULL DEFAULT 'presencial' CHECK (
    delivery_mode IN ('presencial', 'zoom', 'online', 'hibrido')
  ),
  online_url text CHECK (online_url IS NULL OR (char_length(online_url) <= 500 AND online_url ~* '^https://')),
  topic text CHECK (topic IS NULL OR char_length(topic) <= 200),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS siga_timetable_slot_details_slot_idx
  ON public.siga_timetable_slot_details (timetable_slot_id);
CREATE INDEX IF NOT EXISTS siga_timetable_slot_details_school_idx
  ON public.siga_timetable_slot_details (school_id);

-- ── 2. Tarefas da turma (TPC, trabalhos, leituras) ────────────────────────
CREATE TABLE IF NOT EXISTS public.siga_class_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_subject_id uuid NOT NULL REFERENCES public.class_subjects(id) ON DELETE CASCADE,
  timetable_slot_id uuid REFERENCES public.timetable_slots(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'tpc' CHECK (
    kind IN ('tpc', 'trabalho', 'leitura', 'projecto', 'pesquisa', 'outra')
  ),
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 160),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  due_on date,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'archived')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS siga_class_tasks_class_subject_idx
  ON public.siga_class_tasks (school_id, class_subject_id, due_on);

-- ── 3. Configuração dos lembretes da véspera (uma por escola) ─────────────
CREATE TABLE IF NOT EXISTS public.siga_lesson_reminder_settings (
  school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  -- Hora local (Luanda) a que sai o lembrete do dia seguinte.
  send_hour smallint NOT NULL DEFAULT 18 CHECK (send_hour BETWEEN 0 AND 23),
  notify_teachers boolean NOT NULL DEFAULT true,
  notify_students boolean NOT NULL DEFAULT true,
  notify_guardians boolean NOT NULL DEFAULT false,
  channel_in_app boolean NOT NULL DEFAULT true,
  channel_email boolean NOT NULL DEFAULT false,
  channel_sms boolean NOT NULL DEFAULT false,
  -- Na publicação de um horário, avisar professores e alunos da turma.
  notify_on_publish boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── 4. Registo de envios (nunca duplicar o mesmo lembrete) ────────────────
CREATE TABLE IF NOT EXISTS public.siga_lesson_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_date date NOT NULL,
  channel text NOT NULL CHECK (channel IN ('in_app', 'email', 'sms')),
  lessons_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'skipped')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS siga_lesson_reminder_log_once_idx
  ON public.siga_lesson_reminder_log (school_id, user_id, lesson_date, channel);

-- ── updated_at ────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS siga_timetable_slot_details_touch ON public.siga_timetable_slot_details;
CREATE TRIGGER siga_timetable_slot_details_touch
  BEFORE UPDATE ON public.siga_timetable_slot_details
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

DROP TRIGGER IF EXISTS siga_class_tasks_touch ON public.siga_class_tasks;
CREATE TRIGGER siga_class_tasks_touch
  BEFORE UPDATE ON public.siga_class_tasks
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

DROP TRIGGER IF EXISTS siga_lesson_reminder_settings_touch ON public.siga_lesson_reminder_settings;
CREATE TRIGGER siga_lesson_reminder_settings_touch
  BEFORE UPDATE ON public.siga_lesson_reminder_settings
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

-- ── Só o servidor ─────────────────────────────────────────────────────────
ALTER TABLE public.siga_timetable_slot_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_timetable_slot_details FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_timetable_slot_details FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_timetable_slot_details TO service_role;

ALTER TABLE public.siga_class_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_class_tasks FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_class_tasks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_class_tasks TO service_role;

ALTER TABLE public.siga_lesson_reminder_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_lesson_reminder_settings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_lesson_reminder_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_lesson_reminder_settings TO service_role;

ALTER TABLE public.siga_lesson_reminder_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_lesson_reminder_log FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_lesson_reminder_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_lesson_reminder_log TO service_role;

-- ══════════ 20260926160000_grade_score_history.sql ══════════
-- Histórico de cada nota (2026-09-26).
--
-- As funções da base `upsert_grade_score` e `review_grade_change` já gravam
-- em `public.grade_score_history`, mas a tabela nunca foi criada na produção:
-- qualquer chamada a essas funções falhava. A aplicação também passa a gravar
-- aqui cada alteração (valor anterior, novo, quem, motivo, quem aprovou).
--
-- Aditiva e idempotente. Só do servidor (FORCE RLS, sem acesso directo).

CREATE TABLE IF NOT EXISTS public.grade_score_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  grade_score_id uuid NOT NULL REFERENCES public.grade_scores(id) ON DELETE CASCADE,
  previous_score numeric,
  new_score numeric,
  reason text CHECK (reason IS NULL OR char_length(reason) <= 1000),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- 'launch' | 'change' | 'request_approved' | 'request_rejected'
  kind text NOT NULL DEFAULT 'change' CHECK (
    kind IN ('launch', 'change', 'request_approved', 'request_rejected')
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS grade_score_history_score_idx
  ON public.grade_score_history (school_id, grade_score_id, created_at DESC);

ALTER TABLE public.grade_score_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_score_history FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.grade_score_history FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.grade_score_history TO service_role;


-- ══════════ 20260924010712_add_import_table_specs_catalog.sql ══════════
-- Governed catalog of public SGA tables for premium import/export.
-- Non-destructive: adds metadata only; no existing business table is modified.

create table if not exists public.import_table_specs (
  id uuid primary key default gen_random_uuid(),
  table_schema text not null default 'public',
  table_name text not null,
  direct_import_policy text not null default 'review',
  export_policy text not null default 'review',
  sensitivity text not null default 'normal',
  module_code text,
  dependency_rank integer,
  natural_key_columns jsonb not null default '[]'::jsonb,
  fk_dependencies jsonb not null default '[]'::jsonb,
  derived_from jsonb not null default '[]'::jsonb,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(table_schema, table_name),
  check (direct_import_policy in ('allow','controlled','review','deny')),
  check (export_policy in ('allow','controlled','review','deny')),
  check (sensitivity in ('normal','sensitive','secret','internal'))
);

insert into public.import_table_specs
(table_schema,table_name,direct_import_policy,export_policy,sensitivity,module_code,dependency_rank,natural_key_columns,fk_dependencies,derived_from,notes)
select
 'public', t.table_name,
 case
   when t.table_name in ('school_integration_secrets','calendar_feed_tokens','verification_otps','audit_logs','saas_audit_logs','import_audits','finance_gateway_webhook_events','siga_file_events','siga_attendance_audits','alumni_privacy_audit','document_signatures','school_invitations') then 'deny'
   when t.table_name in ('people','students','student_guardians','teachers','teacher_subjects','hr_employments','hr_contracts','hr_departments','hr_positions','academic_years','academic_levels','grade_levels','programs','subjects','subject_types','curriculum_areas','curriculum_subjects','curricula','campuses','rooms','school_shifts','school_shift_slots','class_groups','class_subjects','enrollments','timetable_slots','academic_schedules','terms','siga_attendance_sessions','siga_attendance_records','siga_assessment_items','siga_assessment_scores','gradebooks','grade_items','grade_scores','grade_sheets','grade_sheet_rows','report_cards','fee_plans','fee_items','finance_contracts','finance_invoices','finance_receipts','finance_payment_plans','student_status_history','student_academic_history') then 'controlled'
   else 'review'
 end,
 case
   when t.table_name in ('school_integration_secrets','calendar_feed_tokens','verification_otps','audit_logs','saas_audit_logs','import_audits','finance_gateway_webhook_events','siga_file_events','siga_attendance_audits','alumni_privacy_audit','document_signatures') then 'deny'
   else 'review'
 end,
 case
   when t.table_name in ('school_integration_secrets','calendar_feed_tokens','verification_otps','audit_logs','saas_audit_logs','finance_gateway_webhook_events') then 'secret'
   when t.table_name like 'audit%' or t.table_name like '%_audits' then 'internal'
   else 'normal'
 end,
 case
   when t.table_name in ('people','students','student_guardians') then 'pessoas'
   when t.table_name in ('teachers','teacher_subjects','hr_employments','hr_contracts','hr_departments','hr_positions') then 'professores'
   when t.table_name in ('academic_years','academic_levels','grade_levels','programs','subjects','subject_types','curriculum_areas','curriculum_subjects','curricula','class_groups','class_subjects','enrollments','terms','academic_schedules','timetable_slots','campuses','rooms','school_shifts','school_shift_slots') then 'academico'
   when t.table_name in ('siga_attendance_sessions','siga_attendance_records') then 'presencas'
   when t.table_name in ('siga_assessment_items','siga_assessment_scores','gradebooks','grade_items','grade_scores','grade_sheets','grade_sheet_rows','report_cards') then 'avaliacoes'
   when t.table_name like 'finance_%' or t.table_name in ('fee_plans','fee_items') then 'financeiro'
   when t.table_name like 'alumni_%' then 'alumni'
   else null
 end,
 case
   when t.table_name='schools' then 0
   when t.table_name in ('people','academic_years','academic_levels','campuses','school_shifts') then 10
   when t.table_name in ('students','teachers','grade_levels','programs','subjects','rooms','hr_departments','hr_positions') then 20
   when t.table_name in ('class_groups','class_subjects','terms','curricula','teacher_subjects','hr_employments') then 30
   when t.table_name in ('enrollments','academic_schedules','school_shift_slots','curriculum_subjects','hr_contracts') then 40
   when t.table_name in ('timetable_slots','fee_plans','fee_items') then 50
   when t.table_name in ('siga_attendance_sessions','siga_assessment_items','gradebooks','grade_sheets') then 60
   when t.table_name in ('siga_attendance_records','siga_assessment_scores','grade_items','grade_scores','grade_sheet_rows','report_cards','finance_contracts','finance_invoices') then 70
   else null
 end,
 '[]'::jsonb,'[]'::jsonb,'[]'::jsonb,
 case when t.table_name in ('school_integration_secrets','calendar_feed_tokens','verification_otps','audit_logs','saas_audit_logs','import_audits','finance_gateway_webhook_events') then 'Não importar directamente; usar operações server-side controladas.' else null end
from information_schema.tables t
where t.table_schema='public' and t.table_type='BASE TABLE'
on conflict (table_schema,table_name) do update set
  direct_import_policy=excluded.direct_import_policy,
  export_policy=excluded.export_policy,
  sensitivity=excluded.sensitivity,
  module_code=excluded.module_code,
  dependency_rank=excluded.dependency_rank,
  notes=coalesce(excluded.notes, public.import_table_specs.notes),
  updated_at=now();

create index if not exists import_table_specs_policy_idx on public.import_table_specs (direct_import_policy, module_code, dependency_rank);
create index if not exists import_table_specs_module_idx on public.import_table_specs (module_code, dependency_rank);

comment on table public.import_table_specs is 'Catálogo governado das 156 tabelas públicas do SGA para import/export. Política conservadora contra escrita cega em segurança, auditoria e segredos.';


-- ══════════ 20260924010713_harden_import_table_specs_rls.sql ══════════
-- Keep the schema catalog server-side by default.
alter table public.import_table_specs enable row level security;
alter table public.import_table_specs force row level security;
comment on table public.import_table_specs is 'Catálogo governado do schema público do SGA para import/export. Uso server-side; sem acesso directo do cliente por defeito.';


-- ══════════ 20260924010749_enrich_import_table_specs_dependencies.sql ══════════
-- Enrich governed import/export catalog from the live SGA FK and UNIQUE constraints.
update public.import_table_specs s
set fk_dependencies = coalesce((
  select jsonb_agg(
    jsonb_build_object(
      'columns', src.cols,
      'target_table', src.target_table,
      'target_columns', src.target_cols
    ) order by src.target_table, src.target_cols::text
  )
  from (
    select
      array_agg(kcu.column_name order by kcu.ordinal_position) as cols,
      ccu.table_name as target_table,
      array_agg(ccu.column_name order by kcu.ordinal_position) as target_cols
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name=tc.constraint_name
     and kcu.table_schema=tc.table_schema
     and kcu.table_name=tc.table_name
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name=tc.constraint_name
     and ccu.constraint_schema=tc.constraint_schema
    where tc.constraint_type='FOREIGN KEY'
      and tc.table_schema=s.table_schema
      and tc.table_name=s.table_name
    group by ccu.table_name, tc.constraint_name
  ) src
), '[]'::jsonb),
natural_key_columns = coalesce((
  select to_jsonb(array_agg(kcu.column_name order by kcu.ordinal_position))
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name=tc.constraint_name
   and kcu.table_schema=tc.table_schema
   and kcu.table_name=tc.table_name
  where tc.table_schema=s.table_schema
    and tc.table_name=s.table_name
    and tc.constraint_type='UNIQUE'
  group by tc.constraint_name
  order by tc.constraint_name
  limit 1
), '[]'::jsonb),
updated_at=now()
where s.table_schema='public';

comment on column public.import_table_specs.fk_dependencies is 'Foreign-key dependency graph extracted from the live SGA schema.';
comment on column public.import_table_specs.natural_key_columns is 'Candidate natural/unique key columns discovered from live UNIQUE constraints; importer must still validate semantic suitability.';


-- ══════════ 20260924011200_authorize_billing_settings_for_controlled_import.sql ══════════
-- Governança: school_billing_settings é configuração operacional segura para
-- importação controlada. Segredos e credenciais continuam fora do catálogo importável.
update public.import_table_specs
set direct_import_policy = 'controlled',
    module_code = 'financeiro',
    notes = concat_ws(' ', nullif(notes, ''), 'Autorizada para importação controlada: parâmetros de cobrança escolar, sem segredos.')
where table_schema = 'public'
  and table_name = 'school_billing_settings';


-- ══════════ 20260924012020_authorize_enrollment_applications_controlled_import.sql ══════════
-- Governança: candidaturas são dados escolares de negócio e podem ser
-- importadas de forma controlada. A importação não cria aluno automaticamente.
update public.import_table_specs
set direct_import_policy = 'controlled',
    module_code = 'inscricoes',
    notes = concat_ws(' ', nullif(notes, ''), 'Importação controlada: candidaturas escolares; não cria aluno automaticamente.')
where table_schema = 'public'
  and table_name = 'enrollment_applications';


-- ══════════ 20260924012304_govern_validated_export_targets.sql ══════════
update public.import_table_specs
set export_policy='controlled',
    notes=concat_ws(' ', nullif(notes,''), 'Exportação bidireccional validada em 2026-09-24.')
where table_schema='public' and table_name in
('hr_positions','hr_employments','hr_departments','grade_levels','rooms','timetable_slots','finance_invoices','finance_contracts');


-- ══════════ 20260924012347_govern_validated_application_attendance_exports.sql ══════════
update public.import_table_specs
set export_policy='controlled',
    notes=concat_ws(' ', nullif(notes,''), 'Exportação bidireccional validada em 2026-09-24.')
where table_schema='public' and table_name in
('enrollment_applications','siga_attendance_sessions','siga_attendance_records');

-- Catálogo só do servidor (o importador usa a chave de serviço).
REVOKE ALL ON public.import_table_specs FROM PUBLIC, anon, authenticated;


-- ══════════ 20260926180000_tenant_mailboxes_server_only.sql ══════════
-- Caixas de correio institucionais por tenant (Control Center, Fase 5).
--
-- Substitui `supabase/APPLY_MAILBOXES.sql`, que nunca foi aplicado e não podia
-- ser: as políticas liam `tenant_members`, tabela que a base SGA não tem.
-- Todo o código (`saas/server.ts`, `saas/school-domain-ops.ts`,
-- `api/saas/mailboxes.tsx`) usa a chave de serviço depois de validar o acesso
-- ao tenant, por isso a tabela fica só do servidor: sem políticas de cliente.
--
-- Aditiva e idempotente: não altera nenhuma tabela existente.

CREATE TABLE IF NOT EXISTS public.tenant_mailboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  display_name text CHECK (display_name IS NULL OR char_length(display_name) <= 160),
  provider text NOT NULL DEFAULT 'simulated' CHECK (provider IN ('simulated', 'zoho', 'google')),
  provider_account_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_mailboxes_email_key UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS tenant_mailboxes_tenant_created_idx
  ON public.tenant_mailboxes (tenant_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_tenant_mailboxes_touch ON public.tenant_mailboxes;
CREATE TRIGGER trg_tenant_mailboxes_touch
  BEFORE UPDATE ON public.tenant_mailboxes
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

ALTER TABLE public.tenant_mailboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_mailboxes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_mailboxes FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.tenant_mailboxes IS
  'Caixas de correio institucionais por tenant. Só o servidor (chave de serviço) lê e escreve.';


-- ══════════ 20260926200000_assessment_rule_publish_server.sql ══════════
-- Modelos de avaliação: publicar uma nova versão da regra da escola pelo servidor.
--
-- `publish_assessment_rule_version` (produção) não é SECURITY DEFINER e
-- `assessment_rule_sets` só tem política de leitura: chamada com o token do
-- utilizador, a actualização e a inserção são recusadas pela RLS. Esta função
-- faz o mesmo numa só transacção, mas só a chave de serviço a pode executar;
-- o servidor (`assessment-models.ts`) valida antes o perfil e a 2FA (aal2) e
-- passa o autor explicitamente, porque `auth.uid()` é nulo com a chave de serviço.
--
-- Mesmas validações da função original. A versão anterior é aposentada e a nova
-- activada na mesma transacção: nunca fica a escola sem regra activa.
--
-- Aditiva e idempotente.

-- Já inclui `promotion_rules` (regras de transição por ciclo, 20260927130000):
-- apaga a assinatura anterior, sem esse parâmetro, para nunca ficarem duas
-- versões — repetir este ficheiro depois do 20260927130000 não cria ambiguidade.

DROP FUNCTION IF EXISTS public.siga_publish_assessment_rule(
  uuid, uuid, text, numeric, numeric, numeric, numeric, text, boolean, boolean, uuid[], boolean
);
DROP FUNCTION IF EXISTS private.siga_publish_assessment_rule(
  uuid, uuid, text, numeric, numeric, numeric, numeric, text, boolean, boolean, uuid[], boolean
);

CREATE OR REPLACE FUNCTION private.siga_publish_assessment_rule(
  target_school_id uuid,
  actor uuid,
  rule_name text,
  continuous_weight_value numeric,
  exam_weight_value numeric,
  passing_grade_value numeric,
  maximum_absence_value numeric,
  rounding_method_value text,
  require_change_approval boolean,
  lock_after_publication_value boolean,
  key_subject_ids uuid[] DEFAULT '{}'::uuid[],
  key_subjects_cause_failure boolean DEFAULT true,
  promotion_rules jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  active_scale public.grading_scales%rowtype;
  next_version integer;
  new_rule_id uuid;
  key_subject uuid;
begin
  if target_school_id is null or actor is null then
    raise exception using errcode = '22023', message = 'Escola e autor são obrigatórios.';
  end if;

  -- Uma publicação de cada vez por escola.
  perform pg_advisory_xact_lock(hashtext('siga_publish_assessment_rule:' || target_school_id::text));

  select * into active_scale from public.grading_scales
  where school_id = target_school_id and is_active
  order by version desc limit 1;
  if not found then
    raise exception using errcode = '55000', message = 'Escala de notas activa em falta.';
  end if;

  if continuous_weight_value < 0 or exam_weight_value < 0
     or continuous_weight_value + exam_weight_value <> 100
     or passing_grade_value < active_scale.minimum_value
     or passing_grade_value > active_scale.maximum_value
     or maximum_absence_value < 0 or maximum_absence_value > 100
     or rounding_method_value not in ('none', 'nearest', 'up', 'down') then
    raise exception using errcode = '22023', message = 'Parâmetros de regra inválidos.';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.assessment_rule_sets
  where school_id = target_school_id and code = 'DEFAULT';

  update public.assessment_rule_sets
  set status = 'retired'
  where school_id = target_school_id and code = 'DEFAULT' and status = 'active';

  insert into public.assessment_rule_sets (
    school_id, grading_scale_id, code, name, version, status, continuous_weight, exam_weight,
    passing_value, maximum_absence_percentage, rounding_method, grade_change_requires_approval,
    lock_after_publication, formula, created_by
  ) values (
    target_school_id, active_scale.id, 'DEFAULT',
    coalesce(nullif(btrim(rule_name), ''), 'Regra principal de avaliação'),
    next_version, 'active',
    continuous_weight_value, exam_weight_value, passing_grade_value, maximum_absence_value,
    rounding_method_value, require_change_approval, lock_after_publication_value,
    jsonb_build_object(
      'operation', 'weighted_average',
      'components', jsonb_build_array(
        jsonb_build_object('code', 'continuous', 'weight', continuous_weight_value),
        jsonb_build_object('code', 'exam', 'weight', exam_weight_value)
      ),
      'keySubjectsCauseFailure', key_subjects_cause_failure,
      'promotion', coalesce(promotion_rules, '{}'::jsonb),
      'scale', jsonb_build_object(
        'minimum', active_scale.minimum_value,
        'maximum', active_scale.maximum_value,
        'passing', passing_grade_value,
        'decimalPlaces', active_scale.decimal_places
      )
    ),
    actor
  ) returning id into new_rule_id;

  foreach key_subject in array coalesce(key_subject_ids, '{}') loop
    if not exists (
      select 1 from public.subjects
      where school_id = target_school_id and id = key_subject and status = 'active'
    ) then
      raise exception using errcode = '22023', message = 'Disciplina-chave inválida.';
    end if;
    insert into public.assessment_key_subjects (school_id, rule_set_id, subject_id)
    values (target_school_id, new_rule_id, key_subject)
    on conflict do nothing;
  end loop;

  return jsonb_build_object('ruleSetId', new_rule_id, 'version', next_version, 'status', 'active');
end;
$function$;

REVOKE ALL ON FUNCTION private.siga_publish_assessment_rule(
  uuid, uuid, text, numeric, numeric, numeric, numeric, text, boolean, boolean, uuid[], boolean, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.siga_publish_assessment_rule(
  uuid, uuid, text, numeric, numeric, numeric, numeric, text, boolean, boolean, uuid[], boolean, jsonb
) TO service_role;

-- A API (PostgREST) só expõe `public`: invólucro com os mesmos privilégios.
GRANT USAGE ON SCHEMA private TO service_role;

CREATE OR REPLACE FUNCTION public.siga_publish_assessment_rule(
  target_school_id uuid,
  actor uuid,
  rule_name text,
  continuous_weight_value numeric,
  exam_weight_value numeric,
  passing_grade_value numeric,
  maximum_absence_value numeric,
  rounding_method_value text,
  require_change_approval boolean,
  lock_after_publication_value boolean,
  key_subject_ids uuid[] DEFAULT '{}'::uuid[],
  key_subjects_cause_failure boolean DEFAULT true,
  promotion_rules jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
SET search_path TO ''
AS $function$
  select private.siga_publish_assessment_rule(
    target_school_id, actor, rule_name, continuous_weight_value, exam_weight_value,
    passing_grade_value, maximum_absence_value, rounding_method_value,
    require_change_approval, lock_after_publication_value, key_subject_ids,
    key_subjects_cause_failure, promotion_rules
  );
$function$;

REVOKE ALL ON FUNCTION public.siga_publish_assessment_rule(
  uuid, uuid, text, numeric, numeric, numeric, numeric, text, boolean, boolean, uuid[], boolean, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siga_publish_assessment_rule(
  uuid, uuid, text, numeric, numeric, numeric, numeric, text, boolean, boolean, uuid[], boolean, jsonb
) TO service_role;

-- ══════════ 20260926220000_exam_sessions_registrations.sql ══════════
-- Recuperação, exames e resultado final.
--
-- Uma época de exames (recurso, exame especial, exame final, melhoria) pertence
-- ao ano lectivo. Cada inscrição liga uma matrícula a uma disciplina, com a média
-- de origem lida da pauta anual, a nota do exame e a média que resulta.
--
-- Nenhum limiar fica no código nem aqui: a nota de aprovação e o arredondamento
-- vêm da regra de avaliação da escola; quantas negativas dão acesso ao exame e
-- como a nota do exame entra na média (substitui, média, a maior) são
-- parâmetros de cada época, decididos pela escola.
--
-- Só o servidor lê e escreve (chave de serviço depois de validar o perfil):
-- `is_school_member` inclui alunos e encarregados. Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS public.siga_exam_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('recurso', 'exame_especial', 'exame_final', 'melhoria')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  starts_on date,
  ends_on date,
  -- Máximo de disciplinas em negativa para ter acesso (NULL = sem limite).
  max_failed_subjects integer CHECK (max_failed_subjects IS NULL OR max_failed_subjects BETWEEN 1 AND 30),
  result_method text NOT NULL DEFAULT 'replace'
    CHECK (result_method IN ('replace', 'average', 'max')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT siga_exam_sessions_dates_check
    CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS siga_exam_sessions_school_year_idx
  ON public.siga_exam_sessions (school_id, academic_year_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.siga_exam_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.siga_exam_sessions(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  class_group_id uuid NOT NULL REFERENCES public.class_groups(id) ON DELETE CASCADE,
  grade_sheet_id uuid REFERENCES public.grade_sheets(id) ON DELETE SET NULL,
  original_average numeric(6, 2),
  exam_date date,
  room text CHECK (room IS NULL OR char_length(room) <= 80),
  jury text CHECK (jury IS NULL OR char_length(jury) <= 300),
  score numeric(6, 2),
  final_average numeric(6, 2),
  status text NOT NULL DEFAULT 'registered'
    CHECK (status IN ('registered', 'absent', 'graded', 'cancelled')),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT siga_exam_registrations_unique UNIQUE (session_id, enrollment_id, subject_id),
  CONSTRAINT siga_exam_registrations_graded_check
    CHECK (status <> 'graded' OR (score IS NOT NULL AND final_average IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS siga_exam_registrations_session_class_idx
  ON public.siga_exam_registrations (session_id, class_group_id);
CREATE INDEX IF NOT EXISTS siga_exam_registrations_enrollment_idx
  ON public.siga_exam_registrations (enrollment_id);
CREATE INDEX IF NOT EXISTS siga_exam_registrations_school_idx
  ON public.siga_exam_registrations (school_id);
CREATE INDEX IF NOT EXISTS siga_exam_registrations_subject_idx
  ON public.siga_exam_registrations (subject_id);
CREATE INDEX IF NOT EXISTS siga_exam_registrations_class_group_idx
  ON public.siga_exam_registrations (class_group_id);
CREATE INDEX IF NOT EXISTS siga_exam_registrations_grade_sheet_idx
  ON public.siga_exam_registrations (grade_sheet_id);
CREATE INDEX IF NOT EXISTS siga_exam_sessions_year_idx
  ON public.siga_exam_sessions (academic_year_id);

DROP TRIGGER IF EXISTS trg_siga_exam_sessions_touch ON public.siga_exam_sessions;
CREATE TRIGGER trg_siga_exam_sessions_touch
  BEFORE UPDATE ON public.siga_exam_sessions
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

DROP TRIGGER IF EXISTS trg_siga_exam_registrations_touch ON public.siga_exam_registrations;
CREATE TRIGGER trg_siga_exam_registrations_touch
  BEFORE UPDATE ON public.siga_exam_registrations
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

ALTER TABLE public.siga_exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_exam_sessions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_exam_sessions FROM PUBLIC, anon, authenticated;

ALTER TABLE public.siga_exam_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_exam_registrations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_exam_registrations FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.siga_exam_sessions IS
  'Épocas de exame (recurso, especial, final, melhoria) por ano lectivo. Só o servidor.';
COMMENT ON TABLE public.siga_exam_registrations IS
  'Inscrições em exame por matrícula e disciplina, com média de origem, nota e média final. Só o servidor.';


-- ══════════ 20260927090000_student_history_server_only.sql ══════════
-- Histórico académico e histórico de estados do aluno: só o servidor.
--
-- `20260925190000_harden_member_wide_policies.sql` tirou a escrita a qualquer
-- membro, mas deixou a leitura por `is_school_member` — que é verdadeiro para
-- alunos e encarregados: qualquer aluno lia as médias finais, o resultado e as
-- mudanças de estado de todos os colegas da escola. Nenhum código do browser lê
-- estas tabelas; o servidor usa a chave de serviço depois de validar o perfil
-- (`students/server.ts`, importação/exportação, resultado final).
--
-- Idempotente. Não apaga dados.

DROP POLICY IF EXISTS "Members read student_academic_history" ON public.student_academic_history;
DROP POLICY IF EXISTS "School members can access student academic history" ON public.student_academic_history;
ALTER TABLE public.student_academic_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_academic_history FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_academic_history FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.student_academic_history TO service_role;

DROP POLICY IF EXISTS "Members read student_status_history" ON public.student_status_history;
DROP POLICY IF EXISTS "School members can access student status history" ON public.student_status_history;
DROP POLICY IF EXISTS "Read student status history in own school" ON public.student_status_history;
ALTER TABLE public.student_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_status_history FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_status_history FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.student_status_history TO service_role;


-- ══════════ 20260927110000_grade_sheet_absences_from_siga.sql ══════════
-- Pauta oficial: faltas a partir da chamada do SIGA.
--
-- `private.build_grade_sheet` calcula a percentagem de faltas em
-- `attendance_records` / `attendance_sessions`, mas a chamada do SIGA grava em
-- `siga_attendance_records` / `siga_attendance_sessions`. Resultado: a
-- percentagem saía 0 e a pauta nunca reprovava por faltas.
--
-- A função não é substituída inteira (a versão do repositório foi capturada a
-- 2026-09-08 e a produção pode ter mudado). Lê-se a definição que está na base
-- e troca-se só o bloco das faltas: passa a contar primeiro as presenças do
-- SIGA (faltas ÷ aulas registadas, sem as justificadas) e, só se o aluno não
-- tiver nenhuma, o cálculo antigo. Se o bloco não estiver como esperado, nada
-- é alterado e fica um aviso (NOTICE). Pode correr-se mais do que uma vez.

DO $migration$
DECLARE
  fn regprocedure;
  current_def text;
  patched_def text;
  pattern text := 'select coalesce\(\s*\(\s*select \(count\(\*\) filter \(where ar\.status in \(''absent''\)\)::numeric \* 100\)(.*?from public\.attendance_records ar.*?and ar\.status <> ''excused''\s*)\),\s*0\s*\) into absence_pct;';
  replacement text := 'select coalesce(
      (
        select (count(*) filter (where sr.status = ''absent'')::numeric * 100)
               / nullif(count(*), 0)
        from public.siga_attendance_records sr
        join public.siga_attendance_sessions ss on ss.school_id = sr.school_id and ss.id = sr.session_id
        join public.enrollments en on en.school_id = sr.school_id and en.student_id = sr.student_id
        where sr.school_id = target_school_id
          and en.id = enrollment_row.id
          and ss.class_group_id = target_class_group_id
          and sr.status <> ''excused''
      ),
      (
        select (count(*) filter (where ar.status in (''absent''))::numeric * 100)\1),
      0
    ) into absence_pct;';
BEGIN
  fn := to_regprocedure('private.build_grade_sheet(uuid, uuid, uuid, text)');
  IF fn IS NULL THEN
    RAISE NOTICE 'build_grade_sheet: função não encontrada; nada alterado.';
    RETURN;
  END IF;

  current_def := pg_get_functiondef(fn);
  IF position('siga_attendance_records' in current_def) > 0 THEN
    RAISE NOTICE 'build_grade_sheet: já lê as presenças do SIGA; nada alterado.';
    RETURN;
  END IF;

  patched_def := regexp_replace(current_def, pattern, replacement);
  IF patched_def = current_def THEN
    RAISE NOTICE 'build_grade_sheet: bloco das faltas diferente do esperado; nada alterado.';
    RETURN;
  END IF;

  EXECUTE patched_def;
  RAISE NOTICE 'build_grade_sheet: faltas passam a vir da chamada do SIGA.';
END
$migration$;


-- ══════════ 20260927130000_assessment_rule_promotion_rules.sql ══════════
-- Modelos de avaliação: regras de transição por ciclo.
--
-- As regras que decidem "Transita / Não transita / Admitido a exame / Apto (PAP)"
-- por ciclo (máximo de negativas, média de admissão a exame, PAP) estavam fixas
-- no código. Passam a fazer parte do modelo publicado pela escola:
-- `siga_publish_assessment_rule` ganha `promotion_rules` (jsonb), guardado em
-- `assessment_rule_sets.formula -> 'promotion'`. Sem ele, os ecrãs usam as
-- regras que o SIGA já aplicava.
--
-- Substitui a versão de `20260926200000` (a assinatura muda: apaga-se a antiga
-- para não ficarem duas). Idempotente.

DROP FUNCTION IF EXISTS public.siga_publish_assessment_rule(
  uuid, uuid, text, numeric, numeric, numeric, numeric, text, boolean, boolean, uuid[], boolean
);
DROP FUNCTION IF EXISTS private.siga_publish_assessment_rule(
  uuid, uuid, text, numeric, numeric, numeric, numeric, text, boolean, boolean, uuid[], boolean
);

CREATE OR REPLACE FUNCTION private.siga_publish_assessment_rule(
  target_school_id uuid,
  actor uuid,
  rule_name text,
  continuous_weight_value numeric,
  exam_weight_value numeric,
  passing_grade_value numeric,
  maximum_absence_value numeric,
  rounding_method_value text,
  require_change_approval boolean,
  lock_after_publication_value boolean,
  key_subject_ids uuid[] DEFAULT '{}'::uuid[],
  key_subjects_cause_failure boolean DEFAULT true,
  promotion_rules jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  active_scale public.grading_scales%rowtype;
  next_version integer;
  new_rule_id uuid;
  key_subject uuid;
begin
  if target_school_id is null or actor is null then
    raise exception using errcode = '22023', message = 'Escola e autor são obrigatórios.';
  end if;

  -- Uma publicação de cada vez por escola.
  perform pg_advisory_xact_lock(hashtext('siga_publish_assessment_rule:' || target_school_id::text));

  select * into active_scale from public.grading_scales
  where school_id = target_school_id and is_active
  order by version desc limit 1;
  if not found then
    raise exception using errcode = '55000', message = 'Escala de notas activa em falta.';
  end if;

  if continuous_weight_value < 0 or exam_weight_value < 0
     or continuous_weight_value + exam_weight_value <> 100
     or passing_grade_value < active_scale.minimum_value
     or passing_grade_value > active_scale.maximum_value
     or maximum_absence_value < 0 or maximum_absence_value > 100
     or rounding_method_value not in ('none', 'nearest', 'up', 'down') then
    raise exception using errcode = '22023', message = 'Parâmetros de regra inválidos.';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.assessment_rule_sets
  where school_id = target_school_id and code = 'DEFAULT';

  update public.assessment_rule_sets
  set status = 'retired'
  where school_id = target_school_id and code = 'DEFAULT' and status = 'active';

  insert into public.assessment_rule_sets (
    school_id, grading_scale_id, code, name, version, status, continuous_weight, exam_weight,
    passing_value, maximum_absence_percentage, rounding_method, grade_change_requires_approval,
    lock_after_publication, formula, created_by
  ) values (
    target_school_id, active_scale.id, 'DEFAULT',
    coalesce(nullif(btrim(rule_name), ''), 'Regra principal de avaliação'),
    next_version, 'active',
    continuous_weight_value, exam_weight_value, passing_grade_value, maximum_absence_value,
    rounding_method_value, require_change_approval, lock_after_publication_value,
    jsonb_build_object(
      'operation', 'weighted_average',
      'components', jsonb_build_array(
        jsonb_build_object('code', 'continuous', 'weight', continuous_weight_value),
        jsonb_build_object('code', 'exam', 'weight', exam_weight_value)
      ),
      'keySubjectsCauseFailure', key_subjects_cause_failure,
      'promotion', coalesce(promotion_rules, '{}'::jsonb),
      'scale', jsonb_build_object(
        'minimum', active_scale.minimum_value,
        'maximum', active_scale.maximum_value,
        'passing', passing_grade_value,
        'decimalPlaces', active_scale.decimal_places
      )
    ),
    actor
  ) returning id into new_rule_id;

  foreach key_subject in array coalesce(key_subject_ids, '{}') loop
    if not exists (
      select 1 from public.subjects
      where school_id = target_school_id and id = key_subject and status = 'active'
    ) then
      raise exception using errcode = '22023', message = 'Disciplina-chave inválida.';
    end if;
    insert into public.assessment_key_subjects (school_id, rule_set_id, subject_id)
    values (target_school_id, new_rule_id, key_subject)
    on conflict do nothing;
  end loop;

  return jsonb_build_object('ruleSetId', new_rule_id, 'version', next_version, 'status', 'active');
end;
$function$;

REVOKE ALL ON FUNCTION private.siga_publish_assessment_rule(
  uuid, uuid, text, numeric, numeric, numeric, numeric, text, boolean, boolean, uuid[], boolean, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.siga_publish_assessment_rule(
  uuid, uuid, text, numeric, numeric, numeric, numeric, text, boolean, boolean, uuid[], boolean, jsonb
) TO service_role;

-- A API (PostgREST) só expõe `public`: invólucro com os mesmos privilégios.
GRANT USAGE ON SCHEMA private TO service_role;

CREATE OR REPLACE FUNCTION public.siga_publish_assessment_rule(
  target_school_id uuid,
  actor uuid,
  rule_name text,
  continuous_weight_value numeric,
  exam_weight_value numeric,
  passing_grade_value numeric,
  maximum_absence_value numeric,
  rounding_method_value text,
  require_change_approval boolean,
  lock_after_publication_value boolean,
  key_subject_ids uuid[] DEFAULT '{}'::uuid[],
  key_subjects_cause_failure boolean DEFAULT true,
  promotion_rules jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
SET search_path TO ''
AS $function$
  select private.siga_publish_assessment_rule(
    target_school_id, actor, rule_name, continuous_weight_value, exam_weight_value,
    passing_grade_value, maximum_absence_value, rounding_method_value,
    require_change_approval, lock_after_publication_value, key_subject_ids,
    key_subjects_cause_failure, promotion_rules
  );
$function$;

REVOKE ALL ON FUNCTION public.siga_publish_assessment_rule(
  uuid, uuid, text, numeric, numeric, numeric, numeric, text, boolean, boolean, uuid[], boolean, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siga_publish_assessment_rule(
  uuid, uuid, text, numeric, numeric, numeric, numeric, text, boolean, boolean, uuid[], boolean, jsonb
) TO service_role;


-- ══════════ 20260927150000_competencies.sql ══════════
-- Competências por disciplina e ligação às avaliações.
--
-- A coordenação define as competências de cada disciplina (opcionalmente por
-- classe). O professor da disciplina liga cada avaliação (`siga_assessment_items`)
-- às competências que ela avalia. O domínio de cada aluno calcula-se a partir das
-- notas dessas avaliações e da nota de aprovação do modelo — nada é guardado em
-- duplicado.
--
-- Só o servidor lê e escreve (chave de serviço depois de validar o perfil):
-- `is_school_member` inclui alunos e encarregados. Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS public.siga_competencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  grade_level_id uuid REFERENCES public.grade_levels(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (char_length(code) BETWEEN 1 AND 20),
  description text NOT NULL CHECK (char_length(description) BETWEEN 3 AND 500),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  display_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Um código por disciplina e classe (NULL = todas as classes).
CREATE UNIQUE INDEX IF NOT EXISTS siga_competencies_code_key
  ON public.siga_competencies (school_id, subject_id, coalesce(grade_level_id, '00000000-0000-0000-0000-000000000000'::uuid), code);
CREATE INDEX IF NOT EXISTS siga_competencies_subject_idx
  ON public.siga_competencies (subject_id);
CREATE INDEX IF NOT EXISTS siga_competencies_grade_level_idx
  ON public.siga_competencies (grade_level_id);

CREATE TABLE IF NOT EXISTS public.siga_assessment_item_competencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.siga_assessment_items(id) ON DELETE CASCADE,
  competency_id uuid NOT NULL REFERENCES public.siga_competencies(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT siga_assessment_item_competencies_key UNIQUE (item_id, competency_id)
);

CREATE INDEX IF NOT EXISTS siga_assessment_item_competencies_competency_idx
  ON public.siga_assessment_item_competencies (competency_id);
CREATE INDEX IF NOT EXISTS siga_assessment_item_competencies_school_idx
  ON public.siga_assessment_item_competencies (school_id);

DROP TRIGGER IF EXISTS trg_siga_competencies_touch ON public.siga_competencies;
CREATE TRIGGER trg_siga_competencies_touch
  BEFORE UPDATE ON public.siga_competencies
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

ALTER TABLE public.siga_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_competencies FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_competencies FROM PUBLIC, anon, authenticated;

ALTER TABLE public.siga_assessment_item_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_assessment_item_competencies FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_assessment_item_competencies FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.siga_competencies IS
  'Competências por disciplina (e classe). Só o servidor.';
COMMENT ON TABLE public.siga_assessment_item_competencies IS
  'Avaliações ligadas às competências que avaliam. Só o servidor.';


-- ══════════ 20260927170000_shared_rate_limit.sql ══════════
-- Limite de tentativas partilhado entre todas as instâncias do servidor.
--
-- O limitador de `src/lib/rate-limit.ts` vive na memória de cada instância do
-- worker: com várias instâncias, quem tente adivinhar senhas espalha os pedidos
-- e foge ao limite. Este contador fica na base e é o mesmo para todas.
--
-- As chaves chegam já cifradas (SHA-256) do servidor: a tabela nunca guarda IPs
-- nem identificadores em claro. Só a chave de serviço executa a função; a
-- tabela não tem acesso de cliente. Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS public.siga_rate_limit_hits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key_hash text NOT NULL CHECK (char_length(key_hash) = 64),
  hit_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS siga_rate_limit_hits_key_idx
  ON public.siga_rate_limit_hits (key_hash, hit_at DESC);
CREATE INDEX IF NOT EXISTS siga_rate_limit_hits_hit_at_idx
  ON public.siga_rate_limit_hits (hit_at);

ALTER TABLE public.siga_rate_limit_hits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_rate_limit_hits FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_rate_limit_hits FROM PUBLIC, anon, authenticated;

-- Verifica e regista numa só operação: devolve false (sem registar) se alguma
-- das chaves já atingiu o máximo na janela; senão regista uma tentativa em cada.
CREATE OR REPLACE FUNCTION public.siga_rate_limit_consume(
  key_hashes text[],
  window_seconds integer,
  max_hits integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  key_hash_value text;
  since timestamptz := now() - make_interval(secs => greatest(window_seconds, 1));
  hits integer;
begin
  if key_hashes is null or cardinality(key_hashes) = 0 or max_hits < 1 then
    return true;
  end if;

  -- Ordem fixa dos bloqueios: dois pedidos com as mesmas chaves nunca se cruzam.
  foreach key_hash_value in array (select array_agg(k order by k) from unnest(key_hashes) k) loop
    perform pg_advisory_xact_lock(hashtext('siga_rate_limit:' || key_hash_value));
  end loop;

  foreach key_hash_value in array key_hashes loop
    select count(*) into hits
    from public.siga_rate_limit_hits
    where key_hash = key_hash_value and hit_at > since;
    if hits >= max_hits then
      return false;
    end if;
  end loop;

  insert into public.siga_rate_limit_hits (key_hash)
  select distinct k from unnest(key_hashes) k;

  -- Limpeza ocasional do que já não conta para nenhuma janela.
  if random() < 0.02 then
    delete from public.siga_rate_limit_hits where hit_at < now() - interval '2 days';
  end if;
  return true;
end;
$function$;

REVOKE ALL ON FUNCTION public.siga_rate_limit_consume(text[], integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siga_rate_limit_consume(text[], integer, integer)
  TO service_role;


-- ══════════ 20260927100000_reconcile_school_access_requests.sql ══════════
-- Vem no fim de propósito. O bloco de `20260925090000` acima abre com
-- `CREATE TABLE IF NOT EXISTS` e, numa base onde a tabela já existe com a forma
-- antiga, não faz nada e não dá erro -- foi exactamente isso que aconteceu na
-- produção. Este bloco reconcilia o que lá estiver, tenha a migração de cima
-- criado a tabela agora ou sido saltada.

-- Reconciliar `school_access_requests` com o esquema que o código espera.
--
-- A tabela existe na produção com nomes de coluna diferentes dos que
-- `src/features/access/requests-server.ts` grava e lê. O pedido de acesso a uma
-- escola nunca funcionou, e não há nada nos registos que o diga.
--
-- Como se chegou aqui, porque importa para não repetir: uma versão inicial da
-- tabela foi aplicada à mão (ver `docs/agents/CONTINUE.md`, 2026-09-25). A
-- migração `20260925090000_school_access_requests.sql` foi depois reescrita com
-- outros nomes -- `institutional_number` em vez de `institutional_id`,
-- `requested_profile` em vez de `requested_role`, e mais sete colunas novas. Essa
-- migração abre com `CREATE TABLE IF NOT EXISTS`, que sobre uma tabela existente
-- não faz nada e não devolve erro. Correu, foi saltada, e ninguém soube.
--
-- A prova de que correu está nos índices: a produção tem HOJE os três índices da
-- migração nova (`school_access_requests_open_uidx`, `_school_status_idx`,
-- `_user_idx`) ao lado dos três da versão antiga (`_one_open`, `_school_status`,
-- `_user`). Os índices criaram-se porque só tocam em colunas que as duas versões
-- partilham; a tabela não mudou porque o `IF NOT EXISTS` a protegeu. Seis índices
-- onde deviam estar três é o rasto do mesmo acidente.
--
-- Há ainda uma segunda definição da mesma tabela no repositório, com a forma
-- ANTIGA: `20260925120220_capture_undeclared_production_tables.sql`, gerada por
-- captura do catálogo. Duas migrações a declarar a mesma tabela de formas
-- diferentes, ambas com `IF NOT EXISTS`, e a captura com carimbo mais recente.
-- Qualquer uma que corra primeiro ganha, em silêncio. Esta migração resolve o
-- estado; a duplicação em si fica anotada em `docs/agents/DATABASE_RULES.md`.
--
-- Porque é `ALTER` e não `DROP`+`CREATE`: a tabela está vazia hoje (zero linhas,
-- verificado a 2026-09-27) e nada lhe aponta uma chave estrangeira, logo apagá-la
-- seria seguro AGORA. Mas uma migração que apaga uma tabela é uma mina para quem
-- a correr mais tarde, quando já houver pedidos submetidos. O caminho por `ALTER`
-- dá o mesmo resultado hoje e continua correcto depois.
--
-- Idempotente: pode correr mais do que uma vez. Cada passo confirma o estado
-- antes de agir.
-- NUNCA aplicar via Lovable. Colar no SQL Editor do projecto SGA.

-- ---------------------------------------------------------------------------
-- 1) Renomear as colunas que mudaram de nome, preservando o que lá estiver.
--    Renomear em vez de criar-e-copiar: mantém tipo, NOT NULL e as chaves
--    estrangeiras já existentes (`person_id` → people, `reviewed_by` → auth.users)
--    sem as ter de recriar.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  par record;
BEGIN
  IF to_regclass('public.school_access_requests') IS NULL THEN
    RAISE NOTICE 'school_access_requests não existe; nada a reconciliar.';
    RETURN;
  END IF;

  FOR par IN
    SELECT * FROM (VALUES
      ('institutional_id'::text, 'institutional_number'::text),
      ('requested_role',         'requested_profile'),
      ('person_id',              'matched_person_id'),
      ('reviewed_by',            'reviewer_id'),
      ('review_note',            'decision_note')
    ) AS t(antigo, novo)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'school_access_requests'
        AND column_name = par.antigo
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'school_access_requests'
        AND column_name = par.novo
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.school_access_requests RENAME COLUMN %I TO %I',
        par.antigo, par.novo
      );
      RAISE NOTICE 'school_access_requests: % → %', par.antigo, par.novo;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Colunas que não existiam de forma nenhuma.
--    `contact_phone` e `message` vêm do formulário; `match_kind` diz COMO o
--    cadastro foi encontrado; `granted_role_code` e `membership_id` registam o
--    que a aprovação criou; `info_request_note` e `requester_reply` são a
--    conversa entre a secretaria e o requerente.
-- ---------------------------------------------------------------------------
ALTER TABLE public.school_access_requests
  ADD COLUMN IF NOT EXISTS contact_phone     text,
  ADD COLUMN IF NOT EXISTS message           text,
  ADD COLUMN IF NOT EXISTS match_kind        text,
  ADD COLUMN IF NOT EXISTS granted_role_code text,
  ADD COLUMN IF NOT EXISTS membership_id     uuid,
  ADD COLUMN IF NOT EXISTS info_request_note text,
  ADD COLUMN IF NOT EXISTS requester_reply   text;

-- ---------------------------------------------------------------------------
-- 3) Largar as restrições de valor antigas ANTES de traduzir os valores.
--    Pela ordem inversa nada passaria: a antiga recusa 'aluno' e a nova recusa
--    'student', logo a tradução tem de correr sem nenhuma das duas a vigiar.
-- ---------------------------------------------------------------------------
ALTER TABLE public.school_access_requests
  DROP CONSTRAINT IF EXISTS school_access_requests_requested_role_check,
  DROP CONSTRAINT IF EXISTS school_access_requests_requested_profile_check,
  DROP CONSTRAINT IF EXISTS school_access_requests_status_check;

-- ---------------------------------------------------------------------------
-- 4) Traduzir os valores. A produção usava inglês e nove estados; o código usa
--    português e seis.
--
--    Hoje isto não toca em linha nenhuma -- a tabela está vazia. Fica escrito
--    porque a migração pode ser aplicada depois de alguém submeter um pedido, e
--    então o mapeamento decide o que acontece a esse pedido.
--
--    Três estados antigos não têm equivalente directo, e a escolha é deliberada:
--    `preapproved` e `enrollment_pending` são pedidos a meio de uma decisão, não
--    decididos -- vão para `in_review`, que é onde a secretaria os volta a ver.
--    `enrollment_rejected` é uma decisão tomada, e negativa: `rejected`. Nenhum
--    deles vira `approved`, porque aprovar é o que cria o acesso à escola e isso
--    não se faz por conversão de texto.
-- ---------------------------------------------------------------------------
UPDATE public.school_access_requests
   SET requested_profile = CASE requested_profile
         WHEN 'student'  THEN 'aluno'
         WHEN 'teacher'  THEN 'professor'
         WHEN 'guardian' THEN 'encarregado'
         WHEN 'user'     THEN 'outro'
         ELSE requested_profile
       END
 WHERE requested_profile IN ('student', 'teacher', 'guardian', 'user');

UPDATE public.school_access_requests
   SET status = CASE status
         WHEN 'under_review'        THEN 'in_review'
         WHEN 'needs_information'   THEN 'info_requested'
         WHEN 'preapproved'         THEN 'in_review'
         WHEN 'enrollment_pending'  THEN 'in_review'
         WHEN 'enrollment_rejected' THEN 'rejected'
         ELSE status
       END
 WHERE status IN (
   'under_review', 'needs_information', 'preapproved',
   'enrollment_pending', 'enrollment_rejected'
 );

-- ---------------------------------------------------------------------------
-- 5) Pôr as restrições que o código pressupõe.
--    Os limites de comprimento não são decoração: `message` sem limite é um
--    campo de texto livre que qualquer pessoa autenticada grava.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.school_access_requests'::regclass
      AND conname = 'school_access_requests_requested_profile_check'
  ) THEN
    ALTER TABLE public.school_access_requests
      ADD CONSTRAINT school_access_requests_requested_profile_check
      CHECK (requested_profile IN ('aluno', 'professor', 'funcionario', 'encarregado', 'outro'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.school_access_requests'::regclass
      AND conname = 'school_access_requests_status_check'
  ) THEN
    ALTER TABLE public.school_access_requests
      ADD CONSTRAINT school_access_requests_status_check
      CHECK (status IN ('pending', 'in_review', 'info_requested', 'approved', 'rejected', 'cancelled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.school_access_requests'::regclass
      AND conname = 'school_access_requests_texto_limitado_check'
  ) THEN
    ALTER TABLE public.school_access_requests
      ADD CONSTRAINT school_access_requests_texto_limitado_check
      CHECK (
        (national_id        IS NULL OR char_length(national_id)        <= 40)
        AND (institutional_number IS NULL OR char_length(institutional_number) <= 60)
        AND (contact_phone   IS NULL OR char_length(contact_phone)     <= 30)
        AND (message         IS NULL OR char_length(message)           <= 1000)
        AND (decision_note   IS NULL OR char_length(decision_note)     <= 1000)
        AND (info_request_note IS NULL OR char_length(info_request_note) <= 1000)
        AND (requester_reply IS NULL OR char_length(requester_reply)   <= 1000)
      );
  END IF;

  -- `membership_id` é coluna nova, logo a chave estrangeira também não existia.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.school_access_requests'::regclass
      AND conname = 'school_access_requests_membership_id_fkey'
  ) AND to_regclass('public.school_memberships') IS NOT NULL THEN
    ALTER TABLE public.school_access_requests
      ADD CONSTRAINT school_access_requests_membership_id_fkey
      FOREIGN KEY (membership_id) REFERENCES public.school_memberships(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Nota sobre `full_name`: a produção tem
-- `school_access_requests_full_name_check`, que exige 3 a 160 caracteres DEPOIS
-- de cortar espaços. A migração canónica pede o mesmo sem o corte. Fica a da
-- produção, que é a mais exigente -- um nome de três espaços passaria na
-- canónica e não passa nesta. Trocá-la por uma versão mais frouxa seria perder
-- uma verificação sem ganhar nada.

-- ---------------------------------------------------------------------------
-- 6) Largar os três índices da versão antiga.
--    Ficam a par dos da versão nova, sobre as mesmas colunas: custo de escrita a
--    dobrar, e uma unicidade a mais cujo predicado fala de estados que já não
--    existem. Um índice único sobre valores que o CHECK agora recusa nunca
--    dispara -- parece proteger e não protege.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.school_access_requests_one_open;
DROP INDEX IF EXISTS public.school_access_requests_school_status;
DROP INDEX IF EXISTS public.school_access_requests_user;

-- ---------------------------------------------------------------------------
-- 7) Garantir os índices, o RLS e a política canónicos, tal como em
--    `20260925090000_school_access_requests.sql`. Já existem se essa migração
--    correu; repetem-se aqui para que esta possa correr sozinha.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS school_access_requests_open_uidx
  ON public.school_access_requests (school_id, user_id)
  WHERE status IN ('pending', 'in_review', 'info_requested');

CREATE INDEX IF NOT EXISTS school_access_requests_school_status_idx
  ON public.school_access_requests (school_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS school_access_requests_user_idx
  ON public.school_access_requests (user_id, created_at DESC);

ALTER TABLE public.school_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_access_requests FORCE ROW LEVEL SECURITY;

-- Escrita só pelo servidor, que valida a autorização em `requests-server.ts`.
-- O requerente lê os seus pedidos e mais nada: `matched_person_id` e
-- `match_kind` dizem que cadastro a escola encontrou, e isso é da secretaria.
REVOKE ALL ON public.school_access_requests FROM anon;
REVOKE ALL ON public.school_access_requests FROM authenticated;
GRANT SELECT ON public.school_access_requests TO authenticated;
GRANT ALL ON public.school_access_requests TO service_role;

DROP POLICY IF EXISTS "Requester reads own access requests" ON public.school_access_requests;
CREATE POLICY "Requester reads own access requests"
  ON public.school_access_requests
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));


-- ══════════ 20260927120000_reclose_physical_access_secrets.sql ══════════
-- Também no fim, e por uma razão de ordem: o bloco de `20260925190000` acima cria
-- `Members read siga_access_cards` e `Members read siga_turnstile_devices`. Este
-- larga-as. Invertida a ordem, ficariam criadas.

-- Voltar a fechar `siga_access_cards` e `siga_turnstile_devices` ao cliente.
--
-- Estas duas tabelas guardam credenciais, não referências a credenciais:
--
--   · `siga_turnstile_devices.api_key` É a autenticação do leitor físico.
--     `catracas/gate-pass-validation.ts` identifica o dispositivo por
--     `.eq("api_key", apiKey)`, e é só isso que separa uma catraca legítima de um
--     pedido HTTP qualquer.
--   · `siga_access_cards.qr_secret` e `rfid_tag` SÃO o passe. A validação aceita um
--     token que case com `card_number`, `barcode`, `qr_secret` ou `rfid_tag`. Saber
--     qualquer um destes valores de outra pessoa é entrar como ela.
--
-- `20260924230000_close_access_card_and_device_secrets.sql` fechou-as: sem política
-- nenhuma, leitura só por `service_role`, que é como toda a aplicação lhes acede.
-- Deliberadamente sem política de leitura, ao contrário das outras tabelas — uma
-- política de linha não esconde uma coluna, e qualquer SELECT que deixasse listar
-- cartões entregaria o `qr_secret` junto.
--
-- `20260925190000_harden_member_wide_policies.sql`, aplicada a 2026-09-27, criou
-- `Members read siga_access_cards` e `Members read siga_turnstile_devices` com
-- `USING (is_school_member(school_id))`. Para essa migração isto é endurecimento:
-- substitui uma política `FOR ALL` por uma de leitura. Para estas duas tabelas em
-- concreto é um passo atrás, porque o destino certo não era leitura-para-membros —
-- era nenhuma leitura. E `is_school_member` é verdadeiro para alunos e
-- encarregados (regra 4 de `docs/agents/DATABASE_RULES.md`).
--
-- Hoje NÃO há exposição: o retrato mostra `auth_select=false` e `anon_select=false`
-- nas duas. O `REVOKE ALL ... FROM authenticated` de 20260924230000 continua em
-- vigor, e uma política de RLS não concede privilégios — sem o GRANT, a política
-- não é alcançável por ninguém. A política está inerte.
--
-- Inerte não é inofensiva. Fica à espera do primeiro `APPLY_*.sql` que reconceda
-- `SELECT` a `authenticated` — e esses ficheiros existem, correm-se à mão, e já
-- desfizeram endurecimentos antes. Nesse momento a política acorda a entregar
-- números de cartão e chaves de catraca a qualquer aluno da escola, sem que
-- ninguém tenha tocado em política nenhuma. Uma porta trancada com a chave na
-- fechadura.
--
-- Se algum dia um ecrã precisar de listar cartões, o caminho é uma vista sem as
-- colunas de segredo. Não é alargar a política destas tabelas.
--
-- `tests/security/segredos-de-acesso-fisico.test.ts` exige zero políticas aqui, e
-- foi ele que apanhou isto.
--
-- Idempotente. NUNCA aplicar via Lovable. Colar no SQL Editor do projecto SGA.

DROP POLICY IF EXISTS "Members read siga_access_cards" ON public.siga_access_cards;
DROP POLICY IF EXISTS "Access cards in own school" ON public.siga_access_cards;

DROP POLICY IF EXISTS "Members read siga_turnstile_devices" ON public.siga_turnstile_devices;
DROP POLICY IF EXISTS "Turnstile devices in own school" ON public.siga_turnstile_devices;

-- Repetir o fecho de 20260924230000, para que esta migração se sustente sozinha e
-- para que a ordem entre as duas deixe de importar.
ALTER TABLE public.siga_access_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_access_cards FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_access_cards FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_access_cards TO service_role;

ALTER TABLE public.siga_turnstile_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_turnstile_devices FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_turnstile_devices FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_turnstile_devices TO service_role;


-- ══════════ 20260927140000_close_last_member_wide_writes.sql ══════════
-- As últimas quatro escritas abertas a qualquer membro da escola. Independente dos
-- blocos acima; vem por último porque `20260925190000` também mexe em políticas e
-- convém que a palavra final sobre estas quatro tabelas seja esta.

-- As últimas quatro escritas abertas a qualquer membro da escola.
--
-- `public.is_school_member(school_id)` é verdadeiro para alunos e encarregados
-- (regra 4 de `docs/agents/DATABASE_RULES.md`). Depois de aplicadas as migrações de
-- 25 e 26/09, o retrato de 2026-09-27 mostrava seis políticas de ESCRITA cuja única
-- condição era essa. Duas fecharam com `20260926120000` (departamentos e cargos de
-- RH). Estas são as outras quatro, e nenhuma tinha correcção escrita em lado nenhum.
--
-- Em todas, a aplicação escreve por `service_role`. Confirmado ficheiro a ficheiro:
-- `enrollment/server.ts` chama `requireSgaWriterForWrite("pessoas", …)` e só depois
-- `loadSgaAdminClient()`; o motor de importação recebe o cliente privilegiado em
-- `import/server.ts`; `saas/school-bootstrap.ts` corre no arranque de escola. Não há
-- um único caminho em que o browser escreva nestas tabelas -- a política servia
-- apenas para permitir o que ninguém faz.
--
-- Idempotente. NUNCA aplicar via Lovable. Colar no SQL Editor do projecto SGA.

-- ---------------------------------------------------------------------------
-- 1) enrollment_applications
--
-- O UPDATE por membro sai. Fica a inserção pública -- `TO anon`, e guardada por
-- `status = 'pending'` mais um EXISTS sobre um formulário aberto: é o formulário de
-- matrícula no sítio público, e tem de continuar a funcionar.
--
-- A LEITURA também aperta, e não é arrumação. O `payload` de uma candidatura tem
-- `person: { full_name, national_id, phone, email, birth_date, gender }` -- dados
-- pessoais de menores. Com `is_school_member` sozinho, qualquer aluno ou encarregado
-- da escola listava todas as candidaturas com esses campos dentro. A regra 4 proíbe
-- `is_school_member` sozinho precisamente em dados de alunos.
--
-- A guarda passa a ser a mesma que `students` e `people` já usam para os mesmos
-- dados: `can_read_students()`, que é Administrador, Secretaria, Direcção,
-- Coordenação ou Professor.
--
-- `src/routes/alunos/index.tsx` subscreve alterações desta tabela por realtime. O
-- realtime respeita o RLS: quem não pode ler a linha não recebe o evento. A
-- subscrição existe só para invalidar a contagem de candidaturas pendentes, que é um
-- indicador de secretaria -- deixar de chegar a alunos é o comportamento correcto,
-- não uma regressão.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Update enrollment applications in own school" ON public.enrollment_applications;

DROP POLICY IF EXISTS "Read enrollment applications in own school" ON public.enrollment_applications;
CREATE POLICY "Read enrollment applications in own school"
  ON public.enrollment_applications
  FOR SELECT TO authenticated
  USING (
    public.is_school_member(school_id)
    AND deleted_at IS NULL
    AND (SELECT public.can_read_students())
  );

-- Escrita fora do browser. `anon` mantém o INSERT, que é o da matrícula pública;
-- `authenticated` não tinha política de INSERT nenhuma, logo já estava recusado --
-- revogar o privilégio só torna isso explícito em vez de implícito.
REVOKE INSERT, UPDATE, DELETE ON public.enrollment_applications FROM authenticated;
REVOKE UPDATE, DELETE ON public.enrollment_applications FROM anon;

-- ---------------------------------------------------------------------------
-- 2) enrollment_forms
--
-- `Manage enrollment forms in own school` era `FOR ALL`: um aluno podia apagar o
-- formulário de matrícula da escola, ou abri-lo e fechá-lo. Sai por inteiro. A parte
-- de leitura que ela também dava já está coberta por `Read enrollment forms in own
-- school`, que fica.
--
-- As duas políticas de leitura ficam como estão, e `anon` mantém o SELECT: é assim
-- que a página pública mostra um formulário aberto. Aqui `is_school_member` sozinho
-- na leitura é aceitável -- um formulário de matrícula é para ser visto, tanto que
-- há uma política que o mostra ao público.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Manage enrollment forms in own school" ON public.enrollment_forms;

REVOKE INSERT, UPDATE, DELETE ON public.enrollment_forms FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.enrollment_forms FROM anon;

-- ---------------------------------------------------------------------------
-- 3) finance_invoice_events e student_status_events
--
-- Estas duas não são escritas por código nenhum: `grep` em `src/` não devolve uma
-- única referência fora dos tipos gerados. São alimentadas por triggers, que correm
-- como o dono da tabela e não dependem destes privilégios.
--
-- A política de INSERT era `school_id = current_school_id()` -- sem papel, sem
-- permissão. Servia só para permitir a alguém autenticado forjar eventos de factura
-- e de mudança de estado de aluno directamente pelo PostgREST, sem passar pela
-- operação que os devia ter gerado. Uma trilha de auditoria que o auditado pode
-- escrever deixa de ser trilha.
--
-- A leitura fica: são registos de auditoria por escola, e há ecrãs que os podem vir
-- a mostrar. `anon` perde tudo -- tinha o privilégio de SELECT sem nenhuma política
-- que lho permitisse usar, o que dava zero linhas hoje e um problema no dia em que
-- alguém acrescentasse uma política sem olhar para os privilégios.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Write own school invoice events" ON public.finance_invoice_events;
DROP POLICY IF EXISTS "Write own school student status events" ON public.student_status_events;

REVOKE INSERT, UPDATE, DELETE ON public.finance_invoice_events FROM authenticated;
REVOKE ALL ON public.finance_invoice_events FROM anon;

REVOKE INSERT, UPDATE, DELETE ON public.student_status_events FROM authenticated;
REVOKE ALL ON public.student_status_events FROM anon;

-- ---------------------------------------------------------------------------
-- 4) Confirmar que o RLS continua activo nas quatro.
--    Sem RLS, a ausência de política deixa de negar seja o que for -- passa a
--    permitir tudo a quem tenha o privilégio.
-- ---------------------------------------------------------------------------
ALTER TABLE public.enrollment_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_applications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_forms FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_invoice_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_invoice_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.student_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_status_events FORCE ROW LEVEL SECURITY;

GRANT ALL ON public.enrollment_applications TO service_role;
GRANT ALL ON public.enrollment_forms TO service_role;
GRANT ALL ON public.finance_invoice_events TO service_role;
GRANT ALL ON public.student_status_events TO service_role;
