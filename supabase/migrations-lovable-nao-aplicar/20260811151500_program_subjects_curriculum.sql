-- Currículo do Curso — Ensino Superior (Fase C).
--
-- Disciplinas próprias de um curso, por semestre, com créditos ECTS. A matrícula do aluno continua
-- a passar sempre por uma turma (class_groups) — para o Ensino Superior, a turma é "virtual": uma
-- por curso+semestre, provisionada automaticamente a partir deste currículo (ver
-- provisionProgramClassGroup em academic/server.ts). Isto reaproveita sem alterações o RPC
-- enroll_student e a numeração de matrícula já existentes (não versionados neste repositório —
-- decisão deliberada de não lhes mexer às cegas).
--
-- NOTA DE SCHEMA DRIFT (encontrada ao escrever esta migração): as migrações versionadas deste
-- repositório referenciam uma tabela `public.courses` (ver 20260810122220_people_module.sql), mas a
-- aplicação e a base de dados viva usam `public.programs` — a tabela foi renomeada directamente na
-- base viva em algum momento, sem migração correspondente. Esta migração aponta para
-- `public.programs`, que é o que existe de facto hoje; a reconciliação courses/programs fica para a
-- ronda de consolidação de schema já documentada como fora de âmbito.
--
-- `public.programs` também nunca foi criada por uma migração versionada — por isso, tal como na
-- migração anterior (grading_profile), só se referencia `programs(id)` (chave primária, assunção
-- segura dado o padrão gen_random_uuid() usado em toda a base) em vez de uma chave composta
-- (school_id, id), que não se pode confirmar que exista na tabela viva.

CREATE TABLE public.program_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL,
  semester smallint NOT NULL CHECK (semester BETWEEN 1 AND 12),
  credits numeric(4,1) NOT NULL DEFAULT 6 CHECK (credits > 0 AND credits <= 60),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT program_subjects_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT program_subjects_subject_fkey
    FOREIGN KEY (school_id, subject_id)
    REFERENCES public.subjects (school_id, id),
  CONSTRAINT program_subjects_program_semester_subject_key
    UNIQUE (program_id, semester, subject_id)
);

CREATE INDEX program_subjects_program_idx
  ON public.program_subjects (school_id, program_id, semester)
  WHERE deleted_at IS NULL AND status = 'active';
CREATE INDEX program_subjects_subject_idx
  ON public.program_subjects (school_id, subject_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER program_subjects_set_updated_at
  BEFORE UPDATE ON public.program_subjects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

CREATE TRIGGER program_subjects_protect_identity
  BEFORE UPDATE ON public.program_subjects
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_column_changes(
    'id', 'school_id', 'program_id', 'subject_id', 'created_by', 'created_at'
  );

GRANT SELECT, INSERT, UPDATE ON public.program_subjects TO authenticated;
GRANT ALL ON public.program_subjects TO service_role;

ALTER TABLE public.program_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_subjects FORCE ROW LEVEL SECURITY;

CREATE POLICY "Read program subjects in own school"
  ON public.program_subjects
  FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND deleted_at IS NULL
    AND (SELECT public.can_read_students())
  );

CREATE POLICY "Create program subjects in own school"
  ON public.program_subjects
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
    AND (SELECT public.can_manage_students())
  );

CREATE POLICY "Update program subjects in own school"
  ON public.program_subjects
  FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.can_manage_students())
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.can_manage_students())
  );
