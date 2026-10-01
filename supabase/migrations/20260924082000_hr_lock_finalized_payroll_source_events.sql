-- Never change payroll source events after a payroll for that employee and period is locked.
-- Corrections must be recorded through a separate, explicit adjustment workflow.
create or replace function public.hr_guard_finalized_payroll_source_events()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare
 v_school uuid;
 v_employment uuid;
 v_contract uuid;
 v_date date;
 v_locked_run uuid;
 v_pass integer;
begin
 for v_pass in 1..2 loop
  if v_pass=1 then
   if tg_op='INSERT' then continue; end if;
   v_school:=old.school_id;
   v_employment:=old.employment_id;
   v_contract:=old.contract_id;
   if tg_table_name='hr_compensation_events' then
    v_date:=old.event_date;
   elsif tg_table_name='hr_absence_events' then
    v_date:=old.absence_date;
   else
    raise exception 'Gatilho de origem salarial ligado a tabela inesperada' using errcode='23514';
   end if;
  else
   if tg_op='DELETE' then continue; end if;
   v_school:=new.school_id;
   v_employment:=new.employment_id;
   v_contract:=new.contract_id;
   if tg_table_name='hr_compensation_events' then
    v_date:=new.event_date;
   else
    v_date:=new.absence_date;
   end if;
  end if;

  select r.id into v_locked_run
  from public.hr_payroll_runs r
  join public.hr_payroll_items i
    on i.payroll_run_id=r.id and i.school_id=r.school_id
  where r.school_id=v_school
    and i.employment_id=v_employment
    and (v_contract is null or i.contract_id=v_contract)
    and i.status<>'cancelled'
    and r.status in ('approved','processing','paid')
    and v_date between r.period_start and r.period_end
  limit 1;
  if found then
   raise exception 'Registo de presença/remuneração protegido pela folha encerrada %. Utilize rectificação própria.',v_locked_run
     using errcode='23514';
  end if;
 end loop;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
drop trigger if exists hr_lock_finalized_compensation_sources on public.hr_compensation_events;
create trigger hr_lock_finalized_compensation_sources
before insert or update or delete on public.hr_compensation_events
for each row execute function public.hr_guard_finalized_payroll_source_events();
drop trigger if exists hr_lock_finalized_absence_sources on public.hr_absence_events;
create trigger hr_lock_finalized_absence_sources
before insert or update or delete on public.hr_absence_events
for each row execute function public.hr_guard_finalized_payroll_source_events();
revoke all on function public.hr_guard_finalized_payroll_source_events() from public,anon,authenticated;
