-- SIGA / SGA — calendário académico auditável e protegido quando o backend usa service_role.
-- Ano lectivo e trimestres são estrutura escolar: apenas Administração/Secretaria pode alterá-los.

CREATE SCHEMA IF NOT EXISTS private;

DO $do$
BEGIN
  IF to_regclass('public.academic_years') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.academic_years ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id)';
    EXECUTE 'ALTER TABLE public.academic_years ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id)';
  END IF;

  IF to_regclass('public.terms') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.terms ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id)';
    EXECUTE 'ALTER TABLE public.terms ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id)';
  END IF;
END
$do$;

CREATE OR REPLACE FUNCTION private.enforce_academic_calendar_manager_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_actor uuid;
  v_year_start date;
  v_year_end date;
BEGIN
  IF NOT private.sga_request_is_service_role() THEN
    RETURN NEW;
  END IF;

  v_actor := COALESCE(NEW.updated_by, NEW.created_by);
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Mutação do calendário académico sem actor autenticado.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT private.sga_actor_is_academic_manager(v_actor, NEW.school_id) THEN
    RAISE EXCEPTION 'Apenas Administração/Secretaria pode alterar o calendário académico.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.school_id IS DISTINCT FROM OLD.school_id THEN
    RAISE EXCEPTION 'Não é permitido mover o calendário entre escolas.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_TABLE_NAME = 'academic_years' THEN
    IF NEW.starts_on IS NULL OR NEW.ends_on IS NULL OR NEW.starts_on > NEW.ends_on THEN
      RAISE EXCEPTION 'Ano lectivo com intervalo de datas inválido.' USING ERRCODE = '22007';
    END IF;
  ELSIF TG_TABLE_NAME = 'terms' THEN
    IF NEW.sequence NOT BETWEEN 1 AND 3 THEN
      RAISE EXCEPTION 'O SIGA exige trimestre 1, 2 ou 3.' USING ERRCODE = '22023';
    END IF;
    IF NEW.starts_on IS NULL OR NEW.ends_on IS NULL OR NEW.starts_on > NEW.ends_on THEN
      RAISE EXCEPTION 'Trimestre com intervalo de datas inválido.' USING ERRCODE = '22007';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.academic_year_id IS DISTINCT FROM OLD.academic_year_id THEN
      RAISE EXCEPTION 'Não é permitido mover um trimestre para outro ano lectivo.'
        USING ERRCODE = '42501';
    END IF;

    SELECT ay.starts_on, ay.ends_on
      INTO v_year_start, v_year_end
    FROM public.academic_years ay
    WHERE ay.id = NEW.academic_year_id
      AND ay.school_id = NEW.school_id;

    IF v_year_start IS NULL OR v_year_end IS NULL THEN
      RAISE EXCEPTION 'Ano lectivo da escola não encontrado para este trimestre.'
        USING ERRCODE = '23503';
    END IF;
    IF NEW.starts_on < v_year_start OR NEW.ends_on > v_year_end THEN
      RAISE EXCEPTION 'As datas do trimestre devem ficar dentro do ano lectivo.'
        USING ERRCODE = '22007';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_academic_calendar_manager_scope()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_academic_calendar_manager_scope()
  TO service_role;

DO $do$
BEGIN
  IF to_regclass('public.academic_years') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_academic_calendar_manager_scope ON public.academic_years';
    EXECUTE 'CREATE TRIGGER enforce_academic_calendar_manager_scope BEFORE INSERT OR UPDATE ON public.academic_years FOR EACH ROW EXECUTE FUNCTION private.enforce_academic_calendar_manager_scope()';
  END IF;

  IF to_regclass('public.terms') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_academic_calendar_manager_scope ON public.terms';
    EXECUTE 'CREATE TRIGGER enforce_academic_calendar_manager_scope BEFORE INSERT OR UPDATE ON public.terms FOR EACH ROW EXECUTE FUNCTION private.enforce_academic_calendar_manager_scope()';
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
