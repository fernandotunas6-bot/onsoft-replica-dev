-- Achado agravante P1 (docs/auditoria/04-auditoria.md, 4.3): a única prevenção de duplo
-- agendamento é o corpo de create_timetable_slot_guarded/update_timetable_slot_guarded —
-- nenhuma delas é SECURITY DEFINER, e authenticated tem GRANT directo de INSERT/UPDATE em
-- timetable_slots com políticas RLS permissivas ("Academic create/update timetable slots",
-- restritas a can_manage_students() mas ainda assim um caminho directo). Um insert/update
-- que não passe pelas funções guardadas — um script, um import, um cliente futuro — nunca
-- é verificado, e as únicas constraints existentes ((school_id, id) e
-- (school_id, id, class_subject_id)) incluem a chave primária e não impedem nada.
--
-- Em vez de reescrever a política RLS (can_manage_students() já é o padrão certo para
-- quem pode gerir horários — restringir mais partiria fluxos legítimos), fecha-se o
-- mesmo buraco com o padrão já usado para notas
-- (private.enforce_teacher_grade_score_scope, migração 20260903025000): um trigger que
-- RLS não contorna e que corre em qualquer caminho de escrita, directo ou pelas funções
-- guardadas. Reaplica exactamente a mesma verificação, ao ponto de o pg_advisory_xact_lock
-- ser reentrante dentro da mesma transacção (chamar duas vezes com a mesma chave não
-- bloqueia consigo mesmo) — logo o caminho guardado paga um custo desprezível e ganha
-- uma segunda rede.

BEGIN;

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
        NEW.room IS NOT NULL
        AND btrim(NEW.room) <> ''
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

COMMENT ON FUNCTION private.enforce_timetable_slot_no_overlap() IS
  'Rede declarativa por baixo de create/update_timetable_slot_guarded (docs/auditoria/04-auditoria.md, 4.3). Corre em qualquer INSERT/UPDATE de timetable_slots, directo ou pelas funções guardadas — RLS não a contorna.';

DROP TRIGGER IF EXISTS timetable_slot_no_overlap ON public.timetable_slots;
CREATE TRIGGER timetable_slot_no_overlap
  BEFORE INSERT OR UPDATE OF class_subject_id, weekday, starts_at, ends_at, room, room_id, status
  ON public.timetable_slots
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_timetable_slot_no_overlap();

COMMIT;

NOTIFY pgrst, 'reload schema';
