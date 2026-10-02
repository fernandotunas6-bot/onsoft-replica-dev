-- Concurrency-safe uniqueness for approved requests and salary effective dates.
create unique index if not exists hr_salary_one_approved_unapplied_per_contract
on public.hr_salary_change_requests(contract_id)
where status='approved';
create unique index if not exists hr_salary_amendment_unique_effective_date
on public.hr_contract_salary_amendments(contract_id,effective_on);
