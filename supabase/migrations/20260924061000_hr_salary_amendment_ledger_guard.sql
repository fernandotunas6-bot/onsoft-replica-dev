-- Protect payroll already approved and make salary amendment ledger append-only.
create or replace function public.hr_guard_salary_amendment_ledger()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_contract_school uuid; v_run uuid;
begin
 if tg_op<>'INSERT' then
  raise exception 'Histórico salarial é imutável; correcções exigem novo processo' using errcode='23514';
 end if;
 select school_id into v_contract_school from public.hr_contracts where id=new.contract_id;
 if v_contract_school is distinct from new.school_id then
  raise exception 'Alteração salarial de outra escola' using errcode='23514';
 end if;
 select id into v_run from public.hr_payroll_runs
 where school_id=new.school_id and period_end>=new.effective_on
   and status in ('approved','paid')
 order by period_start limit 1;
 if v_run is not null then
  raise exception 'Alteração afecta folha aprovada/paga (%). É necessário procedimento de rectificação',v_run using errcode='23514';
 end if;
 if exists(select 1 from public.hr_contract_salary_amendments
           where contract_id=new.contract_id and effective_on>=new.effective_on) then
  raise exception 'Data salarial anterior ou igual a alteração já aplicada' using errcode='23514';
 end if;
 return new;
end $$;
drop trigger if exists hr_salary_amendment_ledger_guard on public.hr_contract_salary_amendments;
create trigger hr_salary_amendment_ledger_guard before insert or update or delete
on public.hr_contract_salary_amendments for each row execute function public.hr_guard_salary_amendment_ledger();
revoke all on function public.hr_guard_salary_amendment_ledger() from public,anon,authenticated;
