Verificação transaccional local, sem acesso à produção.

Requer @electric-sql/pglite@0.3.14. Executar `node tests/sql/audit-transactions.mjs`.
Pode definir SIGA_SQL_TEST_MODULE_PATH com o caminho absoluto do módulo, sem alterar dependências do projecto.

O fixture reproduz colunas, tipos, defaults e NOT NULL lidos da produção; as permissões são simuladas e a função register_student foi capturada da base. A migração real corre duas vezes. Os testes verificam isolamento, 2FA, rollback de cadastro/documentos/alunos, numeração de docentes, rollback do estorno e estorno duplicado. Não substitui testes de carga ou de todas as políticas RLS.

Comunicados e tempo real (2026-10-04): `node tests/sql/announcements-rls.mjs` ensaia a leitura de `school_announcements` com o papel `authenticated` antes e depois da migração 20261004100000 (pessoal lê todos; alunos e encarregados só os enviados e não os do corpo docente; outra escola isolada). `node tests/sql/realtime-package.mjs` corre duas vezes o pacote `docs/agents/SIGA_aplicar_comunicados_tempo_real.sql`, confirma que uma tabela ausente é saltada e que a confirmação do pacote e as sondas de `SIGA_confirmar_migracoes.sql` passam de «EM FALTA» a «aplicada». O fixture `announcements-fixture.sql` tem as colunas, defaults e a política lidos da produção; `private.is_school_staff` vem da migração que a criou.
