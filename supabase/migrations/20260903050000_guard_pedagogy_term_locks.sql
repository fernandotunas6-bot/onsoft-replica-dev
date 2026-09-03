-- SIGA / SGA — proteger fecho/reabertura de trimestre no próprio banco.
-- A aplicação já exige Administrador; este trigger impede bypass por service_role
-- e rejeita closedTerms que não correspondam ao calendário activo da escola.

CREATE OR REPLACE FUNCTION private.enforce_pedagogy_term_lock_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_actor uuid;
  v_closed_terms jsonb;
  v_value text;
  v_sequence integer;
BEGIN
  IF NEW.domain <> 'pedagogy' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.school_id IS DISTINCT FROM OLD.school_id OR NEW.domain IS DISTINCT FROM OLD.domain THEN
      RAISE EXCEPTION 'Não é permitido mover configurações pedagógicas entre escolas/domínios.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF private.sga_request_is_service_role() THEN
    v_actor := NEW.changed_by;
    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'Alteração pedagógica privilegiada sem actor autenticado.'
        USING ERRCODE = '42501';
    END IF;

    IF NOT private.sga_actor_has_role(
      v_actor,
      NEW.school_id,
      ARRAY['owner','admin','administrador']::text[]
    ) THEN
      RAISE EXCEPTION 'Apenas Administração pode fechar ou reabrir períodos.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_closed_terms := COALESCE(NEW.value -> 'closedTerms', '[]'::jsonb);
  IF jsonb_typeof(v_closed_terms) <> 'array' THEN
    RAISE EXCEPTION 'closedTerms deve ser uma lista de trimestres.' USING ERRCODE = '22023';
  END IF;

  FOR v_value IN SELECT jsonb_array_elements_text(v_closed_terms)
  LOOP
    IF v_value !~ '^[1-3]$' THEN
      RAISE EXCEPTION 'Período inválido em closedTerms: %.', v_value USING ERRCODE = '22023';
    END IF;
    v_sequence := v_value::integer;

    IF to_regclass('public.terms') IS NULL OR to_regclass('public.academic_years') IS NULL THEN
      RAISE EXCEPTION 'Configure o calendário académico antes de fechar um trimestre.'
        USING ERRCODE = '55000';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.terms t
      JOIN public.academic_years ay
        ON ay.id = t.academic_year_id
       AND ay.school_id = t.school_id
      WHERE t.school_id = NEW.school_id
        AND t.sequence = v_sequence
        AND ay.status = 'active'
    ) THEN
      RAISE EXCEPTION 'O %º trimestre não existe no calendário académico activo.', v_sequence
        USING ERRCODE = '55000';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_pedagogy_term_lock_scope()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_pedagogy_term_lock_scope()
  TO service_role;

DO $do$
BEGIN
  IF to_regclass('public.school_settings') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_pedagogy_term_lock_scope ON public.school_settings';
    EXECUTE 'CREATE TRIGGER enforce_pedagogy_term_lock_scope BEFORE INSERT OR UPDATE ON public.school_settings FOR EACH ROW EXECUTE FUNCTION private.enforce_pedagogy_term_lock_scope()';
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
