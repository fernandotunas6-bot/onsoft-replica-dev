# SIGA Plus Mobile V4 — continuação no Work, 9/10/2026

## Resultado e limites

Branch: `feat/siga-plus-mobile-v4-isolated`, PR #116. Base auditada: `27bf782313289d669c28cf7e3364ed7aaeaf52fa`.

A integração institucional **ainda não está concluída nem activada**. Os ciclos implementam transporte HTTP autenticado, validação de pedidos, âmbito académico e catálogo canónico de leitura e páginas que o consomem, preservando estilos, ícones e navegação. Não importou conversas ou dados pessoais, não substituiu integrações por simulações, só executou consultas de leitura ao catálogo remoto e não publicou o servidor SIGA em produção.

## Implementado e verificado localmente

### Catálogo académico de leitura

Foi acrescentado `GET /api/mobile-v4/schools/:schoolId/academic?role=professor` (ou papel `aluno`), com Bearer/MFA, autorização exacta por escola/papel e resolução do âmbito antes de consultar dados. Devolve apenas turmas/disciplinas autorizadas, docente atribuído, matrículas, nomes de alunos permitidos, horários e trabalhos publicados, através do esquema real Sga. Não lê contactos privados, notas, documentos ou conversas neste endpoint.

O contrato distingue `classSubjectId`, `classGroupId`, `subjectId`, `academicYearId`, `enrollmentId` e `slotId`. Os slots preservam o dia ISO (1–7), horas, sala institucional e validade da versão publicada. Horários antigos sem `schedule_id` vêm marcados `legacy`; não se inventa data de publicação nem se convertem slots em aulas realizadas. Rascunhos e trabalhos ligados a slots não publicados são excluídos. Campos institucionais nulos continuam nulos. Referências inconsistentes, erros ou resultados truncados são recusados; mudanças de vínculo/atribuição/ano entre resolução e projecção são detectadas nos casos ensaiados.

O `ApiGateway.academicCatalog` já faz a leitura autenticada, com token actualizado por pedido e AbortSignal. O cliente valida estrutura, IDs, escola/papel, âmbito professor/aluno, horários, datas, relações e campos privados inesperados. A interface já consome este catálogo nas páginas de turmas, disciplinas, horários/calendário e trabalhos publicados. A adaptação completa para o workspace depende dos contratos de notas, aulas/presenças e restantes serviços. Workspace e comandos continuam com 503; modo institucional permanece desligado.

Validação do catálogo anterior (`f189b125`):

- Mobile: **87 testes aprovados**, incluindo 20 novos testes de contrato/transporte. TypeScript, lint, formatação, build e PWA aprovados.
- Ensaio PostgreSQL/PGlite isolado: **26 verificações** com a resolução/projecção TypeScript reais e consultas SQL parametrizadas. Inclui duas escolas, professor, matrícula própria, ausência de colegas, horários publicado/legacy/rascunho, tarefas, contrato cliente após JSON, mudanças de identidade/atribuição/ano, referências de outra escola e falhas/truncagem. O fixture tem subconjuntos de colunas/tipos/nullable confirmados por leitura; não reproduz toda a RLS/FKs/triggers e não testa Auth/PostgREST ou concorrência reais.
- Backend HTTP/âmbito/RLS seleccionados: **67 testes aprovados**. Suite raiz completa: **3.320 aprovados e 19 ignorados**, 497 ficheiros aprovados e 3 ignorados. Os ignorados não contam como integração real.
- Servidor compilado em runtime Cloudflare local: sessão, workspace, catálogo, comandos e logout sem Bearer devolveram **401 JSON**, sem acesso a dados. Não foi ensaiada sessão válida real.
- Raiz: TypeScript, lint sem erros (47 avisos existentes), build, Prettier e inventário passaram. O workflow CI fixa Node 24 para os ensaios TypeScript, seguindo a versão usada no Mobile.
- Não há migração nova: este catálogo usa tabelas existentes. Não foram consultados dados pessoais ou executadas escritas no Sga remoto.

### Continuação com o Sga existente

O utilizador escolheu o projecto Supabase **Sga**, referência `xodgfmxiaunpamctfeea`, que é a base de produção do SIGA. O projecto está `ACTIVE_HEALTHY`. Confirmaram-se tabelas, colunas e restrições de estado com consultas exclusivamente de leitura ao catálogo; não foram consultadas fichas pessoais nem executadas escritas ou migrações.

Foi acrescentada a resolução server-side de âmbito académico, após a autorização de escola/papel:

- Identidade ligada por `people.user_id` ou `teachers.user_id`, com rejeição de vínculos contraditórios, fichas apagadas/inactivas e identidades ambíguas. Não se associa aluno por coincidência de ID nem por e-mail não verificado.
- Professor: disciplinas activas atribuídas ao docente, nas turmas e anos activos, e respectivas matrículas activas. Direcção de turma, por si só, não concede escrita nas disciplinas de outro docente.
- Aluno: matrícula própria activa e disciplinas dessa turma. Não inclui matrículas pendentes, de terceiros ou de anos encerrados, nem acumula acesso de outros papéis.
- Todas as consultas levam filtro explícito de escola. Respostas truncadas pelo limite de linhas do Supabase são recusadas; não são apresentadas como âmbito completo.
- O endpoint de workspace executa esta resolução, mas continua a devolver `503 WORKSPACE_NOT_READY` até existir a projecção completa. Não foram substituídos dados académicos por listas simuladas.

Este avanço acrescenta **26 testes** de âmbito e ordenação da autorização, com um adaptador controlado de base de dados. O conjunto Mobile backend + protecção de migração RLS tem **61 testes aprovados**; estes testes não equivalem a percursos autenticados reais. A suite raiz completa aprovou **3.312 testes**, com 19 ignorados (497 ficheiros aprovados e 3 ignorados). TypeScript, ESLint dos ficheiros alterados, Prettier e build raiz passaram. A identidade visual Mobile permanece intacta e o preview publicado mantém a API desligada.

| Área                 | Resultado                                                                                                                                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI                   | Corrigida a formatação que bloqueava o CI raiz; Mobile V4 usa a sua configuração ESLint e workflow próprios. Backend/rotas/testes também desencadeiam o workflow Mobile.                                                                                 |
| Sessão HTTP          | `GET /api/mobile-v4/session`; Bearer validado por `resolveBearerSession`, que usa `auth.getUser` e a verificação MFA existente. Identidade nunca vem do corpo do cliente.                                                                                |
| Vínculos             | Leitura estrita de escolas, vínculos e papéis; erro de consulta não é convertido em lista vazia ou nome genérico. A opção estrita é exclusiva dos novos chamadores Mobile, preservando os restantes.                                                     |
| Autorização          | Vínculo exacto activo na escola pedida, papel académico nessa escola e grants do módulo; papel de uma escola não autoriza outra.                                                                                                                         |
| Workspace HTTP       | `GET /api/mobile-v4/schools/:schoolId/workspace`, com papel `professor` ou `aluno`; valida acesso e resolve o âmbito académico real, depois responde `503 WORKSPACE_NOT_READY`. Projecção académica pendente.                                            |
| Comandos HTTP        | `POST /api/mobile-v4/schools/:schoolId/commands`; exige `aal2`, schema estrito, UUID de idempotência e papel compatível. Após autorização responde `503 COMMANDS_NOT_READY`. Não existe persistência, auditoria ou idempotência transaccional concluída. |
| Logout HTTP          | `POST /api/mobile-v4/logout` com `{}`; chama `auth.admin.signOut(token, 'local')`. Revoga a sessão de renovação actual. JWTs de acesso já emitidos continuam sujeitos à expiração; não há promessa de revogação imediata desses JWTs.                    |
| Transporte cliente   | Recebe fornecedor da sessão Supabase existente por injecção; procura token actualizado por pedido e limpa sessão local no logout. Bootstrap institucional recusa activar sem esse fornecedor.                                                            |
| Repetição de escrita | Cliente conserva o mesmo requestId depois de falha de rede. Isto prepara o protocolo; ainda não garante idempotência no banco.                                                                                                                           |
| HTTP                 | JSON sem cache, sem CORS permissivo, rejeição de origens diferentes, limite de 64 KiB com leitura incremental, erros públicos sem detalhes internos.                                                                                                     |
| Preview Pages        | Shell visual separado; Worker devolve `503 INSTITUTIONAL_API_DISABLED` para `/api/*`, sem encaminhar tokens ou dados para produção.                                                                                                                      |

As permissões de escrita deixaram de ser anunciadas na sessão antes de existirem comandos implementados. A API de workspace não representa ausência de dados reais por listas vazias: informa explicitamente a indisponibilidade.

## Validação do ciclo anterior (`9113462d`)

- Mobile V4: **67 testes aprovados**, TypeScript, ESLint, Prettier, build Vite e verificações PWA aprovados.
- Raiz: **3.286 testes aprovados e 19 ignorados**, 496 ficheiros aprovados e 3 ignorados. Os testes ignorados não contam como integração real concluída.
- Segurança/HTTP Mobile e MFA existentes: **43 testes aprovados**; incluem 28 novos testes Mobile de validação, transporte, âmbito e autorização. Usam dependências controladas, não contas reais.
- Raiz: TypeScript aprovado com heap de 6 GiB; ESLint sem erros (47 avisos existentes); build aprovado; `siga:check` aprovado.
- SQL: **18 ensaios existentes** executados numa base PGlite local, incluindo aplicação idempotente e isolamento. Não foram criadas migrações Mobile neste ciclo; não se afirma que estes ensaios validem um backend Mobile transaccional inexistente.
- Smoke HTTP contra o servidor compilado em runtime Cloudflare local: sessão, workspace, comandos e logout sem Bearer devolveram **401 JSON**, sem carregar dados. Não foi ensaiada sessão real válida neste ambiente.
- Smoke de navegador no preview público: Chromium a **390, 768 e 1280 px**, navegação Meu dia, selector sem sessão, menu, Segurança e recarregamento hash; sem erros JavaScript nem overflow horizontal. Este ensaio é anónimo; não valida professor/aluno autenticados.
- CSS, componentes visuais, ícones e páginas Mobile não foram alterados. Não foi feita QA visual autenticada em Android/iOS, Safari ou dispositivo real.

## Commit, CI e publicação

- Âmbito académico Sga: [`7193118697cd2bec1928aef07d086334ed27ab73`](https://github.com/fernandotunas6-bot/onsoft-replica-dev/commit/7193118697cd2bec1928aef07d086334ed27ab73). [Workflow Mobile aprovado](https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/runs/37975375680); [CI raiz aprovado](https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/runs/37975375786). Os resultados locais deste avanço estão na secção Continuação. Não houve nova publicação Cloudflare deste backend.

- Código: [`9113462d375e25b6d2080cf4c413167d0dc6bd47`](https://github.com/fernandotunas6-bot/onsoft-replica-dev/commit/9113462d375e25b6d2080cf4c413167d0dc6bd47).
- [Workflow Mobile aprovado](https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/runs/37972841739) e [CI raiz aprovado](https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/runs/37972841534) para esse commit.
- [Preview isolado](https://04e9ebe7.siga-plus-mobile-v4.pages.dev), deployment `04e9ebe7-ac37-43ff-8380-3fe0037ba095`, ambiente `preview`, `success` em 9/10/2026 às 18:23:40 UTC.
- Smoke externo: home/manifesto/SW 200, sete assets iguais ao build, sessão/logout 503 JSON com API desligada. O URL canónico Pages e o portal principal permaneceram nas versões anteriores.

## Bloqueios e sequência necessária

1. A integração terá como base o **Sga existente**, conforme escolha do utilizador. Não foi criado outro projecto nem uma branch Supabase paga. Não há base Supabase de testes ou credenciais de staging neste ambiente; os ensaios de migração têm de continuar isolados. A escolha do Sga não activa o modo institucional nem autoriza migrações de produção.
2. Preparar base isolada com esquema actual, duas escolas de teste e contas autorizadas de professor/aluno; não copiar dados pessoais de produção.
3. Rever o contrato académico: `ClassGroup` Mobile agrega turma e disciplina; `Grade` ainda usa valor único e revisão, enquanto o SIGA tem componentes, diários, estados de pauta e períodos. Os IDs canónicos e estados de publicação de horários/trabalhos já estão definidos no catálogo; a projecção e escrita de notas continuam pendentes.
4. Turmas, disciplinas, matrículas, horários e trabalhos publicados já estão ligados à interface. Concluir notas apenas publicadas para alunos, aulas realizadas, presenças docente e discente distintas, entregas, eventos de calendário e documentos.
5. Reutilizar as guardas do chat para participantes e escola, com notificações, assinaturas temporárias de ficheiros e anexos autorizados. Não há chat institucional real neste ciclo.
6. Persistir comandos numa transacção com comparação de revisão, chave por escola/utilizador/operação, resposta de replay e auditoria atómica. Testar concorrência, rollback, replay e alteração de payload com a mesma chave.
7. Validar sessão, MFA, logout e percursos completos com contas reais de staging. Publicar o backend exclusivamente em staging e só depois ligar o fornecedor de sessão no Mobile. O Pages público actual continua a ser apenas preview; a demonstração existente é identificada como tal e não constitui uma integração.
8. Rever e aprovar a promoção institucional separadamente. Produção e migrações de produção continuam fora deste ciclo.

## Interface ligada ao catálogo institucional

O Mobile passa a pedir o catálogo académico quando a sessão é institucional; a demonstração continua a usar o workspace de teste explicitamente identificado. Não são fabricadas listas vazias para módulos ainda não integrados.

- Professor: consulta turmas e disciplinas atribuídas, expande os alunos matriculados, pesquisa e filtra disciplinas; abre o horário semanal e os trabalhos publicados.
- Aluno: consulta as suas disciplinas, professor atribuído, horário semanal e trabalhos publicados. A interface não apresenta a lista de colegas.
- Horário/calendário: filtro ISO por dia da semana, sala e validade quando existentes; distingue horários publicados de horários anteriores sem publicação associada. Não representa estes períodos como aulas realizadas ou presenças.
- Perfil: contagens do catálogo, com turmas únicas para o professor. Meu dia abre o horário semanal. Actualização manual volta a consultar o catálogo.
- Notas, presenças/faltas, planos, avisos, chat e documentos mostram o estado de integração pendente; não disponibilizam escritas fictícias nem afirmam ausência de registos.
- Mudança de escola/papel, logout e rejeição de autenticação limpam o catálogo; respostas tardias de outro contexto são descartadas. Pesquisa, filtros, contexto e componentes mantêm os estilos e ícones existentes; CSS sem alteração.

Validação local: **90 testes Mobile aprovados**, incluindo três novos percursos de interface com adaptador controlado (professor, aluno e resposta tardia após mudança de escola). TypeScript, ESLint, Prettier, build e verificações PWA aprovados. Estes ensaios não usam contas reais nem constituem validação autenticada de produção. Backend não alterado neste ciclo; os 3.320 testes raiz e 26 verificações SQL são resultados do commit anterior, não novas execuções.

CI do catálogo `f189b125`: [Mobile aprovado](https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/runs/37978681862) e [raiz aprovado](https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/runs/37978681803). Preview anterior: https://ff5dafaa.siga-plus-mobile-v4.pages.dev, ambiente preview. A verificação externa interrompida desse ciclo não é apresentada como concluída. O endereço canónico Pages continua no deployment `17570c06-7e08-44d9-a05d-1bfc04011dfe`, confirmado neste ciclo.

A ligação Supabase existente continua a exigir fornecedor de sessão injectado; não foi activado o modo institucional público. O backend completo, persistência transaccional, MFA com contas reais, chat, notificações, ficheiros e migrações/QA isoladas continuam pendentes. Não houve migração nem escrita na base Sga de produção.

## Publicação e verificação da interface (`3962cee8`)

Commit: [`3962cee8256070aeabc1b9987f614e9adc3548da`](https://github.com/fernandotunas6-bot/onsoft-replica-dev/commit/3962cee8256070aeabc1b9987f614e9adc3548da). [Workflow Mobile aprovado](https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/runs/37984605514) e [CI raiz aprovado](https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/runs/37984605589), incluindo ensaios SQL, inventário, build e auditoria de dependências.

Preview: https://f72a4477.siga-plus-mobile-v4.pages.dev, deployment `f72a4477-11ba-437d-a96f-440903f4d395`, ambiente `preview`, publicação confirmada como `success`. Dez verificações HTTP externas passaram: sete assets idênticos ao build e sessão/logout/catálogo a devolver 503 JSON, sem cache, com API institucional desligada. Chromium anónimo a 390/768/1280 px validou navegação, selector sem sessão, menu, Segurança e reload hash, sem erros JavaScript ou overflow horizontal. Não valida percursos autenticados reais. O deployment canónico permanece `17570c06-7e08-44d9-a05d-1bfc04011dfe`.

Correcção posterior: a mensagem de rejeição de acesso deixou de desaparecer quando a escola é limpa após 401/403. Novo teste de interface valida 403, limpeza do contexto e ausência de escrita. **91 testes Mobile locais aprovados**, TypeScript, ESLint, build e PWA aprovados. Esta correcção posterior ainda não integra o preview `3962cee8`; o seu CI deverá ser verificado separadamente.
