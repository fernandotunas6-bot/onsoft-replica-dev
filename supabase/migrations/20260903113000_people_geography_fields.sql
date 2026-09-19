-- SIGA / SGA — localização canónica para Pessoas e Matrículas.
--
-- A base histórica do módulo Pessoas já previa province/municipality/commune/address,
-- mas a base SGA actualmente usada pelo servidor evoluiu para os nomes
-- phone/national_id/date_of_birth e nem todas as instalações conservaram os campos
-- territoriais. Esta migration é apenas aditiva e idempotente.

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS municipality text,
  ADD COLUMN IF NOT EXISTS commune text,
  ADD COLUMN IF NOT EXISTS address text;

CREATE INDEX IF NOT EXISTS people_school_province_idx
  ON public.people (school_id, province)
  WHERE deleted_at IS NULL AND province IS NOT NULL;

CREATE INDEX IF NOT EXISTS people_school_province_municipality_idx
  ON public.people (school_id, province, municipality)
  WHERE deleted_at IS NULL AND province IS NOT NULL;

COMMENT ON COLUMN public.people.province IS
  'Província de residência segundo a divisão político-administrativa vigente de Angola.';
COMMENT ON COLUMN public.people.municipality IS
  'Município de residência informado pela escola/candidato.';
COMMENT ON COLUMN public.people.commune IS
  'Comuna/localidade de residência quando aplicável.';
COMMENT ON COLUMN public.people.address IS
  'Morada detalhada da pessoa, separada da província/município/comuna.';

NOTIFY pgrst, 'reload schema';
