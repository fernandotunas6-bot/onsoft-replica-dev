# Candidato consolidado da correcção pedagógica — 26/10/2026

Ramo local: `fix/pedagogy-consolidated-20261026`.
Reúne a base `ba289e0e`, as correcções `4220be5a`/`59fcdfdc` e os horários da
PR #338 com o refinamento `10bfd2e7`. Conserva os commits do Claude. A lista de
segurança `rls-client-migration.test.ts` foi resolvida conservando as entradas de
contas/primeira senha/organização etária e de publicação do horário.

## Ler antes de continuar

- [Integridade académica e migração](HANDOFF_PEDAGOGICAL_INTEGRITY_2026-10-26.md).
- [Turnos e propostas de horário](HANDOFF_HORARIOS_CONFIGURADOS_2026-10-26.md).

O utilizador autorizou expressamente commit e push em 26/10. O candidato foi
publicado no [PR #345](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/345),
em rascunho, no ramo `fix/pedagogy-consolidated-20261026`.
O bloqueio anterior por falta de autorização está resolvido. Como o Git local
não dispunha de credenciais de escrita, a ligação GitHub criou o commit remoto
`45640c8d999fec8cc8539b1e6334221dca155cf4`, conservando a ascendência do Claude.
A árvore publicada `e6ffcfeb613c895a3ce7b4b2bf480e2cd923b152` foi comparada com a
árvore local `6aef39ee`: são idênticas. A main e a produção não foram alteradas.

## Destino de revisão

Claude: continuar pelo PR #345 e pelos handoffs acima; preservar as alterações
existentes e verificar os gates seguintes antes de promover.
O candidato **inclui a #338**: não a fundir de novo como alteração independente.
A #336 já inclui a #335 e a #341 inclui a #339. #340, #332 e #343 não foram
integradas neste candidato e devem manter os seus próprios gates.

## Condição de promoção

A migração `20261026110424_academic_write_integrity.sql` tem de ser ensaiada e
aplicada no destino antes de publicar as chamadas às RPC novas. Ausência gera
recusa clara, nunca fallback não atómico. Ensaiar concorrência PostgreSQL e
contas controladas de duas escolas antes da promoção; não aplicar seeds demo
nas escolas reais. Não executar migrações antigas por haver nomes diferentes.

Consulta apenas de catálogo à base SGA nesta sessão confirmou que
`publish_academic_schedule_atomic` já existe como INVOKER, executável por
service_role e não por authenticated; as três RPC novas não estavam instaladas.
Não foram lidos registos de alunos nem executadas mutações na base.

## Alcance

Defeitos de integridade corrigidos, com evidência nos dois handoffs. Periodicidade
por curso, rubricas completas, substituições persistentes, agenda ICS com todas
as excepções e paridade Flutter continuam evoluções de contrato. Não se devem
substituir regras institucionais por defaults inventados para as declarar feitas.

## Validação do candidato acumulado

- TypeScript: aprovado.
- Build cliente, SSR e Worker: aprovado; `routeTree.gen.ts` permaneceu inalterado.
- Suite completa final: **4.983 testes aprovados, 19 ignorados; 726 ficheiros
  aprovados e 3 ignorados**, em 166,08 s. Execução posterior ao ajuste de sala
  com lotação zero; não houve edição de código durante esta execução final.
- ESLint dos alterados e da resolução de conflito: aprovado.
- `check-modules.mjs`: 18 módulos / 185 ficheiros verificados.
- Ensaio PGlite da migração no candidato acumulado: aprovado, incluindo retry de
  devolução após associação tardia à pauta, sem falso anúncio de sincronização.
- Não foram executados E2E autenticado, duas conexões PostgreSQL, aparelhos
  físicos, CI remoto ou implantação. Os testes ignorados continuam ignorados;
  não são apresentados como aprovados.

Não somar as suites dos ramos individuais: o número acima é o da execução
consolidada. A migração nova continua por aplicar; o candidato está no PR #345.

## Refinamento adicional — horários e precisão temporal

Incremento posterior ao candidato `22877dd4`:

- A proposta não trata como livre uma sala legada identificada só pelo nome ou
  rótulo; o ID, quando existe, continua a ser a referência prioritária.
- A grelha configurada, os conflitos, as disponibilidades e a carga docente
  preservam segundos. Blocos contíguos continuam permitidos; sobreposições de
  menos de um minuto são detectadas. CSV/ICS e importação Excel/CSV deixam de
  cortar os segundos, incluindo células de hora do Excel.
- Uma turma com várias versões carregadas não recebe uma proposta aplicada à
  primeira versão encontrada. A proposta explica a ambiguidade sem gravar.
- Dias inválidos e janelas sobrepostas são recusados; dias/janelas são ordenados
  de forma determinística sem modificar os arrays recebidos.
- Gerar proposta fica desactivado enquanto a aplicação anterior está pendente,
  juntamente com a escolha do turno e o limite diário.

Validação deste incremento: **890 testes aprovados em 128 ficheiros** nas áreas
academic/calendar/dashboard/import e utilitários de horários; 52 verificações
específicas incluídas, sem somar contagens sobrepostas. TypeScript aprovado;
ESLint e diff sem erros.
A suite global de 4.983 testes acima refere-se ao candidato anterior, não é uma
nova execução global deste incremento. Não foi acrescentada migração nem houve
alteração de produção. Este incremento foi incluído no envio do PR #345.

## Continuação após o envio — sincronização integral das tarefas

A leitura de entregas no servidor da tarefa passa a paginar por ID único, antes
de escolher a última tentativa de cada matrícula. Corrige a possibilidade de
sincronizar uma tentativa antiga quando o histórico excedia 1.000 registos.
A sincronização das notas devolvidas usa uma única chamada transaccional, em
vez de lotes independentes de 80. Uma recusa no lote não deixa os anteriores
já gravados. Sem notas elegíveis, devolve zero sem chamar a RPC. O limite SQL
de 500 notas mantém-se: um lote maior é recusado integralmente.

Validação: 57 testes aprovados em cinco ficheiros de entregas (servidor, domínio
e interface), escrita de avaliações e trabalhos por disciplina. Incluem 81 notas
recusadas num só pedido, última entrega após 1.000 tentativas e ausência de notas
elegíveis. TypeScript, ESLint dos alterados e diff aprovados.
