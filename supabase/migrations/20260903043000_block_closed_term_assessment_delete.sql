-- SIGA / SGA — um trimestre fechado é imutável também para eliminações.
-- A Direcção deve reabrir explicitamente o período antes de remover uma avaliação.

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
  v_term_closed boolean := false;
BEGIN
  IF p_school_id IS NULL OR p_item_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Escola, avaliação e actor são obrigatórios.' USING ERRCODE = '22023';
  END IF;

  IF NOT private.sga_actor_is_academic_manager(p_actor_id, p_school_id)
     AND NOT private.sga_actor_is_teacher(p_actor_id, p_school_id) THEN
    RAISE EXCEPTION 'Actor sem permissão para eliminar avaliações.' USING ERRCODE = '42501';
  END IF;

  SELECT ai.id, ai.school_id, ai.class_group_id, ai.subject_id, ai.term
    INTO v_item
  FROM public.siga_assessment_items ai
  WHERE ai.id = p_item_id
    AND ai.school_id = p_school_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Avaliação não encontrada nesta escola.' USING ERRCODE = 'P0002';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.school_settings ss
    CROSS JOIN LATERAL jsonb_array_elements_text(
      COALESCE(ss.value -> 'closedTerms', '[]'::jsonb)
    ) AS closed_term(value)
    WHERE ss.school_id = p_school_id
      AND ss.domain = 'pedagogy'
      AND closed_term.value ~ '^[0-9]+$'
      AND closed_term.value::integer = v_item.term
  ) INTO v_term_closed;

  IF COALESCE(v_term_closed, false) THEN
    RAISE EXCEPTION 'O %º trimestre está fechado. Reabra o período antes de eliminar a avaliação.', v_item.term
      USING ERRCODE = '55000';
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

NOTIFY pgrst, 'reload schema';
