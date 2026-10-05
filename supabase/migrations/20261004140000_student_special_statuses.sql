-- Estatutos especiais do estudante: trabalhador-estudante.
--
-- No Ensino Superior (e onde a escola o quiser), o trabalhador-estudante tem regras
-- próprias (regulamento SIGARRA, docs/higher-ed/ANALISE_REQUISITOS_ANGOLA.md):
--   * as faltas não o excluem da avaliação;
--   * vai à época especial sem ser finalista;
--   * para a situação académica e a prescrição, cada ano conta 50 %.
-- Cada regra liga-se no regulamento (domínio `higher_ed`); esta tabela guarda quem tem
-- o estatuto, de quando a quando e com que prova.
--
-- Dados de emprego de um estudante: tabela sensível, só o servidor lhe toca
-- (Administrador/Secretaria, src/features/higher-ed/student-status.ts). FORCE RLS,
-- sem políticas, REVOKE de PUBLIC, anon e authenticated (DATABASE_RULES 5).
-- `kind` aceita outros estatutos no futuro (atleta, dirigente associativo…).
-- Idempotente. Regras: docs/agents/DATABASE_RULES.md.

CREATE TABLE IF NOT EXISTS public.student_special_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'worker_student'
    CHECK (kind IN ('worker_student')),
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date,
  employer text CHECK (employer IS NULL OR char_length(employer) <= 200),
  evidence_note text CHECK (evidence_note IS NULL OR char_length(evidence_note) <= 1000),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoke_reason text CHECK (revoke_reason IS NULL OR char_length(revoke_reason) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT student_special_statuses_valid_range
    CHECK (valid_until IS NULL OR valid_until >= valid_from)
);

-- Um estatuto em vigor por estudante e tipo (os revogados ficam no histórico).
CREATE UNIQUE INDEX IF NOT EXISTS student_special_statuses_one_open
  ON public.student_special_statuses (school_id, student_id, kind)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS student_special_statuses_school_idx
  ON public.student_special_statuses (school_id, kind, valid_from DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'student_special_statuses_touch'
      AND tgrelid = 'public.student_special_statuses'::regclass
  ) THEN
    CREATE TRIGGER student_special_statuses_touch
      BEFORE UPDATE ON public.student_special_statuses
      FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();
  END IF;
END $$;

ALTER TABLE public.student_special_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_special_statuses FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_special_statuses FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.student_special_statuses TO service_role;
