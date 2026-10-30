-- Vigência das atribuições professor–disciplina–turma.
--
-- `class_subjects` guarda só o professor actual (`teacher_id`): ao trocar de professor
-- (assignClassSubjectTeacher, importação de horários) ou ao desligá-lo, o anterior
-- desaparecia sem rasto. Não se sabia quem deu a disciplina numa turma em Março, nem
-- desde quando o professor actual a tem.
--
-- Esta migração é aditiva e não muda o comportamento de nenhuma escrita existente:
--   · tabela nova `class_subject_teacher_periods`: um período por professor e
--     atribuição, com início, fim e motivo do fim;
--   · gatilho AFTER em `class_subjects`: atribuir abre um período; trocar de professor,
--     desligá-lo ou desactivar a disciplina fecha o aberto (e abre o do novo professor);
--   · preenchimento inicial: cada atribuição activa com professor recebe um período
--     aberto com início na criação da linha, marcado `estimated_start` (a data real da
--     atribuição actual não está guardada em lado nenhum);
--   · só o servidor lê (regra 5 de docs/agents/DATABASE_RULES.md).
--
-- A autorização de notas continua a ser a de `class_subjects.teacher_id`
-- (enforce_teacher_assessment_score_scope): um professor com o período fechado já não é
-- o professor da linha. Idempotente; pode correr mais do que uma vez.

CREATE TABLE IF NOT EXISTS public.class_subject_teacher_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_subject_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  starts_on date NOT NULL,
  ends_on date,
  end_reason text,
  estimated_start boolean NOT NULL DEFAULT false,
  opened_by uuid,
  closed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_subject_teacher_periods_class_subject_fkey
    FOREIGN KEY (school_id, class_subject_id)
    REFERENCES public.class_subjects (school_id, id) ON DELETE CASCADE,
  CONSTRAINT class_subject_teacher_periods_teacher_fkey
    FOREIGN KEY (school_id, teacher_id)
    REFERENCES public.teachers (school_id, id) ON DELETE CASCADE,
  CONSTRAINT class_subject_teacher_periods_dates_check
    CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT class_subject_teacher_periods_end_reason_check
    CHECK (end_reason IS NULL OR end_reason IN ('teacher_changed', 'unassigned', 'inactive'))
);

-- Uma só atribuição em vigor por disciplina da turma.
CREATE UNIQUE INDEX IF NOT EXISTS class_subject_teacher_periods_open_uidx
  ON public.class_subject_teacher_periods (class_subject_id) WHERE ends_on IS NULL;
CREATE INDEX IF NOT EXISTS class_subject_teacher_periods_teacher_idx
  ON public.class_subject_teacher_periods (school_id, teacher_id, starts_on);
CREATE INDEX IF NOT EXISTS class_subject_teacher_periods_class_subject_idx
  ON public.class_subject_teacher_periods (school_id, class_subject_id, starts_on);

ALTER TABLE public.class_subject_teacher_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_subject_teacher_periods FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.class_subject_teacher_periods FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.class_subject_teacher_periods TO service_role;

CREATE OR REPLACE FUNCTION private.track_class_subject_teacher_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'Africa/Luanda')::date;
  v_active boolean := NEW.teacher_id IS NOT NULL AND NEW.status = 'active';
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.teacher_id IS NOT DISTINCT FROM OLD.teacher_id
     AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;

  -- Fecha o período aberto que deixou de corresponder à linha.
  UPDATE public.class_subject_teacher_periods p
     SET ends_on = greatest(p.starts_on, v_today),
         closed_by = NEW.updated_by,
         end_reason = CASE
           WHEN NEW.teacher_id IS NULL THEN 'unassigned'
           WHEN NEW.teacher_id IS DISTINCT FROM p.teacher_id THEN 'teacher_changed'
           ELSE 'inactive'
         END
   WHERE p.school_id = NEW.school_id
     AND p.class_subject_id = NEW.id
     AND p.ends_on IS NULL
     AND (NOT v_active OR p.teacher_id IS DISTINCT FROM NEW.teacher_id);

  IF v_active AND NOT EXISTS (
    SELECT 1 FROM public.class_subject_teacher_periods p
     WHERE p.school_id = NEW.school_id AND p.class_subject_id = NEW.id AND p.ends_on IS NULL
  ) THEN
    INSERT INTO public.class_subject_teacher_periods
      (school_id, class_subject_id, teacher_id, starts_on, opened_by)
    VALUES (NEW.school_id, NEW.id, NEW.teacher_id, v_today, NEW.updated_by);
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION private.track_class_subject_teacher_period() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS class_subjects_track_teacher_period ON public.class_subjects;
CREATE TRIGGER class_subjects_track_teacher_period
  AFTER INSERT OR UPDATE OF teacher_id, status ON public.class_subjects
  FOR EACH ROW EXECUTE FUNCTION private.track_class_subject_teacher_period();

-- Atribuições activas de hoje: período aberto desde a criação da linha (estimado).
INSERT INTO public.class_subject_teacher_periods
  (school_id, class_subject_id, teacher_id, starts_on, estimated_start, opened_by)
SELECT cs.school_id, cs.id, cs.teacher_id,
       least((cs.created_at AT TIME ZONE 'Africa/Luanda')::date,
             (now() AT TIME ZONE 'Africa/Luanda')::date),
       true, cs.created_by
  FROM public.class_subjects cs
 WHERE cs.teacher_id IS NOT NULL
   AND cs.status = 'active'
   AND NOT EXISTS (
     SELECT 1 FROM public.class_subject_teacher_periods p
      WHERE p.school_id = cs.school_id AND p.class_subject_id = cs.id AND p.ends_on IS NULL
   );
