-- Serialize salary amendment application and payroll approval per school.
-- This closes the race in which an amendment and approval both pass their checks
-- before either transaction commits.
create or replace function public.hr_serialize_salary_payroll()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_school uuid;
begin
 if tg_table_name='hr_payroll_runs' then
  if tg_op<>'UPDATE' or new.status<>'approved' or old.status='approved' then return new; end if;
  v_school:=new.school_id;
 elsif tg_table_name='hr_contract_salary_amendments' then
  if tg_op<>'INSERT' then return coalesce(new,old); end if;
  v_school:=new.school_id;
 else
  raise exception 'Gatilho de serialização associado a tabela inesperada' using errcode='23514';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('hr_salary_payroll:'||v_school::text,0));
 return new;
end $$;
drop trigger if exists hr_aa_salary_payroll_serialization on public.hr_payroll_runs;
create trigger hr_aa_salary_payroll_serialization
before update of status on public.hr_payroll_runs
for each row execute function public.hr_serialize_salary_payroll();
drop trigger if exists hr_aa_salary_payroll_serialization on public.hr_contract_salary_amendments;
create trigger hr_aa_salary_payroll_serialization
before insert on public.hr_contract_salary_amendments
for each row execute function public.hr_serialize_salary_payroll();
revoke all on function public.hr_serialize_salary_payroll() from public,anon,authenticated;
