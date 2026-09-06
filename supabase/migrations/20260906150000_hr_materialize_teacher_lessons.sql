-- SIGA / Onsoft — materialização automática de ocorrências docentes
-- Gera ocorrências concretas a partir de timetable_slots apenas em dias lectivos
-- válidos do calendário académico, excluindo feriados cadastrados em calendar_events.

CREATE OR REPLACE FUNCTION public.hr_materialize_teacher_lessons(
  p_from date,
  p_to date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school_id uuid := (SELECT public.current_school_id());
  v_role text := (SELECT public.current_profile_role());
  v_inserted integer := 0;
BEGIN
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'School context required'; END IF;
  IF v_role NOT IN ('Administrador', 'Tesouraria') THEN
    RAISE EXCEPTION 'Insufficient HR permission';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'Invalid materialization range';
  END IF;
  IF (p_to - p_from) > 31 THEN
    RAISE EXCEPTION 'Materialization range cannot exceed 31 days';
  END IF;

  INSERT INTO public.hr_teacher_lesson_occurrences (
    school_id,
    timetable_slot_id,
    class_subject_id,
    teacher_id,
    employment_id,
    contract_id,
    lesson_date,
    scheduled_starts_at,
    scheduled_ends_at,
    quantity,
    status,
    created_by
  )
  SELECT
    v_school_id,
    ts.id,
    cs.id,
    cs.teacher_id,
    link.employment_id,
    contract.id,
    d::date,
    ts.starts_at,
    ts.ends_at,
    1,
    'scheduled',
    (SELECT auth.uid())
  FROM generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') AS g(d)
  JOIN public.timetable_slots ts
    ON ts.school_id = v_school_id
   AND ts.status = 'active'
   AND ts.weekday = EXTRACT(ISODOW FROM d)::integer
  JOIN public.class_subjects cs
    ON cs.id = ts.class_subject_id
   AND cs.school_id = v_school_id
   AND cs.status = 'active'
   AND cs.teacher_id IS NOT NULL
  JOIN public.class_groups cg
    ON cg.id = cs.class_group_id
   AND cg.school_id = v_school_id
   AND cg.status = 'active'
  JOIN public.terms term
    ON term.school_id = v_school_id
   AND term.academic_year_id = cg.academic_year_id
   AND d::date BETWEEN term.starts_on AND term.ends_on
  JOIN public.hr_teacher_employment_links link
    ON link.school_id = v_school_id
   AND link.teacher_id = cs.teacher_id
   AND link.status = 'active'
   AND link.deleted_at IS NULL
   AND link.starts_on <= d::date
   AND (link.ends_on IS NULL OR link.ends_on >= d::date)
  JOIN LATERAL (
    SELECT hc.id
    FROM public.hr_contracts hc
    WHERE hc.school_id = v_school_id
      AND hc.employment_id = link.employment_id
      AND hc.salary_type = 'lesson_hour'
      AND hc.status = 'active'
      AND hc.deleted_at IS NULL
      AND hc.starts_on <= d::date
      AND (hc.ends_on IS NULL OR hc.ends_on >= d::date)
    ORDER BY hc.starts_on DESC, hc.created_at DESC
    LIMIT 1
  ) contract ON true
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.calendar_events ce
    WHERE ce.school_id = v_school_id
      AND ce.deleted_at IS NULL
      AND ce.category = 'holiday'
      AND d::date BETWEEN ce.event_date AND COALESCE(ce.ends_on, ce.event_date)
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_materialize_teacher_lessons(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_materialize_teacher_lessons(date, date) TO authenticated;

COMMENT ON FUNCTION public.hr_materialize_teacher_lessons(date, date) IS
  'Materializa ocorrências docentes por horário, trimestre, feriados, vínculo RH e contrato hora/aula; idempotente por slot/data.';

NOTIFY pgrst, 'reload schema';
