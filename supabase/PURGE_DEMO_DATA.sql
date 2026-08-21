-- ==============================================================================
-- SIGA: Script de Limpeza e Expurgo de Dados de Teste / Demonstração para Produção
-- ==============================================================================
-- Executar no SQL Editor do projeto Supabase (xodgfmxiaunpamctfeea) com role admin.
-- 
-- O QUE APAGA (Dados Transacionais / Operacionais de Teste):
--   - Alunos, Matrículas, Encarregados e Professores
--   - Avaliações, Pautas, Planos de Aula, Faltas e Boletins
--   - Faturas, Recibos, Caixas e Lançamentos Financeiros
--   - Pedidos de Documentos e Ficheiros da Biblioteca de Teste
--   - Comunicados, Calendário e Mensagens Internas
--   - Utilizador Demo (dev@siga.local) se existir
--
-- O QUE MANTÉM INTATOS (Estrutura Institucional & Definições):
--   - Escolas (schools) e Definições (school_settings)
--   - Anos Lectivos, Cursos, Classes, Turmas e Disciplinas
--   - Papéis (roles), Permissões e Módulos Ativos
--   - Modelos Oficiais de Documentos
-- ==============================================================================

BEGIN;

-- 1. Ficheiros e Auditoria
TRUNCATE TABLE public.siga_file_events CASCADE;
TRUNCATE TABLE public.siga_files CASCADE;

-- 2. Mensagens Internas e Planos de Aula
TRUNCATE TABLE public.siga_direct_messages CASCADE;
TRUNCATE TABLE public.siga_lesson_plan_components CASCADE;
TRUNCATE TABLE public.siga_lesson_plans CASCADE;

-- 3. Avaliações, Notas e Pautas
TRUNCATE TABLE public.sga_assessment_scores CASCADE;
TRUNCATE TABLE public.sga_assessment_items CASCADE;
TRUNCATE TABLE public.grade_scores CASCADE;
TRUNCATE TABLE public.gradebooks CASCADE;
TRUNCATE TABLE public.report_cards CASCADE;

-- 4. Assiduidade / Presença
TRUNCATE TABLE public.attendance_records CASCADE;
TRUNCATE TABLE public.attendance_sessions CASCADE;

-- 5. Documentos e Emissões
TRUNCATE TABLE public.document_request_status_history CASCADE;
TRUNCATE TABLE public.document_requests CASCADE;
TRUNCATE TABLE public.issued_documents CASCADE;

-- 6. Finanças, Faturas e Caixa
TRUNCATE TABLE public.financial_reversals CASCADE;
TRUNCATE TABLE public.payment_allocations CASCADE;
TRUNCATE TABLE public.payments CASCADE;
TRUNCATE TABLE public.cash_entries CASCADE;
TRUNCATE TABLE public.invoice_items CASCADE;
TRUNCATE TABLE public.invoices CASCADE;
TRUNCATE TABLE public.finance_students CASCADE;
TRUNCATE TABLE public.fee_installments CASCADE;

-- 7. Comunicações e Calendário
TRUNCATE TABLE public.school_announcements CASCADE;
TRUNCATE TABLE public.calendar_events CASCADE;

-- 8. Pessoas, Alunos, Encarregados e Professores
TRUNCATE TABLE public.student_guardians CASCADE;
TRUNCATE TABLE public.student_status_history CASCADE;
TRUNCATE TABLE public.enrollments CASCADE;
TRUNCATE TABLE public.students CASCADE;
TRUNCATE TABLE public.teacher_subjects CASCADE;
TRUNCATE TABLE public.teachers CASCADE;
TRUNCATE TABLE public.person_relationships CASCADE;
TRUNCATE TABLE public.person_documents CASCADE;
TRUNCATE TABLE public.person_roles CASCADE;
TRUNCATE TABLE public.people CASCADE;

-- 9. Remover Utilizador Demo se existir
DELETE FROM public.member_roles 
WHERE membership_id IN (
  SELECT sm.id FROM public.school_memberships sm
  JOIN auth.users u ON u.id = sm.user_id
  WHERE u.email = 'dev@siga.local'
);

DELETE FROM public.school_memberships 
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'dev@siga.local'
);

DELETE FROM public.profiles 
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'dev@siga.local'
);

DELETE FROM auth.users 
WHERE email = 'dev@siga.local';

COMMIT;

-- Confirmação de limpeza concluída
SELECT 'Dados de teste/demo removidos com sucesso. O sistema está pronto para produção.' as status;
