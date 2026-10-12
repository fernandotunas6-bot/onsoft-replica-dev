# Auditoria 14 — lógica e funções, a começar pelas matrículas (2026-10-10)

**Pedido do dono:** auditoria completa do sistema em lógicas e funções, começando pelas
matrículas; simplificar o processo e evitar repetições de lógica.

**Método.**

1. **Código**: todos os caminhos que criam, colocam, mudam, confirmam ou fecham uma matrícula,
   lidos de ponta a ponta (ecrã → server function → RPC → gatilho), e depois uma varredura do
   `src` inteiro por funções com o mesmo nome definidas em vários ficheiros.
2. **Produção** (`xodgfmxiaunpamctfeea`), **só leituras**: definições das funções e restrições da
   base (corpo de `private.enroll_student`, `people_sex_check`…) e contagens agregadas, sem dados
   pessoais. Nada foi escrito.
3. **Portas de qualidade** antes e depois.

**Limites.** Não abri os ecrãs contra a produção (sem chaves neste ambiente): os defeitos de ecrã
foram deduzidos do código e confirmados nas restrições e nos dados da base. Nenhuma migração nova.

## 1. Medições

| Verificação    | Antes                                  | Depois                         |
| -------------- | -------------------------------------- | ------------------------------ |
| `tsc --noEmit` | 0 erros                                | 0 erros                        |
| ESLint         | 0 erros, 47 avisos                     | 0 erros, 47 avisos (os mesmos) |
| Vitest         | 3 247 passam, 19 ignorados (496 fich.) | ver secção 7                   |

Produção (leitura de 2026-10-10): 48 escolas; o Colégio Adventista do Huambo tem 42 alunos, dos
quais **39 «candidatos» com matrícula pendente** (secção 5, A1); 0 pessoas com género `other`
e 0 candidaturas com género «outro» (ninguém conseguiu gravá-lo, M2).

## 2. Veredicto

**A matrícula tinha uma regra na base e sete cópias dela no servidor.** `private.enroll_student`
e o gatilho de mudança de turma estão certos e são a autoridade. Mas a chamada a
`register_student`/`enroll_student`, a tradução da recusa por falta de 2FA, «colocar ou mudar de
turma», o estado do aluno depois disso e a montagem da ficha de pessoa estavam escritas em sete
sítios (três server functions de alunos, a candidatura, o lote e dois importadores), e as cópias
já tinham divergido: uma levantava a suspensão de um aluno ao mudá-lo de turma, outra reactivava
matrículas anuladas, três gravavam o género «Outro» de uma forma que a base recusa, e nenhuma
conseguia voltar a matricular um aluno depois de lhe anularem a matrícula.

Agora há **um núcleo** (`src/features/students/enrollment-core.ts`) e **uma ficha de pessoa**
(`src/features/people/person-fields.ts`); as funções do ecrã, a candidatura, o lote e os
importadores chamam-nos.

## 3. O processo de matrícula, antes e depois

| Operação                      | Antes                                                               | Depois                                                              |
| ----------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Novo aluno com turma          | `enrollNewStudent` e `createStudent` (sem ecrã), quase iguais       | `enrollNewStudent`; turma validada antes de criar a pessoa          |
| Aceitar candidatura           | cópia própria de tudo (pessoa, BI, 2FA, RPCs)                       | mesma ficha de pessoa e mesmas RPCs do núcleo                       |
| Colocar / mudar turma (ficha) | `updateEnrollment` se tinha matrícula, senão `enrollStudentInClass` | `enrollStudentInClass` → `placeStudentInClass`                      |
| Colocar / mudar turma (lista) | `enrollStudentInClass`, turma escolhida pelo texto                  | `placeStudentInClass`, turma escolhida pelo id                      |
| Atribuir turma em lote        | regra própria para estado e 2FA                                     | mesmas regras (estado, 2FA, reabrir quem saiu, confirmar pendentes) |
| Importar alunos / matrículas  | chamadas próprias às RPCs, 2FA com outra expressão                  | núcleo; importador de matrículas reabre quem saiu e activa o aluno  |
| Ano lectivo da colocação      | vinha do browser                                                    | é o da turma; o do browser só se confirma                           |

## 4. Achados corrigidos

| #   | Sev. | Achado                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Correcção                                                                                                                                                                                                                       |
| --- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | P1   | **Voltar a matricular era impossível.** `private.enroll_student` só aceita alunos `applicant`/`active` (confirmado na produção). Desde a auditoria 13 (A4), anular a última matrícula deixa o aluno `inactive` — e o comentário prometia «matriculá-lo de novo volta a pô-lo activo». Não voltava: dava sempre «Estudante, ano letivo ou data de matrícula inválida», na ficha, na lista, no lote e na importação. O mesmo para transferidos e concluídos que regressam. | Quem saiu (`inactive`, `cancelled`, `transferred`, `graduated`, `withdrawn`) volta a candidato, a matrícula corre por `enroll_student` e o aluno fica activo com histórico; se a matrícula falhar, o estado anterior é reposto. |
| M2  | P1   | **Género «Outro» recusado pela base.** O formulário oferece «Outro» (`outro`) em Nova pessoa, Nova matrícula e na candidatura pública; as três conversões (`mapSex` e duas cópias) deixavam passar `"outro"`, que `people_sex_check` recusa. Gravar falhava; uma candidatura com «Outro» não se podia aceitar. Produção: 0 pessoas `other`.                                                                                                                              | `toStoredSex` (`outro` → `other`), usado pela ficha de pessoa única.                                                                                                                                                            |
| M3  | P2   | **Aluno criado a meio.** Turma cheia, ano não activo ou data fora do ano só se descobriam em `enroll_student`, **depois** de criar a pessoa e o aluno («Aluno criado, mas falhou a matrícula na turma»). O ecrã de Nova matrícula ainda perguntava se queria «continuar com a matrícula extraordinária» numa turma cheia — o que a base nunca permitiu.                                                                                                                  | `assertClassAcceptsEnrollment` (turma activa, ano activo, data, lotação) antes de criar seja o que for, em Nova matrícula e na candidatura; o ecrã recusa a turma cheia com a razão.                                            |
| M4  | P2   | **Mudar de turma levantava a suspensão.** `enrollStudentInClass` e o lote punham o aluno `active` sem condição: mover um aluno suspenso ou trancado anulava a decisão, com histórico «Colocado em turma».                                                                                                                                                                                                                                                                | Suspenso e trancado ficam como estão (`studentStatusAfterPlacement`); sem matrícula, a colocação é recusada com a razão.                                                                                                        |
| M5  | P2   | **Uma leitura que escrevia.** `searchStudents` (lista de alunos, papel de leitura) gravava `students.status = active` para candidatos com matrícula activa: sem histórico, sem o guarda de escrita da escola bloqueada (auditoria 13, A1), feito por quem só podia ler.                                                                                                                                                                                                  | Removido. O estado mostrado já vinha de `deriveAcademicStatus`; as colocações activam o aluno com histórico.                                                                                                                    |
| M6  | P2   | **Importador de matrículas.** A cache lia todas as matrículas do ano, sem paginação e sem filtrar o estado: uma anulada podia ficar no lugar da corrente (com «actualizar» era reactivada — o defeito que a auditoria 13 corrigiu no ecrã, C5), um aluno só com a anulada era «ignorado», e acima de 1000 matrículas as restantes não eram reconhecidas. Ao actualizar, o aluno candidato não ficava activo.                                                             | Só matrículas correntes, em páginas (`selectAllPages`); suspensos recusados na análise; quem saiu é reaberto; o aluno fica activo com histórico.                                                                                |
| M7  | P2   | **Turma errada nas acções da lista.** «Turma», «Mudar» e «Atribuir turma» escolhiam a turma pelo texto «nome · classe»: duas turmas «A · 10ª» de cursos diferentes davam sempre a primeira. «Mudar» não excluía a turma actual (comparava o rótulo com o nome).                                                                                                                                                                                                          | Opções `{ value: id, label }` (`classGroupChoices`), também na ficha (que juntava um pedaço do id ao rótulo).                                                                                                                   |
| M8  | P2   | **Lote deixava a matrícula pendente.** Um aluno já na turma com matrícula pendente passava a «activo» e a matrícula continuava pendente.                                                                                                                                                                                                                                                                                                                                 | O lote confirma-a (sem gastar lugar: já o ocupava), como a colocação individual.                                                                                                                                                |
| M9  | P3   | **Ficha sem turma para matrícula pendente.** `getStudentProfile` só lia a matrícula `active`: os 39 alunos do Huambo com matrícula pendente apareciam com turma na lista e sem turma na ficha. O dossiê dizia «Activa» para qualquer matrícula.                                                                                                                                                                                                                          | Lê a matrícula corrente (activa, senão pendente); estado da matrícula com rótulo próprio («Pendente», «Activa»…).                                                                                                               |
| M10 | P3   | **BI e telefone.** A matrícula interna gravava o BI sem normalizar e sem o documento BI (as outras duas entradas faziam-no); o telefone do encarregado da candidatura ia como escrito.                                                                                                                                                                                                                                                                                   | Mesma montagem nas três entradas; BI em `person_documents` por `syncBiDocumentFromNif` (já usado ao editar a ficha).                                                                                                            |
| M11 | P3   | A ficha resumida (modal) mostrava sempre «—» no género: comparava com `"M"`/`"F"` e a base guarda `male`/`female`.                                                                                                                                                                                                                                                                                                                                                       | `sexLabel`.                                                                                                                                                                                                                     |
| M12 | P3   | As recusas de `register_student`/`enroll_student` (22023) chegavam ao ecrã como a mensagem genérica.                                                                                                                                                                                                                                                                                                                                                                     | As três mensagens da base passam tal como estão (`server-error.ts`).                                                                                                                                                            |
| M13 | P3   | **Rótulos diferentes para o mesmo estado:** o distintivo dizia «Desistente», o filtro e o CSV da mesma lista «Inactivo»; a ficha tinha um terceiro mapa, sem «Candidato».                                                                                                                                                                                                                                                                                                | `ACADEMIC_STATUS_LABELS` em todo o lado (`academicStatusLabel`, `studentStatusChoices`).                                                                                                                                        |

## 5. Achados abertos (pedem decisão)

| #   | Sev. | Achado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | O que falta                                                                                                           |
| --- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| A1  | P2   | **Dados do Huambo.** 40 matrículas `pending` criadas a 08/10 com números `MAT-980001`…`MAT-980040` — fora da sequência de `enroll_student` e sem registo de importação, por isso escritas fora da aplicação. 39 dos 42 alunos estão «candidato» por causa delas. Não mexi.                                                                                                                                                                                                                                                                                                                   | **Resolvido (12/10, decisão do dono):** confirmadas as 40 matrículas; 39 alunos activados com histórico; 0 pendentes. |
| A2  | P2   | **Matrículas antes de o ano começar.** `enroll_student` exige o ano lectivo `active` e a data de matrícula dentro dele. Matricular em Agosto para o ano que começa a 1 de Setembro não é possível. Hoje os 35 anos activos contêm a data de hoje.                                                                                                                                                                                                                                                                                                                                            | Decisão de produto: aceitar a data de início do ano como data de matrícula antecipada (mudança na RPC, por migração). |
| A3  | P3   | Mudar de turma grava pelo servidor (sem 2FA); matricular exige 2FA na base. Mantive como estava.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | **Decidido (12/10):** mantém-se sem 2FA.                                                                              |
| A4  | P3   | `listEnrollments` continua sem ecrã (com âmbito desde a auditoria 13).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Retirar, ou ligar a um ecrã.                                                                                          |
| A5  | P3   | **Duplicação estrutural fora das matrículas** (não mexi: cada uma pede ensaio próprio): `academic/server-legacy.ts` (2 452 linhas) e `server-secure-legacy.ts` (1 036) por cima do novo; `sga-grades.ts` e `sga-grades-legacy.ts` (paridade testada); `academic-bootstrap.ts` e `-legacy.ts`; duas pontes nativas do desktop (`desktop-utils.ts` e `tauri-bridge.ts`, com impressão térmica, catraca e informação do sistema nas duas); mais de dez consultas «professor desta conta» com formas diferentes; em `pedagogica.tsx` e no horário as opções ainda são texto com um pedaço do id. | Um a um, com a paridade testada antes de apagar o lado antigo.                                                        |

## 6. Repetições eliminadas

| Lógica                                        | Cópias antes                                                        | Agora                                              |
| --------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------- |
| Chamada a `register_student`                  | 4 (`createStudent`, `enrollNewStudent`, candidatura, importador)    | `registerStudentRpc`                               |
| Chamada a `enroll_student`                    | 7 (as três funções de alunos, lote, candidatura, dois importadores) | `enrollStudentRpc` / `enrollStudentReopening`      |
| Recusa por falta de 2FA                       | 6, com três expressões diferentes (incluindo os pagamentos)         | `isRpcAuthDenied` (`server-error.ts`)              |
| Colocar / mudar de turma                      | 3 caminhos com regras diferentes                                    | `placeStudentInClass` (+ as mesmas regras no lote) |
| Estado do aluno depois da colocação           | 3                                                                   | `syncStudentStatusAfterPlacement`                  |
| Ficha de pessoa a inserir                     | 3 (+ o encarregado da candidatura)                                  | `buildPersonInsert`                                |
| Género (gravar, inicial da pauta, rótulo)     | 3 conversões + 2 iniciais + 1 rótulo errado                         | `toStoredSex`, `sexInitial`, `sexLabel`            |
| «Base sem as colunas de morada»               | 3                                                                   | `isMissingPeopleGeography`                         |
| Documento BI                                  | 2                                                                   | `syncBiDocumentFromNif`                            |
| Rótulos e escolhas de estado do aluno         | 3 mapas + 2 traduções rótulo→estado                                 | `ACADEMIC_STATUS_LABELS`, `studentStatusChoices`   |
| Primeiro valor de várias colunas (importação) | 17 importadores                                                     | `valueOf` (`engine/normalize.ts`)                  |
| Escapar HTML                                  | 8, em três versões (três não escapavam `'`)                         | `src/lib/escape-html.ts`                           |
| «Tabela ainda por criar»                      | 4                                                                   | `isMissingTable` (`server-error.ts`)               |
| Ler a linha de um domínio de definições       | 3 (Definições, Documentos, gravação com versão)                     | `readSettingsDomainRow`                            |
| Método de pagamento para o livro de recibos   | 2 (tesouraria e webhook do gateway)                                 | `finance/payment-method.ts`                        |
| Professor desta conta (académico)             | 3 idênticas                                                         | `academic/own-teacher.ts`                          |
| Rótulo de opção com id / id pela posição      | 3 + 2                                                               | `src/lib/option-label.ts`                          |
| Bytes → base64 (HMAC)                         | 2                                                                   | `src/lib/base64.ts`                                |

**Código morto retirado:** `createStudent` e o seu esquema (sem chamadas; duplicava
`enrollNewStudent`), `updateEnrollment` e o esquema (aceitava `inactive`/`withdrawn`, que a base
recusa), o mapa `estadoTone` (sem uso), a consulta que o importador de alunos fazia para descobrir
o id da matrícula que `enroll_student` já devolve, e `src/lib/saas/provisioning-service.ts` (sem
utilizadores; quando o servidor falhava mostrava números inventados — 1 450 alunos, 440 000 Kz de
receita mensal).

## 7. Verificação

Testes novos: `tests/students/enrollment-core.test.ts` (colocação em turma contra uma base em
memória: mudar na mesma matrícula, suspensão preservada, anulada nunca reactivada, ano da turma,
reabrir quem saiu e repor se falhar, recusa sem 2FA antes de escrever, validação da turma),
`tests/people/person-fields.test.ts` (género, BI, telefone, morada, opções de turma, rótulos) e
três casos novos em `tests/import/matriculas-commit.test.ts`. Os contratos que procuravam o código
no sítio antigo (`decide-application-integrity`, `auditoria-13-fluxos`, `batch-writes`,
`checked-writes`) apontam agora para o núcleo, com a mesma garantia; o de `updateEnrollment`
saiu com a função e a garantia passou para os testes de comportamento.

Resultados finais: secção «Verificação final» do PR.

## 8. Segunda passagem (pedido do dono, 2026-10-10): sem matrícula e ciclos de matrícula

**Filtro «Sem matrícula»** em `/alunos`: alunos da escola sem matrícula pendente ou activa
(transferidos e concluídos não entram). `searchStudents` devolve `has_current_enrollment`, e a
turma mostrada passa a ser só a da matrícula corrente (antes podia ser a de uma matrícula
anulada). A acção «Turma» aparece para todos estes alunos (não só para candidatos), salvo
suspensos e trancados.

**Ciclos de matrícula** (`src/features/students/enrollment-cycle.ts`, domínio de definições
`enrollment`, editor em Definições › Matrícula):

- Matrícula **nova** só dentro de um ciclo e **nunca durante um período de aulas** (os `terms` do
  ano activo). Sem ciclos definidos, fica aberta só fora dos períodos de aulas. Um ciclo que
  coincida com um período de aulas é recusado ao gravar.
- **Excepção:** a Administração matricula fora do ciclo indicando o motivo; cada matrícula assim
  fica em `audit_logs` (`students.enrollment_outside_cycle`). A Secretaria é recusada com a razão
  e o próximo ciclo.
- Vale para Nova matrícula com turma, colocar em turma, aceitar candidatura com turma, atribuir
  turma em lote e importações (a Administração pode importar fora do ciclo, com registo).
  **Não** vale para mudar de turma dentro do ano, confirmar matrícula pendente, registar o aluno
  sem turma, nem receber candidaturas no formulário público.
- Matrícula feita antes de o ano começar grava a data de início do ano (resolve em parte A2:
  continua a exigir o ano já activo).

**Efeito imediato na produção:** no Colégio do Huambo os períodos de aulas cobrem o ano inteiro
(01/09/2026 a 31/07/2027), por isso desde já só a Administração faz matrículas novas, com motivo,
até a escola definir ciclos fora das aulas (ou os períodos deixarem intervalos). Só 2 escolas têm
períodos definidos; as restantes ficam abertas.

**Na base (migração escrita e ensaiada, por aplicar):** `20261012100000_enrollment_cycle_guard.sql`
— gatilho `BEFORE INSERT` em `enrollments` com a mesma regra, para quem chamar `enroll_student`
directamente pela API. A Administração passa (o motivo exige-o o servidor); escritas sem
utilizador não são afectadas; mudar de turma não passa pelo gatilho. Ensaio
`tests/sql/enrollment-cycle-guard.mjs`. **Dono:** aplicar no SQL Editor
`docs/agents/SIGA_aplicar_ciclos_matricula.sql` e recapturar o retrato.

## 9. Terceira passagem: Finanças na lista de alunos

| #   | Sev. | Achado                                                                                                                                                                                                                                                                                                        | Correcção                                                                                      |
| --- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| F1  | P2   | A lista de alunos calculava a dívida **sem a multa por atraso**: não pedia `penalty_amount` à base, e o total estava copiado em `academic-status.ts`. A ficha e as Finanças incluem a multa, por isso o mesmo aluno tinha duas dívidas diferentes. Produção: 0 faturas com multa (nenhum número errado hoje). | A lista pede a multa; o total usa `invoiceNetTotal`, a regra única de `invoice-settlement.ts`. |

| F2 | P2 | **Faturas em atraso falsas.** O painel (`ops.overdueInvoices`) e o sino liam as primeiras 250 (ou 5 000) faturas e recibos da escola, sem ordem. Acima disso, uma fatura paga cujo recibo ficasse fora do corte contava como em atraso, e faturas além do corte não contavam. A conta estava escrita duas vezes. Produção: 38 faturas, ainda sem efeito. | `countOverdueInvoices` (`finance/overdue-invoices.ts`): só faturas por pagar já vencidas, em páginas, e só os recibos delas. |
| F3 | P3 | «Quanto foi pago de cada fatura» copiado em seis sítios. | `sumPaidByInvoice` (`invoice-settlement.ts`) onde a soma era tudo o que o ciclo fazia. |

Corrigido depois (F4): os gráficos do painel (receita por mês, canais) liam até 3 000 faturas e
recibos sem ordem; passam a ler tudo em páginas (`selectAllPages`). Uma agregação na base seria
mais leve numa escola muito grande, mas já não há números cortados.

Verificado e sem mudança: os rótulos de opção em Pedagógica, horário e ficha do professor levam o
início do id, por isso não confundem opções homónimas (ao contrário de M7).

## 10. Quarta passagem: pautas e notas

| #   | Sev. | Achado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Correcção                                                                                                                                                  |
| --- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | P2   | **A mesma média com dois valores.** Havia três arredondamentos de notas: o do modelo de avaliação (exacto, sobre o valor decimal) e dois com `+ Number.EPSILON` (pautas impressas e médias de `angola-academic`). Em 1 022 de 40 401 pares de notas davam resultados diferentes: (0,1 + 4,6) / 2 = 2,35 saía 2,4 num e 2,3 nos outros, porque o computador guarda 2,3499999…. Não encontrei casos exactamente no limiar de aprovação (10), mas a nota do ecrã e a da pauta podiam diferir em 0,1. Produção: 1 nota lançada, 0 pautas. | `roundHalfUp` em `angola-academic.ts`, usado pelos três. Teste `tests/academic/grade-rounding-single-rule.test.ts` compara as três vias em todos os pares. |

Aberto (P3): quando falta a prova do trimestre, a média de `angola-academic` mostra a MAC sozinha **Decidido (12/10): manter.**
(provisória) e a da pauta deixa em branco. É uma diferença de propósito (ecrã provisório vs pauta
oficial), mas convém o dono confirmar.

## 11. Quinta passagem: presenças

| #   | Sev. | Achado                                                                                                                                                                                                                                                                                             | Correcção                                                |
| --- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| P1  | P3   | O histórico de presenças do aluno calculava a taxa com fórmula própria, contando as aulas «não registadas» no total: a taxa saía mais baixa do que a da ficha e da pauta (`computeAttendanceRate` e `siga_recompute_attendance_rates` excluem-nas). Produção: 20 registos, nenhum «não registado». | Usa `computeAttendanceRate` sobre os registos contáveis. |

## 12. Sexta passagem: recursos humanos

A folha salarial calcula tudo na base (`hr_calculate_payroll_run` e afins): uma só regra.

| #   | Sev. | Achado                                                                                                                                                                                                                                                                                                                                               | Correcção                                                                                                 |
| --- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| R1  | P3   | O desconto **estimado** de uma falta (ecrã das faltas) usava sempre o salário do contrato; a folha desconta com o salário em vigor na data da falta (últimas alterações salariais). Depois de uma alteração salarial, o ecrã prometia um desconto e a folha fazia outro. Arredondava ainda com `+ Number.EPSILON`. Produção: 0 faltas, 0 alterações. | `absence-deduction.ts` (`baseSalaryOn`, `estimateAbsenceDeduction`) com a regra da folha e `roundHalfUp`. |

## 13. Sétima passagem: datas e cópias restantes

| #   | Sev. | Achado                                                                                                                                                                                                                                                                                                                                   | Correcção                                                                                  |
| --- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| D1  | P3   | «Hoje + N dias» calculado em UTC em quatro sítios (Angola é UTC+1): a fatura pró-forma emitia com a data de Luanda e vencia com a de UTC (perto da meia-noite, 14 dias em vez de 15); a lista de aulas recentes do professor e o fim por omissão do horário avançado podiam começar um dia antes; o Ensino Superior somava 1 hora à mão. | `schoolDayOffsetIso` em `school-date.ts`; o Ensino Superior usa `schoolTodayIso`.          |
| D2  | —    | Cópias idênticas: contexto de administração dos Alumni (2), código HTTP de erro da API SaaS (2), ficheiro → base64 (3, em duas versões).                                                                                                                                                                                                 | `alumni/admin-context.ts`, `saas/auth-error-status.ts`, `fileToBase64` em `lib/base64.ts`. |

## 14. Documentos e numeração

Faturas e recibos: numerados na base (`invoice-numbering`, sequências), sem achados. Documentos
oficiais: `document_sequences` por escola, sem achados.

| #   | Sev. | Achado                                                                                                                                                                                                                                                                                                                              | O que falta                                                                                                                              |
| --- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| N2  | P3   | **Número da fatura pró-forma** (`faturas.tsx`): `FP-<ano>/<n.º de faturas + 1>`, calculado no browser e nunca gravado. Todas as pró-formas emitidas entre duas faturas reais saem com o mesmo número, e a contagem é de todos os anos (não recomeça em Janeiro). A pró-forma não é documento fiscal, mas o número aparece impresso. | **Resolvido (12/10, opção B):** número pela data e hora de emissão em Luanda, `FP-AAAAMMDD-HHMMSS` (`proformaNumber`, `school-date.ts`). |

## 15. Oitava passagem: catracas, comunicações, calendário e acessos

| Id  | Gr. | Achado                                                                                                                                                            | Correcção                                                                       |
| --- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| C1  | P2  | **Lista offline das catracas cortada aos 1000 cartões** (`exportGatePassOfflineList`): numa escola maior, os alunos a mais eram recusados com a portaria offline. | Leitura em páginas (`selectAllPages`).                                          |
| C2  | P2  | **Atrasos à portaria pela hora UTC**: «depois das 08:00» era 09:00 em Luanda; a hora mostrada também vinha em UTC.                                                | Hora e apresentação em `Africa/Luanda`.                                         |
| C3  | P2  | **«Hoje» na reconciliação portaria/sala começava às 01:00 de Luanda** e sem limite superior; entradas e presenças cortadas aos 1000.                              | Dia de Luanda (`+01:00`, até ao dia seguinte), leituras em páginas.             |
| C4  | P3  | A «entrada» usada era a primeira linha devolvida, não a primeira do dia: atrasos falsos com várias passagens.                                                     | Escolhe a entrada mais cedo.                                                    |
| C5  | P3  | Estatísticas de envios (comunicações) contadas sobre leitura cortada aos 1000.                                                                                    | Leitura em páginas.                                                             |
| C6  | P3  | Cópias: `todayInLuanda` (calendário) e `isMissingTable` (pedidos de acesso); ano do cartão em UTC na noite de 31/12.                                              | Usam `schoolTodayIso` e o `isMissingTable` partilhado; ano pela data de Luanda. |

Verificado sem achados: todas as escritas destas pastas passam por `requireSgaWriterForWrite`.
