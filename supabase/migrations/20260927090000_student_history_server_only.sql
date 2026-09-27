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
