-- SGA ONLY — companion to publication guard, staged for staging tests.
-- Ensures later edits to slots of published schedules cannot bypass publication checks.
CREATE OR REPLACE FUNCTION private.prevent_published_timetable_slot_conflicts()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  current_schedule record;
  assignment record;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.school_id::text, 90240924)
  );

  IF NEW.status <> 'active' OR NEW.schedule_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, academic_year_id, valid_from, valid_to
    INTO current_schedule
  FROM public.academic_schedules
  WHERE id = NEW.schedule_id
    AND school_id = NEW.school_id
    AND status = 'published'
    AND deleted_at IS NULL;

  IF NOT FOUND THEN RETURN NEW; END IF;

  IF current_schedule.valid_from IS NULL OR current_schedule.valid_to IS NULL
     OR current_schedule.valid_to < current_schedule.valid_from THEN
    RAISE EXCEPTION 'Corrija as datas de validade do horário publicado antes de editar aulas'
      USING ERRCODE = '23514';
  END IF;

  SELECT class_group_id, teacher_id INTO assignment
  FROM public.class_subjects
  WHERE school_id = NEW.school_id AND id = NEW.class_subject_id;

  IF EXISTS (
    SELECT 1
    FROM public.timetable_slots other
    JOIN public.class_subjects other_cs
      ON other_cs.school_id = other.school_id
     AND other_cs.id = other.class_subject_id
     AND other_cs.status = 'active'
    JOIN public.academic_schedules published
      ON published.id = other.schedule_id
     AND published.school_id = other.school_id
     AND published.status = 'published'
     AND published.deleted_at IS NULL
     AND published.academic_year_id = current_schedule.academic_year_id
     AND published.id <> current_schedule.id
     AND published.valid_from <= current_schedule.valid_to
     AND published.valid_to >= current_schedule.valid_from
    WHERE other.school_id = NEW.school_id
      AND other.status = 'active'
      AND other.weekday = NEW.weekday
      AND other.starts_at < NEW.ends_at
      AND NEW.starts_at < other.ends_at
      AND (
        other_cs.class_group_id = assignment.class_group_id
        OR (assignment.teacher_id IS NOT NULL
            AND other_cs.teacher_id = assignment.teacher_id)
        OR (NEW.room_id IS NOT NULL AND other.room_id = NEW.room_id)
      )
  ) THEN
    RAISE EXCEPTION 'A alteração entra em conflito com outro horário publicado'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.prevent_published_timetable_slot_conflicts()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zz_prevent_published_timetable_slot_conflicts
  ON public.timetable_slots;
CREATE TRIGGER zz_prevent_published_timetable_slot_conflicts
BEFORE INSERT OR UPDATE OF school_id, class_subject_id, schedule_id,
  weekday, starts_at, ends_at, room_id, status
ON public.timetable_slots
FOR EACH ROW EXECUTE FUNCTION private.prevent_published_timetable_slot_conflicts();

-- Remaining risk: changes to class_subjects.teacher_id after publication
-- must be checked across published versions before production deployment.
