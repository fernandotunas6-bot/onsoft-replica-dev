-- `assessment_rule_sets` e `assessment_key_subjects` não existem em produção — e duas
-- funções que existem em produção escrevem nelas:
--
--   · `private.publish_assessment_rule_version` (wrapper público
--     `publish_assessment_rule_version`) — insere a regra e as disciplinas-chave;
--   · `private.configure_assessment_rules` (wrapper público `configure_assessment_rules`)
--     — usada no passo 8 da instalação da escola.
--
-- Ambas falham hoje com 42P01 na primeira instrução que toca nestas tabelas. A
-- consequência prática não é só essas funções: `gradebooks.rule_set_id` é NOT NULL, e
-- `sga-grades-legacy.ts` só consegue abrir um diário de notas se conseguir um `rule_set_id`
-- — ou desta tabela, ou emprestado de outro diário da mesma escola. Numa escola nova não
-- há nem uma coisa nem outra: **não é possível abrir o primeiro diário, logo não é possível
-- lançar notas**.
--
-- A forma abaixo não é inventada: é lida do `insert` da própria função capturada da
-- produção (`20260908210000_capture_all_db_functions.sql`), coluna a coluna, e as
-- validações são as que a função já faz antes de inserir.
--
-- Aditiva e idempotente. Não foi aplicada — é escrita na base, decisão do dono. Depois de
-- aplicar: `npm run siga:db-snapshot`, que é contra quem os testes medem.

CREATE TABLE IF NOT EXISTS public.assessment_rule_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  grading_scale_id uuid NOT NULL REFERENCES public.grading_scales(id),
  code text NOT NULL DEFAULT 'DEFAULT',
  name text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  continuous_weight numeric(5, 2) NOT NULL,
  exam_weight numeric(5, 2) NOT NULL,
  passing_value numeric(6, 2) NOT NULL,
  maximum_absence_percentage numeric(5, 2) NOT NULL,
  rounding_method text NOT NULL DEFAULT 'nearest',
  grade_change_requires_approval boolean NOT NULL DEFAULT false,
  lock_after_publication boolean NOT NULL DEFAULT false,
  formula jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- As mesmas validações que `publish_assessment_rule_version` faz antes de inserir.
  CONSTRAINT assessment_rule_sets_status_check CHECK (status IN ('active', 'retired')),
  CONSTRAINT assessment_rule_sets_rounding_check
    CHECK (rounding_method IN ('none', 'nearest', 'up', 'down')),
  CONSTRAINT assessment_rule_sets_weights_check
    CHECK (continuous_weight >= 0 AND exam_weight >= 0 AND continuous_weight + exam_weight = 100),
  CONSTRAINT assessment_rule_sets_absence_check
    CHECK (maximum_absence_percentage >= 0 AND maximum_absence_percentage <= 100),
  -- A função calcula `max(version) + 1` por (escola, código): a versão é única aí.
  CONSTRAINT assessment_rule_sets_version_key UNIQUE (school_id, code, version),
  CONSTRAINT assessment_rule_sets_school_id_id_key UNIQUE (school_id, id)
);

CREATE TABLE IF NOT EXISTS public.assessment_key_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  rule_set_id uuid NOT NULL REFERENCES public.assessment_rule_sets(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assessment_key_subjects_unique UNIQUE (school_id, rule_set_id, subject_id)
);

-- Só pode haver uma regra activa por (escola, código) — é o que a função assume quando
-- aposenta a anterior antes de inserir a nova.
CREATE UNIQUE INDEX IF NOT EXISTS assessment_rule_sets_one_active
  ON public.assessment_rule_sets (school_id, code)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_assessment_key_subjects_rule_set
  ON public.assessment_key_subjects (rule_set_id);

-- RLS: a invariante desta base é que todas as tabelas de produção a têm activa. A leitura
-- segue a mesma permissão de `grading_scales`, que é a tabela irmã; a escrita passa pelas
-- funções SECURITY DEFINER, que já verificam `assessment.rules.manage`.
ALTER TABLE public.assessment_rule_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_key_subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assessment_rule_sets_select_authorized ON public.assessment_rule_sets;
CREATE POLICY assessment_rule_sets_select_authorized ON public.assessment_rule_sets
  FOR SELECT TO authenticated
  USING (private.has_permission(school_id, 'academic.structure.read'));

DROP POLICY IF EXISTS assessment_key_subjects_select_authorized ON public.assessment_key_subjects;
CREATE POLICY assessment_key_subjects_select_authorized ON public.assessment_key_subjects
  FOR SELECT TO authenticated
  USING (private.has_permission(school_id, 'academic.structure.read'));
