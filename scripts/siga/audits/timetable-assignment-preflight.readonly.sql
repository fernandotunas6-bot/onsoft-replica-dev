-- SGA read-only preflight for the staged assignment guard.
-- Existing active timetable slots pointing at inactive assignments would
-- fail on subsequent slot edits; resolve them before deploying the trigger.
SELECT ts.school_id, ts.id AS slot_id, ts.class_subject_id,
       cs.status AS assignment_status
FROM public.timetable_slots AS ts
JOIN public.class_subjects AS cs
  ON cs.school_id = ts.school_id AND cs.id = ts.class_subject_id
WHERE ts.status = 'active' AND cs.status <> 'active'
ORDER BY ts.school_id, ts.id;

-- An assignment's own lessons must not overlap after teacher/class changes.
-- This detects such historic data independently of other assignments.
SELECT a.school_id, a.class_subject_id,
       a.schedule_id, a.id AS first_slot_id, b.id AS second_slot_id
FROM public.timetable_slots AS a
JOIN public.timetable_slots AS b
  ON a.school_id = b.school_id
 AND a.class_subject_id = b.class_subject_id
 AND a.id < b.id
 AND a.schedule_id IS NOT DISTINCT FROM b.schedule_id
 AND a.weekday = b.weekday
 AND a.starts_at < b.ends_at
 AND b.starts_at < a.ends_at
WHERE a.status = 'active' AND b.status = 'active'
ORDER BY a.school_id, a.class_subject_id, a.id;
