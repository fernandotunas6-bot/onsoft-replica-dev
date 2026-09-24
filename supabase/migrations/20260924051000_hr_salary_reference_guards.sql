-- HR guards applied to Sga on 2026-09-24.
create or replace function public.hr_validate_contract_salary_reference()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_school uuid; v_amount numeric(16,2); v_status text; v_from date; v_until date;
begin
 select school_id into v_school from public.hr_employments where id=new.employment_id and deleted_at is null;
 if v_school is null or v_school<>new.school_id then
  raise exception 'Contrato e vínculo devem pertencer à mesma escola' using errcode='23514';
 end if;
 if new.salary_scale_step_id is not null then
  select s.monthly_base_kz,v.status,v.effective_from,v.effective_until
    into v_amount,v_status,v_from,v_until
    from public.hr_salary_scale_steps s join public.hr_salary_scale_versions v on v.id=s.version_id
   where s.id=new.salary_scale_step_id;
  if v_status is distinct from 'approved' then
   raise exception 'Escalão salarial não aprovado' using errcode='23514';
  end if;
  if new.starts_on<v_from or (v_until is not null and new.starts_on>v_until) then
   raise exception 'Escalão fora da vigência do contrato' using errcode='23514';
  end if;
  if tg_op='INSERT' or new.salary_scale_step_id is distinct from old.salary_scale_step_id then
   new.salary_scale_snapshot_kz:=v_amount;
  elsif new.salary_scale_snapshot_kz is distinct from old.salary_scale_snapshot_kz then
   raise exception 'Snapshot salarial não pode ser alterado sem novo escalão/contrato' using errcode='23514';
  end if;
 elsif tg_op='UPDATE' and old.salary_scale_step_id is not null then
  raise exception 'Remoção de escalão requer novo contrato auditado' using errcode='23514';
 end if;
 return new;
end $$;
drop trigger if exists hr_contract_salary_reference_guard on public.hr_contracts;
create trigger hr_contract_salary_reference_guard before insert or update of employment_id,school_id,salary_scale_step_id,salary_scale_snapshot_kz,starts_on
on public.hr_contracts for each row execute function public.hr_validate_contract_salary_reference();
create or replace function public.hr_guard_approved_salary_version()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_status text;
begin
 if tg_table_name='hr_salary_scale_steps' then
  select status into v_status from public.hr_salary_scale_versions where id=coalesce(new.version_id,old.version_id);
  if v_status='approved' then
   raise exception 'Escalões aprovados são imutáveis; crie uma nova versão' using errcode='23514';
  end if;
 else
  if old.status='approved' and
   (new.status<>'retired' or new.scale_id is distinct from old.scale_id
    or new.effective_from is distinct from old.effective_from
    or new.effective_until is distinct from old.effective_until
    or new.version_label is distinct from old.version_label) then
    raise exception 'Versão aprovada é imutável; apenas reforma é permitida' using errcode='23514';
  end if;
  if old.status='retired' then
   raise exception 'Versão reformada é imutável' using errcode='23514';
  end if;
 end if;
 return coalesce(new,old);
end $$;
drop trigger if exists hr_salary_steps_immutable on public.hr_salary_scale_steps;
create trigger hr_salary_steps_immutable before insert or update or delete on public.hr_salary_scale_steps
for each row execute function public.hr_guard_approved_salary_version();
drop trigger if exists hr_salary_versions_immutable on public.hr_salary_scale_versions;
create trigger hr_salary_versions_immutable before update on public.hr_salary_scale_versions
for each row execute function public.hr_guard_approved_salary_version();
revoke all on function public.hr_validate_contract_salary_reference() from public,anon,authenticated;
revoke all on function public.hr_guard_approved_salary_version() from public,anon,authenticated;
