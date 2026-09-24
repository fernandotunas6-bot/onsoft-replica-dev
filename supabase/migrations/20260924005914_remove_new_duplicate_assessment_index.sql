-- Reconcile a duplicate index introduced by the targeted FK coverage migration.
-- Keep the pre-existing index; remove only the duplicate created by that migration.

drop index if exists public.siga_assessment_items_lesson_plan_component_idx;
