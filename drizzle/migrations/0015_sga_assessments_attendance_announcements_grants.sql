CREATE OR REPLACE FUNCTION public.has_school_permission(p_school_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.school_memberships sm
    JOIN public.member_roles mr ON mr.membership_id = sm.id
    JOIN public.roles r ON r.id = mr.role_id
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE sm.school_id = p_school_id
      AND sm.user_id = (SELECT auth.uid())
      AND sm.status = 'active'
      AND p.code = p_permission
  ) OR EXISTS (
    SELECT 1
    FROM public.school_memberships sm
    JOIN public.member_roles mr ON mr.membership_id = sm.id
    JOIN public.roles r ON r.id = mr.role_id
    WHERE sm.school_id = p_school_id
      AND sm.user_id = (SELECT auth.uid())
      AND sm.status = 'active'
      AND r.code IN ('owner', 'admin', 'administrator', 'director')
  );
$$;

REVOKE ALL ON FUNCTION public.has_school_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_school_permission(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.siga_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

ALTER TABLE public.class_groups
  ADD COLUMN IF NOT EXISTS whatsapp_invite_url text,
  ADD COLUMN IF NOT EXISTS whatsapp_group_name text;

CREATE TABLE IF NOT EXISTS public.staff_module_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  level text NOT NULL CHECK (level IN ('Nenhum', 'Leitura', 'Escrita', 'Total')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  UNIQUE (school_id, user_id, module_key)
);

CREATE INDEX IF NOT EXISTS staff_module_grants_user_idx
  ON public.staff_module_grants (school_id, user_id);

ALTER TABLE public.staff_module_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_module_grants FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_module_grants TO authenticated;
GRANT ALL ON public.staff_module_grants TO service_role;

DROP POLICY IF EXISTS "Read own or admin staff grants" ON public.staff_module_grants;
CREATE POLICY "Read own or admin staff grants"
  ON public.staff_module_grants
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

DROP POLICY IF EXISTS "Admins manage staff grants" ON public.staff_module_grants;
CREATE POLICY "Admins manage staff grants"
  ON public.staff_module_grants
  FOR ALL TO authenticated
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

DROP TRIGGER IF EXISTS staff_module_grants_set_updated_at ON public.staff_module_grants;
CREATE TRIGGER staff_module_grants_set_updated_at
  BEFORE UPDATE ON public.staff_module_grants
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.calendar_feed_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, user_id)
);

ALTER TABLE public.calendar_feed_tokens ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.calendar_feed_tokens TO authenticated;
GRANT ALL ON public.calendar_feed_tokens TO service_role;

DROP POLICY IF EXISTS "Read own calendar feed token" ON public.calendar_feed_tokens;
CREATE POLICY "Read own calendar feed token"
  ON public.calendar_feed_tokens
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.siga_assessment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_group_id uuid,
  subject_id uuid,
  term integer NOT NULL CHECK (term BETWEEN 1 AND 3),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'teste',
  component text NOT NULL DEFAULT 'NPP',
  assessed_on date,
  max_score numeric NOT NULL DEFAULT 20,
  counts_toward_pauta boolean NOT NULL DEFAULT true,
  allow_recovery boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.siga_assessment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_assessment_items FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.siga_assessment_items TO authenticated;
GRANT ALL ON public.siga_assessment_items TO service_role;

DROP POLICY IF EXISTS "Manage assessment items in own school" ON public.siga_assessment_items;
CREATE POLICY "Manage assessment items in own school"
  ON public.siga_assessment_items
  FOR ALL TO authenticated
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

CREATE TABLE IF NOT EXISTS public.siga_assessment_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.siga_assessment_items(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL,
  score numeric,
  previous_score numeric,
  status text NOT NULL DEFAULT 'draft',
  recorded_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, enrollment_id)
);

ALTER TABLE public.siga_assessment_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_assessment_scores FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.siga_assessment_scores TO authenticated;
GRANT ALL ON public.siga_assessment_scores TO service_role;

DROP POLICY IF EXISTS "Manage assessment scores in own school" ON public.siga_assessment_scores;
CREATE POLICY "Manage assessment scores in own school"
  ON public.siga_assessment_scores
  FOR ALL TO authenticated
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'school',
  channel text NOT NULL DEFAULT 'portal',
  status text NOT NULL DEFAULT 'draft',
  scheduled_for date,
  published_at timestamptz,
  archived_at timestamptz,
  priority text NOT NULL DEFAULT 'normal',
  role_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.announcements DROP CONSTRAINT IF EXISTS announcements_title_check;
ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_title_check
  CHECK (title = btrim(title) AND char_length(title) BETWEEN 2 AND 160);

ALTER TABLE public.announcements DROP CONSTRAINT IF EXISTS announcements_body_check;
ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_body_check
  CHECK (body = btrim(body) AND char_length(body) BETWEEN 2 AND 4000);

ALTER TABLE public.announcements DROP CONSTRAINT IF EXISTS announcements_audience_check;
ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_audience_check CHECK (audience IN ('school'));

ALTER TABLE public.announcements DROP CONSTRAINT IF EXISTS announcements_channel_check;
ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_channel_check CHECK (channel IN ('sms', 'email', 'portal'));

ALTER TABLE public.announcements DROP CONSTRAINT IF EXISTS announcements_status_check;
ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_status_check CHECK (status IN ('draft', 'scheduled', 'published', 'archived'));

ALTER TABLE public.announcements DROP CONSTRAINT IF EXISTS announcements_scheduled_for_check;
ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_scheduled_for_check
  CHECK (status <> 'scheduled' OR scheduled_for IS NOT NULL);

CREATE INDEX IF NOT EXISTS announcements_school_created_idx
  ON public.announcements (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS announcements_school_status_schedule_idx
  ON public.announcements (school_id, status, scheduled_for)
  WHERE status IN ('scheduled', 'published');

DROP TRIGGER IF EXISTS announcements_set_updated_at ON public.announcements;
CREATE TRIGGER announcements_set_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.announcements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;

DROP POLICY IF EXISTS "Read school announcements" ON public.announcements;
CREATE POLICY "Read school announcements"
  ON public.announcements
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

CREATE TABLE IF NOT EXISTS public.siga_attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  class_group_id uuid NOT NULL REFERENCES public.class_groups(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES public.teachers(id) ON DELETE SET NULL,
  timetable_slot_id uuid REFERENCES public.timetable_slots(id) ON DELETE SET NULL,
  lesson_date date NOT NULL DEFAULT CURRENT_DATE,
  period_number integer NOT NULL DEFAULT 1,
  starts_at text,
  ends_at text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS siga_attendance_sessions_school_class_date_idx
  ON public.siga_attendance_sessions (school_id, class_group_id, lesson_date DESC);
CREATE INDEX IF NOT EXISTS siga_attendance_sessions_teacher_date_idx
  ON public.siga_attendance_sessions (school_id, teacher_id, lesson_date DESC);

ALTER TABLE public.siga_attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_attendance_sessions FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.siga_attendance_sessions TO authenticated;
GRANT ALL ON public.siga_attendance_sessions TO service_role;

DROP POLICY IF EXISTS "Manage attendance sessions in own school" ON public.siga_attendance_sessions;
CREATE POLICY "Manage attendance sessions in own school"
  ON public.siga_attendance_sessions
  FOR ALL TO authenticated
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

CREATE TABLE IF NOT EXISTS public.siga_attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.siga_attendance_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_registered' CHECK (status IN ('present', 'absent', 'excused', 'late', 'early_exit', 'not_registered')),
  notes text,
  recorded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS siga_attendance_records_student_idx
  ON public.siga_attendance_records (school_id, student_id, created_at DESC);

ALTER TABLE public.siga_attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_attendance_records FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.siga_attendance_records TO authenticated;
GRANT ALL ON public.siga_attendance_records TO service_role;

DROP POLICY IF EXISTS "Manage attendance records in own school" ON public.siga_attendance_records;
CREATE POLICY "Manage attendance records in own school"
  ON public.siga_attendance_records
  FOR ALL TO authenticated
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

CREATE TABLE IF NOT EXISTS public.siga_attendance_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.siga_attendance_sessions(id) ON DELETE CASCADE,
  attendance_record_id uuid REFERENCES public.siga_attendance_records(id) ON DELETE SET NULL,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  old_status text NOT NULL,
  new_status text NOT NULL,
  reason text NOT NULL,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  device_info text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS siga_attendance_audits_session_idx
  ON public.siga_attendance_audits (school_id, session_id, created_at DESC);

ALTER TABLE public.siga_attendance_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_attendance_audits FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.siga_attendance_audits TO authenticated;
GRANT ALL ON public.siga_attendance_audits TO service_role;

DROP POLICY IF EXISTS "Read attendance audits in own school" ON public.siga_attendance_audits;
CREATE POLICY "Read attendance audits in own school"
  ON public.siga_attendance_audits
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

CREATE TABLE IF NOT EXISTS public.siga_attendance_justifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  attendance_record_id uuid REFERENCES public.siga_attendance_records(id) ON DELETE SET NULL,
  session_id uuid REFERENCES public.siga_attendance_sessions(id) ON DELETE SET NULL,
  reason text NOT NULL,
  file_id uuid,
  file_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_by uuid NOT NULL REFERENCES auth.users(id),
  reviewed_by uuid REFERENCES auth.users(id),
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS siga_attendance_justifications_student_idx
  ON public.siga_attendance_justifications (school_id, student_id, created_at DESC);

ALTER TABLE public.siga_attendance_justifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_attendance_justifications FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.siga_attendance_justifications TO authenticated;
GRANT ALL ON public.siga_attendance_justifications TO service_role;

DROP POLICY IF EXISTS "Manage attendance justifications in own school" ON public.siga_attendance_justifications;
CREATE POLICY "Manage attendance justifications in own school"
  ON public.siga_attendance_justifications
  FOR ALL TO authenticated
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));