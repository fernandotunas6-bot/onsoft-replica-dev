-- Turno da cadeira (Ensino Superior).
--
-- Quando o mesmo ano do curso tem várias turmas (manhã, pós-laboral…), a mesma cadeira
-- é dada em vários turnos, muitas vezes por professores diferentes. Até aqui a inscrição
-- na cadeira (`course_unit_enrollments`) não dizia em que turma o estudante a frequenta:
-- todos os professores da cadeira viam e lançavam a pauta de todos os inscritos.
--
-- `class_group_id` guarda o turno: a turma (do mesmo curso) onde o estudante tem a
-- cadeira. NULL = sem turno (inscrições antigas): continua visível a todos os professores
-- da cadeira, como antes. A regra de quem lança está em src/features/higher-ed/shifts.ts.
--
-- A tabela já é só do servidor (FORCE RLS, sem políticas); a coluna não muda isso.
-- Pode mudar-se (troca de turno): não entra em `reject_immutable_column_changes`.
-- Idempotente.

ALTER TABLE public.course_unit_enrollments
  ADD COLUMN IF NOT EXISTS class_group_id uuid;

-- Chave composta (escola, turma), como as outras desta tabela: o turno nunca aponta para
-- uma turma de outra escola. Apagar a turma só limpa o turno (a inscrição fica).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'course_unit_enrollments_class_group_fkey'
      AND conrelid = 'public.course_unit_enrollments'::regclass
  ) THEN
    ALTER TABLE public.course_unit_enrollments
      ADD CONSTRAINT course_unit_enrollments_class_group_fkey
      FOREIGN KEY (school_id, class_group_id)
      REFERENCES public.class_groups (school_id, id)
      ON DELETE SET NULL (class_group_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS course_unit_enrollments_shift
  ON public.course_unit_enrollments (school_id, program_subject_id, class_group_id);
