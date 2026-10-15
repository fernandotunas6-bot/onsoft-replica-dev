-- SGA ONLY — STAGED; do not deploy without staging tests (see docs/audits/SGA_SECURITY_SCHEDULE_AUDIT_2026-09-24.md).
-- Idempotent. Three hardening fixes found in the 2026-10-10 timetable audit:
--
-- 1. Room rule alignment. guard_timetable_slot_conflicts() compared rooms as raw
--    text, so two overlapping lessons without a fixed room (default label "Sala",
--    also "A definir" / "Sem sala fixa") were rejected as "sala ocupada". The
--    no-overlap trigger and the client already treat these labels as non-explicit.
--    The guard now uses the same rule: private.timetable_room_is_explicit().
--
-- 2. Direct RPC access. create_timetable_slot_guarded / update_timetable_slot_guarded
--    take p_actor from the caller. The app calls them with the service role
--    (loadSgaAdminClient), after requireSgaWriterForWrite. EXECUTE was granted to
--    `authenticated`, so any signed-in user could call them through PostgREST,
--    skipping the app role check and forging created_by / updated_by. Only
--    service_role keeps EXECUTE.
--
-- 3. Trigger function exposure. private.enforce_timetable_slot_no_overlap() is a
--    trigger function; it does not need EXECUTE for anon/authenticated.

-- 1 ---------------------------------------------------------------------------
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
END $function$;

-- 2 ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_timetable_slot_guarded(uuid, uuid, uuid, uuid, uuid, smallint, time, time, text, uuid, uuid, integer, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_timetable_slot_guarded(uuid, uuid, uuid, uuid, uuid, smallint, time, time, text, uuid, uuid, integer, text, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.update_timetable_slot_guarded(uuid, uuid, uuid, uuid, uuid, smallint, time, time, text, uuid, uuid, integer, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_timetable_slot_guarded(uuid, uuid, uuid, uuid, uuid, smallint, time, time, text, uuid, uuid, integer, text, uuid)
  TO service_role;

-- 3 ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION private.enforce_timetable_slot_no_overlap() FROM PUBLIC, anon, authenticated;
