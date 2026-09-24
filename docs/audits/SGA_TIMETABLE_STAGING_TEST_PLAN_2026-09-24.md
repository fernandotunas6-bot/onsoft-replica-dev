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

## Critérios adicionais para publicação

- Uma versão em rascunho com conflitos internos não pode ser publicada, incluindo dados criados antes dos novos triggers.
- Atribuir um professor a aulas de uma versão publicada não pode provocar colisões com outras versões publicadas cujas datas se sobreponham.
- Corrigir as datas dos dois horários publicados existentes em ambiente controlado antes de ativar a política de datas obrigatórias; não inventar datas automaticamente.
- **Bloqueador de implantação:** verificar com duas sessões que a aquisição do bloqueio consultivo depois do bloqueio implícito da linha de UPDATE não causa deadlock entre edição de `class_subjects` e inserção de `timetable_slots`. Se ocorrer, redesenhar os fluxos para adquirir o bloqueio por escola antes das operações de escrita, no início da transação.

## Segurança dos triggers SECURITY DEFINER

As cinco funções de integridade usam `SECURITY DEFINER` com `search_path = ''` e referências qualificadas. Criar/implantar exclusivamente com um papel administrativo controlado; confirmar o proprietário efetivo, `rolbypassrls`, privilégios no esquema `private` e revogações de `EXECUTE` para `PUBLIC`, `anon` e `authenticated`. Não conceder execução direta a utilizadores: as funções são chamadas apenas pelos triggers. Testar que um utilizador com permissão para escrever numa escola não consegue referenciar recursos de outra escola e que os triggers identificam conflitos mesmo quando RLS oculta a outra aula. A autorização de escrita continua nas políticas RLS existentes; SECURITY DEFINER aqui destina-se apenas à verificação de integridade.

## Gate de implantação

Não ativar enquanto não forem aprovados testes reais de concorrência, permissões RLS, publicação e tratamento das duas versões publicadas sem datas válidas. O bloqueio consultivo dentro de um trigger `BEFORE UPDATE` pode ser adquirido após o bloqueio da linha; isto pode causar deadlocks em transações concorrentes que alteram atribuições e aulas. Se os testes demonstrarem esse risco, mover a aquisição do bloqueio para o início das transações de escrita, antes dos updates, e restringir os caminhos de escrita direta.
