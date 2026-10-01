-- Reject approval while remuneration or absence events for a calculated item
-- are still pending; otherwise the payroll can silently exclude unreviewed evidence.
create or replace function public.hr_guard_payroll_pending_inputs()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_problem record;
begin
 if new.status<>'approved' or old.status='approved' then return new; end if;

 select i.employment_id,ce.id as event_id,'remuneration'::text as event_kind
 into v_problem
 from public.hr_payroll_items i
 join public.hr_employments e
   on e.id=i.employment_id and e.school_id=i.school_id
 join public.hr_contracts c
   on c.id=i.contract_id and c.school_id=i.school_id
 join public.hr_compensation_events ce
   on ce.school_id=i.school_id and ce.employment_id=i.employment_id
   and (ce.contract_id is null or ce.contract_id=c.id)
   and ce.deleted_at is null and ce.validation_status='pending'
   and ce.event_date between
     greatest(new.period_start,e.hire_date,c.starts_on)
     and least(new.period_end,coalesce(e.termination_date,new.period_end),
               coalesce(c.ends_on,new.period_end))
 where i.payroll_run_id=new.id and i.school_id=new.school_id
   and i.status<>'cancelled'
 limit 1;

 if found then
  raise exception 'Evento remuneratório % ainda pendente para o vínculo %. Valide ou rejeite antes de aprovar a folha.',
    v_problem.event_id,v_problem.employment_id using errcode='23514';
 end if;

 select i.employment_id,ae.id as event_id,'absence'::text as event_kind
 into v_problem
 from public.hr_payroll_items i
 join public.hr_employments e
   on e.id=i.employment_id and e.school_id=i.school_id
 join public.hr_contracts c
   on c.id=i.contract_id and c.school_id=i.school_id
 join public.hr_absence_events ae
   on ae.school_id=i.school_id and ae.employment_id=i.employment_id
   and (ae.contract_id is null or ae.contract_id=c.id)
   and ae.deleted_at is null and ae.validation_status='pending'
   and ae.absence_date between
     greatest(new.period_start,e.hire_date,c.starts_on)
     and least(new.period_end,coalesce(e.termination_date,new.period_end),
               coalesce(c.ends_on,new.period_end))
 where i.payroll_run_id=new.id and i.school_id=new.school_id
   and i.status<>'cancelled'
 limit 1;

 if found then
  raise exception 'Falta % ainda pendente para o vínculo %. Valide ou rejeite antes de aprovar a folha.',
    v_problem.event_id,v_problem.employment_id using errcode='23514';
 end if;

 return new;
end $$;
drop trigger if exists hr_payroll_pending_inputs_guard on public.hr_payroll_runs;
create trigger hr_payroll_pending_inputs_guard
before update of status on public.hr_payroll_runs
for each row execute function public.hr_guard_payroll_pending_inputs();
revoke all on function public.hr_guard_payroll_pending_inputs() from public,anon,authenticated;
