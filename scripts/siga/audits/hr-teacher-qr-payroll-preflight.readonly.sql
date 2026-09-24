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
ORDER BY check_name;
