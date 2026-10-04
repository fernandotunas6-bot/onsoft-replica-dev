Verificação transaccional local, sem acesso à produção.

Requer @electric-sql/pglite@0.3.14. Executar `node tests/sql/audit-transactions.mjs`.
Pode definir SIGA_SQL_TEST_MODULE_PATH com o caminho absoluto do módulo, sem alterar dependências do projecto.

O fixture reproduz colunas, tipos, defaults e NOT NULL lidos da produção; as permissões são simuladas e a função register_student foi capturada da base. A migração real corre duas vezes. Os testes verificam isolamento, 2FA, rollback de cadastro/documentos/alunos, numeração de docentes, rollback do estorno e estorno duplicado. Não substitui testes de carga ou de todas as políticas RLS.

Trabalhador-estudante (2026-10-04): `node tests/sql/higher-ed-statuses.mjs` corre duas vezes o pacote `docs/agents/SIGA_aplicar_trabalhador_estudante.sql` e confirma que anon e authenticated ficam sem acesso nenhum, o RLS forçado, um estatuto por estudante e ano, o comprovativo obrigatório e a revogação completa (quando, por quem).

Tempo real (2026-10-04): `node tests/sql/realtime-package.mjs` corre duas vezes o pacote `docs/agents/SIGA_aplicar_tempo_real.sql`, confirma que uma tabela ausente é saltada e que a confirmação do pacote e a sonda de `SIGA_confirmar_migracoes.sql` passam de «EM FALTA» a «aplicada».
