-- Fail closed if review contains old items that no longer correspond to eligible contracts.
create or replace function public.hr_guard_payroll_stale_items()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_invalid integer;
begin
 if new.status='approved' and old.status is distinct from 'approved' then
  select count(*) into v_invalid
  from public.hr_payroll_items i
  left join public.hr_employments e on e.id=i.employment_id
  left join public.hr_contracts c on c.id=i.contract_id
  where i.payroll_run_id=new.id and i.school_id=new.school_id
    and i.status<>'cancelled'
    and (
      e.id is null or e.school_id<>new.school_id or e.deleted_at is not null
      or e.status<>'active' or e.hire_date>new.period_end
      or (e.termination_date is not null and e.termination_date<new.period_start)
      or c.id is null or c.school_id<>new.school_id or c.employment_id<>i.employment_id
      or c.deleted_at is not null or c.status<>'active' or c.starts_on>new.period_end
      or (c.ends_on is not null and c.ends_on<new.period_start)
    );
  if v_invalid>0 then
   raise exception 'Folha contém % item(ns) com vínculos ou contratos desactualizados. Recalcule antes da aprovação',v_invalid using errcode='23514';
  end if;
 end if;
 return new;
end $$;
drop trigger if exists hr_payroll_stale_items_guard on public.hr_payroll_runs;
create trigger hr_payroll_stale_items_guard before update of status on public.hr_payroll_runs
for each row execute function public.hr_guard_payroll_stale_items();
revoke all on function public.hr_guard_payroll_stale_items() from public,anon,authenticated;
