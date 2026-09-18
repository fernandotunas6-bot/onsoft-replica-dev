CREATE INDEX audit_logs_school_recent_idx
  ON public.audit_logs (school_id, created_at DESC);

ALTER TABLE public.schools
  ADD COLUMN director_name text,
  ADD COLUMN evaluation_periods smallint NOT NULL DEFAULT 3,
  ADD COLUMN passing_grade numeric(4,2) NOT NULL DEFAULT 10,
  ADD COLUMN preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT schools_director_name_valid CHECK (
    director_name IS NULL
    OR (director_name = btrim(director_name) AND char_length(director_name) BETWEEN 3 AND 120)
  ),
  ADD CONSTRAINT schools_evaluation_periods_valid CHECK (evaluation_periods BETWEEN 2 AND 4),
  ADD CONSTRAINT schools_passing_grade_valid CHECK (passing_grade BETWEEN 0 AND 20),
  ADD CONSTRAINT schools_preferences_object CHECK (jsonb_typeof(preferences) = 'object');

REVOKE INSERT, UPDATE, DELETE ON public.schools FROM authenticated;
GRANT UPDATE (
  name, short_name, nif, email, phone, address, academic_year, currency,
  director_name, evaluation_periods, passing_grade, preferences
) ON public.schools TO authenticated;

CREATE POLICY "Administrators can update their own school"
  ON public.schools
  FOR UPDATE
  TO authenticated
  USING (
    public.is_school_member(id)
    AND (SELECT public.current_profile_role()) = 'Administrador'
  )
  WITH CHECK (
    public.is_school_member(id)
    AND (SELECT public.current_profile_role()) = 'Administrador'
  );

CREATE OR REPLACE FUNCTION private.audit_school_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := (SELECT auth.uid());
  changed_fields text[];
BEGIN
  IF actor IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT public.is_school_member(NEW.id) THEN
    RAISE EXCEPTION 'cannot audit a school outside the current profile'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(entry.key ORDER BY entry.key), ARRAY[]::text[])
  INTO changed_fields
  FROM jsonb_each(to_jsonb(NEW)) AS entry
  WHERE to_jsonb(OLD) -> entry.key IS DISTINCT FROM entry.value;

  INSERT INTO public.audit_logs (
    school_id, actor_id, action, entity_type, entity_id, after_data
  )
  VALUES (
    NEW.id, actor, 'schools.update', 'schools', NEW.id,
    jsonb_build_object(
      'version', to_jsonb(NEW.version),
      'changed_fields', to_jsonb(changed_fields)
    )
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.audit_school_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER schools_audit_change
  AFTER UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION private.audit_school_change();

CREATE TABLE public.school_billing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,
  due_day smallint NOT NULL DEFAULT 10 CHECK (due_day BETWEEN 1 AND 28),
  late_fee_percent numeric(5,2) NOT NULL DEFAULT 2 CHECK (late_fee_percent BETWEEN 0 AND 100),
  grace_days smallint NOT NULL DEFAULT 5 CHECK (grace_days BETWEEN 0 AND 60),
  sibling_discount_percent numeric(5,2) NOT NULL DEFAULT 10
    CHECK (sibling_discount_percent BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1
);

INSERT INTO public.school_billing_settings (school_id)
SELECT id FROM public.schools
ON CONFLICT (school_id) DO NOTHING;

CREATE TRIGGER school_billing_settings_set_updated_at
  BEFORE UPDATE ON public.school_billing_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

CREATE TRIGGER school_billing_settings_audit
  AFTER UPDATE ON public.school_billing_settings
  FOR EACH ROW EXECUTE FUNCTION private.audit_domain_change();

GRANT SELECT ON public.school_billing_settings TO authenticated;
GRANT UPDATE (due_day, late_fee_percent, grace_days, sibling_discount_percent)
  ON public.school_billing_settings TO authenticated;
GRANT ALL ON public.school_billing_settings TO service_role;
ALTER TABLE public.school_billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_billing_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY "Finance roles can read billing settings"
  ON public.school_billing_settings FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  );

CREATE POLICY "Finance roles can update billing settings"
  ON public.school_billing_settings FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  );

CREATE OR REPLACE FUNCTION private.reject_immutable_column_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  column_name text;
BEGIN
  FOREACH column_name IN ARRAY TG_ARGV LOOP
    IF (to_jsonb(NEW) -> column_name) IS DISTINCT FROM (to_jsonb(OLD) -> column_name) THEN
      RAISE EXCEPTION 'column %.% is immutable', TG_TABLE_NAME, column_name
        USING ERRCODE = '22000';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.reject_immutable_column_changes()
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'attachments','people','person_documents','person_roles','person_relationships',
    'person_school_links','academic_years','courses','grade_levels','rooms','students',
    'student_guardians','class_groups','enrollments','school_billing_settings'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_column_changes('
      || quote_literal('id') || ', '
      || quote_literal('school_id') || ', '
      || quote_literal('created_at') || ', '
      || quote_literal('created_by') || ')',
      table_name || '_protect_identity',
      table_name
    );
  END LOOP;
END;
$$;

CREATE INDEX profiles_school_id_idx ON public.profiles (school_id);
CREATE INDEX attachments_school_id_idx ON public.attachments (school_id);
CREATE INDEX person_documents_school_person_idx
  ON public.person_documents (school_id, person_id);
CREATE INDEX person_roles_school_person_idx
  ON public.person_roles (school_id, person_id);
CREATE INDEX person_relationships_school_person_idx
  ON public.person_relationships (school_id, person_id);
CREATE INDEX person_relationships_school_related_idx
  ON public.person_relationships (school_id, related_person_id);
CREATE INDEX student_guardians_school_student_idx
  ON public.student_guardians (school_id, student_id);
CREATE INDEX enrollments_school_student_idx
  ON public.enrollments (school_id, student_id);
CREATE INDEX enrollments_school_year_idx
  ON public.enrollments (school_id, academic_year_id);
