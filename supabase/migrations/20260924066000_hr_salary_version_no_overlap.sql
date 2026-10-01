-- Prevent two approved salary tables for the same scale from being simultaneously valid.
create or replace function public.hr_guard_salary_scale_effective_period()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.status='approved' then
  perform 1 from public.hr_salary_scales where id=new.scale_id for update;
  if exists (
   select 1 from public.hr_salary_scale_versions v
   where v.scale_id=new.scale_id and v.id<>new.id and v.status='approved'
     and daterange(v.effective_from,coalesce(v.effective_until,'infinity'::date),'[]')
      && daterange(new.effective_from,coalesce(new.effective_until,'infinity'::date),'[]')
  ) then
   raise exception 'Versões salariais aprovadas não podem ter períodos sobrepostos' using errcode='23514';
  end if;
  if new.approved_at is null then
   raise exception 'Aprovação salarial exige data de aprovação' using errcode='23514';
  end if;
  if not exists(select 1 from public.hr_salary_scale_steps s where s.version_id=new.id) then
   raise exception 'Não é possível aprovar tabela salarial sem escalões' using errcode='23514';
  end if;
 end if;
 return new;
end $$;
drop trigger if exists hr_salary_scale_period_guard on public.hr_salary_scale_versions;
create trigger hr_salary_scale_period_guard before insert or update of status,effective_from,effective_until
on public.hr_salary_scale_versions for each row execute function public.hr_guard_salary_scale_effective_period();
revoke all on function public.hr_guard_salary_scale_effective_period() from public,anon,authenticated;
