-- Safe on the active Sga database: all fixture writes are rolled back.
BEGIN;
DO $$
DECLARE
 school uuid := gen_random_uuid();
 snapshot uuid := gen_random_uuid();
 occurrence uuid := gen_random_uuid();
 author uuid := gen_random_uuid();
 reviewer uuid := gen_random_uuid();
 blocked boolean;
BEGIN
 INSERT INTO academic_evidence.schedule_snapshots
  (id, school_id, academic_year_id, period_id, schedule_id, version,
   curriculum_version, calendar_version, time_zone)
 VALUES (snapshot, school, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
  1, 'v2026', 'v2026', 'Africa/Luanda');
 INSERT INTO academic_evidence.lesson_occurrences
  (id,snapshot_id,school_id,occurrence_key,teacher_id,class_group_id,
   subject_id,lesson_date,starts_at,ends_at)
 VALUES (occurrence,snapshot,school,'test-lesson',author,gen_random_uuid(),
  gen_random_uuid(),'2026-09-24','2026-09-24 08:00+01','2026-09-24 08:45+01');
 blocked := false;
 BEGIN
  INSERT INTO academic_evidence.lesson_plans
   (school_id,occurrence_id,revision,curriculum_unit_id,objectives,methods,
    criteria,state,approved_by,approved_at,authored_by)
  VALUES (school,occurrence,1,'fractions','[]'::jsonb,'["exercise"]'::jsonb,
   '["accuracy"]'::jsonb,'approved',reviewer,now(),author);
 EXCEPTION WHEN check_violation THEN blocked := true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Empty approved objectives accepted'; END IF;
 blocked := false;
 BEGIN
  INSERT INTO academic_evidence.lesson_plans
   (school_id,occurrence_id,revision,curriculum_unit_id,objectives,methods,
    criteria,state,approved_by,approved_at,authored_by)
  VALUES (school,occurrence,1,'fractions','["fractions"]'::jsonb,
   '["exercise"]'::jsonb,'["accuracy"]'::jsonb,'approved',author,now(),author);
 EXCEPTION WHEN check_violation THEN blocked := true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Self-approved lesson plan accepted'; END IF;
 blocked := false;
 BEGIN
  INSERT INTO academic_evidence.assessment_sessions
   (school_id,snapshot_id,assessment_key,class_group_id,subject_id,
    exam_starts_at,exam_ends_at,ruleset_version,state,approved_by,approved_at)
  VALUES (school,snapshot,'test-exam',gen_random_uuid(),gen_random_uuid(),
   '2026-09-24 10:00+01','2026-09-24 11:00+01','v2026',
   'approved',reviewer,now());
 EXCEPTION WHEN check_violation THEN blocked := true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Assessment approved before timetable publication'; END IF;
 blocked := false;
 BEGIN
  INSERT INTO academic_evidence.period_closures
   (school_id,snapshot_id,revision,evidence_digest,coordinator_id,pedagogical_director_id)
  VALUES (school,snapshot,1,repeat('a',64),author,reviewer);
 EXCEPTION WHEN check_violation THEN blocked := true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Premature period closure accepted'; END IF;
END;
$$;
ROLLBACK;
