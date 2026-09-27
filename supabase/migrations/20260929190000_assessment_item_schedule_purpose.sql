-- Cadastro da avaliação: hora, duração e finalidade (ponto 9 da especificação).
--
-- `siga_assessment_items` guardava a data, mas não a hora, a duração nem a
-- finalidade (diagnóstica, formativa, sumativa). Três colunas opcionais: as
-- provas já criadas ficam sem estes dados. Idempotente.

ALTER TABLE public.siga_assessment_items
  ADD COLUMN IF NOT EXISTS starts_at time,
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS purpose text;

ALTER TABLE public.siga_assessment_items
  DROP CONSTRAINT IF EXISTS siga_assessment_items_duration_check;
ALTER TABLE public.siga_assessment_items
  ADD CONSTRAINT siga_assessment_items_duration_check
  CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 5 AND 600);

ALTER TABLE public.siga_assessment_items
  DROP CONSTRAINT IF EXISTS siga_assessment_items_purpose_check;
ALTER TABLE public.siga_assessment_items
  ADD CONSTRAINT siga_assessment_items_purpose_check
  CHECK (purpose IS NULL OR purpose IN ('diagnostic', 'formative', 'summative'));
