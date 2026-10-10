-- SIGA Plus — SQL a aplicar no Supabase (projecto Sga), pacote de 2026-10-10
-- Colar TUDO no SQL Editor → Run. Pode correr mais do que uma vez sem problema.
-- 1 migração da auditoria 14:
--   H1: duas turmas sem sala à mesma hora deixam de ser recusadas como «sala
--       sobreposta». «Sala», «S/N», «A definir» e «Sem sala fixa» não são salas, nas
--       duas funções do horário e nos dois gatilhos.
--   H2: trocar o professor de uma aula (troca-o em todas as aulas dessa disciplina na
--       turma) é recusado quando ele já tem aula noutra turma à hora de alguma delas.
-- Não mexe em dados. Ensaiada em PGlite (tests/sql/timetable-room-placeholders.mjs):
-- reproduz a recusa com os corpos da produção e corre duas vezes.
-- Confirmar no fim com a consulta do fundo deste ficheiro (deve dar "aplicada").


-- ══════════ 20261010100000_timetable_rooms_one_placeholder_rule.sql ══════════
-- Horário: «sala por atribuir» tem uma só regra na base (auditoria 14, H1).
--
-- Uma aula sem sala grava sempre uma etiqueta: `timetable_slots.room` é obrigatória e
-- `timetable_slots_room_check` recusa texto vazio. O ecrã envia «Sala» quando não se
-- escolhe sala nem se escreve rótulo, e `create_timetable_slot_guarded` gravava «S/N»
-- quando o rótulo vinha vazio.
--
-- Na produção (leitura de 2026-10-10) quatro sítios decidiam se uma etiqueta é uma sala,
-- cada um à sua maneira:
--
--   create_timetable_slot_guarded / update_timetable_slot_guarded   qualquer etiqueta
--   gatilho guard_timetable_slot_conflicts                          qualquer etiqueta (=)
--   gatilho timetable_slot_no_overlap                               excepto sala, a definir,
--                                                                   sem sala fixa
--   ecrã (isExplicitRoomLabel)                                      idem
--
-- Resultado: duas turmas sem sala à mesma hora eram recusadas pela base («Conflito de
-- horário… sala sobreposta») — a segunda aula de qualquer escola que não usa salas não se
-- gravava, e o ecrã não mostrava conflito nenhum.
--
-- Agora as duas funções e os dois gatilhos perguntam a private.timetable_room_is_explicit,
-- que passa a incluir «s/n». Os corpos são os da produção (pg_get_functiondef de
-- 2026-10-10), só com a cláusula da etiqueta mudada; o ficheiro
-- 20260925170000_timetable_builder_shifts_versions.sql nunca foi aplicado e não é a base
-- disto. CREATE OR REPLACE mantém as permissões. Não mexe em dados. Idempotente.
--
-- H2 (mesma auditoria): o professor é de `class_subjects`, por isso trocá-lo numa aula
-- troca-o em todas as aulas dessa disciplina na turma. As duas funções passam a recusar a
-- troca quando o novo professor já tem aula noutra turma à hora de alguma delas; antes
-- ficava em duas turmas ao mesmo tempo sem aviso.

BEGIN;

CREATE OR REPLACE FUNCTION private.timetable_room_is_explicit(p_room text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_room IS NOT NULL
     AND btrim(p_room) <> ''
     AND lower(btrim(p_room)) NOT IN ('sala', 's/n', 'a definir', 'sem sala fixa');
$$;

COMMENT ON FUNCTION private.timetable_room_is_explicit(text) IS
  'Espelha isExplicitRoomLabel (schedule/utils/conflicts.ts): uma etiqueta de marcador nao e uma sala.';

CREATE OR REPLACE FUNCTION public.guard_timetable_slot_conflicts()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_class uuid; v_teacher uuid; v_conflict text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN RETURN NEW; END IF;
  IF NEW.starts_at >= NEW.ends_at THEN
    RAISE EXCEPTION 'A hora de fim tem de ser depois da hora de início.' USING ERRCODE = '23514';
  END IF;
  SELECT class_group_id, teacher_id INTO v_class, v_teacher FROM class_subjects WHERE id = NEW.class_subject_id;

  SELECT 'A turma já tem aula neste horário.' INTO v_conflict
  FROM timetable_slots t JOIN class_subjects c ON c.id = t.class_subject_id
  WHERE t.id <> NEW.id AND t.status = 'active' AND t.weekday = NEW.weekday
    AND t.starts_at < NEW.ends_at AND NEW.starts_at < t.ends_at AND c.class_group_id = v_class LIMIT 1;

  IF v_conflict IS NULL AND v_teacher IS NOT NULL THEN
    SELECT 'O professor já tem aula noutra turma neste horário.' INTO v_conflict
    FROM timetable_slots t JOIN class_subjects c ON c.id = t.class_subject_id
    WHERE t.id <> NEW.id AND t.status = 'active' AND t.weekday = NEW.weekday
      AND t.starts_at < NEW.ends_at AND NEW.starts_at < t.ends_at AND c.teacher_id = v_teacher LIMIT 1;
  END IF;

  IF v_conflict IS NULL AND private.timetable_room_is_explicit(NEW.room) THEN
    SELECT 'A sala já está ocupada neste horário.' INTO v_conflict
    FROM timetable_slots t
    WHERE t.id <> NEW.id AND t.status = 'active' AND t.school_id = NEW.school_id AND t.weekday = NEW.weekday
      AND t.starts_at < NEW.ends_at AND NEW.starts_at < t.ends_at
      AND lower(btrim(t.room)) = lower(btrim(NEW.room)) LIMIT 1;
  END IF;

  IF v_conflict IS NOT NULL THEN RAISE EXCEPTION '%', v_conflict USING ERRCODE = '23P01'; END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.create_timetable_slot_guarded(p_school_id uuid, p_class_group_id uuid, p_subject_id uuid, p_teacher_id uuid, p_room_id uuid, p_weekday smallint, p_starts_at time without time zone, p_ends_at time without time zone, p_room_label text, p_shift_id uuid, p_schedule_id uuid, p_day_period_number integer, p_notes text, p_actor uuid)
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
    -- H2: o professor é da disciplina na turma, por isso a troca vale para todas as
    -- aulas dela. Recusa-se se o novo professor já tem aula noutra turma à hora de
    -- alguma dessas aulas (os gatilhos só verificam a aula que se grava).
    IF p_teacher_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.timetable_slots mine
      JOIN public.timetable_slots other
        ON other.school_id = mine.school_id AND other.weekday = mine.weekday
       AND other.status = 'active' AND other.id <> mine.id
       AND other.starts_at < mine.ends_at AND other.ends_at > mine.starts_at
      JOIN public.class_subjects ocs ON ocs.id = other.class_subject_id
      WHERE mine.school_id = p_school_id AND mine.class_subject_id = v_class_subject_id
        AND mine.status = 'active' AND ocs.id <> v_class_subject_id AND ocs.teacher_id = p_teacher_id
    ) THEN
      RAISE EXCEPTION 'Conflito de horário: o professor muda em todas as aulas desta disciplina na turma, e já tem aula noutra turma à hora de uma delas.'
        USING ERRCODE = 'unique_violation';
    END IF;
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
        private.timetable_room_is_explicit(p_room_label)
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

CREATE OR REPLACE FUNCTION public.update_timetable_slot_guarded(p_school_id uuid, p_slot_id uuid, p_subject_id uuid, p_teacher_id uuid, p_room_id uuid, p_weekday smallint, p_starts_at time without time zone, p_ends_at time without time zone, p_room_label text, p_shift_id uuid, p_schedule_id uuid, p_day_period_number integer, p_notes text, p_actor uuid)
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
      -- H2: o professor é da disciplina na turma, por isso a troca vale para todas as
      -- aulas dela. Recusa-se se o novo professor já tem aula noutra turma à hora de
      -- alguma dessas aulas (os gatilhos só verificam a aula que se grava).
      IF p_teacher_id IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.timetable_slots mine
        JOIN public.timetable_slots other
          ON other.school_id = mine.school_id AND other.weekday = mine.weekday
         AND other.status = 'active' AND other.id <> mine.id
         AND other.starts_at < mine.ends_at AND other.ends_at > mine.starts_at
        JOIN public.class_subjects ocs ON ocs.id = other.class_subject_id
        WHERE mine.school_id = p_school_id AND mine.class_subject_id = v_target_class_subject_id
          AND mine.status = 'active' AND ocs.id <> v_target_class_subject_id AND ocs.teacher_id = p_teacher_id
            AND mine.id <> p_slot_id
      ) THEN
        RAISE EXCEPTION 'Conflito de horário: o professor muda em todas as aulas desta disciplina na turma, e já tem aula noutra turma à hora de uma delas.'
          USING ERRCODE = 'unique_violation';
      END IF;
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
        private.timetable_room_is_explicit(p_room_label)
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

COMMIT;

-- ══════════ Confirmar ══════════
SELECT
  CASE
    WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE (n.nspname, p.proname) IN (('public', 'create_timetable_slot_guarded'),
                                           ('public', 'update_timetable_slot_guarded'),
                                           ('public', 'guard_timetable_slot_conflicts'))
            AND p.prosrc LIKE '%timetable_room_is_explicit%') = 3
     AND (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'private' AND p.proname = 'timetable_room_is_explicit'
            AND p.prosrc LIKE '%''s/n''%') = 1
     AND (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname IN ('create_timetable_slot_guarded', 'update_timetable_slot_guarded')
            AND p.prosrc LIKE '%muda em todas as aulas%') = 2
      THEN 'aplicada'
    ELSE 'por aplicar'
  END AS "20261010100000 salas por atribuir";
