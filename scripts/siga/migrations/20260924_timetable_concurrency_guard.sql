-- SGA ONLY: staged concurrency-safe guard for timetable slot writes.
-- Deploy after school-reference guard, and only after running the preflight.
-- The per-school advisory transaction lock serializes concurrent timetable writes.
-- Scope: slots in the SAME schedule version (including legacy NULL schedule_id).
-- Different schedule versions are intentionally NOT compared here: publication
-- requires a separate cross-version validation of effective dates and resources.
-- Updates to class_subjects.teacher_id and academic_schedules.status also require
-- separate publication/assignment guards; this trigger alone cannot cover them.
CREATE OR REPLACE FUNCTION private.prevent_timetable_slot_conflicts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  assignment record;
  collision record;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.school_id IS DISTINCT FROM OLD.school_id THEN
    RAISE EXCEPTION 'Não é permitido transferir uma aula para outra instituição'
      USING ERRCODE = '23514';
  END IF;

  -- One lock per school, held to COMMIT/ROLLBACK. The lock is acquired for
  -- all writes, including cancellation, to avoid inconsistent interleavings.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.school_id::text, 90240924)
  );

  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  SELECT cs.class_group_id, cs.teacher_id, cs.status
    INTO assignment
  FROM public.class_subjects AS cs
  WHERE cs.school_id = NEW.school_id AND cs.id = NEW.class_subject_id;

  IF NOT FOUND OR assignment.status <> 'active' THEN
    RAISE EXCEPTION 'A disciplina atribuída deve estar ativa na instituição'
      USING ERRCODE = '23514';
  END IF;

  SELECT other.id,
         CASE
           WHEN other_cs.class_group_id = assignment.class_group_id THEN 'turma'
           WHEN assignment.teacher_id IS NOT NULL
                AND other_cs.teacher_id = assignment.teacher_id THEN 'docente'
           ELSE 'sala'
         END AS resource
    INTO collision
  FROM public.timetable_slots AS other
  JOIN public.class_subjects AS other_cs
    ON other_cs.school_id = other.school_id
   AND other_cs.id = other.class_subject_id
  WHERE other.school_id = NEW.school_id
    AND other.id <> NEW.id
    AND other.status = 'active'
    AND other_cs.status = 'active'
    AND other.schedule_id IS NOT DISTINCT FROM NEW.schedule_id
    AND other.weekday = NEW.weekday
    AND other.starts_at < NEW.ends_at
    AND NEW.starts_at < other.ends_at
    AND (
      other_cs.class_group_id = assignment.class_group_id
      OR (assignment.teacher_id IS NOT NULL
          AND other_cs.teacher_id = assignment.teacher_id)
      OR (NEW.room_id IS NOT NULL AND other.room_id = NEW.room_id)
    )
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Conflito de horário: %', collision.resource
      USING ERRCODE = '23514', DETAIL = 'Outra aula ativa ocupa o mesmo recurso e intervalo.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.prevent_timetable_slot_conflicts()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS prevent_timetable_slot_conflicts
  ON public.timetable_slots;
CREATE TRIGGER prevent_timetable_slot_conflicts
BEFORE INSERT OR UPDATE OF school_id, class_subject_id, schedule_id,
  weekday, starts_at, ends_at, room_id, status
ON public.timetable_slots
FOR EACH ROW EXECUTE FUNCTION private.prevent_timetable_slot_conflicts();

-- No changes to existing rows. Run the read-only conflict audit first.
