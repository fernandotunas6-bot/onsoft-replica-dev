-- SIGA / Onsoft — execução e confirmação de pagamentos salariais.
-- Cada item pago pode ligar-se a uma saída real de caixa já existente no módulo financeiro.

ALTER TABLE public.hr_payroll_payment_items
  ADD COLUMN IF NOT EXISTS cash_expense_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS hr_payroll_payment_items_cash_expense_idx
  ON public.hr_payroll_payment_items (cash_expense_id)
  WHERE cash_expense_id IS NOT NULL;

COMMENT ON COLUMN public.hr_payroll_payment_items.cash_expense_id IS
  'Referência à saída real de caixa criada somente após confirmação do pagamento salarial.';

NOTIFY pgrst, 'reload schema';