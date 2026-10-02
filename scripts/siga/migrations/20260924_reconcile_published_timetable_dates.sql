-- SGA targeted correction for the two existing published timetable versions.
-- Preconditions prevent silently changing a different school, class or version.
DO $$
DECLARE
  school uuid := '08676df5-771a-45bc-af3b-fcbf727e9d5e';
  year uuid := 'b2b0457d-b9c7-43f3-b4bd-b51b6e960b80';
  class_id uuid := '6e2d4b40-ce18-42c2-be18-07905a54a632';
  v1 uuid := '401dac29-f5d4-44ea-a349-7cc206406e9e';
  v2 uuid := 'f9f30d51-59e0-4dae-bc4f-6efe83aabfff';
BEGIN
  IF (SELECT count(*) FROM public.academic_schedules
      WHERE id IN (v1,v2) AND school_id=school AND academic_year_id=year
        AND class_group_id=class_id AND status='published' AND valid_to IS NULL) <> 2
     OR EXISTS (SELECT 1 FROM public.timetable_slots
                WHERE schedule_id=v1 AND status='active')
     OR (SELECT ends_on FROM public.academic_years WHERE id=year) <> DATE '2027-07-31'
  THEN
    RAISE EXCEPTION 'Timetable dates preconditions changed; manual review required';
  END IF;
  -- V1 has no active slots. Keep it as an historical version for 8 September.
  UPDATE public.academic_schedules SET valid_to=DATE '2026-09-08'
  WHERE id=v1 AND valid_from=DATE '2026-09-08';
  IF NOT FOUND THEN RAISE EXCEPTION 'Unexpected V1 start date'; END IF;
  -- V2 becomes the effective version from 9 September to academic-year end.
  UPDATE public.academic_schedules SET valid_to=DATE '2027-07-31'
  WHERE id=v2 AND valid_from=DATE '2026-09-09';
  IF NOT FOUND THEN RAISE EXCEPTION 'Unexpected V2 start date'; END IF;
END;
$$;
