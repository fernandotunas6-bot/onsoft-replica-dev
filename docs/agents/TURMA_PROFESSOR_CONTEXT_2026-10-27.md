# SIGA Plus — Painel Contextual do Professor na Turma (27/10/2026)

## Objectivo
Evoluir a ficha `/pedagogica/turmas/<id>` sem criar uma segunda sidebar global. Em ecrãs largos, o resumo contextual aparece à direita, em ecrãs menores segue o conteúdo em leitura natural.

## Implementação
- `src/features/academic/components/TurmaTeacherContextPanel.tsx`: painel próprio da ficha.
- `src/routes/pedagogica_.turmas.$turmaId.tsx`: montagem só para a função Professor.
- Consultar `listClassTasks({ classGroupId })` — a guarda do servidor é a fonte de verdade para escolas, funções e disciplinas autorizadas; não criar consulta Supabase directa no navegador.
- Reutilizar a mesma chave do React Query da página de trabalhos para evitar pedidos redundantes.
- Ligações reais para trabalhos/entregas, horário, planos e presenças; sem botões de demonstração.
- Botões para atribuir professor, editar, aplicar currículo, reactivar ou desactivar turma: apenas Admin/Secretaria com permissão pedagógica; endpoints preservam validação no servidor.

## Definições dos indicadores
- **Trabalhos em curso**: publicados com prazo hoje/futuro ou sem prazo.
- **Prazo terminado**: publicados com data de entrega anterior ao dia actual em Luanda. Não significa corrigidos nem entregues por todos.
- A consulta de `listClassTasks` é limitada a **200** linhas. Os números representam apenas a lista recebida; não os totais absolutos do ano.
- **Aulas no horário semanal**: blocos existentes no horário completo da turma, não número de aulas dadas nem apenas as do professor.
- Aulas leccionadas, entrada/saída, faltas justificadas e planos executados **não têm contador nesta fase** porque dependem de registos de execução. O painel liga aos módulos oficiais sem inventar valores.
- Estado indisponível ou erro não se confunde com zero.

## Próxima fase (não incluída nesta PR)
Acrescentar agregados server-side para entregas recebidas, por corrigir, corrigidas, aulas dadas/confirmadas e cumprimento do plano, por turma e professor, sem inferir execução a partir do calendário. Criar testes com credenciais em staging, duas escolas e dois docentes. Validar mobile físico antes de produção.

## Portões de integração
- `bun run typecheck`, `bun run lint`, `bun run test` no CI.
- Confirmar que o painel não aparece a aluno/encarregado.
- Nenhuma migração SQL; nenhum acesso alargado; sem alterações às PRs paralelas de horários/contexto.
- Sem deploy automático antes de aprovação do CI e integração segura no `main`.
