-- Entregas de trabalhos (SPEC docs/specs/SGA_TRABALHOS_MATRICULAS_2026-10-25.md, §2).
--
-- O professor publica tarefas em siga_class_tasks, mas o aluno não tinha onde entregar.
-- Uma linha por tentativa: reenviar cria a tentativa seguinte, nada se apaga. A nota e o
-- comentário só ficam visíveis ao aluno depois de devolvidos (returned_at).
--
-- Trabalhos de menores: só o servidor lê e escreve (FORCE RLS e REVOKE), que valida o
-- papel e o âmbito do professor. Idempotente: pode correr duas vezes.

-- Opções da tarefa: aceitar entregas atrasadas e ligar à avaliação da pauta.
ALTER TABLE public.siga_class_tasks
  ADD COLUMN IF NOT EXISTS accepts_late boolean NOT NULL DEFAULT true;
ALTER TABLE public.siga_class_tasks
  ADD COLUMN IF NOT EXISTS assessment_item_id uuid
    REFERENCES public.siga_assessment_items(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.siga_class_task_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.siga_class_tasks(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  attempt smallint NOT NULL DEFAULT 1 CHECK (attempt BETWEEN 1 AND 20),
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('draft', 'submitted', 'returned')),
  body text CHECK (body IS NULL OR char_length(body) <= 4000),
  file_id uuid REFERENCES public.siga_files(id) ON DELETE SET NULL,
  -- Entrega em papel registada pelo professor (primário), sem texto nem ficheiro.
  on_paper boolean NOT NULL DEFAULT false,
  submitted_at timestamptz,
  is_late boolean NOT NULL DEFAULT false,
  grade numeric(6, 2) CHECK (grade IS NULL OR grade >= 0),
  feedback text CHECK (feedback IS NULL OR char_length(feedback) <= 2000),
  graded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  returned_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT siga_class_task_submissions_attempt_key UNIQUE (task_id, enrollment_id, attempt),
  -- Devolvida implica data de devolução; entregue implica data de entrega.
  CONSTRAINT siga_class_task_submissions_returned_check
    CHECK (status <> 'returned' OR returned_at IS NOT NULL),
  CONSTRAINT siga_class_task_submissions_submitted_check
    CHECK (status = 'draft' OR submitted_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS siga_class_task_submissions_task_idx
  ON public.siga_class_task_submissions (task_id, status);
CREATE INDEX IF NOT EXISTS siga_class_task_submissions_enrollment_idx
  ON public.siga_class_task_submissions (school_id, enrollment_id);

DROP TRIGGER IF EXISTS siga_class_task_submissions_touch ON public.siga_class_task_submissions;
CREATE TRIGGER siga_class_task_submissions_touch
  BEFORE UPDATE ON public.siga_class_task_submissions
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

ALTER TABLE public.siga_class_task_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_class_task_submissions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_class_task_submissions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_class_task_submissions TO service_role;
