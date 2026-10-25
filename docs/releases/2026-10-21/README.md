# Consolidação do ecossistema para produção

Pedido: organizar o trabalho de todos os agentes, incluindo Claude, para uma publicação conjunta. A organização parte da `main` em `40a23d924ddf54c22e02fd8d7d24a836a6ab2a06` e preserva os commits e branches originais.

Este ramo contém a ferramenta, o inventário e a ordem de trabalho. **Ainda não é um candidato de produção com todas as funcionalidades integradas.** Os PRs de origem continuam abertos e os conflitos ainda precisam de resolução e validação funcional.

## Estado capturado

- [Inventário legível](inventory.md): branches, hashes, PRs, CI, conflitos e dependências.
- [Manifesto completo](inventory.json): todos os cabeçalhos capturados, commits pendentes/autores, ficheiros alterados, conflitos, sobreposições e worktrees.
- Ferramenta: [release-inventory.mjs](../../../scripts/siga/release-inventory.mjs).

Na captura: 72 branches remotas, oito com prefixo `claude/`; 34 PRs abertos, 16 em rascunho. Quinze cabeçalhos já são ancestrais da base; 57 não são. Destes, três não têm patches novos de commits não-merge, mas as resoluções de merge continuam a exigir revisão. Quarenta e uma branches têm conflitos textuais contra a base fixa; 23 cabeçalhos fora do histórico não têm PR aberto.

O número de branches fora do histórico **não equivale a funcionalidades novas**: squash, refactorizações e resoluções de merge exigem comparação de conteúdo. A sobreposição de ficheiros também não prova duplicação. O inventário calcula estes sinais separadamente e não modifica o código dos agentes.

O clone inicial só buscava `main` e tinha histórico raso. Foram obtidos todos os cabeçalhos e o histórico completo antes de comparar ancestralidade. A ferramenta recusa clones rasos para evitar conclusões falsas.

## Trabalho Claude incluído no levantamento

| Branch                                                | Trabalho identificado                                        | Encaminhamento                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `claude/aurora-web`                                   | Aurora / experiência WEB                                     | Cabeçalho já incluído na `main`; preservar a implementação actual.                                  |
| `claude/bold-goldberg-gwahyv` · #87                   | Bolsas, espera por turma e turnos por cadeira                | Rever contratos académicos e migrações por efeito; há quatro conflitos.                             |
| `claude/ecstatic-shannon-wek2yt` · #210               | Cobrança configurável, períodos e configuração da escola     | Dezoito conflitos; comparar com a cobrança e onboarding já existentes antes de resolver.            |
| `claude/flutter-visual-analysis-deploy-qn49ie` · #136 | Cliente Flutter e estudo YFT                                 | Setenta e seis conflitos; integrar em conjunto com as variantes YFT, não como outra versão isolada. |
| `claude/elastic-clarke-bc46ad`                        | Inscrição MFA/TOTP e elevação AAL2                           | Dois conflitos; preservar os mecanismos de autenticação e segurança actuais.                        |
| `claude/payflow-importer-tests`                       | Testes e correcção de importadores de pessoas                | Quatro conflitos; o conteúdo é de importação, apesar do nome da branch.                             |
| `claude/projeto-desenvolvimento-1a68je`               | Regulamentos do ensino superior e configuração institucional | Dezassete conflitos; reconciliar regras, precedências e contratos de base antes da interface.       |
| `claude/sharp-volta-npr0aj`                           | Carregamento dos gráficos, pautas e centro de avaliação      | Quatro conflitos; verificar o que as optimizações recentes já cobrem.                               |

Os hashes completos e os commits de cada ramo estão no manifesto. Alterações sem equivalência exacta de patch continuam a ser candidatas à revisão, não uma indicação automática de código em falta.

## Ordem de integração

| Lote                                     | Fontes a reconciliar                                                                    | Critério de fecho                                                                                                                                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Contratos e segurança                 | #216, #208, #129, #139, #144, #135 e respectivos contratos partilhados                  | Confirmar o estado real das migrações, tipos gerados, isolamento escolar, MFA e regressões de escrita. #216 corrige o motor escolar actual sem importar o motor concorrente.                         |
| 2. Websites escolares                    | #200, #205, #206, #213 e implementação já presente na `main`                            | Manter o contrato actual de CMS/blog em `school_settings`; identificar contributos únicos das variantes. Não fundir os modelos concorrentes inteiros por serem do mesmo tema.                        |
| 3. SaaS / WEB / ADMIN / PayFlow          | #210, #126, branches Claude de importação e restantes alterações comerciais/financeiras | Uma definição de cobrança por escola, revisões e auditoria preservadas, testes de períodos, isenção, atraso e integração.                                                                            |
| 4. Operação académica                    | #87, #121, #118, #148, #211, #128, regulamentos do ensino superior                      | Resolver as versões paralelas de matrícula/numeração, alinhar pessoas/importadores, regras de avaliação e dados existentes.                                                                          |
| 5. Mobile / YFT / interface              | #136, #151 → #152 → #153, #154, #212, #131, #132, #133, #116 → #119 e #35               | Escolher a implementação coerente por ficheiro; preservar melhorias exclusivas e testar Flutter/backend e navegação. #212 funde com a base sem conflito textual, mas partilha 96 ficheiros com #136. |
| 6. Serviços e entregáveis especializados | #108, #130, desktop, branches restantes sem PR e documentação #209                      | Rever cada origem sem PR; relacionar o artefacto com o seu destino e configuração. Corrigir conclusões históricas desactualizadas antes de transportar documentação.                                 |

Cada unidade integrada deve registar branch/hash de origem, commit resultante, conflitos resolvidos e verificações executadas. Uma alteração já equivalente recebe essa classificação e a referência da implementação actual; o original permanece preservado. Usar merges normais ou novos commits de reconciliação, sem reescrever histórico publicado.

Os lotes organizam a revisão, não autorizam tratar um PR com CI verde como compatível com os restantes. Antes da fusão seguinte, repetir os testes relevantes sobre o candidato acumulado. Não há exclusão automática por antiguidade, nome do agente, rascunho ou ausência de PR.

## Destinos da publicação

| Componente                 | Origem                                     | Entrega                                                                                                                                                                             |
| -------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SIGA e websites por escola | Raiz + `painel/escolas` preparado no build | Worker principal; website no hostname da escola e portal/API existentes.                                                                                                            |
| WEB                        | `painel/web`                               | Cloudflare Pages `siga-web`.                                                                                                                                                        |
| ADMIN                      | `painel/admin`                             | Exportação estática no Pages `siga-admin`; a autorização efectiva continua nas APIs.                                                                                                |
| DOC                        | `painel/docs`                              | Cloudflare Pages `siga-docs`.                                                                                                                                                       |
| PayFlow                    | `painel/payflow`                           | Worker e D1; migrações compatíveis antes do código novo.                                                                                                                            |
| Website estático escolar   | `painel/escolas`                           | Workflow específico do website; a prévia Sites tem fonte/publicação independente e acesso privado preservado.                                                                       |
| Flutter / Mobile V4 / YFT  | Pastas e workflows próprios                | Compilação e publicação próprias; não são publicados pelo `deploy-all.mjs` dos cinco componentes principais. Definir o artefacto e destino exactos para cada variante reconciliada. |
| Desktop                    | `desktop` e workflow de releases           | Artefactos por plataforma e assinaturas do actualizador, além do backend publicado.                                                                                                 |

Na verificação do GitHub, a release desktop mais recente é `v1.2.2`. Os nomes dos seus artefactos não incluem `.sig`; a publicação web não resolve essa entrega. O empacotamento e a assinatura do desktop devem constar do fecho dessa componente.

## Bloqueio externo confirmado

O run [39595004147](https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/runs/39595004147) aprovou a verificação antes de publicar e falhou no job Cloudflare. Nos runs anteriores, o primeiro upload (`siga-docs`) foi recusado com `Authentication error 10000` e `Invalid access token 9109`.

A ligação Cloudflare desta sessão também devolve erro interno ao consultar a identidade. A ligação GitHub actual recebe HTTP 403 ao listar os segredos/variáveis do ambiente `production`; não permite gerir esse segredo. A existência de configuração não comprova que o token seja válido.

Actualizar `CLOUDFLARE_API_TOKEN` directamente em **GitHub → Settings → Environments → production**, com acesso à conta e permissões necessárias aos componentes publicados. Manter o valor fora do chat, dos commits e dos relatórios. O pedido de actualização foi apresentado ao utilizador enquanto a organização prossegue. Até a autenticação ser restabelecida, a publicação no domínio escolar permanece pendente.

## Fecho do candidato e deploy

1. Actualizar o inventário depois de buscar os cabeçalhos remotos e rever os PRs criados/alterados após a captura. Confirmar também as alterações locais dos agentes disponíveis no workspace.
2. Concluir os lotes no ramo de integração, preservando a origem de cada contribuição. Guardar o SHA final do candidato; código novo reabre a validação correspondente.
3. Confirmar os contratos de produção por efeito, o catálogo e os tipos. Ensaiar SQL compatível e preparar os backups necessários antes de qualquer escrita autorizada. Esta preparação não aplica SQL.
4. Sobre o mesmo candidato: lint, tipos, testes, ensaios SQL locais, builds dos cinco componentes e validações próprias de mobile/desktop/YFT. Confirmar fluxos entre aplicações e isolamento entre escolas num ambiente de aceitação.
5. Registar os IDs das versões publicadas de cada Worker/Pages e os artefactos necessários à recuperação. A falha de uma etapa da publicação não torna a publicação inteira atómica; o registo tem de identificar os componentes efectivamente alterados.
6. Integrar o candidato validado na `main` e executar o workflow de produção nessa versão. Confirmar que cada componente ficou no commit previsto, incluindo os destinos que têm workflow próprio.
7. Validar o conteúdo servido, login/MFA, API e fluxos de escola/curso/candidatura/blog. HTTP 200 isolado não basta: o hostname escolar ainda pode responder com o dashboard antigo. Confirmar também o health do PayFlow e a aplicação prevista no domínio escolar.

O `check-release-contracts.mjs` verifica o snapshot do repositório; não substitui a leitura do catálogo real nem o ensaio de aceitação. Credenciais, chaves de assinatura e dados privados ficam nos mecanismos próprios de cada ambiente.

## Repetir o levantamento

Primeiro obter o histórico completo quando a cópia for rasa e buscar **todas** as branches, pois este clone estava configurado apenas para `main`:

```sh
git rev-parse --is-shallow-repository
# Se o resultado for true:
git fetch --unshallow origin '+refs/heads/*:refs/remotes/origin/*'
# Nas capturas seguintes:
git fetch origin '+refs/heads/*:refs/remotes/origin/*'
```

Guardar a lista actual de PRs em JSON, com `number`, `title`, `url`, `isDraft`, `headRefName`, `headRefOid` e `baseRefName`. Para incluir CI no mesmo relatório, acrescentar `ciState` e `checks` obtidos do último commit do PR; a captura desta pasta foi feita pela API GraphQL com paginação verificada. Uma captura sem CI é apresentada como sem resultado, sem assumir aprovação.

```sh
gh pr list --repo fernandotunas6-bot/onsoft-replica-dev --state open --limit 100 \
  --json number,title,url,isDraft,headRefName,headRefOid,baseRefName > /tmp/siga-open-prs.json
node scripts/siga/release-inventory.mjs --base origin/main \
  --prs /tmp/siga-open-prs.json --json /tmp/siga-inventory.json --markdown /tmp/siga-inventory.md
npx vitest run tests/release/inventory.test.ts
```

Se houver 100 PRs no resultado, paginar antes de considerar a captura completa. Os testes da ferramenta usam repositórios Git temporários: comprovam conflitos, preservação de trabalho local, dependências e cabeçalhos não capturados, além da recusa de histórico raso.
