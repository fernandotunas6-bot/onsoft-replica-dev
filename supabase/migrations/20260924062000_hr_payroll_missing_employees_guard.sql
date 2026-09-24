-- A payroll calculation that skipped an eligible employee must never be approved silently.
create or replace function public.hr_guard_payroll_missing_employees()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_missing integer;
begin
 if new.status='approved' and old.status is distinct from 'approved' then
  select count(*) into v_missing
  from public.hr_employments e
  where e.school_id=new.school_id and e.deleted_at is null
    and e.status='active' and e.hire_date<=new.period_end
    and (e.termination_date is null or e.termination_date>=new.period_start)
    and exists(
      select 1 from public.hr_contracts c
      where c.school_id=new.school_id and c.employment_id=e.id
        and c.deleted_at is null and c.status='active'
        and c.starts_on<=new.period_end
        and (c.ends_on is null or c.ends_on>=new.period_start)
    )
    and not exists(
      select 1 from public.hr_payroll_items i
      where i.payroll_run_id=new.id and i.school_id=new.school_id
        and i.employment_id=e.id and i.status<>'cancelled'
    );
  if v_missing>0 then
   raise exception 'Folha incompleta: % funcionários elegíveis sem cálculo. Corrigir antes de aprovar',v_missing using errcode='23514';
  end if;
 end if;
 return new;
end $$;
drop trigger if exists hr_payroll_missing_employees_guard on public.hr_payroll_runs;
create trigger hr_payroll_missing_employees_guard before update of status on public.hr_payroll_runs
for each row execute function public.hr_guard_payroll_missing_employees();
revoke all on function public.hr_guard_payroll_missing_employees() from public,anon,authenticated;
