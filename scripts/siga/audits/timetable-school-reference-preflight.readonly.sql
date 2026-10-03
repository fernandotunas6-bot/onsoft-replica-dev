-- SGA: read-only preflight for staged timetable reference guard.
-- Every returned row requires investigation before deployment.
SELECT ts.id AS slot_id, ts.school_id, ts.class_subject_id,
       ts.room_id, ts.shift_id, ts.schedule_id,
       CASE WHEN ts.room_id IS NOT NULL AND
         (r.id IS NULL OR r.school_id IS DISTINCT FROM ts.school_id)
         THEN true ELSE false END AS wrong_room_school,
       CASE WHEN ts.shift_id IS NOT NULL AND
         (sh.id IS NULL OR sh.school_id IS DISTINCT FROM ts.school_id)
         THEN true ELSE false END AS wrong_shift_school,
       CASE WHEN ts.schedule_id IS NOT NULL AND
         (s.id IS NULL OR s.school_id IS DISTINCT FROM ts.school_id
          OR s.class_group_id IS DISTINCT FROM cs.class_group_id)
         THEN true ELSE false END AS wrong_schedule_school_or_class
FROM public.timetable_slots ts
JOIN public.class_subjects cs
  ON cs.id = ts.class_subject_id AND cs.school_id = ts.school_id
LEFT JOIN public.rooms r ON r.id = ts.room_id
LEFT JOIN public.school_shifts sh ON sh.id = ts.shift_id
LEFT JOIN public.academic_schedules s ON s.id = ts.schedule_id
WHERE (ts.room_id IS NOT NULL AND
       (r.id IS NULL OR r.school_id IS DISTINCT FROM ts.school_id))
   OR (ts.shift_id IS NOT NULL AND
       (sh.id IS NULL OR sh.school_id IS DISTINCT FROM ts.school_id))
   OR (ts.schedule_id IS NOT NULL AND
       (s.id IS NULL OR s.school_id IS DISTINCT FROM ts.school_id
        OR s.class_group_id IS DISTINCT FROM cs.class_group_id));
