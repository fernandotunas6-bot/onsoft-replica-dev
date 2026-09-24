-- Achado P1 (docs/auditoria/04-auditoria.md, 4.3): o corpo de
-- create_timetable_slot_guarded e update_timetable_slot_guarded nunca foi capturado no
-- repositório — zero ocorrências em 20260908210000_capture_all_db_functions.sql. Ninguém
-- podia rever a regra que impede duplo agendamento nem um teste a verificava a partir daqui.
--
-- Captura fiel do corpo em produção (via pg_get_functiondef, confirmado
-- 2026-09-24) — não muda comportamento, apenas torna a função revisível e versionada.
--
-- CREATE OR REPLACE é idempotente: reaplicar não altera nada em produção onde o corpo já
-- é este.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_timetable_slot_guarded(
  p_school_id uuid,
  p_class_group_id uuid,
  p_subject_id uuid,
  p_teacher_id uuid,
  p_room_id uuid,
  p_weekday smallint,
  p_starts_at time without time zone,
  p_ends_at time without time zone,
  p_room_label text,
  p_shift_id uuid,
  p_schedule_id uuid,
  p_day_period_number integer,
  p_notes text,
  p_actor uuid
)
 RETURNS timetable_slots
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.update_timetable_slot_guarded(
  p_school_id uuid,
  p_slot_id uuid,
  p_subject_id uuid,
  p_teacher_id uuid,
  p_room_id uuid,
  p_weekday smallint,
  p_starts_at time without time zone,
  p_ends_at time without time zone,
  p_room_label text,
  p_shift_id uuid,
  p_schedule_id uuid,
  p_day_period_number integer,
  p_notes text,
  p_actor uuid
)
 RETURNS timetable_slots
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$;

COMMENT ON FUNCTION public.create_timetable_slot_guarded(uuid, uuid, uuid, uuid, uuid, smallint, time, time, text, uuid, uuid, integer, text, uuid) IS
  'Captura fiel do corpo de produção — ver docs/auditoria/04-auditoria.md, achado P1 da área 4.3. Qualquer alteração de comportamento deve vir por nova migração, nunca directo em produção.';
COMMENT ON FUNCTION public.update_timetable_slot_guarded(uuid, uuid, uuid, uuid, uuid, smallint, time, time, text, uuid, uuid, integer, text, uuid) IS
  'Captura fiel do corpo de produção — ver docs/auditoria/04-auditoria.md, achado P1 da área 4.3. Qualquer alteração de comportamento deve vir por nova migração, nunca directo em produção.';

COMMIT;
