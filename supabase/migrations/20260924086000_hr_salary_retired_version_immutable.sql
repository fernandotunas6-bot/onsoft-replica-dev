-- Approved/retired salary catalogs are append-only evidence, including their steps.
-- A retired scale remains an historical reference for existing contracts and payrolls.
create or replace function public.hr_guard_approved_salary_version()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_status text;
begin
 if tg_table_name='hr_salary_scale_steps' then
  if tg_op='INSERT' then
   select status into v_status from public.hr_salary_scale_versions where id=new.version_id;
   if v_status in ('approved','retired') then
    raise exception 'Escalões publicados/reformados são imutáveis; crie uma nova versão' using errcode='23514';
   end if;
   return new;
  end if;
  select status into v_status from public.hr_salary_scale_versions where id=old.version_id;
  if v_status in ('approved','retired') then
   raise exception 'Escalões publicados/reformados são imutáveis; crie uma nova versão' using errcode='23514';
  end if;
  if tg_op='UPDATE' and new.version_id is distinct from old.version_id then
   select status into v_status from public.hr_salary_scale_versions where id=new.version_id;
   if v_status in ('approved','retired') then
    raise exception 'Não é permitido inserir escalão numa versão publicada/reformada' using errcode='23514';
   end if;
  end if;
 else
  if tg_op='DELETE' then
   if old.status in ('approved','retired') then
    raise exception 'Versões salariais publicadas/reformadas não podem ser eliminadas' using errcode='23514';
   end if;
   return old;
  end if;
  if tg_op='INSERT' then return new; end if;
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
 return new;
end $$;
drop trigger if exists hr_salary_versions_immutable on public.hr_salary_scale_versions;
create trigger hr_salary_versions_immutable
before update or delete on public.hr_salary_scale_versions
for each row execute function public.hr_guard_approved_salary_version();
revoke all on function public.hr_guard_approved_salary_version() from public,anon,authenticated;
