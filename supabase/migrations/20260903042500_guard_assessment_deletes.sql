-- SIGA / SGA — eliminação académica privilegiada com actor explícito.
--
-- O backend usa service_role. Num DELETE físico, a linha OLD não contém a identidade
-- do utilizador que iniciou o pedido. Portanto DELETE directo de avaliações passa a
-- falhar fechado; a aplicação deve usar delete_sga_assessment_item(), que valida o
-- actor real e executa notas + avaliação na mesma transacção.

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.sga_delete_actor_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_raw text;
BEGIN
  v_raw := NULLIF(current_setting('app.sga_delete_actor_id', true), '');
  IF v_raw IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN v_raw::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.sga_delete_actor_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.sga_delete_actor_id() TO service_role;

CREATE OR REPLACE FUNCTION private.enforce_assessment_delete_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_actor uuid;
  v_allowed boolean := false;
BEGIN
  IF NOT private.sga_request_is_service_role() THEN
    RETURN OLD;
  END IF;

  v_actor := private.sga_delete_actor_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'DELETE académico privilegiado sem actor autenticado.'
      USING ERRCODE = '42501';
  END IF;

  IF private.sga_actor_is_academic_manager(v_actor, OLD.school_id) THEN
    RETURN OLD;
  END IF;

  IF NOT private.sga_actor_is_teacher(v_actor, OLD.school_id) THEN
    RAISE EXCEPTION 'Actor sem permissão para eliminar dados de avaliação.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_TABLE_NAME = 'siga_assessment_items' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.class_subjects cs
      JOIN public.teachers t
        ON t.id = cs.teacher_id
       AND t.school_id = cs.school_id
      WHERE cs.school_id = OLD.school_id
        AND cs.class_group_id = OLD.class_group_id
        AND cs.subject_id = OLD.subject_id
        AND cs.status = 'active'
        AND t.status = 'active'
        AND t.user_id = v_actor
    ) INTO v_allowed;
  ELSIF TG_TABLE_NAME = 'siga_assessment_scores' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.siga_assessment_items ai
      JOIN public.class_subjects cs
        ON cs.school_id = ai.school_id
       AND cs.class_group_id = ai.class_group_id
       AND cs.subject_id = ai.subject_id
      JOIN public.teachers t
        ON t.id = cs.teacher_id
       AND t.school_id = cs.school_id
      JOIN public.enrollments e
        ON e.id = OLD.enrollment_id
       AND e.school_id = OLD.school_id
       AND e.class_group_id = ai.class_group_id
      WHERE ai.id = OLD.item_id
        AND ai.school_id = OLD.school_id
        AND cs.status = 'active'
        AND t.status = 'active'
        AND t.user_id = v_actor
        AND e.status IN ('active','pending')
    ) INTO v_allowed;
  END IF;

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'Professor só pode eliminar avaliações/notas da sua turma e disciplina.'
      USING ERRCODE = '42501';
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_assessment_delete_scope() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_assessment_delete_scope() TO service_role;

DO $do$
BEGIN
  IF to_regclass('public.siga_assessment_scores') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_assessment_score_delete_scope ON public.siga_assessment_scores';
    EXECUTE 'CREATE TRIGGER enforce_assessment_score_delete_scope BEFORE DELETE ON public.siga_assessment_scores FOR EACH ROW EXECUTE FUNCTION private.enforce_assessment_delete_scope()';
    EXECUTE 'REVOKE DELETE ON public.siga_assessment_scores FROM anon, authenticated';
  END IF;

  IF to_regclass('public.siga_assessment_items') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_assessment_item_delete_scope ON public.siga_assessment_items';
    EXECUTE 'CREATE TRIGGER enforce_assessment_item_delete_scope BEFORE DELETE ON public.siga_assessment_items FOR EACH ROW EXECUTE FUNCTION private.enforce_assessment_delete_scope()';
    EXECUTE 'REVOKE DELETE ON public.siga_assessment_items FROM anon, authenticated';
  END IF;
END
$do$;

CREATE OR REPLACE FUNCTION public.delete_sga_assessment_item(
  p_school_id uuid,
  p_item_id uuid,
  p_actor_id uuid,
  p_force boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_item record;
  v_score_count integer := 0;
  v_allowed boolean := false;
BEGIN
  IF p_school_id IS NULL OR p_item_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Escola, avaliação e actor são obrigatórios.' USING ERRCODE = '22023';
  END IF;

  IF NOT private.sga_actor_is_academic_manager(p_actor_id, p_school_id)
     AND NOT private.sga_actor_is_teacher(p_actor_id, p_school_id) THEN
    RAISE EXCEPTION 'Actor sem permissão para eliminar avaliações.' USING ERRCODE = '42501';
  END IF;

  SELECT ai.id, ai.school_id, ai.class_group_id, ai.subject_id
    INTO v_item
  FROM public.siga_assessment_items ai
  WHERE ai.id = p_item_id
    AND ai.school_id = p_school_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Avaliação não encontrada nesta escola.' USING ERRCODE = 'P0002';
  END IF;

  IF private.sga_actor_is_academic_manager(p_actor_id, p_school_id) THEN
    v_allowed := true;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.class_subjects cs
      JOIN public.teachers t
        ON t.id = cs.teacher_id
       AND t.school_id = cs.school_id
      WHERE cs.school_id = p_school_id
        AND cs.class_group_id = v_item.class_group_id
        AND cs.subject_id = v_item.subject_id
        AND cs.status = 'active'
        AND t.status = 'active'
        AND t.user_id = p_actor_id
    ) INTO v_allowed;
  END IF;

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'Professor sem permissão para eliminar esta avaliação.' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer
    INTO v_score_count
  FROM public.siga_assessment_scores s
  WHERE s.school_id = p_school_id
    AND s.item_id = p_item_id;

  IF v_score_count > 0 AND NOT p_force THEN
    RAISE EXCEPTION 'Esta avaliação possui % nota(s). Confirme a eliminação das notas associadas.', v_score_count
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.sga_delete_actor_id', p_actor_id::text, true);

  DELETE FROM public.siga_assessment_scores
  WHERE school_id = p_school_id
    AND item_id = p_item_id;

  DELETE FROM public.siga_assessment_items
  WHERE school_id = p_school_id
    AND id = p_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Avaliação deixou de existir antes da eliminação.' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_score_count;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_sga_assessment_item(uuid, uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_sga_assessment_item(uuid, uuid, uuid, boolean)
  TO service_role;

-- Atribuições: qualquer UPDATE privilegiado (incluindo desligar teacher_id/status)
-- deve passar pelo guard e trazer updated_by/created_by válido.
DO $do$
BEGIN
  IF to_regclass('public.class_subjects') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_teacher_class_subject_scope ON public.class_subjects';
    EXECUTE 'CREATE TRIGGER enforce_teacher_class_subject_scope BEFORE INSERT OR UPDATE ON public.class_subjects FOR EACH ROW EXECUTE FUNCTION private.enforce_teacher_class_subject_scope()';
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
