# Ponto de situação — trabalho de 27/09 a 04/10, por commitar e por publicar

Pedido: organizar tudo o que foi feito na última semana (por vários agentes —
Claude e o `gpt-engineer-app[bot]`/Lovable) e ainda não chegou a produção,
incluindo o visual do site. Relatório só de leitura: nenhum push, merge,
segredo ou deploy foi tocado para o produzir — só `git`, `gh` (API/CLI,
leitura) e `wrangler ... deployment list` (leitura).

## 0. Resumo

1. **O deploy automático (`Deploy produção`, GitHub Actions) nunca publicou
   nada desde que existe** (2026-09-29) — falha em todos os ~20 runs, sempre
   pela mesma causa: faltam os 5 segredos obrigatórios no ambiente `production`.
2. Tudo o que está realmente no ar foi publicado **à mão, deste computador**,
   e os quatro serviços **não estão todos no mesmo commit** — confirma-se o
   risco que já estava registado na memória do projecto.
3. Há 21 PRs abertos/draft no GitHub, nunca fundidos em `main` — o mais
   relevante para "o visual do site" é o **PR #66 "Visual «Aurora»"**, com
   7841 linhas novas, em draft desde 2026-10-02.
4. Há 4 commits + 2 ficheiros que só existem neste computador, nunca
   publicados nem sequer num branch remoto.
5. Há 5 worktrees com ~85 ficheiros cada por commitar, parados há cerca de um
   mês — parecem cópias redundantes de uma mesma tentativa, não trabalho da
   última semana.

## 1. O que está realmente em produção agora, por app

Confirmado por `wrangler ... deployment list` (não pelo histórico do git):

| App | Commit no ar | Quando |
|---|---|---|
| `siga-web` (Pages) | `06ed7f28` | 2 dias atrás |
| `siga-docs` (Pages) | `06ed7f28` | 2 dias atrás |
| `siga-admin` (Pages) | `b3403050` | 2 dias atrás |
| SIGA (Worker, `portal-siga.com`) | não identificável pelo wrangler (só "Secret Change"/"Unknown") | 2026-10-02 |

`siga-admin` está **um passo adiante** de `siga-web`/`siga-docs`: inclui o
commit `b3403050` (chat persistente por escola), que os outros dois não têm.
É o padrão exacto que [[deploy-all-verificar-sempre]] já tinha avisado —
"metade do ecossistema numa versão, a outra noutra".

Nenhum dos quatro está no commit actual do branch de trabalho (`80b1f07e`) ou
de `origin/main` (`f6a9bcbe`). Por ordem cronológica, o que falta publicar
em **todos** os serviços, a partir de `06ed7f28`:

- `6331be1d` fecha privilégios do `anon` nas tabelas do chat (`TRUNCATE`/`DELETE` ainda abertos) — **isto já está corrigido na base de dados** via migração directa (Supabase, não depende de deploy de app), só o código/UI é que não está publicado em todo o lado.
- `63b607c8` recaptura do retrato da produção (não afecta produção, só o repo)
- `80b1f07e` as três migrações aplicadas a 02/10 (idem — já na base, não depende de deploy)
- `c9b628f6` e `f6a9bcbe` em `origin/main` (sondas de confirmação, PR #67) — nunca publicados em nenhum serviço, pela razão do §2.

## 2. Por que o deploy automático nunca publicou nada

```
gh api repos/.../environments/production/secrets → {"total_count":0,"secrets":[]}
gh secret list (repositório)                      → vazio
```

Zero segredos configurados, a nível de repositório e do ambiente
`production`. O workflow `.github/workflows/deploy-production.yml` tem mesmo
um passo dedicado a falhar rápido e dizer o que falta — e falha sempre nos
mesmos 5:

```
CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID,
VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
```

`gh run list --workflow=deploy-production.yml` mostra **falha em todos os
runs desde a criação do workflow** (2026-09-29), incluindo os merges das PRs
#45 a #67 — ou seja, desde há uma semana, **nenhum merge em `main` chegou à
Cloudflare por este caminho**. O que está no ar (§1) foi sempre publicado à
mão, por `npm run deploy:cf` / `deploy:all` corridos localmente.

## 3. Segredos colados neste chat

Já tratado nesta conversa, repetido aqui por ficar junto do resto: colou o
access token (`sbp_...`) e a `service_role` key do Supabase em texto simples.
**Não ficaram guardados em nenhum ficheiro.** Antes de os usar para resolver
o §2 (ou em qualquer outro sítio): rotacionar os dois primeiro — ver
[[segredos-supabase-expostos-04-10]]. Os valores novos vão para
`gh secret set <NOME> --env production`, nunca para um ficheiro do
repositório.

## 4. Trabalho que só existe neste computador

```
git ls-remote --heads origin chore/lovable-backend-integration → (vazio)
```

O branch de trabalho actual já teve PR (#28, fundida a 24/09) e o remoto foi
apagado nessa altura — normal. Mas o branch local **continuou a receber
commits depois disso** e nunca mais foi publicado: os 4 commits do §1
(`b3403050`, `6331be1d`, `63b607c8`, `80b1f07e`) só existem aqui.

Mais dois ficheiros com alterações não commitadas:

- `src/features/hr/teacher-lessons.ts` — limpeza de tipos no RPC
  `hr_redeem_teacher_qr_secure` (remove o cast manual, usa os tipos gerados).
  Trabalho genuíno, só local.
- `painel/admin/src/lib/saas-api.ts` — adiciona `mfa: data.mfa` à sessão SaaS.
  **Isto é idêntico, linha a linha, ao PR #64** (`fix(admin): devolver mfa na
  sessão SaaS`, aberto a 02/10, `MERGEABLE`/`CLEAN`). Não precisa de ser
  commitado aqui — ou se fundir o #64 primeiro, descarta-se a alteração
  local; ou commita-se aqui e fecha-se o #64 como duplicado.

**Risco:** três migrações já aplicadas directamente em produção e uma correcção
de segurança (RLS do chat) vivem só num branch sem remoto, numa máquina só.
Ver [[outro-agente-no-mesmo-directorio]] e [[lovable-repoe-o-directorio-em-main]].

## 5. PRs abertos — trabalho pronto à espera de decisão

21 PRs abertos/draft no total (`gh pr list --state open`); nenhum fundido em
`main`. Os da última semana (27/09 em diante):

| PR | Título | Estado | Aberto | Nota |
|---|---|---|---|---|
| **#66** | **Visual «Aurora» da marca (WEB, SIGA, e-mails)** | DRAFT | 02/10 | **É o visual do site.** 85 ficheiros, +7841/−252. Traz o branch `claude/ecstatic-shannon-wek2yt`, que nunca teve PR próprio. Fundo animado azul→violeta, vidro com paralaxe, mascote, telemóvel de demonstração — aplicado na home, `/start`, guia de arranque e e-mails. Registo WEB com confirmação por código. `MERGEABLE`/`CLEAN`. Corpo do PR diz: `tsc` ok, 2579 testes a passar, lint/estilo/a11y ok, build do SIGA e do WEB ok. |
| #65 | Auditoria de produção 2026-10-02 (2FA na sessão, webhook assinado, dinheiro) | DRAFT | 02/10 | 2ª entrega de correcções de segurança (PayFlow, API key do gateway, 2FA imposto na sessão). |
| #64 | fix(admin): mfa na sessão SaaS | OPEN | 02/10 | Duplica a alteração local do §4. `MERGEABLE`/`CLEAN`. |
| #63 | SIGA Desktop: robustez do runtime e hardware | OPEN | 30/09 | Tauri. |
| #62 | fix(hr): pagamentos atómicos e validação da folha | OPEN | 30/09 | |
| #59 | RH e faturação: papel pela escola da linha | OPEN | 30/09 | |
| #35 | feat(ui): navegação, listas e modais responsivos | DRAFT | 28/09 | Também visual/UI (responsividade), separado do Aurora. |

Backlog mais antigo (03/09 a 25/09), 14 PRs — fora do âmbito de "última
semana", não listado aqui ficheiro a ficheiro; `gh pr list --state open`
mostra todos quando for a vez de os rever.

## 6. Worktrees "pedagógica/pautas" — parados há ~1 mês, prováveis duplicados

Cinco worktrees locais (`.claude/worktrees/{brave-mendeleev,charming-ishizaka,
dazzling-raman,epic-satoshi,optimistic-chebyshev}-*`) têm entre 84 e 96
ficheiros modificados **nunca commitados**, todos a partir da mesma base
(`4cea0cd8`/`5538c92a`, 25–26/08) e todos com a última alteração no disco a
poucos segundos de distância uns dos outros (25/08, não na última semana) —
sinal de que são cópias da mesma tentativa, não cinco sessões de trabalho
independentes. Tamanho muito parecido entre os cinco (+4300 a +4800 linhas),
mas não idênticos byte a byte.

Tocam sobretudo em: `pedagogica/pautas/*` (pautas, avaliações), sistema de
modais (`modal-system/*`), `button.tsx`/`card.tsx`/`dialog.tsx`,
`styles.css` — isto também é "visual do site", mas da aplicação principal,
não do site de marketing (que é o PR #66).

`charming-ishizaka-b78b2f` é o mais completo: inclui ainda, por commitar, uma
funcionalidade nova de controlo de acessos por catraca (`src/features/catracas/`,
`src-tauri/`, rota `catracas.tsx`) e alterações a `package.json`. O
`optimistic-chebyshev-69c1c9` parte de um commit a mais
(`5538c92a` "disable fake OCR pauta scanner").

Antes de decidir: comparar os cinco com cuidado (não foi feito aqui em
detalhe, só confirmado que não são idênticos) e escolher um para commitar/PR;
apagar os outros quatro (`git worktree remove`) evita confusão e poupa
espaço.

## 7. Branches mais antigos — fora do âmbito desta arrumação

`feat/payflow-integration-production` (ahead 63, último commit 19/09),
`feat/payflow-connect-app` (03/09), `conciliacao/siga-lovable` (19/09),
`feature/import-extra-importers` (03/09), os seis `worktree-agent-*` (13/08)
e a migração solta em `beautiful-khayyam-c94cca`
(`20260911010000_contact_verification_profiles.sql`, 11/09) são todos de
antes de 27/09. Ficam fora deste ponto de situação; sinalizados para quando
for a vez do backlog antigo.

## 8. Checklist de acção recomendada, por ordem

1. **Decidir o PR #66 (visual Aurora)** — rever o draft, tirar de draft e
   fundir, ou pedir alterações. É o maior bloco de trabalho visual pendente.
2. **Resolver o duplicado do §4**: fundir PR #64 e descartar a alteração
   local em `saas-api.ts`, ou vice-versa.
3. **Commitar e publicar** `teacher-lessons.ts` e abrir PR para o branch
   actual (ou pelo menos `git push` para um branch novo) — este trabalho só
   existe aqui.
4. Rotacionar o access token e a `service_role` key do Supabase (§3).
5. Configurar os 5 segredos obrigatórios no ambiente GitHub `production`
   (§2), com os valores já rotacionados.
6. Decidir os PRs #65, #63, #62, #59, #35 (última semana) e depois o backlog
   mais antigo (§5, §7).
7. Depois de tudo fundido: publicar de uma vez (`npm run deploy:all` ou deixar
   o workflow correr) e confirmar na origem, não no código de saída —
   `npx wrangler pages deployment list --project-name siga-{web,docs,admin}`
   — para os quatro ficarem no mesmo commit.
8. Decidir sobre os cinco worktrees de pautas (§6): escolher um, commitar,
   remover os outros.

## Fontes

- `gh run list --workflow=deploy-production.yml`, `gh run view 37189590349`
- `gh api repos/.../environments/production/secrets`, `gh secret list`
- `npx wrangler@4 pages deployment list --project-name siga-{web,admin,docs}`,
  `npx wrangler@4 deployments list`
- `gh pr list --state open`, `gh pr view {64,65,66}`, `gh pr diff 64`
- `git log`, `git merge-base`, `git ls-remote`, `git worktree list`,
  `git status` em cada worktree
- `.github/workflows/deploy-production.yml`
- Memória do projecto: ver links `[[...]]` ao longo do documento
