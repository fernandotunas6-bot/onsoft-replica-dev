Verificação transaccional local, sem acesso à produção.

Requer @electric-sql/pglite@0.3.14. Executar `node tests/sql/audit-transactions.mjs`.
Pode definir SIGA_SQL_TEST_MODULE_PATH com o caminho absoluto do módulo, sem alterar dependências do projecto.

O fixture reproduz colunas, tipos, defaults e NOT NULL lidos da produção; as permissões são simuladas e a função register_student foi capturada da base. A migração real corre duas vezes. Os testes verificam isolamento, 2FA, rollback de cadastro/documentos/alunos, numeração de docentes, rollback do estorno e estorno duplicado. Não substitui testes de carga ou de todas as políticas RLS.

Confirmação salarial: `node tests/sql/payroll-confirmation.mjs` (mesma dependência PGlite). Verifica execução idempotente da migração, isolamento, MFA, grants, política manual, valores, falha sem caixa, rollback com falha injectada, reenvio com referência consistente e conclusão de lote/competência. Fixture com tabelas originais e trigger de imutabilidade; FKs para entidades fora do cenário são omitidas. Concorrência PostgreSQL real não é simulada pelo PGlite.

Destino salarial: `node tests/sql/payment-destination.mjs` (mesma dependência PGlite). Verifica criação/actualização com rollback quando a auditoria falha, isolamento, MFA, grant de leitura, validação, máscaras e reenvio sem duplicação. Fixture usa DDL original do vínculo/destino, com FKs de entidades fora do cenário omitidas. Não simula concorrência PostgreSQL real.
