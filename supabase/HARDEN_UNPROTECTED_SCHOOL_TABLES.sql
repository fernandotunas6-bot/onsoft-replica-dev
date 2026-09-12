-- =============================================================================
-- SIGA PLUS — RLS NAS TABELAS ESCOLARES QUE NÃO A TINHAM
-- =============================================================================
-- Idempotente. Aplicar depois de HARDEN_TENANT_ISOLATION.sql, que cria
-- `current_school_id()`, `current_school_role_is()` e `is_school_member()`.
--
-- PROBLEMA
--
-- Levantamento dos ficheiros SQL do repositório: 98 tabelas declaram
-- `school_id` e 17 não tinham `ENABLE ROW LEVEL SECURITY` nem política nenhuma.
-- Entre elas, a família `hr_*` completa — contratos, vínculos, processamento
-- salarial e eventos de remuneração do pessoal da escola.
--
-- PORQUE É SEGURO APLICAR
--
-- A aplicação lê estas tabelas pelo cliente service_role, que tem BYPASSRLS.
-- Activar RLS não altera o que a aplicação vê. O que muda é o acesso directo
-- pelos papéis `authenticated` e `anon` através do PostgREST — que é
-- precisamente o que não devia estar aberto.
--
-- ANTES DE APLICAR, CONFIRMAR O PONTO DE PARTIDA
--
--   select table_name, privilege_type from information_schema.role_table_grants
--   where grantee = 'authenticated' and table_name like 'hr_%';
--
-- Se isso devolver linhas, estas tabelas estão neste momento legíveis por
-- qualquer conta autenticada de qualquer escola, e isto é urgente. Se vier
-- vazio, é dívida latente e isto é prevenção.
--
-- LIMITE CONHECIDO
--
-- `current_school_id()` devolve NULL quando o utilizador tem mais do que uma
-- membership activa, por desenho. Para esses utilizadores estas políticas negam
-- tudo. É o comportamento do resto do projecto e falha fechado — mas é o mesmo
-- motivo por que o isolamento ainda assenta na camada TypeScript.
--
-- TRÊS REGRAS, CONFORME A SENSIBILIDADE
--
--   1. RH e salários       → só Administrador e Tesouraria
--   2. Estrutura académica → leitura para membros, escrita para Secretaria/Direcção
--   3. Preferências        → cada utilizador vê apenas as suas
-- =============================================================================

BEGIN;

-- ─── 1. RH e processamento salarial ──────────────────────────────────────────
-- Vencimentos não são dados operacionais da escola: são dados pessoais de
-- trabalhadores. Espelha HR_READ_ROLES em src/features/hr/server.ts.

ALTER TABLE public.hr_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_departments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_departments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_departments TO authenticated;
GRANT ALL ON public.hr_departments TO service_role;
DROP POLICY IF EXISTS "HR restrito a direcção e tesouraria" ON public.hr_departments;
CREATE POLICY "HR restrito a direcção e tesouraria"
  ON public.hr_departments
  FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','treasury','tesouraria']::text[]))
  WITH CHECK (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','treasury','tesouraria']::text[]));

ALTER TABLE public.hr_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_positions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_positions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_positions TO authenticated;
GRANT ALL ON public.hr_positions TO service_role;
DROP POLICY IF EXISTS "HR restrito a direcção e tesouraria" ON public.hr_positions;
CREATE POLICY "HR restrito a direcção e tesouraria"
  ON public.hr_positions
  FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','treasury','tesouraria']::text[]))
  WITH CHECK (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','treasury','tesouraria']::text[]));

ALTER TABLE public.hr_employments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_employments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_employments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_employments TO authenticated;
GRANT ALL ON public.hr_employments TO service_role;
DROP POLICY IF EXISTS "HR restrito a direcção e tesouraria" ON public.hr_employments;
CREATE POLICY "HR restrito a direcção e tesouraria"
  ON public.hr_employments
  FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','treasury','tesouraria']::text[]))
  WITH CHECK (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','treasury','tesouraria']::text[]));

ALTER TABLE public.hr_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_contracts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_contracts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_contracts TO authenticated;
GRANT ALL ON public.hr_contracts TO service_role;
DROP POLICY IF EXISTS "HR restrito a direcção e tesouraria" ON public.hr_contracts;
CREATE POLICY "HR restrito a direcção e tesouraria"
  ON public.hr_contracts
  FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','treasury','tesouraria']::text[]))
  WITH CHECK (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','treasury','tesouraria']::text[]));

ALTER TABLE public.hr_compensation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_compensation_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_compensation_events FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_compensation_events TO authenticated;
GRANT ALL ON public.hr_compensation_events TO service_role;
DROP POLICY IF EXISTS "HR restrito a direcção e tesouraria" ON public.hr_compensation_events;
CREATE POLICY "HR restrito a direcção e tesouraria"
  ON public.hr_compensation_events
  FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','treasury','tesouraria']::text[]))
  WITH CHECK (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','treasury','tesouraria']::text[]));

ALTER TABLE public.hr_payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_runs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_payroll_runs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_payroll_runs TO authenticated;
GRANT ALL ON public.hr_payroll_runs TO service_role;
DROP POLICY IF EXISTS "HR restrito a direcção e tesouraria" ON public.hr_payroll_runs;
CREATE POLICY "HR restrito a direcção e tesouraria"
  ON public.hr_payroll_runs
  FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','treasury','tesouraria']::text[]))
  WITH CHECK (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','treasury','tesouraria']::text[]));

ALTER TABLE public.hr_payroll_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_items FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_payroll_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_payroll_items TO authenticated;
GRANT ALL ON public.hr_payroll_items TO service_role;
DROP POLICY IF EXISTS "HR restrito a direcção e tesouraria" ON public.hr_payroll_items;
CREATE POLICY "HR restrito a direcção e tesouraria"
  ON public.hr_payroll_items
  FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','treasury','tesouraria']::text[]))
  WITH CHECK (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','treasury','tesouraria']::text[]));

ALTER TABLE public.hr_payroll_item_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_item_components FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_payroll_item_components FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_payroll_item_components TO authenticated;
GRANT ALL ON public.hr_payroll_item_components TO service_role;
DROP POLICY IF EXISTS "HR restrito a direcção e tesouraria" ON public.hr_payroll_item_components;
CREATE POLICY "HR restrito a direcção e tesouraria"
  ON public.hr_payroll_item_components
  FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','treasury','tesouraria']::text[]))
  WITH CHECK (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','treasury','tesouraria']::text[]));

-- ─── 2. Estrutura académica e horários ───────────────────────────────────────
-- Operacionais: qualquer membro consulta, só secretaria ou direcção altera.

ALTER TABLE public.curricula ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.curricula FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.curricula TO authenticated;
GRANT ALL ON public.curricula TO service_role;
DROP POLICY IF EXISTS "Membros da escola consultam" ON public.curricula;
CREATE POLICY "Membros da escola consultam"
  ON public.curricula
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS "Secretaria e direcção alteram" ON public.curricula;
CREATE POLICY "Secretaria e direcção alteram"
  ON public.curricula
  FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','secretary','secretaria']::text[]))
  WITH CHECK (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','secretary','secretaria']::text[]));

ALTER TABLE public.curriculum_areas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.curriculum_areas FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.curriculum_areas TO authenticated;
GRANT ALL ON public.curriculum_areas TO service_role;
DROP POLICY IF EXISTS "Membros da escola consultam" ON public.curriculum_areas;
CREATE POLICY "Membros da escola consultam"
  ON public.curriculum_areas
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS "Secretaria e direcção alteram" ON public.curriculum_areas;
CREATE POLICY "Secretaria e direcção alteram"
  ON public.curriculum_areas
  FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','secretary','secretaria']::text[]))
  WITH CHECK (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','secretary','secretaria']::text[]));

ALTER TABLE public.curriculum_subjects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.curriculum_subjects FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.curriculum_subjects TO authenticated;
GRANT ALL ON public.curriculum_subjects TO service_role;
DROP POLICY IF EXISTS "Membros da escola consultam" ON public.curriculum_subjects;
CREATE POLICY "Membros da escola consultam"
  ON public.curriculum_subjects
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS "Secretaria e direcção alteram" ON public.curriculum_subjects;
CREATE POLICY "Secretaria e direcção alteram"
  ON public.curriculum_subjects
  FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','secretary','secretaria']::text[]))
  WITH CHECK (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','secretary','secretaria']::text[]));

ALTER TABLE public.subject_types ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subject_types FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subject_types TO authenticated;
GRANT ALL ON public.subject_types TO service_role;
DROP POLICY IF EXISTS "Membros da escola consultam" ON public.subject_types;
CREATE POLICY "Membros da escola consultam"
  ON public.subject_types
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS "Secretaria e direcção alteram" ON public.subject_types;
CREATE POLICY "Secretaria e direcção alteram"
  ON public.subject_types
  FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','secretary','secretaria']::text[]))
  WITH CHECK (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','secretary','secretaria']::text[]));

ALTER TABLE public.academic_schedules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academic_schedules FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academic_schedules TO authenticated;
GRANT ALL ON public.academic_schedules TO service_role;
DROP POLICY IF EXISTS "Membros da escola consultam" ON public.academic_schedules;
CREATE POLICY "Membros da escola consultam"
  ON public.academic_schedules
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS "Secretaria e direcção alteram" ON public.academic_schedules;
CREATE POLICY "Secretaria e direcção alteram"
  ON public.academic_schedules
  FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','secretary','secretaria']::text[]))
  WITH CHECK (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','secretary','secretaria']::text[]));

ALTER TABLE public.school_shifts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_shifts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_shifts TO authenticated;
GRANT ALL ON public.school_shifts TO service_role;
DROP POLICY IF EXISTS "Membros da escola consultam" ON public.school_shifts;
CREATE POLICY "Membros da escola consultam"
  ON public.school_shifts
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS "Secretaria e direcção alteram" ON public.school_shifts;
CREATE POLICY "Secretaria e direcção alteram"
  ON public.school_shifts
  FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','secretary','secretaria']::text[]))
  WITH CHECK (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','secretary','secretaria']::text[]));

ALTER TABLE public.school_shift_slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_shift_slots FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_shift_slots TO authenticated;
GRANT ALL ON public.school_shift_slots TO service_role;
DROP POLICY IF EXISTS "Membros da escola consultam" ON public.school_shift_slots;
CREATE POLICY "Membros da escola consultam"
  ON public.school_shift_slots
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS "Secretaria e direcção alteram" ON public.school_shift_slots;
CREATE POLICY "Secretaria e direcção alteram"
  ON public.school_shift_slots
  FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','secretary','secretaria']::text[]))
  WITH CHECK (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','secretary','secretaria']::text[]));

ALTER TABLE public.teacher_availability ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.teacher_availability FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_availability TO authenticated;
GRANT ALL ON public.teacher_availability TO service_role;
DROP POLICY IF EXISTS "Membros da escola consultam" ON public.teacher_availability;
CREATE POLICY "Membros da escola consultam"
  ON public.teacher_availability
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS "Secretaria e direcção alteram" ON public.teacher_availability;
CREATE POLICY "Secretaria e direcção alteram"
  ON public.teacher_availability
  FOR ALL TO authenticated
  USING (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','secretary','secretaria']::text[]))
  WITH CHECK (school_id = public.current_school_id() AND public.current_school_role_is(ARRAY['owner','admin','administrador','secretary','secretaria']::text[]));

-- ─── 3. Preferências de notificação ──────────────────────────────────────────
-- Por utilizador, não por escola: `school_id` é anulável aqui, portanto o
-- âmbito correcto é a própria conta.

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_preferences FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
DROP POLICY IF EXISTS "Cada conta gere as suas preferências" ON public.notification_preferences;
CREATE POLICY "Cada conta gere as suas preferências"
  ON public.notification_preferences
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

COMMIT;

-- =============================================================================
-- VERIFICAR DEPOIS DE APLICAR
-- =============================================================================
--
--   -- nenhuma destas deve aparecer com relrowsecurity = false:
--   select relname, relrowsecurity from pg_class
--   where relname in (
--     'hr_departments','hr_positions','hr_employments','hr_contracts',
--     'hr_compensation_events','hr_payroll_runs','hr_payroll_items',
--     'hr_payroll_item_components','curricula','curriculum_areas',
--     'curriculum_subjects','subject_types','academic_schedules',
--     'school_shifts','school_shift_slots','teacher_availability',
--     'notification_preferences'
--   ) order by relrowsecurity, relname;
--
--   select tablename, policyname, cmd from pg_policies
--   where schemaname = 'public' and tablename like 'hr_%' order by tablename;
--
-- Depois de aplicar, esvaziar RLS_PENDING em
-- tests/security/rls-school-tables.test.ts — a lista existe para encolher.
-- =============================================================================
