-- Entregas de trabalhos (PDF) dos alunos, pela app SIGA Plus.
--
-- Cada aluno tem no máximo uma entrega por tarefa; reenviar antes do prazo
-- substitui o ficheiro e soma a versão. O ficheiro fica no bucket privado
-- `siga-files` em <escola>/<aaaa>/<mm>/submissions/<utilizador>/<id>-<nome>.pdf;
-- o servidor confirma que é PDF (cabeçalho %PDF-) e que tem até 10 MB.
--
-- Tabela só do servidor (DATABASE_RULES, regra 5): sem políticas, FORCE RLS e
-- sem acesso de anon/authenticated. Alunos e professores lêem pela API Mobile
-- V4 e pelo portal, com as verificações de escola, perfil e disciplina.
-- Pode correr mais do que uma vez.

CREATE TABLE IF NOT EXISTS public.siga_task_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.siga_class_tasks(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  storage_path text NOT NULL CHECK (length(storage_path) BETWEEN 10 AND 400),
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 160),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  mime_type text NOT NULL DEFAULT 'application/pdf'
    CHECK (mime_type = 'application/pdf'),
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'returned')),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT siga_task_submissions_one_per_student UNIQUE (task_id, student_id)
);

CREATE INDEX IF NOT EXISTS siga_task_submissions_task_idx
  ON public.siga_task_submissions (school_id, task_id);
CREATE INDEX IF NOT EXISTS siga_task_submissions_student_idx
  ON public.siga_task_submissions (school_id, student_id);

-- Protecção relacional: os gatilhos validam a nova linha, mas apenas as FKs
-- compostas mantêm o vínculo à escola se a tarefa ou o aluno forem alterados
-- posteriormente (e com escritas concorrentes). Os dois índices únicos
-- reiteram a identidade por escola sem alterar os PKs existentes.
CREATE UNIQUE INDEX IF NOT EXISTS siga_tasks_school_identity_idx
  ON public.siga_class_tasks (school_id, id);
-- A tabela students já possui UNIQUE (school_id, id) no esquema base.

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.siga_task_submissions'::regclass
      AND conname = 'siga_submission_task_same_school_fk'
  ) THEN
    ALTER TABLE public.siga_task_submissions
      ADD CONSTRAINT siga_submission_task_same_school_fk
      FOREIGN KEY (school_id, task_id)
      REFERENCES public.siga_class_tasks (school_id, id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.siga_task_submissions'::regclass
      AND conname = 'siga_submission_student_same_school_fk'
  ) THEN
    ALTER TABLE public.siga_task_submissions
      ADD CONSTRAINT siga_submission_student_same_school_fk
      FOREIGN KEY (school_id, student_id)
      REFERENCES public.students (school_id, id) ON DELETE CASCADE;
  END IF;
END
$migration$;

-- Tarefa e aluno da mesma escola da entrega (auditoria da PR #132): a chave
-- estrangeira só garante que o id existe.
CREATE OR REPLACE FUNCTION private.validate_task_submission_school_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.siga_class_tasks AS t
    WHERE t.id = NEW.task_id AND t.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'Tarefa não pertence à escola da entrega'
      USING ERRCODE = '23503', CONSTRAINT = 'task_submission_task_same_school';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.students AS st
    WHERE st.id = NEW.student_id AND st.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'Aluno não pertence à escola da entrega'
      USING ERRCODE = '23503', CONSTRAINT = 'task_submission_student_same_school';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.validate_task_submission_school_references() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS validate_task_submission_school ON public.siga_task_submissions;
CREATE TRIGGER validate_task_submission_school
  BEFORE INSERT OR UPDATE OF school_id, task_id, student_id ON public.siga_task_submissions
  FOR EACH ROW EXECUTE FUNCTION private.validate_task_submission_school_references();

DROP TRIGGER IF EXISTS siga_task_submissions_touch ON public.siga_task_submissions;
CREATE TRIGGER siga_task_submissions_touch
  BEFORE UPDATE ON public.siga_task_submissions
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

DROP TRIGGER IF EXISTS audit_siga_task_submissions ON public.siga_task_submissions;
CREATE TRIGGER audit_siga_task_submissions
  AFTER INSERT OR DELETE OR UPDATE ON public.siga_task_submissions
  FOR EACH ROW EXECUTE FUNCTION private.audit_row_change();

ALTER TABLE public.siga_task_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_task_submissions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_task_submissions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_task_submissions TO service_role;
