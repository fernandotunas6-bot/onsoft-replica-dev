-- Read only. Run against Sga before wiring academic_evidence to public school tables.
-- No fixture creation and no personally identifying rows are returned.
SELECT 'snapshot_missing_official_schedule' AS check_name, count(*) AS affected
FROM academic_evidence.schedule_snapshots e
LEFT JOIN public.academic_schedules s ON s.id = e.schedule_id
WHERE s.id IS NULL
UNION ALL
SELECT 'snapshot_school_year_version_mismatch', count(*)
FROM academic_evidence.schedule_snapshots e
JOIN public.academic_schedules s ON s.id = e.schedule_id
WHERE (s.school_id,s.academic_year_id,s.version_number)
  IS DISTINCT FROM (e.school_id,e.academic_year_id,e.version)
UNION ALL
SELECT 'occurrence_teacher_wrong_school', count(*)
FROM academic_evidence.lesson_occurrences o
LEFT JOIN public.teachers t ON t.id = o.teacher_id AND t.school_id = o.school_id
WHERE t.id IS NULL
UNION ALL
SELECT 'occurrence_class_wrong_school_or_year', count(*)
FROM academic_evidence.lesson_occurrences o
JOIN academic_evidence.schedule_snapshots e
  ON e.id = o.snapshot_id AND e.school_id = o.school_id
LEFT JOIN public.class_groups g ON g.id = o.class_group_id
  AND g.school_id = o.school_id AND g.academic_year_id = e.academic_year_id
WHERE g.id IS NULL
UNION ALL
SELECT 'occurrence_subject_missing_from_class', count(*)
FROM academic_evidence.lesson_occurrences o
LEFT JOIN public.class_subjects cs ON cs.school_id = o.school_id
  AND cs.class_group_id = o.class_group_id AND cs.subject_id = o.subject_id
WHERE cs.id IS NULL
UNION ALL
SELECT 'occurrence_wrong_class_for_schedule', count(*)
FROM academic_evidence.lesson_occurrences o
JOIN academic_evidence.schedule_snapshots e
  ON e.id = o.snapshot_id AND e.school_id = o.school_id
JOIN public.academic_schedules s ON s.id = e.schedule_id
WHERE o.class_group_id <> s.class_group_id
ORDER BY check_name;
