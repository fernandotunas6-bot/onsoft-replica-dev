-- Run after 20260924_delivery_published_schedule_guard.sql on an isolated staging clone.
-- All fixtures and successful writes are rolled back.
BEGIN;
DO $$
DECLARE
  school uuid := gen_random_uuid();
  snapshot uuid := gen_random_uuid();
  occurrence uuid := gen_random_uuid();
  cancelled_occurrence uuid := gen_random_uuid();
  author uuid := gen_random_uuid();
  plan_reviewer uuid := gen_random_uuid();
  delivery_reviewer uuid := gen_random_uuid();
  plan uuid := gen_random_uuid();
  cancelled_plan uuid := gen_random_uuid();
  blocked boolean;
BEGIN
  INSERT INTO academic_evidence.schedule_snapshots
    (id,school_id,academic_year_id,period_id,schedule_id,version,
     curriculum_version,calendar_version,time_zone)
  VALUES (snapshot,school,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),
          1,'v2026','v2026','Africa/Luanda');
  INSERT INTO academic_evidence.lesson_occurrences
    (id,snapshot_id,school_id,occurrence_key,teacher_id,class_group_id,
     subject_id,lesson_date,starts_at,ends_at)
  VALUES (occurrence,snapshot,school,'published-delivery-test',author,
          gen_random_uuid(),gen_random_uuid(),'2026-09-24',
          '2026-09-24 08:00+01','2026-09-24 08:45+01');
  INSERT INTO academic_evidence.lesson_plans
    (id,school_id,occurrence_id,revision,curriculum_unit_id,objectives,
     methods,criteria,state,approved_by,approved_at,authored_by)
  VALUES (plan,school,occurrence,1,'fractions','["fractions"]'::jsonb,
          '["exercise"]'::jsonb,'["accuracy"]'::jsonb,
          'approved',plan_reviewer,now(),author);

  INSERT INTO academic_evidence.lesson_occurrences
    (id,snapshot_id,school_id,occurrence_key,teacher_id,class_group_id,
     subject_id,lesson_date,starts_at,ends_at,state)
  VALUES (cancelled_occurrence,snapshot,school,'cancelled-delivery-test',author,
          gen_random_uuid(),gen_random_uuid(),'2026-09-24',
          '2026-09-24 09:00+01','2026-09-24 09:45+01','cancelled');
  INSERT INTO academic_evidence.lesson_plans
    (id,school_id,occurrence_id,revision,curriculum_unit_id,objectives,
     methods,criteria,state,approved_by,approved_at,authored_by)
  VALUES (cancelled_plan,school,cancelled_occurrence,1,'fractions',
          '["fractions"]'::jsonb,'["exercise"]'::jsonb,'["accuracy"]'::jsonb,
          'approved',plan_reviewer,now(),author);

  blocked := false;
  BEGIN
    INSERT INTO academic_evidence.lesson_delivery
      (school_id,occurrence_id,plan_id,delivered_minutes,
       actual_curriculum_units,evidence_ids,state,reviewed_by,reviewed_at)
    VALUES (school,occurrence,plan,45,'["fractions"]'::jsonb,
            '["evidence-1"]'::jsonb,'delivered',delivery_reviewer,now());
  EXCEPTION WHEN check_violation THEN blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'Delivered lesson accepted against draft snapshot';
  END IF;

  UPDATE academic_evidence.schedule_snapshots
    SET status = 'published', published_by = plan_reviewer, published_at = now()
    WHERE id = snapshot;

  blocked := false;
  BEGIN
    INSERT INTO academic_evidence.lesson_delivery
      (school_id,occurrence_id,plan_id,delivered_minutes,
       actual_curriculum_units,evidence_ids,state,reviewed_by,reviewed_at)
    VALUES (school,occurrence,plan,45,'["fractions"]'::jsonb,
            '["evidence-1"]'::jsonb,'delivered',author,now());
  EXCEPTION WHEN check_violation THEN blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'Plan author accepted as delivery reviewer';
  END IF;

  blocked := false;
  BEGIN
    INSERT INTO academic_evidence.lesson_delivery
      (school_id,occurrence_id,plan_id,delivered_minutes,
       actual_curriculum_units,evidence_ids,state,reviewed_by,reviewed_at)
    VALUES (school,cancelled_occurrence,cancelled_plan,45,
            '["fractions"]'::jsonb,'["evidence-2"]'::jsonb,
            'delivered',delivery_reviewer,now());
  EXCEPTION WHEN check_violation THEN blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'Cancelled lesson accepted as delivered';
  END IF;

  INSERT INTO academic_evidence.lesson_delivery
    (school_id,occurrence_id,plan_id,delivered_minutes,
     actual_curriculum_units,evidence_ids,state,reviewed_by,reviewed_at)
  VALUES (school,occurrence,plan,45,'["fractions"]'::jsonb,
          '["evidence-1"]'::jsonb,'delivered',delivery_reviewer,now());
END;
$$;
ROLLBACK;
