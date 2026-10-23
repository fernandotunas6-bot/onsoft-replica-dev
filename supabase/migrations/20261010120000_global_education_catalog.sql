-- SIGA Plus — catálogo educacional global (camadas 1 e 2) e sequências de
-- identificadores curtos.
--
-- Camada 1 (global): fontes, níveis ISCED 2011, áreas ISCED-F 2013, países,
-- disciplinas e cursos de referência.
-- Camada 2 (nacional): etapas de ensino por país e entradas de plano
-- curricular (disciplinas por curso/classe), versionadas e com fonte.
-- A camada 3 (escola) já existe: academic_levels, programs, grade_levels,
-- subjects, curricula, curriculum_subjects. Não se duplica nada aqui.
--
-- Os dados vêm de src/features/education-catalog/data/ e são carregados por
-- supabase/seeds/education/catalog.sql (gerado; idempotente).
--
-- Acesso:
--   - catálogo: leitura para contas autenticadas (dados de referência, sem
--     dados pessoais nem da escola); escrita só pelo servidor (service_role).
--     Uma escola não altera o catálogo oficial.
--   - identifier_sequences: só servidor (FORCE RLS, REVOKE, sem políticas).
--     private.next_entity_identifier() só para service_role.
--
-- Idempotente: pode correr duas vezes. Nenhuma destas tabelas existia em
-- produção (supabase/PRODUCTION_SNAPSHOT.json).

-- 1. Fontes -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_sources (
  id text PRIMARY KEY,
  title text NOT NULL,
  authority text NOT NULL,
  country_code text,
  url text,
  version text NOT NULL,
  licence text NOT NULL,
  recorded_on date NOT NULL,
  status text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_sources_id_check CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT catalog_sources_url_check CHECK (url IS NULL OR url ~ '^https://'),
  CONSTRAINT catalog_sources_status_check CHECK (
    status IN ('official_verified', 'institutional_approved', 'in_review', 'outdated', 'archived')
  )
);

-- 2. Classificações internacionais -------------------------------------------
CREATE TABLE IF NOT EXISTS public.global_education_levels (
  level smallint PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  name_en text NOT NULL,
  source_id text NOT NULL REFERENCES public.catalog_sources (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT global_education_levels_level_check CHECK (level BETWEEN 0 AND 8)
);

CREATE TABLE IF NOT EXISTS public.global_education_fields (
  code text PRIMARY KEY,
  name text NOT NULL,
  name_en text NOT NULL,
  broad_code text REFERENCES public.global_education_fields (code),
  source_id text NOT NULL REFERENCES public.catalog_sources (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT global_education_fields_code_check CHECK (code ~ '^[0-9]{2,4}$')
);

CREATE TABLE IF NOT EXISTS public.catalog_countries (
  code text PRIMARY KEY,
  name text NOT NULL,
  locale text NOT NULL,
  currency_code text NOT NULL,
  grade_unit text NOT NULL,
  admin_division text NOT NULL,
  stages_loaded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_countries_code_check CHECK (code ~ '^[A-Z]{2}$'),
  CONSTRAINT catalog_countries_currency_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT catalog_countries_grade_unit_check CHECK (grade_unit IN ('classe', 'ano'))
);

-- 3. Registos globais de disciplinas e cursos ---------------------------------
CREATE TABLE IF NOT EXISTS public.global_subject_catalog (
  code text PRIMARY KEY,
  name text NOT NULL,
  short_name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  field_code text NOT NULL REFERENCES public.global_education_fields (code),
  isced_levels smallint[] NOT NULL,
  tracks text[] NOT NULL,
  local_names jsonb NOT NULL DEFAULT '{}'::jsonb,
  area text,
  source_id text NOT NULL REFERENCES public.catalog_sources (id),
  status text NOT NULL DEFAULT 'institutional_approved',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT global_subject_catalog_code_check CHECK (code ~ '^[A-Z0-9]{2,8}$'),
  CONSTRAINT global_subject_catalog_levels_check CHECK (
    cardinality(isced_levels) > 0 AND isced_levels <@ ARRAY[0,1,2,3,4,5,6,7,8]::smallint[]
  ),
  CONSTRAINT global_subject_catalog_tracks_check CHECK (
    cardinality(tracks) > 0 AND tracks <@ ARRAY['general', 'technical', 'higher']
  ),
  CONSTRAINT global_subject_catalog_status_check CHECK (
    status IN ('official_verified', 'institutional_approved', 'in_review', 'outdated', 'archived')
  )
);

CREATE INDEX IF NOT EXISTS global_subject_catalog_levels_idx
  ON public.global_subject_catalog USING gin (isced_levels);

CREATE TABLE IF NOT EXISTS public.global_course_catalog (
  code text PRIMARY KEY,
  name text NOT NULL,
  short_name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  kind text NOT NULL,
  isced_level smallint NOT NULL REFERENCES public.global_education_levels (level),
  field_code text NOT NULL REFERENCES public.global_education_fields (code),
  typical_years smallint,
  source_id text NOT NULL REFERENCES public.catalog_sources (id),
  status text NOT NULL DEFAULT 'institutional_approved',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT global_course_catalog_code_check CHECK (code ~ '^[A-Z]{3}-[A-Z0-9]{2,6}$'),
  CONSTRAINT global_course_catalog_kind_check CHECK (
    kind IN ('general_track', 'technical_secondary', 'short_cycle', 'bachelor', 'master', 'doctorate')
  ),
  CONSTRAINT global_course_catalog_years_check CHECK (typical_years IS NULL OR typical_years BETWEEN 1 AND 8),
  CONSTRAINT global_course_catalog_status_check CHECK (
    status IN ('official_verified', 'institutional_approved', 'in_review', 'outdated', 'archived')
  )
);

-- 4. Camada nacional ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.country_education_stages (
  id text PRIMARY KEY,
  country_code text NOT NULL REFERENCES public.catalog_countries (code),
  name text NOT NULL,
  cycle text,
  isced_level smallint NOT NULL REFERENCES public.global_education_levels (level),
  track text NOT NULL,
  grades smallint[] NOT NULL DEFAULT '{}',
  grade_unit text NOT NULL,
  period_models text[] NOT NULL,
  assessment jsonb,
  course_codes text[] NOT NULL DEFAULT '{}',
  source_id text NOT NULL REFERENCES public.catalog_sources (id),
  status text NOT NULL,
  version text NOT NULL,
  effective_from date,
  effective_until date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT country_education_stages_id_check CHECK (id ~ '^[A-Z]{2}-[A-Z0-9]{2,6}$'),
  CONSTRAINT country_education_stages_track_check CHECK (track IN ('general', 'technical', 'higher')),
  CONSTRAINT country_education_stages_grade_unit_check CHECK (grade_unit IN ('classe', 'ano')),
  CONSTRAINT country_education_stages_periods_check CHECK (
    cardinality(period_models) > 0 AND period_models <@ ARRAY['trimestres', 'periodos', 'semestres']
  ),
  CONSTRAINT country_education_stages_status_check CHECK (
    status IN ('official_verified', 'institutional_approved', 'in_review', 'outdated', 'archived')
  ),
  CONSTRAINT country_education_stages_validity_check CHECK (
    effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from
  )
);

CREATE INDEX IF NOT EXISTS country_education_stages_country_idx
  ON public.country_education_stages (country_code, isced_level);

-- Disciplinas por curso e classe numa etapa. Uma versão nova do plano entra
-- como linha nova (outra `version`); a antiga fica com `effective_until` e
-- estado `outdated`, para os documentos já emitidos continuarem a bater certo.
CREATE TABLE IF NOT EXISTS public.country_curriculum_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id text NOT NULL REFERENCES public.country_education_stages (id) ON UPDATE CASCADE,
  course_code text REFERENCES public.global_course_catalog (code) ON UPDATE CASCADE,
  grade smallint NOT NULL,
  subject_code text NOT NULL REFERENCES public.global_subject_catalog (code) ON UPDATE CASCADE,
  is_mandatory boolean NOT NULL DEFAULT true,
  version text NOT NULL,
  source_id text NOT NULL REFERENCES public.catalog_sources (id),
  status text NOT NULL,
  effective_from date,
  effective_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT country_curriculum_entries_grade_check CHECK (grade BETWEEN 0 AND 13),
  CONSTRAINT country_curriculum_entries_status_check CHECK (
    status IN ('official_verified', 'institutional_approved', 'in_review', 'outdated', 'archived')
  )
);

-- Uma disciplina aparece uma vez por (etapa, curso, classe, versão); curso
-- nulo (primário, I ciclo) conta como um valor.
CREATE UNIQUE INDEX IF NOT EXISTS country_curriculum_entries_unique_idx
  ON public.country_curriculum_entries (stage_id, coalesce(course_code, ''), grade, subject_code, version);

CREATE INDEX IF NOT EXISTS country_curriculum_entries_lookup_idx
  ON public.country_curriculum_entries (stage_id, course_code, grade);

-- 5. Gatilhos updated_at, RLS e permissões do catálogo -------------------------
DO $catalog$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'catalog_sources',
    'global_education_levels',
    'global_education_fields',
    'catalog_countries',
    'global_subject_catalog',
    'global_course_catalog',
    'country_education_stages',
    'country_curriculum_entries'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_touch_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at()',
      t || '_touch_updated_at', t
    );
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    -- Só leitura: dados de referência, iguais para todas as escolas.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_authenticated', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      t || '_select_authenticated', t
    );
  END LOOP;
END
$catalog$;

-- 6. Sequências de identificadores curtos (só servidor) -------------------------
-- Professor, funcionário, turma, sala, curso, disciplina e matrícula. O aluno
-- continua em private.student_number_sequences (EST-000001) e os documentos
-- em document_sequences.
CREATE TABLE IF NOT EXISTS public.identifier_sequences (
  school_id uuid NOT NULL REFERENCES public.schools (id) ON DELETE CASCADE,
  entity text NOT NULL,
  last_value bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identifier_sequences_pkey PRIMARY KEY (school_id, entity),
  CONSTRAINT identifier_sequences_entity_check CHECK (
    entity IN ('teacher', 'staff', 'class_group', 'room', 'course', 'subject', 'enrollment')
  ),
  CONSTRAINT identifier_sequences_value_check CHECK (last_value >= 0)
);

DROP TRIGGER IF EXISTS identifier_sequences_touch_updated_at ON public.identifier_sequences;
CREATE TRIGGER identifier_sequences_touch_updated_at
  BEFORE UPDATE ON public.identifier_sequences
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

ALTER TABLE public.identifier_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identifier_sequences FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.identifier_sequences FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.identifier_sequences TO service_role;

-- Próximo número da entidade na escola. Um só comando: o INSERT … ON CONFLICT
-- bloqueia a linha até ao fim da transacção, por isso dois pedidos em
-- simultâneo recebem números diferentes, sem buracos por corrida.
CREATE OR REPLACE FUNCTION private.next_entity_identifier(target_school_id uuid, target_entity text)
RETURNS bigint
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.identifier_sequences AS s (school_id, entity, last_value)
  VALUES (target_school_id, target_entity, 1)
  ON CONFLICT (school_id, entity)
  DO UPDATE SET last_value = s.last_value + 1, updated_at = now()
  RETURNING s.last_value;
$$;

REVOKE ALL ON FUNCTION private.next_entity_identifier(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.next_entity_identifier(uuid, text) TO service_role;
