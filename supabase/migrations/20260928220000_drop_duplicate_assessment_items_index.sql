-- Índice duplicado em siga_assessment_items (aviso de desempenho do Supabase).
--
-- `siga_assessment_items_plan_component_idx` (do antigo
-- `APPLY_ENROLLMENT_AND_PREMIUM.sql`) e `siga_assessment_items_component_idx`
-- (de `20260925162000_lesson_plans_and_subject_guards.sql`) são o mesmo
-- índice: (lesson_plan_component_id) WHERE lesson_plan_component_id IS NOT NULL.
-- Fica o das migrações. Idempotente.

DROP INDEX IF EXISTS public.siga_assessment_items_plan_component_idx;
CREATE INDEX IF NOT EXISTS siga_assessment_items_component_idx
  ON public.siga_assessment_items (lesson_plan_component_id)
  WHERE lesson_plan_component_id IS NOT NULL;
