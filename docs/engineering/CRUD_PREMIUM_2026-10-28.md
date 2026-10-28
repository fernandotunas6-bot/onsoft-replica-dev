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

### Pendente para concluir o lote 4

- Ensaio PostgreSQL simultâneo de último lugar da turma e sessões concorrentes, com contas fictícias e duas escolas em staging, respeitando o RLS e a AAL2.
- Fluxos em lote: mudança de múltiplos alunos deve ser transaccional ou comunicar claramente êxitos parciais; não prometer atomicidade onde o servidor actualmente processa várias operações.
- Regressão visual da matrícula, transferência, lote, fecho de ano, preservação de notas/pautas e caminhos de recuperação.
- A PR permanece em `draft` até validação. Nenhum SQL ou dado de produção foi modificado.
