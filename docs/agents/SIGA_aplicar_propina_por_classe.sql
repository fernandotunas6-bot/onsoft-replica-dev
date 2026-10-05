-- SIGA Plus — SQL a aplicar no Supabase (projecto Sga), pacote de 2026-10-05
-- Colar TUDO no SQL Editor → Run. Pode correr mais do que uma vez sem problema.
-- 1 migração: propina por classe (fee_items.grade_level_id, opcional). Enquanto não
-- for aplicada, Definições › Cobrança não mostra os preços por classe, a importação de
-- propinas recusa os preços dizendo que falta este pacote, e as faturas usam o preço
-- geral como até aqui. Não mexe em itens, faturas nem recibos existentes.
-- Ensaiado em PGlite (tests/sql/fee-items-grade-level.mjs): corre duas vezes; classe
-- de outra escola recusada; um só preço activo por classe e tipo em cada plano.
-- Confirmar no fim com a consulta do fundo deste ficheiro (deve dar "aplicada").


-- ══════════ 20261005150000_fee_items_grade_level.sql ══════════
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


-- ══════════ Confirmar ══════════
SELECT CASE
  WHEN NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fee_items' AND column_name = 'grade_level_id'
  ) THEN 'por aplicar'
  WHEN NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.fee_items'::regclass AND conname = 'fee_items_grade_level_fkey'
  ) THEN 'por aplicar'
  WHEN to_regclass('public.fee_items_plan_grade_kind_active_key') IS NULL THEN 'por aplicar'
  ELSE 'aplicada'
END AS "20261005150000 propina por classe";
