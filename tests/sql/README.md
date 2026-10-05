Verificação transaccional local, sem acesso à produção.

Requer @electric-sql/pglite@0.3.14. Executar `node tests/sql/audit-transactions.mjs`.
Pode definir SIGA_SQL_TEST_MODULE_PATH com o caminho absoluto do módulo, sem alterar dependências do projecto.

O fixture reproduz colunas, tipos, defaults e NOT NULL lidos da produção; as permissões são simuladas e a função register_student foi capturada da base. A migração real corre duas vezes. Os testes verificam isolamento, 2FA, rollback de cadastro/documentos/alunos, numeração de docentes, rollback do estorno e estorno duplicado. Não substitui testes de carga ou de todas as políticas RLS.

Trabalhador-estudante (2026-10-04): `node tests/sql/higher-ed-statuses.mjs` corre duas vezes o pacote `docs/agents/SIGA_aplicar_trabalhador_estudante.sql` e confirma que anon e authenticated ficam sem acesso nenhum, o RLS forçado, um estatuto por estudante e ano, o comprovativo obrigatório e a revogação completa (quando, por quem).

Tempo real (2026-10-04): `node tests/sql/realtime-package.mjs` corre duas vezes o pacote `docs/agents/SIGA_aplicar_tempo_real.sql`, confirma que uma tabela ausente é saltada e que a confirmação do pacote e a sonda de `SIGA_confirmar_migracoes.sql` passam de «EM FALTA» a «aplicada».

Propina por classe (2026-10-05): `node tests/sql/fee-items-grade-level.mjs` corre o pacote `docs/agents/SIGA_aplicar_propina_por_classe.sql` duas vezes sobre um plano com um preço geral já usado numa fatura, e confirma que o item antigo fica como preço geral, uma classe de outra escola é recusada, só há um preço activo por classe e tipo no plano, apagar uma classe leva o preço dela se nenhuma fatura o usar e é recusado se alguma o usar, e que a confirmação do pacote e a sonda passam de «EM FALTA» a «aplicada».

Multa por atraso (2026-10-04): `node --experimental-strip-types tests/sql/late-fee.mjs` corre o pacote `docs/agents/SIGA_aplicar_multas_atraso.sql` duas vezes (as sondas passam de «EM FALTA» a «aplicada» e o catálogo da importação muda uma só vez) e exercita o `register_payment` real: sem regras não há multa; com 2 % e 5 dias, no último dia da tolerância não há e no seguinte aplica-se uma vez; um pagamento recusado desfaz a multa gravada; «só nos electrónicos» deixa numerário e transferência sem multa; a multa já gravada pelo webhook é cobrada na tesouraria; outra escola não herda a regra. Depois compara `private.late_fee_due` com `lateFeeFor` (`src/features/finance/late-fee.ts`, carregado com um resolve para o `@/`) em 5040 casos, com regras gravadas como texto, fora dos limites e inválidas.
