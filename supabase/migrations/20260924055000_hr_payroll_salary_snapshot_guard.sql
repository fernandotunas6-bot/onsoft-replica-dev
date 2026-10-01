-- Prevent approval of stale payroll after a salary amendment.
create or replace function public.hr_guard_payroll_salary_snapshot()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_item record; v_effective numeric(16,2); v_change_count integer;
begin
 if new.status='approved' and old.status is distinct from 'approved' then
  for v_item in
   select i.contract_id,i.base_amount_kz,c.base_salary_kz,c.salary_type,
     coalesce(p.remuneration_model,case when c.salary_type='monthly' then 'fixed_deduct_absence' else 'validated_units' end) as model
   from public.hr_payroll_items i
   join public.hr_contracts c on c.id=i.contract_id and c.school_id=i.school_id
   left join public.hr_contract_remuneration_policies p on p.contract_id=c.id and p.school_id=c.school_id and p.active=true
   where i.payroll_run_id=new.id and i.school_id=new.school_id and i.status<>'cancelled'
  loop
   if v_item.model in ('fixed_deduct_absence','hybrid') then
    select count(*) into v_change_count from public.hr_contract_salary_amendments a
    where a.contract_id=v_item.contract_id and a.school_id=new.school_id
      and a.effective_on>new.period_start and a.effective_on<=new.period_end;
    if v_change_count>0 then
     raise exception 'Alteração salarial durante a competência exige cálculo proporcional específico' using errcode='23514';
    end if;
    select coalesce(
      (select a.new_base_salary_kz from public.hr_contract_salary_amendments a
       where a.contract_id=v_item.contract_id and a.school_id=new.school_id
         and a.effective_on<=new.period_start
       order by a.effective_on desc,a.created_at desc limit 1),
      v_item.base_salary_kz
    ) into v_effective;
    if v_item.base_amount_kz is distinct from v_effective then
     raise exception 'Folha desactualizada: recalcular salário do contrato %',v_item.contract_id using errcode='23514';
    end if;
   end if;
  end loop;
 end if;
 return new;
end $$;
drop trigger if exists hr_payroll_salary_snapshot_guard on public.hr_payroll_runs;
create trigger hr_payroll_salary_snapshot_guard before update of status on public.hr_payroll_runs
for each row execute function public.hr_guard_payroll_salary_snapshot();
revoke all on function public.hr_guard_payroll_salary_snapshot() from public,anon,authenticated;
