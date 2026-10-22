# SIGA Plus — Análise crítica do sistema (22/10/2026, tarde)

**Base:** ramo `fix/website-escolar-identidade-e-ambito` @ `d455b8fe`; `main` publicada em `6c39e071`.
**Natureza:** não é uma auditoria de funcionalidades — a [16](./16-auditoria-funcionalidades-2026-10-22.md),
de hoje de manhã, já faz essa lista. Isto olha para o sistema **como sistema**: proporção,
de onde vem a confiança, e o que custa manter. Tudo medido no repositório e no GitHub; a base de
produção não foi consultada (o MCP do Supabase pede autorização nesta sessão), por isso os números
de uso são citados das leituras de 21 e 22/10.

## O que mudou desde esta manhã

A **publicação está desbloqueada**. O "Deploy produção" passou às 15:30, 15:38 e 15:39 (`c38c4b52`,
`cd9dc777`, `6c39e071`) e `portal-siga.com`, `app.portal-siga.com` e `docs.portal-siga.com` respondem 200.
O ponto **F-01 da auditoria 16 (P1) está fechado** — os ~20 PRs fundidos desde 12/10, incluindo o #216
de segurança, chegaram aos utilizadores. A auditoria 16 foi escrita antes disto.

## A crítica central: o sistema está desproporcionado

| Construído                             | Exercido                                          |
| -------------------------------------- | ------------------------------------------------- |
| 207 tabelas em produção                | ~100 vazias (leitura de 21/10)                    |
| 31 áreas em `src/features`, 18 módulos | ≈8 com dados reais                                |
| 24 841 linhas de _server functions_    | sem uma única prova E2E autenticada               |
| 49 escolas/tenants                     | ≈85 alunos; a leitura de 21/10 dava 1 escola real |
| 591 ficheiros de teste, 3979 testes    | 6 tocam a base; 0 autenticados de ponta a ponta   |

Este é o defeito estrutural de que os outros descendem. Presenças, RH e folha, pagamentos online,
alumni, catracas, exames, bolsas, lista de espera, BigBlueButton — está tudo escrito e testado em
unidade, e nada disto processou um registo real. Cada um destes módulos tem custo de manutenção
imediato (migrações, tipos, rotas, testes, revisões, conflitos de PR) e valor zero até alguém o usar.
A pergunta a fazer não é "o que falta construir" mas "o que é que podemos declarar adormecido".

## 1. A confiança vem do lugar errado

**A autorização vive inteiramente em código de aplicação.** `client.server.ts` cria o cliente com
`SUPABASE_SERVICE_ROLE_KEY`, e `sga-admin.ts` (usado por 135 ficheiros) devolve esse cliente a toda a
aplicação. O RLS, que foi apertado em migrações sucessivas, **não é o que protege as leituras da app** —
é defesa de segunda linha para quem bater na API do Supabase por fora. Quem protege as leituras são os
guardas em TypeScript.

E os guardas são uma **convenção, não uma garantia**: 95 dos 103 ficheiros com `createServerFn` passam
por `requireSupabaseAuth`/`requireSgaWriter` (os 8 restantes são legitimamente públicos — registo, OTP,
reposição de senha — mais `provisioning-core`/`platform-guard`, que guardam de outra forma). 95/103 é
bom. O problema é que isso foi verificado agora por `grep`, não pelo compilador nem pelo CI: **um
ficheiro novo sem guarda compila, passa nos 3979 testes e publica-se**. Os 84 ficheiros em
`tests/security` testam os guardas que existem; não impedem que falte um.

> Acção de maior retorno de todo este relatório: um teste que enumere os `createServerFn` e exija que
> cada um esteja numa lista de públicos **ou** use um guarda. É meia hora de trabalho e transforma a
> convenção em portão.

## 2. Os portões estão acesos mas apontam para fora da estrada

CI verde, deploy verde. Mas: o Lighthouse mede sempre o ecrã de entrada (as 7 URLs desenham todas o
login), o E2E só corre no push para `main` e salta nas PRs, os testes fora de `tests/` nunca correm, e
já houve um portão vermelho por Lighthouse com publicação a seguir. Resultado: _verde_ significa
"compila e os testes unitários passam", e é lido como "funciona". Entre essas duas frases está
exactamente o que nunca foi provado — um fluxo autenticado de ponta a ponta.

E há uma forma mais afiada do mesmo problema, medida a 22/10: **a cor do selo de uma PR é do último
commit dela, que pode ter semanas.** A #126 estava verde de 10/10 — doze dias e cerca de vinte fusões
atrás. As três PRs de tradução YFT estavam vermelhas de 14/10, com 230 erros de formato em seis
ficheiros que nenhuma delas toca: a `main` corrigiu-os a 15/10 e o CI delas nunca voltou a correr.
Um verde desses não diz que a PR funciona com o que está publicado, e um vermelho desses condena
trabalho que já não tem defeito. Três PRs estiveram oito dias paradas por isso.

Sem ambiente de ensaio (_staging_) o resto não se resolve, e a falta de _staging_ é hoje o maior
multiplicador de risco do projecto: todas as decisões de migração e de RLS são tomadas às cegas ou
directamente na produção.

## 3. Quatro gerações de modelo de dados e duas de tipos

| Conjunto                                   | Ficheiros | Estado                                |
| ------------------------------------------ | --------- | ------------------------------------- |
| `supabase/migrations/`                     | 238       | vivo                                  |
| `supabase/migrations-lovable-nao-aplicar/` | 33        | modelo substituído, nome a avisar     |
| `drizzle/migrations/`                      | 48        | modelo substituído, sem aviso no nome |
| D1 do PayFlow                              | —         | vivo, vazio                           |

E dois ficheiros de tipos a coexistir: `types.sga.ts` (14 317 linhas, **207 tabelas**, gerado da
produção) e `types.ts` (6177 linhas, **85 tabelas**, mantido à mão, último toque "Work in progress" a
18/10). O alias do `tsconfig` manda `@/integrations/supabase/types` para o gerado, por isso o código
de domínio está bem tipado; mas os _imports_ relativos `./types` em `client.ts` e `client.server.ts`
continuam a resolver para o ficheiro de 85 tabelas — salva-os o `as unknown as SupabaseClient<Database>`
em `sga.ts`. Esse mesmo `sga.ts` tem um comentário a dizer que **`types.ts` é o gerado da produção**,
o que já não é verdade. Não é um defeito a correr; é dívida de nomes que faz perder tempo a cada
leitura e que mais tarde ou mais cedo faz alguém confiar no ficheiro errado.

## 4. O repositório carrega três sistemas, não um

4371 ficheiros versionados, e dentro deles:

- `src/` — a aplicação (123 rotas, 1047 ficheiros)
- `painel/` — **cinco aplicações npm independentes**: `admin`, `docs`, `escolas`, `payflow`, `web`
- `desktop/` + `src-tauri/` — a app de escritório (306 ficheiros)
- `mobile-flutter/` — 6 ficheiros Dart em `lib/`: um esqueleto
- `estudo/yft-school-system/` — **90 ficheiros Dart de um sistema escolar inteiro**, com `android/`,
  `ios/`, `linux/`, `macos/`, `school-worker/` e os seus próprios testes Playwright, dentro do repo
  (e a #108 volta a acrescentá-lo inteiro: 342 ficheiros, +55 573 linhas)
- `services/import_engine/` — 3 ficheiros Python; `python/` — 6 mais

Nove ficheiros de _lock_, quatro gestores de pacotes (`bun.lock`, `pnpm-lock.yaml` — este ainda
não versionado —, `package-lock.json` em cinco sítios). Quinze _workflows_ de CI. Isto não é desenho,
é acreção: cada tentativa ficou onde caiu. O custo aparece em cada `tsc` (que precisa de 8 GB e aborta
com a memória por omissão), em cada actualização de dependência e em cada conflito de fusão.

## 5. O gargalo não é escrever código

**70 ramos remotos. 28 PRs abertas** — mas **15 são rascunhos**, marcação do próprio autor a dizer que
não estão prontas, e três quartos das grandes estão entre elas. A fila que de facto espera revisão são
**12**. A dívida é real e é metade do que o total sugere; a triagem está na
[18](./18-triagem-prs-2026-10-22.md).

Funcionalidades prometidas estão presas aí: bolsas e lista de espera (#87), app móvel (#116, #119),
transporte e entregas PDF (#132). Duas correcções fundem-se para o mesmo defeito de horário (#121 e
#144) e só uma delas trata o caso `s/n`. A numeração de alunos (#148) foi fundida a 22/10.

Nota de correcção: este relatório afirmava, seguindo a auditoria 16 da manhã, que duas alterações de
segurança viviam fora da `main` (a migração `20261014121549 teacher_scope_and_treasury_reads` na #139
e o alinhamento do guarda de horário na #144). **Ambas já estão fundidas** e as duas migrações estão
em `supabase/migrations/`. Verificado a 22/10 à tarde.

Escrever código deixou de ser o passo limitante há semanas. Integrar é.

## 6. Higiene de segredos: o padrão não se corrigiu

`client_secret_370295090078-….json` continua no directório de trabalho — ignorado pelo `.gitignore`,
portanto fora do histórico, mas presente no disco e já exposto numa conversa a 25/09 e nunca rotacionado.
Com os casos de 04/10 e 22/10, são quatro episódios de segredos colados em canais de conversa. O
`.gitignore` resolveu o sintoma (não versionar); a prática não mudou.

## Ordem de ataque

~~1. **Fundir a #139.**~~ Já estava fundida, com a #144. ✔
~~2. **Portão de guardas nas _server functions_.**~~ Feito a 22/10, na PR #241: 497 declarações, 480
com guarda, 17 públicas declaradas com a defesa de cada uma. Provado a injectar uma sem guarda. ✔
~~3. **Triagem das PRs.**~~ Feita, na [18](./18-triagem-prs-2026-10-22.md). Decidir é que falta.
Entretanto desbloqueadas três PRs paradas há oito dias por CI velho, e fundida a #148. ✔ 4. **Declarar os módulos adormecidos.** Escolher 3 a 5 (presenças, RH, pagamentos online são os
candidatos óbvios), pôr um piloto real numa escola para um deles e marcar os outros como não
suportados — em vez de os manter todos a meio caminho entre "feito" e "nunca usado". 5. **Marcar as 43 escolas de teste** ou limpá-las (com `SIGA_CLEANUP_ALLOW_PRODUCTION=1`; o _dry-run_
salta o guarda). Enquanto não o fizer, nenhuma métrica de uso significa nada. 6. **_Staging_.** É o que desbloqueia a prova E2E autenticada e tira as migrações da produção às cegas. 7. **Rotacionar o segredo Google OAuth** e apagar o ficheiro do disco. 8. Arrumação: `drizzle/` para fora ou com o aviso no nome, `estudo/yft-school-system` para repositório
próprio, corrigir o comentário de `sga.ts`, `NODE_OPTIONS=--max-old-space-size=8192` no `typecheck`.

## Limites desta análise

Não consultei a base de produção nesta sessão — os números de uso vêm das leituras de 21 e 22/10 e
são estimativas do Postgres. Não corri `vitest`, `tsc` nem `eslint` (a auditoria 16 correu-os hoje:
3979 aprovados, 0 falhas, 47 avisos). Os 95/103 guardas foram contados por padrão de texto: é um
limite inferior fiável para quem _usa_ guarda, não uma prova de que cada guarda está correcto.
