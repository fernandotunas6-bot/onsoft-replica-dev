# Trabalho feito com o ChatGPT (Codex) — inventário e estado

Data: 2026-10-20. Base de comparação: `origin/main` em `7d8ce0ec`.
Actualizado às 07:10 de 20/10: o Codex continuou a trabalhar depois de isto ser
escrito — há uma PR nova (#188) e um ramo empurrado sem PR, ambos de hoje.

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
  (`apps/admin`, `apps/escolar`, `apps/web`), 975 MB, de Agosto, **sem git
  nenhum**. Cinco sessões de Codex (até 48 mensagens cada) construíram isto. Não
  há histórico, não há cópia remota: um `rm` perde tudo.
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

O **SIGA_EDU** saiu desta lista: ficou sob git às 06:41 de hoje, num commit único
de 776 ficheiros (`b7afb67`), com `.gitignore` a excluir `node_modules/` e
`.next/`. O `.git` tem 8,7 MB — os 984 MB da pasta são quase todos dependências.
Falta-lhe **cópia remota**: um `rm -rf` da pasta ainda leva tudo.
