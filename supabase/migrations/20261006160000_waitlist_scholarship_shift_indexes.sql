-- Índices das chaves estrangeiras das tabelas novas (consultor de desempenho, 06/10).
--
-- - class_group_waitlist: por turma e por aluno (apagar uma turma ou um aluno, e a
--   verificação «já tem turma» ao colocar);
-- - student_scholarships: por aluno (emissão de cada fatura lê as bolsas do aluno);
-- - course_unit_enrollments: pelo turno (apagar uma turma limpa o turno: ON DELETE SET NULL).
--
-- As chaves para auth.users (created_by, placed_by…) ficam sem índice, como no resto do
-- esquema: só se usam na auditoria. Idempotente; só índices, sem mudar dados.
-- Aplicar na produção depois de este ficheiro estar na main (auditoria 12, secção 7).

CREATE INDEX IF NOT EXISTS class_group_waitlist_class_group
  ON public.class_group_waitlist (class_group_id);
CREATE INDEX IF NOT EXISTS class_group_waitlist_student
  ON public.class_group_waitlist (student_id);
CREATE INDEX IF NOT EXISTS student_scholarships_student
  ON public.student_scholarships (student_id);
CREATE INDEX IF NOT EXISTS course_unit_enrollments_class_group
  ON public.course_unit_enrollments (school_id, class_group_id)
  WHERE class_group_id IS NOT NULL;
