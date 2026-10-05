-- Fecho de período na base para as avaliações (auditoria 12, A6).
--
-- O servidor recusa lançar ou alterar avaliações e notas de um período cuja pauta já é oficial
-- (`assertAssessmentTermNotLocked`, src/features/academic/sga-grades.ts): existe uma pauta da
-- turma em homologated / published / closed / contested que é anual ou do mesmo período.
-- Mas `siga_assessment_items` e `siga_assessment_scores` aceitam escrita directa do papel
-- `authenticated` pela API REST (políticas "Manage assigned assessment ..."), e os triggers
-- que lá existem só verificam o âmbito do professor, não o fecho.
--
-- Este trigger repete a mesma regra na base, SÓ para pedidos de utilizadores (auth.uid() não
-- nulo e fora de service_role): o servidor continua a validar como hoje e a manutenção feita
-- pelo SQL Editor / migrações (sem auth.uid()) não é afectada. Idempotente.

CREATE OR REPLACE FUNCTION private.assessment_term_is_locked(
  p_school_id uuid, p_class_group_id uuid, p_term integer
) RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_term_id uuid;
BEGIN
  -- Mesmo critério do servidor: sem ano lectivo ou sem período configurado, nada a bloquear.
  SELECT t.id INTO v_term_id
  FROM public.class_groups cg
  JOIN public.terms t
    ON t.school_id = cg.school_id
   AND t.academic_year_id = cg.academic_year_id
   AND t.sequence = p_term
  WHERE cg.school_id = p_school_id AND cg.id = p_class_group_id
  LIMIT 1;
  IF v_term_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.grade_sheets gs
    WHERE gs.school_id = p_school_id
      AND gs.class_group_id = p_class_group_id
      AND gs.status IN ('homologated', 'published', 'closed', 'contested')
      AND (gs.kind = 'annual' OR gs.term_id = v_term_id)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.enforce_assessment_closed_term()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_class uuid;
  v_term integer;
  v_locked boolean := false;
BEGIN
  -- O servidor (service_role) valida por si; a manutenção sem sessão também passa.
  IF private.sga_request_is_service_role() OR (SELECT auth.uid()) IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- Estado anterior (UPDATE e DELETE) e estado novo (INSERT e UPDATE): ambos têm de estar abertos.
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF TG_TABLE_NAME = 'siga_assessment_items' THEN
      v_locked := private.assessment_term_is_locked(OLD.school_id, OLD.class_group_id, OLD.term);
    ELSE
      SELECT ai.class_group_id, ai.term INTO v_class, v_term
      FROM public.siga_assessment_items ai
      WHERE ai.id = OLD.item_id AND ai.school_id = OLD.school_id;
      v_locked := v_class IS NOT NULL
        AND private.assessment_term_is_locked(OLD.school_id, v_class, v_term);
    END IF;
  END IF;

  IF NOT v_locked AND TG_OP IN ('INSERT', 'UPDATE') THEN
    IF TG_TABLE_NAME = 'siga_assessment_items' THEN
      v_locked := private.assessment_term_is_locked(NEW.school_id, NEW.class_group_id, NEW.term);
    ELSE
      v_class := NULL;
      SELECT ai.class_group_id, ai.term INTO v_class, v_term
      FROM public.siga_assessment_items ai
      WHERE ai.id = NEW.item_id AND ai.school_id = NEW.school_id;
      v_locked := v_class IS NOT NULL
        AND private.assessment_term_is_locked(NEW.school_id, v_class, v_term);
    END IF;
  END IF;

  IF v_locked THEN
    RAISE EXCEPTION 'A pauta deste período já é oficial: as notas e avaliações já não se alteram aqui. Peça a alteração na pauta (Pedagógica → Pautas), com o motivo.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.assessment_term_is_locked(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.enforce_assessment_closed_term() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_assessment_item_closed_term ON public.siga_assessment_items;
CREATE TRIGGER enforce_assessment_item_closed_term
  BEFORE INSERT OR UPDATE OR DELETE ON public.siga_assessment_items
  FOR EACH ROW EXECUTE FUNCTION private.enforce_assessment_closed_term();

DROP TRIGGER IF EXISTS enforce_assessment_score_closed_term ON public.siga_assessment_scores;
CREATE TRIGGER enforce_assessment_score_closed_term
  BEFORE INSERT OR UPDATE OR DELETE ON public.siga_assessment_scores
  FOR EACH ROW EXECUTE FUNCTION private.enforce_assessment_closed_term();
