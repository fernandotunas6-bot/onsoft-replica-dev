-- Keep a payroll's calculation snapshot fresh when approved salary changes arrive after calculation.
create or replace function public.hr_guard_payroll_salary_snapshot()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_item record; v_expected numeric(16,2); v_calculated_at timestamptz;
begin
 if new.status='approved' and old.status is distinct from 'approved' then
  for v_item in
   select i.contract_id,i.base_amount_kz,i.calculation_details,c.base_salary_kz,c.salary_type,
    coalesce(p.remuneration_model,case when c.salary_type='monthly' then 'fixed_deduct_absence' else 'validated_units' end) as model
   from public.hr_payroll_items i
   join public.hr_contracts c on c.id=i.contract_id and c.school_id=i.school_id
   left join public.hr_contract_remuneration_policies p on p.contract_id=c.id and p.school_id=c.school_id and p.active=true
   where i.payroll_run_id=new.id and i.school_id=new.school_id and i.status<>'cancelled'
  loop
   if v_item.model in ('fixed_deduct_absence','hybrid') then
    if v_item.calculation_details->>'calculated_at' is null then
      raise exception 'Folha sem data de cálculo: recalcular contrato %',v_item.contract_id using errcode='23514';
    end if;
    v_calculated_at:=(v_item.calculation_details->>'calculated_at')::timestamptz;
    if exists (
      select 1 from public.hr_contract_salary_amendments a
      where a.contract_id=v_item.contract_id and a.school_id=new.school_id
       and a.effective_on<=new.period_end and a.created_at>v_calculated_at
    ) then
      raise exception 'Histórico salarial alterado depois do cálculo: recalcular contrato %',v_item.contract_id using errcode='23514';
    end if;
    select round(avg(coalesce(
      (select a.new_base_salary_kz from public.hr_contract_salary_amendments a
       where a.contract_id=v_item.contract_id and a.school_id=new.school_id
         and a.effective_on<=d.pay_date
       order by a.effective_on desc,a.created_at desc limit 1),
      v_item.base_salary_kz)),2)
    into v_expected
    from generate_series(new.period_start,new.period_end,interval '1 day') as d(pay_date);
    if v_item.base_amount_kz is distinct from v_expected then
      raise exception 'Folha desactualizada: recalcular salário do contrato %',v_item.contract_id using errcode='23514';
    end if;
   end if;
  end loop;
 end if;
 return new;
end $$;
