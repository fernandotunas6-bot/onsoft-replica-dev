-- Colunas de compatibilidade em public.people: o código da aplicação lê/escreve
-- "phone" e "gender", enquanto o esquema guarda "phone_primary" e "sex".
-- Adição aditiva + sincronização bidireccional por trigger (mesmo padrão de date_of_birth/birth_date).

ALTER TABLE public.people ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS gender text;

UPDATE public.people SET phone = phone_primary WHERE phone IS NULL AND phone_primary IS NOT NULL;
UPDATE public.people SET gender = sex WHERE gender IS NULL AND sex IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_person_contact_compat()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.phone IS NOT NULL AND NEW.phone_primary IS NULL THEN
      NEW.phone_primary := NEW.phone;
    ELSIF NEW.phone_primary IS NOT NULL THEN
      NEW.phone := NEW.phone_primary;
    END IF;
    IF NEW.gender IS NOT NULL AND NEW.sex IS NULL THEN
      NEW.sex := NEW.gender;
    ELSIF NEW.sex IS NOT NULL THEN
      NEW.gender := NEW.sex;
    END IF;
  ELSE
    IF NEW.phone IS DISTINCT FROM OLD.phone THEN
      NEW.phone_primary := NEW.phone;
    ELSIF NEW.phone_primary IS DISTINCT FROM OLD.phone_primary THEN
      NEW.phone := NEW.phone_primary;
    END IF;
    IF NEW.gender IS DISTINCT FROM OLD.gender THEN
      NEW.sex := NEW.gender;
    ELSIF NEW.sex IS DISTINCT FROM OLD.sex THEN
      NEW.gender := NEW.sex;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_people_contact_compat ON public.people;
CREATE TRIGGER trg_people_contact_compat
  BEFORE INSERT OR UPDATE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.sync_person_contact_compat();