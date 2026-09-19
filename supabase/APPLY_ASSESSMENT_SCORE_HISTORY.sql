-- =============================================================================
-- SIGA PLUS — AUDITORIA DE ALTERAÇÕES DE NOTAS
-- =============================================================================
-- Idempotente. APLICADO EM PRODUÇÃO a 2026-09-12.
--
-- PROBLEMA
--
-- `siga_assessment_scores` guarda `previous_score` — um único nível — e
-- `recorded_by`, que `upsertAssessmentScores` sobrescreve em cada actualização.
-- Depois da segunda alteração, a nota original desapareceu e já não se sabe
-- quem a lançou. Numa escola a pauta é o documento de maior integridade: sem
-- trilha não há como responder a uma contestação nem distinguir correcção
-- legítima de adulteração.
--
-- A tabela já tinha dois triggers, mas ambos de imposição, não de registo:
-- `enforce_teacher_assessment_score_scope` e `enforce_assessment_delete_scope`.
--
-- PORQUÊ ESTA VERSÃO E NÃO A ANTERIOR
--
-- A primeira versão deste ficheiro criava uma tabela `siga_assessment_score_history`
-- com trigger próprio. Estava errada — não por não funcionar, mas por duplicar
-- infraestrutura que já existe. A base tem `public.audit_logs`
-- (school_id, actor_user_id, action, entity_type, entity_id, metadata,
-- occurred_at) e a função `private.audit_row_change()`, e **41 tabelas já a
-- usavam** — incluindo `students`, `enrollments` e `finance_invoices`.
--
-- As notas eram das poucas coisas importantes de fora. A correcção é ligá-las
-- ao mesmo mecanismo, não construir um segundo a seu lado: uma só tabela para
-- consultar, um só formato, e o comportamento já provado nas outras 41.
--
-- Isto só se percebeu ao ler a produção. O repositório não descreve o schema
-- `private` nem as suas 95 funções — ver OPS-01.
-- =============================================================================

BEGIN;

DROP TRIGGER IF EXISTS audit_siga_assessment_scores_change ON public.siga_assessment_scores;

CREATE TRIGGER audit_siga_assessment_scores_change
  AFTER INSERT OR DELETE OR UPDATE ON public.siga_assessment_scores
  FOR EACH ROW EXECUTE FUNCTION private.audit_row_change();

COMMIT;

-- =============================================================================
-- VERIFICAR
-- =============================================================================
--
--   -- o trigger está lá, ao lado dos dois de imposição:
--   select tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
--   where c.relname = 'siga_assessment_scores' and not t.tgisinternal;
--
--   -- a trilha de uma nota, depois de alterada:
--   select action, actor_user_id, metadata, occurred_at
--   from public.audit_logs
--   where entity_type = 'siga_assessment_scores' and entity_id = '<uuid>'
--   order by occurred_at;
-- =============================================================================
