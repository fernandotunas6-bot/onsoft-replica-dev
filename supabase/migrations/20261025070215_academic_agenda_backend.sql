-- Eventos complementares; terms/timetable_slots continuam a ser a verdade lectiva.
-- Sem políticas de browser. O servidor verifica escola, papel, âmbito e MFA.
BEGIN;
CREATE TABLE IF NOT EXISTS public.siga_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  academic_year_id uuid NOT NULL,
  class_group_id uuid,
  teacher_id uuid,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 160),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 4000),
  category text NOT NULL CHECK (category IN ('event','meeting','deadline','holiday','closure')),
  starts_on date NOT NULL,
  ends_on date NOT NULL CHECK (ends_on >= starts_on),
  starts_at time,
  ends_at time,
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all','staff')),
  blocks_teaching boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published','cancelled')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT siga_calendar_events_year_fkey FOREIGN KEY (school_id, academic_year_id) REFERENCES public.academic_years(school_id,id),
  CONSTRAINT siga_calendar_events_group_fkey FOREIGN KEY (school_id, class_group_id) REFERENCES public.class_groups(school_id,id),
  CONSTRAINT siga_calendar_events_teacher_fkey FOREIGN KEY (school_id, teacher_id) REFERENCES public.teachers(school_id,id),
  CONSTRAINT siga_calendar_events_times_check CHECK (
    (starts_at IS NULL AND ends_at IS NULL) OR
    (starts_at IS NOT NULL AND ends_at IS NOT NULL AND starts_on = ends_on AND ends_at > starts_at)
  ),
  CONSTRAINT siga_calendar_events_closure_check CHECK (
    NOT blocks_teaching OR (category IN ('closure','holiday') AND starts_at IS NULL)
  )
);
ALTER TABLE public.siga_calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_calendar_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_calendar_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_calendar_events TO service_role;

CREATE INDEX IF NOT EXISTS siga_calendar_events_school_range
  ON public.siga_calendar_events (school_id, academic_year_id, starts_on, ends_on) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS siga_calendar_events_group ON public.siga_calendar_events (school_id, class_group_id) WHERE class_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS siga_calendar_events_teacher ON public.siga_calendar_events (school_id, teacher_id) WHERE teacher_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.guard_siga_calendar_event()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.academic_years y WHERE y.id = NEW.academic_year_id AND y.school_id = NEW.school_id
      AND NEW.starts_on >= y.starts_on AND NEW.ends_on <= y.ends_on
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Evento fora das datas do ano lectivo.';
  END IF;
  IF NEW.class_group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.class_groups g WHERE g.id = NEW.class_group_id AND g.school_id = NEW.school_id
      AND g.academic_year_id = NEW.academic_year_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A turma não pertence ao ano lectivo do evento.';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.school_id <> OLD.school_id OR NEW.version <> OLD.version + 1) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Escola ou versão inválida para o evento.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_siga_calendar_event() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.guard_siga_calendar_event() TO service_role;
DROP TRIGGER IF EXISTS guard_siga_calendar_event ON public.siga_calendar_events;
CREATE TRIGGER guard_siga_calendar_event BEFORE INSERT OR UPDATE ON public.siga_calendar_events
  FOR EACH ROW EXECUTE FUNCTION private.guard_siga_calendar_event();
DROP TRIGGER IF EXISTS siga_calendar_events_touch ON public.siga_calendar_events;
CREATE TRIGGER siga_calendar_events_touch BEFORE UPDATE ON public.siga_calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();
DROP TRIGGER IF EXISTS siga_calendar_events_audit ON public.siga_calendar_events;
CREATE TRIGGER siga_calendar_events_audit AFTER INSERT OR UPDATE OR DELETE ON public.siga_calendar_events
  FOR EACH ROW EXECUTE FUNCTION private.audit_row_change();
COMMIT;
NOTIFY pgrst, 'reload schema';
