# Pessoas, alunos e matrículas — modelo canónico

**Data:** 25/10/2026 · **Fonte de verdade em código:** `src/features/people/enrollment-state.ts`
**Guardado por:** `tests/people/enrollment-state.test.ts`, `tests/people/person-context-soft-delete.test.ts`
**Contexto:** [Finance Master 2026](FINANCE_MASTER_2026.md) · [matriz de contexto](FINANCE_ROUTE_CONTEXT_MATRIX.md)

## O problema

«Esta pessoa é aluno?» e «esta pessoa está matriculada?» são perguntas
diferentes, e o SIGA Plus guarda as respostas em camadas distintas:

| Camada            | Tabela         | O que afirma                                       |
| ----------------- | -------------- | -------------------------------------------------- |
| Identidade        | `people`       | A pessoa existe nesta escola (nome, BI, contacto)  |
| Vínculo declarado | `person_roles` | Papéis institucionais declarados                   |
| Vínculo de aluno  | `students`     | A pessoa recebeu número de aluno                   |
| Matrícula         | `enrollments`  | O aluno matriculou-se num ano lectivo e numa turma |

Cada ecrã respondia à sua maneira, a partir do que tinha à mão — normalmente a
presença do papel «aluno» na lista de papéis, ou a existência de um resumo
académico. Daí vinham duas confusões com consequências reais:

1. **Quem nunca se matriculou era tratado como quem já saiu da escola.** Um
   aluno admitido e ainda sem matrícula aparecia igual a um transferido.
2. **A cobrança de propinas dependia de uma inferência frágil.** A propina do
   ano corrente pende da matrícula, não da identidade; sem uma camada explícita,
   cada ecrã arriscava a sua própria leitura.

## As três camadas canónicas

Mutuamente exclusivas e ordenadas. `derivePersonEnrollmentStatus` é a única
derivação autorizada.

| Estado                | Condição                                             | Significado                                                                       |
| --------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| `pessoa`              | Sem registo vivo em `students`                       | Identidade apenas: encarregado, funcionário, contacto. Pode vir a ser matriculada |
| `aluno_sem_matricula` | Registo vivo em `students`, sem `enrollments` activa | É aluno da escola, mas não tem matrícula no ano corrente                          |
| `aluno_matriculado`   | `enrollments.status = 'active'`                      | Matrícula em curso, com turma e ano lectivo                                       |

Para `aluno_sem_matricula`, o motivo é obrigatório e distingue os dois casos que
antes se confundiam:

| Motivo                | Condição                | Etiqueta                        |
| --------------------- | ----------------------- | ------------------------------- |
| `nunca_matriculado`   | `total_enrollments = 0` | «Admitido, ainda sem matrícula» |
| `matricula_encerrada` | `total_enrollments > 0` | «Matrícula encerrada»           |

Um candidato que submeteu o formulário público vive em
`enrollment_applications` e ainda não é pessoa nem aluno — é uma camada
anterior a esta, e não entra nesta derivação.

## Regras que decorrem do modelo

1. **A matrícula activa tem precedência sobre o histórico.** Um aluno que saiu e
   voltou está `aluno_matriculado`, sem motivo de não-matrícula pendurado.
2. **A cobrança de propina do ano corrente exige matrícula activa**
   (`canBillTuition`). Sem matrícula não há contrato financeiro do ano a
   facturar.
3. **Sem matrícula não significa sem dívida.** Um aluno com matrícula encerrada
   pode manter facturas abertas de anos anteriores, que continuam devidas e
   visíveis no histórico financeiro. Nenhum ecrã deve apresentar o fim da
   matrícula como encerramento da conta.
4. **Um registo de aluno eliminado não torna a pessoa aluna.** A derivação
   consome apenas vínculos vivos.
5. **A camada é resolvida uma vez, no servidor.** `resolvePersonContext`
   devolve-a em `PersonContext.enrollment_status`; nenhum ecrã volta a
   inferi-la. A derivação por papéis permanece apenas como recuo para
   chamadores que ainda não a enviam.

`academic-status.ts` continua responsável pelo estado académico detalhado do
aluno (activo, transferido, concluído, trancado, suspenso) e pelo estado
financeiro. Este módulo responde apenas, e sem ambiguidade, em que camada a
pessoa se encontra.

## Defeitos corrigidos em `resolvePersonContext`

Três fontes do contexto da pessoa têm eliminação lógica ou validade, e nenhuma
era filtrada:

| Fonte               | Defeito                        | Consequência                                                                                     | Correcção                            |
| ------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------ |
| `students`          | `deleted_at` ignorado          | Um registo de aluno eliminado mantinha o papel «aluno» e continuava a produzir resumo financeiro | `.is("deleted_at", null)`            |
| `students`          | `maybeSingle()` sem `limit(1)` | Dois registos vivos para a mesma pessoa faziam falhar a ficha inteira                            | `.limit(1)` antes de `maybeSingle()` |
| `person_roles`      | `deleted_at` ignorado          | Um vínculo declarado e depois apagado continuava a declarar o papel                              | `.is("deleted_at", null)`            |
| `student_guardians` | `valid_until` ignorado         | Um encarregado cuja ligação expirou continuava a constar como corrente                           | `valid_until` nulo ou futuro         |

## Lacuna confirmada e não corrigida

A navegação do **Portal do Encarregado** (`portal-engine.ts`) aponta «Propinas e
Faturas» para `/financeiro` e «Recibos» para `/faturas`. Ambas as páginas, e a
nova `/financeiro/recibos`, exigem papel de escrita em `financeiro`
(Administrador, Tesouraria ou Secretaria), pelo que um encarregado é recusado ao
seguir essas entradas. `/portal` não tem hoje vista financeira própria.

Corrigir isto bem exige uma vista financeira para encarregado, com âmbito
restrito ao próprio educando — trabalho novo, fora do âmbito desta correcção.
**Não foi alterado**: apontar o encarregado para a nova página de recibos
repetiria o mesmo erro de autorização. Fica registado para decisão.
