-- =============================================================================
-- SIGA / ONSOFT — CONFIGURAÇÃO ACADÉMICA AVANÇADA
-- Migration: 20260908180000_advanced_academic_core.sql
-- Idempotente e não-destrutiva. Preserva dados e estruturas existentes.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. TIPOS DE DISCIPLINAS (subject_types)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subject_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code = btrim(code) AND char_length(code) BETWEEN 1 AND 40),
  name text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 2 AND 100),
  description text,
  counts_for_gpa boolean NOT NULL DEFAULT true,
  appears_in_pauta boolean NOT NULL DEFAULT true,
  has_exam boolean NOT NULL DEFAULT false,
  can_fail boolean NOT NULL DEFAULT true,
  is_mandatory boolean NOT NULL DEFAULT true,
  default_weight numeric(4,2) NOT NULL DEFAULT 1.00 CHECK (default_weight >= 0),
  requires_special_room boolean NOT NULL DEFAULT false,
  allows_simultaneous_classes boolean NOT NULL DEFAULT false,
  requires_specialized_teacher boolean NOT NULL DEFAULT false,
  color text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT subject_types_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT subject_types_school_code_key UNIQUE (school_id, code)
);

CREATE INDEX IF NOT EXISTS subject_types_school_idx
  ON public.subject_types (school_id, status)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. ÁREAS CURRICULARES (curriculum_areas)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.curriculum_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code = btrim(code) AND char_length(code) BETWEEN 1 AND 40),
  name text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 2 AND 100),
  description text,
  color text,
  display_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT curriculum_areas_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT curriculum_areas_school_code_key UNIQUE (school_id, code)
);

CREATE INDEX IF NOT EXISTS curriculum_areas_school_idx
  ON public.curriculum_areas (school_id, display_order)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. ENRIQUECER DISCIPLINAS (subjects)
-- ---------------------------------------------------------------------------
ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS subject_type_id uuid REFERENCES public.subject_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS curriculum_area_id uuid REFERENCES public.curriculum_areas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS short_name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS is_mandatory boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_practical boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_assessment boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS has_exam boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_attendance boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS has_pauta boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS annual_hours smallint,
  ADD COLUMN IF NOT EXISTS default_lesson_duration smallint NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS subjects_type_idx ON public.subjects (school_id, subject_type_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS subjects_area_idx ON public.subjects (school_id, curriculum_area_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. ENRIQUECER SALAS (rooms)
-- ---------------------------------------------------------------------------
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS room_type text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS campus_id uuid,
  ADD COLUMN IF NOT EXISTS building text,
  ADD COLUMN IF NOT EXISTS block text,
  ADD COLUMN IF NOT EXISTS floor text,
  ADD COLUMN IF NOT EXISTS resources jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS accessibility boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS rooms_school_type_idx ON public.rooms (school_id, room_type) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 5. TURNOS INSTITUCIONAIS (school_shifts) & BLOCOS DE AULA (school_shift_slots)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code = btrim(code) AND char_length(code) BETWEEN 1 AND 40),
  name text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 2 AND 100),
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  default_lesson_duration integer NOT NULL DEFAULT 45 CHECK (default_lesson_duration BETWEEN 15 AND 180),
  default_break_duration integer NOT NULL DEFAULT 15 CHECK (default_break_duration BETWEEN 0 AND 120),
  active_days integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  color text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT school_shifts_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT school_shifts_school_code_key UNIQUE (school_id, code),
  CONSTRAINT school_shifts_time_valid CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.school_shift_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.school_shifts(id) ON DELETE CASCADE,
  slot_number integer NOT NULL CHECK (slot_number >= 1),
  name text NOT NULL,
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  is_break boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT school_shift_slots_shift_number_key UNIQUE (shift_id, slot_number),
  CONSTRAINT school_shift_slots_time_valid CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS school_shifts_school_idx ON public.school_shifts (school_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS school_shift_slots_shift_idx ON public.school_shift_slots (shift_id, slot_number);

-- ---------------------------------------------------------------------------
-- 6. MATRIZ CURRICULAR (curricula & curriculum_subjects)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.curricula (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  -- Aponta para `programs` — é essa a tabela real de "curso" no SGA (nunca existiu
  -- `public.courses`); mantém-se o nome de coluna `course_id` para não obrigar a
  -- alterações em cascata no TS/UI que já falam de "courseId" com este significado.
  course_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  grade_level_id uuid NOT NULL REFERENCES public.grade_levels(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'draft')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT curricula_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT curricula_scope_key UNIQUE (school_id, academic_year_id, course_id, grade_level_id)
);

CREATE TABLE IF NOT EXISTS public.curriculum_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  curriculum_id uuid NOT NULL REFERENCES public.curricula(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  subject_type_id uuid REFERENCES public.subject_types(id) ON DELETE SET NULL,
  weekly_periods smallint NOT NULL DEFAULT 4 CHECK (weekly_periods BETWEEN 1 AND 25),
  period_duration_minutes smallint NOT NULL DEFAULT 45 CHECK (period_duration_minutes BETWEEN 15 AND 180),
  is_mandatory boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT curriculum_subjects_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT curriculum_subjects_curriculum_subject_key UNIQUE (curriculum_id, subject_id)
);

CREATE INDEX IF NOT EXISTS curricula_lookup_idx ON public.curricula (school_id, academic_year_id, course_id, grade_level_id);
CREATE INDEX IF NOT EXISTS curriculum_subjects_curriculum_idx ON public.curriculum_subjects (curriculum_id, display_order);

-- ---------------------------------------------------------------------------
-- 7. DISPONIBILIDADE DO PROFESSOR (teacher_availability)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teacher_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  is_available boolean NOT NULL DEFAULT true,
  max_weekly_hours smallint DEFAULT 24 CHECK (max_weekly_hours IS NULL OR max_weekly_hours > 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT teacher_availability_time_valid CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS teacher_availability_lookup_idx
  ON public.teacher_availability (school_id, teacher_id, weekday)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 8. HORÁRIOS VERSIONADOS (academic_schedules) & EXTENSÃO DE timetable_slots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academic_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  class_group_id uuid NOT NULL REFERENCES public.class_groups(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1 CHECK (version_number >= 1),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'published', 'archived')),
  valid_from date,
  valid_to date,
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT academic_schedules_version_key UNIQUE (school_id, class_group_id, version_number)
);

CREATE INDEX IF NOT EXISTS academic_schedules_class_status_idx
  ON public.academic_schedules (school_id, class_group_id, status)
  WHERE deleted_at IS NULL;

-- Extensão compatível de timetable_slots
ALTER TABLE public.timetable_slots
  ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES public.academic_schedules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.school_shifts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS day_period_number integer,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS timetable_slots_room_idx ON public.timetable_slots (school_id, room_id) WHERE room_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS timetable_slots_schedule_idx ON public.timetable_slots (school_id, schedule_id) WHERE schedule_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 9. TRIGGERS DE UPDATED_AT & VERSIONAMENTO
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'subject_types', 'curriculum_areas', 'school_shifts', 'school_shift_slots',
    'curricula', 'curriculum_subjects', 'teacher_availability', 'academic_schedules'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_updated_at ON public.%I', tbl, tbl);
    EXECUTE format('CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version()', tbl, tbl);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY (RLS)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'subject_types', 'curriculum_areas', 'school_shifts', 'school_shift_slots',
    'curricula', 'curriculum_subjects', 'teacher_availability', 'academic_schedules'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl);

    EXECUTE format('DROP POLICY IF EXISTS "Academic access in own school" ON public.%I', tbl);
    EXECUTE format(
      'CREATE POLICY "Academic access in own school" ON public.%I FOR ALL TO authenticated USING (public.is_school_member(school_id)) WITH CHECK (public.is_school_member(school_id))',
      tbl
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 11. SEED INSTITUCIONAL DE TIPOS E ÁREAS (Idempotente por escola)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.seed_default_academic_catalogs(p_school_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Subject Types
  INSERT INTO public.subject_types (school_id, code, name, description, counts_for_gpa, appears_in_pauta, has_exam, can_fail, is_mandatory, default_weight, color)
  VALUES
    (p_school_id, 'geral', 'Formação Geral', 'Disciplinas do tronco comum nacional (Português, Matemática, etc.)', true, true, true, true, true, 1.00, '#3b82f6'),
    (p_school_id, 'especifica', 'Formação Específica', 'Disciplinas essenciais da especialidade ou curso', true, true, true, true, true, 1.25, '#8b5cf6'),
    (p_school_id, 'tecnica', 'Formação Técnica / Tecnológica', 'Disciplinas práticas de laboratório, oficina e projecto', true, true, true, true, true, 1.50, '#10b981'),
    (p_school_id, 'complementar', 'Formação Complementar', 'Educação Física, Moral, Cívica e Artes', true, true, false, false, true, 0.75, '#f59e0b'),
    (p_school_id, 'eletiva', 'Opção / Eletiva', 'Disciplinas de escolha pelo estudante', true, true, false, false, false, 1.00, '#ec4899'),
    (p_school_id, 'extracurricular', 'Extracurricular', 'Clubes, reforço e actividades não avaliativas', false, false, false, false, false, 0.00, '#64748b')
  ON CONFLICT (school_id, code) DO NOTHING;

  -- Curriculum Areas
  INSERT INTO public.curriculum_areas (school_id, code, name, description, color, display_order)
  VALUES
    (p_school_id, 'exatas', 'Ciências Exatas', 'Matemática, Desenho Geométrico e Estatística', '#2563eb', 1),
    (p_school_id, 'naturais', 'Ciências Naturais', 'Física, Química, Biologia e Geologia', '#059669', 2),
    (p_school_id, 'humanas', 'Ciências Humanas e Sociais', 'História, Geografia, Filosofia e Sociologia', '#d97706', 3),
    (p_school_id, 'linguas', 'Línguas e Comunicação', 'Língua Portuguesa, Línguas Estrangeiras e Literatura', '#7c3aed', 4),
    (p_school_id, 'tecnologia', 'Tecnologia e Informação', 'Informática, TIC, Programação e Redes', '#0284c7', 5),
    (p_school_id, 'profissional', 'Formação Profissional', 'Oficinas técnicas, Práticas oficinais e Contabilidade', '#ea580c', 6),
    (p_school_id, 'artes', 'Artes e Expressão', 'Educação Visual, Educação Musical e Teatro', '#db2777', 7),
    (p_school_id, 'desporto', 'Educação Física e Desporto', 'Educação Física e Desporto Escolar', '#16a34a', 8),
    (p_school_id, 'cidadania', 'Formação Pessoal e Social', 'Educação Moral e Cívica, FAI e Projectos', '#475569', 9)
  ON CONFLICT (school_id, code) DO NOTHING;

  -- Default Shifts (Manhã, Tarde, Noite)
  INSERT INTO public.school_shifts (school_id, code, name, starts_at, ends_at, default_lesson_duration, default_break_duration, color)
  VALUES
    (p_school_id, 'morning', 'Manhã', '07:00:00', '12:30:00', 45, 15, '#3b82f6'),
    (p_school_id, 'afternoon', 'Tarde', '13:00:00', '18:00:00', 45, 15, '#f59e0b'),
    (p_school_id, 'evening', 'Noite / Pós-Laboral', '18:30:00', '22:30:00', 45, 10, '#8b5cf6')
  ON CONFLICT (school_id, code) DO NOTHING;
END;
$$;

-- Executar seed para todas as escolas existentes
DO $$
DECLARE
  s RECORD;
BEGIN
  FOR s IN SELECT id FROM public.schools LOOP
    PERFORM private.seed_default_academic_catalogs(s.id);
  END LOOP;
END $$;

COMMIT;
