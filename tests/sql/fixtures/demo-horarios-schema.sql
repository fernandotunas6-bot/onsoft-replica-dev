-- Fixture do ensaio tests/sql/demo-horarios-seed.mjs — NÃO é uma migração.
-- Captado da produção a 2026-10-25 (só leitura) com:
--   node scripts/siga/capture-table-ddl.mjs --tables=<as 32 tabelas do seed> --out=este ficheiro
-- O texto abaixo é o que o script escreve; o cabeçalho original segue para referência.
-- Migration: 20261025225557_capture_undeclared_production_tables
-- Objetivo: Declarar em versionamento as 32 tabelas que existiam na base ao
--   vivo sem nenhum CREATE TABLE no repositório — a divergência que
--   tests/security/production-snapshot.test.ts media e travava.
-- Metodologia: DDL lido do catálogo do Postgres (pg_attribute, pg_constraint,
--   pg_get_indexdef) por scripts/siga/capture-table-ddl.mjs, não escrito à mão.
--   100% idempotente: CREATE TABLE IF NOT EXISTS, chaves estrangeiras em blocos
--   guardados por pg_constraint, CREATE INDEX IF NOT EXISTS. Seguro de reaplicar
--   num ambiente onde estas tabelas já correm.
-- Âmbito: tabelas, restrições e índices. As políticas de RLS destas tabelas já
--   estão versionadas em supabase/HARDEN_*.sql e nas migrações de origem; aqui
--   só se liga o RLS onde a produção o tem ligado.
-- NUNCA executar via Lovable. Usar: npm run siga:sql (colar no SQL Editor do SGA)
-- Gerado em 2026-10-25T22:55:57.909Z

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. TABELAS, RESTRIÇÕES EM LINHA E ÍNDICES
-- ═══════════════════════════════════════════════════════════════════════════

-- schools
CREATE TABLE IF NOT EXISTS public.schools (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  public_code text NOT NULL,
  name text NOT NULL,
  timezone text DEFAULT 'Africa/Luanda'::text NOT NULL,
  currency_code text DEFAULT 'AOA'::text NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  theme jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  nif text,
  email text,
  phone text,
  province text,
  municipality text,
  address text,
  logo_path text,
  official_authorization_reference text,
  tenant_id uuid,
  commercial_name text,
  city text,
  logo_url text,
  director_name text,
  evaluation_periods smallint DEFAULT 3 NOT NULL,
  passing_grade numeric(4,2) DEFAULT 10 NOT NULL,
  preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
  commune text,
  neighborhood text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  CONSTRAINT schools_currency_code_check CHECK ((currency_code = 'AOA'::text)),
  CONSTRAINT schools_director_name_valid CHECK (((director_name IS NULL) OR ((director_name = btrim(director_name)) AND ((char_length(director_name) >= 3) AND (char_length(director_name) <= 120))))),
  CONSTRAINT schools_email_length CHECK (((email IS NULL) OR (char_length(email) <= 254))),
  CONSTRAINT schools_evaluation_periods_valid CHECK (((evaluation_periods >= 2) AND (evaluation_periods <= 4))),
  CONSTRAINT schools_geo_point_check CHECK ((((latitude IS NULL) AND (longitude IS NULL)) OR (((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric)) AND ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))))),
  CONSTRAINT schools_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 200))),
  CONSTRAINT schools_nif_format CHECK (((nif IS NULL) OR (nif ~ '^[A-Za-z0-9]{9,14}$'::text))),
  CONSTRAINT schools_passing_grade_valid CHECK (((passing_grade >= (0)::numeric) AND (passing_grade <= (20)::numeric))),
  CONSTRAINT schools_phone_length CHECK (((phone IS NULL) OR ((char_length(phone) >= 9) AND (char_length(phone) <= 24)))),
  CONSTRAINT schools_preferences_object CHECK ((jsonb_typeof(preferences) = 'object'::text)),
  CONSTRAINT schools_public_code_check CHECK ((public_code ~ '^SIGA-AO-[0-9]{6}$'::text)),
  CONSTRAINT schools_status_check CHECK ((status = ANY (ARRAY['setup'::text, 'active'::text, 'suspended'::text, 'archived'::text]))),
  CONSTRAINT schools_pkey PRIMARY KEY (id),
  CONSTRAINT schools_public_code_key UNIQUE (public_code),
  CONSTRAINT schools_tenant_id_key UNIQUE (tenant_id)
);
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS schools_nif_unique_idx ON public.schools USING btree (nif) WHERE (nif IS NOT NULL);

-- school_memberships
CREATE TABLE IF NOT EXISTS public.school_memberships (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text DEFAULT 'invited'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  joined_at timestamp with time zone DEFAULT now(),
  invited_at timestamp with time zone,
  activated_at timestamp with time zone DEFAULT now(),
  suspended_at timestamp with time zone,
  last_access_at timestamp with time zone,
  CONSTRAINT school_memberships_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'active'::text, 'suspended'::text, 'revoked'::text]))),
  CONSTRAINT school_memberships_pkey PRIMARY KEY (id),
  CONSTRAINT school_memberships_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT school_memberships_school_id_user_id_key UNIQUE (school_id, user_id)
);
ALTER TABLE public.school_memberships ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS school_memberships_school_status_idx ON public.school_memberships USING btree (school_id, status);
CREATE INDEX IF NOT EXISTS school_memberships_user_school_idx ON public.school_memberships USING btree (user_id, school_id) WHERE (status = 'active'::text);
CREATE INDEX IF NOT EXISTS school_memberships_user_status_idx ON public.school_memberships USING btree (user_id, status);

-- roles
CREATE TABLE IF NOT EXISTS public.roles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  is_system boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT roles_pkey PRIMARY KEY (id),
  CONSTRAINT roles_school_id_code_key UNIQUE (school_id, code),
  CONSTRAINT roles_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS roles_school_code_idx ON public.roles USING btree (school_id, code);
CREATE INDEX IF NOT EXISTS roles_school_idx ON public.roles USING btree (school_id);

-- member_roles
CREATE TABLE IF NOT EXISTS public.member_roles (
  school_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  role_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT member_roles_pkey PRIMARY KEY (school_id, membership_id, role_id)
);
ALTER TABLE public.member_roles ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS ix_fk_member_roles_school_id_role_id_f1eee2 ON public.member_roles USING btree (school_id, role_id);
CREATE INDEX IF NOT EXISTS member_roles_membership_idx ON public.member_roles USING btree (membership_id);
CREATE INDEX IF NOT EXISTS member_roles_membership_role_idx ON public.member_roles USING btree (membership_id, role_id);
CREATE INDEX IF NOT EXISTS member_roles_role_idx ON public.member_roles USING btree (role_id);

-- academic_years
CREATE TABLE IF NOT EXISTS public.academic_years (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  updated_by uuid,
  CONSTRAINT academic_years_check CHECK ((ends_on > starts_on)),
  CONSTRAINT academic_years_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'closed'::text, 'archived'::text]))),
  CONSTRAINT academic_years_pkey PRIMARY KEY (id),
  CONSTRAINT academic_years_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT academic_years_school_id_name_key UNIQUE (school_id, name)
);
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS academic_years_one_active_per_school ON public.academic_years USING btree (school_id) WHERE (status = 'active'::text);
CREATE INDEX IF NOT EXISTS academic_years_school_status_idx ON public.academic_years USING btree (school_id, status);

-- terms
CREATE TABLE IF NOT EXISTS public.terms (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  name text NOT NULL,
  sequence smallint NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  updated_by uuid,
  CONSTRAINT terms_check CHECK ((ends_on >= starts_on)),
  CONSTRAINT terms_sequence_check CHECK ((sequence > 0)),
  CONSTRAINT terms_pkey PRIMARY KEY (id),
  CONSTRAINT terms_school_id_academic_year_id_sequence_key UNIQUE (school_id, academic_year_id, sequence),
  CONSTRAINT terms_school_id_unique UNIQUE (school_id, id)
);
ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS terms_academic_year_idx ON public.terms USING btree (academic_year_id);
CREATE INDEX IF NOT EXISTS terms_school_year_idx ON public.terms USING btree (school_id, academic_year_id, sequence);

-- campuses
CREATE TABLE IF NOT EXISTS public.campuses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  province text,
  municipality text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  address text,
  CONSTRAINT campuses_pkey PRIMARY KEY (id),
  CONSTRAINT campuses_school_id_code_key UNIQUE (school_id, code),
  CONSTRAINT campuses_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.campuses ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS campuses_school_active_idx ON public.campuses USING btree (school_id, is_active);

-- school_shifts
CREATE TABLE IF NOT EXISTS public.school_shifts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  starts_at time without time zone NOT NULL,
  ends_at time without time zone NOT NULL,
  default_lesson_duration integer DEFAULT 45 NOT NULL,
  default_break_duration integer DEFAULT 15 NOT NULL,
  active_days integer[] DEFAULT '{1,2,3,4,5}'::integer[] NOT NULL,
  color text,
  status text DEFAULT 'active'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  updated_by uuid,
  deleted_at timestamp with time zone,
  version integer DEFAULT 1 NOT NULL,
  CONSTRAINT school_shifts_code_check CHECK (((code = btrim(code)) AND ((char_length(code) >= 1) AND (char_length(code) <= 40)))),
  CONSTRAINT school_shifts_default_break_duration_check CHECK (((default_break_duration >= 0) AND (default_break_duration <= 120))),
  CONSTRAINT school_shifts_default_lesson_duration_check CHECK (((default_lesson_duration >= 15) AND (default_lesson_duration <= 180))),
  CONSTRAINT school_shifts_name_check CHECK (((name = btrim(name)) AND ((char_length(name) >= 2) AND (char_length(name) <= 100)))),
  CONSTRAINT school_shifts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text]))),
  CONSTRAINT school_shifts_time_valid CHECK ((ends_at > starts_at)),
  CONSTRAINT school_shifts_pkey PRIMARY KEY (id),
  CONSTRAINT school_shifts_school_code_key UNIQUE (school_id, code),
  CONSTRAINT school_shifts_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.school_shifts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS school_shifts_school_idx ON public.school_shifts USING btree (school_id, status) WHERE (deleted_at IS NULL);

-- academic_levels
CREATE TABLE IF NOT EXISTS public.academic_levels (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  sequence smallint NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT academic_levels_sequence_check CHECK ((sequence > 0)),
  CONSTRAINT academic_levels_pkey PRIMARY KEY (id),
  CONSTRAINT academic_levels_school_id_code_key UNIQUE (school_id, code),
  CONSTRAINT academic_levels_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.academic_levels ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS academic_levels_school_active_idx ON public.academic_levels USING btree (school_id, is_active, sequence);

-- programs
CREATE TABLE IF NOT EXISTS public.programs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  academic_level_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  kind text DEFAULT 'general'::text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  grading_profile jsonb,
  catalog_course_code text,
  CONSTRAINT programs_catalog_course_code_format CHECK (((catalog_course_code IS NULL) OR (catalog_course_code ~ '^[A-Z][A-Z0-9-]{0,23}$'::text))),
  CONSTRAINT programs_grading_profile_shape_valid CHECK (((grading_profile IS NULL) OR ((grading_profile ? 'scale'::text) AND (grading_profile ? 'components'::text) AND ((grading_profile ->> 'scale'::text) = ANY (ARRAY['20_ects'::text, 'gpa4'::text])) AND ((grading_profile ->> 'components'::text) = ANY (ARRAY['frequencia_exame'::text, 'so_exame'::text]))))),
  CONSTRAINT programs_kind_check CHECK ((kind = ANY (ARRAY['general'::text, 'technical'::text, 'professional'::text, 'undergraduate'::text, 'postgraduate'::text]))),
  CONSTRAINT programs_pkey PRIMARY KEY (id),
  CONSTRAINT programs_school_id_code_key UNIQUE (school_id, code),
  CONSTRAINT programs_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS programs_school_catalog_code_idx ON public.programs USING btree (school_id, catalog_course_code) WHERE (catalog_course_code IS NOT NULL);
CREATE INDEX IF NOT EXISTS programs_school_level_idx ON public.programs USING btree (school_id, academic_level_id, is_active);

-- grade_levels
CREATE TABLE IF NOT EXISTS public.grade_levels (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  program_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  sequence smallint DEFAULT 1 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT grade_levels_sequence_check CHECK ((sequence > 0)),
  CONSTRAINT grade_levels_pkey PRIMARY KEY (id),
  CONSTRAINT grade_levels_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT grade_levels_school_id_program_id_code_key UNIQUE (school_id, program_id, code)
);
ALTER TABLE public.grade_levels ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS grade_levels_school_program_idx ON public.grade_levels USING btree (school_id, program_id, sequence);

-- subjects
CREATE TABLE IF NOT EXISTS public.subjects (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  short_name text,
  status text DEFAULT 'active'::text NOT NULL,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  subject_type_id uuid,
  curriculum_area_id uuid,
  description text,
  department text,
  is_mandatory boolean DEFAULT true NOT NULL,
  is_practical boolean DEFAULT false NOT NULL,
  has_assessment boolean DEFAULT true NOT NULL,
  has_exam boolean DEFAULT false NOT NULL,
  has_attendance boolean DEFAULT true NOT NULL,
  has_pauta boolean DEFAULT true NOT NULL,
  annual_hours smallint,
  default_lesson_duration smallint DEFAULT 45 NOT NULL,
  color text,
  icon text,
  display_order integer DEFAULT 0 NOT NULL,
  deleted_at timestamp with time zone,
  version integer DEFAULT 1 NOT NULL,
  catalog_subject_code text,
  CONSTRAINT subjects_catalog_subject_code_format CHECK (((catalog_subject_code IS NULL) OR (catalog_subject_code ~ '^[A-Z][A-Z0-9-]{0,23}$'::text))),
  CONSTRAINT subjects_code_check CHECK ((code ~ '^[A-Z0-9_-]{2,20}$'::text)),
  CONSTRAINT subjects_name_check CHECK (((char_length(btrim(name)) >= 2) AND (char_length(btrim(name)) <= 160))),
  CONSTRAINT subjects_short_name_check CHECK (((short_name IS NULL) OR ((char_length(btrim(short_name)) >= 1) AND (char_length(btrim(short_name)) <= 40)))),
  CONSTRAINT subjects_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]))),
  CONSTRAINT subjects_pkey PRIMARY KEY (id),
  CONSTRAINT subjects_school_id_code_key UNIQUE (school_id, code),
  CONSTRAINT subjects_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS ix_fk_subjects_curriculum_area_id_22a81a ON public.subjects USING btree (curriculum_area_id);
CREATE INDEX IF NOT EXISTS ix_fk_subjects_subject_type_id_144119 ON public.subjects USING btree (subject_type_id);
CREATE INDEX IF NOT EXISTS subjects_area_idx ON public.subjects USING btree (school_id, curriculum_area_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS subjects_school_catalog_code_idx ON public.subjects USING btree (school_id, catalog_subject_code) WHERE (catalog_subject_code IS NOT NULL);
CREATE INDEX IF NOT EXISTS subjects_school_status_name_idx ON public.subjects USING btree (school_id, status, name, id);
CREATE INDEX IF NOT EXISTS subjects_type_idx ON public.subjects USING btree (school_id, subject_type_id) WHERE (deleted_at IS NULL);

-- people
CREATE TABLE IF NOT EXISTS public.people (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  full_name text NOT NULL,
  preferred_name text,
  date_of_birth date,
  sex text,
  national_id text,
  email text,
  phone text,
  status text DEFAULT 'active'::text NOT NULL,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  photo_path text,
  photo_url text,
  deleted_at timestamp with time zone,
  user_id uuid,
  province text,
  municipality text,
  commune text,
  address text,
  CONSTRAINT people_date_of_birth_check CHECK (((date_of_birth IS NULL) OR (date_of_birth <= CURRENT_DATE))),
  CONSTRAINT people_email_check CHECK (((email IS NULL) OR (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'::text))),
  CONSTRAINT people_full_name_check CHECK (((char_length(btrim(full_name)) >= 2) AND (char_length(btrim(full_name)) <= 200))),
  CONSTRAINT people_national_id_check CHECK (((national_id IS NULL) OR ((char_length(btrim(national_id)) >= 3) AND (char_length(btrim(national_id)) <= 40)))),
  CONSTRAINT people_phone_check CHECK (((phone IS NULL) OR (phone ~ '^\+?[0-9][0-9[:space:]-]{6,19}$'::text))),
  CONSTRAINT people_photo_path_check CHECK (((photo_path IS NULL) OR ((char_length(btrim(photo_path)) >= 8) AND (char_length(btrim(photo_path)) <= 500)))),
  CONSTRAINT people_preferred_name_check CHECK (((preferred_name IS NULL) OR ((char_length(btrim(preferred_name)) >= 1) AND (char_length(btrim(preferred_name)) <= 120)))),
  CONSTRAINT people_sex_check CHECK (((sex IS NULL) OR (sex = ANY (ARRAY['female'::text, 'male'::text, 'other'::text, 'undisclosed'::text])))),
  CONSTRAINT people_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]))),
  CONSTRAINT people_pkey PRIMARY KEY (id),
  CONSTRAINT people_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS ix_fk_people_user_id_d68697 ON public.people USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS people_one_active_login_per_school ON public.people USING btree (school_id, user_id) WHERE ((user_id IS NOT NULL) AND (deleted_at IS NULL));
CREATE UNIQUE INDEX IF NOT EXISTS people_school_email_uidx ON public.people USING btree (school_id, lower(email)) WHERE (email IS NOT NULL);
CREATE INDEX IF NOT EXISTS people_school_id_idx ON public.people USING btree (school_id);
CREATE INDEX IF NOT EXISTS people_school_name_idx ON public.people USING btree (school_id, full_name, id);
CREATE UNIQUE INDEX IF NOT EXISTS people_school_national_id_uidx ON public.people USING btree (school_id, upper(national_id)) WHERE (national_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS people_school_province_idx ON public.people USING btree (school_id, province) WHERE ((deleted_at IS NULL) AND (province IS NOT NULL));
CREATE INDEX IF NOT EXISTS people_school_province_municipality_idx ON public.people USING btree (school_id, province, municipality) WHERE ((deleted_at IS NULL) AND (province IS NOT NULL));
CREATE INDEX IF NOT EXISTS people_school_status_idx ON public.people USING btree (school_id, status, id);
CREATE INDEX IF NOT EXISTS people_user_id_idx ON public.people USING btree (school_id, user_id) WHERE ((user_id IS NOT NULL) AND (deleted_at IS NULL));

-- teachers
CREATE TABLE IF NOT EXISTS public.teachers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  person_id uuid NOT NULL,
  employee_number text NOT NULL,
  hired_on date NOT NULL,
  employment_type text NOT NULL,
  highest_qualification text NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  user_id uuid,
  CONSTRAINT teachers_employee_number_check CHECK ((employee_number ~ '^DOC-[0-9]{6,}$'::text)),
  CONSTRAINT teachers_employment_type_check CHECK ((employment_type = ANY (ARRAY['permanent'::text, 'fixed_term'::text, 'part_time'::text, 'visiting'::text]))),
  CONSTRAINT teachers_highest_qualification_check CHECK ((highest_qualification = ANY (ARRAY['secondary'::text, 'bachelor'::text, 'licentiate'::text, 'master'::text, 'doctorate'::text, 'other'::text]))),
  CONSTRAINT teachers_status_check CHECK ((status = ANY (ARRAY['active'::text, 'leave'::text, 'inactive'::text, 'archived'::text]))),
  CONSTRAINT teachers_pkey PRIMARY KEY (id),
  CONSTRAINT teachers_school_id_employee_number_key UNIQUE (school_id, employee_number),
  CONSTRAINT teachers_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT teachers_school_id_person_id_key UNIQUE (school_id, person_id)
);
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS teachers_one_login_per_school ON public.teachers USING btree (school_id, user_id) WHERE (user_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS teachers_person_idx ON public.teachers USING btree (person_id);
CREATE INDEX IF NOT EXISTS teachers_school_person_idx ON public.teachers USING btree (school_id, person_id);
CREATE INDEX IF NOT EXISTS teachers_school_status_number_idx ON public.teachers USING btree (school_id, status, employee_number);
CREATE INDEX IF NOT EXISTS teachers_user_id_idx ON public.teachers USING btree (user_id) WHERE (user_id IS NOT NULL);

-- students
CREATE TABLE IF NOT EXISTS public.students (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  person_id uuid NOT NULL,
  student_number text NOT NULL,
  admission_date date DEFAULT CURRENT_DATE NOT NULL,
  status text DEFAULT 'applicant'::text NOT NULL,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone,
  CONSTRAINT students_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'transferred'::text, 'graduated'::text, 'applicant'::text, 'cancelled'::text, 'suspended'::text, 'locked'::text, 'withdrawn'::text]))),
  CONSTRAINT students_student_number_check CHECK (((student_number ~ '^1[0-9]{6}$'::text) AND ("right"(student_number, 4) <> '0000'::text))),
  CONSTRAINT students_pkey PRIMARY KEY (id),
  CONSTRAINT students_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT students_school_id_person_id_key UNIQUE (school_id, person_id),
  CONSTRAINT students_school_id_student_number_key UNIQUE (school_id, student_number)
);
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS students_person_idx ON public.students USING btree (person_id);
CREATE INDEX IF NOT EXISTS students_school_person_idx ON public.students USING btree (school_id, person_id);
CREATE INDEX IF NOT EXISTS students_school_status_idx ON public.students USING btree (school_id, status, student_number);

-- enrollments
CREATE TABLE IF NOT EXISTS public.enrollments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  class_group_id uuid NOT NULL,
  student_id uuid NOT NULL,
  enrollment_number text NOT NULL,
  enrolled_on date NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  ended_on date,
  end_reason text,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  attendance_rate numeric(5,2),
  final_average numeric(5,2),
  CONSTRAINT enrollments_check CHECK ((((status = ANY (ARRAY['pending'::text, 'active'::text])) AND (ended_on IS NULL)) OR (status <> ALL (ARRAY['pending'::text, 'active'::text])))),
  CONSTRAINT enrollments_check1 CHECK (((ended_on IS NULL) OR (ended_on >= enrolled_on))),
  CONSTRAINT enrollments_end_reason_check CHECK (((end_reason IS NULL) OR ((char_length(btrim(end_reason)) >= 3) AND (char_length(btrim(end_reason)) <= 300)))),
  CONSTRAINT enrollments_enrollment_number_check CHECK (((enrollment_number ~ '^1[0-9]{6}$'::text) AND ("right"(enrollment_number, 4) <> '0000'::text))),
  CONSTRAINT enrollments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'transferred'::text, 'completed'::text, 'cancelled'::text]))),
  CONSTRAINT enrollments_pkey PRIMARY KEY (id),
  CONSTRAINT enrollments_school_id_enrollment_number_key UNIQUE (school_id, enrollment_number),
  CONSTRAINT enrollments_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS enrollments_academic_year_idx ON public.enrollments USING btree (academic_year_id);
CREATE INDEX IF NOT EXISTS enrollments_class_group_idx ON public.enrollments USING btree (class_group_id);
CREATE UNIQUE INDEX IF NOT EXISTS enrollments_one_current_per_year_uidx ON public.enrollments USING btree (school_id, student_id, academic_year_id) WHERE (status = ANY (ARRAY['pending'::text, 'active'::text]));
CREATE INDEX IF NOT EXISTS enrollments_school_class_status_idx ON public.enrollments USING btree (school_id, class_group_id, status, id);
CREATE INDEX IF NOT EXISTS enrollments_school_created_desc_idx ON public.enrollments USING btree (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS enrollments_school_student_year_idx ON public.enrollments USING btree (school_id, student_id, academic_year_id);
CREATE INDEX IF NOT EXISTS enrollments_school_year_status_idx ON public.enrollments USING btree (school_id, academic_year_id, status);
CREATE INDEX IF NOT EXISTS enrollments_student_idx ON public.enrollments USING btree (student_id);

-- rooms
CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  capacity integer,
  status text DEFAULT 'active'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  updated_by uuid,
  deleted_at timestamp with time zone,
  version integer DEFAULT 1 NOT NULL,
  room_type text DEFAULT 'standard'::text NOT NULL,
  campus_id uuid,
  building text,
  block text,
  floor text,
  resources jsonb DEFAULT '[]'::jsonb NOT NULL,
  accessibility boolean DEFAULT true NOT NULL,
  notes text,
  CONSTRAINT rooms_capacity_check CHECK (((capacity IS NULL) OR (capacity > 0))),
  CONSTRAINT rooms_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text]))),
  CONSTRAINT rooms_pkey PRIMARY KEY (id),
  CONSTRAINT rooms_school_code_key UNIQUE (school_id, code),
  CONSTRAINT rooms_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS rooms_school_status_idx ON public.rooms USING btree (school_id, status) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS rooms_school_type_idx ON public.rooms USING btree (school_id, room_type) WHERE (deleted_at IS NULL);

-- class_groups
CREATE TABLE IF NOT EXISTS public.class_groups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  campus_id uuid NOT NULL,
  grade_level_id uuid NOT NULL,
  homeroom_teacher_id uuid,
  code text NOT NULL,
  name text NOT NULL,
  shift text NOT NULL,
  capacity integer NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  delegate_student_id uuid,
  whatsapp_invite_url text,
  whatsapp_group_name text,
  room_id uuid,
  CONSTRAINT class_groups_capacity_check CHECK (((capacity >= 1) AND (capacity <= 500))),
  CONSTRAINT class_groups_code_check CHECK ((code ~ '^[A-Z0-9_-]{2,30}$'::text)),
  CONSTRAINT class_groups_name_check CHECK (((char_length(btrim(name)) >= 2) AND (char_length(btrim(name)) <= 120))),
  CONSTRAINT class_groups_shift_check CHECK ((shift = ANY (ARRAY['morning'::text, 'afternoon'::text, 'evening'::text, 'full_day'::text]))),
  CONSTRAINT class_groups_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'closed'::text, 'archived'::text]))),
  CONSTRAINT class_groups_pkey PRIMARY KEY (id),
  CONSTRAINT class_groups_school_id_academic_year_id_code_key UNIQUE (school_id, academic_year_id, code),
  CONSTRAINT class_groups_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.class_groups ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS class_groups_academic_year_idx ON public.class_groups USING btree (academic_year_id);
CREATE INDEX IF NOT EXISTS class_groups_room_id_idx ON public.class_groups USING btree (room_id) WHERE (room_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS class_groups_school_campus_idx ON public.class_groups USING btree (school_id, campus_id, academic_year_id);
CREATE INDEX IF NOT EXISTS class_groups_school_delegate_student_idx ON public.class_groups USING btree (school_id, delegate_student_id) WHERE (delegate_student_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS class_groups_school_grade_idx ON public.class_groups USING btree (school_id, grade_level_id, academic_year_id);
CREATE INDEX IF NOT EXISTS class_groups_school_homeroom_teacher_idx ON public.class_groups USING btree (school_id, homeroom_teacher_id) WHERE (homeroom_teacher_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS class_groups_school_year_status_idx ON public.class_groups USING btree (school_id, academic_year_id, status, id);
CREATE INDEX IF NOT EXISTS ix_fk_class_groups_school_id_room_id_040c27 ON public.class_groups USING btree (school_id, room_id);

-- class_subjects
CREATE TABLE IF NOT EXISTS public.class_subjects (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  class_group_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  teacher_id uuid,
  weekly_periods smallint NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT class_subjects_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]))),
  CONSTRAINT class_subjects_weekly_periods_check CHECK (((weekly_periods >= 1) AND (weekly_periods <= 30))),
  CONSTRAINT class_subjects_pkey PRIMARY KEY (id),
  CONSTRAINT class_subjects_school_id_class_group_id_subject_id_key UNIQUE (school_id, class_group_id, subject_id),
  CONSTRAINT class_subjects_school_id_id_key UNIQUE (school_id, id)
);
ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS class_subjects_class_group_idx ON public.class_subjects USING btree (class_group_id);
CREATE INDEX IF NOT EXISTS class_subjects_school_class_idx ON public.class_subjects USING btree (school_id, class_group_id, status, id);
CREATE INDEX IF NOT EXISTS class_subjects_school_subject_idx ON public.class_subjects USING btree (school_id, subject_id);
CREATE INDEX IF NOT EXISTS class_subjects_school_teacher_idx ON public.class_subjects USING btree (school_id, teacher_id, status, id);
CREATE INDEX IF NOT EXISTS class_subjects_subject_idx ON public.class_subjects USING btree (subject_id);
CREATE INDEX IF NOT EXISTS class_subjects_teacher_idx ON public.class_subjects USING btree (teacher_id);

-- academic_schedules
CREATE TABLE IF NOT EXISTS public.academic_schedules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  class_group_id uuid NOT NULL,
  version_number integer DEFAULT 1 NOT NULL,
  name text NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  valid_from date,
  valid_to date,
  published_at timestamp with time zone,
  published_by uuid,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  updated_by uuid,
  deleted_at timestamp with time zone,
  version integer DEFAULT 1 NOT NULL,
  term smallint,
  source text DEFAULT 'manual'::text NOT NULL,
  snapshot jsonb DEFAULT '[]'::jsonb NOT NULL,
  metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
  shift_id uuid,
  CONSTRAINT academic_schedules_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'suggested'::text, 'carried_over'::text, 'imported'::text]))),
  CONSTRAINT academic_schedules_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'review'::text, 'approved'::text, 'published'::text, 'archived'::text]))),
  CONSTRAINT academic_schedules_term_check CHECK (((term IS NULL) OR ((term >= 1) AND (term <= 3)))),
  CONSTRAINT academic_schedules_version_number_check CHECK ((version_number >= 1)),
  CONSTRAINT academic_schedules_pkey PRIMARY KEY (id),
  CONSTRAINT academic_schedules_version_key UNIQUE (school_id, class_group_id, version_number)
);
ALTER TABLE public.academic_schedules ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS academic_schedules_class_status_idx ON public.academic_schedules USING btree (school_id, class_group_id, status) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS academic_schedules_class_term_idx ON public.academic_schedules USING btree (school_id, class_group_id, academic_year_id, term, created_at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS ix_fk_academic_schedules_academic_year_id_564770 ON public.academic_schedules USING btree (academic_year_id);
CREATE INDEX IF NOT EXISTS ix_fk_academic_schedules_class_group_id_e63055 ON public.academic_schedules USING btree (class_group_id);

-- timetable_slots
CREATE TABLE IF NOT EXISTS public.timetable_slots (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  class_subject_id uuid NOT NULL,
  weekday smallint NOT NULL,
  starts_at time without time zone NOT NULL,
  ends_at time without time zone NOT NULL,
  room text NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid,
  schedule_id uuid,
  room_id uuid,
  shift_id uuid,
  day_period_number integer,
  notes text,
  CONSTRAINT timetable_slots_check CHECK ((ends_at > starts_at)),
  CONSTRAINT timetable_slots_room_check CHECK (((char_length(btrim(room)) >= 1) AND (char_length(btrim(room)) <= 80))),
  CONSTRAINT timetable_slots_status_check CHECK ((status = ANY (ARRAY['active'::text, 'cancelled'::text, 'archived'::text]))),
  CONSTRAINT timetable_slots_weekday_check CHECK (((weekday >= 1) AND (weekday <= 7))),
  CONSTRAINT timetable_slots_pkey PRIMARY KEY (id),
  CONSTRAINT timetable_slots_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT timetable_slots_school_slot_assignment_key UNIQUE (school_id, id, class_subject_id)
);
ALTER TABLE public.timetable_slots ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS ix_fk_timetable_slots_room_id_77ba59 ON public.timetable_slots USING btree (room_id);
CREATE INDEX IF NOT EXISTS ix_fk_timetable_slots_schedule_id_ebc8fd ON public.timetable_slots USING btree (schedule_id);
CREATE INDEX IF NOT EXISTS timetable_slots_class_subject_idx ON public.timetable_slots USING btree (class_subject_id);
CREATE INDEX IF NOT EXISTS timetable_slots_room_idx ON public.timetable_slots USING btree (school_id, room_id) WHERE (room_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS timetable_slots_schedule_idx ON public.timetable_slots USING btree (school_id, schedule_id) WHERE (schedule_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS timetable_slots_school_day_time_idx ON public.timetable_slots USING btree (school_id, weekday, starts_at, ends_at) WHERE (status = 'active'::text);
CREATE INDEX IF NOT EXISTS timetable_slots_school_subject_day_idx ON public.timetable_slots USING btree (school_id, class_subject_id, weekday, starts_at);
CREATE INDEX IF NOT EXISTS timetable_slots_shift_idx ON public.timetable_slots USING btree (shift_id) WHERE (shift_id IS NOT NULL);

-- siga_timetable_slot_details
CREATE TABLE IF NOT EXISTS public.siga_timetable_slot_details (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  timetable_slot_id uuid NOT NULL,
  lesson_type text DEFAULT 'teorica'::text NOT NULL,
  delivery_mode text DEFAULT 'presencial'::text NOT NULL,
  online_url text,
  topic text,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT siga_timetable_slot_details_delivery_mode_check CHECK ((delivery_mode = ANY (ARRAY['presencial'::text, 'zoom'::text, 'online'::text, 'hibrido'::text]))),
  CONSTRAINT siga_timetable_slot_details_lesson_type_check CHECK ((lesson_type = ANY (ARRAY['teorica'::text, 'pratica'::text, 'laboratorio'::text, 'revisao'::text, 'avaliacao'::text, 'outra'::text]))),
  CONSTRAINT siga_timetable_slot_details_notes_check CHECK (((notes IS NULL) OR (char_length(notes) <= 1000))),
  CONSTRAINT siga_timetable_slot_details_online_url_check CHECK (((online_url IS NULL) OR ((char_length(online_url) <= 500) AND (online_url ~* '^https://'::text)))),
  CONSTRAINT siga_timetable_slot_details_topic_check CHECK (((topic IS NULL) OR (char_length(topic) <= 200))),
  CONSTRAINT siga_timetable_slot_details_pkey PRIMARY KEY (id)
);
ALTER TABLE public.siga_timetable_slot_details ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS siga_timetable_slot_details_school_idx ON public.siga_timetable_slot_details USING btree (school_id);
CREATE UNIQUE INDEX IF NOT EXISTS siga_timetable_slot_details_slot_idx ON public.siga_timetable_slot_details USING btree (timetable_slot_id);

-- siga_calendar_events
CREATE TABLE IF NOT EXISTS public.siga_calendar_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  class_group_id uuid,
  teacher_id uuid,
  title text NOT NULL,
  description text DEFAULT ''::text NOT NULL,
  category text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  starts_at time without time zone,
  ends_at time without time zone,
  audience text DEFAULT 'all'::text NOT NULL,
  blocks_teaching boolean DEFAULT false NOT NULL,
  status text DEFAULT 'published'::text NOT NULL,
  version integer DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  updated_by uuid,
  CONSTRAINT siga_calendar_events_audience_check CHECK ((audience = ANY (ARRAY['all'::text, 'staff'::text]))),
  CONSTRAINT siga_calendar_events_category_check CHECK ((category = ANY (ARRAY['event'::text, 'meeting'::text, 'deadline'::text, 'holiday'::text, 'closure'::text]))),
  CONSTRAINT siga_calendar_events_check CHECK ((ends_on >= starts_on)),
  CONSTRAINT siga_calendar_events_closure_check CHECK (((NOT blocks_teaching) OR ((category = ANY (ARRAY['closure'::text, 'holiday'::text])) AND (starts_at IS NULL)))),
  CONSTRAINT siga_calendar_events_description_check CHECK ((char_length(description) <= 4000)),
  CONSTRAINT siga_calendar_events_status_check CHECK ((status = ANY (ARRAY['published'::text, 'cancelled'::text]))),
  CONSTRAINT siga_calendar_events_times_check CHECK ((((starts_at IS NULL) AND (ends_at IS NULL)) OR ((starts_at IS NOT NULL) AND (ends_at IS NOT NULL) AND (starts_on = ends_on) AND (ends_at > starts_at)))),
  CONSTRAINT siga_calendar_events_title_check CHECK (((char_length(btrim(title)) >= 2) AND (char_length(btrim(title)) <= 160))),
  CONSTRAINT siga_calendar_events_version_check CHECK ((version > 0)),
  CONSTRAINT siga_calendar_events_pkey PRIMARY KEY (id)
);
ALTER TABLE public.siga_calendar_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS siga_calendar_events_group ON public.siga_calendar_events USING btree (school_id, class_group_id) WHERE (class_group_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS siga_calendar_events_school_range ON public.siga_calendar_events USING btree (school_id, academic_year_id, starts_on, ends_on) WHERE (status = 'published'::text);
CREATE INDEX IF NOT EXISTS siga_calendar_events_teacher ON public.siga_calendar_events USING btree (school_id, teacher_id) WHERE (teacher_id IS NOT NULL);

-- siga_assessment_items
CREATE TABLE IF NOT EXISTS public.siga_assessment_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  class_group_id uuid,
  subject_id uuid,
  term integer NOT NULL,
  name text NOT NULL,
  kind text DEFAULT 'teste'::text NOT NULL,
  component text DEFAULT 'NPP'::text NOT NULL,
  assessed_on date,
  max_score numeric DEFAULT 20 NOT NULL,
  counts_toward_pauta boolean DEFAULT true NOT NULL,
  allow_recovery boolean DEFAULT true NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  updated_by uuid,
  lesson_plan_component_id uuid,
  starts_at time without time zone,
  duration_minutes integer,
  purpose text,
  CONSTRAINT siga_assessment_items_duration_check CHECK (((duration_minutes IS NULL) OR ((duration_minutes >= 5) AND (duration_minutes <= 600)))),
  CONSTRAINT siga_assessment_items_purpose_check CHECK (((purpose IS NULL) OR (purpose = ANY (ARRAY['diagnostic'::text, 'formative'::text, 'summative'::text])))),
  CONSTRAINT siga_assessment_items_term_check CHECK (((term >= 1) AND (term <= 3))),
  CONSTRAINT siga_assessment_items_pkey PRIMARY KEY (id)
);
ALTER TABLE public.siga_assessment_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS siga_assessment_items_component_idx ON public.siga_assessment_items USING btree (lesson_plan_component_id) WHERE (lesson_plan_component_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS siga_assessment_items_school_idx ON public.siga_assessment_items USING btree (school_id);

-- siga_assessment_scores
CREATE TABLE IF NOT EXISTS public.siga_assessment_scores (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  item_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  score numeric,
  previous_score numeric,
  status text DEFAULT 'draft'::text NOT NULL,
  recorded_by uuid,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT siga_assessment_scores_pkey PRIMARY KEY (id),
  CONSTRAINT siga_assessment_scores_item_id_enrollment_id_key UNIQUE (item_id, enrollment_id)
);
ALTER TABLE public.siga_assessment_scores ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS siga_assessment_scores_school_idx ON public.siga_assessment_scores USING btree (school_id);

-- siga_class_tasks
CREATE TABLE IF NOT EXISTS public.siga_class_tasks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  class_subject_id uuid NOT NULL,
  timetable_slot_id uuid,
  kind text DEFAULT 'tpc'::text NOT NULL,
  title text NOT NULL,
  description text,
  due_on date,
  status text DEFAULT 'published'::text NOT NULL,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  accepts_late boolean DEFAULT true NOT NULL,
  assessment_item_id uuid,
  CONSTRAINT siga_class_tasks_description_check CHECK (((description IS NULL) OR (char_length(description) <= 2000))),
  CONSTRAINT siga_class_tasks_kind_check CHECK ((kind = ANY (ARRAY['tpc'::text, 'trabalho'::text, 'leitura'::text, 'projecto'::text, 'pesquisa'::text, 'outra'::text]))),
  CONSTRAINT siga_class_tasks_status_check CHECK ((status = ANY (ARRAY['published'::text, 'archived'::text]))),
  CONSTRAINT siga_class_tasks_title_check CHECK (((char_length(title) >= 2) AND (char_length(title) <= 160))),
  CONSTRAINT siga_class_tasks_pkey PRIMARY KEY (id)
);
ALTER TABLE public.siga_class_tasks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS ix_fk_siga_class_tasks_class_subject_id_2d68bc ON public.siga_class_tasks USING btree (class_subject_id);
CREATE INDEX IF NOT EXISTS ix_fk_siga_class_tasks_timetable_slot_id_20893b ON public.siga_class_tasks USING btree (timetable_slot_id);
CREATE INDEX IF NOT EXISTS siga_class_tasks_class_subject_idx ON public.siga_class_tasks USING btree (school_id, class_subject_id, due_on);

-- siga_class_task_submissions
CREATE TABLE IF NOT EXISTS public.siga_class_task_submissions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  task_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  attempt smallint DEFAULT 1 NOT NULL,
  status text DEFAULT 'submitted'::text NOT NULL,
  body text,
  file_id uuid,
  on_paper boolean DEFAULT false NOT NULL,
  submitted_at timestamp with time zone,
  is_late boolean DEFAULT false NOT NULL,
  grade numeric(6,2),
  feedback text,
  graded_by uuid,
  returned_at timestamp with time zone,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT siga_class_task_submissions_attempt_check CHECK (((attempt >= 1) AND (attempt <= 20))),
  CONSTRAINT siga_class_task_submissions_body_check CHECK (((body IS NULL) OR (char_length(body) <= 4000))),
  CONSTRAINT siga_class_task_submissions_feedback_check CHECK (((feedback IS NULL) OR (char_length(feedback) <= 2000))),
  CONSTRAINT siga_class_task_submissions_grade_check CHECK (((grade IS NULL) OR (grade >= (0)::numeric))),
  CONSTRAINT siga_class_task_submissions_returned_check CHECK (((status <> 'returned'::text) OR (returned_at IS NOT NULL))),
  CONSTRAINT siga_class_task_submissions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'returned'::text]))),
  CONSTRAINT siga_class_task_submissions_submitted_check CHECK (((status = 'draft'::text) OR (submitted_at IS NOT NULL))),
  CONSTRAINT siga_class_task_submissions_pkey PRIMARY KEY (id),
  CONSTRAINT siga_class_task_submissions_attempt_key UNIQUE (task_id, enrollment_id, attempt)
);
ALTER TABLE public.siga_class_task_submissions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS siga_class_task_submissions_enrollment_idx ON public.siga_class_task_submissions USING btree (school_id, enrollment_id);
CREATE INDEX IF NOT EXISTS siga_class_task_submissions_task_idx ON public.siga_class_task_submissions USING btree (task_id, status);

-- siga_exam_sessions — Épocas de exame (recurso, especial, final, melhoria) por ano lectivo. Só o servidor.
CREATE TABLE IF NOT EXISTS public.siga_exam_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  kind text NOT NULL,
  name text NOT NULL,
  starts_on date,
  ends_on date,
  max_failed_subjects integer,
  result_method text DEFAULT 'replace'::text NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT siga_exam_sessions_dates_check CHECK (((starts_on IS NULL) OR (ends_on IS NULL) OR (ends_on >= starts_on))),
  CONSTRAINT siga_exam_sessions_kind_check CHECK ((kind = ANY (ARRAY['recurso'::text, 'exame_especial'::text, 'exame_final'::text, 'melhoria'::text]))),
  CONSTRAINT siga_exam_sessions_max_failed_subjects_check CHECK (((max_failed_subjects IS NULL) OR ((max_failed_subjects >= 1) AND (max_failed_subjects <= 30)))),
  CONSTRAINT siga_exam_sessions_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 120))),
  CONSTRAINT siga_exam_sessions_result_method_check CHECK ((result_method = ANY (ARRAY['replace'::text, 'average'::text, 'max'::text]))),
  CONSTRAINT siga_exam_sessions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'closed'::text]))),
  CONSTRAINT siga_exam_sessions_pkey PRIMARY KEY (id)
);
ALTER TABLE public.siga_exam_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS siga_exam_sessions_school_year_idx ON public.siga_exam_sessions USING btree (school_id, academic_year_id, created_at DESC);
CREATE INDEX IF NOT EXISTS siga_exam_sessions_year_idx ON public.siga_exam_sessions USING btree (academic_year_id);

-- siga_attendance_sessions
CREATE TABLE IF NOT EXISTS public.siga_attendance_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  academic_year_id uuid,
  class_group_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  teacher_id uuid,
  timetable_slot_id uuid,
  lesson_date date DEFAULT CURRENT_DATE NOT NULL,
  period_number integer DEFAULT 1 NOT NULL,
  starts_at text,
  ends_at text,
  status text DEFAULT 'pending'::text NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid,
  CONSTRAINT siga_attendance_sessions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'cancelled'::text]))),
  CONSTRAINT siga_attendance_sessions_pkey PRIMARY KEY (id)
);
ALTER TABLE public.siga_attendance_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS ix_fk_siga_attendance_sessions_academic_year_id_0fc836 ON public.siga_attendance_sessions USING btree (academic_year_id);
CREATE INDEX IF NOT EXISTS ix_fk_siga_attendance_sessions_class_group_id_8e041a ON public.siga_attendance_sessions USING btree (class_group_id);
CREATE INDEX IF NOT EXISTS ix_fk_siga_attendance_sessions_subject_id_35906d ON public.siga_attendance_sessions USING btree (subject_id);
CREATE INDEX IF NOT EXISTS ix_fk_siga_attendance_sessions_teacher_id_012368 ON public.siga_attendance_sessions USING btree (teacher_id);
CREATE INDEX IF NOT EXISTS ix_fk_siga_attendance_sessions_timetable_slot_id_55221e ON public.siga_attendance_sessions USING btree (timetable_slot_id);
CREATE INDEX IF NOT EXISTS siga_attendance_sessions_school_class_date_idx ON public.siga_attendance_sessions USING btree (school_id, class_group_id, lesson_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS siga_attendance_sessions_school_slot_day_key ON public.siga_attendance_sessions USING btree (school_id, timetable_slot_id, lesson_date);
CREATE INDEX IF NOT EXISTS siga_attendance_sessions_teacher_date_idx ON public.siga_attendance_sessions USING btree (school_id, teacher_id, lesson_date DESC);

-- siga_attendance_records
CREATE TABLE IF NOT EXISTS public.siga_attendance_records (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  session_id uuid NOT NULL,
  student_id uuid NOT NULL,
  status text DEFAULT 'not_registered'::text NOT NULL,
  notes text,
  recorded_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT siga_attendance_records_status_check CHECK ((status = ANY (ARRAY['present'::text, 'absent'::text, 'excused'::text, 'late'::text, 'early_exit'::text, 'not_registered'::text]))),
  CONSTRAINT siga_attendance_records_pkey PRIMARY KEY (id),
  CONSTRAINT siga_attendance_records_session_id_student_id_key UNIQUE (session_id, student_id)
);
ALTER TABLE public.siga_attendance_records ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS ix_fk_siga_attendance_records_student_id_7f9c81 ON public.siga_attendance_records USING btree (student_id);
CREATE INDEX IF NOT EXISTS siga_attendance_records_student_idx ON public.siga_attendance_records USING btree (school_id, student_id, created_at DESC);

-- siga_lesson_meetings
CREATE TABLE IF NOT EXISTS public.siga_lesson_meetings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  school_id uuid NOT NULL,
  attendance_session_id uuid NOT NULL,
  provider text DEFAULT 'zoom'::text NOT NULL,
  external_meeting_id text NOT NULL,
  join_url text NOT NULL,
  topic text,
  starts_at timestamp with time zone,
  duration_minutes integer,
  status text DEFAULT 'active'::text NOT NULL,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT siga_lesson_meetings_duration_check CHECK (((duration_minutes IS NULL) OR (duration_minutes > 0))),
  CONSTRAINT siga_lesson_meetings_provider_check CHECK ((provider = 'zoom'::text)),
  CONSTRAINT siga_lesson_meetings_status_check CHECK ((status = ANY (ARRAY['active'::text, 'cancelled'::text, 'ended'::text]))),
  CONSTRAINT siga_lesson_meetings_pkey PRIMARY KEY (id),
  CONSTRAINT siga_lesson_meetings_unique_provider_meeting UNIQUE (provider, external_meeting_id),
  CONSTRAINT siga_lesson_meetings_unique_session_provider UNIQUE (attendance_session_id, provider)
);
ALTER TABLE public.siga_lesson_meetings ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_siga_lesson_meetings_school ON public.siga_lesson_meetings USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_siga_lesson_meetings_session ON public.siga_lesson_meetings USING btree (attendance_session_id);

-- audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  school_id uuid NOT NULL,
  actor_user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  request_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  occurred_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS audit_logs_actor_user_id_idx ON public.audit_logs USING btree (actor_user_id);
CREATE INDEX IF NOT EXISTS audit_logs_issued_document_code_idx ON public.audit_logs USING btree (((metadata ->> 'code'::text))) WHERE (action = 'documents.issued'::text);
CREATE INDEX IF NOT EXISTS audit_logs_school_id_idx ON public.audit_logs USING btree (school_id);
CREATE INDEX IF NOT EXISTS audit_logs_school_time_idx ON public.audit_logs USING btree (school_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_student_request_idx ON public.audit_logs USING btree (school_id, actor_user_id, request_id) WHERE (action = 'students.enrollment_created'::text);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. CHAVES ESTRANGEIRAS (adiadas — independentes da ordem das tabelas)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schools_tenant_id_fkey'
      AND conrelid = 'public.schools'::regclass
  ) THEN
    ALTER TABLE public.schools ADD CONSTRAINT schools_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'school_memberships_school_id_fkey'
      AND conrelid = 'public.school_memberships'::regclass
  ) THEN
    ALTER TABLE public.school_memberships ADD CONSTRAINT school_memberships_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'school_memberships_user_id_fkey'
      AND conrelid = 'public.school_memberships'::regclass
  ) THEN
    ALTER TABLE public.school_memberships ADD CONSTRAINT school_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'roles_school_id_fkey'
      AND conrelid = 'public.roles'::regclass
  ) THEN
    ALTER TABLE public.roles ADD CONSTRAINT roles_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'member_roles_membership_id_fkey'
      AND conrelid = 'public.member_roles'::regclass
  ) THEN
    ALTER TABLE public.member_roles ADD CONSTRAINT member_roles_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES school_memberships(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'member_roles_role_id_fkey'
      AND conrelid = 'public.member_roles'::regclass
  ) THEN
    ALTER TABLE public.member_roles ADD CONSTRAINT member_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'member_roles_school_id_fkey'
      AND conrelid = 'public.member_roles'::regclass
  ) THEN
    ALTER TABLE public.member_roles ADD CONSTRAINT member_roles_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'member_roles_school_id_membership_id_fkey'
      AND conrelid = 'public.member_roles'::regclass
  ) THEN
    ALTER TABLE public.member_roles ADD CONSTRAINT member_roles_school_id_membership_id_fkey FOREIGN KEY (school_id, membership_id) REFERENCES school_memberships(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'member_roles_school_id_role_id_fkey'
      AND conrelid = 'public.member_roles'::regclass
  ) THEN
    ALTER TABLE public.member_roles ADD CONSTRAINT member_roles_school_id_role_id_fkey FOREIGN KEY (school_id, role_id) REFERENCES roles(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'academic_years_created_by_fkey'
      AND conrelid = 'public.academic_years'::regclass
  ) THEN
    ALTER TABLE public.academic_years ADD CONSTRAINT academic_years_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'academic_years_school_id_fkey'
      AND conrelid = 'public.academic_years'::regclass
  ) THEN
    ALTER TABLE public.academic_years ADD CONSTRAINT academic_years_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'academic_years_updated_by_fkey'
      AND conrelid = 'public.academic_years'::regclass
  ) THEN
    ALTER TABLE public.academic_years ADD CONSTRAINT academic_years_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'terms_created_by_fkey'
      AND conrelid = 'public.terms'::regclass
  ) THEN
    ALTER TABLE public.terms ADD CONSTRAINT terms_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'terms_school_id_academic_year_id_fkey'
      AND conrelid = 'public.terms'::regclass
  ) THEN
    ALTER TABLE public.terms ADD CONSTRAINT terms_school_id_academic_year_id_fkey FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'terms_school_id_fkey'
      AND conrelid = 'public.terms'::regclass
  ) THEN
    ALTER TABLE public.terms ADD CONSTRAINT terms_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'terms_updated_by_fkey'
      AND conrelid = 'public.terms'::regclass
  ) THEN
    ALTER TABLE public.terms ADD CONSTRAINT terms_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campuses_school_id_fkey'
      AND conrelid = 'public.campuses'::regclass
  ) THEN
    ALTER TABLE public.campuses ADD CONSTRAINT campuses_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'school_shifts_created_by_fkey'
      AND conrelid = 'public.school_shifts'::regclass
  ) THEN
    ALTER TABLE public.school_shifts ADD CONSTRAINT school_shifts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'school_shifts_school_id_fkey'
      AND conrelid = 'public.school_shifts'::regclass
  ) THEN
    ALTER TABLE public.school_shifts ADD CONSTRAINT school_shifts_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'school_shifts_updated_by_fkey'
      AND conrelid = 'public.school_shifts'::regclass
  ) THEN
    ALTER TABLE public.school_shifts ADD CONSTRAINT school_shifts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'academic_levels_school_id_fkey'
      AND conrelid = 'public.academic_levels'::regclass
  ) THEN
    ALTER TABLE public.academic_levels ADD CONSTRAINT academic_levels_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'programs_school_id_academic_level_id_fkey'
      AND conrelid = 'public.programs'::regclass
  ) THEN
    ALTER TABLE public.programs ADD CONSTRAINT programs_school_id_academic_level_id_fkey FOREIGN KEY (school_id, academic_level_id) REFERENCES academic_levels(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'programs_school_id_fkey'
      AND conrelid = 'public.programs'::regclass
  ) THEN
    ALTER TABLE public.programs ADD CONSTRAINT programs_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grade_levels_school_id_fkey'
      AND conrelid = 'public.grade_levels'::regclass
  ) THEN
    ALTER TABLE public.grade_levels ADD CONSTRAINT grade_levels_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grade_levels_school_id_program_id_fkey'
      AND conrelid = 'public.grade_levels'::regclass
  ) THEN
    ALTER TABLE public.grade_levels ADD CONSTRAINT grade_levels_school_id_program_id_fkey FOREIGN KEY (school_id, program_id) REFERENCES programs(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subjects_created_by_fkey'
      AND conrelid = 'public.subjects'::regclass
  ) THEN
    ALTER TABLE public.subjects ADD CONSTRAINT subjects_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subjects_curriculum_area_id_fkey'
      AND conrelid = 'public.subjects'::regclass
  ) THEN
    ALTER TABLE public.subjects ADD CONSTRAINT subjects_curriculum_area_id_fkey FOREIGN KEY (curriculum_area_id) REFERENCES curriculum_areas(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subjects_school_id_fkey'
      AND conrelid = 'public.subjects'::regclass
  ) THEN
    ALTER TABLE public.subjects ADD CONSTRAINT subjects_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subjects_subject_type_id_fkey'
      AND conrelid = 'public.subjects'::regclass
  ) THEN
    ALTER TABLE public.subjects ADD CONSTRAINT subjects_subject_type_id_fkey FOREIGN KEY (subject_type_id) REFERENCES subject_types(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subjects_updated_by_fkey'
      AND conrelid = 'public.subjects'::regclass
  ) THEN
    ALTER TABLE public.subjects ADD CONSTRAINT subjects_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'people_created_by_fkey'
      AND conrelid = 'public.people'::regclass
  ) THEN
    ALTER TABLE public.people ADD CONSTRAINT people_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'people_school_id_fkey'
      AND conrelid = 'public.people'::regclass
  ) THEN
    ALTER TABLE public.people ADD CONSTRAINT people_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'people_updated_by_fkey'
      AND conrelid = 'public.people'::regclass
  ) THEN
    ALTER TABLE public.people ADD CONSTRAINT people_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'people_user_id_fkey'
      AND conrelid = 'public.people'::regclass
  ) THEN
    ALTER TABLE public.people ADD CONSTRAINT people_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teachers_created_by_fkey'
      AND conrelid = 'public.teachers'::regclass
  ) THEN
    ALTER TABLE public.teachers ADD CONSTRAINT teachers_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teachers_school_id_fkey'
      AND conrelid = 'public.teachers'::regclass
  ) THEN
    ALTER TABLE public.teachers ADD CONSTRAINT teachers_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teachers_school_id_person_id_fkey'
      AND conrelid = 'public.teachers'::regclass
  ) THEN
    ALTER TABLE public.teachers ADD CONSTRAINT teachers_school_id_person_id_fkey FOREIGN KEY (school_id, person_id) REFERENCES people(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teachers_updated_by_fkey'
      AND conrelid = 'public.teachers'::regclass
  ) THEN
    ALTER TABLE public.teachers ADD CONSTRAINT teachers_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teachers_user_id_fkey'
      AND conrelid = 'public.teachers'::regclass
  ) THEN
    ALTER TABLE public.teachers ADD CONSTRAINT teachers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'students_created_by_fkey'
      AND conrelid = 'public.students'::regclass
  ) THEN
    ALTER TABLE public.students ADD CONSTRAINT students_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'students_school_id_fkey'
      AND conrelid = 'public.students'::regclass
  ) THEN
    ALTER TABLE public.students ADD CONSTRAINT students_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'students_school_id_person_id_fkey'
      AND conrelid = 'public.students'::regclass
  ) THEN
    ALTER TABLE public.students ADD CONSTRAINT students_school_id_person_id_fkey FOREIGN KEY (school_id, person_id) REFERENCES people(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'students_updated_by_fkey'
      AND conrelid = 'public.students'::regclass
  ) THEN
    ALTER TABLE public.students ADD CONSTRAINT students_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'enrollments_created_by_fkey'
      AND conrelid = 'public.enrollments'::regclass
  ) THEN
    ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'enrollments_school_id_academic_year_id_fkey'
      AND conrelid = 'public.enrollments'::regclass
  ) THEN
    ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_school_id_academic_year_id_fkey FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'enrollments_school_id_class_group_id_fkey'
      AND conrelid = 'public.enrollments'::regclass
  ) THEN
    ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_school_id_class_group_id_fkey FOREIGN KEY (school_id, class_group_id) REFERENCES class_groups(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'enrollments_school_id_fkey'
      AND conrelid = 'public.enrollments'::regclass
  ) THEN
    ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'enrollments_school_id_student_id_fkey'
      AND conrelid = 'public.enrollments'::regclass
  ) THEN
    ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_school_id_student_id_fkey FOREIGN KEY (school_id, student_id) REFERENCES students(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'enrollments_updated_by_fkey'
      AND conrelid = 'public.enrollments'::regclass
  ) THEN
    ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rooms_created_by_fkey'
      AND conrelid = 'public.rooms'::regclass
  ) THEN
    ALTER TABLE public.rooms ADD CONSTRAINT rooms_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rooms_school_id_fkey'
      AND conrelid = 'public.rooms'::regclass
  ) THEN
    ALTER TABLE public.rooms ADD CONSTRAINT rooms_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rooms_updated_by_fkey'
      AND conrelid = 'public.rooms'::regclass
  ) THEN
    ALTER TABLE public.rooms ADD CONSTRAINT rooms_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_groups_created_by_fkey'
      AND conrelid = 'public.class_groups'::regclass
  ) THEN
    ALTER TABLE public.class_groups ADD CONSTRAINT class_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_groups_delegate_student_fk'
      AND conrelid = 'public.class_groups'::regclass
  ) THEN
    ALTER TABLE public.class_groups ADD CONSTRAINT class_groups_delegate_student_fk FOREIGN KEY (school_id, delegate_student_id) REFERENCES students(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_groups_school_id_academic_year_id_fkey'
      AND conrelid = 'public.class_groups'::regclass
  ) THEN
    ALTER TABLE public.class_groups ADD CONSTRAINT class_groups_school_id_academic_year_id_fkey FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_groups_school_id_campus_id_fkey'
      AND conrelid = 'public.class_groups'::regclass
  ) THEN
    ALTER TABLE public.class_groups ADD CONSTRAINT class_groups_school_id_campus_id_fkey FOREIGN KEY (school_id, campus_id) REFERENCES campuses(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_groups_school_id_fkey'
      AND conrelid = 'public.class_groups'::regclass
  ) THEN
    ALTER TABLE public.class_groups ADD CONSTRAINT class_groups_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_groups_school_id_grade_level_id_fkey'
      AND conrelid = 'public.class_groups'::regclass
  ) THEN
    ALTER TABLE public.class_groups ADD CONSTRAINT class_groups_school_id_grade_level_id_fkey FOREIGN KEY (school_id, grade_level_id) REFERENCES grade_levels(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_groups_school_id_homeroom_teacher_id_fkey'
      AND conrelid = 'public.class_groups'::regclass
  ) THEN
    ALTER TABLE public.class_groups ADD CONSTRAINT class_groups_school_id_homeroom_teacher_id_fkey FOREIGN KEY (school_id, homeroom_teacher_id) REFERENCES teachers(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_groups_school_id_room_id_fkey'
      AND conrelid = 'public.class_groups'::regclass
  ) THEN
    ALTER TABLE public.class_groups ADD CONSTRAINT class_groups_school_id_room_id_fkey FOREIGN KEY (school_id, room_id) REFERENCES rooms(school_id, id) ON DELETE SET NULL (room_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_groups_updated_by_fkey'
      AND conrelid = 'public.class_groups'::regclass
  ) THEN
    ALTER TABLE public.class_groups ADD CONSTRAINT class_groups_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_subjects_created_by_fkey'
      AND conrelid = 'public.class_subjects'::regclass
  ) THEN
    ALTER TABLE public.class_subjects ADD CONSTRAINT class_subjects_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_subjects_school_id_class_group_id_fkey'
      AND conrelid = 'public.class_subjects'::regclass
  ) THEN
    ALTER TABLE public.class_subjects ADD CONSTRAINT class_subjects_school_id_class_group_id_fkey FOREIGN KEY (school_id, class_group_id) REFERENCES class_groups(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_subjects_school_id_fkey'
      AND conrelid = 'public.class_subjects'::regclass
  ) THEN
    ALTER TABLE public.class_subjects ADD CONSTRAINT class_subjects_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_subjects_school_id_subject_id_fkey'
      AND conrelid = 'public.class_subjects'::regclass
  ) THEN
    ALTER TABLE public.class_subjects ADD CONSTRAINT class_subjects_school_id_subject_id_fkey FOREIGN KEY (school_id, subject_id) REFERENCES subjects(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_subjects_school_id_teacher_id_fkey'
      AND conrelid = 'public.class_subjects'::regclass
  ) THEN
    ALTER TABLE public.class_subjects ADD CONSTRAINT class_subjects_school_id_teacher_id_fkey FOREIGN KEY (school_id, teacher_id) REFERENCES teachers(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_subjects_updated_by_fkey'
      AND conrelid = 'public.class_subjects'::regclass
  ) THEN
    ALTER TABLE public.class_subjects ADD CONSTRAINT class_subjects_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'academic_schedules_academic_year_id_fkey'
      AND conrelid = 'public.academic_schedules'::regclass
  ) THEN
    ALTER TABLE public.academic_schedules ADD CONSTRAINT academic_schedules_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'academic_schedules_class_group_id_fkey'
      AND conrelid = 'public.academic_schedules'::regclass
  ) THEN
    ALTER TABLE public.academic_schedules ADD CONSTRAINT academic_schedules_class_group_id_fkey FOREIGN KEY (class_group_id) REFERENCES class_groups(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'academic_schedules_created_by_fkey'
      AND conrelid = 'public.academic_schedules'::regclass
  ) THEN
    ALTER TABLE public.academic_schedules ADD CONSTRAINT academic_schedules_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'academic_schedules_published_by_fkey'
      AND conrelid = 'public.academic_schedules'::regclass
  ) THEN
    ALTER TABLE public.academic_schedules ADD CONSTRAINT academic_schedules_published_by_fkey FOREIGN KEY (published_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'academic_schedules_school_id_fkey'
      AND conrelid = 'public.academic_schedules'::regclass
  ) THEN
    ALTER TABLE public.academic_schedules ADD CONSTRAINT academic_schedules_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'academic_schedules_shift_id_fkey'
      AND conrelid = 'public.academic_schedules'::regclass
  ) THEN
    ALTER TABLE public.academic_schedules ADD CONSTRAINT academic_schedules_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES school_shifts(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'academic_schedules_updated_by_fkey'
      AND conrelid = 'public.academic_schedules'::regclass
  ) THEN
    ALTER TABLE public.academic_schedules ADD CONSTRAINT academic_schedules_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'timetable_slots_created_by_fkey'
      AND conrelid = 'public.timetable_slots'::regclass
  ) THEN
    ALTER TABLE public.timetable_slots ADD CONSTRAINT timetable_slots_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'timetable_slots_room_id_fkey'
      AND conrelid = 'public.timetable_slots'::regclass
  ) THEN
    ALTER TABLE public.timetable_slots ADD CONSTRAINT timetable_slots_room_id_fkey FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'timetable_slots_schedule_id_fkey'
      AND conrelid = 'public.timetable_slots'::regclass
  ) THEN
    ALTER TABLE public.timetable_slots ADD CONSTRAINT timetable_slots_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES academic_schedules(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'timetable_slots_school_id_class_subject_id_fkey'
      AND conrelid = 'public.timetable_slots'::regclass
  ) THEN
    ALTER TABLE public.timetable_slots ADD CONSTRAINT timetable_slots_school_id_class_subject_id_fkey FOREIGN KEY (school_id, class_subject_id) REFERENCES class_subjects(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'timetable_slots_school_id_fkey'
      AND conrelid = 'public.timetable_slots'::regclass
  ) THEN
    ALTER TABLE public.timetable_slots ADD CONSTRAINT timetable_slots_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'timetable_slots_shift_id_fkey'
      AND conrelid = 'public.timetable_slots'::regclass
  ) THEN
    ALTER TABLE public.timetable_slots ADD CONSTRAINT timetable_slots_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES school_shifts(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'timetable_slots_updated_by_fkey'
      AND conrelid = 'public.timetable_slots'::regclass
  ) THEN
    ALTER TABLE public.timetable_slots ADD CONSTRAINT timetable_slots_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_timetable_slot_details_created_by_fkey'
      AND conrelid = 'public.siga_timetable_slot_details'::regclass
  ) THEN
    ALTER TABLE public.siga_timetable_slot_details ADD CONSTRAINT siga_timetable_slot_details_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_timetable_slot_details_school_id_fkey'
      AND conrelid = 'public.siga_timetable_slot_details'::regclass
  ) THEN
    ALTER TABLE public.siga_timetable_slot_details ADD CONSTRAINT siga_timetable_slot_details_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_timetable_slot_details_timetable_slot_id_fkey'
      AND conrelid = 'public.siga_timetable_slot_details'::regclass
  ) THEN
    ALTER TABLE public.siga_timetable_slot_details ADD CONSTRAINT siga_timetable_slot_details_timetable_slot_id_fkey FOREIGN KEY (timetable_slot_id) REFERENCES timetable_slots(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_timetable_slot_details_updated_by_fkey'
      AND conrelid = 'public.siga_timetable_slot_details'::regclass
  ) THEN
    ALTER TABLE public.siga_timetable_slot_details ADD CONSTRAINT siga_timetable_slot_details_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_calendar_events_created_by_fkey'
      AND conrelid = 'public.siga_calendar_events'::regclass
  ) THEN
    ALTER TABLE public.siga_calendar_events ADD CONSTRAINT siga_calendar_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_calendar_events_group_fkey'
      AND conrelid = 'public.siga_calendar_events'::regclass
  ) THEN
    ALTER TABLE public.siga_calendar_events ADD CONSTRAINT siga_calendar_events_group_fkey FOREIGN KEY (school_id, class_group_id) REFERENCES class_groups(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_calendar_events_school_id_fkey'
      AND conrelid = 'public.siga_calendar_events'::regclass
  ) THEN
    ALTER TABLE public.siga_calendar_events ADD CONSTRAINT siga_calendar_events_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_calendar_events_teacher_fkey'
      AND conrelid = 'public.siga_calendar_events'::regclass
  ) THEN
    ALTER TABLE public.siga_calendar_events ADD CONSTRAINT siga_calendar_events_teacher_fkey FOREIGN KEY (school_id, teacher_id) REFERENCES teachers(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_calendar_events_updated_by_fkey'
      AND conrelid = 'public.siga_calendar_events'::regclass
  ) THEN
    ALTER TABLE public.siga_calendar_events ADD CONSTRAINT siga_calendar_events_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_calendar_events_year_fkey'
      AND conrelid = 'public.siga_calendar_events'::regclass
  ) THEN
    ALTER TABLE public.siga_calendar_events ADD CONSTRAINT siga_calendar_events_year_fkey FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years(school_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_assessment_items_created_by_fkey'
      AND conrelid = 'public.siga_assessment_items'::regclass
  ) THEN
    ALTER TABLE public.siga_assessment_items ADD CONSTRAINT siga_assessment_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_assessment_items_lesson_plan_component_id_fkey'
      AND conrelid = 'public.siga_assessment_items'::regclass
  ) THEN
    ALTER TABLE public.siga_assessment_items ADD CONSTRAINT siga_assessment_items_lesson_plan_component_id_fkey FOREIGN KEY (lesson_plan_component_id) REFERENCES siga_lesson_plan_components(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_assessment_items_school_id_fkey'
      AND conrelid = 'public.siga_assessment_items'::regclass
  ) THEN
    ALTER TABLE public.siga_assessment_items ADD CONSTRAINT siga_assessment_items_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_assessment_items_updated_by_fkey'
      AND conrelid = 'public.siga_assessment_items'::regclass
  ) THEN
    ALTER TABLE public.siga_assessment_items ADD CONSTRAINT siga_assessment_items_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_assessment_scores_item_id_fkey'
      AND conrelid = 'public.siga_assessment_scores'::regclass
  ) THEN
    ALTER TABLE public.siga_assessment_scores ADD CONSTRAINT siga_assessment_scores_item_id_fkey FOREIGN KEY (item_id) REFERENCES siga_assessment_items(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_assessment_scores_recorded_by_fkey'
      AND conrelid = 'public.siga_assessment_scores'::regclass
  ) THEN
    ALTER TABLE public.siga_assessment_scores ADD CONSTRAINT siga_assessment_scores_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_assessment_scores_school_id_fkey'
      AND conrelid = 'public.siga_assessment_scores'::regclass
  ) THEN
    ALTER TABLE public.siga_assessment_scores ADD CONSTRAINT siga_assessment_scores_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_class_tasks_assessment_item_id_fkey'
      AND conrelid = 'public.siga_class_tasks'::regclass
  ) THEN
    ALTER TABLE public.siga_class_tasks ADD CONSTRAINT siga_class_tasks_assessment_item_id_fkey FOREIGN KEY (assessment_item_id) REFERENCES siga_assessment_items(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_class_tasks_class_subject_id_fkey'
      AND conrelid = 'public.siga_class_tasks'::regclass
  ) THEN
    ALTER TABLE public.siga_class_tasks ADD CONSTRAINT siga_class_tasks_class_subject_id_fkey FOREIGN KEY (class_subject_id) REFERENCES class_subjects(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_class_tasks_created_by_fkey'
      AND conrelid = 'public.siga_class_tasks'::regclass
  ) THEN
    ALTER TABLE public.siga_class_tasks ADD CONSTRAINT siga_class_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_class_tasks_school_id_fkey'
      AND conrelid = 'public.siga_class_tasks'::regclass
  ) THEN
    ALTER TABLE public.siga_class_tasks ADD CONSTRAINT siga_class_tasks_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_class_tasks_timetable_slot_id_fkey'
      AND conrelid = 'public.siga_class_tasks'::regclass
  ) THEN
    ALTER TABLE public.siga_class_tasks ADD CONSTRAINT siga_class_tasks_timetable_slot_id_fkey FOREIGN KEY (timetable_slot_id) REFERENCES timetable_slots(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_class_tasks_updated_by_fkey'
      AND conrelid = 'public.siga_class_tasks'::regclass
  ) THEN
    ALTER TABLE public.siga_class_tasks ADD CONSTRAINT siga_class_tasks_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_class_task_submissions_created_by_fkey'
      AND conrelid = 'public.siga_class_task_submissions'::regclass
  ) THEN
    ALTER TABLE public.siga_class_task_submissions ADD CONSTRAINT siga_class_task_submissions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_class_task_submissions_enrollment_id_fkey'
      AND conrelid = 'public.siga_class_task_submissions'::regclass
  ) THEN
    ALTER TABLE public.siga_class_task_submissions ADD CONSTRAINT siga_class_task_submissions_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_class_task_submissions_file_id_fkey'
      AND conrelid = 'public.siga_class_task_submissions'::regclass
  ) THEN
    ALTER TABLE public.siga_class_task_submissions ADD CONSTRAINT siga_class_task_submissions_file_id_fkey FOREIGN KEY (file_id) REFERENCES siga_files(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_class_task_submissions_graded_by_fkey'
      AND conrelid = 'public.siga_class_task_submissions'::regclass
  ) THEN
    ALTER TABLE public.siga_class_task_submissions ADD CONSTRAINT siga_class_task_submissions_graded_by_fkey FOREIGN KEY (graded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_class_task_submissions_school_id_fkey'
      AND conrelid = 'public.siga_class_task_submissions'::regclass
  ) THEN
    ALTER TABLE public.siga_class_task_submissions ADD CONSTRAINT siga_class_task_submissions_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_class_task_submissions_task_id_fkey'
      AND conrelid = 'public.siga_class_task_submissions'::regclass
  ) THEN
    ALTER TABLE public.siga_class_task_submissions ADD CONSTRAINT siga_class_task_submissions_task_id_fkey FOREIGN KEY (task_id) REFERENCES siga_class_tasks(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_class_task_submissions_updated_by_fkey'
      AND conrelid = 'public.siga_class_task_submissions'::regclass
  ) THEN
    ALTER TABLE public.siga_class_task_submissions ADD CONSTRAINT siga_class_task_submissions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_exam_sessions_academic_year_id_fkey'
      AND conrelid = 'public.siga_exam_sessions'::regclass
  ) THEN
    ALTER TABLE public.siga_exam_sessions ADD CONSTRAINT siga_exam_sessions_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_exam_sessions_school_id_fkey'
      AND conrelid = 'public.siga_exam_sessions'::regclass
  ) THEN
    ALTER TABLE public.siga_exam_sessions ADD CONSTRAINT siga_exam_sessions_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_attendance_sessions_academic_year_id_fkey'
      AND conrelid = 'public.siga_attendance_sessions'::regclass
  ) THEN
    ALTER TABLE public.siga_attendance_sessions ADD CONSTRAINT siga_attendance_sessions_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_attendance_sessions_class_group_id_fkey'
      AND conrelid = 'public.siga_attendance_sessions'::regclass
  ) THEN
    ALTER TABLE public.siga_attendance_sessions ADD CONSTRAINT siga_attendance_sessions_class_group_id_fkey FOREIGN KEY (class_group_id) REFERENCES class_groups(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_attendance_sessions_created_by_fkey'
      AND conrelid = 'public.siga_attendance_sessions'::regclass
  ) THEN
    ALTER TABLE public.siga_attendance_sessions ADD CONSTRAINT siga_attendance_sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_attendance_sessions_school_id_fkey'
      AND conrelid = 'public.siga_attendance_sessions'::regclass
  ) THEN
    ALTER TABLE public.siga_attendance_sessions ADD CONSTRAINT siga_attendance_sessions_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_attendance_sessions_subject_id_fkey'
      AND conrelid = 'public.siga_attendance_sessions'::regclass
  ) THEN
    ALTER TABLE public.siga_attendance_sessions ADD CONSTRAINT siga_attendance_sessions_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_attendance_sessions_teacher_id_fkey'
      AND conrelid = 'public.siga_attendance_sessions'::regclass
  ) THEN
    ALTER TABLE public.siga_attendance_sessions ADD CONSTRAINT siga_attendance_sessions_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_attendance_sessions_timetable_slot_id_fkey'
      AND conrelid = 'public.siga_attendance_sessions'::regclass
  ) THEN
    ALTER TABLE public.siga_attendance_sessions ADD CONSTRAINT siga_attendance_sessions_timetable_slot_id_fkey FOREIGN KEY (timetable_slot_id) REFERENCES timetable_slots(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_attendance_sessions_updated_by_fkey'
      AND conrelid = 'public.siga_attendance_sessions'::regclass
  ) THEN
    ALTER TABLE public.siga_attendance_sessions ADD CONSTRAINT siga_attendance_sessions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_attendance_records_recorded_by_fkey'
      AND conrelid = 'public.siga_attendance_records'::regclass
  ) THEN
    ALTER TABLE public.siga_attendance_records ADD CONSTRAINT siga_attendance_records_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_attendance_records_school_id_fkey'
      AND conrelid = 'public.siga_attendance_records'::regclass
  ) THEN
    ALTER TABLE public.siga_attendance_records ADD CONSTRAINT siga_attendance_records_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_attendance_records_session_id_fkey'
      AND conrelid = 'public.siga_attendance_records'::regclass
  ) THEN
    ALTER TABLE public.siga_attendance_records ADD CONSTRAINT siga_attendance_records_session_id_fkey FOREIGN KEY (session_id) REFERENCES siga_attendance_sessions(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_attendance_records_student_id_fkey'
      AND conrelid = 'public.siga_attendance_records'::regclass
  ) THEN
    ALTER TABLE public.siga_attendance_records ADD CONSTRAINT siga_attendance_records_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_lesson_meetings_attendance_session_id_fkey'
      AND conrelid = 'public.siga_lesson_meetings'::regclass
  ) THEN
    ALTER TABLE public.siga_lesson_meetings ADD CONSTRAINT siga_lesson_meetings_attendance_session_id_fkey FOREIGN KEY (attendance_session_id) REFERENCES siga_attendance_sessions(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'siga_lesson_meetings_school_id_fkey'
      AND conrelid = 'public.siga_lesson_meetings'::regclass
  ) THEN
    ALTER TABLE public.siga_lesson_meetings ADD CONSTRAINT siga_lesson_meetings_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_actor_user_id_fkey'
      AND conrelid = 'public.audit_logs'::regclass
  ) THEN
    ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_school_id_fkey'
      AND conrelid = 'public.audit_logs'::regclass
  ) THEN
    ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
  END IF;
END $$;
