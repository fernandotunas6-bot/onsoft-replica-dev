-- Índices nas chaves estrangeiras que crescem por aluno.
--
-- O performance advisor do Supabase aponta 209 chaves estrangeiras sem índice.
-- Ao abri-las, 188 são colunas de auditoria (`created_by`, `updated_by`,
-- `issued_by`, `actor_user_id`…): ninguém pergunta «que matrículas criou o
-- utilizador X», e o índice nessas colunas é escrito em cada inserção e lido
-- nunca. Outras 12 são catálogo global limitado (máx. 614 linhas). Seguir os 209
-- avisos tornaria as escritas mais lentas sem acelerar leitura nenhuma.
--
-- Sobram estas 4, as únicas que crescem uma linha por aluno:
--
-- `class_group_waitlist`: lista de espera de uma turma, lida pelas duas pontas —
-- «quem espera nesta turma» (class_group_id) e «em que turmas este aluno espera»
-- (student_id).
--
-- `student_scholarships` e `student_special_statuses`: uma ou mais linhas por
-- aluno, sempre lidas pelo aluno (a ficha do aluno pede-as de cada vez que abre).
--
-- As quatro tabelas estão vazias hoje: criar o índice agora custa nada; criá-lo
-- com a tabela cheia trancava-a enquanto construía.
--
-- Diagnóstico completo em docs/performance/2026-10-19/motor-d-base-de-dados.md.

CREATE INDEX IF NOT EXISTS class_group_waitlist_student_idx
  ON public.class_group_waitlist (student_id);

CREATE INDEX IF NOT EXISTS class_group_waitlist_class_group_idx
  ON public.class_group_waitlist (class_group_id);

CREATE INDEX IF NOT EXISTS student_scholarships_student_idx
  ON public.student_scholarships (student_id);

CREATE INDEX IF NOT EXISTS student_special_statuses_student_idx
  ON public.student_special_statuses (student_id);
