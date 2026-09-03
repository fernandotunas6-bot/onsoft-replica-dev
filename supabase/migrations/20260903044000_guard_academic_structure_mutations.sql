-- SIGA / SGA — defesa de mutações estruturais feitas com service_role.
-- Turmas, disciplinas e horários são estrutura académica: apenas gestão pode
-- criá-los/alterá-los. O actor humano deve acompanhar cada escrita privilegiada.

CREATE SCHEMA IF NOT EXISTS private;

-- O SGA antigo criou timetable_slots apenas com created_by. Acrescentamos
-- updated_by de forma aditiva para que alterações/desativações sejam auditáveis.
DO $do$
BEGIN
  IF to_regclass('public.timetable_slots') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.timetable_slots ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id)';
  END IF;
END
$do$;

CREATE OR REPLACE FUNCTION private.enforce_academic_manager_structure_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_actor uuid;
BEGIN
  -- Só acrescentamos esta defesa ao caminho privilegiado. Em chamadas normais,
  -- RLS/policies continuam a decidir o acesso.
  IF NOT private.sga_request_is_service_role() THEN
    RETURN NEW;
  END IF;

  v_actor := COALESCE(NEW.updated_by, NEW.created_by);

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Mutação estrutural académica privilegiada sem actor autenticado.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT private.sga_actor_is_academic_manager(v_actor, NEW.school_id) THEN
    RAISE EXCEPTION 'Apenas Administração/Secretaria pode alterar a estrutura académica.'
      USING ERRCODE = '42501';
  END IF;

  -- school_id é identidade tenant e nunca pode mudar numa actualização.
  IF TG_OP = 'UPDATE' AND NEW.school_id IS DISTINCT FROM OLD.school_id THEN
    RAISE EXCEPTION 'Não é permitido mover estrutura académica entre escolas.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_academic_manager_structure_scope()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_academic_manager_structure_scope()
  TO service_role;

DO $do$
BEGIN
  IF to_regclass('public.class_groups') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_academic_manager_structure_scope ON public.class_groups';
    EXECUTE 'CREATE TRIGGER enforce_academic_manager_structure_scope BEFORE INSERT OR UPDATE ON public.class_groups FOR EACH ROW EXECUTE FUNCTION private.enforce_academic_manager_structure_scope()';
  END IF;

  IF to_regclass('public.subjects') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_academic_manager_structure_scope ON public.subjects';
    EXECUTE 'CREATE TRIGGER enforce_academic_manager_structure_scope BEFORE INSERT OR UPDATE ON public.subjects FOR EACH ROW EXECUTE FUNCTION private.enforce_academic_manager_structure_scope()';
  END IF;

  IF to_regclass('public.timetable_slots') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_academic_manager_structure_scope ON public.timetable_slots';
    EXECUTE 'CREATE TRIGGER enforce_academic_manager_structure_scope BEFORE INSERT OR UPDATE ON public.timetable_slots FOR EACH ROW EXECUTE FUNCTION private.enforce_academic_manager_structure_scope()';
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
