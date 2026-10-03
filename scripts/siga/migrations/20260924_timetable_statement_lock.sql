-- SGA ONLY — STAGED; do not deploy without two-session staging tests.
-- Acquire the same global timetable transaction lock BEFORE row locks.
-- BEFORE ROW advisory locks alone cannot prevent deadlocks: UPDATE obtains a
-- tuple lock before entering its row trigger. Statement triggers run first.
-- This deliberately serializes timetable writes across institutions; optimize
-- to a trusted per-school transaction entrypoint after concurrency validation.
CREATE OR REPLACE FUNCTION private.lock_timetable_write_statement()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $timetable_statement_lock$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sga:timetable:global:statement', 90240924)
  );
  RETURN NULL;
END;
$timetable_statement_lock$;

REVOKE ALL ON FUNCTION private.lock_timetable_write_statement()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS aa_lock_timetable_slot_statement ON public.timetable_slots;
CREATE TRIGGER aa_lock_timetable_slot_statement
BEFORE INSERT OR UPDATE OR DELETE ON public.timetable_slots
FOR EACH STATEMENT EXECUTE FUNCTION private.lock_timetable_write_statement();

DROP TRIGGER IF EXISTS aa_lock_timetable_assignment_statement ON public.class_subjects;
CREATE TRIGGER aa_lock_timetable_assignment_statement
BEFORE INSERT OR UPDATE OR DELETE ON public.class_subjects
FOR EACH STATEMENT EXECUTE FUNCTION private.lock_timetable_write_statement();

DROP TRIGGER IF EXISTS aa_lock_timetable_schedule_statement ON public.academic_schedules;
CREATE TRIGGER aa_lock_timetable_schedule_statement
BEFORE INSERT OR UPDATE OR DELETE ON public.academic_schedules
FOR EACH STATEMENT EXECUTE FUNCTION private.lock_timetable_write_statement();

-- Statement-level trigger ordering is lexical within the same event class.
-- A transaction that already locked unrelated rows can still deadlock with
-- another subsystem; use short transactions and retry SQLSTATE 40P01/40001.
-- Validate bulk multi-school operations and other existing trigger effects.
