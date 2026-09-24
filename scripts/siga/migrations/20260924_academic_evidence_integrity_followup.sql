-- SIGA Plus: follow-up to applied academic_evidence_persistence_20260924.
-- Existing tables are empty at deployment; tighten academic evidence before integration.
BEGIN;
CREATE OR REPLACE FUNCTION academic_evidence.guard_academic_review_integrity()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE snapshot_state text;
BEGIN
  IF TG_TABLE_NAME = 'lesson_plans' THEN
    IF NEW.state = 'approved' AND (
      jsonb_array_length(NEW.objectives) = 0
      OR jsonb_array_length(NEW.methods) = 0
      OR jsonb_array_length(NEW.criteria) = 0
      OR NEW.approved_by = NEW.authored_by
    ) THEN
      RAISE EXCEPTION 'Approved lesson plan needs objectives, methods, criteria and independent reviewer'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'lesson_delivery' THEN
    IF NEW.state = 'delivered' AND (
      NEW.delivered_minutes = 0
      OR jsonb_array_length(NEW.actual_curriculum_units) = 0
      OR jsonb_array_length(NEW.evidence_ids) = 0
      OR NEW.reviewed_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Delivered lesson requires positive minutes, content, evidence and review'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'assessment_sessions' THEN
    IF TG_OP = 'UPDATE' AND OLD.state IN ('approved','published') AND
       NEW IS DISTINCT FROM OLD THEN
      IF NOT (OLD.state = 'approved' AND NEW.state = 'published'
        AND (to_jsonb(NEW) - 'state') = (to_jsonb(OLD) - 'state')) THEN
        RAISE EXCEPTION 'Approved assessment is immutable except publication'
          USING ERRCODE = '23514';
      END IF;
    END IF;
    IF TG_OP = 'UPDATE' AND (
      NEW.id IS DISTINCT FROM OLD.id OR NEW.school_id IS DISTINCT FROM OLD.school_id
      OR NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id
      OR NEW.assessment_key IS DISTINCT FROM OLD.assessment_key
    ) THEN
      RAISE EXCEPTION 'Assessment identity cannot be reassigned'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.state IN ('approved','published') THEN
      SELECT status INTO snapshot_state
      FROM academic_evidence.schedule_snapshots
      WHERE id = NEW.snapshot_id AND school_id = NEW.school_id;
      IF snapshot_state IS DISTINCT FROM 'published' THEN
        RAISE EXCEPTION 'Assessment approval requires published schedule'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_lesson_plan_review_integrity
BEFORE INSERT OR UPDATE ON academic_evidence.lesson_plans
FOR EACH ROW EXECUTE FUNCTION academic_evidence.guard_academic_review_integrity();
CREATE TRIGGER guard_lesson_delivery_review_integrity
BEFORE INSERT OR UPDATE ON academic_evidence.lesson_delivery
FOR EACH ROW EXECUTE FUNCTION academic_evidence.guard_academic_review_integrity();
CREATE TRIGGER guard_assessment_review_integrity
BEFORE INSERT OR UPDATE ON academic_evidence.assessment_sessions
FOR EACH ROW EXECUTE FUNCTION academic_evidence.guard_academic_review_integrity();

-- Closure must not be claimed while appeals and exam-conflict authority
-- are absent from this evidence schema. Integrate the existing institutional
-- workflows and replace this fail-closed guard in a reviewed migration.
CREATE OR REPLACE FUNCTION academic_evidence.guard_period_closure_pending_integration()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Period closure disabled until authoritative appeals, exam conflicts and sign-off are integrated'
    USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER guard_period_closure_pending_integration
BEFORE INSERT OR UPDATE OR DELETE ON academic_evidence.period_closures
FOR EACH ROW EXECUTE FUNCTION academic_evidence.guard_period_closure_pending_integration();
COMMIT;
