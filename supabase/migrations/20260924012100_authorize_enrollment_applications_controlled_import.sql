-- Governança: candidaturas são dados escolares de negócio e podem ser
-- importadas de forma controlada. A importação não cria aluno automaticamente.
update public.import_table_specs
set direct_import_policy = 'controlled',
    module_code = 'inscricoes',
    notes = concat_ws(' ', nullif(notes, ''), 'Importação controlada: candidaturas escolares; não cria aluno automaticamente.')
where table_schema = 'public'
  and table_name = 'enrollment_applications';
