-- Localização da escola (ponto 1 da especificação): comuna, bairro e
-- coordenadas GPS. Província e município já existiam. Todas opcionais.
-- Idempotente.

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS commune text,
  ADD COLUMN IF NOT EXISTS neighborhood text,
  ADD COLUMN IF NOT EXISTS latitude numeric(9, 6),
  ADD COLUMN IF NOT EXISTS longitude numeric(9, 6);

ALTER TABLE public.schools DROP CONSTRAINT IF EXISTS schools_geo_point_check;
ALTER TABLE public.schools ADD CONSTRAINT schools_geo_point_check CHECK (
  (latitude IS NULL AND longitude IS NULL)
  OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
);
