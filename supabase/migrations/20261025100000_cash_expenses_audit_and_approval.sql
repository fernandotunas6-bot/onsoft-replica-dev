-- Despesas de caixa: rasto em audit_logs, como as faturas, e quem aprovou.
--
-- `finance_invoices` tem `audit_finance_invoices_change`; `siga_cash_expenses` só tinha
-- o gatilho de `updated_at`. Registar e estornar uma despesa — dinheiro que sai da
-- escola — não ficava no registo de auditoria: só nas colunas `created_by` e
-- `reversed_by` da própria linha, que um UPDATE pelo servidor podia reescrever sem
-- deixar nada (§8 do plano financeiro: «um operador não pode eliminar o histórico»).
--
-- Mesma função genérica das outras tabelas (`private.audit_row_change`): grava a linha
-- antes e depois e os campos alterados. As despesas são gravadas pelo cliente do
-- servidor, por isso `actor_user_id` fica nulo nesses registos; o autor continua em
-- `created_by` / `reversed_by`, agora com o histórico de qualquer reescrita.

DROP TRIGGER IF EXISTS audit_siga_cash_expenses_change ON public.siga_cash_expenses;
CREATE TRIGGER audit_siga_cash_expenses_change
  AFTER INSERT OR DELETE OR UPDATE ON public.siga_cash_expenses
  FOR EACH ROW EXECUTE FUNCTION private.audit_row_change();

-- Aprovação das despesas acima de 50 000 Kz (§8, decidido a 25/10/2026): status
-- `pending_approval` até um Administrador que não a registou a aprovar.
--
-- A produção tem um CHECK em `status` que só aceita `posted` e `reversed` (retrato de
-- 21/10, `valores`), mas o nome não está em nenhum ficheiro do repositório. O bloco
-- abaixo encontra os CHECK da tabela que falam de `status` e troca-os por um com nome
-- conhecido. Sem esta migração o servidor lança a despesa como antes (posted).
DO $$
declare
  v_name text;
begin
  for v_name in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.siga_cash_expenses'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format('ALTER TABLE public.siga_cash_expenses DROP CONSTRAINT %I', v_name);
  end loop;
end $$;

ALTER TABLE public.siga_cash_expenses
  ADD CONSTRAINT siga_cash_expenses_status_check
  CHECK (status IN ('posted', 'reversed', 'pending_approval'));

-- Quem aprovou e quando. Sem estas colunas o servidor aprova na mesma e guarda quem
-- aprovou em `updated_by`.
ALTER TABLE public.siga_cash_expenses
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;
