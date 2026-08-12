-- Typed, reusable settings that belong to the school itself. Preferences stay
-- extensible without turning core academic rules into unvalidated JSON.
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
  name,
  short_name,
  nif,
  email,
  phone,
  address,
  academic_year,
  currency,
  director_name,
  evaluation_periods,
  passing_grade,
  preferences
) ON public.schools TO authenticated;

CREATE POLICY "Administrators can update their own school"
  ON public.schools
  FOR UPDATE
  TO authenticated
  USING (
    id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) = 'Administrador'
  )
  WITH CHECK (
    id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) = 'Administrador'
  );

COMMENT ON COLUMN public.schools.preferences IS
  'Non-secret, school-wide UI/workflow preferences. Authorization roles and credentials never belong here.';

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
  IF NEW.id IS DISTINCT FROM (SELECT public.current_school_id()) THEN
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
    NEW.id,
    actor,
    'schools.update',
    'schools',
    NEW.id,
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
