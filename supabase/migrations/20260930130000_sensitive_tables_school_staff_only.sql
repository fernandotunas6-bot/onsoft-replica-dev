-- Dados de alunos, notas, faltas, pagamentos e documentos: só o pessoal da
-- escola lê pela API.
--
-- Achado a 2026-09-30 (produção, só leitura):
--   1. Os papéis `student` e `guardian` têm, nas 89 escolas, as permissões
--      students.records.read, finance.invoices.read, finance.contracts.read,
--      assessment.grades.read, assessment.reports.read, attendance.records.read,
--      documents.issued.read, documents.requests.read e documents.requests.manage.
--      As políticas `*_select_authorized` / `*_select` só pedem a permissão,
--      sem limitar as linhas ao próprio aluno: um aluno lia todos os alunos,
--      faturas, recibos, notas, faltas e documentos da escola; e alterava
--      qualquer pedido de documento (document_requests_update).
--   2. siga_assessment_scores, siga_attendance_*, finance_payment_plans,
--      siga_access_*, import_* ainda tinham leitura só com is_school_member
--      (verdadeiro para alunos e encarregados — DATABASE_RULES.md, regra 4).
-- Hoje não há contas de aluno nem de encarregado na produção (só `owner`):
-- a falha estava latente e abria-se com o portal do aluno.
--
-- Correcção: uma política RESTRICTIVE «School staff only» por tabela. As
-- restritivas combinam-se por AND com as permissivas: as políticas existentes
-- ficam como estão (sem reescrever texto que pode ter mudado desde o retrato)
-- e qualquer permissiva futura fica também limitada ao pessoal. O servidor usa
-- a chave de serviço (BYPASSRLS) e não é afectado; alunos e encarregados lêem
-- os próprios dados pelo servidor (loadStudentScope), nunca pela API directa.
--
-- «Pessoal» = membro activo da escola da linha com um papel de
-- Administrador/Secretaria/Tesouraria/Professor — os mesmos códigos que a app
-- mapeia (src/integrations/supabase/sga.ts, roleCodeToAppRole). Quem é pessoal
-- e também encarregado continua pessoal. Códigos desconhecidos não contam
-- (falha fechada, como «Utilizador» na app).
--
-- Leituras com o JWT que continuam a funcionar (todas de pessoal):
--   · painel (dashboard/server.ts): siga_assessment_scores, siga_attendance_sessions,
--     import_jobs, students, enrollments, finance_invoices…;
--   · build_grade_sheet (INVOKER, Administrador com aal2);
--   · Realtime de /alunos (students, finance_invoices, finance_receipts).
--
-- Idempotente: CREATE OR REPLACE; DROP POLICY IF EXISTS antes de cada CREATE;
-- tabelas ausentes são saltadas. Não apaga dados.

CREATE OR REPLACE FUNCTION private.is_school_staff(p_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.school_memberships sm
    JOIN public.member_roles mr ON mr.membership_id = sm.id
    JOIN public.roles r ON r.id = mr.role_id
    WHERE (SELECT auth.uid()) IS NOT NULL
      AND sm.user_id = (SELECT auth.uid())
      AND sm.school_id = p_school_id
      AND sm.status = 'active'
      AND lower(btrim(r.code)) IN (
        'owner', 'admin', 'administrador',
        'secretary', 'secretaria',
        'treasury', 'tesouraria', 'finance',
        'teacher', 'professor'
      )
  );
$$;
REVOKE ALL ON FUNCTION private.is_school_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_school_staff(uuid) TO authenticated, service_role;

-- Tabelas com school_id: restrição directa.
DO $staff$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'students',
    'student_guardians',
    'finance_invoices',
    'finance_receipts',
    'finance_contracts',
    'finance_payment_plans',
    'grade_items',
    'grade_scores',
    'grade_sheet_rows',
    'grade_sheets',
    'gradebooks',
    'report_cards',
    'attendance_records',
    'attendance_session_roster',
    'attendance_sessions',
    'document_requests',
    'document_signatures',
    'issued_documents',
    'siga_assessment_scores',
    'siga_attendance_records',
    'siga_attendance_sessions',
    'siga_attendance_justifications',
    'siga_access_logs',
    'siga_access_cards',
    'import_jobs'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Tabela public.% não existe; saltada.', t;
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS "School staff only" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "School staff only" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (private.is_school_staff(school_id)) WITH CHECK (private.is_school_staff(school_id))',
      t
    );
  END LOOP;
END
$staff$;

-- Linhas e auditoria de importação não têm school_id: a escola vem do trabalho.
DO $import$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['import_rows', 'import_audits'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Tabela public.% não existe; saltada.', t;
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS "School staff only" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "School staff only" ON public.%1$I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (EXISTS (SELECT 1 FROM public.import_jobs j WHERE j.id = %1$I.import_job_id '
      'AND private.is_school_staff(j.school_id))) '
      'WITH CHECK (EXISTS (SELECT 1 FROM public.import_jobs j WHERE j.id = %1$I.import_job_id '
      'AND private.is_school_staff(j.school_id)))',
      t
    );
  END LOOP;
END
$import$;

-- Planos de pagamento: a leitura «qualquer membro» anulava a de Tesouraria
-- (finance_payment_plans_select_finance, que fica). O servidor lê com a chave
-- de serviço (finance/server.ts, gateway-webhook-handler.ts).
DO $plans$
BEGIN
  IF to_regclass('public.finance_payment_plans') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Members read finance_payment_plans" ON public.finance_payment_plans;
  END IF;
END
$plans$;
