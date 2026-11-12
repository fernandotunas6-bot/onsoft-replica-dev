# Trabalho feito com o ChatGPT (Codex) — inventário e estado

Data: 2026-10-20. Base de comparação: `origin/main` em `7d8ce0ec`.
Actualizado às 07:10 de 20/10: o Codex continuou a trabalhar depois de isto ser
escrito — há uma PR nova (#188) e um ramo empurrado sem PR, ambos de hoje.

> **Terceira actualização, 19:30 de 20/10.** Entre as 18:05 e as 18:17 fundiram
> sete PRs (#186, #188, #189, #191, #194, #196, #197) e a base passou de
> `7d8ce0ec` para `a9cd5a61`. Isso resolve os pontos 1 e 2 do roteiro e
> **invalida as verificações de fusão feitas às 06:17 e 06:31** — a #108 deixou
> de fundir limpo. O estado revisto está em
> [«O que mudou ao fim do dia»](#o-que-mudou-ao-fim-do-dia), no fim deste
> documento; as secções acima ficam como foram escritas, para se poder ver o que
> caducou e com que rapidez.

> **Quarta actualização, 19:36 de 20/10.** A base passou a `7cc34b15` (#197) e
> há três correcções ao retrato das 19:30: a #108 **não** está verde (o lint
> falha por 11 erros de Prettier num commit nosso), o Codex **passou a deixar
> rodapé** (`Co-Authored-By: Codex <codex@openai.com>`, primeiro caso na #196) e
> não resta nenhum ramo do Codex sem PR. Ver
> [«Quarta actualização»](#quarta-actualização-1936-de-2010) no fim.

> **Quinta actualização, 19:50 de 20/10.** Base em `12b98882`. Corrige duas
> afirmações da quarta — o carimbo das horas (era 19:36, e os «18:05» do retrato
> das 19:30 eram UTC) e a autoria dos erros de lint (8 dos 11 nossos, 3 do
> próprio ramo da #108, de 08/10) — e registra que **este inventário fundiu**
> às 19:40, com #107, #113, #117 e #198. Ver
> [«Quinta actualização»](#quinta-actualização-1950-de-2010).

## Como foi identificado

O Codex comete com o teu nome de utilizador do git e **não deixa rodapé de
agente** (`Co-Authored-By:`), ao contrário do Claude (1 161 commits com rodapé)
e do Cursor (13). As mensagens saem em **inglês**, em formato convencional
(`fix(auth): …`). Três fontes cruzadas:

1. `~/.codex/sessions/**` — 49 sessões registadas, de 2026-05-21 a 2026-10-19.
2. `refs/codex/turn-diffs/**` neste repositório — 4 instantâneos de 19/10
   (10:50, 19:44, 20:27, 22:37). São árvores anteriores a cada turno; nenhuma
   contém trabalho que a `main` não tenha.
3. Ramos e PRs sem rodapé de agente, com mensagens em inglês.

Duas destas pistas já não bastam, e convém saber porquê:

- **O inglês deixou de servir.** Os ramos de 19 e 20/10 (#186, #188 e o de
  aprovisionamento) saem em português. O que distingue continua a ser o rodapé
  ausente, o nome do ramo com data (`…-20261020`) e muitos commits curtos, às
  vezes quatro seguidos com a mesma mensagem.
- **As sessões locais também não.** `~/.codex/sessions` continua em 49
  ficheiros, o último escrito a 19/10 às 22:39 — e os três ramos acima são todos
  posteriores. Esse trabalho não passou pelo Codex local desta máquina, por isso
  contar sessões subestima o que ele fez.

## Onde o Codex trabalhou

| Pasta | Sessões | Período | Estado |
|---|---|---|---|
| `/Users/macbook/App_Edu` | 15 | 05–07/2026 | repo git, 962 ficheiros por commitar |
| `/Users/valentinocanguele/Documents/SIGA_EDU` | 5 | 08/2026 | **sem git nenhum** |
| `edu/onsoft-replica-dev` (este) | 19 | 09–10/2026 | ver abaixo |
| `edu/` (pasta-mãe) | 2 | 08/2026 | `git init` acidental, repo vazio |
| Outras (Relatório, 50 Anos, ente-main) | 8 | 06/2026 | fora do SIGA |

## Neste repositório

### Entrou na main

- **PRs #21–#25** (23/09, ramos `codex/*`): hardening de autenticação, bypass de
  produção removido, sign-out global, TOTP no perfil, hidratação SSR,
  idempotência da importação de inscrições, integridade de horários. Todos
  fundidos; ramos já apagados.
- **PR #96** (19/10, `docs/auditoria-critica-2026-10-06`): a sincronização de
  236 commits da `main` com o trabalho local, commit `0cfcc3ce`. Daí saiu a
  campanha de velocidade que fechou nos PRs #179, #184 e #185 — a redução de 25%
  no JavaScript de arranque veio desta sessão.
- **Fundação de RH e folha salarial** (PR #10, fechado): o ficheiro
  `supabase/migrations/20260906124500_hr_payroll_foundation.sql` está na `main`,
  com 18 migrações de folha. O PR foi fechado mas o trabalho entrou por outra via.
- **Alumni** (PR #12, fechado): a `main` tem o módulo completo em
  `src/features/alumni/`. Superado.
- **PayFlow Connect** (PR #5, fechado, 48 commits): a `main` tem `painel/payflow`.
  Superado por reimplementação.

### Pendente com PR aberto

| PR | Ramo | Commits | Diff | Falta na main |
|---|---|---|---|---|
| #188 (draft) | `security/signup-verification-staging-boundary-20261020` | 8 | +252/−16 | guarda do bypass de verificação de e-mail no signup; 6 ficheiros, CI verde às 05:49, já com o novo job de lint e build do WEB. Funde limpo |
| #186 (draft) | `audit/360-institutional-2026-10-19` | 23 | +365/−45 | auditoria de ontem; 8 ficheiros, CI verde às 05:55 de hoje. Funde limpo |
| #108 (draft) + #107 | `feat/bigbluebutton-server-adapter-20261008` | 79+1 | +1 880 | 20 dos 23 ficheiros. **Verificado a 20/10:** funde limpo, mas 2 testes do próprio ramo falham no topo (guarda de configuração antes da guarda de âmbito; `canAccessVirtualClassroom("create")` nega ao professor da turma) e a migração `20261008170000` duplica o corpo da `20261008144147` já aplicada. O #107 (só documentação) entra sozinho |
| #113 | `fix/calendar-ics-serialization-20261009` | 2 | +85/−7 | UTF-8 e escape de newlines no ICS. **Verificado a 20/10:** funde limpo, 7/7 testes passam com a correcção e 7/7 falham sem ela |
| #117 | `fix/react-update-depth-20261009` | 1 | +130/−49 | ciclo React #185 na selecção de períodos. **Verificado a 20/10:** funde limpo, 14/14 testes passam e sem a correcção 3 falham com «Períodos em ciclo de actualização» |
| #35 (draft) | `feat/mobile-clean-shell-20260928` | 8 | +2 464/−148 | 24 ficheiros; 1 010 commits atrás da main. **Verificado a 20/10: 28 ficheiros em conflito** — `AppShell`, `PageHeader`, `components/filters/*`, `ui/{button,dialog,input}`. Não é fusão, é reimplementação |

### Fechado sem fundir, e com parte ainda ausente da main

| PR | Ramo | Commits | Diff | O que ficou fora |
|---|---|---|---|---|
| #30 | `feat/siga-supabase-auth-email-templates-20260925` | 56 | +1 171 | **24 de 24 ficheiros**: `supabase/email-templates/`, as 7 notificações, scripts de publicação e o workflow. A `main` só tem 5 modelos do lado da app |
| #29 | `fix/google-oauth-membership-guard-20260925` | 148 | +2 983/−809 | 34 de 43: `institutional-access.ts`, `verify-oauth-account-server.ts`, `GoogleWorkspaceConnectCard.tsx`, runbooks. O lado da base entrou (`20260928190000_capture_google_workspace_and_hr_salary_tables.sql`) |
| #31 | `feat/institutional-onboarding-requests` | 57 | +961/−149 | 11 de 23: `src/routes/registar.tsx`, `institutional-requests.server.ts` e 2 migrações de pedidos de acesso institucional |
| #27 | `feat/hr-salary-catalog-20260924` | 28 | +2 144/−12 | 21 de 24: 8 migrações de guardas da folha (serialização, pró-rata, frescura dos inputs) |
| #8 | `security/rls-tenant-hardening-20260906` | 30 | +2 284/−9 | 17 de 20: fachadas `*-secure.ts` de notas, avaliação, pessoas e convites |
| #1 | `fix/tenant-security-payment-mfa-2026-09-03` | 43 | +2 175/−434 | 9 de 32: workflows `production-gate`, `lockfile-sync`, middleware do ADMIN |
| #15, #13, #182 | estabilização, portas do CI, Prettier | 4+3+1 | pequeno | #182 confirmado: a correcção de Prettier já está na `main` por outra via, e o ramo `fix/ci-main-responsive-prettier-20261019` ficou obsoleto. #15 e #13 por confirmar |

### Empurrado hoje, sem PR

- **`audit/provisioning-admin-scope-20261020`** — 3 commits, o último às 07:14 de hoje, em
  `src/features/saas/provisioning-core.ts` e `provisioning-verify.ts` (+37/−4):
  passa ao verificador os IDs reais de vínculo e papel, e confirma vínculo, papel
  e grants do administrador criado no aprovisionamento. Sem PR aberto. O ramo foi
  empurrado minutos depois deste inventário e **continua a receber commits**
  (07:07 e 07:14), por isso o trabalho está a decorrer; a PR é o passo que falta
  para ser revisto e fundido, e abri-la agora seria sobre um alvo em movimento.

## Fora deste repositório

- **`/Users/macbook/App_Edu`** — ramo `audit/production-fixes-2026-06`, último
  commit 08/08. A árvore tem 721 ficheiros apagados, 119 alterados e 122 novos,
  por commitar: o `apps/web` original (Vite) foi apagado e por cima ficou o
  template `next-shadcn-dashboard-starter`, datado de 19–23/08. É uma troca a
  meio, nunca commitada. O código antigo continua recuperável no git; o template
  não é trabalho teu.
- **`/Users/valentinocanguele/Documents/SIGA_EDU`** — 613 ficheiros de código
  (`apps/admin`, `apps/escolar`, `apps/web`), 984 MB, de Agosto, construídos em
  cinco sessões de Codex (até 48 mensagens cada). **Resolvido a 20/10:** ficou sob
  git às 06:41 (`b7afb67`, 776 ficheiros, `.git` de 8,5 MB — os 984 MB são quase
  todos `node_modules`) e às 07:5x passou a ter cópia remota em
  `fernandotunas6-bot/siga-edu-agosto`, privado. Antes de publicar, varrimento de
  segredos: só `.env.example` com placeholders e `sk_live_••••` mascarado em dois
  ecrãs de interface.

  O `git push` por HTTPS não passou: 408 em qualquer pacote acima de ~2 MB, com
  os PNG de `apps/*/public` a pesar 9 MB dos 8,5 do repositório. A via que
  funcionou foi empurrar os *blobs* em fatias de ~700 KB em ramos temporários e
  depois criar as 9 árvores que faltavam e o commit pela API do GitHub,
  comparando o sha devolvido com o local a cada passo — as nove árvores e o
  commit saíram **com o mesmo sha**, por isso o histórico remoto é o mesmo
  objecto, não uma cópia. Verificado por clone novo: 776 ficheiros, `git fsck`
  limpo. Os ramos temporários foram apagados; o remoto só tem `main`.
- **`/Users/valentinocanguele/edu/.git`** — repositório vazio, sem commits,
  criado por engano na sessão de 10/08. Só vê as quatro worktrees como ficheiros
  novos. Pode ser apagado.

## Por onde começar

1. `audit/provisioning-admin-scope-20261020` — abrir PR. É de hoje e, sem PR,
   não é revisto nem fundido.
2. #186 e #188 — de ontem e de hoje, CI verde, pequenos. Tirar do rascunho.
3. #117 e #113 — **prontas**. A 20/10 fundem sem conflito na `main` em
   `7d8ce0ec`, os testes passam com a correcção e falham sem ela, e o CI de 09/10
   está verde. A verificação ficou em comentário em cada uma.
4. #107 — só documentação, funde limpo. Entra sem esperar pelo #108.
5. #30 (modelos de email) — é o maior bloco ausente por inteiro da main.
6. #108 (BigBlueButton) — fundível, mas falta fechar dois testes e retirar a
   migração duplicada. Não é um merge directo.
7. #35 — fechar e levantar de novo a partir da `main`, se a decisão de desenho
   ainda interessar. Os conflitos não valem o diff.

O **SIGA_EDU** saiu desta lista: está sob git e com remoto privado em
`fernandotunas6-bot/siga-edu-agosto` desde hoje. Fica a faltar o `App_Edu`, com
962 ficheiros por commitar e uma troca de template a meio.

## O que mudou ao fim do dia

Retrato das 19:30, base `origin/main` em `a9cd5a61`. Sete PRs fundiram entre as
18:05 e as 18:17, por isso metade deste documento envelheceu em doze horas.

### Os itens do roteiro que se fecharam sozinhos

| Item | Como estava às 07:10 | Como está às 19:30 |
|---|---|---|
| 1. `audit/provisioning-admin-scope-20261020` | ramo sem PR, «alvo em movimento» | **fundido** — virou a #189 e entrou às 18:06 |
| 2. #186 e #188 | rascunhos a tirar do rascunho | **fundidos**, às 18:10 e 18:09 |
| — | — | entraram ainda #191, #194, #196 e #197 |

A lição do «abrir PR» confirmou-se pelo avesso: o ramo não precisou de ser
resgatado, precisou de uma PR — e logo que a teve, fundiu no mesmo dia.

### O que a base nova fez às verificações

As verificações de fusão das 06:17 e 06:31 foram repetidas do zero contra
`a9cd5a61`, porque uma fusão limpa contra `7d8ce0ec` não diz nada sobre a base
de agora:

| PR | Às 06:xx | Às 19:30 | Medição repetida |
|---|---|---|---|
| #113 | funde limpo, 7/7 | **confirmada** | 26/26 verdes em `tests/calendar/`; com `ics.ts` reposto da `main`, 7/7 falham |
| #117 | funde limpo, 14/14 | **confirmada** | 344/344 verdes em `tests/academic/`; sem a correcção, 3 falham com «Períodos em ciclo de actualização» |
| #107 | rascunho, só docs | **pronta para revisão** | tirada do rascunho; `MERGEABLE/CLEAN` |
| #108 | «funde limpo» | **passou a conflituosa** | um conflito só, em `.github/workflows/ci.yml`, criado pela #188 ao acrescentar o job `web-quality` |

### A #108, aberta e fechada

Os três problemas que faltavam foram resolvidos e empurrados para o ramo:

1. **O conflito.** A #188 acrescentou o job `web-quality` exactamente onde o
   ramo removia o passo `Build`. O ramo move o `Build` para antes do `tsc`, e
   com razão: o plugin do TanStack Router gera `src/routeTree.gen.ts` durante o
   build, logo uma rota nova falha nos tipos se o `tsc` correr primeiro.
   Resolvido mantendo as duas coisas — o `web-quality` da `main` e o `Build`
   antecipado do ramo — e retirando o `Build` que ficava duplicado no fim.
2. **A migração duplicada.** `20261008170000_bbb_classroom_metadata.sql`
   repetia, corpo por corpo (`md5` igual, só difere um cabeçalho de 4 linhas de
   comentário), a `20261008144147` **já aplicada em produção a 08/10**.
   Removida.
3. **Os dois testes.** Não eram o mesmo defeito:
   - `permits assigned teacher to create scheduled classroom` era um **fixture
     desactualizado**. A política passou a exigir `session.classGroupId` e
     `teacherAssignment.teacherId`, e o fixture não os tinha. O mais grave é que
     os *outros* testes passavam pela razão errada: as negações davam `false`
     por campos indefinidos, não pela regra que diziam cobrir. O fixture passou
     a distinguir o id do registo de professor (`teacher-record-1`) do id de
     utilizador (`teacher-1`) — que é precisamente a verificação de dois lados
     que a política faz.
   - `rejects a class group different from the verified session` era um **defeito
     real, de ordem**: a guarda de configuração (`meetingPasswords`) corria
     antes da guarda de âmbito (`meetingId`), por isso uma turma trocada era
     mascarada por «BigBlueButton meeting passwords not configured». O âmbito
     passou a ser calculado logo depois da autorização e antes de se ler o
     ambiente. Em produção, com as senhas configuradas, não havia buraco — mas o
     erro reportado era o errado, e quatro funções repetiam uma verificação
     parcial (`session.id` só) de algo que o `meetingId` já validava por
     inteiro, `classGroupId` incluído. Ficou uma guarda, com uma mensagem.

   Resultado: **116/116** verdes em `tests/integrations/` e
   `tests/virtual-classroom/`.

Fica em aberto na #108 uma coisa que não é defeito mas é inacabamento: o
`src/routeTree.gen.ts` está versionado e **não** contém `aulas-virtuais`, e a
rota também não está no `navigation-catalog.ts`. O CI não apanha o primeiro
porque o build regenera o ficheiro antes do `tsc` — mas o que está commitado
está velho.

### Ainda por fazer

1. #113 e #117 — verificadas duas vezes contra bases diferentes. Falta fundir.
2. #107 — fora do rascunho, só documentação. Falta fundir.
3. #108 — verde e sem conflito. Falta decidir se a integração BigBlueButton
   entra agora, e fechar a árvore de rotas.
4. #30 (modelos de e-mail) — continua o maior bloco ausente por inteiro.
5. #35 — 28 ficheiros em conflito. Fechar e levantar da `main`.
6. `App_Edu` — 962 ficheiros por commitar. É o que resta fora do controlo de
   versões, agora que o SIGA_EDU saiu da lista.

## Quarta actualização, 19:36 de 20/10

Base `origin/main` em `7cc34b15` — mudou outra vez, meia hora depois do retrato
anterior: a #197 (publicação do website ISPAB por Direct Upload) entrou às
19:17. Três coisas mudaram de facto; o resto do retrato das 19:30 mantém-se.

### A #108 não está verde — e a culpa é nossa

O retrato das 19:30 diz «verde e sem conflito». Metade disso é verdade: o
conflito foi resolvido e os **116/116** testes passam. Mas o portão
«Estilo, acessibilidade e build» falha no ramo, e falha por causa do nosso
próprio commit:

- `6cb9e741` (19:32, *test(bbb): o fixture da política não acompanhou o aperto
  do tipo*) deixou **11 erros de Prettier**, todos em
  `tests/integrations/bigbluebutton-service.test.ts` — o ficheiro do fixture que
  esse commit reescreveu.
- Nenhum outro job falha: dependências, WEB lint/build e `check-bbb-format`
  passam; E2E e Lighthouse ficam `skipping`.

A lição é a de sempre, e desta vez contra nós: **correr os testes não é correr o
portão**. `vitest` verde e `pnpm lint` vermelho são estados compatíveis, e só o
segundo bloqueia a fusão. Os 11 erros são todos de formatação e sairiam com
`--fix`.

### A assinatura do Codex mudou outra vez

A secção «Como foi identificado» diz que o Codex **não deixa rodapé**. Deixou de
ser verdade hoje às 19:10: `a9cd5a61` (a #196, website ISPAB) é o **primeiro e
único** commit da `main` com

```
Co-Authored-By: Codex <codex@openai.com>
```

Medido na `main`: 836 commits com rodapé do Claude, 1 com rodapé do Codex. Ou
seja, as três pistas do inventário caducaram por ordem — primeiro o inglês,
depois as sessões locais, agora a ausência de rodapé. A pista que resta a
funcionar é a mais fraca de todas (nome do ramo com data, commits curtos
repetidos), e a nova é a mais forte — mas só cobre o que o Codex fizer a partir
de hoje.

### Não há ramo do Codex sem PR

O item 1 do roteiro das 07:10 está fechado em definitivo. Dos 9 ramos remotos
sem PR nenhuma, nenhum é do Codex: 7 são do Claude (`ccr-*`, `claude/*`,
`audit/timetable-enrollment-2026-10-10`), mais a `main` e a `report` do
`gpt-engineer-app[bot]`, de 10/08.

### Estado das PRs do inventário, às 19:36

| PR | GitHub diz | Observação |
|---|---|---|
| #107 | `MERGEABLE / CLEAN` | fora do rascunho, só documentação. Falta fundir |
| #113 | `MERGEABLE / CLEAN` | verificada duas vezes. Falta fundir |
| #117 | `MERGEABLE / CLEAN` | verificada duas vezes. Falta fundir |
| #108 | `MERGEABLE / UNSTABLE` | funde, mas o lint falha (acima) |
| #35 | `CONFLICTING / DIRTY` | confirmado pelo GitHub, não só pelo teste local |
| #190 (esta) | `MERGEABLE / CLEAN` | o local tinha a fusão da `main` por empurrar |

São 29 PRs abertas no repositório. A #198 (cache dos recursos públicos, aberta
às 18:14) tem rodapé do Claude — não é trabalho do Codex e não entra neste
inventário.

### Ainda por fazer — revisto

1. **#108**: `pnpm lint --fix` no ficheiro do fixture e empurrar. É o único
   obstáculo ao portão.
2. **#113, #117, #107**: verdes e limpas. Falta fundir — nada técnico as segura.
3. **#30** (modelos de e-mail): continua o maior bloco ausente por inteiro.
4. **#35**: fechar e levantar da `main`.
5. **`App_Edu`**: 962 ficheiros por commitar, confirmado às 19:3x. Último commit
   do repositório: `5ee9cdf1`.

## Quinta actualização, 19:50 de 20/10

Base `origin/main` em `12b98882`. Catorze minutos depois do retrato anterior, e
já há três coisas a corrigir — duas delas *neste* documento.

### Correcção: o carimbo das horas

A quarta actualização foi escrita às **19:36**, não às 20:05. O fuso aqui é WAT
(UTC+1) e a hora foi lida do relógio errado. Pela mesma razão, o retrato das
19:30 diz que sete PRs «fundiram entre as 18:05 e as 18:17» — eram **19:05 e
19:17** locais; 18:05 é o que o GitHub devolve, em UTC. Os carimbos acima foram
corrigidos; a confusão fica registada porque é a segunda vez que uma afirmação
deste documento cai por medição, não por mudança do mundo.

### Correcção: os 11 erros de lint não eram todos nossos

A quarta actualização diz «a culpa é nossa». É dois terços verdade. Dos 11
erros de `prettier/prettier` do portão:

| Erros | Ficheiro | Commit |
|---|---|---|
| 8 | `tests/integrations/bigbluebutton-service.test.ts` | `6cb9e741`, nosso, das 19:32 |
| 3 | `scripts/worker-secrets.mjs` | `0ba4602b`, do ramo, de 08/10 |

Os 3 são quatro entradas `BBB_*` no catálogo `NOT_WORKER_SECRETS` com linhas
acima dos 100 caracteres do `printWidth`. Quer dizer que **o portão da #108 já
estava vermelho antes do nosso commit** — o retrato das 19:30, que anunciou
«116/116 verdes», não mediu o portão em momento nenhum. Na `main` o mesmo
ficheiro está limpo (`prettier` e `eslint` verificados em `12b98882`): o defeito
é do ramo.

Ambos corrigidos e empurrados: `a0eb4e18` (fixture) e `316a7b05` (catálogo).
Só formatação, e com `eslint .` no ramo inteiro a dar **0 erros, 47 avisos**.

### Cinco PRs fundiram enquanto isto se escrevia

Entre as **19:40 e as 19:41** locais entraram, por esta ordem: #107 (plano
BigBlueButton), **#190 — este inventário**, #113 (ICS), #117 (ciclo React) e
#198 (cache dos recursos públicos). A base saltou de `7cc34b15` para
`12b98882` e as PRs abertas passaram de 29 para 24.

Com isso fecham-se os itens 2 e 3 do roteiro das 19:36 — as três PRs «verdes e
limpas, nada técnico as segura» foram fundidas oito minutos depois de a frase
ser escrita. E há uma consequência prática: **o inventário está na `main`**, por
isso daqui para a frente cada actualização precisa de ramo e PR próprios.

### Ainda por fazer — revisto outra vez

1. **#108**: às 20:03 o portão passou — `MERGEABLE / CLEAN`, com «Estilo,
   acessibilidade e build» verde em 4m14s e os E2E e Lighthouse `skipping`,
   como é normal numa PR. O ramo está 85 commits à frente da `main` e 6 atrás.
   Não falta nada técnico: falta **decidir** se a integração BigBlueButton entra,
   e fechar a árvore de rotas (`routeTree.gen.ts` e `navigation-catalog.ts`
   continuam sem `aulas-virtuais`).
2. **#30** (modelos de e-mail): continua o maior bloco ausente por inteiro, e
   agora é o item mais antigo da lista.
3. **#35**: `CONFLICTING / DIRTY`. Fechar e levantar da `main`.
4. **`App_Edu`**: 962 ficheiros por commitar. O único trabalho que resta fora do
   controlo de versões.
