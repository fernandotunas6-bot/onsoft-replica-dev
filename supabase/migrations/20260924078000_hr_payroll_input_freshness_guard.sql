-- A reviewed payroll is stale when its inputs change after the item was calculated.
-- Include soft-deleted/rejected events: they may have contributed before an update.
create or replace function public.hr_guard_payroll_input_freshness()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_item record; v_calculated timestamptz;
begin
 if new.status<>'approved' or old.status='approved' then return new; end if;
 for v_item in
   select i.employment_id,i.contract_id,i.calculation_details,c.updated_at as contract_updated,
     e.updated_at as employment_updated,p.updated_at as policy_updated
   from public.hr_payroll_items i
   join public.hr_contracts c on c.id=i.contract_id and c.school_id=i.school_id
   join public.hr_employments e on e.id=i.employment_id and e.school_id=i.school_id
   left join public.hr_contract_remuneration_policies p
     on p.contract_id=c.id and p.school_id=c.school_id
   where i.payroll_run_id=new.id and i.school_id=new.school_id and i.status<>'cancelled'
 loop
   if not (v_item.calculation_details ? 'calculated_at') then
     raise exception 'Item salarial sem registo do cálculo: recalcular vínculo %',v_item.employment_id
       using errcode='23514';
   end if;
   v_calculated:=(v_item.calculation_details->>'calculated_at')::timestamptz;
   if v_item.contract_updated>v_calculated or v_item.employment_updated>v_calculated
      or v_item.policy_updated>v_calculated then
     raise exception 'Contrato, vínculo ou política alterados após o cálculo do vínculo %',v_item.employment_id
       using errcode='23514';
   end if;
   if exists (
     select 1 from public.hr_compensation_events ce
     where ce.school_id=new.school_id and ce.employment_id=v_item.employment_id
       and ce.event_date between new.period_start and new.period_end
       and greatest(coalesce(ce.updated_at,ce.created_at),ce.created_at)>v_calculated
   ) then
     raise exception 'Eventos remuneratórios alterados após o cálculo do vínculo %',v_item.employment_id
       using errcode='23514';
   end if;
   if exists (
     select 1 from public.hr_absence_events ae
     where ae.school_id=new.school_id and ae.employment_id=v_item.employment_id
       and ae.absence_date between new.period_start and new.period_end
       and greatest(coalesce(ae.updated_at,ae.created_at),ae.created_at)>v_calculated
   ) then
     raise exception 'Faltas alteradas após o cálculo do vínculo %',v_item.employment_id
       using errcode='23514';
   end if;
 end loop;
 return new;
end $$;
drop trigger if exists hr_payroll_input_freshness_guard on public.hr_payroll_runs;
create trigger hr_payroll_input_freshness_guard
before update of status on public.hr_payroll_runs
for each row execute function public.hr_guard_payroll_input_freshness();
revoke all on function public.hr_guard_payroll_input_freshness() from public,anon,authenticated;
