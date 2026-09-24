-- Enrich governed import/export catalog from the live SGA FK and UNIQUE constraints.
update public.import_table_specs s
set fk_dependencies = coalesce((
  select jsonb_agg(
    jsonb_build_object(
      'columns', src.cols,
      'target_table', src.target_table,
      'target_columns', src.target_cols
    ) order by src.target_table, src.target_cols::text
  )
  from (
    select
      array_agg(kcu.column_name order by kcu.ordinal_position) as cols,
      ccu.table_name as target_table,
      array_agg(ccu.column_name order by kcu.ordinal_position) as target_cols
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name=tc.constraint_name
     and kcu.table_schema=tc.table_schema
     and kcu.table_name=tc.table_name
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name=tc.constraint_name
     and ccu.constraint_schema=tc.constraint_schema
    where tc.constraint_type='FOREIGN KEY'
      and tc.table_schema=s.table_schema
      and tc.table_name=s.table_name
    group by ccu.table_name, tc.constraint_name
  ) src
), '[]'::jsonb),
natural_key_columns = coalesce((
  select to_jsonb(array_agg(kcu.column_name order by kcu.ordinal_position))
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name=tc.constraint_name
   and kcu.table_schema=tc.table_schema
   and kcu.table_name=tc.table_name
  where tc.table_schema=s.table_schema
    and tc.table_name=s.table_name
    and tc.constraint_type='UNIQUE'
  group by tc.constraint_name
  order by tc.constraint_name
  limit 1
), '[]'::jsonb),
updated_at=now()
where s.table_schema='public';

comment on column public.import_table_specs.fk_dependencies is 'Foreign-key dependency graph extracted from the live SGA schema.';
comment on column public.import_table_specs.natural_key_columns is 'Candidate natural/unique key columns discovered from live UNIQUE constraints; importer must still validate semantic suitability.';
