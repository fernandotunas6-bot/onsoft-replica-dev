# SGA — Plano de validação de horários (staging)

**Estado:** migrações preparadas no PR; NÃO executadas em produção.

## Ordem de implantação

1. Executar as consultas de leitura `timetable-school-reference-preflight.readonly.sql` e `timetable-concurrency-preflight.readonly.sql`. Investigar qualquer resultado.
2. Fazer backup/snapshot do ambiente de ensaio e executar `20260924_timetable_school_reference_guard.sql`.
3. Aplicar `20260924_timetable_concurrency_guard.sql` e depois `20260924_timetable_assignment_guard.sql`.
4. Usar duas sessões autenticadas e duas turmas da mesma escola para testar simultaneidade. Uma sessão grava uma aula das 08:00 às 09:00; a outra tenta atribuir o mesmo professor ou sala das 08:30 às 09:30. A segunda operação deve receber SQLSTATE 23514. Verificar o estado final da tabela.
5. Repetir para edição de aula, alteração do professor em `class_subjects`, reativação de disciplina, aulas consecutivas e salas distintas.
6. Testar isolamento: duas escolas podem ter horários iguais, mas uma escola não pode usar a sala, o turno ou a versão de horário de outra.
7. Validar publicação de versões em separado. O trigger atual compara apenas slots com o mesmo `schedule_id` (incluindo NULL).

## Matriz mínima

| Caso | Resultado esperado |
|---|---|
| Mesmo professor, horário sobreposto, mesma versão | Rejeitado |
| Mesma turma, horário sobreposto, mesma versão | Rejeitado |
| Mesma sala, horário sobreposto, mesma versão | Rejeitado |
| Aulas adjacentes, sem sobreposição | Aceite |
| Horários iguais em escolas distintas | Aceite |
| Sala ou turno de outra escola | Rejeitado |
| Versão de horário de outra turma | Rejeitado |
| Alterar professor para outro já ocupado | Rejeitado |
| Duas gravações concorrentes para o mesmo recurso | Apenas uma aceite |
| Duas aulas da mesma disciplina após mudança de professor | Verificar ambas com os novos valores |
| Mudar professor com colisão histórica de sala não relacionada | Não bloquear apenas pela sala |
| Aula ativa ligada a disciplina inativa | Corrigir antes da implantação |
| Duas versões alternativas de horário | Sem bloqueio cruzado até validação de publicação |

## Limitações que impedem implantação sem testes

- Alterações à disponibilidade do professor, ao calendário, à capacidade da sala e à publicação de versões requerem validações adicionais.
- O trigger de atribuições não deve ser confundido com autorização: RLS e permissões de gestão académica continuam obrigatórias.
- Não aplicar migrações Lovable antigas ao projeto SGA.
- Após aplicar, testar em transações isoladas e confirmar o funcionamento do fluxo completo da interface e da API.

## Verificação de concorrência obrigatória

Os testes devem usar duas conexões reais com transações separadas, isolamento READ COMMITTED e sincronização explícita para forçar a sobreposição. Repetir com atualização de atribuição numa conexão e inserção de aula na outra. Se ocorrer deadlock, timeout ou duas operações aceites, não implantar: rever ordem de aquisição de bloqueios e visibilidade das transações. Não executar estes testes sobre dados de produção.
