# Auditoria das matrículas no Mobile V4 — 10-10-2026

Base: produção `xodgfmxiaunpamctfeea`. Só se correram contagens de leitura agregadas, sem nomes nem dados pessoais. Nada foi escrito na base.

## Dados em produção

| Verificação                                         | Resultado                                                                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Matrículas                                          | 76 (36 activas, 40 pendentes) em 35 escolas                                                                                          |
| Ano da matrícula diferente do ano da turma          | 0                                                                                                                                    |
| Matrícula de uma escola numa turma de outra         | 0                                                                                                                                    |
| Matrícula aberta com `ended_on` ou início no futuro | 0                                                                                                                                    |
| Matrícula terminada sem `ended_on`                  | 0                                                                                                                                    |
| Aluno com duas matrículas abertas no mesmo ano      | 0                                                                                                                                    |
| Activas: turma, ano, aluno e pessoa activos         | 36 de 36                                                                                                                             |
| Pendentes                                           | 40, todas numa escola, em turmas `draft`, 39 com aluno `applicant`, criadas a 08-10-2026, nenhuma vinda de `enrollment_applications` |

As matrículas activas estão consistentes. As 40 pendentes parecem uma admissão em preparação: turmas ainda em rascunho, por isso não aparecem no Mobile nem entram na chamada.

## Corrigido

1. **A lista da turma do professor e a chamada tinham regras diferentes.** O portal faz a chamada com as matrículas activas **e pendentes** da turma. A lista do professor no Mobile só tinha as activas, e o servidor aceitava ambas. Assim, um aluno com matrícula pendente numa turma activa ficava fora da chamada no Mobile e a sessão fechava sem ele. Agora `ROSTER_ENROLLMENT_STATUSES` (`academic-scope.server.ts`) é a mesma regra na lista, no catálogo e na chamada. O aluno continua a ver só as suas matrículas activas.
2. **A chamada fechava com alunos por marcar.** Ao fechar, a sessão passa a `completed`. Um aluno sem registo ficava sem presença nem falta, e só se podia acrescentar no portal, como correcção com motivo. Agora o servidor recusa (`409 ATTENDANCE_ROSTER_CHANGED`) quando falta um aluno da turma, e a app pede para actualizar e voltar a fazer a chamada.
3. **A lista de alunos sai por nome**, como no portal, e não pela ordem da base.

O formato dos dados entre a app e o servidor não mudou: uma app antiga continua a funcionar.

## Fica por decidir

- O portal ainda deixa fechar uma chamada incompleta (`submitAttendanceCallBatch`). Aplicar a mesma regra lá é uma mudança na Pedagógica, fora do Mobile.
- O ensino superior inscreve por unidade curricular (`course_unit_enrollments`). O Mobile só lê `enrollments` e ainda não mostra essas inscrições.
- As 40 matrículas pendentes em turmas `draft` devem ser confirmadas pela escola.
