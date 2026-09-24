-- Only block amendments that affect an already-approved payroll containing this contract.
-- A paid run for an unrelated staff member must not freeze every salary in a school.
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
 select r.id into v_run
 from public.hr_payroll_runs r
 join public.hr_payroll_items i
   on i.payroll_run_id=r.id and i.school_id=r.school_id
 where r.school_id=new.school_id
   and i.contract_id=new.contract_id
   and i.status<>'cancelled'
   and r.period_end>=new.effective_on
   and r.status in ('approved','processing','paid')
 order by r.period_start limit 1;
 if v_run is not null then
  raise exception 'Alteração afecta folha aprovada ou em pagamento (%). É necessário procedimento de rectificação',
    v_run using errcode='23514';
 end if;
 if exists(
  select 1 from public.hr_contract_salary_amendments a
  where a.contract_id=new.contract_id and a.effective_on>=new.effective_on
 ) then
  raise exception 'Data salarial anterior ou igual a alteração já aplicada' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function public.hr_guard_salary_amendment_ledger() from public,anon,authenticated;
