-- Formulários públicos de candidatura a matrícula e submissões pendentes.
-- SGA: current_school_id() vem de school_memberships (ver APPLY_ENROLLMENT_AND_PREMIUM.sql).
-- Não depende de set_updated_at_and_version / reject_immutable_column_changes.

CREATE OR REPLACE FUNCTION public.current_school_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id
  FROM public.school_memberships
  WHERE user_id = (SELECT auth.uid())
    AND status = 'active'
  ORDER BY created_at ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_school_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_school_id() TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.enrollment_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  slug text NOT NULL CHECK (
    slug = btrim(slug)
    AND char_length(slug) BETWEEN 2 AND 80
    AND slug ~ '^[a-z0-9-]+$'
  ),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 120),
  subtitle text,
  hero_text text,
  accent_color text NOT NULL DEFAULT '#1d4ed8',
  logo_url text,
  is_open boolean NOT NULL DEFAULT true,
  visible_fields jsonb NOT NULL DEFAULT '["birth_date","sex","phone_primary","email","guardian_name","guardian_phone","guardian_relationship"]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT enrollment_forms_school_id_id_key UNIQUE (school_id, id)
);

CREATE UNIQUE INDEX enrollment_forms_slug_idx
  ON public.enrollment_forms (slug)
  WHERE deleted_at IS NULL;

CREATE INDEX enrollment_forms_school_idx
  ON public.enrollment_forms (school_id)
  WHERE deleted_at IS NULL;

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

CREATE TRIGGER enrollment_forms_set_updated_at
  BEFORE UPDATE ON public.enrollment_forms
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.enrollment_forms TO authenticated;
GRANT SELECT ON public.enrollment_forms TO anon;
GRANT ALL ON public.enrollment_forms TO service_role;

ALTER TABLE public.enrollment_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_forms FORCE ROW LEVEL SECURITY;

CREATE POLICY "Read enrollment forms in own school"
  ON public.enrollment_forms
  FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND deleted_at IS NULL
  );

CREATE POLICY "Public read open enrollment forms"
  ON public.enrollment_forms
  FOR SELECT TO anon
  USING (is_open = true AND deleted_at IS NULL);

CREATE POLICY "Manage enrollment forms in own school"
  ON public.enrollment_forms
  FOR ALL TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND deleted_at IS NULL
  )
  WITH CHECK (school_id = (SELECT public.current_school_id()));

CREATE TABLE IF NOT EXISTS public.enrollment_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES public.enrollment_forms(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  decided_at timestamptz,
  decided_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX enrollment_applications_school_status_idx
  ON public.enrollment_applications (school_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TRIGGER enrollment_applications_set_updated_at
  BEFORE UPDATE ON public.enrollment_applications
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.enrollment_applications TO authenticated;
GRANT INSERT ON public.enrollment_applications TO anon;
GRANT ALL ON public.enrollment_applications TO service_role;

ALTER TABLE public.enrollment_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_applications FORCE ROW LEVEL SECURITY;

CREATE POLICY "Read enrollment applications in own school"
  ON public.enrollment_applications
  FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND deleted_at IS NULL
  );

CREATE POLICY "Update enrollment applications in own school"
  ON public.enrollment_applications
  FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND deleted_at IS NULL
  )
  WITH CHECK (school_id = (SELECT public.current_school_id()));

CREATE POLICY "Public insert open enrollment applications"
  ON public.enrollment_applications
  FOR INSERT TO anon
  WITH CHECK (
    status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.enrollment_forms forms
      WHERE forms.id = form_id
        AND forms.school_id = school_id
        AND forms.is_open = true
        AND forms.deleted_at IS NULL
    )
  );
