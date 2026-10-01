-- Preserve remuneration rules referenced by a calculated or locked payroll.
-- Edits remain possible for future periods, but existing approval freshness guards
-- force recalculation of any draft/review payroll affected by a later edit.
create or replace function public.hr_guard_payroll_policy_history()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_run uuid;
begin
 if tg_op='UPDATE' and new.school_id=old.school_id
   and new.contract_id=old.contract_id then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('hr_salary_payroll:'||old.school_id::text,0));
 select r.id into v_run
 from public.hr_payroll_items i
 join public.hr_payroll_runs r on r.id=i.payroll_run_id and r.school_id=i.school_id
 where i.school_id=old.school_id and i.contract_id=old.contract_id
   and i.status<>'cancelled'
   and r.status in ('review','approved','processing','paid')
 limit 1;
 if v_run is not null then
   raise exception 'Política remuneratória referenciada pela folha %. Mantenha o histórico e crie um novo procedimento.',v_run
     using errcode='23514';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
drop trigger if exists hr_payroll_policy_history_guard on public.hr_contract_remuneration_policies;
create trigger hr_payroll_policy_history_guard
before update or delete on public.hr_contract_remuneration_policies
for each row execute function public.hr_guard_payroll_policy_history();
revoke all on function public.hr_guard_payroll_policy_history() from public,anon,authenticated;
