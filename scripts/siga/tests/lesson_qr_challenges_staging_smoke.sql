-- On an isolated staging clone, after 20260924_lesson_qr_challenges_staged.sql.
-- A real API must authenticate the caller; this test checks storage invariants only.
BEGIN;
DO $$
DECLARE
  school uuid := gen_random_uuid();
  snapshot uuid := gen_random_uuid();
  occurrence uuid := gen_random_uuid();
  teacher uuid := gen_random_uuid();
  blocked boolean;
  updated_count integer;
  token_hash text := repeat('a',43);
BEGIN
  INSERT INTO academic_evidence.schedule_snapshots
    (id,school_id,academic_year_id,period_id,schedule_id,version,
     curriculum_version,calendar_version,time_zone)
  VALUES (snapshot,school,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),
          1,'v2026','v2026','Africa/Luanda');
  INSERT INTO academic_evidence.lesson_occurrences
    (id,snapshot_id,school_id,occurrence_key,teacher_id,class_group_id,
     subject_id,lesson_date,starts_at,ends_at)
  VALUES (occurrence,snapshot,school,'qr-lesson',teacher,
          gen_random_uuid(),gen_random_uuid(),'2026-09-24',
          '2026-09-24 08:00+01','2026-09-24 08:45+01');
  blocked := false;
  BEGIN
    INSERT INTO academic_evidence.lesson_qr_challenges
      (nonce_hash,school_id,snapshot_id,occurrence_id,teacher_id,operation,issued_at,expires_at)
    VALUES (token_hash,school,snapshot,occurrence,teacher,'check_in',
            clock_timestamp(),clock_timestamp()+interval '1 minute');
  EXCEPTION WHEN check_violation THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Draft lesson accepted for QR'; END IF;

  UPDATE academic_evidence.schedule_snapshots
  SET status='published',published_by=gen_random_uuid(),published_at=now()
  WHERE id=snapshot;
  blocked := false;
  BEGIN
    INSERT INTO academic_evidence.lesson_qr_challenges
      (nonce_hash,school_id,snapshot_id,occurrence_id,teacher_id,operation,issued_at,expires_at)
    VALUES (token_hash,school,snapshot,occurrence,gen_random_uuid(),'check_in',
            clock_timestamp(),clock_timestamp()+interval '1 minute');
  EXCEPTION WHEN check_violation THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Wrong teacher accepted for QR'; END IF;

  INSERT INTO academic_evidence.lesson_qr_challenges
    (nonce_hash,school_id,snapshot_id,occurrence_id,teacher_id,operation,issued_at,expires_at)
  VALUES (token_hash,school,snapshot,occurrence,teacher,'check_in',
          clock_timestamp(),clock_timestamp()+interval '1 minute');
  UPDATE academic_evidence.lesson_qr_challenges SET consumed_at=clock_timestamp()
  WHERE nonce_hash=token_hash AND school_id=school AND snapshot_id=snapshot
    AND occurrence_id=occurrence AND teacher_id=teacher AND operation='check_in'
    AND consumed_at IS NULL AND expires_at>clock_timestamp();
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count <> 1 THEN RAISE EXCEPTION 'First QR consumption failed'; END IF;
  UPDATE academic_evidence.lesson_qr_challenges SET consumed_at=clock_timestamp()
  WHERE nonce_hash=token_hash AND consumed_at IS NULL AND expires_at>clock_timestamp();
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count <> 0 THEN RAISE EXCEPTION 'QR replay accepted'; END IF;
  blocked := false;
  BEGIN
    UPDATE academic_evidence.lesson_qr_challenges SET teacher_id=gen_random_uuid()
    WHERE nonce_hash=token_hash;
  EXCEPTION WHEN check_violation THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'QR identity rewritten'; END IF;
END;
$$;
ROLLBACK;
