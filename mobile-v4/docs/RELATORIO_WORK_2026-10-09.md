# SIGA Plus Mobile V4 — continuação no Work, 9/10/2026

## Resultado e limites

Branch: `feat/siga-plus-mobile-v4-isolated`, PR #116. Base auditada: `27bf782313289d669c28cf7e3364ed7aaeaf52fa`.

A integração institucional **ainda não está concluída nem activada**. Este ciclo implementa o transporte HTTP autenticado e validação de pedidos, preservando os ficheiros visuais. Não importou conversas ou dados pessoais, não substituiu integrações por simulações, não executou SQL remoto e não publicou o servidor SIGA em produção.

## Implementado e verificado localmente

### Continuação com o Sga existente

O utilizador escolheu o projecto Supabase **Sga**, referência `xodgfmxiaunpamctfeea`, que é a base de produção do SIGA. O projecto está `ACTIVE_HEALTHY`. Confirmaram-se tabelas, colunas e restrições de estado com consultas exclusivamente de leitura ao catálogo; não foram consultadas fichas pessoais nem executadas escritas ou migrações.

Foi acrescentada a resolução server-side de âmbito académico, após a autorização de escola/papel:

- Identidade ligada por `people.user_id` ou `teachers.user_id`, com rejeição de vínculos contraditórios, fichas apagadas/inactivas e identidades ambíguas. Não se associa aluno por coincidência de ID nem por e-mail não verificado.
- Professor: disciplinas activas atribuídas ao docente, nas turmas e anos activos, e respectivas matrículas activas. Direcção de turma, por si só, não concede escrita nas disciplinas de outro docente.
- Aluno: matrícula própria activa e disciplinas dessa turma. Não inclui matrículas pendentes, de terceiros ou de anos encerrados, nem acumula acesso de outros papéis.
- Todas as consultas levam filtro explícito de escola. Respostas truncadas pelo limite de linhas do Supabase são recusadas; não são apresentadas como âmbito completo.
- O endpoint de workspace executa esta resolução, mas continua a devolver `503 WORKSPACE_NOT_READY` até existir a projecção completa. Não foram substituídos dados académicos por listas simuladas.

Este avanço acrescenta **26 testes** de âmbito e ordenação da autorização, com um adaptador controlado de base de dados. O conjunto Mobile backend + protecção de migração RLS tem **61 testes aprovados**; estes testes não equivalem a percursos autenticados reais. TypeScript, ESLint dos ficheiros alterados, Prettier e build raiz passaram. A identidade visual Mobile permanece intacta e o preview publicado mantém a API desligada.

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

## Validação

- Mobile V4: **67 testes aprovados**, TypeScript, ESLint, Prettier, build Vite e verificações PWA aprovados.
- Raiz: **3.286 testes aprovados e 19 ignorados**, 496 ficheiros aprovados e 3 ignorados. Os testes ignorados não contam como integração real concluída.
- Segurança/HTTP Mobile e MFA existentes: **43 testes aprovados**; incluem 28 novos testes Mobile de validação, transporte, âmbito e autorização. Usam dependências controladas, não contas reais.
- Raiz: TypeScript aprovado com heap de 6 GiB; ESLint sem erros (47 avisos existentes); build aprovado; `siga:check` aprovado.
- SQL: **18 ensaios existentes** executados numa base PGlite local, incluindo aplicação idempotente e isolamento. Não foram criadas migrações Mobile neste ciclo; não se afirma que estes ensaios validem um backend Mobile transaccional inexistente.
- Smoke HTTP contra o servidor compilado em runtime Cloudflare local: sessão, workspace, comandos e logout sem Bearer devolveram **401 JSON**, sem carregar dados. Não foi ensaiada sessão real válida neste ambiente.
- Smoke de navegador no preview público: Chromium a **390, 768 e 1280 px**, navegação Meu dia, selector sem sessão, menu, Segurança e recarregamento hash; sem erros JavaScript nem overflow horizontal. Este ensaio é anónimo; não valida professor/aluno autenticados.
- CSS, componentes visuais, ícones e páginas Mobile não foram alterados. Não foi feita QA visual autenticada em Android/iOS, Safari ou dispositivo real.

## Commit, CI e publicação

- Código: [`9113462d375e25b6d2080cf4c413167d0dc6bd47`](https://github.com/fernandotunas6-bot/onsoft-replica-dev/commit/9113462d375e25b6d2080cf4c413167d0dc6bd47).
- [Workflow Mobile aprovado](https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/runs/37972841739) e [CI raiz aprovado](https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/runs/37972841534) para esse commit.
- [Preview isolado](https://04e9ebe7.siga-plus-mobile-v4.pages.dev), deployment `04e9ebe7-ac37-43ff-8380-3fe0037ba095`, ambiente `preview`, `success` em 9/10/2026 às 18:23:40 UTC.
- Smoke externo: home/manifesto/SW 200, sete assets iguais ao build, sessão/logout 503 JSON com API desligada. O URL canónico Pages e o portal principal permaneceram nas versões anteriores.

## Bloqueios e sequência necessária

1. A integração terá como base o **Sga existente**, conforme escolha do utilizador. Não foi criado outro projecto nem uma branch Supabase paga. Não há base Supabase de testes ou credenciais de staging neste ambiente; os ensaios de migração têm de continuar isolados. A escolha do Sga não activa o modo institucional nem autoriza migrações de produção.
2. Preparar base isolada com esquema actual, duas escolas de teste e contas autorizadas de professor/aluno; não copiar dados pessoais de produção.
3. Rever o contrato académico: `ClassGroup` Mobile agrega turma e disciplina; `Grade` ainda usa valor único e revisão, enquanto o SIGA tem componentes, diários, estados de pauta e períodos. Definir IDs canónicos e estados de publicação antes da projecção e escrita.
4. Implementar leitura por atribuição docente e matrícula própria, com notas apenas publicadas para alunos, horário/aulas, presenças docente e discente distintas, tarefas/entregas, calendário e documentos.
5. Reutilizar as guardas do chat para participantes e escola, com notificações, assinaturas temporárias de ficheiros e anexos autorizados. Não há chat institucional real neste ciclo.
6. Persistir comandos numa transacção com comparação de revisão, chave por escola/utilizador/operação, resposta de replay e auditoria atómica. Testar concorrência, rollback, replay e alteração de payload com a mesma chave.
7. Validar sessão, MFA, logout e percursos completos com contas reais de staging. Publicar o backend exclusivamente em staging e só depois ligar o fornecedor de sessão no Mobile. O Pages público actual continua a ser apenas preview; a demonstração existente é identificada como tal e não constitui uma integração.
8. Rever e aprovar a promoção institucional separadamente. Produção e migrações de produção continuam fora deste ciclo.
