-- Run ONLY on a staging database after applying the staged migration.
-- This transaction intentionally rolls back all inserted fixture data.
BEGIN;
DO $$
DECLARE
  school_a uuid := gen_random_uuid();
  school_b uuid := gen_random_uuid();
  snap uuid := gen_random_uuid();
  occurrence uuid := gen_random_uuid();
  plan uuid := gen_random_uuid();
  teacher uuid := gen_random_uuid();
  reviewer uuid := gen_random_uuid();
  blocked boolean;
BEGIN
  INSERT INTO academic_evidence.schedule_snapshots
    (id, school_id, academic_year_id, period_id, schedule_id, version,
     curriculum_version, calendar_version, time_zone)
  VALUES (snap, school_a, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
    1, 'curriculum-2026', 'calendar-2026', 'Africa/Luanda');

  INSERT INTO academic_evidence.lesson_occurrences
    (id, snapshot_id, school_id, occurrence_key, teacher_id, class_group_id,
     subject_id, lesson_date, starts_at, ends_at)
  VALUES (occurrence, snap, school_a, 'lesson1@2026-09-24', teacher,
    gen_random_uuid(), gen_random_uuid(), '2026-09-24',
    '2026-09-24 08:00:00+01', '2026-09-24 08:45:00+01');

  blocked := false;
  BEGIN
    INSERT INTO academic_evidence.lesson_plans
      (school_id, occurrence_id, revision, curriculum_unit_id, objectives,
       methods, criteria, authored_by)
    VALUES (school_b, occurrence, 1, 'fractions', '["fractions"]'::jsonb,
      '["exercise"]'::jsonb, '["accuracy"]'::jsonb, teacher);
  EXCEPTION WHEN foreign_key_violation THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Cross-school plan accepted'; END IF;

  blocked := false;
  BEGIN
    INSERT INTO academic_evidence.lesson_occurrences
      (snapshot_id, school_id, occurrence_key, teacher_id, class_group_id,
       subject_id, lesson_date, starts_at, ends_at, replacement_of)
    VALUES (snap, school_b, 'foreign-replacement', teacher, gen_random_uuid(),
      gen_random_uuid(), '2026-09-24',
      '2026-09-24 09:00:00+01', '2026-09-24 09:45:00+01', occurrence);
  EXCEPTION WHEN foreign_key_violation THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Cross-school replacement accepted'; END IF;

  blocked := false;
  BEGIN
    UPDATE academic_evidence.lesson_occurrences
      SET school_id = school_b WHERE id = occurrence;
  EXCEPTION WHEN check_violation THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Occurrence school reassignment accepted'; END IF;

  INSERT INTO academic_evidence.lesson_plans
    (id, school_id, occurrence_id, revision, curriculum_unit_id, objectives,
     methods, criteria, authored_by, state, approved_by, approved_at)
  VALUES (plan, school_a, occurrence, 1, 'fractions', '["fractions"]'::jsonb,
    '["exercise"]'::jsonb, '["accuracy"]'::jsonb, teacher,
    'approved', reviewer, now());

  blocked := false;
  BEGIN
    UPDATE academic_evidence.lesson_plans SET curriculum_unit_id = 'tampered'
      WHERE id = plan;
  EXCEPTION WHEN check_violation THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Approved plan mutated'; END IF;

  INSERT INTO academic_evidence.lesson_delivery
    (school_id, occurrence_id, plan_id, delivered_minutes,
     actual_curriculum_units, evidence_ids, state, reviewed_by, reviewed_at)
  VALUES (school_a, occurrence, plan, 45, '["fractions"]'::jsonb,
    '["qr-in","qr-out"]'::jsonb, 'delivered', reviewer, now());

  UPDATE academic_evidence.schedule_snapshots
    SET status = 'published', published_at = now(), published_by = reviewer
    WHERE id = snap;

  blocked := false;
  BEGIN
    UPDATE academic_evidence.lesson_occurrences SET teacher_id = gen_random_uuid()
      WHERE id = occurrence;
  EXCEPTION WHEN check_violation THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Published occurrence mutated'; END IF;

  blocked := false;
  BEGIN
    UPDATE academic_evidence.schedule_snapshots SET curriculum_version = 'tampered'
      WHERE id = snap;
  EXCEPTION WHEN check_violation THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Published snapshot mutated'; END IF;
  RAISE NOTICE 'Academic evidence smoke assertions passed; transaction will roll back.';
END;
$$;
ROLLBACK;
