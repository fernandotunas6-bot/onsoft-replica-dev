-- Calendário lectivo: marcos e eventos visíveis a toda a escola,
-- com escrita reservada a Administrador e Secretaria.

CREATE TABLE public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (
    title = btrim(title) AND char_length(title) BETWEEN 2 AND 160
  ),
  description text,
  event_date date NOT NULL,
  ends_on date,
  category text NOT NULL DEFAULT 'general' CHECK (
    category IN ('academic', 'meeting', 'deadline', 'holiday', 'general')
  ),
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
  ON public.calendar_events (school_id, event_date ASC)
  WHERE deleted_at IS NULL;

CREATE TRIGGER calendar_events_set_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

CREATE TRIGGER calendar_events_protect_identity
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_column_changes(
    'id', 'school_id', 'created_by', 'created_at'
  );

GRANT SELECT, INSERT, UPDATE ON public.calendar_events TO authenticated;
GRANT ALL ON public.calendar_events TO service_role;

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events FORCE ROW LEVEL SECURITY;

CREATE POLICY "Read calendar events in own school"
  ON public.calendar_events
  FOR SELECT TO authenticated
  USING (
    public.is_school_member(school_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "Create calendar events in own school"
  ON public.calendar_events
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_school_member(school_id)
    AND created_by = (SELECT auth.uid())
    AND (SELECT public.can_manage_students())
  );

CREATE POLICY "Update calendar events in own school"
  ON public.calendar_events
  FOR UPDATE TO authenticated
  USING (
    public.is_school_member(school_id)
    AND (SELECT public.can_manage_students())
  )
  WITH CHECK (
    public.is_school_member(school_id)
    AND (SELECT public.can_manage_students())
  );

INSERT INTO public.calendar_events (school_id, title, description, event_date, category)
SELECT
  school.id,
  seed.title,
  seed.description,
  seed.event_date,
  seed.category
FROM public.schools AS school
CROSS JOIN (
  VALUES
    (
      'Fecho de notas do 3º trimestre',
      'Prazo final para lançamento de avaliações.',
      DATE '2025-07-12',
      'deadline'
    ),
    (
      'Reunião de encarregados',
      'Balanço do ano lectivo com a comunidade escolar.',
      DATE '2025-07-18',
      'meeting'
    ),
    (
      'Abertura das matrículas 2025/2026',
      'Início do período de matrículas do próximo ano.',
      DATE '2025-08-01',
      'academic'
    )
) AS seed(title, description, event_date, category)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.calendar_events existing
  WHERE existing.school_id = school.id
    AND existing.deleted_at IS NULL
);
-- Comunicados institucionais da escola.
-- Leitura: utilizadores autenticados da mesma escola.
-- Escrita: Administrador e Secretaria (can_manage_students).
-- Nota: o registo persiste o comunicado; canais SMS/e-mail externos
-- ficam fora deste schema até haver integração de envio.

CREATE TABLE public.school_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (
    title = btrim(title) AND char_length(title) BETWEEN 2 AND 160
  ),
  body text NOT NULL CHECK (
    body = btrim(body) AND char_length(body) BETWEEN 2 AND 4000
  ),
  audience text NOT NULL CHECK (
    audience IN (
      'all_guardians',
      'guardians_with_debt',
      'students_secondary',
      'students_finalists',
      'teaching_staff'
    )
  ),
  channel text NOT NULL CHECK (channel IN ('sms', 'email', 'portal')),
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'scheduled', 'sent')
  ),
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
    (status = 'scheduled' AND scheduled_for IS NOT NULL)
    OR (status <> 'scheduled')
  ),
  CONSTRAINT school_announcements_sent_published CHECK (
    (status = 'sent' AND published_at IS NOT NULL)
    OR (status <> 'sent')
  )
);

CREATE INDEX school_announcements_school_recent_idx
  ON public.school_announcements (school_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX school_announcements_school_status_idx
  ON public.school_announcements (school_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TRIGGER school_announcements_set_updated_at
  BEFORE UPDATE ON public.school_announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

CREATE TRIGGER school_announcements_protect_identity
  BEFORE UPDATE ON public.school_announcements
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_column_changes(
    'id', 'school_id', 'created_by', 'created_at'
  );

GRANT SELECT, INSERT, UPDATE ON public.school_announcements TO authenticated;
GRANT ALL ON public.school_announcements TO service_role;

ALTER TABLE public.school_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_announcements FORCE ROW LEVEL SECURITY;

CREATE POLICY "Read school announcements in own school"
  ON public.school_announcements
  FOR SELECT TO authenticated
  USING (
    public.is_school_member(school_id)
    AND deleted_at IS NULL
  );

CREATE POLICY "Create school announcements in own school"
  ON public.school_announcements
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_school_member(school_id)
    AND created_by = (SELECT auth.uid())
    AND (SELECT public.can_manage_students())
  );

CREATE POLICY "Update school announcements in own school"
  ON public.school_announcements
  FOR UPDATE TO authenticated
  USING (
    public.is_school_member(school_id)
    AND (SELECT public.can_manage_students())
  )
  WITH CHECK (
    public.is_school_member(school_id)
    AND (SELECT public.can_manage_students())
  );

INSERT INTO public.school_announcements (
  school_id,
  title,
  body,
  audience,
  channel,
  status,
  published_at,
  scheduled_for
)
SELECT
  school.id,
  seed.title,
  seed.body,
  seed.audience,
  seed.channel,
  seed.status,
  seed.published_at,
  seed.scheduled_for
FROM public.schools AS school
CROSS JOIN (
  VALUES
    (
      'Reunião de encarregados — fecho do ano lectivo',
      'Convocamos todos os encarregados para a reunião de balanço no sábado, às 09:00, no salão principal.',
      'all_guardians',
      'sms',
      'sent',
      TIMESTAMPTZ '2025-07-10 09:00:00+01',
      NULL::date
    ),
    (
      'Calendário de provas finais',
      'As provas finais iniciam a 20 de Julho de 2025. Consulte o calendário completo no portal.',
      'students_secondary',
      'portal',
      'sent',
      TIMESTAMPTZ '2025-07-08 12:00:00+01',
      NULL::date
    ),
    (
      'Aviso de propinas em atraso',
      'Lembrete amigável: regularize as propinas pendentes na tesouraria até ao final da semana.',
      'guardians_with_debt',
      'email',
      'scheduled',
      NULL::timestamptz,
      DATE '2025-07-15'
    ),
    (
      'Circular interna — reuniões de departamento',
      'Rascunho da circular sobre o calendário de reuniões pedagógicas do próximo trimestre.',
      'teaching_staff',
      'email',
      'draft',
      NULL::timestamptz,
      NULL::date
    )
) AS seed(
  title,
  body,
  audience,
  channel,
  status,
  published_at,
  scheduled_for
)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.school_announcements existing
  WHERE existing.school_id = school.id
    AND existing.deleted_at IS NULL
);
-- Disciplinas escolares e lançamento de notas trimestrais (MAC / NPP / NPT).
-- Autorização alinhada ao módulo académico: Administrador e Secretaria.

CREATE TABLE public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (
    code = btrim(code) AND char_length(code) BETWEEN 1 AND 40
  ),
  name text NOT NULL CHECK (
    name = btrim(name) AND char_length(name) BETWEEN 2 AND 120
  ),
  teacher_name text CHECK (
    teacher_name IS NULL
    OR (teacher_name = btrim(teacher_name) AND char_length(teacher_name) BETWEEN 2 AND 160)
  ),
  weekly_hours smallint NOT NULL DEFAULT 4 CHECK (weekly_hours BETWEEN 1 AND 20),
  grade_from smallint CHECK (grade_from IS NULL OR grade_from BETWEEN 1 AND 99),
  grade_to smallint CHECK (grade_to IS NULL OR grade_to BETWEEN 1 AND 99),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT subjects_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT subjects_school_code_key UNIQUE (school_id, code),
  CONSTRAINT subjects_grade_range_valid CHECK (
    grade_from IS NULL
    OR grade_to IS NULL
    OR grade_from <= grade_to
  )
);

CREATE INDEX subjects_school_active_idx
  ON public.subjects (school_id, name)
  WHERE deleted_at IS NULL AND status = 'active';

CREATE TABLE public.term_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  term smallint NOT NULL CHECK (term IN (1, 2, 3)),
  mac numeric(4,2) NOT NULL CHECK (mac BETWEEN 0 AND 20),
  npp numeric(4,2) NOT NULL CHECK (npp BETWEEN 0 AND 20),
  npt numeric(4,2) NOT NULL CHECK (npt BETWEEN 0 AND 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT term_grades_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT term_grades_enrollment_fkey
    FOREIGN KEY (school_id, enrollment_id)
    REFERENCES public.enrollments (school_id, id),
  CONSTRAINT term_grades_subject_fkey
    FOREIGN KEY (school_id, subject_id)
    REFERENCES public.subjects (school_id, id),
  CONSTRAINT term_grades_enrollment_subject_term_key
    UNIQUE (enrollment_id, subject_id, term)
);

CREATE INDEX term_grades_school_recent_idx
  ON public.term_grades (school_id, updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX term_grades_subject_idx
  ON public.term_grades (school_id, subject_id)
  WHERE deleted_at IS NULL;
CREATE INDEX term_grades_enrollment_idx
  ON public.term_grades (school_id, enrollment_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER subjects_set_updated_at
  BEFORE UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

CREATE TRIGGER term_grades_set_updated_at
  BEFORE UPDATE ON public.term_grades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

CREATE TRIGGER subjects_protect_identity
  BEFORE UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_column_changes(
    'id', 'school_id', 'created_by', 'created_at'
  );

CREATE TRIGGER term_grades_protect_identity
  BEFORE UPDATE ON public.term_grades
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_column_changes(
    'id', 'school_id', 'enrollment_id', 'subject_id', 'term', 'created_by', 'created_at'
  );

GRANT SELECT, INSERT, UPDATE ON public.subjects, public.term_grades TO authenticated;
GRANT ALL ON public.subjects, public.term_grades TO service_role;

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects FORCE ROW LEVEL SECURITY;
ALTER TABLE public.term_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.term_grades FORCE ROW LEVEL SECURITY;

CREATE POLICY "Read subjects in own school"
  ON public.subjects
  FOR SELECT TO authenticated
  USING (
    public.is_school_member(school_id)
    AND deleted_at IS NULL
    AND (SELECT public.can_read_students())
  );

CREATE POLICY "Create subjects in own school"
  ON public.subjects
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_school_member(school_id)
    AND created_by = (SELECT auth.uid())
    AND (SELECT public.can_manage_students())
  );

CREATE POLICY "Update subjects in own school"
  ON public.subjects
  FOR UPDATE TO authenticated
  USING (
    public.is_school_member(school_id)
    AND (SELECT public.can_manage_students())
  )
  WITH CHECK (
    public.is_school_member(school_id)
    AND (SELECT public.can_manage_students())
  );

CREATE POLICY "Read term grades in own school"
  ON public.term_grades
  FOR SELECT TO authenticated
  USING (
    public.is_school_member(school_id)
    AND deleted_at IS NULL
    AND (SELECT public.can_read_students())
  );

CREATE POLICY "Create term grades in own school"
  ON public.term_grades
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_school_member(school_id)
    AND created_by = (SELECT auth.uid())
    AND (SELECT public.can_manage_students())
  );

CREATE POLICY "Update term grades in own school"
  ON public.term_grades
  FOR UPDATE TO authenticated
  USING (
    public.is_school_member(school_id)
    AND (SELECT public.can_manage_students())
  )
  WITH CHECK (
    public.is_school_member(school_id)
    AND (SELECT public.can_manage_students())
  );

INSERT INTO public.subjects (
  school_id,
  code,
  name,
  teacher_name,
  weekly_hours,
  grade_from,
  grade_to
)
SELECT
  school.id,
  seed.code,
  seed.name,
  seed.teacher_name,
  seed.weekly_hours,
  seed.grade_from,
  seed.grade_to
FROM public.schools AS school
CROSS JOIN (
  VALUES
    ('MAT', 'Matemática', 'Prof. Manuel Sousa', 6::smallint, 7::smallint, 13::smallint),
    ('LP', 'Língua Portuguesa', 'Prof.ª Teresa Lopes', 6::smallint, 7::smallint, 13::smallint),
    ('FIS', 'Física', 'Prof.ª Julieta Bento', 4::smallint, 10::smallint, 13::smallint),
    ('BIO', 'Biologia', 'Prof. Adão Neto', 4::smallint, 7::smallint, 13::smallint),
    ('HIS', 'História', 'Prof. Nelson Cabral', 3::smallint, 7::smallint, 11::smallint),
    ('PROG', 'Programação', 'Prof. Edgar Pinto', 8::smallint, 12::smallint, 13::smallint)
) AS seed(code, name, teacher_name, weekly_hours, grade_from, grade_to)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.subjects existing
  WHERE existing.school_id = school.id
    AND existing.deleted_at IS NULL
);
-- Horário semanal por turma (slots Segunda–Sexta).
-- Autorização alinhada ao módulo académico: Administrador e Secretaria.

CREATE TABLE public.class_schedule_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_group_id uuid NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 5),
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  subject_id uuid,
  label text CHECK (
    label IS NULL
    OR (label = btrim(label) AND char_length(label) BETWEEN 1 AND 120)
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT class_schedule_slots_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT class_schedule_slots_group_fkey
    FOREIGN KEY (school_id, class_group_id)
    REFERENCES public.class_groups (school_id, id),
  CONSTRAINT class_schedule_slots_subject_fkey
    FOREIGN KEY (school_id, subject_id)
    REFERENCES public.subjects (school_id, id),
  CONSTRAINT class_schedule_slots_time_valid CHECK (ends_at > starts_at),
  CONSTRAINT class_schedule_slots_content_present CHECK (
    subject_id IS NOT NULL OR label IS NOT NULL
  ),
  CONSTRAINT class_schedule_slots_unique_cell
    UNIQUE (class_group_id, weekday, starts_at)
);

CREATE INDEX class_schedule_slots_group_idx
  ON public.class_schedule_slots (school_id, class_group_id, weekday, starts_at)
  WHERE deleted_at IS NULL;

CREATE TRIGGER class_schedule_slots_set_updated_at
  BEFORE UPDATE ON public.class_schedule_slots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

CREATE TRIGGER class_schedule_slots_protect_identity
  BEFORE UPDATE ON public.class_schedule_slots
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_column_changes(
    'id', 'school_id', 'class_group_id', 'created_by', 'created_at'
  );

GRANT SELECT, INSERT, UPDATE ON public.class_schedule_slots TO authenticated;
GRANT ALL ON public.class_schedule_slots TO service_role;

ALTER TABLE public.class_schedule_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_schedule_slots FORCE ROW LEVEL SECURITY;

CREATE POLICY "Read class schedule slots in own school"
  ON public.class_schedule_slots
  FOR SELECT TO authenticated
  USING (
    public.is_school_member(school_id)
    AND deleted_at IS NULL
    AND (SELECT public.can_read_students())
  );

CREATE POLICY "Create class schedule slots in own school"
  ON public.class_schedule_slots
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_school_member(school_id)
    AND created_by = (SELECT auth.uid())
    AND (SELECT public.can_manage_students())
  );

CREATE POLICY "Update class schedule slots in own school"
  ON public.class_schedule_slots
  FOR UPDATE TO authenticated
  USING (
    public.is_school_member(school_id)
    AND (SELECT public.can_manage_students())
  )
  WITH CHECK (
    public.is_school_member(school_id)
    AND (SELECT public.can_manage_students())
  );

-- Seed a sample morning timetable for the first active class group of each school,
-- using existing subjects when available.
INSERT INTO public.class_schedule_slots (
  school_id,
  class_group_id,
  weekday,
  starts_at,
  ends_at,
  subject_id,
  label
)
SELECT
  group_row.school_id,
  group_row.id,
  seed.weekday,
  seed.starts_at::time,
  seed.ends_at::time,
  subject_row.id,
  CASE WHEN subject_row.id IS NULL THEN seed.fallback_label ELSE NULL END
FROM (
  SELECT DISTINCT ON (school_id)
    id,
    school_id
  FROM public.class_groups
  WHERE deleted_at IS NULL AND status = 'active'
  ORDER BY school_id, name
) AS group_row
CROSS JOIN (
  VALUES
    (1, '07:30', '08:20', 'MAT', NULL::text),
    (2, '07:30', '08:20', 'LP', NULL::text),
    (3, '07:30', '08:20', 'BIO', NULL::text),
    (4, '07:30', '08:20', 'MAT', NULL::text),
    (5, '07:30', '08:20', 'HIS', NULL::text),
    (1, '08:20', '09:10', 'MAT', NULL::text),
    (2, '08:20', '09:10', 'LP', NULL::text),
    (3, '08:20', '09:10', 'BIO', NULL::text),
    (4, '08:20', '09:10', 'FIS', NULL::text),
    (5, '08:20', '09:10', 'HIS', NULL::text),
    (1, '09:30', '10:20', 'FIS', NULL::text),
    (2, '09:30', '10:20', 'HIS', NULL::text),
    (3, '09:30', '10:20', 'LP', NULL::text),
    (4, '09:30', '10:20', 'FIS', NULL::text),
    (5, '09:30', '10:20', NULL, 'Ed. Física'),
    (1, '10:20', '11:10', 'BIO', NULL::text),
    (2, '10:20', '11:10', 'MAT', NULL::text),
    (3, '10:20', '11:10', 'PROG', NULL::text),
    (4, '10:20', '11:10', 'LP', NULL::text),
    (5, '10:20', '11:10', NULL, 'Ed. Física'),
    (1, '11:20', '12:10', 'PROG', NULL::text),
    (2, '11:20', '12:10', NULL, 'Ed. Moral'),
    (3, '11:20', '12:10', 'PROG', NULL::text),
    (4, '11:20', '12:10', NULL, 'Geografia'),
    (5, '11:20', '12:10', NULL, 'Direcção de turma')
) AS seed(weekday, starts_at, ends_at, subject_code, fallback_label)
LEFT JOIN public.subjects AS subject_row
  ON subject_row.school_id = group_row.school_id
 AND subject_row.code = seed.subject_code
 AND subject_row.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM public.class_schedule_slots existing
  WHERE existing.class_group_id = group_row.id
    AND existing.deleted_at IS NULL
)
AND (subject_row.id IS NOT NULL OR seed.fallback_label IS NOT NULL);
