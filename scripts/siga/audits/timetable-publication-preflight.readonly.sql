-- SGA read-only preflight before enabling publication validation.
SELECT id, school_id, academic_year_id, class_group_id, status,
       valid_from, valid_to
FROM public.academic_schedules
WHERE status = 'published'
  AND deleted_at IS NULL
  AND (valid_from IS NULL OR valid_to IS NULL OR valid_to < valid_from)
ORDER BY school_id, id;

-- Published schedules of the same school/year with intersecting dates.
-- These are candidates, NOT automatically conflicts: inspect actual slots.
SELECT a.school_id, a.academic_year_id,
       a.id AS first_schedule_id, b.id AS second_schedule_id,
       a.valid_from, a.valid_to, b.valid_from, b.valid_to
FROM public.academic_schedules a
JOIN public.academic_schedules b
  ON a.school_id = b.school_id
 AND a.academic_year_id = b.academic_year_id
 AND a.id < b.id
 AND a.status = 'published' AND b.status = 'published'
 AND a.deleted_at IS NULL AND b.deleted_at IS NULL
 AND a.valid_from <= b.valid_to
 AND b.valid_from <= a.valid_to
ORDER BY a.school_id, a.academic_year_id, a.id;
