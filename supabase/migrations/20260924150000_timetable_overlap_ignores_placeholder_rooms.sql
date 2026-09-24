-- Correccao a `20260924141600_timetable_slot_overlap_trigger.sql`, ja aplicada em
-- producao (trigger `timetable_slot_no_overlap`, confirmado em 2026-09-24).
--
-- O trigger trata qualquer etiqueta de sala nao vazia como sala real:
--
--   OR ( NEW.room IS NOT NULL
--        AND btrim(NEW.room) <> ''
--        AND lower(btrim(ts.room)) = lower(btrim(NEW.room)) )
--
-- A aplicacao nao faz isso. `isExplicitRoomLabel`
-- (`src/features/academic/schedule/utils/conflicts.ts:9-12`) exclui tres etiquetas
-- que significam "sala por atribuir":
--
--   ["sala", "a definir", "sem sala fixa"]
--
-- Duas aulas de turmas diferentes marcadas "A definir" a mesma hora nao sao um
-- conflito de sala -- sao duas aulas sem sala atribuida. Como esta, o trigger
-- recusa a segunda com "Conflito de horario: ... sala sobreposta", e nao ha como
-- contornar: o trigger corre antes da RLS e antes das funcoes guardadas.
--
-- Hoje a producao tem uma unica aula etiquetada 'sala' (de 17 com etiqueta), pelo
-- que ainda nao ha colisao. A segunda que aparecer bloqueia um horario legitimo.
--
-- O resto da funcao fica exactamente igual -- so muda a clausula da sala por
-- texto livre.

BEGIN;

-- A mesma lista de `isExplicitRoomLabel`, num sitio so, para que a base e o
-- cliente digam o mesmo sobre o que e uma sala.
CREATE OR REPLACE FUNCTION private.timetable_room_is_explicit(p_room text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_room IS NOT NULL
     AND btrim(p_room) <> ''
     AND lower(btrim(p_room)) NOT IN ('sala', 'a definir', 'sem sala fixa');
$$;

COMMENT ON FUNCTION private.timetable_room_is_explicit(text) IS
  'Espelha isExplicitRoomLabel (schedule/utils/conflicts.ts): uma etiqueta de marcador nao e uma sala.';

CREATE OR REPLACE FUNCTION private.enforce_timetable_slot_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_class_group_id uuid;
  v_teacher_id uuid;
  v_conflict_id uuid;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.school_id::text, NEW.weekday::int));

  SELECT cs.class_group_id, cs.teacher_id INTO v_class_group_id, v_teacher_id
  FROM public.class_subjects cs
  WHERE cs.id = NEW.class_subject_id AND cs.school_id = NEW.school_id;

  SELECT ts.id INTO v_conflict_id
  FROM public.timetable_slots ts
  JOIN public.class_subjects cs ON cs.id = ts.class_subject_id
  WHERE ts.school_id = NEW.school_id
    AND ts.weekday = NEW.weekday
    AND ts.status = 'active'
    AND ts.id <> NEW.id
    AND ts.starts_at < NEW.ends_at
    AND ts.ends_at > NEW.starts_at
    AND (
      cs.class_group_id = v_class_group_id
      OR (v_teacher_id IS NOT NULL AND cs.teacher_id = v_teacher_id)
      OR (NEW.room_id IS NOT NULL AND ts.room_id = NEW.room_id)
      OR (
        -- Unica alteracao: uma etiqueta de marcador deixa de contar como sala.
        private.timetable_room_is_explicit(NEW.room)
        AND lower(btrim(ts.room)) = lower(btrim(NEW.room))
      )
    )
  LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'Conflito de horário: já existe uma aula desta turma, professor ou sala sobreposta neste dia e horário.'
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
