# SIGA Plus — CRUD Premium & Engenharia · PR isolada

Data: 28/10/2026 · Branch: `feat/crud-premium-engineering-20261028` · Base inicial: `main@8ea7851bb5c7ed72536ebbd6abc5e9675a4d8fbf`

## Objectivo

Melhorar progressivamente os CRUDs, a arquitectura, a integridade e a experiência do SIGA Plus, **sem remover funcionalidades**. Esta PR é deliberadamente mantida em **draft** até existirem provas de validação suficientes para as áreas efectivamente alteradas.

## Inventário inicial verificado no repositório

- A aplicação principal usa React 19, TypeScript, TanStack Start/Router/Query, Tailwind 4, Radix, Zod e Supabase.
- Há primitivas de `ListFilterBar`, `ListPaginationBar`, `DataTableShell`, `EmptyState`, `MobileErrorState` e `MobileEmptyState`; devem ser reutilizadas antes de criar novas.
- `src/routes/pessoas/index.tsx`: listagens de pessoas e professores, filtros e exportações. As consultas tinham chaves que não incluíam utilizador/escola; a consulta de pessoas admitia dados anteriores durante uma pesquisa diferente.
- A listagem de professores, tanto desktop como mobile, apresentava uma lista vazia em caso de falha de carregamento.
- A lista desktop de pessoas mostrava a mensagem técnica de erro directamente ao utilizador; a lista de pessoas no ecrã e a exportação não usavam os mesmos filtros de estado.
- `searchPeople` no servidor continua a limitar um conjunto de resultados **antes** de aplicar pesquisa e filtro por papel em memória; isto pode ocultar resultados válidos fora da primeira janela. É uma pendência de **backend/paginação**, não se deve declarar resolvida com paginação apenas no browser.
- `listTeachers` também aplica pesquisa em memória depois de limitar a consulta; requer evolução de contrato e ensaio em staging.
- O contrato `docs/agents/DATABASE_RULES.md` proíbe aplicar SQL experimental na base real. A migração só deve ser considerada depois da análise do retrato de produção, testes e validação dos contratos.
- Há várias PRs paralelas abertas, incluindo trabalho em contextos escolares, dashboard, login de alunos e horário. Evitar alterações cruzadas sem reconciliação.

## Implementação: lote 1 — interface segura e coerente (nesta PR)

- Novo `CrudListFeedbackRow` reutilizável para cinco estados: `empty`, `filtered`, `error`, `forbidden` e `conflict`.
- Estados de erro nunca se apresentam como vazio e oferecem retentativa quando recuperáveis.
- Mensagens técnicas não se tornam visíveis directamente na tabela.
- O estado vazio e a ausência de resultados por filtros são distintos.
- Pessoas: consultas com chave separada por utilizador/escola; impedida a reutilização visual de resultados de pesquisa anterior ao trocar filtros; consultas bloqueadas até resolver contexto autenticado.
- Pessoas: lista no ecrã utiliza os mesmos registos filtrados por estado da exportação.
- Professores: erros de carregamento recuperáveis no desktop e telemóvel.
- Exportações da lista de pessoas são desactivadas enquanto a consulta está em erro ou carregamento.

**Limites:** esta primeira alteração não altera regras de matrícula, SQL, autorizações no servidor, pagamentos ou dados de produção.

## Plano de implementação incremental (mesma branch isolada, commits pequenos)

| Lote | Área | Critério antes de avançar |
|---|---|---|
| 1 | Estados partilhados, Pessoas | Testes React, tipo, lint, build |
| 2 | Listagens do backend e paginação | Contrato paginado, pesquisa/filtros antes do limite; autorização escola/papel; testes de volume |
| 3 | Formulários e edição | Erros por campo, conservação de dados, conflito optimista e confirmação |
| 4 | Matrículas e turmas | Idempotência, último lugar concorrente, transferências, histórico e permissões |
| 5 | Avaliação, horários e financeiro | Versões, operações auditáveis, autorização por atribuição e ausência de duplicação |
| 6 | Documentos, comunicação e outros módulos | Ficheiros, exportações e filas por tenant, retries, acessibilidade |
| 7 | Qualidade transversal e release | E2E autenticado em staging, regressão visual, recuperação, riscos e gate de produção |

Nenhuma etapa é considerada implementada apenas por constar nesta tabela.

## Matriz de testes e evidências exigidas

| Caso | Mecanismo | Estado inicial |
|---|---|---|
| Vazio real / filtro sem resultados | Teste de componente React | Implementado no lote 1 |
| Falha de rede ≠ lista vazia | Teste de componente + QA manual autenticado | Teste de componente no lote 1 |
| Permissão negada e conflito visual | Teste React | Implementado no lote 1 |
| Chaves de cache isoladas por conta/escola | Inspecção + E2E com duas sessões | Código adaptado; E2E pendente |
| Pesquisa após os primeiros 150 resultados | Teste backend/DB com volume | Pendente do lote 2 |
| Paginação, ordenação e contagem no servidor | Integração com DB | Pendente do lote 2 |
| Duplo clique em matrícula | Integração transaccional + E2E | Pendente do lote 4 |
| Última vaga disputada simultaneamente | Concorrência PostgreSQL | Pendente do lote 4 |
| Professor sem vínculo tenta gravar nota | Teste de autorização directo à API | Pendente do lote 5 |
| Pesquisa, ficheiros e exportações entre escolas | Teste de isolamento de tenant | Pendente dos lotes 2–6 |
| Sem ligação durante retentativa | E2E autenticado/staging | Pendente |
| Teclado, foco, leitor de ecrã e mobile | Playwright/Axe, QA visual | Pendente dos lotes correspondentes |
| Migração segura + recuperação | PostgreSQL/PGlite e ensaio restaurado | Sem migrações no lote 1 |

## Execução e aprovação

Antes de retirar o estado **draft** da PR:

1. Confirmar a base actual, resolver alterações paralelas e conflitos, sem rebase/force-push destrutivo.
2. Correr `bun install --frozen-lockfile`, `bun run check`, `bun run lint`, `bun run build`, `bun run typecheck` e `bun run test` no runner de CI.
3. Correr os testes SQL existentes em PGlite, sem executar SQL contra a produção.
4. Quando houver alterações de backend com escrita, acrescentar testes de autorização, concorrência e idempotência em staging antes de integrar.
5. Fazer smoke autenticado e teste de telemóvel com contas fictícias em escolas distintas, nunca com dados reais.
6. Registrar o resultado de cada job da **última SHA** na PR. Não declarar aprovação enquanto houver falhas ou jobs pendentes.
7. Não fazer merge/deploy automático apenas por esta documentação. Exigir revisão explícita.

## Guardrails de arquitectura

Manter o ecossistema WEB / ADMIN / SIGA / PAYFLOW / DOC, o contrato dos tipos `src/integrations/supabase/types.sga.ts`, as RPCs transaccionais existentes e a protecção de dados multi-tenant. Não introduzir outro backend nem substituir serviços de produção. Migrações apenas aditivas, com verificação contra `supabase/PRODUCTION_SNAPSHOT.json`. O cliente não é autoridade sobre papel, escola, turma ou matrícula. O novo estado visual nunca é prova de autorização.

## Indicadores finais

- Cada CRUD activo tem estado, fonte, permissão, evento de auditoria e prova de regressão mapeados.
- Erros de rede, autorização e conflito são claramente distintos de ausência de dados.
- Pesquisas/filtros e exportações operam sobre o mesmo conjunto autorizado, com indicação correcta do universo total.
- Histórico académico e financeiro preservado.
- Resultados mensuráveis de desempenho, experiência mobile e acessibilidade.
- PR revista, CI final aprovado, testes de staging documentados antes do deploy.


## Lote 2 — paginação real no servidor (em validação nesta PR)

- `src/features/people/directory-server.ts`: contratos novos `searchPeoplePage` e `listTeachersPage`, sem remover `searchPeople` e `listTeachers` usados por outros consumidores.
- Pesquisa com `page` / `pageSize` validados por Zod e `total` exacto; intervalo de registos e ordenação estável.
- Navegação comum: PostgreSQL realiza `count: exact` e `range`, com `school_id` obtido de sessão/vínculo, nunca de parâmetro cliente.
- Pesquisa por texto ou vínculo: varrimento paginado no servidor, aplica todos os critérios **antes** da contagem e da página. Não oculta pessoas fora dos primeiros 50 ou docentes fora dos primeiros 100.
- Limite explícito de 50 000 registos candidatos por pesquisa avançada; ao ultrapassá-lo, devolve erro recuperável sem apresentar totais truncados. É uma protecção provisória: optimização por índices/RPC filtrada no banco requer perfil de dados real e ensaio de staging.
- Perfis de alunos/encarregados mantêm o escopo de leitura autorizado; todas as consultas incluem escola. A pesquisa docente aplica ocultação de contactos **antes** de procurar pelo e-mail.
- Os resultados de pessoas por estado passam a ser filtrados no backend, de maneira consistente com a contagem.
- A página Pessoas utiliza dois paginadores distintos e as respectivas query keys incluem utilizador, escola, filtros e página, sem reutilização de dados de contexto anterior.
- CSV, PDF e documento oficial dos registos de Pessoas identificam a **página actual**. Exportações completas de todos os resultados filtrados exigem endpoint seguro separado; nunca apresentar a página como relatório integral.

### Testes específicos do lote 2

- `tests/people/directory-pagination.test.ts`: cinco casos de varrimento, mais de 300 linhas, correspondências após os 200 primeiros, total exacto, página fora do intervalo, falha de rede e truncagem bloqueada.
- `tests/people/schemas.test.ts`: contrato paginado, limites de página e estado, compatibilidade do esquema legado.
- `tests/routes/pessoas.test.tsx`: mocks adaptados aos dois endpoints novos.
- A execução de CI da última SHA é a única fonte de aprovação. Validar Vitest, lint, TypeScript, build, SQLite, PGlite e auditoria de dependências.
- **Ainda pendente**: E2E autenticado com duas escolas e desempenho medido em grande volume; manter PR em draft, sem merge/deploy.

### Limitações assumidas

O varrimento avançado é correcto e limitado, mas não é ainda o desenho final de pesquisa optimizada para dezenas de milhares de matrículas e pessoas. Uma próxima iteração deverá avaliar selectividade, índices de pesquisa, estratégia de filtro por vínculos e execução no PostgreSQL, mantendo autorização e histórico. Nenhum SQL foi aplicado em produção.


## Lote 3 — formulários de edição rápida (em validação)

### Código implementado nesta iteração

- `QuickFormModal` aceita `validate(values)` por campo; mostra problemas ao lado do campo correcto com `aria-invalid`, `aria-describedby`, foco no primeiro campo inválido e sem chamar o servidor.
- A submissão pelo Enter usa o mesmo fluxo do botão Guardar, com guarda síncrona contra duplo clique. Impede o fecho da janela durante a mutação.
- Em falha do servidor, mantém os valores escritos e apresenta aviso no formulário; o utilizador pode corrigir e tentar novamente. Em êxito, fecha e limpa o estado temporário.
- Campo BI/NIF expõe estado acessível de validação ao componente universal.
- Os formulários **Novo professor**, **Editar professor** e **Editar Pessoa** usam `validateTeacherQuickForm` e `validatePersonQuickEdit`, reutilizando os schemas Zod existentes para nome, e-mail e BI, mais a validação local angolana de telefone.
- **Edição de Pessoa**: opcional `expectedUpdatedAt` em `updatePersonInputSchema`; o servidor aplica `UPDATE ... WHERE school_id AND id AND updated_at` e rejeita actualização concorrente antes de sincronizar documentos associados. Mantém compatibilidade de contrato com chamadas legadas que não enviam versão.

### Testes

- `tests/people/quick-form-validation.test.ts`: nome curto, e-mail inválido, telefone inválido, NIF inválido, opcionais vazios e valores válidos.
- `tests/ui/quick-form-validation.test.tsx`: validação acessível antes de gravar, preservação de valores em erro e prevenção de submissões duplicadas/fecho durante gravação.
- `tests/people/schemas.test.ts`: versão de edição opcional e entradas inválidas.
- **Gate**: nenhum teste pode ser marcado aprovado sem CI executado na SHA final.

### Próximas melhorias que permanecem pendentes

- CAS/versões e atomicidade de `updateTeacher` (actualiza duas tabelas): exige transacção/RPC segura e testes em staging, não tentar corrigir só com UI.
- Revalidar no servidor todos os campos e permissões; a validação da interface não é controlo de segurança.
- Conflitos multi-tenant e sessões MFA autenticadas testados directamente em staging.
- E2E real com teclado/mobile/assistivas e reconciliação com trabalhos paralelos antes de fazer merge.
- Nenhuma migração SQL, credencial ou dado de produção é modificado nesta iteração.


## Lote 4 — matrículas e turmas, primeira entrega

### Melhorias implementadas

- `placeStudentInClass`, núcleo partilhado: reenviar a colocação de um aluno já activo na mesma turma e no mesmo ano devolve o identificador existente, assinala `unchanged: true` e **não faz UPDATE nem cria histórico repetido**.
- A política MFA/AAL2 é definida pelo contrato de autorização efectivo da `main` e não é modificada por este lote. O endpoint mantém os controlos de cargo, módulo e escola; não usar a idempotência como dispensa de autorização.
- Matrícula `pending` na mesma turma continua a poder passar a `active`, sem criar segunda matrícula. Mudança para turma diferente continua a usar a matrícula existente para preservar avaliações e histórico.
- Mudanças e confirmações aplicam compare-and-swap sobre `id`, `school_id`, `status` e `class_group_id`, com `UPDATE ... RETURNING id`: se outra sessão alterou a linha, devolve conflito recuperável em vez de sobrepor silenciosamente a mudança.
- A camada `enrollStudentInClass` devolve o novo indicador `unchanged` sem retirar campos existentes e evita sincronização de utilização do tenant quando não houve alteração.
- A contagem de vagas e a concorrência entre matrículas novas **continuam a depender das funções e gatilhos transaccionais da base**. Não substituir as garantias SQL por validação React.

### Testes novos em `tests/students/enrollment-core.test.ts`

- Repetição sequencial na mesma turma sem novas escritas, sem novo número e sem histórico duplicado.
- Repetição da operação: mantém as verificações de autorização já exigidas pela versão de backend testada.
- Confirmação de uma matrícula pendente no mesmo ano/turma sem criar outra.
- Mudança concorrente da turma após a leitura: operação recusada com conflito e sem sobrepor a outra sessão.

### Matrículas existentes em lote — segunda entrega

- Novo helper `src/features/students/enrollment-batch.ts`: alterações de turma e confirmação de pendentes utilizam `UPDATE` condicionado por matrícula, aluno, escola, estado e turma de origem; uma alteração concorrente é devolvida como conflito individual.
- `batchAssignClass` já não marca a matrícula pendente como sucesso antes da confirmação e contabiliza transferências apenas depois da escrita efectiva.
- A repetição de matrícula activa na turma de destino não provoca escrita. O lote preserva os êxitos individuais mesmo quando há conflito numa linha diferente, assinalando `success: false` e `failed`.
- A capacidade concorrente continua garantida pelo gatilho da base, e não pelo pré-cálculo de vagas. Sem RPC transaccional para o lote inteiro, o resultado **pode ser parcial**, pelo que a interface tem de mostrar êxitos e falhas distintamente.
- Testes em `tests/students/enrollment-batch.test.ts`: seis casos de repetição, confirmação, transferência, escola alheia, mudança concorrente e êxito parcial.

### Lista de Alunos — reacção a êxitos parciais

- `src/routes/alunos/index.tsx` já não mostra sucesso total nem desmarca todos os alunos quando uma atribuição em lote falha parcialmente.
- A selecção retém apenas os alunos com falha; o formulário continua aberto com a turma escolhida, permitindo corrigir e repetir. Os alunos com sucesso não são reenviados por engano.
- O resumo identifica os alunos pelo nome quando disponível, inclui a mensagem individual do servidor e limita a pré-visualização a quatro ocorrências, sem perder nenhum ID elegível para retentativa.
- Após uma mutação, invalidam-se as consultas de alunos, contexto pedagógico e painel inicial para actualizar turma, lotação e indicadores.
- `tests/students/batch-feedback.test.ts` fixa cinco casos: êxito, parcial, falha total, truncagem de detalhes e selecção apenas dos alunos do pedido.

### Pendente para concluir o lote 4

- Ensaio PostgreSQL simultâneo de último lugar da turma e sessões concorrentes, com contas fictícias e duas escolas em staging, respeitando o RLS e a AAL2.
- Fluxos em lote: mudança de múltiplos alunos deve ser transaccional ou comunicar claramente êxitos parciais; não prometer atomicidade onde o servidor actualmente processa várias operações.
- Regressão visual da matrícula, transferência, lote, fecho de ano, preservação de notas/pautas e caminhos de recuperação.
- A PR permanece em `draft` até validação. Nenhum SQL ou dado de produção foi modificado.


## Lote 5 — primeira entrega: integridade da gravação de notas

### Implementação

- `src/features/academic/assessment-score-write.ts` valida todos os valores antes da escrita: IDs de matrícula únicos, valor finito, mínimo zero, máximo 20 e cotação específica da avaliação.
- Reenvio da mesma nota não provoca `UPDATE`, não altera `updated_at` e não duplica auditoria. A comparação diferencia ausência de nota de zero.
- A consulta às notas existentes recebe `school_id` explícito, além do item e da lista de matrículas.
- Edição de nota usa compare-and-swap em `id`, escola, item, matrícula e valor anterior (inclusive `NULL`); se outra sessão alterou a nota entretanto, a operação recusa substituir o valor.
- As alterações que realmente foram gravadas geram os eventos `grades.assessment_score_changed`. Em caso de lote parcialmente aplicado, os `UPDATE` confirmados são auditados antes de comunicar a falha. Erros e conflitos continuam a emitir telemetria operacional.
- O retorno `{ saved: number }` continua compatível com os consumidores anteriores. O bloqueio de pautas homologadas e de trimestres fechados permanece obrigatório antes das notas.
- A solução usa os gatilhos e contratos Supabase existentes, sem migrações nem escritas em produção.

### Regressões adicionadas

`tests/academic/assessment-score-write.test.ts` cobre duplicação de aluno, escala inválida, aluno fora da turma, reenvio inalterado, nota modificada com auditoria, concorrência e conversão de nota ausente para zero. Mantêm-se `tests/academic/assessment-score-audit.test.ts` e `tests/academic/assessment-lock.test.ts`.

### Limites e gates

- A gravação continua a ser um lote de operações, não uma única transacção PostgreSQL. O teste de carga/conflito com professores reais e RPC transaccional deve ser feito em staging antes de qualquer fusão.
- Ainda falta validar autorização directa por atribuição de disciplina, contas de escolas distintas, pauta anual homologada, e visual das mensagens de conflito em mobile.
- A aprovação exige o CI da **SHA final** e ensaio autenticado em staging; esta secção documenta código, não declara produção pronta.


### Horários — identificação rigorosa de conflitos de sala

- `src/features/academic/schedule/utils/conflicts.ts` dá prioridade ao identificador físico `room_id`: duas aulas com IDs de sala diferentes não colidem apenas por terem o mesmo rótulo.
- Se ambas as aulas não possuem `room_id` (dados legados), só são equiparadas por designação inequívoca `Sala ...`. Uma etiqueta genérica como `Laboratório` pode identificar o tipo de aula, não a sala, e não é prova suficiente de colisão.
- Quando uma aula tem `room_id` e a outra tem apenas texto, não se infere igualdade sem relação comprovada. Conservam-se os bloqueios de turma e professor e a separação entre versões de horário.
- `src/features/academic/schedule/utils/conflicts.test.ts` verifica ID físico prevalecer sobre texto, deteção da mesma sala apesar de rótulos divergentes, compatibilidade com `Sala 12` legado, etiquetas genéricas e combinação ID/rótulo.
- **Risco restante**: para instituições com salas históricas sem identificador, migrar cuidadosamente para `room_id` e validar sobreposições na base. A UI não substitui os bloqueios transaccionais nem decide se um texto é uma sala física.


### Financeiro — dívidas após estorno e precisão em cêntimos

- `src/features/finance/payment-states.ts`: o rótulo `paid` não se sobrepõe ao montante efectivamente recebido. Uma fatura de valor positivo cujo estado textual ainda seja `paid`, mas com recibos válidos insuficientes após estorno, passa a `partial` ou `overdue` segundo a data de vencimento.
- O estado de liquidação usa comparação em cêntimos, consistente com `invoiceStatusFromPaid`; continua a respeitar faturas anuladas e permite fatura sem valor liquidada quando o estado válido o indica.
- `src/features/finance/student-finance-summary.ts` agrega valores faturados, recebidos, por pagar e vencidos em cêntimos e calcula o saldo aberto com o motor existente `invoiceOpenAmount`. Elimina resíduos de ponto flutuante no perfil financeiro do aluno.
- Testes em `tests/finance/payment-states.test.ts` e `tests/finance/student-finance-summary.test.ts`: estorno de fatura anteriormente paga, valores parciais, vencimento e múltiplas faturas com cêntimos.
- Estes cálculos são de leitura/apresentação e não registam pagamentos nem executam estornos. A fonte de verdade mantém-se no PostgreSQL e nas RPCs financeiras; ensaios de reconciliação real permanecem obrigatórios em staging.


### Lote 5 — recibos financeiros completos e dívida verdadeira

- `src/features/finance/invoice-receipts.ts` carrega os recibos por **lotes de IDs** e por páginas com ordenação estável, porque o PostgREST pode devolver apenas 1.000 linhas, mesmo quando a consulta pede mais. Em erro ou limite excedido, nunca devolve uma soma parcial como se fosse definitiva.
- `listInvoices` filtra recibos, contratos, rubricas e matrículas com `school_id` obtido da sessão autorizada. Os erros dessas relações interrompem a consulta em vez de apresentar nomes/saldos omitidos.
- Somatório de recibos em cêntimos, ignorando estados `reversed`; nunca converter um estorno em cobrança efectiva.
- `tests/finance/invoice-receipts.test.ts` cobre mais de 1.200 recibos, paginação, divisão por ID, ausência de faturas, falhas intermédias, recusa de truncagem e arredondamento após estornos.
- Ainda pendente: prova de integração com dados de volume no PostgreSQL de staging e ensaio com contabilista, tesoureiro e contas de duas escolas. Nenhuma migração nem dado de produção modificado.


### Financeiro — faturas antigas na ficha do aluno

- `listInvoices` continua a apresentar as faturas recentes e permite agora aplicar `includeOpen: true` também a pedidos filtrados por `studentId`. As páginas adicionais incluem o filtro `school_id` **e** os IDs de contratos desse aluno, obtidos e validados pelo servidor, nunca fornecidos pela UI.
- A ficha `src/routes/alunos/$studentId.tsx` pede `includeOpen` para que faturas em aberto antigas não desapareçam por ultrapassarem o limite das 1.000 recentes.
- O cliente mantém a separação entre dívida, faturas pagas e recebimentos confirmados: não há criação de recibos nem alterações financeiras nesta entrega.
- Regressão de contrato em `tests/finance/list-invoices-open.test.ts` e `tests/finance/list-invoices-student.test.ts`, incluindo filtro de contratos nas páginas adicionais.
- **Pendente**: teste E2E com aluno fictício com mais de 1.000 documentos, reversões/estornos, latência e sessão em escola diferente. A pesquisa paginada de faturas em aberto continua a usar os estados `open` e `partially_paid` da base; é necessário ensaio de consistência das facturas com estado desactualizado depois de estorno.

## Lote 6 — documentos oficiais: relações por escola e verificação pública

- `createDocumentRequest` continua a exigir sessão e permissões de escrita da Secretaria/Administração, mas agora usa `requireDocumentRequestRelations` antes de inserir: aluno existente na escola da sessão, modelo da mesma escola e estado `active`. IDs fornecidos pelo browser não atribuem escola.
- Rejeição explícita de aluno de outro tenant, modelo de outro tenant e modelo inactivo; indisponibilidade da leitura é erro recuperável, nunca uma falsa validação. Não são criadas solicitações quando a validação falha.
- Na listagem, a consulta dos nomes das turmas também é filtrada por `school_id`; falhas ao consultar matrículas ou turmas são devolvidas como erros, não como ausência silenciosa de vínculo.
- Testes de contrato verificam que as validações ocorrem antes do `INSERT` e que os nomes das turmas não atravessam limites de escola.
- Verificação pública por código: falha ao consultar `audit_logs` ou os dados de escola não deve ser confundida com código inválido. A consulta pública continua limitada por IP e não retorna nomes completos dos titulares.
- Novo teste `tests/documents/request-relations.test.ts`: mesmo tenant, aluno externo, modelo externo, modelo inactivo e falha de leitura. `tests/documents/verification.test.ts` mantém o contrato de emissão/validação.
- Não foram aplicadas migrações nem escritas em produção. Para bloquear também uma mudança de escola entre a validação e o INSERT, é necessário rever os constraints/FKs compostos tenant+aluno em PostgreSQL numa staging independente.
- E2E autenticado com duas escolas e contas fictícias, emissão real de documento e simulação de falha de rede permanecem pendentes antes de remover `draft`.


## Lote 7 — ensaio transversal autenticado e seguro em staging

### Implementação da matriz de isolamento de Pessoas

- `tests/e2e/crud-tenant-readonly.spec.ts`: fluxo Playwright sem escritas que usa **dois contextos de navegador independentes**, cada um com sessão de uma escola de staging.
- Para cada escola, pesquisa uma pessoa fictícia que deve aparecer nessa escola e pesquisa a pessoa fictícia da outra escola, que deve devolver **ausência de resultados**, não erro de servidor. A página `Registo central` tem de abrir: uma sessão expirada ou falta de autorização não são aprovação.
- Sem screenshots, gravação de vídeo ou traces (podem conter dados pessoais). O teste só corre com opt-in explícito `SIGA_CRUD_E2E=1`; o CI habitual não tenta abrir sessões escolares.
- `tests/e2e/helpers/crud-staging-safety.ts`: recusa projectos de produção, URL Supabase divergente, frontend não local, duas sessões iguais, marcadores sobrepostos e parâmetros em falta. A verificação compara também URLs Supabase do frontend quando fornecidas.
- `tests/qa/crud-staging-safety.test.ts` valida em Vitest os contratos de segurança do ensaio; estes testes de configuração **não necessitam de credenciais**.

### Como executar localmente com dados fictícios de staging

Preparar previamente no **projecto Supabase de staging independente**, nunca em produção:

1. Uma conta autorizada da Escola A e outra da Escola B, com sessões Playwright separadas (ficheiros `storageState` temporários e privados, fora do repositório).
2. Uma pessoa fictícia com nome único na Escola A e outra na Escola B, sem nomes parcialmente coincidentes.
3. Aplicação SIGA servida localmente em `http://127.0.0.1:3006`, ligada ao **mesmo** projecto de staging (confirmar as variáveis da aplicação e do servidor).

No ambiente de execução, sem inserir segredos no Git nem em mensagens de log:

```bash
export SIGA_CRUD_E2E=1
export VITE_SIGA_URL=http://127.0.0.1:3006
export SIGA_CRUD_E2E_PROJECT_REF=<REF_DO_STAGING>
export SUPABASE_URL=https://<REF_DO_STAGING>.supabase.co
export VITE_SUPABASE_URL="$SUPABASE_URL"
export SIGA_CRUD_E2E_TENANT_A_STATE=/caminho/seguro/escola-a.json
export SIGA_CRUD_E2E_TENANT_B_STATE=/caminho/seguro/escola-b.json
export SIGA_CRUD_E2E_TENANT_A_MARKER="Pessoa Fictícia QA Escola A"
export SIGA_CRUD_E2E_TENANT_B_MARKER="Pessoa Fictícia QA Escola B"
bunx playwright test tests/e2e/crud-tenant-readonly.spec.ts
```

Os placeholders `<REF_DO_STAGING>` devem ser substituídos pelo identificador real. Os ficheiros `storageState` nunca devem ser versionados ou anexados. Não utilizar contas de alunos, escolas ou documentos reais. Se o staging não estiver preparado, registar o ensaio como **não executado**, nunca como aprovação.

### Gates de entrega

- CI da última SHA (lint, tipos, Vitest, SQL/SQLite, dependências) aprovado.
- Playwright autenticado A/B executado efectivamente em staging e relatório de resultado confirmado.
- Revisão de segurança e permissões, contratos com PRs paralelas, UX mobile e recuperação de falhas.
- PR mantém-se `draft` e sem deploy enquanto o E2E autenticado não for realizado.


### Reforço de segurança do ensaio E2E de duas escolas

- Os ficheiros Playwright `storageState` devem ter caminhos absolutos `.json` fora do repositório (não colocar tokens de autenticação em `.auth/` versionável). Recusa também caminhos diferentes que apontem para o mesmo ficheiro.
- Os nomes fictícios de controlo não podem coincidir ou estar contidos um no outro depois de remover acentos e diferenças de maiúsculas/minúsculas; caso contrário, uma pesquisa ambígua poderia produzir uma falsa avaliação de isolamento.
- A suite utiliza contextos independentes e **simultâneos** das Escolas A e B, para ensaiar uma troca de pesquisa com ambas as sessões activas.
- Cada pedido do browser dirigido a `*.supabase.co` é conferido com a origem de staging declarada. Pedidos para outro projecto, incluindo produção, são bloqueados e fazem o teste falhar sem publicar identificadores de pedido nem tokens.
- Também verifica que a aplicação não redirecciona para uma origem fora do servidor local.
- `tests/qa/crud-staging-safety.test.ts` exerce essas regras sem necessitar de sessões reais. O smoke Playwright continua **não executado** até existirem credenciais fictícias e projecto de staging autorizado.


## Lote 6 — entregas de trabalhos: anexo fiável e protecção contra duplo toque

- `src/features/academic/components/TaskSubmissions.tsx`, formulário `MyTaskSubmission`: os dados do anexo e da resposta são recolhidos **no evento de envio** e entregues como argumento à mutação. Isto evita uma closure desactualizada de `useMutation`, que podia enviar só o `taskId` mesmo quando o aluno já via o nome do PDF no formulário.
- O leitor de ficheiros recebeu contador de geração: se o aluno escolher dois anexos rapidamente, só a última leitura pode actualizar o formulário. Ao tentar substituir por um ficheiro inválido, o anexo anterior é descartado em vez de ser reenviado por acidente.
- Uma guarda síncrona `submitInFlight` bloqueia duplo toque, independente da actualização posterior do estado React Query. Em erro ou êxito, a guarda é libertada para permitir nova tentativa.
- `tests/academic/task-submissions-ui.test.tsx`: PDF enviado com conteúdo; substituição pelo último ficheiro; substituição inválida não reutiliza o anterior; duplo toque gera apenas um pedido. O validador do servidor continua a exigir texto ou anexo.
- **Diagnóstico**: no CI antigo, a suite académica reportou 696/697 testes aprovados; a falha era o PDF presente no ecrã mas ausente do pedido. A suite académica voltou a passar após corrigir a mutação. A aprovação global depende do CI da **SHA final**.
- **Pendente**: E2E autenticado em staging com aluno/encarregado, foto de caderno em rede lenta, reenvio, falhas de ligação e autorização real; não aplicar dados ou credenciais de produção.

## Continuação verificada — 29/10/2026

A PR #378 foi integrada na main. As secções anteriores conservam o histórico dos
lotes e não substituem a evidência actual. A continuação independente em
`fix/crud-shared-forms-20261029` corrige senhas aparadas, IDs de formulários,
campos editáveis durante gravação, obrigatoriedade do BI, falhas de vínculos
interpretadas como ausência e retoma/contexto das suspensões em lote.
[Matriz, testes e limites](../agents/HANDOFF_CRUD_CONTINUATION_2026-10-29.md).
A atomicidade da edição de professor e a homologação autenticada permanecem
pendentes. As notas transaccionais estão separadas na PR #404.
