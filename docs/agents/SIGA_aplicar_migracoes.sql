-- SIGA Plus — SQL a aplicar no Supabase (projecto Sga), 2026-09-26
-- Colar TUDO no SQL Editor → Run. Pode correr mais do que uma vez sem problema.
-- 18 migrações: as 8 do SIGA de 25–26/09, as 7 do catálogo de importação
-- (import_table_specs, sem ele a importação fica bloqueada), tenant_mailboxes,
-- a publicação de modelos de avaliação (siga_publish_assessment_rule) e os
-- exames (siga_exam_sessions, siga_exam_registrations).
-- Testado em 2026-09-26 num Postgres 16 com o esquema da produção
-- (supabase/PRODUCTION_SNAPSHOT.json): três corridas seguidas sem erros.
-- Depois de aplicar, confirmar com docs/agents/SIGA_confirmar_migracoes.sql.


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
  key_subjects_cause_failure boolean DEFAULT true
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
  uuid, uuid, text, numeric, numeric, numeric, numeric, text, boolean, boolean, uuid[], boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.siga_publish_assessment_rule(
  uuid, uuid, text, numeric, numeric, numeric, numeric, text, boolean, boolean, uuid[], boolean
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
  key_subjects_cause_failure boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE sql
SET search_path TO ''
AS $function$
  select private.siga_publish_assessment_rule(
    target_school_id, actor, rule_name, continuous_weight_value, exam_weight_value,
    passing_grade_value, maximum_absence_value, rounding_method_value,
    require_change_approval, lock_after_publication_value, key_subject_ids,
    key_subjects_cause_failure
  );
$function$;

REVOKE ALL ON FUNCTION public.siga_publish_assessment_rule(
  uuid, uuid, text, numeric, numeric, numeric, numeric, text, boolean, boolean, uuid[], boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siga_publish_assessment_rule(
  uuid, uuid, text, numeric, numeric, numeric, numeric, text, boolean, boolean, uuid[], boolean
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
