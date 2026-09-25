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
    school_id = (SELECT public.current_school_id())
    AND deleted_at IS NULL
    AND (SELECT public.can_read_students())
  );

CREATE POLICY "Create class schedule slots in own school"
  ON public.class_schedule_slots
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
    AND (SELECT public.can_manage_students())
  );

CREATE POLICY "Update class schedule slots in own school"
  ON public.class_schedule_slots
  FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.can_manage_students())
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
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
