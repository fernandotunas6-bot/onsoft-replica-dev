-- Lacuna do construtor de horários: as peças de
-- `20260925170000_timetable_builder_shifts_versions.sql` que nunca chegaram à
-- produção. Medido a 2026-10-22: as tabelas desse ficheiro já existem (entraram
-- por uma migração de captura); ficaram de fora cinco colunas de
-- `academic_schedules` e duas funções. As colunas de `timetable_slots` já lá
-- estão todas.
--
-- Deliberadamente NÃO reaplicado deste ficheiro: as duas RPC abertas a
-- `authenticated` (create_/update_timetable_slot_guarded), o trigger de
-- conflitos, as políticas RLS e os GRANT de tabela — existem em produção e
-- foram endurecidos depois (PR #144, 20261022081131_timetable_guard_alignment);
-- recriá-los a partir da versão de Setembro desfazia essa correcção.
--
-- As duas funções aqui são SECURITY INVOKER, search_path = '' e com EXECUTE só
-- para service_role. Idempotente.

ALTER TABLE public.academic_schedules
  ADD COLUMN IF NOT EXISTS term smallint CHECK (term IS NULL OR term BETWEEN 1 AND 3),
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.school_shifts(id) ON DELETE SET NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'academic_schedules_source_check') THEN
    ALTER TABLE public.academic_schedules
      ADD CONSTRAINT academic_schedules_source_check
      CHECK (source IN ('manual', 'suggested', 'carried_over', 'imported'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS academic_schedules_class_term_idx
  ON public.academic_schedules (school_id, class_group_id, academic_year_id, term, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.apply_timetable_plan_guarded(
  p_school_id uuid, p_class_group_id uuid, p_slots jsonb, p_actor uuid, p_schedule_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_item jsonb; v_count integer := 0; v_class_subject uuid; v_bad uuid;
BEGIN
  IF p_slots IS NULL OR jsonb_typeof(p_slots) <> 'array' THEN
    RAISE EXCEPTION 'Plano de horário inválido.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_school_id::text, 7));

  -- Todos os class_subjects têm de pertencer a esta turma e escola.
  SELECT (e->>'class_subject_id')::uuid INTO v_bad
  FROM jsonb_array_elements(p_slots) e
  WHERE NOT EXISTS (
    SELECT 1 FROM public.class_subjects cs
    WHERE cs.id = (e->>'class_subject_id')::uuid AND cs.school_id = p_school_id AND cs.class_group_id = p_class_group_id
  ) LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'O plano contém uma disciplina que não pertence a esta turma.' USING ERRCODE = '23503';
  END IF;

  UPDATE public.timetable_slots ts
  SET status = 'inactive', updated_by = p_actor
  FROM public.class_subjects cs
  WHERE cs.id = ts.class_subject_id AND ts.school_id = p_school_id AND ts.status = 'active'
    AND cs.class_group_id = p_class_group_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_slots) LOOP
    v_class_subject := (v_item->>'class_subject_id')::uuid;
    INSERT INTO public.timetable_slots (
      school_id, class_subject_id, weekday, starts_at, ends_at, room, room_id, shift_id, schedule_id,
      day_period_number, notes, status, created_by
    ) VALUES (
      p_school_id, v_class_subject, (v_item->>'weekday')::smallint,
      (v_item->>'starts_at')::time, (v_item->>'ends_at')::time,
      coalesce(nullif(btrim(v_item->>'room'), ''), 'S/N'),
      nullif(v_item->>'room_id', '')::uuid, nullif(v_item->>'shift_id', '')::uuid, p_schedule_id,
      nullif(v_item->>'day_period_number', '')::integer, nullif(v_item->>'notes', ''), 'active', p_actor
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_timetable_plan_guarded(uuid, uuid, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_timetable_plan_guarded(uuid, uuid, jsonb, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_school_shift_defaults(p_school_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  s record; v_cursor time; v_end time; v_n integer; v_lessons integer; v_created integer := 0;
BEGIN
  INSERT INTO public.school_shifts (school_id, code, name, starts_at, ends_at, default_lesson_duration, default_break_duration, color)
  VALUES
    (p_school_id, 'morning', 'Manhã', '07:30:00', '12:30:00', 45, 15, '#3b82f6'),
    (p_school_id, 'afternoon', 'Tarde', '13:00:00', '18:00:00', 45, 15, '#f59e0b'),
    (p_school_id, 'evening', 'Noite / Pós-Laboral', '18:30:00', '22:30:00', 45, 10, '#8b5cf6')
  ON CONFLICT (school_id, code) DO NOTHING;

  FOR s IN
    SELECT sh.* FROM public.school_shifts sh
    WHERE sh.school_id = p_school_id AND sh.deleted_at IS NULL AND sh.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM public.school_shift_slots x WHERE x.shift_id = sh.id AND x.deleted_at IS NULL)
  LOOP
    v_cursor := s.starts_at; v_n := 0; v_lessons := 0;
    WHILE v_cursor + make_interval(mins => s.default_lesson_duration) <= s.ends_at AND v_n < 40 LOOP
      v_end := v_cursor + make_interval(mins => s.default_lesson_duration);
      v_n := v_n + 1; v_lessons := v_lessons + 1;
      INSERT INTO public.school_shift_slots (school_id, shift_id, slot_number, name, starts_at, ends_at, is_break)
      VALUES (p_school_id, s.id, v_n, v_lessons || 'º tempo', v_cursor, v_end, false);
      v_created := v_created + 1;
      v_cursor := v_end;
      IF v_lessons % 3 = 0 AND s.default_break_duration > 0
         AND v_cursor + make_interval(mins => s.default_break_duration + s.default_lesson_duration) <= s.ends_at THEN
        v_end := v_cursor + make_interval(mins => s.default_break_duration);
        v_n := v_n + 1;
        INSERT INTO public.school_shift_slots (school_id, shift_id, slot_number, name, starts_at, ends_at, is_break)
        VALUES (p_school_id, s.id, v_n, 'Intervalo', v_cursor, v_end, true);
        v_cursor := v_end;
      END IF;
    END LOOP;
  END LOOP;
  RETURN v_created;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_school_shift_defaults(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_school_shift_defaults(uuid) TO service_role;
