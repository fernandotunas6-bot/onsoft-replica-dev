-- Corrige trigger/função que referencia NEW.penalty_amount
-- numa coluna inexistente em finance_invoices (SGA).
-- Executar no SQL Editor do projecto xodgfmxiaunpamctfeea.

ALTER TABLE public.finance_invoices
  ADD COLUMN IF NOT EXISTS penalty_amount numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.finance_invoices.penalty_amount IS
  'Multa/penalidade acumulada; default 0 para compatibilidade com triggers SGA.';
