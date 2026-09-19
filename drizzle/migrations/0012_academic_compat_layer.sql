-- Compatibility layer: tables/columns the application expects
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS short_name text;
ALTER TABLE public.grade_levels ADD COLUMN IF NOT EXISTS sequence smallint;
ALTER TABLE public.grade_levels ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS date_of_birth date;

UPDATE public.people SET date_of_birth = birth_date WHERE date_of_birth IS NULL AND birth_date IS NOT NULL;
UPDATE public.grade_levels SET sequence = sort_order WHERE sequence IS NULL;

CREATE OR REPLACE FUNCTION public.sync_person_birth_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.date_of_birth IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth) THEN
    NEW.birth_date := NEW.date_of_birth;
  ELSIF NEW.birth_date IS NOT NULL THEN
    NEW.date_of_birth := NEW.birth_date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS people_sync_birth_date ON public.people;
CREATE TRIGGER people_sync_birth_date
  BEFORE INSERT OR UPDATE OF birth_date, date_of_birth ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.sync_person_birth_date();

CREATE TABLE IF NOT EXISTS public.academic_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, code)
);

CREATE TABLE IF NOT EXISTS public.programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_level_id uuid REFERENCES public.academic_levels(id) ON DELETE SET NULL,
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'general',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, code)
);

CREATE TABLE IF NOT EXISTS public.campuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  address text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, code)
);

ALTER TABLE public.grade_levels ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL;
ALTER TABLE public.class_groups ADD COLUMN IF NOT EXISTS campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.program_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  grade_level_id uuid REFERENCES public.grade_levels(id) ON DELETE SET NULL,
  semester smallint,
  credits numeric(6,2),
  weekly_periods smallint,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, subject_id, grade_level_id)
);

CREATE TABLE IF NOT EXISTS public.terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  name text NOT NULL,
  sequence smallint NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (academic_year_id, sequence)
);

CREATE TABLE IF NOT EXISTS public.teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  employee_number text NOT NULL,
  hired_on date,
  employment_type text NOT NULL DEFAULT 'permanent',
  highest_qualification text,
  specialty text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (school_id, employee_number),
  UNIQUE (school_id, person_id)
);

CREATE TABLE IF NOT EXISTS public.class_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_group_id uuid NOT NULL REFERENCES public.class_groups(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES public.teachers(id) ON DELETE SET NULL,
  weekly_periods smallint NOT NULL DEFAULT 2,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (class_group_id, subject_id)
);

CREATE TABLE IF NOT EXISTS public.timetable_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_subject_id uuid NOT NULL REFERENCES public.class_subjects(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  room text NOT NULL DEFAULT 'S/N',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CHECK (ends_at > starts_at),
  UNIQUE (class_subject_id, weekday, starts_at)
);

CREATE TABLE IF NOT EXISTS public.assessment_rule_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gradebooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  class_subject_id uuid NOT NULL REFERENCES public.class_subjects(id) ON DELETE CASCADE,
  class_group_id uuid NOT NULL REFERENCES public.class_groups(id) ON DELETE CASCADE,
  rule_set_id uuid REFERENCES public.assessment_rule_sets(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (term_id, class_subject_id, class_group_id)
);

CREATE TABLE IF NOT EXISTS public.grade_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  gradebook_id uuid NOT NULL REFERENCES public.gradebooks(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'score',
  weight numeric(6,2) NOT NULL DEFAULT 1,
  max_score numeric(6,2) NOT NULL DEFAULT 20,
  sequence smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (gradebook_id, code)
);

CREATE TABLE IF NOT EXISTS public.grade_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  grade_item_id uuid NOT NULL REFERENCES public.grade_items(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  score numeric(6,2) NOT NULL CHECK (score >= 0 AND score <= 20),
  status text NOT NULL DEFAULT 'draft',
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grade_item_id, enrollment_id)
);

CREATE TABLE IF NOT EXISTS public.school_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  domain text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, domain)
);

-- updated_at triggers
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'academic_levels','programs','campuses','program_subjects','terms','teachers',
    'class_subjects','timetable_slots','assessment_rule_sets','gradebooks','grade_items',
    'grade_scores','school_settings'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_set_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t || '_set_updated_at', t);
  END LOOP;
END
$$;

-- Grants + RLS scoped to school members
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'academic_levels','programs','campuses','program_subjects','terms','teachers',
    'class_subjects','timetable_slots','assessment_rule_sets','gradebooks','grade_items',
    'grade_scores','school_settings'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "School members read" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "School members read" ON public.%I FOR SELECT TO authenticated USING (public.is_school_member(school_id))',
      t);
  END LOOP;
END
$$;

-- Seed compatibility rows from the existing academic core
INSERT INTO public.academic_levels (school_id, code, name)
SELECT s.id, 'GERAL', 'Ensino Geral' FROM public.schools s
WHERE s.deleted_at IS NULL
ON CONFLICT (school_id, code) DO NOTHING;

INSERT INTO public.programs (school_id, academic_level_id, code, name, kind)
SELECT c.school_id, al.id, c.code, c.name, 'general'
FROM public.courses c
JOIN public.academic_levels al ON al.school_id = c.school_id AND al.code = 'GERAL'
WHERE c.deleted_at IS NULL
ON CONFLICT (school_id, code) DO NOTHING;

INSERT INTO public.campuses (school_id, code, name)
SELECT s.id, 'SEDE', 'Campus Principal' FROM public.schools s
WHERE s.deleted_at IS NULL
ON CONFLICT (school_id, code) DO NOTHING;

UPDATE public.grade_levels gl
SET program_id = p.id
FROM public.programs p
WHERE gl.program_id IS NULL AND p.school_id = gl.school_id;

UPDATE public.class_groups cg
SET campus_id = cp.id
FROM public.campuses cp
WHERE cg.campus_id IS NULL AND cp.school_id = cg.school_id AND cp.code = 'SEDE';

UPDATE public.subjects SET short_name = left(name, 6) WHERE short_name IS NULL;

INSERT INTO public.terms (school_id, academic_year_id, name, sequence, starts_on, ends_on)
SELECT ay.school_id, ay.id, v.name, v.seq,
       (ay.starts_on + (v.seq - 1) * interval '4 months')::date,
       (ay.starts_on + v.seq * interval '4 months' - interval '1 day')::date
FROM public.academic_years ay
CROSS JOIN (VALUES ('1º Trimestre',1),('2º Trimestre',2),('3º Trimestre',3)) AS v(name, seq)
WHERE ay.deleted_at IS NULL
ON CONFLICT (academic_year_id, sequence) DO NOTHING;

INSERT INTO public.assessment_rule_sets (school_id, name, rules, status)
SELECT s.id, 'Regra MAC/NPP/NPT', '{"components":["MAC","NPP","NPT"],"max_score":20}'::jsonb, 'active'
FROM public.schools s
WHERE s.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.assessment_rule_sets a WHERE a.school_id = s.id);
