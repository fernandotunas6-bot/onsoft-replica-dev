-- Serialize source event edits with payroll approval to eliminate late-event races.
CREATE OR REPLACE FUNCTION public.hr_guard_finalized_payroll_source_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_school uuid;
 v_employment uuid;
 v_contract uuid;
 v_date date;
 v_locked_run uuid;
 v_pass integer;
begin
 if tg_op='UPDATE' and new.school_id is distinct from old.school_id then
  raise exception 'Não é permitido transferir eventos remuneratórios entre escolas'
    using errcode='23514';
 end if;
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

  -- Same school-level transaction lock as payroll approval. It closes the race
  -- between posting a retroactive event and approving its payroll.
  perform pg_advisory_xact_lock(hashtextextended('hr_salary_payroll:'||v_school::text,0));
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
end $function$
;
