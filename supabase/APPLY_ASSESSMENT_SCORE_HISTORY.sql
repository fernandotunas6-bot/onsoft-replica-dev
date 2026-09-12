-- =============================================================================
-- SIGA PLUS — HISTÓRICO DE ALTERAÇÕES DE NOTAS
-- =============================================================================
-- Idempotente. Aplicar depois de APPLY_ENROLLMENT_AND_PREMIUM.sql
-- (que cria siga_assessment_scores) e de HARDEN_TEACHER_ASSESSMENT_SCOPE.sql.
--
-- PROBLEMA
--
-- `siga_assessment_scores` guarda `previous_score` — um único nível — e
-- `recorded_by`, que é sobrescrito em cada actualização. Depois da segunda
-- alteração, a nota original desapareceu e já não se sabe quem a lançou.
-- Numa escola, a pauta é o documento de maior integridade: sem trilha completa
-- não há como responder a uma contestação de nota, nem distinguir uma correcção
-- legítima de uma adulteração.
--
-- O controlo de acesso já está resolvido (professor limitado às suas turmas, e
-- `assertTermOpen` impede escrita em trimestre fechado). O que falta é o registo
-- do que aconteceu.
--
-- PORQUÊ UM TRIGGER, E NÃO REGISTO NA APLICAÇÃO
--
-- A aplicação escreve com a chave service_role, que ignora RLS. Um registo feito
-- no TypeScript ficaria por fora em qualquer caminho que não passasse por
-- `upsertAssessmentScores` — um script de importação, uma correcção manual no
-- SQL Editor, um endpoint futuro. O trigger apanha todos.
--
-- COMO SE SABE QUEM ALTEROU
--
-- Sob service_role, `auth.uid()` é NULL, por isso o trigger não pode descobrir
-- o autor sozinho. Usa `NEW.recorded_by`, que a aplicação já preenche com o
-- utilizador da sessão em cada escrita. Continua a ser a aplicação a afirmar
-- quem é — mas passa a ficar registado de forma imutável, em vez de ser
-- sobrescrito.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.siga_assessment_score_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  score_id       uuid NOT NULL,
  item_id        uuid NOT NULL,
  enrollment_id  uuid NOT NULL,
  action         text NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  previous_score numeric,
  new_score      numeric,
  changed_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.siga_assessment_score_history IS
  'Trilha imutável de alterações de notas. Escrita por trigger; nunca pela aplicação.';

CREATE INDEX IF NOT EXISTS siga_assessment_score_history_score_idx
  ON public.siga_assessment_score_history (score_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS siga_assessment_score_history_school_idx
  ON public.siga_assessment_score_history (school_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS siga_assessment_score_history_enrollment_idx
  ON public.siga_assessment_score_history (school_id, enrollment_id, changed_at DESC);

-- ─── Trigger ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_assessment_score_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.siga_assessment_score_history
      (school_id, score_id, item_id, enrollment_id, action, previous_score, new_score, changed_by)
    VALUES
      (NEW.school_id, NEW.id, NEW.item_id, NEW.enrollment_id, 'insert', NULL, NEW.score, NEW.recorded_by);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Só regista quando a nota muda de facto: um UPDATE que apenas toca em
    -- updated_at não é uma alteração de nota e encheria a trilha de ruído.
    IF NEW.score IS DISTINCT FROM OLD.score THEN
      INSERT INTO public.siga_assessment_score_history
        (school_id, score_id, item_id, enrollment_id, action, previous_score, new_score, changed_by)
      VALUES
        (NEW.school_id, NEW.id, NEW.item_id, NEW.enrollment_id, 'update', OLD.score, NEW.score, NEW.recorded_by);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.siga_assessment_score_history
      (school_id, score_id, item_id, enrollment_id, action, previous_score, new_score, changed_by)
    VALUES
      (OLD.school_id, OLD.id, OLD.item_id, OLD.enrollment_id, 'delete', OLD.score, NULL, OLD.recorded_by);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tr_assessment_score_history ON public.siga_assessment_scores;
CREATE TRIGGER tr_assessment_score_history
  AFTER INSERT OR UPDATE OR DELETE ON public.siga_assessment_scores
  FOR EACH ROW EXECUTE FUNCTION public.record_assessment_score_history();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.siga_assessment_score_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_assessment_score_history FORCE ROW LEVEL SECURITY;

-- Leitura apenas. A trilha não é editável por ninguém através da API: sem
-- políticas de INSERT, UPDATE ou DELETE, o PostgREST recusa essas operações
-- mesmo a um membro da escola. O trigger escreve como SECURITY DEFINER e não
-- passa por RLS.
GRANT SELECT ON public.siga_assessment_score_history TO authenticated;
GRANT ALL ON public.siga_assessment_score_history TO service_role;

DROP POLICY IF EXISTS "Read assessment score history in own school"
  ON public.siga_assessment_score_history;
CREATE POLICY "Read assessment score history in own school"
  ON public.siga_assessment_score_history
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

-- ─── Semente a partir do estado actual ───────────────────────────────────────
--
-- As notas já existentes não têm histórico. Regista-se uma linha de base por
-- cada uma, para a trilha não começar com um vazio que parece apagamento.
-- `previous_score` traz o único nível que a coluna antiga preservava.

INSERT INTO public.siga_assessment_score_history
  (school_id, score_id, item_id, enrollment_id, action, previous_score, new_score, changed_by, changed_at)
SELECT
  s.school_id, s.id, s.item_id, s.enrollment_id, 'insert', s.previous_score, s.score, s.recorded_by, s.updated_at
FROM public.siga_assessment_scores s
WHERE NOT EXISTS (
  SELECT 1 FROM public.siga_assessment_score_history h WHERE h.score_id = s.id
);

COMMIT;

-- =============================================================================
-- VERIFICAR DEPOIS DE APLICAR
-- =============================================================================
--
--   select count(*) from public.siga_assessment_score_history;
--
--   -- a trilha de uma nota concreta, do lançamento à última alteração:
--   select action, previous_score, new_score, changed_by, changed_at
--   from public.siga_assessment_score_history
--   where score_id = '<uuid>' order by changed_at;
--
--   -- confirmar que é imutável para um membro autenticado da escola:
--   -- (deve falhar) delete from public.siga_assessment_score_history where id = '<uuid>';
-- =============================================================================
