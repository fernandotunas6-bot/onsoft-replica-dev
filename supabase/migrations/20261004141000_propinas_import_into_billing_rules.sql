-- Importação de «propinas» grava as regras de cobrança activas.
--
-- Até 2026-10-04 o importador gravava em school_billing_settings, que nada lê: as
-- regras activas (Definições › Cobrança, a multa por atraso, o desconto de irmãos)
-- estão em school_settings, domínio billing. Agora grava aí, só no domínio billing,
-- com 2FA e a mesma gravação versionada do ecrã (src/features/import/importers/
-- propinas-importer.ts).
--
-- A governança da importação (src/features/import/engine/governance.ts) exige que a
-- tabela de destino esteja «controlled» no catálogo. school_settings estava em
-- «review»: passa a «controlled», módulo financeiro. Só o importador de propinas a
-- tem como destino, e só o domínio billing; dados bancários, AGT e os outros domínios
-- nunca por importação (tests/finance/late-fee.test.ts confere as duas coisas).
--
-- Não toca nos dados de school_billing_settings (2 linhas a 2026-10-04): o que lá está
-- não passa a valer; cada escola revê as regras em Definições › Cobrança.
--
-- Idempotente: só altera a linha enquanto não estiver «controlled».

UPDATE public.import_table_specs
SET direct_import_policy = 'controlled',
    module_code = 'financeiro',
    notes = concat_ws(
      ' ',
      nullif(notes, ''),
      'Importação controlada só do domínio billing, pelo importador de propinas (com 2FA); dados bancários, AGT e restantes domínios nunca por importação.'
    )
WHERE table_schema = 'public'
  AND table_name = 'school_settings'
  AND direct_import_policy <> 'controlled';
