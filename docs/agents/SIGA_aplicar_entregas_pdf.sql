-- SIGA Plus — SQL a aplicar no Supabase (projecto Sga), pacote de 2026-10-17
-- Colar TUDO no SQL Editor → Run. Pode correr mais do que uma vez sem problema.
-- 1 migração: entregas de trabalhos em PDF pelos alunos (app SIGA Plus). Cria a
-- tabela siga_task_submissions, só do servidor (sem acesso directo pela API).
-- Não mexe em dados existentes.
-- Confirmar no fim com a consulta do fundo deste ficheiro (deve dar "aplicada").


-- ══════════ 20261017140000_task_submissions.sql ══════════
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

-- ══════════ Confirmação ══════════
SELECT CASE WHEN to_regclass('public.siga_task_submissions') IS NOT NULL
  THEN 'aplicada' ELSE 'em falta' END AS siga_task_submissions;
