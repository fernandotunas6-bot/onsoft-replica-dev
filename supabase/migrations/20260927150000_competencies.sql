-- Competências por disciplina e ligação às avaliações.
--
-- A coordenação define as competências de cada disciplina (opcionalmente por
-- classe). O professor da disciplina liga cada avaliação (`siga_assessment_items`)
-- às competências que ela avalia. O domínio de cada aluno calcula-se a partir das
-- notas dessas avaliações e da nota de aprovação do modelo — nada é guardado em
-- duplicado.
--
-- Só o servidor lê e escreve (chave de serviço depois de validar o perfil):
-- `is_school_member` inclui alunos e encarregados. Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS public.siga_competencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  grade_level_id uuid REFERENCES public.grade_levels(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (char_length(code) BETWEEN 1 AND 20),
  description text NOT NULL CHECK (char_length(description) BETWEEN 3 AND 500),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  display_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Um código por disciplina e classe (NULL = todas as classes).
CREATE UNIQUE INDEX IF NOT EXISTS siga_competencies_code_key
  ON public.siga_competencies (school_id, subject_id, coalesce(grade_level_id, '00000000-0000-0000-0000-000000000000'::uuid), code);
CREATE INDEX IF NOT EXISTS siga_competencies_subject_idx
  ON public.siga_competencies (subject_id);
CREATE INDEX IF NOT EXISTS siga_competencies_grade_level_idx
  ON public.siga_competencies (grade_level_id);

CREATE TABLE IF NOT EXISTS public.siga_assessment_item_competencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.siga_assessment_items(id) ON DELETE CASCADE,
  competency_id uuid NOT NULL REFERENCES public.siga_competencies(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT siga_assessment_item_competencies_key UNIQUE (item_id, competency_id)
);

CREATE INDEX IF NOT EXISTS siga_assessment_item_competencies_competency_idx
  ON public.siga_assessment_item_competencies (competency_id);
CREATE INDEX IF NOT EXISTS siga_assessment_item_competencies_school_idx
  ON public.siga_assessment_item_competencies (school_id);

DROP TRIGGER IF EXISTS trg_siga_competencies_touch ON public.siga_competencies;
CREATE TRIGGER trg_siga_competencies_touch
  BEFORE UPDATE ON public.siga_competencies
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

ALTER TABLE public.siga_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_competencies FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_competencies FROM PUBLIC, anon, authenticated;

ALTER TABLE public.siga_assessment_item_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_assessment_item_competencies FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_assessment_item_competencies FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.siga_competencies IS
  'Competências por disciplina (e classe). Só o servidor.';
COMMENT ON TABLE public.siga_assessment_item_competencies IS
  'Avaliações ligadas às competências que avaliam. Só o servidor.';
