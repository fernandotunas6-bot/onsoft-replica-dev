-- STAGING ONLY. Apply after the two academic_evidence migrations.
-- The API must authenticate the caller and verify institutional membership.
-- Every challenge is registered before its signed token is shown.
BEGIN;
CREATE TABLE IF NOT EXISTS academic_evidence.lesson_qr_challenges (
  nonce_hash text PRIMARY KEY
    CHECK (nonce_hash ~ '^[A-Za-z0-9_-]{43}$'),
  school_id uuid NOT NULL,
  snapshot_id uuid NOT NULL,
  occurrence_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('check_in','check_out')),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (snapshot_id,school_id)
    REFERENCES academic_evidence.schedule_snapshots(id,school_id),
  FOREIGN KEY (occurrence_id,school_id)
    REFERENCES academic_evidence.lesson_occurrences(id,school_id),
  CHECK (expires_at > issued_at AND expires_at <= issued_at + interval '2 minutes')
);
CREATE INDEX IF NOT EXISTS idx_lesson_qr_challenges_expiry
  ON academic_evidence.lesson_qr_challenges(expires_at)
  WHERE consumed_at IS NULL;

CREATE OR REPLACE FUNCTION academic_evidence.guard_lesson_qr_challenge()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  official_snapshot uuid;
  official_teacher uuid;
  occurrence_state text;
  snapshot_state text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'QR history cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.consumed_at IS NOT NULL OR NEW.consumed_at IS NULL OR
       (to_jsonb(NEW) - 'consumed_at') <> (to_jsonb(OLD) - 'consumed_at') OR
       clock_timestamp() >= OLD.expires_at THEN
      RAISE EXCEPTION 'QR challenge is spent, expired or immutable'
        USING ERRCODE = '23514';
    END IF;
    NEW.consumed_at := clock_timestamp();
    RETURN NEW;
  END IF;
  SELECT o.snapshot_id,o.teacher_id,o.state,s.status
    INTO official_snapshot,official_teacher,occurrence_state,snapshot_state
  FROM academic_evidence.lesson_occurrences o
  JOIN academic_evidence.schedule_snapshots s
    ON s.id=o.snapshot_id AND s.school_id=o.school_id
  WHERE o.id=NEW.occurrence_id AND o.school_id=NEW.school_id
  FOR SHARE OF s;
  IF official_snapshot IS DISTINCT FROM NEW.snapshot_id OR
     official_teacher IS DISTINCT FROM NEW.teacher_id OR
     occurrence_state IS DISTINCT FROM 'scheduled' OR
     snapshot_state IS DISTINCT FROM 'published' OR
     NEW.issued_at > clock_timestamp() + interval '5 seconds' OR
     NEW.expires_at <= clock_timestamp() OR
     NEW.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'QR requires the assigned teacher and a published active lesson'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_lesson_qr_challenge
BEFORE INSERT OR UPDATE OR DELETE ON academic_evidence.lesson_qr_challenges
FOR EACH ROW EXECUTE FUNCTION academic_evidence.guard_lesson_qr_challenge();

-- One confirmed event per operation and occurrence; both scans remain
-- distinct, immutable records. This table is not direct client API surface.
CREATE TABLE IF NOT EXISTS academic_evidence.lesson_qr_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce_hash text NOT NULL UNIQUE
    REFERENCES academic_evidence.lesson_qr_challenges(nonce_hash),
  school_id uuid NOT NULL,
  snapshot_id uuid NOT NULL,
  occurrence_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('check_in','check_out')),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (school_id,occurrence_id,teacher_id,operation),
  FOREIGN KEY (occurrence_id,school_id)
    REFERENCES academic_evidence.lesson_occurrences(id,school_id)
);
CREATE OR REPLACE FUNCTION academic_evidence.guard_lesson_qr_event()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $
DECLARE
  registered academic_evidence.lesson_qr_challenges%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Confirmed QR events are immutable' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO registered FROM academic_evidence.lesson_qr_challenges
  WHERE nonce_hash=NEW.nonce_hash FOR SHARE;
  IF NOT FOUND OR registered.consumed_at IS NULL OR
     (registered.school_id,registered.snapshot_id,registered.occurrence_id,
      registered.teacher_id,registered.operation)
       IS DISTINCT FROM
     (NEW.school_id,NEW.snapshot_id,NEW.occurrence_id,
      NEW.teacher_id,NEW.operation) THEN
    RAISE EXCEPTION 'QR event must match its consumed challenge'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.operation='check_out' AND NOT EXISTS (
    SELECT 1 FROM academic_evidence.lesson_qr_events previous
    WHERE previous.school_id=NEW.school_id
      AND previous.occurrence_id=NEW.occurrence_id
      AND previous.teacher_id=NEW.teacher_id
      AND previous.operation='check_in'
      AND previous.occurred_at<=NEW.occurred_at
  ) THEN
    RAISE EXCEPTION 'QR checkout requires a previous confirmed check-in'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$;
CREATE TRIGGER guard_lesson_qr_event
BEFORE INSERT OR UPDATE OR DELETE ON academic_evidence.lesson_qr_events
FOR EACH ROW EXECUTE FUNCTION academic_evidence.guard_lesson_qr_event();

ALTER TABLE academic_evidence.lesson_qr_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON academic_evidence.lesson_qr_challenges FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON academic_evidence.lesson_qr_challenges TO service_role;
ALTER TABLE academic_evidence.lesson_qr_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON academic_evidence.lesson_qr_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON academic_evidence.lesson_qr_events TO service_role;
REVOKE ALL ON FUNCTION academic_evidence.guard_lesson_qr_challenge()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION academic_evidence.guard_lesson_qr_event()
  FROM PUBLIC, anon, authenticated;
-- Consume with one conditional UPDATE; no SELECT-then-UPDATE race:
-- UPDATE academic_evidence.lesson_qr_challenges
-- SET consumed_at=clock_timestamp()
-- WHERE nonce_hash=:hash AND school_id=:school AND snapshot_id=:snapshot
--   AND occurrence_id=:lesson AND teacher_id=:teacher AND operation=:operation
--   AND issued_at=:issued_at AND expires_at=:expires_at
--   AND consumed_at IS NULL AND expires_at>clock_timestamp()
-- RETURNING nonce_hash;
COMMIT;
