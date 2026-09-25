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
