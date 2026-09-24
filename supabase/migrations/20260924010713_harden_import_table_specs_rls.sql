-- Keep the schema catalog server-side by default.
alter table public.import_table_specs enable row level security;
alter table public.import_table_specs force row level security;
comment on table public.import_table_specs is 'Catálogo governado do schema público do SGA para import/export. Uso server-side; sem acesso directo do cliente por defeito.';
