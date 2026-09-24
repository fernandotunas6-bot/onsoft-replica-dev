-- SIGA Plus / STAGED ONLY: run on an isolated staging clone after review.
-- Dedicated append-only evidence schema. Never expose direct client writes.
-- Requires pgcrypto, already common in Postgres installations.
BEGIN;
CREATE SCHEMA IF NOT EXISTS academic_evidence;
REVOKE ALL ON SCHEMA academic_evidence FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA academic_evidence TO service_role;

CREATE TABLE IF NOT EXISTS academic_evidence.schedule_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  period_id uuid NOT NULL,
  schedule_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  curriculum_version text NOT NULL CHECK (length(trim(curriculum_version)) > 0),
  calendar_version text NOT NULL CHECK (length(trim(calendar_version)) > 0),
  time_zone text NOT NULL CHECK (length(trim(time_zone)) > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','superseded')),
  published_at timestamptz,
  published_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, academic_year_id, period_id, schedule_id, version),
  UNIQUE (id, school_id),
  CHECK ((status = 'draft' AND published_at IS NULL AND published_by IS NULL)
    OR (status <> 'draft' AND published_at IS NOT NULL AND published_by IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS academic_evidence.lesson_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL,
  school_id uuid NOT NULL,
  occurrence_key text NOT NULL CHECK (length(trim(occurrence_key)) > 0),
  teacher_id uuid NOT NULL,
  class_group_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  lesson_date date NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'scheduled'
    CHECK (state IN ('scheduled','cancelled','replaced')),
  replacement_of uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (snapshot_id, school_id)
    REFERENCES academic_evidence.schedule_snapshots(id, school_id),
  FOREIGN KEY (replacement_of, school_id)
    REFERENCES academic_evidence.lesson_occurrences(id, school_id),
  UNIQUE (snapshot_id, occurrence_key),
  UNIQUE (id, school_id),
  CHECK (ends_at > starts_at AND ends_at <= starts_at + interval '24 hours')
);
-- Validate lesson_date against the IANA time zone of the parent snapshot
-- in the publication transaction, never against the teacher's device clock.

CREATE TABLE IF NOT EXISTS academic_evidence.lesson_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  occurrence_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  curriculum_unit_id text NOT NULL CHECK (length(trim(curriculum_unit_id)) > 0),
  objectives jsonb NOT NULL CHECK (jsonb_typeof(objectives) = 'array'),
  methods jsonb NOT NULL CHECK (jsonb_typeof(methods) = 'array'),
  criteria jsonb NOT NULL CHECK (jsonb_typeof(criteria) = 'array'),
  state text NOT NULL DEFAULT 'draft'
    CHECK (state IN ('draft','submitted','approved','returned')),
  approved_by uuid,
  approved_at timestamptz,
  authored_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (occurrence_id, school_id)
    REFERENCES academic_evidence.lesson_occurrences(id, school_id),
  UNIQUE (occurrence_id, revision),
  UNIQUE (id, school_id),
  CHECK ((state = 'approved') = (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS academic_evidence.lesson_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  occurrence_id uuid NOT NULL,
  plan_id uuid,
  delivered_minutes integer NOT NULL CHECK (delivered_minutes >= 0 AND delivered_minutes <= 1440),
  actual_curriculum_units jsonb NOT NULL CHECK (jsonb_typeof(actual_curriculum_units) = 'array'),
  evidence_ids jsonb NOT NULL CHECK (jsonb_typeof(evidence_ids) = 'array'),
  state text NOT NULL CHECK (state IN ('delivered','partial','cancelled','pending_review')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (occurrence_id, school_id)
    REFERENCES academic_evidence.lesson_occurrences(id, school_id),
  FOREIGN KEY (plan_id, school_id)
    REFERENCES academic_evidence.lesson_plans(id, school_id),
  UNIQUE (occurrence_id),
  UNIQUE (id, school_id),
  CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL)),
  CHECK (state <> 'delivered' OR (reviewed_by IS NOT NULL AND plan_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS academic_evidence.assessment_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  snapshot_id uuid NOT NULL,
  assessment_key text NOT NULL CHECK (length(trim(assessment_key)) > 0),
  class_group_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  exam_starts_at timestamptz NOT NULL,
  exam_ends_at timestamptz NOT NULL,
  ruleset_version text NOT NULL CHECK (length(trim(ruleset_version)) > 0),
  state text NOT NULL DEFAULT 'draft'
    CHECK (state IN ('draft','approved','published','cancelled')),
  approved_by uuid,
  approved_at timestamptz,
  FOREIGN KEY (snapshot_id, school_id)
    REFERENCES academic_evidence.schedule_snapshots(id, school_id),
  UNIQUE (snapshot_id, assessment_key),
  UNIQUE (id, school_id),
  CHECK (exam_ends_at > exam_starts_at),
  CHECK ((state IN ('approved','published')) = (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS academic_evidence.period_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  snapshot_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  evidence_digest text NOT NULL CHECK (length(evidence_digest) = 64),
  coordinator_id uuid NOT NULL,
  pedagogical_director_id uuid NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (snapshot_id, school_id)
    REFERENCES academic_evidence.schedule_snapshots(id, school_id),
  UNIQUE (snapshot_id, revision),
  CHECK (coordinator_id <> pedagogical_director_id)
);

-- Immutable correction requests: the original reviewed delivery is never overwritten.
-- Approval is a separate append-only decision with an accountable reviewer.
CREATE TABLE IF NOT EXISTS academic_evidence.delivery_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  delivery_id uuid NOT NULL,
  request_key text NOT NULL CHECK (length(trim(request_key)) > 0),
  requested_by uuid NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) >= 12),
  proposed_minutes integer NOT NULL CHECK (proposed_minutes BETWEEN 0 AND 1440),
  proposed_curriculum_units jsonb NOT NULL
    CHECK (jsonb_typeof(proposed_curriculum_units) = 'array'),
  proposed_evidence_ids jsonb NOT NULL
    CHECK (jsonb_typeof(proposed_evidence_ids) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (delivery_id, school_id)
    REFERENCES academic_evidence.lesson_delivery(id, school_id),
  UNIQUE (school_id, request_key),
  UNIQUE (id, school_id)
);

CREATE TABLE IF NOT EXISTS academic_evidence.delivery_correction_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  correction_id uuid NOT NULL,
  decided_by uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved','rejected')),
  decision_reason text NOT NULL CHECK (length(trim(decision_reason)) >= 12),
  decided_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (correction_id, school_id)
    REFERENCES academic_evidence.delivery_corrections(id, school_id),
  UNIQUE (correction_id),
  UNIQUE (id, school_id)
);

CREATE OR REPLACE FUNCTION academic_evidence.guard_correction_decision()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $
DECLARE original_minutes integer;
DECLARE max_minutes integer;
DECLARE requester uuid;
BEGIN
  SELECT d.delivered_minutes, c.requested_by,
         floor(extract(epoch FROM (o.ends_at - o.starts_at)) / 60)::integer
    INTO original_minutes, requester, max_minutes
    FROM academic_evidence.delivery_corrections c
    JOIN academic_evidence.lesson_delivery d
      ON d.id = c.delivery_id AND d.school_id = c.school_id
    JOIN academic_evidence.lesson_occurrences o
      ON o.id = d.occurrence_id AND o.school_id = d.school_id
    WHERE c.id = NEW.correction_id AND c.school_id = NEW.school_id
    FOR UPDATE OF c;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Correction does not belong to this school'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.decided_by = requester THEN
    RAISE EXCEPTION 'Correction requester cannot approve their own request'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.decision = 'approved' AND EXISTS (
    SELECT 1 FROM academic_evidence.delivery_corrections c
    WHERE c.id = NEW.correction_id
      AND c.proposed_minutes > max_minutes
  ) THEN
    RAISE EXCEPTION 'Correction exceeds official lesson duration'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$;
CREATE TRIGGER guard_correction_decision
BEFORE INSERT ON academic_evidence.delivery_correction_decisions
FOR EACH ROW EXECUTE FUNCTION academic_evidence.guard_correction_decision();

CREATE OR REPLACE FUNCTION academic_evidence.guard_append_only_evidence()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $
BEGIN
  RAISE EXCEPTION 'Academic correction history is append-only'
    USING ERRCODE = '23514';
END;
$;
CREATE TRIGGER guard_delivery_corrections_append_only
BEFORE UPDATE OR DELETE ON academic_evidence.delivery_corrections
FOR EACH ROW EXECUTE FUNCTION academic_evidence.guard_append_only_evidence();
CREATE TRIGGER guard_correction_decisions_append_only
BEFORE UPDATE OR DELETE ON academic_evidence.delivery_correction_decisions
FOR EACH ROW EXECUTE FUNCTION academic_evidence.guard_append_only_evidence();

-- Read-only audit projection; never mutates the reviewed original.
-- A downstream payroll/grade workflow must explicitly adopt a correction
-- under its own authorization, never infer it from this view alone.
CREATE OR REPLACE VIEW academic_evidence.approved_delivery_corrections
WITH (security_invoker = true) AS
SELECT c.id AS correction_id, c.school_id, c.delivery_id,
       c.proposed_minutes, c.proposed_curriculum_units, c.proposed_evidence_ids,
       c.reason, c.requested_by, c.created_at,
       d.decided_by, d.decided_at, d.decision_reason
FROM academic_evidence.delivery_corrections c
JOIN academic_evidence.delivery_correction_decisions d
  ON d.correction_id = c.id AND d.school_id = c.school_id
WHERE d.decision = 'approved';

-- Composite tenant FKs reject cross-school plan, delivery and assessment links.
-- Direct writes remain restricted to the trusted backend; its transactions
-- must validate membership, actual published timetable and assessment rules.
CREATE INDEX IF NOT EXISTS idx_academic_occurrences_teacher_date
  ON academic_evidence.lesson_occurrences(school_id, teacher_id, lesson_date);
CREATE INDEX IF NOT EXISTS idx_academic_delivery_review
  ON academic_evidence.lesson_delivery(school_id, state, reviewed_at);
CREATE INDEX IF NOT EXISTS idx_academic_assessments_start
  ON academic_evidence.assessment_sessions(school_id, exam_starts_at);

-- Fail closed before publishing a schedule with missing or malformed
-- occurrence dates, or with a time zone unsupported by PostgreSQL.
CREATE OR REPLACE FUNCTION academic_evidence.guard_snapshot_publication()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'New academic snapshots must begin as drafts'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'published') THEN
    RAISE EXCEPTION 'Draft snapshot must be published before supersession'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'published' AND OLD.status = 'draft' THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = NEW.time_zone
    ) THEN
      RAISE EXCEPTION 'Unrecognized institutional time zone' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM academic_evidence.lesson_occurrences WHERE snapshot_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Cannot publish an empty academic schedule'
        USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM academic_evidence.lesson_occurrences AS o
      WHERE o.snapshot_id = NEW.id
        AND (o.lesson_date <> (o.starts_at AT TIME ZONE NEW.time_zone)::date
          OR (o.ends_at AT TIME ZONE NEW.time_zone)::date <> o.lesson_date)
    ) THEN
      RAISE EXCEPTION 'Lesson occurrence does not match the school-local date'
        USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM academic_evidence.lesson_occurrences a
      JOIN academic_evidence.lesson_occurrences z
        ON z.snapshot_id = a.snapshot_id AND z.id > a.id
       AND z.state = 'scheduled' AND a.state = 'scheduled'
       AND z.starts_at < a.ends_at AND a.starts_at < z.ends_at
       AND (z.teacher_id = a.teacher_id OR z.class_group_id = a.class_group_id)
      WHERE a.snapshot_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Overlapping published lessons for teacher or class'
        USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM academic_evidence.lesson_occurrences replacement
      WHERE replacement.snapshot_id = NEW.id AND replacement.replacement_of IS NOT NULL
        AND replacement.state <> 'scheduled'
    ) THEN
      RAISE EXCEPTION 'Replacement lesson must remain active'
        USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM academic_evidence.lesson_occurrences replacement
      WHERE replacement.snapshot_id = NEW.id AND replacement.replacement_of IS NOT NULL
      GROUP BY replacement.replacement_of
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'A replaced lesson cannot have multiple active substitutes'
        USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM academic_evidence.lesson_occurrences o
      WHERE o.snapshot_id = NEW.id AND o.state = 'replaced'
        AND NOT EXISTS (
          SELECT 1 FROM academic_evidence.lesson_occurrences replacement
          WHERE replacement.snapshot_id = o.snapshot_id
            AND replacement.replacement_of = o.id
            AND replacement.state = 'scheduled'
        )
    ) THEN
      RAISE EXCEPTION 'Replaced lesson has no active replacement'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_snapshot_publication
  ON academic_evidence.schedule_snapshots;
CREATE TRIGGER guard_snapshot_publication
BEFORE INSERT OR UPDATE OF status ON academic_evidence.schedule_snapshots
FOR EACH ROW EXECUTE FUNCTION academic_evidence.guard_snapshot_publication();

-- A delivery record must point to the plan for its own occurrence.
-- Approved plans are revision-frozen; corrections require a new revision.
CREATE OR REPLACE FUNCTION academic_evidence.guard_delivery_plan()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF NEW.plan_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM academic_evidence.lesson_plans p
    WHERE p.id = NEW.plan_id AND p.school_id = NEW.school_id
      AND p.occurrence_id = NEW.occurrence_id AND p.state = 'approved'
  ) THEN
    RAISE EXCEPTION 'Delivery must reference an approved plan for this occurrence'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_delivery_plan
  ON academic_evidence.lesson_delivery;
CREATE TRIGGER guard_delivery_plan
BEFORE INSERT OR UPDATE ON academic_evidence.lesson_delivery
FOR EACH ROW EXECUTE FUNCTION academic_evidence.guard_delivery_plan();

CREATE OR REPLACE FUNCTION academic_evidence.guard_approved_plan()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Lesson plan deletion is forbidden' USING ERRCODE = '23514';
  END IF;
  IF OLD.state = 'approved' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Approved lesson plan is immutable; create a new revision'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_approved_plan
  ON academic_evidence.lesson_plans;
CREATE TRIGGER guard_approved_plan
BEFORE UPDATE OR DELETE ON academic_evidence.lesson_plans
FOR EACH ROW EXECUTE FUNCTION academic_evidence.guard_approved_plan();

-- A plan can be revised in place while unapproved, but never moved
-- between institutions or occurrences; approval metadata is set once.
CREATE OR REPLACE FUNCTION academic_evidence.guard_plan_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.school_id IS DISTINCT FROM OLD.school_id
     OR NEW.occurrence_id IS DISTINCT FROM OLD.occurrence_id
     OR NEW.revision IS DISTINCT FROM OLD.revision
     OR NEW.authored_by IS DISTINCT FROM OLD.authored_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Lesson plan identity cannot be reassigned'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_plan_identity ON academic_evidence.lesson_plans;
CREATE TRIGGER guard_plan_identity
BEFORE UPDATE ON academic_evidence.lesson_plans
FOR EACH ROW EXECUTE FUNCTION academic_evidence.guard_plan_identity();

-- A delivery review cannot claim more minutes than the scheduled occurrence,
-- nor rebind a reviewed record to a different teacher or lesson.
CREATE OR REPLACE FUNCTION academic_evidence.guard_delivery_duration()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE scheduled_minutes integer;
BEGIN
  IF TG_OP = 'UPDATE' AND (
      NEW.id IS DISTINCT FROM OLD.id OR NEW.school_id IS DISTINCT FROM OLD.school_id
      OR NEW.occurrence_id IS DISTINCT FROM OLD.occurrence_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
    RAISE EXCEPTION 'Lesson delivery identity cannot be reassigned'
      USING ERRCODE = '23514';
  END IF;
  SELECT floor(extract(epoch FROM (ends_at - starts_at)) / 60)::integer
    INTO scheduled_minutes
    FROM academic_evidence.lesson_occurrences
    WHERE id = NEW.occurrence_id AND school_id = NEW.school_id;
  IF scheduled_minutes IS NULL OR NEW.delivered_minutes > scheduled_minutes THEN
    RAISE EXCEPTION 'Delivered minutes exceed the scheduled occurrence'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.reviewed_at IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Reviewed delivery is immutable; use an audited correction'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_delivery_duration ON academic_evidence.lesson_delivery;
CREATE TRIGGER guard_delivery_duration
BEFORE INSERT OR UPDATE ON academic_evidence.lesson_delivery
FOR EACH ROW EXECUTE FUNCTION academic_evidence.guard_delivery_duration();

-- Lock published snapshots and their occurrence records against silent edits.
CREATE OR REPLACE FUNCTION academic_evidence.guard_published_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Academic snapshot deletion is forbidden' USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'draft' AND (
      NEW.id IS DISTINCT FROM OLD.id OR NEW.school_id IS DISTINCT FROM OLD.school_id
      OR NEW.schedule_id IS DISTINCT FROM OLD.schedule_id
      OR NEW.academic_year_id IS DISTINCT FROM OLD.academic_year_id
      OR NEW.period_id IS DISTINCT FROM OLD.period_id
      OR NEW.version IS DISTINCT FROM OLD.version) THEN
    RAISE EXCEPTION 'Snapshot identity and institution cannot be reassigned'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'draft' AND NEW.status = 'draft' AND
      (NEW.published_at IS NOT NULL OR NEW.published_by IS NOT NULL) THEN
    RAISE EXCEPTION 'Draft cannot carry publication metadata'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.status <> 'draft' THEN
    IF NEW IS DISTINCT FROM OLD THEN
      -- Only published -> superseded is allowed; immutable identity and audit.
      IF NOT (OLD.status = 'published' AND NEW.status = 'superseded'
        AND (to_jsonb(NEW) - 'status') = (to_jsonb(OLD) - 'status')) THEN
        RAISE EXCEPTION 'Published academic snapshot is immutable'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_published_snapshot
  ON academic_evidence.schedule_snapshots;
CREATE TRIGGER guard_published_snapshot
BEFORE UPDATE OR DELETE ON academic_evidence.schedule_snapshots
FOR EACH ROW EXECUTE FUNCTION academic_evidence.guard_published_snapshot();

CREATE OR REPLACE FUNCTION academic_evidence.guard_occurrence_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE parent_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO parent_status FROM academic_evidence.schedule_snapshots
      WHERE id = OLD.snapshot_id FOR UPDATE;
  ELSE
    SELECT status INTO parent_status FROM academic_evidence.schedule_snapshots
      WHERE id = NEW.snapshot_id FOR UPDATE;
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id
      OR NEW.school_id IS DISTINCT FROM OLD.school_id
      OR NEW.id IS DISTINCT FROM OLD.id) THEN
    RAISE EXCEPTION 'Occurrence identity and institution are immutable'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.replacement_of IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM academic_evidence.lesson_occurrences original
      WHERE original.id = NEW.replacement_of
        AND original.school_id = NEW.school_id
        AND original.snapshot_id = NEW.snapshot_id
        AND original.id <> NEW.id
        AND original.state = 'replaced'
        AND original.replacement_of IS NULL
    ) THEN
      RAISE EXCEPTION 'Replacement must reference another lesson in the same snapshot'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF parent_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Published academic occurrences are immutable'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_occurrence_mutation
  ON academic_evidence.lesson_occurrences;
CREATE TRIGGER guard_occurrence_mutation
BEFORE INSERT OR UPDATE OR DELETE ON academic_evidence.lesson_occurrences
FOR EACH ROW EXECUTE FUNCTION academic_evidence.guard_occurrence_mutation();

-- Harden direct access even if default schema grants change.
ALTER TABLE academic_evidence.schedule_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_evidence.lesson_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_evidence.lesson_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_evidence.lesson_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_evidence.assessment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_evidence.period_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_evidence.delivery_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_evidence.delivery_correction_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA academic_evidence FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA academic_evidence TO service_role;
REVOKE INSERT, UPDATE, DELETE ON academic_evidence.approved_delivery_corrections FROM service_role;
GRANT SELECT ON academic_evidence.approved_delivery_corrections TO service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA academic_evidence FROM PUBLIC, anon, authenticated;
-- No DELETE grant. Backend must never accept school_id from an unverified client.
COMMIT;
