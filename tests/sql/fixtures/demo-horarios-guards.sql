-- Fixture do ensaio tests/sql/demo-horarios-seed.mjs: funções e gatilhos que podem recusar
-- as escritas do seed, lidos da produção (pg_get_functiondef / pg_get_triggerdef) a 2026-10-25.

CREATE OR REPLACE FUNCTION private.timetable_room_is_explicit(p_room text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT p_room IS NOT NULL
     AND btrim(p_room) <> ''
     AND lower(btrim(p_room)) NOT IN ('sala', 'a definir', 'sem sala fixa');
$function$
;

CREATE OR REPLACE FUNCTION private.enforce_timetable_slot_no_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_class_group_id uuid;
  v_teacher_id uuid;
  v_conflict_id uuid;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.school_id::text, NEW.weekday::int));

  SELECT cs.class_group_id, cs.teacher_id INTO v_class_group_id, v_teacher_id
  FROM public.class_subjects cs
  WHERE cs.id = NEW.class_subject_id AND cs.school_id = NEW.school_id;

  SELECT ts.id INTO v_conflict_id
  FROM public.timetable_slots ts
  JOIN public.class_subjects cs ON cs.id = ts.class_subject_id
  WHERE ts.school_id = NEW.school_id
    AND ts.weekday = NEW.weekday
    AND ts.status = 'active'
    AND ts.id <> NEW.id
    AND ts.starts_at < NEW.ends_at
    AND ts.ends_at > NEW.starts_at
    AND (
      cs.class_group_id = v_class_group_id
      OR (v_teacher_id IS NOT NULL AND cs.teacher_id = v_teacher_id)
      OR (NEW.room_id IS NOT NULL AND ts.room_id = NEW.room_id)
      OR (
        -- Unica alteracao: uma etiqueta de marcador deixa de contar como sala.
        private.timetable_room_is_explicit(NEW.room)
        AND lower(btrim(ts.room)) = lower(btrim(NEW.room))
      )
    )
  LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'Conflito de horário: já existe uma aula desta turma, professor ou sala sobreposta neste dia e horário.'
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_timetable_slot_conflicts()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_class uuid; v_teacher uuid; v_conflict text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN RETURN NEW; END IF;
  IF NEW.starts_at >= NEW.ends_at THEN
    RAISE EXCEPTION 'A hora de fim tem de ser depois da hora de início.' USING ERRCODE = '23514';
  END IF;
  SELECT class_group_id, teacher_id INTO v_class, v_teacher FROM class_subjects WHERE id = NEW.class_subject_id;

  SELECT 'A turma já tem aula neste horário.' INTO v_conflict
  FROM timetable_slots t JOIN class_subjects c ON c.id = t.class_subject_id
  WHERE t.id <> NEW.id AND t.status = 'active' AND t.weekday = NEW.weekday
    AND t.starts_at < NEW.ends_at AND NEW.starts_at < t.ends_at AND c.class_group_id = v_class LIMIT 1;

  IF v_conflict IS NULL AND v_teacher IS NOT NULL THEN
    SELECT 'O professor já tem aula noutra turma neste horário.' INTO v_conflict
    FROM timetable_slots t JOIN class_subjects c ON c.id = t.class_subject_id
    WHERE t.id <> NEW.id AND t.status = 'active' AND t.weekday = NEW.weekday
      AND t.starts_at < NEW.ends_at AND NEW.starts_at < t.ends_at AND c.teacher_id = v_teacher LIMIT 1;
  END IF;

  -- Mesma regra de private.enforce_timetable_slot_no_overlap: rótulos genéricos
  -- ("Sala", "A definir", "Sem sala fixa") não identificam uma sala.
  IF v_conflict IS NULL AND private.timetable_room_is_explicit(NEW.room) THEN
    SELECT 'A sala já está ocupada neste horário.' INTO v_conflict
    FROM timetable_slots t
    WHERE t.id <> NEW.id AND t.status = 'active' AND t.school_id = NEW.school_id AND t.weekday = NEW.weekday
      AND t.starts_at < NEW.ends_at AND NEW.starts_at < t.ends_at
      AND lower(btrim(t.room)) = lower(btrim(NEW.room)) LIMIT 1;
  END IF;

  IF v_conflict IS NOT NULL THEN RAISE EXCEPTION '%', v_conflict USING ERRCODE = '23P01'; END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION private.validate_timetable_school_references()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION private.guard_siga_calendar_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.academic_years y WHERE y.id = NEW.academic_year_id AND y.school_id = NEW.school_id
      AND NEW.starts_on >= y.starts_on AND NEW.ends_on <= y.ends_on
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Evento fora das datas do ano lectivo.';
  END IF;
  IF NEW.class_group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.class_groups g WHERE g.id = NEW.class_group_id AND g.school_id = NEW.school_id
      AND g.academic_year_id = NEW.academic_year_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A turma não pertence ao ano lectivo do evento.';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.school_id <> OLD.school_id OR NEW.version <> OLD.version + 1) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Escola ou versão inválida para o evento.';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE TRIGGER guard_siga_calendar_event BEFORE INSERT OR UPDATE ON public.siga_calendar_events FOR EACH ROW EXECUTE FUNCTION private.guard_siga_calendar_event();
CREATE TRIGGER timetable_slot_no_overlap BEFORE INSERT OR UPDATE OF class_subject_id, weekday, starts_at, ends_at, room, room_id, status ON public.timetable_slots FOR EACH ROW EXECUTE FUNCTION private.enforce_timetable_slot_no_overlap();
CREATE TRIGGER trg_guard_timetable_slot_conflicts BEFORE INSERT OR UPDATE OF weekday, starts_at, ends_at, room, status, class_subject_id ON public.timetable_slots FOR EACH ROW EXECUTE FUNCTION guard_timetable_slot_conflicts();
CREATE TRIGGER validate_timetable_school_references BEFORE INSERT OR UPDATE OF school_id, class_subject_id, room_id, shift_id, schedule_id ON public.timetable_slots FOR EACH ROW EXECUTE FUNCTION private.validate_timetable_school_references();
