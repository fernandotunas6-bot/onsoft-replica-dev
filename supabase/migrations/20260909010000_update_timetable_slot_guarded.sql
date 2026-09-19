-- Ciclo 67: a UI de "Editar Aula" permite trocar Professor Responsável e Sala
-- de Aula, mas o backend legado (updateScheduleSlot em server-legacy.ts) só
-- actualiza weekday/starts_at/ends_at/room (rótulo de texto) — teacherId e
-- roomId eram silenciosamente ignorados. Um utilizador que editasse a aula
-- para trocar de professor via UI recebia "Slot actualizado" mas nada mudava.
--
-- Esta RPC espelha create_timetable_slot_guarded (20260909000100) para o
-- caso UPDATE: resolve/actualiza o class_subject_id certo (turma+disciplina
-- partilham um único registo class_subjects, que é onde teacher_id vive —
-- por isso trocar o professor num slot actualiza esse registo, afectando
-- todos os slots que partilham a mesma disciplina nessa turma, tal como já
-- acontece no create), verifica conflitos excluindo o próprio slot, e faz
-- tudo dentro do mesmo advisory lock por escola+dia-da-semana usado no create.

BEGIN;

CREATE OR REPLACE FUNCTION public.update_timetable_slot_guarded(
  p_school_id uuid,
  p_slot_id uuid,
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
  v_current_class_subject_id uuid;
  v_class_group_id uuid;
  v_current_subject_id uuid;
  v_current_teacher_id uuid;
  v_target_subject_id uuid;
  v_target_class_subject_id uuid;
  v_existing_teacher_id uuid;
  v_conflict_id uuid;
  v_result public.timetable_slots;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_school_id::text, p_weekday::int));

  SELECT ts.class_subject_id, cs.class_group_id, cs.subject_id, cs.teacher_id
    INTO v_current_class_subject_id, v_class_group_id, v_current_subject_id, v_current_teacher_id
  FROM public.timetable_slots ts
  JOIN public.class_subjects cs ON cs.id = ts.class_subject_id
  WHERE ts.id = p_slot_id
    AND ts.school_id = p_school_id
    AND ts.status = 'active';

  IF v_current_class_subject_id IS NULL THEN
    RAISE EXCEPTION 'Slot de horário não encontrado ou já inactivo.';
  END IF;

  v_target_subject_id := COALESCE(p_subject_id, v_current_subject_id);

  -- Reutiliza o class_subject actual quando nem disciplina nem professor mudam;
  -- caso contrário resolve (ou cria) o class_subject certo para a nova
  -- combinação turma+disciplina, tal como create_timetable_slot_guarded.
  IF v_target_subject_id = v_current_subject_id
     AND p_teacher_id IS NOT DISTINCT FROM v_current_teacher_id THEN
    v_target_class_subject_id := v_current_class_subject_id;
  ELSE
    SELECT id, teacher_id INTO v_target_class_subject_id, v_existing_teacher_id
    FROM public.class_subjects
    WHERE school_id = p_school_id
      AND class_group_id = v_class_group_id
      AND subject_id = v_target_subject_id;

    IF v_target_class_subject_id IS NULL THEN
      INSERT INTO public.class_subjects (
        school_id, class_group_id, subject_id, teacher_id, weekly_periods, status,
        created_by, updated_by
      )
      VALUES (
        p_school_id, v_class_group_id, v_target_subject_id, p_teacher_id, 1, 'active',
        p_actor, p_actor
      )
      RETURNING id INTO v_target_class_subject_id;
    ELSIF p_teacher_id IS DISTINCT FROM v_existing_teacher_id THEN
      UPDATE public.class_subjects
      SET teacher_id = p_teacher_id, updated_by = p_actor
      WHERE id = v_target_class_subject_id;
    END IF;
  END IF;

  SELECT ts.id INTO v_conflict_id
  FROM public.timetable_slots ts
  JOIN public.class_subjects cs ON cs.id = ts.class_subject_id
  WHERE ts.school_id = p_school_id
    AND ts.weekday = p_weekday
    AND ts.status = 'active'
    AND ts.id <> p_slot_id
    AND ts.starts_at < p_ends_at
    AND ts.ends_at > p_starts_at
    AND (
      cs.class_group_id = v_class_group_id
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

  UPDATE public.timetable_slots
  SET class_subject_id = v_target_class_subject_id,
      weekday = p_weekday,
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      room = p_room_label,
      room_id = p_room_id,
      shift_id = p_shift_id,
      schedule_id = p_schedule_id,
      day_period_number = p_day_period_number,
      notes = p_notes,
      updated_by = p_actor
  WHERE id = p_slot_id
    AND school_id = p_school_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.update_timetable_slot_guarded(
  uuid, uuid, uuid, uuid, uuid, smallint, time, time, text, uuid, uuid, integer, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_timetable_slot_guarded(
  uuid, uuid, uuid, uuid, uuid, smallint, time, time, text, uuid, uuid, integer, text, uuid
) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
