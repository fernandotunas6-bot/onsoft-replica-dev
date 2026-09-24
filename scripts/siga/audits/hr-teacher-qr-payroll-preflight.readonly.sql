-- Read only preflight for the active HR attendance workflow.
SELECT 'multiple_active_qr_for_lesson_operation' AS check_name, count(*) AS affected
FROM (
  SELECT school_id,occurrence_id,purpose
  FROM public.hr_teacher_qr_sessions
  WHERE status='active' AND expires_at>clock_timestamp()
  GROUP BY school_id,occurrence_id,purpose HAVING count(*)>1
) duplicate_groups
UNION ALL
SELECT 'teacher_login_bound_more_than_once', count(*)
FROM (
  SELECT school_id,user_id FROM public.teachers
  WHERE user_id IS NOT NULL AND status='active'
  GROUP BY school_id,user_id HAVING count(*)>1
) duplicate_users
UNION ALL
SELECT 'teacher_self_validated_compensation', count(*)
FROM public.hr_compensation_events
WHERE source_type='teacher_lesson_occurrence' AND deleted_at IS NULL
  AND validation_status='validated' AND validated_by=created_by
UNION ALL
SELECT 'scheduled_lesson_without_published_timetable', count(*)
FROM public.hr_teacher_lesson_occurrences o
WHERE o.deleted_at IS NULL AND o.occurrence_kind='scheduled'
  AND NOT EXISTS (
    SELECT 1 FROM public.timetable_slots ts
    JOIN public.academic_schedules s
      ON s.id=ts.schedule_id AND s.school_id=ts.school_id
    WHERE ts.id=o.timetable_slot_id AND ts.school_id=o.school_id
      AND ts.class_subject_id=o.class_subject_id AND ts.status='active'
      AND s.status='published' AND s.valid_from IS NOT NULL
      AND s.valid_to IS NOT NULL
      AND o.lesson_date BETWEEN s.valid_from AND s.valid_to
      AND ts.starts_at=o.scheduled_starts_at
      AND ts.ends_at=o.scheduled_ends_at
  )
ORDER BY check_name;
