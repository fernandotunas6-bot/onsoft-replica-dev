-- SGA ONLY — STAGED, NOT APPLIED. Run after both timetable guards.
-- Fail closed on unknown effective dates; legacy NULL-date schedules need
-- explicit migration policy before enabling this trigger in production.
-- All publication paths must update academic_schedules.status transactionally.
CREATE OR REPLACE FUNCTION private.prevent_timetable_publication_conflicts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  conflicting_slot uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.school_id IS DISTINCT FROM OLD.school_id THEN
    RAISE EXCEPTION 'Não é permitido mudar a instituição de um horário'
      USING ERRCODE = '23514';
  END IF;

  -- Serialize publication with timetable writes and teacher reassignments.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.school_id::text, 90240924)
  );

  IF NEW.status <> 'published' OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.valid_from IS NULL OR NEW.valid_to IS NULL
     OR NEW.valid_to < NEW.valid_from THEN
    RAISE EXCEPTION 'Defina datas válidas antes de publicar o horário'
      USING ERRCODE = '23514';
  END IF;

  -- Do not publish a draft containing internal overlaps, even if its slots
  -- were inserted before the slot guard was installed.
  IF EXISTS (
    SELECT 1
    FROM public.timetable_slots a
    JOIN public.timetable_slots b
      ON b.school_id = a.school_id
     AND b.schedule_id = a.schedule_id
     AND b.id > a.id
     AND b.status = 'active'
     AND b.weekday = a.weekday
     AND b.starts_at < a.ends_at
     AND a.starts_at < b.ends_at
    JOIN public.class_subjects ac
      ON ac.school_id = a.school_id AND ac.id = a.class_subject_id
     AND ac.status = 'active'
    JOIN public.class_subjects bc
      ON bc.school_id = b.school_id AND bc.id = b.class_subject_id
     AND bc.status = 'active'
    WHERE a.school_id = NEW.school_id
      AND a.schedule_id = NEW.id
      AND a.status = 'active'
      AND (
        ac.class_group_id = bc.class_group_id
        OR (ac.teacher_id IS NOT NULL AND ac.teacher_id = bc.teacher_id)
        OR (a.room_id IS NOT NULL AND a.room_id = b.room_id)
      )
  ) THEN
    RAISE EXCEPTION 'A versão contém aulas sobrepostas e não pode ser publicada'
      USING ERRCODE = '23514';
  END IF;

  -- Compare only other published, non-deleted schedules in the same school
  -- and academic year whose effective dates intersect (inclusive).
  SELECT candidate.id INTO conflicting_slot
  FROM public.timetable_slots AS candidate
  JOIN public.class_subjects AS candidate_assignment
    ON candidate_assignment.school_id = candidate.school_id
   AND candidate_assignment.id = candidate.class_subject_id
   AND candidate_assignment.status = 'active'
  JOIN public.timetable_slots AS occupied
    ON occupied.school_id = candidate.school_id
   AND occupied.status = 'active'
   AND occupied.weekday = candidate.weekday
   AND occupied.starts_at < candidate.ends_at
   AND candidate.starts_at < occupied.ends_at
  JOIN public.class_subjects AS occupied_assignment
    ON occupied_assignment.school_id = occupied.school_id
   AND occupied_assignment.id = occupied.class_subject_id
   AND occupied_assignment.status = 'active'
  JOIN public.academic_schedules AS published
    ON published.id = occupied.schedule_id
   AND published.school_id = occupied.school_id
   AND published.status = 'published'
   AND published.deleted_at IS NULL
   AND published.academic_year_id = NEW.academic_year_id
   AND published.id <> NEW.id
   AND published.valid_from <= NEW.valid_to
   AND published.valid_to >= NEW.valid_from
  WHERE candidate.school_id = NEW.school_id
    AND candidate.schedule_id = NEW.id
    AND candidate.status = 'active'
    AND (
      candidate_assignment.class_group_id = occupied_assignment.class_group_id
      OR (candidate_assignment.teacher_id IS NOT NULL
          AND candidate_assignment.teacher_id = occupied_assignment.teacher_id)
      OR (candidate.room_id IS NOT NULL
          AND candidate.room_id = occupied.room_id)
    )
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'A publicação provoca sobreposição com outro horário publicado'
      USING ERRCODE = '23514',
            DETAIL = 'Reveja turma, docente, sala e período de validade.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.prevent_timetable_publication_conflicts()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS prevent_timetable_publication_conflicts
  ON public.academic_schedules;
CREATE TRIGGER prevent_timetable_publication_conflicts
BEFORE INSERT OR UPDATE OF school_id, status, valid_from, valid_to,
  academic_year_id, deleted_at
ON public.academic_schedules
FOR EACH ROW EXECUTE FUNCTION private.prevent_timetable_publication_conflicts();

-- IMPORTANT: published timetable slot edits require an additional cross-version
-- write guard. Do not deploy this migration without that companion guard.
