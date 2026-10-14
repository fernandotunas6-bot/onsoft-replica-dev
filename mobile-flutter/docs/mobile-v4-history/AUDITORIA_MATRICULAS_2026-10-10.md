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

## Segunda ronda (11-10-2026)

| Verificação                                                       | Resultado    |
| ----------------------------------------------------------------- | ------------ |
| Matrículas activas cujo aluno tem conta ligada (`people.user_id`) | **0 de 36**  |
| Matrículas activas em turmas sem disciplinas atribuídas           | **33 de 36** |
| Matrículas activas em turmas sem horário                          | 33 de 36     |
| Chamadas fechadas com alunos da turma por marcar                  | 0 de 2       |
| Presenças de alunos fora da turma                                 | 0            |
| Notas sem matrícula, ou em matrículas terminadas                  | 0            |
| Linhas de pauta noutra turma                                      | 0            |
| Inscrições do ensino superior (`course_unit_enrollments`)         | 0            |

Os dados que existem estão coerentes. O problema é operacional: hoje nenhum aluno consegue entrar no Mobile, porque nenhum tem conta ligada à ficha. Mesmo com conta, 33 dos 36 veriam uma lista vazia, porque a turma não tem disciplinas. Isto resolve-se no SIGA Plus (ligar contas, atribuir disciplinas), não no Mobile.

O Mobile passa a explicar estes casos:

- `ACADEMIC_IDENTITY_REQUIRED` diz «A sua conta ainda não está ligada à sua ficha… Peça à secretaria que a ligue», em vez de «Sem autorização».
- `ACADEMIC_IDENTITY_CONFLICT` e `ACADEMIC_SCOPE_CHANGED` também têm mensagem própria (`services/api.ts`).
- Sem turmas ou disciplinas atribuídas, as páginas dizem isso a cada perfil, em vez de «Sem resultados para os filtros seleccionados».

## Fica por decidir

- O portal ainda deixa fechar uma chamada incompleta (`submitAttendanceCallBatch`). Aplicar a mesma regra lá é uma mudança na Pedagógica, fora do Mobile.
- O ensino superior inscreve por unidade curricular (`course_unit_enrollments`). O Mobile só lê `enrollments`. Ainda não há nenhuma inscrição destas em produção.
- O aluno só vê no Mobile as pautas do ano activo. O portal mostra também as de anos anteriores.
- Ligar as contas dos alunos e atribuir as disciplinas às 33 turmas.
- As 40 matrículas pendentes em turmas `draft` devem ser confirmadas pela escola.

## Painel de prontidão (SIGA → Definições → Prontidão do Mobile)

`/configuracoes/mobile`, só para o Administrador e só de leitura. Mostra quantos alunos e professores já conseguem usar o Mobile e, caso a caso, o que falta aos outros, com atalho para o resolver:

| Grupo       | Verificação                                                                                          | Atalho                         |
| ----------- | ---------------------------------------------------------------------------------------------------- | ------------------------------ |
| Alunos      | sem e-mail na ficha · e-mail repetido · por convidar · convite por aceitar · conta sem o papel Aluno | ficha do aluno, Acessos        |
| Professores | as mesmas cinco, com o papel Professor · sem disciplinas atribuídas                                  | ficha do professor, Pedagógica |
| Turmas      | turmas com alunos e sem disciplinas · disciplinas sem professor · disciplinas sem horário            | Pedagógica, na turma certa     |

As regras são as do servidor do Mobile (ano, turma e matrícula activos; horário publicado ou sem versão; papel no vínculo activo). O e-mail aparece à parte porque a conta só se liga à ficha, ao aceitar o convite, pelo e-mail exacto e quando há uma única ficha sem conta com ele. Os e-mails não saem do servidor.

Lê com a sessão do Administrador (`context.supabase`, respeita RLS). Todas as tabelas lidas têm política SELECT para ele em produção. Código: `src/features/school/mobile-readiness.ts` (regras), `mobile-readiness-server.ts` (leitura), `MobileReadinessContent.tsx`, `src/routes/configuracoes_.mobile.tsx`. Testes: `tests/school/mobile-readiness*.test.ts*`.

### Ligação da conta à ficha (`src/features/access/person-link.ts`)

O painel manda convidar em Acessos. Ao verificar esse caminho, a criação de conta em Acessos (`inviteSystemUser`) ligava a ficha de forma diferente do aceitar convite:

- comparava o e-mail à letra: uma ficha com «Ana@Escola.ao» ou com espaços nunca ficava ligada, e ninguém era avisado;
- não verificava se a ficha já tinha conta, e podia trocar a conta de uma ficha já ligada.

Agora os dois caminhos usam `linkPersonByEmail`: e-mail inteiro sem olhar a maiúsculas nem espaços, curingas do ILIKE escapados, só com uma única ficha sem conta, e nunca troca uma conta já ligada. Se a conta de um aluno, professor ou encarregado não ficar ligada, Acessos mostra o motivo e aponta para a Prontidão do Mobile. Testes: `tests/access/person-link.test.ts`.
