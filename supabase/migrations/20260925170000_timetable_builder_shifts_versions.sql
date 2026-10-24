-- =====================================================================
-- Construtor de horários: turnos, blocos, disponibilidade docente,
-- versões por período (modelos) e escrita atómica por turma.
-- Idempotente — pode ser reaplicado no SGA via npm run siga:sql.
-- =====================================================================

-- 1. Turnos e blocos de aula --------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code = btrim(code) AND char_length(code) BETWEEN 1 AND 40),
  name text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 2 AND 100),
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  default_lesson_duration integer NOT NULL DEFAULT 45 CHECK (default_lesson_duration BETWEEN 15 AND 180),
  default_break_duration integer NOT NULL DEFAULT 15 CHECK (default_break_duration BETWEEN 0 AND 120),
  active_days integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  color text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT school_shifts_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT school_shifts_school_code_key UNIQUE (school_id, code),
  CONSTRAINT school_shifts_time_valid CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.school_shift_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.school_shifts(id) ON DELETE CASCADE,
  slot_number integer NOT NULL CHECK (slot_number >= 1),
  name text NOT NULL,
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  is_break boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT school_shift_slots_shift_number_key UNIQUE (shift_id, slot_number),
  CONSTRAINT school_shift_slots_time_valid CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS school_shifts_school_idx ON public.school_shifts (school_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS school_shift_slots_shift_idx ON public.school_shift_slots (shift_id, slot_number);

-- 2. Disponibilidade docente -------------------------------------------
CREATE TABLE IF NOT EXISTS public.teacher_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  is_available boolean NOT NULL DEFAULT true,
  max_weekly_hours smallint DEFAULT 24 CHECK (max_weekly_hours IS NULL OR max_weekly_hours > 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT teacher_availability_time_valid CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS teacher_availability_lookup_idx
  ON public.teacher_availability (school_id, teacher_id, weekday) WHERE deleted_at IS NULL;

-- 3. Versões de horário (modelos por período) --------------------------
CREATE TABLE IF NOT EXISTS public.academic_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  class_group_id uuid NOT NULL REFERENCES public.class_groups(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1 CHECK (version_number >= 1),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'published', 'archived')),
  valid_from date,
  valid_to date,
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT academic_schedules_version_key UNIQUE (school_id, class_group_id, version_number)
);
CREATE INDEX IF NOT EXISTS academic_schedules_class_status_idx
  ON public.academic_schedules (school_id, class_group_id, status) WHERE deleted_at IS NULL;

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

-- 4. Extensão compatível de timetable_slots ----------------------------
ALTER TABLE public.timetable_slots
  ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES public.academic_schedules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.school_shifts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS day_period_number integer,
  ADD COLUMN IF NOT EXISTS notes text;
CREATE INDEX IF NOT EXISTS timetable_slots_room_idx ON public.timetable_slots (school_id, room_id) WHERE room_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS timetable_slots_schedule_idx ON public.timetable_slots (school_id, schedule_id) WHERE schedule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS timetable_slots_school_day_active_idx ON public.timetable_slots (school_id, weekday, starts_at) WHERE status = 'active';

-- 5. Permissões e RLS ---------------------------------------------------
GRANT SELECT ON public.school_shifts TO authenticated;
GRANT SELECT ON public.school_shift_slots TO authenticated;
GRANT SELECT ON public.teacher_availability TO authenticated;
GRANT SELECT ON public.academic_schedules TO authenticated;
GRANT ALL ON public.school_shifts TO service_role;
GRANT ALL ON public.school_shift_slots TO service_role;
GRANT ALL ON public.teacher_availability TO service_role;
GRANT ALL ON public.academic_schedules TO service_role;

ALTER TABLE public.school_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_shift_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read school shifts" ON public.school_shifts;
CREATE POLICY "Members read school shifts" ON public.school_shifts
  FOR SELECT TO authenticated USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS "Members read shift slots" ON public.school_shift_slots;
CREATE POLICY "Members read shift slots" ON public.school_shift_slots
  FOR SELECT TO authenticated USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS "Members read teacher availability" ON public.teacher_availability;
CREATE POLICY "Members read teacher availability" ON public.teacher_availability
  FOR SELECT TO authenticated USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS "Members read schedule versions" ON public.academic_schedules;
CREATE POLICY "Members read schedule versions" ON public.academic_schedules
  FOR SELECT TO authenticated USING (public.is_school_member(school_id));

DROP TRIGGER IF EXISTS school_shifts_set_updated_at ON public.school_shifts;
CREATE TRIGGER school_shifts_set_updated_at BEFORE UPDATE ON public.school_shifts
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();
DROP TRIGGER IF EXISTS school_shift_slots_set_updated_at ON public.school_shift_slots;
CREATE TRIGGER school_shift_slots_set_updated_at BEFORE UPDATE ON public.school_shift_slots
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();
DROP TRIGGER IF EXISTS teacher_availability_set_updated_at ON public.teacher_availability;
CREATE TRIGGER teacher_availability_set_updated_at BEFORE UPDATE ON public.teacher_availability
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();
DROP TRIGGER IF EXISTS academic_schedules_set_updated_at ON public.academic_schedules;
CREATE TRIGGER academic_schedules_set_updated_at BEFORE UPDATE ON public.academic_schedules
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

-- 6. Guarda de conflitos: passa a considerar também a sala por id -------
CREATE OR REPLACE FUNCTION public.guard_timetable_slot_conflicts()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
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

  IF v_conflict IS NULL AND NEW.room_id IS NOT NULL THEN
    SELECT 'A sala já está ocupada neste horário.' INTO v_conflict
    FROM timetable_slots t
    WHERE t.id <> NEW.id AND t.status = 'active' AND t.school_id = NEW.school_id AND t.weekday = NEW.weekday
      AND t.starts_at < NEW.ends_at AND NEW.starts_at < t.ends_at AND t.room_id = NEW.room_id LIMIT 1;
  END IF;

  -- Marcadores de «sala por atribuir»: uma só regra (20261010100000, auditoria 14 H3).
  IF v_conflict IS NULL AND private.timetable_room_is_explicit(NEW.room) THEN
    SELECT 'A sala já está ocupada neste horário.' INTO v_conflict
    FROM timetable_slots t
    WHERE t.id <> NEW.id AND t.status = 'active' AND t.school_id = NEW.school_id AND t.weekday = NEW.weekday
      AND t.starts_at < NEW.ends_at AND NEW.starts_at < t.ends_at
      AND lower(btrim(t.room)) = lower(btrim(NEW.room)) LIMIT 1;
  END IF;

  IF v_conflict IS NOT NULL THEN RAISE EXCEPTION '%', v_conflict USING ERRCODE = '23P01'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_timetable_slot_conflicts ON public.timetable_slots;
CREATE TRIGGER trg_guard_timetable_slot_conflicts
BEFORE INSERT OR UPDATE OF weekday, starts_at, ends_at, room, room_id, status, class_subject_id ON public.timetable_slots
FOR EACH ROW EXECUTE FUNCTION public.guard_timetable_slot_conflicts();
REVOKE EXECUTE ON FUNCTION public.guard_timetable_slot_conflicts() FROM PUBLIC, anon, authenticated;

-- 7. RPCs atómicos de slot (mesma assinatura do SGA) --------------------
CREATE OR REPLACE FUNCTION public.create_timetable_slot_guarded(
  p_school_id uuid, p_class_group_id uuid, p_subject_id uuid, p_teacher_id uuid, p_room_id uuid,
  p_weekday smallint, p_starts_at time, p_ends_at time, p_room_label text, p_shift_id uuid,
  p_schedule_id uuid, p_day_period_number integer, p_notes text, p_actor uuid
)
RETURNS public.timetable_slots
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_class_subject_id uuid; v_existing_teacher_id uuid; v_conflict_id uuid; v_result public.timetable_slots;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_school_id::text, p_weekday::int));

  SELECT id, teacher_id INTO v_class_subject_id, v_existing_teacher_id
  FROM public.class_subjects
  WHERE school_id = p_school_id AND class_group_id = p_class_group_id AND subject_id = p_subject_id;

  IF v_class_subject_id IS NULL THEN
    INSERT INTO public.class_subjects (school_id, class_group_id, subject_id, teacher_id, weekly_periods, status, created_by, updated_by)
    VALUES (p_school_id, p_class_group_id, p_subject_id, p_teacher_id, 1, 'active', p_actor, p_actor)
    RETURNING id INTO v_class_subject_id;
  ELSIF p_teacher_id IS NOT NULL AND p_teacher_id IS DISTINCT FROM v_existing_teacher_id THEN
    UPDATE public.class_subjects SET teacher_id = p_teacher_id, updated_by = p_actor WHERE id = v_class_subject_id;
  END IF;

  SELECT ts.id INTO v_conflict_id
  FROM public.timetable_slots ts JOIN public.class_subjects cs ON cs.id = ts.class_subject_id
  WHERE ts.school_id = p_school_id AND ts.weekday = p_weekday AND ts.status = 'active'
    AND ts.starts_at < p_ends_at AND ts.ends_at > p_starts_at
    AND (
      cs.class_group_id = p_class_group_id
      OR (p_teacher_id IS NOT NULL AND cs.teacher_id = p_teacher_id)
      OR (p_room_id IS NOT NULL AND ts.room_id = p_room_id)
      OR (private.timetable_room_is_explicit(p_room_label)
          AND lower(btrim(ts.room)) = lower(btrim(p_room_label)))
    )
  LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'Conflito de horário: já existe uma aula desta turma, professor ou sala sobreposta neste dia e horário.'
      USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.timetable_slots (school_id, class_subject_id, weekday, starts_at, ends_at, room, room_id,
    shift_id, schedule_id, day_period_number, notes, status, created_by)
  VALUES (p_school_id, v_class_subject_id, p_weekday, p_starts_at, p_ends_at, coalesce(nullif(btrim(p_room_label), ''), 'S/N'), p_room_id,
    p_shift_id, p_schedule_id, p_day_period_number, p_notes, 'active', p_actor)
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_timetable_slot_guarded(
  p_school_id uuid, p_slot_id uuid, p_subject_id uuid, p_teacher_id uuid, p_room_id uuid,
  p_weekday smallint, p_starts_at time, p_ends_at time, p_room_label text, p_shift_id uuid,
  p_schedule_id uuid, p_day_period_number integer, p_notes text, p_actor uuid
)
RETURNS public.timetable_slots
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_current_class_subject_id uuid; v_class_group_id uuid; v_current_subject_id uuid; v_current_teacher_id uuid;
  v_target_subject_id uuid; v_target_class_subject_id uuid; v_existing_teacher_id uuid; v_conflict_id uuid;
  v_result public.timetable_slots;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_school_id::text, p_weekday::int));

  SELECT ts.class_subject_id, cs.class_group_id, cs.subject_id, cs.teacher_id
    INTO v_current_class_subject_id, v_class_group_id, v_current_subject_id, v_current_teacher_id
  FROM public.timetable_slots ts JOIN public.class_subjects cs ON cs.id = ts.class_subject_id
  WHERE ts.id = p_slot_id AND ts.school_id = p_school_id AND ts.status = 'active';

  IF v_current_class_subject_id IS NULL THEN
    RAISE EXCEPTION 'Slot de horário não encontrado ou já inactivo.';
  END IF;

  v_target_subject_id := COALESCE(p_subject_id, v_current_subject_id);

  IF v_target_subject_id = v_current_subject_id AND p_teacher_id IS NOT DISTINCT FROM v_current_teacher_id THEN
    v_target_class_subject_id := v_current_class_subject_id;
  ELSE
    SELECT id, teacher_id INTO v_target_class_subject_id, v_existing_teacher_id
    FROM public.class_subjects
    WHERE school_id = p_school_id AND class_group_id = v_class_group_id AND subject_id = v_target_subject_id;

    IF v_target_class_subject_id IS NULL THEN
      INSERT INTO public.class_subjects (school_id, class_group_id, subject_id, teacher_id, weekly_periods, status, created_by, updated_by)
      VALUES (p_school_id, v_class_group_id, v_target_subject_id, p_teacher_id, 1, 'active', p_actor, p_actor)
      RETURNING id INTO v_target_class_subject_id;
    ELSIF p_teacher_id IS DISTINCT FROM v_existing_teacher_id THEN
      UPDATE public.class_subjects SET teacher_id = p_teacher_id, updated_by = p_actor WHERE id = v_target_class_subject_id;
    END IF;
  END IF;

  SELECT ts.id INTO v_conflict_id
  FROM public.timetable_slots ts JOIN public.class_subjects cs ON cs.id = ts.class_subject_id
  WHERE ts.school_id = p_school_id AND ts.weekday = p_weekday AND ts.status = 'active' AND ts.id <> p_slot_id
    AND ts.starts_at < p_ends_at AND ts.ends_at > p_starts_at
    AND (
      cs.class_group_id = v_class_group_id
      OR (p_teacher_id IS NOT NULL AND cs.teacher_id = p_teacher_id)
      OR (p_room_id IS NOT NULL AND ts.room_id = p_room_id)
      OR (private.timetable_room_is_explicit(p_room_label)
          AND lower(btrim(ts.room)) = lower(btrim(p_room_label)))
    )
  LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'Conflito de horário: já existe uma aula desta turma, professor ou sala sobreposta neste dia e horário.'
      USING ERRCODE = 'unique_violation';
  END IF;

  UPDATE public.timetable_slots
  SET class_subject_id = v_target_class_subject_id, weekday = p_weekday, starts_at = p_starts_at, ends_at = p_ends_at,
      room = coalesce(nullif(btrim(p_room_label), ''), 'S/N'), room_id = p_room_id, shift_id = p_shift_id, schedule_id = p_schedule_id,
      day_period_number = p_day_period_number, notes = p_notes, updated_by = p_actor
  WHERE id = p_slot_id AND school_id = p_school_id
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

-- 8. Aplicar um plano completo de uma turma numa única transacção ------
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

REVOKE ALL ON FUNCTION public.create_timetable_slot_guarded(uuid, uuid, uuid, uuid, uuid, smallint, time, time, text, uuid, uuid, integer, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_timetable_slot_guarded(uuid, uuid, uuid, uuid, uuid, smallint, time, time, text, uuid, uuid, integer, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_timetable_plan_guarded(uuid, uuid, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_timetable_slot_guarded(uuid, uuid, uuid, uuid, uuid, smallint, time, time, text, uuid, uuid, integer, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_timetable_slot_guarded(uuid, uuid, uuid, uuid, uuid, smallint, time, time, text, uuid, uuid, integer, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_timetable_plan_guarded(uuid, uuid, jsonb, uuid, uuid) TO service_role;

-- 9. Turnos e blocos por omissão para cada escola -----------------------
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

DO $$ DECLARE s record; BEGIN
  FOR s IN SELECT id FROM public.schools LOOP
    PERFORM public.ensure_school_shift_defaults(s.id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';