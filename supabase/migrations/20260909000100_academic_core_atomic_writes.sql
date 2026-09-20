-- Corrige três problemas de integridade em `advanced-academic-server.ts`
-- (Ciclos 62-63): duas operações "apagar tudo e reinserir" feitas como dois
-- pedidos HTTP separados (não atómicas — uma falha a meio da segunda apagava
-- dados sem repor nada) e uma corrida (race condition) entre a verificação de
-- conflitos de horário e a inserção do slot (dois pedidos concorrentes podiam
-- ambos passar a validação "bloqueante" e ambos inserir, duplicando a reserva
-- de professor/sala/turma). As três operações passam a ser uma única chamada
-- RPC — o PostgREST executa cada RPC dentro de uma única transacção, por isso
-- o "apagar + inserir" fica atómico, e a verificação + inserção do horário fica
-- protegida por um advisory lock que serializa pedidos concorrentes para a
-- mesma escola/dia da semana.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Substituição atómica da matriz curricular (curriculum_subjects)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.replace_curriculum_subjects(
  p_school_id uuid,
  p_curriculum_id uuid,
  p_rows jsonb,
  p_actor uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.curriculum_subjects
  WHERE curriculum_id = p_curriculum_id AND school_id = p_school_id;

  INSERT INTO public.curriculum_subjects (
    school_id, curriculum_id, subject_id, subject_type_id,
    weekly_periods, period_duration_minutes, is_mandatory, display_order,
    created_by, updated_by
  )
  SELECT
    p_school_id,
    p_curriculum_id,
    (item ->> 'subjectId')::uuid,
    NULLIF(item ->> 'subjectTypeId', '')::uuid,
    COALESCE((item ->> 'weeklyPeriods')::smallint, 4),
    COALESCE((item ->> 'periodDurationMinutes')::smallint, 45),
    COALESCE((item ->> 'isMandatory')::boolean, true),
    COALESCE((item ->> 'displayOrder')::integer, 0),
    p_actor,
    p_actor
  FROM jsonb_array_elements(p_rows) AS item;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_curriculum_subjects(uuid, uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_curriculum_subjects(uuid, uuid, jsonb, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Substituição atómica da disponibilidade docente (teacher_availability)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.replace_teacher_availability(
  p_school_id uuid,
  p_teacher_id uuid,
  p_academic_year_id uuid,
  p_max_weekly_hours smallint,
  p_rows jsonb,
  p_actor uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.teacher_availability
  WHERE school_id = p_school_id
    AND teacher_id = p_teacher_id
    AND (p_academic_year_id IS NULL OR academic_year_id = p_academic_year_id);

  INSERT INTO public.teacher_availability (
    school_id, teacher_id, academic_year_id, weekday, starts_at, ends_at,
    is_available, max_weekly_hours, notes, created_by, updated_by
  )
  SELECT
    p_school_id,
    p_teacher_id,
    p_academic_year_id,
    (item ->> 'weekday')::smallint,
    (item ->> 'startsAt')::time,
    (item ->> 'endsAt')::time,
    COALESCE((item ->> 'isAvailable')::boolean, true),
    p_max_weekly_hours,
    NULLIF(item ->> 'notes', ''),
    p_actor,
    p_actor
  FROM jsonb_array_elements(p_rows) AS item;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_teacher_availability(uuid, uuid, uuid, smallint, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_teacher_availability(uuid, uuid, uuid, smallint, jsonb, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Criação de slot de horário protegida contra corrida de conflitos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_timetable_slot_guarded(
  p_school_id uuid,
  p_class_group_id uuid,
  p_subject_id uuid,
  p_teacher_id uuid,
  p_room_id uuid,
  p_weekday smallint,
  p_starts_at time,
  p_ends_at time,
  p_room_label text,
  p_shift_id uuid,
  p_schedule_id uuid,
  p_day_period_number integer,
  p_notes text,
  p_actor uuid
)
RETURNS public.timetable_slots
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_class_subject_id uuid;
  v_existing_teacher_id uuid;
  v_conflict_id uuid;
  v_result public.timetable_slots;
BEGIN
  -- Serializa pedidos concorrentes para a mesma escola + dia da semana: enquanto
  -- esta transacção não terminar (commit ou rollback), nenhuma outra chamada com
  -- a mesma chave consegue passar da verificação de conflitos abaixo, fechando a
  -- janela de corrida entre "verificar" e "inserir".
  PERFORM pg_advisory_xact_lock(hashtextextended(p_school_id::text, p_weekday::int));

  SELECT id, teacher_id INTO v_class_subject_id, v_existing_teacher_id
  FROM public.class_subjects
  WHERE school_id = p_school_id
    AND class_group_id = p_class_group_id
    AND subject_id = p_subject_id;

  IF v_class_subject_id IS NULL THEN
    INSERT INTO public.class_subjects (
      school_id, class_group_id, subject_id, teacher_id, weekly_periods, status,
      created_by, updated_by
    )
    VALUES (p_school_id, p_class_group_id, p_subject_id, p_teacher_id, 1, 'active', p_actor, p_actor)
    RETURNING id INTO v_class_subject_id;
  ELSIF p_teacher_id IS NOT NULL AND p_teacher_id IS DISTINCT FROM v_existing_teacher_id THEN
    UPDATE public.class_subjects
    SET teacher_id = p_teacher_id, updated_by = p_actor
    WHERE id = v_class_subject_id;
  END IF;

  SELECT ts.id INTO v_conflict_id
  FROM public.timetable_slots ts
  JOIN public.class_subjects cs ON cs.id = ts.class_subject_id
  WHERE ts.school_id = p_school_id
    AND ts.weekday = p_weekday
    AND ts.status = 'active'
    AND ts.starts_at < p_ends_at
    AND ts.ends_at > p_starts_at
    AND (
      cs.class_group_id = p_class_group_id
      OR (p_teacher_id IS NOT NULL AND cs.teacher_id = p_teacher_id)
      OR (p_room_id IS NOT NULL AND ts.room_id = p_room_id)
      OR (
        p_room_label IS NOT NULL
        AND btrim(p_room_label) <> ''
        AND lower(btrim(ts.room)) = lower(btrim(p_room_label))
      )
    )
  LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'Conflito de horário: já existe uma aula desta turma, professor ou sala sobreposta neste dia e horário.'
      USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.timetable_slots (
    school_id, class_subject_id, weekday, starts_at, ends_at, room, room_id,
    shift_id, schedule_id, day_period_number, notes, status, created_by
  )
  VALUES (
    p_school_id, v_class_subject_id, p_weekday, p_starts_at, p_ends_at, p_room_label, p_room_id,
    p_shift_id, p_schedule_id, p_day_period_number, p_notes, 'active', p_actor
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_timetable_slot_guarded(
  uuid, uuid, uuid, uuid, uuid, smallint, time, time, text, uuid, uuid, integer, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_timetable_slot_guarded(
  uuid, uuid, uuid, uuid, uuid, smallint, time, time, text, uuid, uuid, integer, text, uuid
) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
