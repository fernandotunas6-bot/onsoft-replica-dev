-- Vigência docente acompanha o arquivo da turma (seguimento de 20261029220000).
--
-- Desactivar uma turma (deleteClassGroup) só muda `class_groups.status` para
-- 'archived'; as linhas de `class_subjects` ficam como estavam para a turma poder
-- ser reactivada com as mesmas atribuições. O gatilho da vigência só olhava para
-- `class_subjects`, por isso os períodos dos professores de uma turma arquivada
-- ficavam abertos para sempre.
--
-- Aqui, sem mudar nenhuma escrita existente nem `class_subjects`:
--   · novo motivo de fim 'class_archived';
--   · gatilho AFTER UPDATE OF status em `class_groups`: arquivar fecha os períodos
--     abertos da turma; sair de 'archived' reabre um período (início no dia) para
--     cada disciplina activa com professor;
--   · `private.track_class_subject_teacher_period` não abre período numa turma
--     arquivada (atribuir um professor a uma turma arquivada não o põe em vigor);
--   · fecha agora os períodos já abertos em turmas arquivadas.
--
-- Só os estados 'archived' contam: 'closed' e 'draft' mantêm o comportamento de
-- 20261029220000. Idempotente; exige 20261029220000 aplicada antes.

DO $$
BEGIN
  IF to_regclass('public.class_subject_teacher_periods') IS NULL THEN
    RAISE EXCEPTION 'Aplique primeiro 20261029220000_class_subject_teacher_periods.sql.';
  END IF;
END $$;

ALTER TABLE public.class_subject_teacher_periods
  DROP CONSTRAINT IF EXISTS class_subject_teacher_periods_end_reason_check;
ALTER TABLE public.class_subject_teacher_periods
  ADD CONSTRAINT class_subject_teacher_periods_end_reason_check
  CHECK (end_reason IS NULL OR end_reason IN (
    'teacher_changed', 'unassigned', 'inactive', 'class_archived'
  ));

CREATE OR REPLACE FUNCTION private.track_class_subject_teacher_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'Africa/Luanda')::date;
  v_archived boolean;
  v_active boolean;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.teacher_id IS NOT DISTINCT FROM OLD.teacher_id
     AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.class_groups g
     WHERE g.school_id = NEW.school_id AND g.id = NEW.class_group_id AND g.status = 'archived'
  ) INTO v_archived;
  v_active := NEW.teacher_id IS NOT NULL AND NEW.status = 'active' AND NOT v_archived;

  -- Fecha o período aberto que deixou de corresponder à linha.
  UPDATE public.class_subject_teacher_periods p
     SET ends_on = greatest(p.starts_on, v_today),
         closed_by = NEW.updated_by,
         end_reason = CASE
           WHEN NEW.teacher_id IS NULL THEN 'unassigned'
           WHEN NEW.teacher_id IS DISTINCT FROM p.teacher_id THEN 'teacher_changed'
           WHEN NEW.status IS DISTINCT FROM 'active' THEN 'inactive'
           ELSE 'class_archived'
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

CREATE OR REPLACE FUNCTION private.track_class_group_teacher_periods()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'Africa/Luanda')::date;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;

  IF NEW.status = 'archived' THEN
    UPDATE public.class_subject_teacher_periods p
       SET ends_on = greatest(p.starts_on, v_today),
           closed_by = NEW.updated_by,
           end_reason = 'class_archived'
      FROM public.class_subjects cs
     WHERE cs.school_id = NEW.school_id
       AND cs.class_group_id = NEW.id
       AND p.school_id = cs.school_id
       AND p.class_subject_id = cs.id
       AND p.ends_on IS NULL;
  ELSIF OLD.status = 'archived' THEN
    INSERT INTO public.class_subject_teacher_periods
      (school_id, class_subject_id, teacher_id, starts_on, opened_by)
    SELECT cs.school_id, cs.id, cs.teacher_id, v_today, NEW.updated_by
      FROM public.class_subjects cs
     WHERE cs.school_id = NEW.school_id
       AND cs.class_group_id = NEW.id
       AND cs.teacher_id IS NOT NULL
       AND cs.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM public.class_subject_teacher_periods p
          WHERE p.school_id = cs.school_id AND p.class_subject_id = cs.id AND p.ends_on IS NULL
       );
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION private.track_class_group_teacher_periods() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS class_groups_track_teacher_periods ON public.class_groups;
CREATE TRIGGER class_groups_track_teacher_periods
  AFTER UPDATE OF status ON public.class_groups
  FOR EACH ROW EXECUTE FUNCTION private.track_class_group_teacher_periods();

-- Turmas já arquivadas: fecha os períodos que ficaram abertos. A data do arquivo
-- não está guardada; usa-se a última alteração da turma (normalmente o arquivo).
UPDATE public.class_subject_teacher_periods p
   SET ends_on = greatest(p.starts_on, least(
         (g.updated_at AT TIME ZONE 'Africa/Luanda')::date,
         (now() AT TIME ZONE 'Africa/Luanda')::date)),
       end_reason = 'class_archived'
  FROM public.class_subjects cs
  JOIN public.class_groups g ON g.school_id = cs.school_id AND g.id = cs.class_group_id
 WHERE g.status = 'archived'
   AND p.school_id = cs.school_id
   AND p.class_subject_id = cs.id
   AND p.ends_on IS NULL;
