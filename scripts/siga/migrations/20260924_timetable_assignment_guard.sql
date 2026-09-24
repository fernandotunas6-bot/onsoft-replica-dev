-- SGA ONLY — staged companion to timetable_concurrency_guard.
-- SQL delimiter fixed; verify syntax on a staging database before rollout.
-- Run after the slot guard, in staging first.
-- Prevents a teacher/class reassignment from introducing clashes into
-- existing active timetable slots. Uses the SAME per-school advisory lock.
-- All assignment changes must acquire the lock, including deactivation.
CREATE OR REPLACE FUNCTION private.prevent_timetable_assignment_conflicts()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conflicting_slot uuid;
BEGIN
  IF NEW.school_id IS DISTINCT FROM OLD.school_id THEN
    RAISE EXCEPTION 'Não é permitido transferir a disciplina atribuída entre instituições'
      USING ERRCODE = '23514';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.school_id::text, 90240924)
  );

  -- Deactivation cannot introduce a new timetable conflict.
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  -- Recheck every active slot. For another slot of THIS assignment,
  -- compare against NEW values, not the OLD values still in the table.
  -- Room collisions are unaffected by changing teacher/class and are
  -- handled by the slot guard instead.
  SELECT current_slot.id INTO conflicting_slot
  FROM public.timetable_slots AS current_slot
  JOIN public.timetable_slots AS other
    ON other.school_id = current_slot.school_id
   AND other.id <> current_slot.id
   AND other.status = 'active'
   AND other.schedule_id IS NOT DISTINCT FROM current_slot.schedule_id
   AND other.weekday = current_slot.weekday
   AND other.starts_at < current_slot.ends_at
   AND current_slot.starts_at < other.ends_at
  JOIN public.class_subjects AS other_assignment
    ON other_assignment.school_id = other.school_id
   AND other_assignment.id = other.class_subject_id
   AND other_assignment.status = 'active'
  WHERE current_slot.school_id = NEW.school_id
    AND current_slot.class_subject_id = NEW.id
    AND current_slot.status = 'active'
    AND (
      (CASE WHEN other_assignment.id = NEW.id
        THEN NEW.class_group_id ELSE other_assignment.class_group_id END) = NEW.class_group_id
      OR (NEW.teacher_id IS NOT NULL
          AND (CASE WHEN other_assignment.id = NEW.id
            THEN NEW.teacher_id ELSE other_assignment.teacher_id END) = NEW.teacher_id)
    )
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'A alteração da atribuição cria um conflito no horário'
      USING ERRCODE = '23514',
            DETAIL = 'Reveja as aulas existentes antes de alterar turma ou professor.';
  END IF;

  -- Changing the assignment's class can also invalidate its schedule link.
  IF EXISTS (
    SELECT 1
    FROM public.timetable_slots AS ts
    JOIN public.academic_schedules AS s
      ON s.id = ts.schedule_id
    WHERE ts.school_id = NEW.school_id
      AND ts.class_subject_id = NEW.id
      AND s.class_group_id <> NEW.class_group_id
  ) THEN
    RAISE EXCEPTION 'A nova turma não corresponde à versão do horário'
      USING ERRCODE = '23503';
  END IF;

  -- A teacher/class reassignment must also respect OTHER published schedule
  -- versions whose effective dates overlap. Compare NEW assignment values
  -- even though the underlying row still contains OLD values in this trigger.
  IF EXISTS (
    SELECT 1
    FROM public.timetable_slots AS current_slot
    JOIN public.academic_schedules AS current_schedule
      ON current_schedule.id = current_slot.schedule_id
     AND current_schedule.school_id = current_slot.school_id
     AND current_schedule.status = 'published'
     AND current_schedule.deleted_at IS NULL
    JOIN public.timetable_slots AS other
      ON other.school_id = current_slot.school_id
     AND other.status = 'active'
     AND other.weekday = current_slot.weekday
     AND other.starts_at < current_slot.ends_at
     AND current_slot.starts_at < other.ends_at
    JOIN public.class_subjects AS other_assignment
      ON other_assignment.id = other.class_subject_id
     AND other_assignment.school_id = other.school_id
     AND other_assignment.status = 'active'
    JOIN public.academic_schedules AS other_schedule
      ON other_schedule.id = other.schedule_id
     AND other_schedule.school_id = other.school_id
     AND other_schedule.status = 'published'
     AND other_schedule.deleted_at IS NULL
     AND other_schedule.id <> current_schedule.id
     AND other_schedule.academic_year_id = current_schedule.academic_year_id
     AND other_schedule.valid_from <= current_schedule.valid_to
     AND other_schedule.valid_to >= current_schedule.valid_from
    WHERE current_slot.school_id = NEW.school_id
      AND current_slot.class_subject_id = NEW.id
      AND current_slot.status = 'active'
      AND (
        (CASE WHEN other_assignment.id = NEW.id
          THEN NEW.class_group_id ELSE other_assignment.class_group_id END)
            = NEW.class_group_id
        OR (NEW.teacher_id IS NOT NULL
          AND (CASE WHEN other_assignment.id = NEW.id
            THEN NEW.teacher_id ELSE other_assignment.teacher_id END)
              = NEW.teacher_id)
      )
  ) THEN
    RAISE EXCEPTION 'A alteração cria conflito com outra versão publicada'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$;

REVOKE ALL ON FUNCTION private.prevent_timetable_assignment_conflicts()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS prevent_timetable_assignment_conflicts
  ON public.class_subjects;
CREATE TRIGGER prevent_timetable_assignment_conflicts
BEFORE UPDATE OF school_id, class_group_id, teacher_id, status
ON public.class_subjects
FOR EACH ROW
WHEN (
  OLD.school_id IS DISTINCT FROM NEW.school_id
  OR OLD.class_group_id IS DISTINCT FROM NEW.class_group_id
  OR OLD.teacher_id IS DISTINCT FROM NEW.teacher_id
  OR OLD.status IS DISTINCT FROM NEW.status
)
EXECUTE FUNCTION private.prevent_timetable_assignment_conflicts();
