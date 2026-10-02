-- SGA-only staged migration. Review and test on a clone before production.
-- Purpose: reject timetable references that belong to another school.
-- Existing single-column FKs still guarantee the referenced row exists.
CREATE OR REPLACE FUNCTION private.validate_timetable_school_references()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.room_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.rooms AS r
    WHERE r.id = NEW.room_id AND r.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'Sala não pertence à instituição do horário'
      USING ERRCODE = '23503', CONSTRAINT = 'timetable_room_same_school';
  END IF;

  IF NEW.shift_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.school_shifts AS sh
    WHERE sh.id = NEW.shift_id AND sh.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'Turno não pertence à instituição do horário'
      USING ERRCODE = '23503', CONSTRAINT = 'timetable_shift_same_school';
  END IF;

  IF NEW.schedule_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.academic_schedules AS s
    JOIN public.class_subjects AS cs
      ON cs.id = NEW.class_subject_id AND cs.school_id = NEW.school_id
    WHERE s.id = NEW.schedule_id
      AND s.school_id = NEW.school_id
      AND s.class_group_id = cs.class_group_id
  ) THEN
    RAISE EXCEPTION 'Versão do horário não corresponde à instituição e turma'
      USING ERRCODE = '23503', CONSTRAINT = 'timetable_schedule_same_school_and_class';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.validate_timetable_school_references()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS validate_timetable_school_references
  ON public.timetable_slots;
CREATE TRIGGER validate_timetable_school_references
BEFORE INSERT OR UPDATE OF school_id, class_subject_id, room_id, shift_id, schedule_id
ON public.timetable_slots
FOR EACH ROW EXECUTE FUNCTION private.validate_timetable_school_references();

-- Follow-up: check existing rows before validating composite foreign keys.
-- The trigger protects new/changed slots only; it does not repair historic rows.
