-- SIGA · Financeiro 2026 · verificar (só leitura; não muda nada)
--
-- Abrir no SQL Editor do Supabase (projecto xodgfmxiaunpamctfeea) e correr tudo.
-- Dá três resultados:
--   1. qual das cinco migrações está aplicada;
--   2. as restrições CHECK de siga_cash_expenses e se a 20261025100000 troca cada uma
--      («troca» = true só na lista de estados; as outras ficam como estão);
--   3. as versões já registadas no histórico de migrações.
-- Se em 1 estiver tudo false, aplicar SIGA_aplicar_financeiro_2026.sql.

-- 1. Estado de cada migração (true = aplicada)
select '20261024090000 estorno conta a multa' as migracao,
  coalesce((select position('penalty_amount' in prosrc) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'private' and proname = 'reverse_finance_receipt'), false) as aplicada
union all select '20261024100000 chave de idempotência',
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'finance_receipts' and column_name = 'idempotency_key')
union all select '20261025110000 sessões de caixa na versão final',
  to_regclass('public.finance_cash_deposits') is not null
  and coalesce((select position('external_id' in prosrc) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'private' and proname = 'cash_movement_attach_session'), false)
union all select '20261025090000 propina única por mês',
  exists (select 1 from pg_trigger where tgname = 'finance_invoices_one_tuition_per_month')
union all select '20261025100000 aprovação e auditoria de despesas',
  exists (select 1 from pg_trigger where tgname = 'audit_siga_cash_expenses_change');

-- 2. Restrições das despesas
select conname, pg_get_constraintdef(oid) as definicao,
  pg_get_constraintdef(oid) ~ '^CHECK \(\(status = ANY \(ARRAY\[' as troca
from pg_constraint
where conrelid = 'public.siga_cash_expenses'::regclass and contype = 'c'
order by 1;

-- 3. Histórico
select version, name from supabase_migrations.schema_migrations
where version in ('20261024090000', '20261024100000', '20261025110000', '20261025090000', '20261025100000')
order by version;
