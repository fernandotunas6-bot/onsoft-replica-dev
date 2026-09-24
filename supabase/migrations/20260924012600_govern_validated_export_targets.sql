update public.import_table_specs
set export_policy='controlled',
    notes=concat_ws(' ', nullif(notes,''), 'Exportação bidireccional validada em 2026-09-24.')
where table_schema='public' and table_name in
('hr_positions','hr_employments','hr_departments','grade_levels','rooms','timetable_slots','finance_invoices','finance_contracts');
