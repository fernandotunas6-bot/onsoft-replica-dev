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

| #   | Sev. | Achado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | O que falta                                                                                                                                                                                           |
| --- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | P2   | **Dados do Huambo.** 40 matrículas `pending` criadas a 08/10 com números `MAT-980001`…`MAT-980040` — fora da sequência de `enroll_student` e sem registo de importação, por isso escritas fora da aplicação. 39 dos 42 alunos estão «candidato» por causa delas. Não mexi.                                                                                                                                                                                                                                                                                                                   | **Dono:** se são matrículas reais, confirmá-las: em `/alunos`, seleccionar os alunos da turma e «Atribuir turma» à mesma turma (M8) — fica activo, com histórico. Se eram ensaio, anulá-las na ficha. |
| A2  | P2   | **Matrículas antes de o ano começar.** `enroll_student` exige o ano lectivo `active` e a data de matrícula dentro dele. Matricular em Agosto para o ano que começa a 1 de Setembro não é possível. Hoje os 35 anos activos contêm a data de hoje.                                                                                                                                                                                                                                                                                                                                            | Decisão de produto: aceitar a data de início do ano como data de matrícula antecipada (mudança na RPC, por migração).                                                                                 |
| A3  | P3   | Mudar de turma grava pelo servidor (sem 2FA); matricular exige 2FA na base. Mantive como estava.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Decidir se a mudança de turma também exige 2FA.                                                                                                                                                       |
| A4  | P3   | `listEnrollments` continua sem ecrã (com âmbito desde a auditoria 13).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Retirar, ou ligar a um ecrã.                                                                                                                                                                          |
| A5  | P3   | **Duplicação estrutural fora das matrículas** (não mexi: cada uma pede ensaio próprio): `academic/server-legacy.ts` (2 452 linhas) e `server-secure-legacy.ts` (1 036) por cima do novo; `sga-grades.ts` e `sga-grades-legacy.ts` (paridade testada); `academic-bootstrap.ts` e `-legacy.ts`; duas pontes nativas do desktop (`desktop-utils.ts` e `tauri-bridge.ts`, com impressão térmica, catraca e informação do sistema nas duas); mais de dez consultas «professor desta conta» com formas diferentes; em `pedagogica.tsx` e no horário as opções ainda são texto com um pedaço do id. | Um a um, com a paridade testada antes de apagar o lado antigo.                                                                                                                                        |

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

## 8. Segunda passagem — Pessoas, Perfil, Horários e Salas (2026-10-10)

Continuação no mesmo dia, sobre o commit do núcleo (PR #118). Mesmo método: código de ponta a
ponta e **só leituras** na produção (corpos de funções com `pg_get_functiondef`, gatilhos,
restrições e contagens agregadas). Nada escrito na produção.

### 8.1 O PR #118 estava vermelho

O passo «Estilo, acessibilidade e build» falhava no ensaio `tests/sql/late-fee.mjs`: o núcleo
pôs `settings-domains.ts` a importar `server-error.ts`, e a cadeia (`sql-doc-hint` →
`ecosystem-urls`) lia `import.meta.env.DEV` sem guarda, o que rebenta em Node sem Vite.
`ecosystem-urls.ts` lê agora `import.meta.env?.…`, como `platform-domain.ts`. Na mesma
leitura, `readSettingsDomainRow` tratava **qualquer** erro `PGRST` como «tabela em falta» e
devolvia `null` — quem grava com versão passava então a inserir uma linha em vez de recusar.
Usa `isMissingTable`.

### 8.2 Achados corrigidos

| #   | Sev. | Achado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Correcção                                                                                                                                                                                                                                                                                                                 |
| --- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | P1   | **Duas turmas sem sala à mesma hora eram recusadas.** `timetable_slots.room` é obrigatória e não aceita texto vazio; sem sala escolhida, o ecrã grava «Sala». Na produção, `create/update_timetable_slot_guarded` e o gatilho `guard_timetable_slot_conflicts` tratam **qualquer** etiqueta como sala real: a segunda aula de outra turma sem sala, à mesma hora, dá «Conflito de horário… sala sobreposta», e o ecrã não mostra conflito nenhum. Quatro sítios, três listas diferentes de marcadores. | Migração `20261010100000_timetable_rooms_one_placeholder_rule.sql` (**por aplicar**, pacote `docs/agents/SIGA_aplicar_auditoria14_2026-10-10.sql`): as duas funções e os dois gatilhos perguntam a `private.timetable_room_is_explicit`, que passa a incluir «s/n». O ecrã usa a mesma lista (`PLACEHOLDER_ROOM_LABELS`). |
| P1  | P2   | **Número de professor por contagem.** «Novo professor» e a ligação de um login a um professor (duas cópias) davam `DOC-<total+1>`. Com um número em falta — há na produção uma escola com um professor importado noutro formato e saltos na série — a contagem repete um número já usado e a criação falha com «chave duplicada». Hoje ainda não colide; colide ao primeiro salto que calhe.                                                                                                           | `people/teacher-number.ts`: maior número `DOC-NNNNNN` + 1, com nova tentativa se um pedido concorrente ficar com ele. Mensagem própria para `teachers_school_id_employee_number_key`.                                                                                                                                     |
| P2  | P2   | **«Novo professor» deixava uma pessoa solta** quando a criação do professor falhava (número repetido, por exemplo); a tentativa seguinte criava outra.                                                                                                                                                                                                                                                                                                                                                 | A pessoa criada para esse professor é retirada (`deleted_at`) se o professor não ficar gravado.                                                                                                                                                                                                                           |
| U1  | P3   | **Perfil:** `updateCurrentProfile` tinha uma segunda tentativa «só com o nome» para bases sem `phone`/`first_name`/`last_name`. As colunas existem na produção. Quando a primeira gravação falhava por outra razão, gravava o nome à parte e podia devolver o telefone como se tivesse ficado guardado; os metadados da conta recebiam o telefone por normalizar.                                                                                                                                      | Uma só gravação, com o erro tal como é; os metadados recebem o telefone normalizado.                                                                                                                                                                                                                                      |

Mais um, corrigido depois: **S1 (P2) Salas** — «Nova sala» e «Editar sala» apanhavam o erro do
servidor, mostravam-no e devolviam sucesso ao formulário, que dizia também «guardado» e fechava,
perdendo o que se escreveu (código de sala repetido, sala em uso ao desactivar, reconfirmação de
identidade). O erro chega agora ao formulário, que fica aberto. Os outros formulários de Pessoas,
Alunos e Horários foram verificados: já deixavam o erro passar.

Na leitura da ficha do aluno e da página pública de matrícula, mais dois, corrigidos:

- **C1 (P2) Candidatura pública:** o telefone do candidato e o do encarregado não eram validados
  no envio (o `.pick` usa o esquema da ficha sem as regras do telefone). Um valor que
  `people_phone_check` recusa (por exemplo «923000000 / 912000000») só falhava ao **aceitar**
  a candidatura, que ficava presa, sem a secretaria poder corrigir o número. Agora valida-se no
  envio com a regra que grava (`normalizeStoredPhone`: Angola ou internacional).
- **AL1 (P3) Mudar estado do aluno:** a gravação em `audit_logs` estava num `try/catch` vazio, mas
  o cliente devolve o erro em vez de o lançar: uma falha perdia-se. Passa a ser registada
  (`reportSigaError`), como na fusão de pessoas.

### 8.3 Achados abertos (pedem decisão)

| #   | Sev. | Achado                                                                                                                                                                                                                                                                                                                                                                                       | O que falta                                                                                                                                                                                                                                                                                                                                                             |
| --- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H2  | P2   | **Mudar o professor numa aula muda-o em todas.** O professor é da disciplina na turma (`class_subjects.teacher_id`): editar uma aula com outro professor actualiza essa linha, e as outras aulas dessa disciplina na turma passam ao novo professor **sem verificar conflitos** nelas (os gatilhos só correm em `timetable_slots`). O novo professor pode ficar em duas turmas à mesma hora. | **Corrigido na migração `20261010100000` (por aplicar):** as duas funções recusam a troca quando o novo professor já tem aula noutra turma à hora de alguma aula dessa disciplina. Ensaio em `tests/sql/timetable-room-placeholders.mjs`.                                                                                                                               |
| H3  | P3   | A migração `20260925170000_timetable_builder_shifts_versions.sql` (nunca aplicada) reescreve as mesmas funções com outra lista (`'s/n','sala'`). Aplicá-la depois da `20261010100000` voltava a recusar «A definir» e «Sem sala fixa».                                                                                                                                                       | **Corrigido no ficheiro:** as três listas passam a `private.timetable_room_is_explicit`. A decisão de a aplicar continua por tomar.                                                                                                                                                                                                                                     |
| P3  | P3   | **Três numerações de professor:** a do servidor (acima), a do importador (`DOC-` + 10 caracteres do id da pessoa) e a sequência da RPC `register_teacher` (`private.teacher_number_sequences`, sem linha para nenhuma escola). `register_teacher` exige 2FA e permissão; nenhum ecrã a usa. Se alguém a usar, o primeiro número dela é `DOC-000001`, que já existe.                          | **Decidido pelo dono (acertar e usar):** migração `20261010110000` (por aplicar): `register_teacher` numera acima do maior `DOC-NNNNNN` da escola; «Novo professor» passa a usá-la (exige 2FA). Até a migração ser aplicada, um número repetido devolvido pela RPC faz o servidor numerar como antes. O importador e a ligação de login usam a mesma regra (maior + 1). |
| P4  | P3   | **Fundir pessoas** são cerca de dez escritas sem transacção (aluno, professor, documentos, cartões, RH, encarregados, papéis, duas fichas). Uma falha a meio deixa a fusão parcial.                                                                                                                                                                                                          | **Decidido pelo dono:** migração `20261010110000` (por aplicar): `private.merge_people`, só para o servidor, numa transacção (ensaio `tests/sql/merge-people.mjs` prova que uma falha no último passo desfaz tudo). Até ser aplicada, o servidor segue os passos de antes (`mergePeopleInSteps`).                                                                       |
| P5  | P3   | **Aceitar candidatura cria sempre um encarregado novo**, mesmo quando o irmão já tem esse encarregado (mesmo telefone): o encarregado fica com duas fichas, cada uma com um educando.                                                                                                                                                                                                        | **Corrigido:** `people/guardian-lookup.ts` reaproveita a ficha com o mesmo telefone e nome, activa, que já é encarregado na escola (só se houver exactamente uma).                                                                                                                                                                                                      |
| P6  | P3   | Editar a ficha não apaga a morada: se os quatro campos vierem vazios, a morada fica como estava (o servidor só escreve a morada quando há algum campo).                                                                                                                                                                                                                                      | **Corrigido:** a ficha 360 (que mostra a morada) envia `includesGeography`; os quatro campos gravam-se tal como vêm. A edição rápida da lista, que não mostra a morada, não lhe toca.                                                                                                                                                                                   |

**Sem defeito encontrado:** aceitar candidatura com turma deixa o aluno activo (`private.enroll_student` actualiza `applicant` → `active`); a reserva da candidatura contra aceitação dupla; desactivar uma sala em uso é recusado; criar e editar aulas fecha a corrida com `pg_advisory_xact_lock`.

### 8.4 Verificação

Ensaio novo `tests/sql/timetable-room-placeholders.mjs` (PGlite): com os corpos da produção
reproduz a recusa da segunda turma sem sala; aplica a migração duas vezes; prova que «Sala»,
«S/N», «A definir» e «Sem sala fixa» deixam de colidir nos quatro sítios e que uma sala de
verdade (por nome ou por id) e a própria turma continuam a colidir. `tests/people/teacher-number.test.ts`
(maior número + 1 com saltos; nova tentativa no número tomado). `tests/security/timetable-overlap-rooms.test.ts`
compara a lista do ecrã com a da migração nova.

### 8.5 Decisões do dono sobre A1, A2 e A3 (2026-10-10)

- **A3 — 2FA na mudança de turma: feito.** `placeStudentInClass` exige 2FA antes de
  matricular **ou** mudar de turma; o lote («Atribuir turma») exige-o se houver alguém a
  matricular, mudar ou confirmar; a importação de matrículas exige-o ao gravar. Sem
  migração.
- **A2 — Matrícula antecipada: feito, por aplicar.** Migração `20261010130000_early_enrollment.sql`
  (no mesmo pacote; ensaio `tests/sql/early-enrollment.mjs`): `enroll_student` aceita o ano
  activo ou em preparação (`draft`) e datas até 183 dias antes do início; a matrícula fica com
  a data de início do ano. A mesma regra no servidor (`enrollmentWindow`), que a verifica antes
  de criar o aluno. No ecrã, escolhe-se o ano seguinte no selector de ano e as turmas dele
  aparecem. Até a migração ser aplicada, a base continua a recusar o ano em preparação.
- **A1 — Huambo: o dono indicou que são reais; a leitura de 2026-10-10 sugere o contrário.**
  As 40 matrículas pendentes estão em duas turmas chamadas **«DEMO — 1.ª Classe A» e
  «DEMO — 1.ª Classe B»** (`DEMO1A`, `DEMO1B`), ambas em rascunho (`draft`), criadas a 08/10,
  com 20 matrículas cada. 39 alunos estão «candidato» e 1 «activo». Antes de confirmar,
  verificar na escola se são alunos reais.
  - **Se forem reais:** (1) Pedagógica › Turmas: pôr as duas turmas em «Activa» (e, se o
    nome «DEMO» não for o certo, mudar o nome); (2) Alunos: filtrar pela turma, seleccionar os
    20 alunos e «Atribuir turma» à mesma turma — confirma as matrículas pendentes e põe os
    alunos «activo», com histórico (M8). Exige 2FA (A3). Repetir para a outra turma.
  - **Se forem de demonstração:** anular as matrículas (ficha do aluno › anular matrícula, ou
    um SQL revisto, que posso preparar) e arquivar as duas turmas. Os alunos ficam «inactivo».

## 9. Terceira passagem — outros problemas (2026-10-10)

**Avisos do Supabase** (segurança e desempenho, leitura de 2026-10-10, lidos por inteiro):

- **Por fazer (dono, painel do Supabase):** Authentication › Password security › activar a
  protecção contra senhas comprometidas (HaveIBeenPwned). Está desligada.
- Os restantes avisos de segurança são intencionais: 76 tabelas «RLS sem políticas» são as que
  só o servidor lê (regra 5 de `DATABASE_RULES.md`); 18 funções `SECURITY DEFINER` chamáveis
  por `authenticated` são as de apoio às políticas e RPCs que verificam 2FA e permissão por
  dentro (`merge_school_subjects`, aplicada hoje, verificada).
- Desempenho: só avisos informativos (209 chaves estrangeiras sem índice, 234 índices sem uso).
  Com o volume actual não pesam; rever quando houver escolas grandes.

**Corrigido — K1 (P2) conta reconhecida como professor pela base e não pelos ecrãs.** A base
(`current_teacher_id`) reconhece o professor por `teachers.user_id` **ou** `people.user_id`; os
ecrãs do servidor (`ownTeacherId` e mais oito sítios) só por `teachers.user_id`. Dois caminhos
ligavam a conta só à pessoa:

- **Fundir pessoas:** a ficha que fica é professor sem conta e o duplicado tem a conta → depois
  da fusão a conta estava na pessoa e não no professor. Corrigido nos passos e em
  `private.merge_people` (ensaio em `tests/sql/merge-people.mjs`).
- **Convidar uma conta** (`inviteSystemUser`) ligava-a à pessoa com o mesmo e-mail: escrevia
  por cima de uma conta já ligada, comparava o e-mail com maiúsculas e não ligava o professor.
  Agora só liga uma ficha sem conta, sem maiúsculas, liga também o professor, e uma falha fica
  registada (antes era engolida).

Na produção, hoje, as 9 fichas de professor têm as duas ligações coerentes; isto evita que
deixem de ter.

**Feito (interface):** as listas de turma, disciplina, professor, sala, ano, classe e
matrícula na Pedagógica, no horário e na ficha do professor mostravam «nome · 3f2e79f0». Agora
só o nome; o pedaço do id entra apenas quando dois nomes coincidem (`distinctOptionLabels`,
`idOptions` em `src/lib/option-label.ts`). O horário e a ficha do professor passam a opções
`{ value: id, label }`; as listas que acham o id pela posição continuam a achá-lo, porque os
rótulos ficam únicos.

**Corrigido — G1 (P2) escritas que tinham perdido o guarda de escrita.** Varredura das funções
do servidor que gravam e não passam por `requireSgaWriterForWrite` nem por um guarda que o
inclua (`assertModuleNotBlocked` em escrita):

- **Eliminar avaliação** (`deleteAssessmentItem`, a versão endurecida em
  `server-secure-legacy.ts`): ao reescrevê-la perdeu-se o guarda que a versão antiga tinha.
  Uma escola bloqueada (suspensa, cancelada, arquivada, trial terminado) continuava a apagar
  avaliações e as notas delas, e quem tinha a Pedagógica em «Nenhum» ou «Leitura» também.
  Repostos, com os mesmos papéis. A versão antiga, sem uso, saiu de `server-legacy.ts`.
- **Registo de documentos emitidos** (`registerIssuedDocument`): emitia documentos oficiais
  numa escola bloqueada. Passa a recusar (só o bloqueio da escola: os recibos são da
  Tesouraria, que pode não ter o módulo Pessoas).
- **Por decidir:** a gestão de acessos (`access/server.ts`: convidar, mudar cargo, suspender
  contas) não aplica o bloqueio da escola. Pode ser intencional — numa escola suspensa o
  administrador pode precisar de gerir contas para regularizar — e fica para o dono decidir.

O resto das escritas sem `requireSgaWriterForWrite` usa guardas próprios que já o incluem
(RH, importação, risco, antigos alunos, AppyPay, Ensino Superior) ou é da própria conta
(perfil, mensagens, portal do antigo aluno) ou pública (candidatura, pedido de acesso).

**Estrutura do servidor académico (A5):** `server-secure-legacy.ts` é uma fachada — as escritas
vêm de `server-legacy.ts`; 6 leituras usam a versão endurecida para o professor e delegam na
antiga para a direcção e a secretaria. As duas continuam necessárias; juntá-las num só
ficheiro é arrumação, sem defeito à vista, e fica para depois.

**Integridade dos dados de produção** (leitura de 2026-10-10, só contagens). A zero:
matrículas correntes em ano fechado, de turma de outro ano, de aluno inactivo/transferido;
alunos activos sem matrícula; turmas acima da lotação; pessoas duplicadas por BI; fichas de aluno
ou professor activas de pessoa inactiva; aulas em disciplinas inactivas; faturas abertas de
matrícula anulada, pagas sem recibo, com recibos acima do valor, ou abertas já pagas; notas acima
da cotação, negativas ou de matrícula anulada; disciplinas atribuídas a professor inactivo;
membros sem papel; contas de professor sem ficha; dois encarregados principais. Diferentes de zero:

- **Turmas «DEMO» (A1):** além das 40 matrículas pendentes, 180 aulas activas no horário, em
  12 turmas «DEMO» em rascunho, todas de 08/10 e da mesma escola. Nada no código gera estes
  nomes: foram escritos directamente na base. Reforça que é um conjunto de demonstração.
- **34 alunos activos sem encarregado.** Não é proibido (alunos adultos, Ensino Superior), mas
  merece revisão pela secretaria.
