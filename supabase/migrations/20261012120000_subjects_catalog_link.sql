-- Ligação das disciplinas da escola ao catálogo educacional global.
--
-- `subjects.catalog_subject_code` guarda o código da disciplina de referência do
-- catálogo («MAT», «LP», «FQ»…). Serve para reconhecer a mesma disciplina sem
-- depender da forma como a escola a escreveu («Mat. Aplicada», «Matemática A»).
--
-- Sem chave estrangeira de propósito: o catálogo vive no código do SIGA
-- (src/features/education-catalog/data/) e as tabelas de referência
-- (20261010120000) são uma cópia opcional. O servidor só grava códigos que o
-- catálogo conhece; aqui só se garante o formato.
--
-- Só ALTER TABLE: a tabela existe na produção (supabase/PRODUCTION_SNAPSHOT.json),
-- com RLS forçado e políticas próprias, que valem também para a coluna nova.
-- Gravar continua a exigir a política de UPDATE (`is_aal2()` +
-- `academic.subjects.manage`). Idempotente.

ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS catalog_subject_code text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subjects_catalog_subject_code_format'
      AND conrelid = 'public.subjects'::regclass
  ) THEN
    ALTER TABLE public.subjects
      ADD CONSTRAINT subjects_catalog_subject_code_format
      CHECK (catalog_subject_code IS NULL OR catalog_subject_code ~ '^[A-Z][A-Z0-9-]{0,23}$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS subjects_school_catalog_code_idx
  ON public.subjects (school_id, catalog_subject_code)
  WHERE catalog_subject_code IS NOT NULL;

COMMENT ON COLUMN public.subjects.catalog_subject_code IS
  'Código da disciplina no catálogo educacional do SIGA (ex.: MAT). Nulo = por ligar ou própria da escola.';
