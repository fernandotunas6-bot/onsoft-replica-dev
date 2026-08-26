-- Motor de notas configurável do Ensino Superior (Fase B).
--
-- `programs` (cursos) já existe na base viva mas nunca foi criada por uma migração versionada
-- neste repositório (schema drift documentado em rondas anteriores) — por isso esta migração só
-- acrescenta uma coluna nova e opcional, sem assumir mais nada sobre a tabela existente.
--
-- Quando `grading_profile` é NULL, o curso usa o valor por omissão da escola
-- (`school_settings.pedagogy.gradingProfile`, camada de aplicação — ver
-- src/features/school/schemas.ts). Quando definido, este curso usa a sua própria regra:
--   { "scale": "20_ects" | "gpa4", "components": "frequencia_exame" | "so_exame" }
-- Validado na camada de aplicação (assessment-engine.ts); aqui só se garante a forma básica.

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS grading_profile jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'programs_grading_profile_shape_valid'
  ) THEN
    ALTER TABLE public.programs
      ADD CONSTRAINT programs_grading_profile_shape_valid CHECK (
        grading_profile IS NULL
        OR (
          grading_profile ? 'scale'
          AND grading_profile ? 'components'
          AND grading_profile->>'scale' IN ('20_ects', 'gpa4')
          AND grading_profile->>'components' IN ('frequencia_exame', 'so_exame')
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.programs.grading_profile IS
  'Override por curso do motor de notas (Ensino Superior). NULL = usa o valor por omissão da escola em school_settings.pedagogy.gradingProfile.';
