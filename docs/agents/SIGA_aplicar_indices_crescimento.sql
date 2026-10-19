-- SIGA Plus — SQL a aplicar no Supabase (projecto Sga), pacote de 2026-10-19 — POR APLICAR.
-- Colar TUDO no SQL Editor → Run. Pode correr mais do que uma vez sem problema.
--
-- 4 índices, nada mais. Não cria tabelas, não mexe em políticas, não apaga nada,
-- não toca em dados. É seguro correr com a escola a trabalhar.
--
-- Porquê só 4: o performance advisor do Supabase aponta 209 chaves estrangeiras
-- sem índice. Ao abri-las, 188 são colunas de auditoria (`created_by`,
-- `updated_by`, `issued_by`, `actor_user_id`…) — ninguém pergunta «que matrículas
-- criou o utilizador X», e um índice nessas colunas é escrito em cada inserção e
-- lido nunca. Outras 12 são catálogo global limitado (máx. 614 linhas). Sobram
-- estas 4, que são as únicas que crescem uma linha por aluno.
--
-- Diagnóstico completo em docs/performance/2026-10-19/motor-d-base-de-dados.md.
--
-- As quatro tabelas estão vazias hoje: o ganho é por antecipação, para o índice já
-- lá estar quando a funcionalidade for usada. Criar o índice agora custa nada;
-- criá-lo com a tabela cheia tranca-a enquanto constrói.


-- ══════════ 20261019120000_growth_foreign_key_indexes.sql ══════════
-- Índices nas chaves estrangeiras que crescem por aluno.
--
-- `class_group_waitlist`: lista de espera de uma turma. Lida pelas duas pontas —
-- «quem espera nesta turma» (class_group_id) e «em que turmas este aluno espera»
-- (student_id). Sem índice, cada leitura varre a tabela inteira, e ela cresce com
-- os alunos em espera de toda a escola.
--
-- `student_scholarships` e `student_special_statuses`: uma ou mais linhas por
-- aluno, sempre lidas pelo aluno (a ficha do aluno pede-as de cada vez que abre).

CREATE INDEX IF NOT EXISTS class_group_waitlist_student_idx
  ON public.class_group_waitlist (student_id);

CREATE INDEX IF NOT EXISTS class_group_waitlist_class_group_idx
  ON public.class_group_waitlist (class_group_id);

CREATE INDEX IF NOT EXISTS student_scholarships_student_idx
  ON public.student_scholarships (student_id);

CREATE INDEX IF NOT EXISTS student_special_statuses_student_idx
  ON public.student_special_statuses (student_id);


-- ══════════ Confirmação ══════════
-- Deve devolver 4 linhas, uma por índice. Se devolver menos, algum não foi criado.

SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'class_group_waitlist_student_idx',
    'class_group_waitlist_class_group_idx',
    'student_scholarships_student_idx',
    'student_special_statuses_student_idx'
  )
ORDER BY tablename, indexname;
