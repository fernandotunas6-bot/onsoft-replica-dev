-- SGA: preflight for staged concurrency trigger; READ ONLY.
-- Only collisions within the same schedule version are blockers for this trigger.
-- Cross-version collisions must be assessed at publication time.
WITH active_slots AS (
  SELECT ts.id, ts.school_id, ts.schedule_id, ts.weekday,
         ts.starts_at, ts.ends_at, ts.room_id,
         cs.class_group_id, cs.teacher_id
  FROM public.timetable_slots ts
  JOIN public.class_subjects cs
    ON cs.school_id = ts.school_id AND cs.id = ts.class_subject_id
  WHERE ts.status = 'active' AND cs.status = 'active'
)
SELECT a.school_id, a.schedule_id, a.id AS first_slot_id,
       b.id AS second_slot_id,
       (a.class_group_id = b.class_group_id) AS class_conflict,
       (a.teacher_id IS NOT NULL AND a.teacher_id = b.teacher_id) AS teacher_conflict,
       (a.room_id IS NOT NULL AND a.room_id = b.room_id) AS room_conflict
FROM active_slots a
JOIN active_slots b
  ON a.school_id = b.school_id
 AND a.id < b.id
 AND a.schedule_id IS NOT DISTINCT FROM b.schedule_id
 AND a.weekday = b.weekday
 AND a.starts_at < b.ends_at
 AND b.starts_at < a.ends_at
WHERE a.class_group_id = b.class_group_id
   OR (a.teacher_id IS NOT NULL AND a.teacher_id = b.teacher_id)
   OR (a.room_id IS NOT NULL AND a.room_id = b.room_id)
ORDER BY a.school_id, a.schedule_id, a.id, b.id;
