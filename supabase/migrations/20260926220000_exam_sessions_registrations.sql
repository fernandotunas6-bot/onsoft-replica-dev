-- Recuperação, exames e resultado final.
--
-- Uma época de exames (recurso, exame especial, exame final, melhoria) pertence
-- ao ano lectivo. Cada inscrição liga uma matrícula a uma disciplina, com a média
-- de origem lida da pauta anual, a nota do exame e a média que resulta.
--
-- Nenhum limiar fica no código nem aqui: a nota de aprovação e o arredondamento
-- vêm da regra de avaliação da escola; quantas negativas dão acesso ao exame e
-- como a nota do exame entra na média (substitui, média, a maior) são
-- parâmetros de cada época, decididos pela escola.
--
-- Só o servidor lê e escreve (chave de serviço depois de validar o perfil):
-- `is_school_member` inclui alunos e encarregados. Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS public.siga_exam_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('recurso', 'exame_especial', 'exame_final', 'melhoria')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  starts_on date,
  ends_on date,
  -- Máximo de disciplinas em negativa para ter acesso (NULL = sem limite).
  max_failed_subjects integer CHECK (max_failed_subjects IS NULL OR max_failed_subjects BETWEEN 1 AND 30),
  result_method text NOT NULL DEFAULT 'replace'
    CHECK (result_method IN ('replace', 'average', 'max')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT siga_exam_sessions_dates_check
    CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS siga_exam_sessions_school_year_idx
  ON public.siga_exam_sessions (school_id, academic_year_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.siga_exam_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.siga_exam_sessions(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  class_group_id uuid NOT NULL REFERENCES public.class_groups(id) ON DELETE CASCADE,
  grade_sheet_id uuid REFERENCES public.grade_sheets(id) ON DELETE SET NULL,
  original_average numeric(6, 2),
  exam_date date,
  room text CHECK (room IS NULL OR char_length(room) <= 80),
  jury text CHECK (jury IS NULL OR char_length(jury) <= 300),
  score numeric(6, 2),
  final_average numeric(6, 2),
  status text NOT NULL DEFAULT 'registered'
    CHECK (status IN ('registered', 'absent', 'graded', 'cancelled')),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT siga_exam_registrations_unique UNIQUE (session_id, enrollment_id, subject_id),
  CONSTRAINT siga_exam_registrations_graded_check
    CHECK (status <> 'graded' OR (score IS NOT NULL AND final_average IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS siga_exam_registrations_session_class_idx
  ON public.siga_exam_registrations (session_id, class_group_id);
CREATE INDEX IF NOT EXISTS siga_exam_registrations_enrollment_idx
  ON public.siga_exam_registrations (enrollment_id);
CREATE INDEX IF NOT EXISTS siga_exam_registrations_school_idx
  ON public.siga_exam_registrations (school_id);
CREATE INDEX IF NOT EXISTS siga_exam_registrations_subject_idx
  ON public.siga_exam_registrations (subject_id);
CREATE INDEX IF NOT EXISTS siga_exam_registrations_class_group_idx
  ON public.siga_exam_registrations (class_group_id);
CREATE INDEX IF NOT EXISTS siga_exam_registrations_grade_sheet_idx
  ON public.siga_exam_registrations (grade_sheet_id);
CREATE INDEX IF NOT EXISTS siga_exam_sessions_year_idx
  ON public.siga_exam_sessions (academic_year_id);

DROP TRIGGER IF EXISTS trg_siga_exam_sessions_touch ON public.siga_exam_sessions;
CREATE TRIGGER trg_siga_exam_sessions_touch
  BEFORE UPDATE ON public.siga_exam_sessions
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

DROP TRIGGER IF EXISTS trg_siga_exam_registrations_touch ON public.siga_exam_registrations;
CREATE TRIGGER trg_siga_exam_registrations_touch
  BEFORE UPDATE ON public.siga_exam_registrations
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

ALTER TABLE public.siga_exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_exam_sessions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_exam_sessions FROM PUBLIC, anon, authenticated;

ALTER TABLE public.siga_exam_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_exam_registrations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_exam_registrations FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.siga_exam_sessions IS
  'Épocas de exame (recurso, especial, final, melhoria) por ano lectivo. Só o servidor.';
COMMENT ON TABLE public.siga_exam_registrations IS
  'Inscrições em exame por matrícula e disciplina, com média de origem, nota e média final. Só o servidor.';
