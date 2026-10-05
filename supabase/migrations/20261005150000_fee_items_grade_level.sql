-- Propina por classe: um item do plano pode ter o preço de uma classe.
--
-- Até 2026-10-05 o plano de propinas tinha um preço por tipo (propina, matrícula) e a
-- tesouraria escrevia o valor de cada fatura à mão; o modelo oficial de importação de
-- «propinas» já pedia um preço por classe e era ignorado. Agora:
--   · fee_items.grade_level_id (opcional): o item vale para essa classe; sem ela é o
--     preço geral, como até aqui;
--   · a emissão de faturas escolhe o item da classe do aluno e, sem valor escrito, usa
--     o preço dele (src/features/finance/fee-items.ts);
--   · Definições › Cobrança › Plano de propinas e a importação de propinas gravam-nos.
--
-- A classe tem de ser da mesma escola (chave composta, como fee_plans). Apagar a classe
-- apaga o preço dela (se nenhuma fatura o usar; com faturas, o apagar é recusado, como
-- já era pelas turmas). Um só preço activo por classe e tipo em cada plano.
--
-- Idempotente. Não mexe nos itens existentes (ficam como preço geral).

ALTER TABLE public.fee_items ADD COLUMN IF NOT EXISTS grade_level_id uuid;

DO $fee_items$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.fee_items'::regclass AND conname = 'fee_items_grade_level_fkey'
  ) THEN
    ALTER TABLE public.fee_items
      ADD CONSTRAINT fee_items_grade_level_fkey
      FOREIGN KEY (school_id, grade_level_id)
      REFERENCES public.grade_levels (school_id, id)
      ON DELETE CASCADE;
  END IF;
END
$fee_items$;

CREATE UNIQUE INDEX IF NOT EXISTS fee_items_plan_grade_kind_active_key
  ON public.fee_items (school_id, fee_plan_id, kind, grade_level_id)
  WHERE is_active AND grade_level_id IS NOT NULL;
