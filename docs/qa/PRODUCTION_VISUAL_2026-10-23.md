# Publicação do refinamento visual e navegação contextual

## Identificação

- PR: [#252](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/252), integrado por merge, preservando os históricos.
- Commit de aplicação: `0078e4df6cec8b8c86fca6694969e12a52252345`.
- Base combinada: `74dc6979e232b32407c57a36cbbc515487e3a4cb`.
- Aplicação: [portal-siga.com](https://portal-siga.com).
- [Deploy de produção](https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/runs/39959924100).
- [CI da main integrada](https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/runs/39959924106).

## Conteúdo da versão

Sidebar encostada à margem esquerda, com curvas côncavas junto ao conteúdo; áreas gerais e contextuais organizadas por perfil; relatórios na respectiva área; pesquisa sem exigência de acentos; menus recolhidos em portal com fecho ao navegar; curso/turma revelados por link directo e disciplina activa destacada. Cabeçalhos de Financeiro, Calendário e Comunicações com uma acção principal e opções ocasionais agrupadas, mantendo rascunhos. Textos e identidade da escola mais legíveis.

O PR altera componentes de interface, organização de destinos e testes/documentação. Não contém alterações SQL nem de workflows. As melhorias de carregamento do login e as verificações de acessibilidade já existentes na base mantêm-se.

## Evidência antes da publicação

O CI do head `ce2a8dfd803813cdc241f4a6c7336d394af7faa4` executou o merge de ensaio `cc693766` com a base acima: TypeScript global, lint e build passaram; 4142 testes aprovados, 19 ignorados (603 ficheiros aprovados e três ignorados). O workflow de produção repete contratos de release, tipos, lint e testes no próprio commit integrado.

[Comparações visuais e ensaios representativos](../visual/2026-10-23/spec-compliance/README.md).

## Resultado de publicação

Publicado e confirmado na Cloudflare a **23/10/2026, 14:23:53 (Africa/Luanda)**.

- Worker SIGA: `fernandotunas6-bot-onsoft-replica-dev`.
- Versão activa: `6f4b71c3-c159-4e1f-8d0a-41db37f0fc77`, com **100% do tráfego**.
- Deployment Cloudflare: `4930dc42-12ea-4d61-9c92-35592e82dc40`.
- O ID activo consultado pela API Cloudflare coincide com o último `Current Version ID` do log de publicação do commit `0078e4df`.
- Versão anterior registada antes da publicação: `41147190-63ed-49e9-b928-61957705e0ff`.
- Workflow de produção aprovado: contratos de release, TypeScript, lint, 4142 testes aprovados/19 ignorados, publicação dos cinco serviços, DNS e disponibilidade.
- CI principal da main aprovado em estilo, acessibilidade, lint, tipos, testes, ensaios SQL, inventário e build. As fases complementares Lighthouse/PWA e smoke E2E ainda estavam em execução no momento deste registo; não são declaradas aprovadas aqui.
- [Auditoria pós-publicação aprovada](https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/runs/39960877434), sem autenticação ou escrita.

| Consulta pública após a publicação                        | Resultado                 |
| --------------------------------------------------------- | ------------------------- |
| SIGA, WEB, página criar escola e DOC                      | HTTP 200                  |
| ADMIN                                                     | HTTP 302                  |
| Saúde PAYFLOW e catálogo público de planos                | HTTP 200                  |
| Sessão, métricas, domínios e subscrições sem autenticação | HTTP 401, acesso recusado |

A auditoria terminou às 14:24, hora de Angola. Os seus seis testes internos de segurança também passaram. Estes resultados confirmam publicação e disponibilidade pública/protecção anónima, sem substituir testes de operação autenticada.

## Limites da validação

Os ensaios visuais usaram componentes reais e fronteiras de conta/rede controladas. A auditoria posterior à publicação só consulta endpoints públicos e verifica a recusa de acesso anónimo. Não comprova fluxos autenticados de pagamentos, notas, permissões e isolamento entre escolas. Permanecem pendentes contas autorizadas por perfil/escola, dispositivos físicos, leitor de ecrã, teclado virtual e auditoria formal de contraste/zoom. A consulta HTTP directa deste ambiente recebeu 403; não é usada como prova de indisponibilidade da aplicação.
