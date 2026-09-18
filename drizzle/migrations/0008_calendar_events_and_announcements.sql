CREATE TABLE public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (title = btrim(title) AND char_length(title) BETWEEN 2 AND 160),
  description text,
  event_date date NOT NULL,
  ends_on date,
  category text NOT NULL DEFAULT 'general' CHECK (
    category IN ('academic', 'meeting', 'deadline', 'holiday', 'general')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT calendar_events_dates_valid CHECK (ends_on IS NULL OR ends_on >= event_date),
  CONSTRAINT calendar_events_school_id_id_key UNIQUE (school_id, id)
);

CREATE INDEX calendar_events_school_upcoming_idx
  ON public.calendar_events (school_id, event_date ASC) WHERE deleted_at IS NULL;

CREATE TRIGGER calendar_events_set_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

CREATE TRIGGER calendar_events_protect_identity
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_column_changes(
    'id', 'school_id', 'created_by', 'created_at');

GRANT SELECT, INSERT, UPDATE ON public.calendar_events TO authenticated;
GRANT ALL ON public.calendar_events TO service_role;

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events FORCE ROW LEVEL SECURITY;

CREATE POLICY "Read calendar events in own school" ON public.calendar_events
  FOR SELECT TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND deleted_at IS NULL);
CREATE POLICY "Create calendar events in own school" ON public.calendar_events
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
    AND (SELECT public.can_manage_students()));
CREATE POLICY "Update calendar events in own school" ON public.calendar_events
  FOR UPDATE TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND (SELECT public.can_manage_students()))
  WITH CHECK (school_id = (SELECT public.current_school_id()) AND (SELECT public.can_manage_students()));

INSERT INTO public.calendar_events (school_id, title, description, event_date, category)
SELECT school.id, seed.title, seed.description, seed.event_date, seed.category
FROM public.schools AS school
CROSS JOIN (
  VALUES
    ('Fecho de notas do 3º trimestre', 'Prazo final para lançamento de avaliações.', DATE '2025-07-12', 'deadline'),
    ('Reunião de encarregados', 'Balanço do ano lectivo com a comunidade escolar.', DATE '2025-07-18', 'meeting'),
    ('Abertura das matrículas 2025/2026', 'Início do período de matrículas do próximo ano.', DATE '2025-08-01', 'academic')
) AS seed(title, description, event_date, category)
WHERE NOT EXISTS (
  SELECT 1 FROM public.calendar_events existing
  WHERE existing.school_id = school.id AND existing.deleted_at IS NULL
);

CREATE TABLE public.school_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (title = btrim(title) AND char_length(title) BETWEEN 2 AND 160),
  body text NOT NULL CHECK (body = btrim(body) AND char_length(body) BETWEEN 2 AND 4000),
  audience text NOT NULL CHECK (
    audience IN ('all_guardians', 'guardians_with_debt', 'students_secondary',
      'students_finalists', 'teaching_staff')),
  channel text NOT NULL CHECK (channel IN ('sms', 'email', 'portal')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent')),
  scheduled_for date,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT school_announcements_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT school_announcements_schedule_required CHECK (
    (status = 'scheduled' AND scheduled_for IS NOT NULL) OR (status <> 'scheduled')),
  CONSTRAINT school_announcements_sent_published CHECK (
    (status = 'sent' AND published_at IS NOT NULL) OR (status <> 'sent'))
);

CREATE INDEX school_announcements_school_recent_idx
  ON public.school_announcements (school_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX school_announcements_school_status_idx
  ON public.school_announcements (school_id, status, created_at DESC) WHERE deleted_at IS NULL;

CREATE TRIGGER school_announcements_set_updated_at
  BEFORE UPDATE ON public.school_announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

CREATE TRIGGER school_announcements_protect_identity
  BEFORE UPDATE ON public.school_announcements
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_column_changes(
    'id', 'school_id', 'created_by', 'created_at');

GRANT SELECT, INSERT, UPDATE ON public.school_announcements TO authenticated;
GRANT ALL ON public.school_announcements TO service_role;

ALTER TABLE public.school_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_announcements FORCE ROW LEVEL SECURITY;

CREATE POLICY "Read school announcements in own school" ON public.school_announcements
  FOR SELECT TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND deleted_at IS NULL);
CREATE POLICY "Create school announcements in own school" ON public.school_announcements
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
    AND (SELECT public.can_manage_students()));
CREATE POLICY "Update school announcements in own school" ON public.school_announcements
  FOR UPDATE TO authenticated
  USING (school_id = (SELECT public.current_school_id()) AND (SELECT public.can_manage_students()))
  WITH CHECK (school_id = (SELECT public.current_school_id()) AND (SELECT public.can_manage_students()));

INSERT INTO public.school_announcements (
  school_id, title, body, audience, channel, status, published_at, scheduled_for
)
SELECT school.id, seed.title, seed.body, seed.audience, seed.channel, seed.status,
  seed.published_at, seed.scheduled_for
FROM public.schools AS school
CROSS JOIN (
  VALUES
    ('Reunião de encarregados — fecho do ano lectivo',
     'Convocamos todos os encarregados para a reunião de balanço no sábado, às 09:00, no salão principal.',
     'all_guardians', 'sms', 'sent', TIMESTAMPTZ '2025-07-10 09:00:00+01', NULL::date),
    ('Calendário de provas finais',
     'As provas finais iniciam a 20 de Julho de 2025. Consulte o calendário completo no portal.',
     'students_secondary', 'portal', 'sent', TIMESTAMPTZ '2025-07-08 12:00:00+01', NULL::date),
    ('Aviso de propinas em atraso',
     'Lembrete amigável: regularize as propinas pendentes na tesouraria até ao final da semana.',
     'guardians_with_debt', 'email', 'scheduled', NULL::timestamptz, DATE '2025-07-15'),
    ('Circular interna — reuniões de departamento',
     'Rascunho da circular sobre o calendário de reuniões pedagógicas do próximo trimestre.',
     'teaching_staff', 'email', 'draft', NULL::timestamptz, NULL::date)
) AS seed(title, body, audience, channel, status, published_at, scheduled_for)
WHERE NOT EXISTS (
  SELECT 1 FROM public.school_announcements existing
  WHERE existing.school_id = school.id AND existing.deleted_at IS NULL
);
