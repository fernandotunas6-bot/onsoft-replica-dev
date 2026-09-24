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
  FOREIGN KEY (replacement_of) REFERENCES academic_evidence.lesson_occurrences(id),
  UNIQUE (snapshot_id, occurrence_key),
  UNIQUE (id, school_id),
  CHECK (ends_at > starts_at AND ends_at <= starts_at + interval '24 hours'),
  CHECK (lesson_date = (starts_at AT TIME ZONE 'Africa/Luanda')::date)
);
-- NOTE: the Africa/Luanda check above is suitable ONLY for Angolan schools.
-- Replace it with a trigger using the parent snapshot.time_zone if global
-- multi-country operation is enabled. Verify IANA zone on snapshot creation.

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

-- Composite tenant FKs reject cross-school plan, delivery and assessment links.
-- Direct writes remain restricted to the trusted backend; its transactions
-- must validate membership, actual published timetable and assessment rules.
CREATE INDEX IF NOT EXISTS idx_academic_occurrences_teacher_date
  ON academic_evidence.lesson_occurrences(school_id, teacher_id, lesson_date);
CREATE INDEX IF NOT EXISTS idx_academic_delivery_review
  ON academic_evidence.lesson_delivery(school_id, state, reviewed_at);
CREATE INDEX IF NOT EXISTS idx_academic_assessments_start
  ON academic_evidence.assessment_sessions(school_id, exam_starts_at);

-- Lock published snapshots and their occurrence records against silent edits.
CREATE OR REPLACE FUNCTION academic_evidence.guard_published_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Academic snapshot deletion is forbidden' USING ERRCODE = '23514';
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
  SELECT status INTO parent_status FROM academic_evidence.schedule_snapshots
    WHERE id = COALESCE(NEW.snapshot_id, OLD.snapshot_id) FOR UPDATE;
  IF parent_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Published academic occurrences are immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN COALESCE(NEW, OLD);
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
REVOKE ALL ON ALL TABLES IN SCHEMA academic_evidence FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA academic_evidence TO service_role;
-- No DELETE grant. Backend must never accept school_id from an unverified client.
COMMIT;
