-- Run after academic_evidence_persistence and academic_evidence_integrity_followup.
-- Delivery requires a scheduled occurrence on a published snapshot and an approved plan.
BEGIN;
CREATE OR REPLACE FUNCTION academic_evidence.guard_delivered_occurrence()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  occurrence_state text;
  snapshot_state text;
  plan_author uuid;
BEGIN
  IF NEW.state <> 'delivered' THEN
    RETURN NEW;
  END IF;

  SELECT o.state, s.status
    INTO occurrence_state, snapshot_state
    FROM academic_evidence.lesson_occurrences o
    JOIN academic_evidence.schedule_snapshots s
      ON s.id = o.snapshot_id AND s.school_id = o.school_id
    WHERE o.id = NEW.occurrence_id AND o.school_id = NEW.school_id
    -- The snapshot is the lock root for publication and occurrence edits.
    -- Occurrence mutation already takes FOR UPDATE on this same parent.
    FOR SHARE OF s;

  IF occurrence_state IS DISTINCT FROM 'scheduled'
     OR snapshot_state IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'Delivered lesson requires an active occurrence in a published schedule'
      USING ERRCODE = '23514';
  END IF;

  SELECT p.authored_by INTO plan_author
    FROM academic_evidence.lesson_plans p
    WHERE p.id = NEW.plan_id AND p.school_id = NEW.school_id
      AND p.occurrence_id = NEW.occurrence_id AND p.state = 'approved'
    FOR SHARE;
  IF plan_author IS NULL THEN
    RAISE EXCEPTION 'Delivered lesson requires an approved plan for this occurrence'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.reviewed_by = plan_author THEN
    RAISE EXCEPTION 'Plan author cannot review their own delivered lesson'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_delivered_occurrence ON academic_evidence.lesson_delivery;
CREATE TRIGGER guard_delivered_occurrence
BEFORE INSERT OR UPDATE ON academic_evidence.lesson_delivery
FOR EACH ROW EXECUTE FUNCTION academic_evidence.guard_delivered_occurrence();
REVOKE ALL ON FUNCTION academic_evidence.guard_delivered_occurrence() FROM PUBLIC, anon, authenticated;
COMMIT;
