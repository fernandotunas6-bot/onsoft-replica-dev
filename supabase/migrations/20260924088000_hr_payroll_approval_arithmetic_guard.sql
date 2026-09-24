-- Approval must validate every calculated amount, not merely the payroll grand total.
-- Detect edited/stale line items even if a totals recomputation would otherwise hide them.
create or replace function public.hr_guard_payroll_item_arithmetic()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_item record; v_expected_gross numeric(16,2); v_expected_net numeric(16,2);
begin
 if new.status<>'approved' or old.status='approved' then return new; end if;
 for v_item in
  select i.id,i.base_amount_kz,i.hourly_amount_kz,i.allowances_kz,i.bonuses_kz,
   i.overtime_kz,i.deductions_kz,i.gross_amount_kz,i.net_amount_kz,i.status
  from public.hr_payroll_items i
  where i.payroll_run_id=new.id and i.school_id=new.school_id and i.status<>'cancelled'
 loop
  if v_item.status<>'approved' then
    raise exception 'Item salarial % não está aprovado',v_item.id using errcode='23514';
  end if;
  if v_item.base_amount_kz is null or v_item.hourly_amount_kz is null
   or v_item.allowances_kz is null or v_item.bonuses_kz is null
   or v_item.overtime_kz is null or v_item.deductions_kz is null
   or v_item.gross_amount_kz is null or v_item.net_amount_kz is null then
    raise exception 'Item salarial % possui valores indefinidos',v_item.id using errcode='23514';
  end if;
  v_expected_gross:=round(
    v_item.base_amount_kz+v_item.hourly_amount_kz+v_item.allowances_kz+
    v_item.bonuses_kz+v_item.overtime_kz,2);
  v_expected_net:=round(v_item.gross_amount_kz-v_item.deductions_kz,2);
  if v_expected_gross is distinct from v_item.gross_amount_kz
   or v_expected_net is distinct from v_item.net_amount_kz
   or v_item.deductions_kz>v_item.gross_amount_kz then
    raise exception 'Inconsistência aritmética no item salarial %. Recalcule a folha.',v_item.id
      using errcode='23514';
  end if;
 end loop;
 return new;
end $$;
drop trigger if exists hr_payroll_item_arithmetic_guard on public.hr_payroll_runs;
create trigger hr_payroll_item_arithmetic_guard
before update of status on public.hr_payroll_runs
for each row execute function public.hr_guard_payroll_item_arithmetic();
revoke all on function public.hr_guard_payroll_item_arithmetic() from public,anon,authenticated;
