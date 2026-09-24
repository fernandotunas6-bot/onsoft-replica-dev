-- Governança: school_billing_settings é configuração operacional segura para
-- importação controlada. Segredos e credenciais continuam fora do catálogo importável.
update public.import_table_specs
set direct_import_policy = 'controlled',
    module_code = 'financeiro',
    notes = concat_ws(' ', nullif(notes, ''), 'Autorizada para importação controlada: parâmetros de cobrança escolar, sem segredos.')
where table_schema = 'public'
  and table_name = 'school_billing_settings';
