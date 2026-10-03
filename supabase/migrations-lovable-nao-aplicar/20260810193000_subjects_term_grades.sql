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
    school_id = (SELECT public.current_school_id())
    AND deleted_at IS NULL
    AND (SELECT public.can_read_students())
  );

CREATE POLICY "Create subjects in own school"
  ON public.subjects
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
    AND (SELECT public.can_manage_students())
  );

CREATE POLICY "Update subjects in own school"
  ON public.subjects
  FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.can_manage_students())
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.can_manage_students())
  );

CREATE POLICY "Read term grades in own school"
  ON public.term_grades
  FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND deleted_at IS NULL
    AND (SELECT public.can_read_students())
  );

CREATE POLICY "Create term grades in own school"
  ON public.term_grades
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
    AND (SELECT public.can_manage_students())
  );

CREATE POLICY "Update term grades in own school"
  ON public.term_grades
  FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.can_manage_students())
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
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
