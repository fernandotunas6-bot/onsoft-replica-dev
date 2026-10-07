# Auditoria 13 — ciclo completo de uma escola (2026-10-06/07)

**Âmbito pedido:** da criação da escola ao encerramento do ano lectivo, com evidência.
**Commit auditado:** `8d7e180` (branch `main`), o mesmo que está publicado — o «Deploy produção»
n.º 69 correu com êxito sobre este commit a 2026-10-06 15:07 UTC.
**Base:** projecto Supabase `xodgfmxiaunpamctfeea` (produção), lida **só em modo de leitura**
(catálogo, definições de funções, políticas e contagens agregadas; nenhum dado pessoal lido).

## 0. Leitura rápida

**Não está pronto para uma escola usar o ano lectivo inteiro.** O núcleo de segurança está
bem construído e o isolamento entre escolas resistiu a todos os ensaios. O que falta é o
ciclo do ano: não há geração de propinas em lote, a renovação/transição de ano não existe
como processo, encerrar o ano não verifica nada, e há dois caminhos que alteram notas ou
pagamentos fora das regras que o resto do sistema impõe.

O uso real confirma-o: a produção tem 48 escolas (a maioria de teste), 45 alunos,
36 matrículas, 38 faturas, **1 nota lançada, 0 presenças e 0 contas de aluno ou encarregado**.
Nenhuma escola percorreu ainda um período lectivo completo no sistema.

| Área                          | Estado                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------- |
| Isolamento entre escolas      | **Verificado funcional** (réplica com as políticas reais, secção 3)             |
| Escrita directa pela API      | **Verificado funcional** (2FA + permissão; inserção de alunos recusada)         |
| Âmbito do professor           | **Verificado com falha** — lê a escola inteira (F-01)                           |
| Matrícula individual          | Parcialmente verificado (código + funções da produção): sólida                  |
| Renovação / transição de ano  | **Inexistente** (F-03, F-05)                                                    |
| Propinas                      | **Incompleto**: só emissão manual, uma a uma (F-04)                             |
| Pagamentos                    | Verificado por leitura: `register_payment` correcto; importação não (F-08)      |
| Notas e pautas                | Caminho oficial correcto; motor provisório e importação com falhas (F-02, F-06) |
| Qualidade do código           | **Verificado funcional** (secção 2)                                             |
| Jornada integrada (16 passos) | **Bloqueada**: não existe ambiente de testes (secção 5)                         |

## 1. Inventário

- **Stack:** TanStack Start + React 19 + Vite 7, publicado em Cloudflare Workers; Supabase
  (Postgres 17, Auth com hCaptcha e MFA, Storage); PayFlow (Next/vinext em Workers + D1);
  WEB, ADMIN e DOC em Cloudflare Pages; app desktop Tauri (`src-tauri/`, `desktop/`).
- **Código:** 934 ficheiros TS/TSX em `src/`, 63 rotas de topo em `src/routes`, 29 domínios em
  `src/features`.
- **Base:** 189 tabelas `public` (todas com RLS, 102 com RLS forçado), 359 políticas, 148
  funções `public` (39 SECURITY DEFINER) e 125 `private`, 181 gatilhos, 6 buckets (1 público:
  `school-logos`), 190 migrações registadas (última `20261006100000`). Sem `pg_cron`.
- **Tarefas agendadas:** só por GitHub Actions — `saas-lifecycle` (diário, verde nas 2
  execuções), `gateway-failure-rate-check`, CI semanal e e2e semanal.
  **`/api/cron/lesson-reminders` não é chamado por nenhum agendador** (F-14).
- **Perfis:** owner/admin, secretaria, tesouraria, professor, aluno, encarregado,
  administrador de plataforma. Permissões por papel lidas da produção (`role_permissions`).
- **Acessos desta auditoria:** Supabase (leitura), GitHub Actions (leitura), código.
  **Sem acesso:** HTTP para `*.portal-siga.com` (a política de rede do ambiente recusa o
  domínio — 403 no proxy), contas de utilizador, dispositivos reais, Cloudflare.

## 2. Verificações executadas

| Verificação                                                            | Resultado                                                                                                                                                      |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsc --noEmit`                                                         | 0 erros                                                                                                                                                        |
| ESLint                                                                 | 0 erros, 47 avisos                                                                                                                                             |
| Vitest                                                                 | 469 ficheiros; **3 099 passam**, 19 ignorados, 0 falhas                                                                                                        |
| Ensaios SQL (PGlite, `tests/sql/*.mjs`)                                | **15 de 15 passam**                                                                                                                                            |
| `npm run build`                                                        | OK em 49 s                                                                                                                                                     |
| Advisor de segurança Supabase                                          | 0 tabelas sem RLS; 17 funções DEFINER executáveis por `authenticated` (auxiliares de política, intencionais); **protecção de senhas vazadas desligada** (F-13) |
| Motor de notas contra cálculo independente                             | 12 casos, 7 divergências (F-06, F-19)                                                                                                                          |
| Réplica RLS com 2 escolas × 8 perfis                                   | isolamento A/B total; falha de âmbito do professor (F-01)                                                                                                      |
| Ecrãs públicos em 360/768/1366 px (Chromium, emulação, servidor local) | 0 transbordo horizontal, 0 erros de consola, campos com rótulo; rota protegida mostra o login no lugar                                                         |

## 3. Ensaio de isolamento (escolas A e B)

Montado num PostgreSQL 16 local e descartável: as **funções** `private.*`/`public.*` copiadas
da produção (`pg_get_functiondef`), as **32 políticas reais** e os grants das 11 tabelas
sensíveis tirados de `supabase/PRODUCTION_SNAPSHOT.json`, e dados 100 % sintéticos (`AUDIT-*`):
2 alunos, 2 faturas, 2 recibos, 2 notas e 2 presenças por escola. Linhas visíveis por perfil
(sessão `aal2`):

| Perfil                        | Alunos A/B | Faturas A/B | Notas A/B | Presenças A/B | Encarregados A/B |
| ----------------------------- | ---------- | ----------- | --------- | ------------- | ---------------- |
| Admin A                       | 2 / 0      | 2 / 0       | 2 / 0     | 2 / 0         | 2 / 0            |
| **Professor A (só turma T1)** | **2** / 0  | 0 / 0       | **2** / 0 | **2** / 0     | **2** / 0        |
| Aluno A                       | 0 / 0      | 0 / 0       | 0 / 0     | 0 / 0         | 0 / 0            |
| Encarregado A                 | 0 / 0      | 0 / 0       | 0 / 0     | 0 / 0         | 0 / 0            |
| Tesouraria A                  | 2 / 0      | 2 / 0       | **2** / 0 | **2** / 0     | 2 / 0            |
| Admin B                       | 0 / 2      | 0 / 2       | 0 / 2     | 0 / 2         | 0 / 2            |
| Sem escola                    | 0 / 0      | 0 / 0       | 0 / 0     | 0 / 0         | 0 / 0            |
| Encarregado A + Admin B       | 0 / 2      | 0 / 2       | 0 / 2     | 0 / 2         | 0 / 2            |

Escritas: Admin A não altera linhas de B (0 linhas), não move um aluno para B, não insere
alunos directamente, e sem 2FA não altera nada; o encarregado não altera faturas.

Limites do ensaio: `current_user_can_manage_assessment_score` foi substituída por `false`
(depende de mais tabelas); as políticas de `storage.objects` e as restantes 178 tabelas não
entraram. O servidor usa a chave de serviço e filtra por `membership.schoolId`: a varredura
heurística de consultas por id sem `school_id` deu 23 candidatos, todos revistos e
precedidos de verificação de âmbito (ex.: `loadJobWithModuleGate`, `otherSchoolAccess`).
Webhook de pagamento: a escola é deduzida da assinatura HMAC da chave de cada escola, o
modo de simulação está desligado em produção e `finance_receipts(school_id, external_id)` é
único — a repetição não duplica.

## 4. Falhas

Ordenadas por prioridade. «Verificado» = executado; «Confirmado no código» = lido no código
da aplicação ou na definição da função em produção, sem execução.

### F-01 — P1 — O professor lê dados de todos os alunos da escola

| Campo           |                                                                                                                                                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Módulo          | Segurança / RLS (`students`, `people`, `enrollments`, `student_guardians`, `siga_assessment_scores`, `siga_attendance_records`)                                                                                                                                                                                           |
| Perfil afectado | Alunos e encarregados (dados de menores); professor como agente                                                                                                                                                                                                                                                           |
| Pré-condições   | Conta de professor activa na escola, com uma única turma                                                                                                                                                                                                                                                                  |
| Passos          | 1. Entrar como professor. 2. Com o token da sessão e a chave publicável, `GET /rest/v1/students?select=*` (idem para as outras tabelas).                                                                                                                                                                                  |
| Esperado        | Só os alunos das turmas que lecciona                                                                                                                                                                                                                                                                                      |
| Observado       | Todos os alunos, encarregados, notas e presenças da escola (réplica: professor de T1 vê o aluno de T2)                                                                                                                                                                                                                    |
| Evidência       | Secção 3; políticas `students_read`, `student_guardians_read`, `siga_assessment_scores_read`, `Members read siga_attendance_records`; o papel `teacher` tem `students.records.read`, `people.records.read`, `students.enrollments.read`, `assessment.grades.read`, `attendance.records.read` (lido em `role_permissions`) |
| Causa           | **Confirmada:** o primeiro ramo das políticas aceita a permissão da escola inteira, e o ramo restrito ao professor (`private.teacher_*`) só é alcançado por quem não a tem. Notas e presenças aceitam qualquer membro; a restritiva «School staff only» inclui o professor.                                               |
| Correcção       | Retirar ao papel `teacher` as permissões de leitura de escola inteira **ou** acrescentar nas políticas `AND NOT private.is_teacher_only(school_id)` ao ramo de permissão, deixando o professor só pelo ramo `teacher_*`. Fazer o mesmo em notas e presenças. Migração idempotente + ensaio PGlite com dois professores.   |
| Aceitação       | Professor de T1 vê 0 linhas de T2 em todas as tabelas acima; o portal do professor continua a funcionar (testes de rota).                                                                                                                                                                                                 |

### F-02 — P1 — Importar notas altera uma pauta homologada ou fechada

| Campo         |                                                                                                                                                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Módulo        | Importação → notas (`src/features/import/importers/notas-importer.ts`)                                                                                                                                                                               |
| Perfil        | Administrador / Secretaria (quem pode importar); afecta alunos                                                                                                                                                                                       |
| Pré-condições | Pauta do período homologada, publicada ou fechada                                                                                                                                                                                                    |
| Passos        | Importar um ficheiro de notas para essa turma/período e gravar                                                                                                                                                                                       |
| Esperado      | Recusa, como no lançamento manual (`assertAssessmentTermNotLocked`)                                                                                                                                                                                  |
| Observado     | **Confirmado no código:** o importador escreve em `grade_scores` com a chave de serviço e não verifica o estado da pauta; `grade_scores` só tem os gatilhos `audit_grade_scores` e `enforce_teacher_grade_score_scope` (este isenta `service_role`). |
| Correcção     | Chamar `assertAssessmentTermNotLocked` por turma/período no `analyzeRow` (linha passa a erro) e no commit; acrescentar a `grade_scores` o gatilho de período fechado que `siga_assessment_scores` já tem.                                            |
| Aceitação     | Importar para uma pauta homologada marca as linhas como erro e nada é gravado; ensaio SQL.                                                                                                                                                           |

### F-03 — P1 — A matrícula do ano anterior fica activa e a renovação só é possível depois de fechar o ano

| Campo         |                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Módulo        | Matrículas / Financeiro                                                                                                                                                                                                                                                                                                                                                                                                      |
| Pré-condições | Aluno matriculado em 2025; escola cria e activa 2026                                                                                                                                                                                                                                                                                                                                                                         |
| Passos        | 1. Criar ano 2026 (fecha 2025). 2. Matricular o aluno numa turma de 2026. 3. Emitir uma fatura ao aluno.                                                                                                                                                                                                                                                                                                                     |
| Esperado      | A matrícula de 2025 fica concluída/transitada; a fatura liga-se ao contrato de 2026                                                                                                                                                                                                                                                                                                                                          |
| Observado     | **Confirmado no código da produção:** `private.enroll_student` só aceita turmas de um ano `active` (há um por escola) e não encerra matrículas anteriores; `createAcademicYear`/`setActiveAcademicYear` só mudam o estado do ano. O aluno fica com duas matrículas `active`. `issueInvoice` escolhe `.eq("status","active").limit(1)` **sem filtro de ano nem ordem** → contrato e preço da classe podem sair do ano errado. |
| Correcção     | (a) Fechar o ano marca as matrículas desse ano como concluídas com o resultado final; (b) permitir matrícula em ano `planned` (pré-matrícula); (c) `issueInvoice` e restantes leituras de «matrícula activa» filtram pelo ano activo.                                                                                                                                                                                        |
| Aceitação     | Depois da transição, cada aluno tem no máximo uma matrícula activa e é do ano activo; fatura emitida liga-se ao contrato desse ano.                                                                                                                                                                                                                                                                                          |

### F-04 — P1 — Propinas: só emissão manual, sem mês de competência e sem anti-duplicado

| Campo     |                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Módulo    | Financeiro (`issueInvoice`, `src/routes/faturas.tsx`)                                                                                                                                                                                                                                                                                                                                                                                              |
| Perfil    | Tesouraria                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Passos    | Emitir a mensalidade de Novembro em Outubro; emitir duas vezes a mesma mensalidade                                                                                                                                                                                                                                                                                                                                                                 |
| Esperado  | Geração mensal por turma/escola; competência = mês da propina; a segunda emissão recusada                                                                                                                                                                                                                                                                                                                                                          |
| Observado | **Confirmado no código:** não existe geração em lote (único `insert` em `finance_invoices` fora das importações é o de `issueInvoice`, um aluno de cada vez); o formulário não envia `issuedOn`, por isso a competência é sempre o mês corrente; não há unicidade em `(contract_id, fee_item_id, competence_month)` nem gatilho (índices únicos lidos na produção: só `invoice_number`). Escolhe o «plano activo» com `limit(1)`, sem ano lectivo. |
| Impacto   | Uma escola de 500 alunos emite ~5 000 faturas à mão por ano; relatórios de dívida por mês e multas de atraso ficam errados.                                                                                                                                                                                                                                                                                                                        |
| Correcção | Acção «Gerar propinas do mês» (por classe/turma, idempotente), campo de competência, índice único parcial `(school_id, contract_id, fee_item_id, competence_month) WHERE status <> 'cancelled'`, plano por ano lectivo.                                                                                                                                                                                                                            |
| Aceitação | Gerar duas vezes o mesmo mês cria N faturas na primeira e 0 na segunda; competência = mês escolhido.                                                                                                                                                                                                                                                                                                                                               |

### F-05 — P1 — Encerrar o ano não verifica nada e não há transição de alunos

| Campo     |                                                                                                                                                                                                                                                                       |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Módulo    | Calendário / Pedagógica (`src/features/calendar/server.ts`)                                                                                                                                                                                                           |
| Observado | **Confirmado no código:** criar ou activar um ano fecha o anterior sem verificar pautas homologadas, resultados finais registados (`final-results.ts`), faturas em aberto ou matrículas pendentes; não existe promoção em massa para a classe seguinte nem renovação. |
| Correcção | Assistente de fecho com lista de pendências bloqueantes; transição por turma usando o resultado oficial (transita → classe seguinte; não transita → mesma classe).                                                                                                    |
| Aceitação | Não é possível fechar um ano com pautas anuais por homologar sem confirmação explícita registada; a transição cria as matrículas do ano novo numa operação.                                                                                                           |

### F-06 — P2 — O «Histórico» impresso decide com notas em falta

| Campo     |                                                                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Módulo    | Ficha do aluno → Histórico (`src/routes/alunos/$studentId.tsx:608`, `assessment-engine.ts`)                                                                                                      |
| Evidência | **Verificado executando o motor real:** 12 disciplinas, só uma com notas (14) → `status = "TRANSITA"`, `overallMfd = 14`; só o 1.º trimestre lançado → `"TRANSITA"`; MT com MAC e sem NPT = MAC. |
| Observado | Sem resultado oficial, o documento imprime «TRANSITA (provisório)» com média 14,0, e cada disciplina «Aprovado» com a nota fixa 10 (ignora a nota mínima configurada).                           |
| Nota      | O caminho oficial (`exam-engine.computeFinalResult`) está certo: marca «incomplete» sem todos os períodos e usa o arredondamento da regra.                                                       |
| Correcção | `evaluateStudentPromotion` devolve `PENDENTE` se alguma disciplina da turma não tem MFD ou faltam períodos; o estado por disciplina usa `activeRule.passing`.                                    |
| Aceitação | Os 3 casos acima devolvem `PENDENTE`; teste unitário.                                                                                                                                            |

### F-07 — P2 — Importar pagamentos contorna as garantias de `register_payment`

| Campo     |                                                                                                                                                                                                                                                                                                                                                                                         |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Módulo    | Importação → pagamentos (`finance-core.ts:registerReceiptDirect`)                                                                                                                                                                                                                                                                                                                       |
| Observado | **Confirmado no código:** recibos gravados com a chave de serviço, sem 2FA (o servidor só o exige para `propinas`), sem `FOR UPDATE` (o próprio comentário o assume) e com o saldo calculado na análise, não no commit. Um pagamento manual em paralelo pode levar a fatura além do total. O mesmo vale para notas (F-02) e dívidas: importação não exige 2FA, o lançamento manual sim. |
| Correcção | Gravar pela RPC `register_payment` com a sessão do utilizador (ou uma variante de importação com o mesmo bloqueio e verificação de saldo); exigir 2FA nos módulos financeiros e de notas.                                                                                                                                                                                               |
| Aceitação | Importação e pagamento manual concorrentes nunca excedem o total; sessão sem 2FA recusada.                                                                                                                                                                                                                                                                                              |

### F-08 — P2 — Tesouraria lê notas e presenças

Réplica (secção 3): Tesouraria A vê `siga_assessment_scores` e `siga_attendance_records`. As
políticas aceitam qualquer membro e a restritiva inclui `treasury`. Correcção: tirar
`treasury/tesouraria/finance` da restritiva destas duas tabelas. Aceitação: 0 linhas.

### F-09 — P2 — Não existe ambiente de testes

A produção é a única base com o esquema SIGA (o outro projecto Supabase está `INACTIVE`) e já
contém dezenas de escolas de teste. Sem staging não é possível executar a jornada integrada,
ensaios de carga (> 150 alunos) nem testes de concorrência sem tocar em escolas reais.
Correcção: projecto ou branch Supabase de staging com o esquema de produção e as 5 apps
publicadas contra ele. É a dependência de todas as verificações dinâmicas em falta.

### F-10 — P2 — Liquidação PayFlow com uma chave única de plataforma

`/api/finance/payflow/settlement` aceita um bearer global (`PAYFLOW_INTEGRATION_API_KEY`,
comparação em tempo constante) e lê `school_id` do corpo. Quem tiver a chave liquida faturas
de qualquer escola; não há assinatura com carimbo temporal nem ligação chave↔escola. O
limitador de pedidos é em memória por isolado (documentado em `src/lib/rate-limit.ts`).
Correcção: HMAC com timestamp (como o gateway) e lista de escolas autorizadas por chave.

### F-11 — P2 — 2FA obrigatório para matricular e cobrar; 3 de 64 contas têm 2FA

`register_student`, `enroll_student`, `register_payment`, `cancel_invoice` e as escritas
directas exigem `aal2`. É correcto, mas na produção só 3 utilizadores têm um factor
verificado. Antes de uma escola arrancar, o administrador, a secretaria e a tesouraria têm de
ter 2FA activo — incluir no assistente de configuração inicial e na checklist de arranque.

### F-12 — P3 — Outras

| ID   | Achado                                                                                                                                                                                                                                                             | Evidência                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| F-13 | Protecção de senhas vazadas (HaveIBeenPwned) desligada no Supabase Auth                                                                                                                                                                                            | Advisor de segurança                     |
| F-14 | `/api/cron/lesson-reminders` existe mas nenhum agendador o chama                                                                                                                                                                                                   | `.github/workflows/*`                    |
| F-15 | Alunos e encarregados lêem `school_settings` (config académica, preferências, modelos de impressão; sem segredos)                                                                                                                                                  | Réplica + domínios lidos                 |
| F-16 | `createEmailRoute` ignora o erro do `upsert` e devolve `ok`                                                                                                                                                                                                        | `src/features/saas/email-routing.ts:216` |
| F-17 | `public_code` da escola é aleatório de 6 dígitos com índice único; uma colisão faz falhar a criação da escola em vez de tentar outro                                                                                                                               | `provisioning-core.ts:350`               |
| F-18 | Emissão de fatura sem idempotência no servidor; só o botão desactivado protege                                                                                                                                                                                     | `QuickFormModal.tsx`                     |
| F-19 | Arredondamento duplo (MT a 1 casa, depois MFD): MAC 9,9 + NPT 10 três vezes → 10,0 «TRANSITA» com média exacta 9,95. O motor provisório não lê `rounding_method`; a regra correcta para Angola não está documentada no repositório — **sem fundamento confirmado** | Execução do motor                        |
| F-20 | `normalizeScore` devolve `null` (ausente) para 21 ou «12,5» em vez de erro                                                                                                                                                                                         | Execução do motor                        |
| F-21 | 47 avisos de ESLint                                                                                                                                                                                                                                                | `npm run lint`                           |

## 5. Jornada integrada

Não executada: exige criar uma escola, contas e dados, e o único ambiente disponível é a
produção (regra do pedido: não alterar dados reais). O que foi possível verificar em cada passo:

| #   | Passo                               | Estado                    | O que foi verificado                                                                        |
| --- | ----------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Criar escola e administrador        | Bloqueado                 | `provisioning-core.ts` com limpeza em falha; unicidade de slug, NIF e `public_code` na base |
| 2   | Ano lectivo e períodos              | Parcial (código)          | Um ano activo por escola (índice); sem datas inventadas                                     |
| 3   | Classes, disciplinas, salas, turmas | Bloqueado                 | —                                                                                           |
| 4   | Professores e funcionários          | Bloqueado                 | Âmbito do professor falha (F-01)                                                            |
| 5   | Aluno manual                        | Parcial (código + função) | `register_student` atómico, 2FA, nº por sequência                                           |
| 6   | Importar lote (> 150)               | Bloqueado                 | Staging, idempotência por chave, paginação 200, RPC com sessão para alunos                  |
| 7   | Matricular e distribuir             | Parcial                   | `enroll_student` com `FOR UPDATE` e capacidade; candidatura com reserva e compensação       |
| 8   | Obrigações financeiras              | **Falha**                 | Não geradas pela matrícula; emissão manual (F-04)                                           |
| 9   | Pagamento e recibo                  | Parcial (função)          | `register_payment` correcto; numeração única                                                |
| 10  | Horários e eventos                  | Não testado               | —                                                                                           |
| 11  | Presenças e avaliações              | Não testado               | Gatilho de período fechado em `siga_assessment_scores` (ensaio SQL passa)                   |
| 12  | Notas e médias                      | Parcial (execução)        | F-06, F-19, F-20                                                                            |
| 13  | Boletim e pauta                     | Não testado               | —                                                                                           |
| 14  | Portais                             | Parcial                   | Aluno/encarregado sem leitura directa de dados sensíveis (só pelo servidor)                 |
| 15  | Fecho do período                    | Parcial                   | Bloqueio manual correcto; importação contorna (F-02)                                        |
| 16  | Transição de ano                    | **Falha**                 | Inexistente (F-03, F-05)                                                                    |
| 17  | Isolamento face à escola B          | **Verificado**            | Secção 3                                                                                    |

## 6. Plano de correcção (ordem de dependência)

1. **Staging** (F-09) — sem ele nada do resto se prova de ponta a ponta.
2. **F-01 e F-08** — uma migração de políticas, ensaio PGlite com dois professores.
3. **F-02 e F-07** — importações pelas mesmas garantias do lançamento manual.
4. **F-03** — matrícula por ano: filtro de ano nas leituras, pré-matrícula, fecho de matrículas.
5. **F-04** — geração de propinas idempotente + índice único.
6. **F-05** — assistente de fecho e transição de ano (depende de 3 e 4).
7. **F-06, F-19, F-20** — motor provisório alinhado com o oficial; decidir e documentar a regra de arredondamento.
8. **F-11** — 2FA no assistente de arranque. Depois, F-10 e os P3.
9. Correr a jornada integrada completa em staging, com duas escolas e > 150 alunos.

## 7. O que não foi verificado

- Nenhum fluxo autenticado na interface (sem contas de teste e sem staging); nenhum ensaio em
  dispositivo real; Safari/Firefox não disponíveis; só Chromium em emulação.
- Páginas de produção: a rede deste ambiente recusa `portal-siga.com`; o ensaio de ecrãs
  correu contra o servidor de desenvolvimento local, sem Supabase.
- Horários, calendário, presenças por QR, boletins, PDF/Excel, arquivos e links de descarga,
  storage, RH e salários, biblioteca, capelania, alumni, comunicações, Google Workspace,
  app desktop e modo offline: **não auditados nesta passagem**.
- Políticas RLS fora das 11 tabelas da réplica, e políticas de `storage.objects`.
- Desempenho e volume: só o tempo de build; nenhuma medição de resposta com dados.
- Backups e restauro; logs e monitorização em produção.
- PayFlow, ADMIN, WEB e DOC só nas fronteiras.
