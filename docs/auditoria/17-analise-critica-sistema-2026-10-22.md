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

## A crítica central, agora medida (25/10)

> **A primeira versão desta secção exagerou.** Escrevi-a com números de segunda mão — a auditoria 16
> e leituras de 21/10 — porque o MCP do Supabase pedia uma autorização que a sessão não tinha. A 25/10
> voltou a responder, e os números reais mudam a conclusão num ponto importante: **não é um sistema
> construído para ninguém.** É um sistema cuja metade exercida serve uma escola a sério, e cuja outra
> metade nunca foi tocada por ninguém. A desproporção está na segunda metade, não no todo.

### O que a produção tem, contado (não estimado)

|                                 |                                               |
| ------------------------------- | --------------------------------------------- |
| Tabelas em `public`             | **209**                                       |
| Nunca tiveram uma linha         | **102** (48,8%)                               |
| Tabelas por escola              | 170, das quais **76 usadas pela escola real** |
| Escolas                         | 49                                            |
| Escolas com uso a sério         | **1**                                         |
| Escolas com exactamente 1 aluno | **43**                                        |
| Escolas vazias                  | 5                                             |

### A escola real

**Colégio Adventista — Huambo.** Criada a 03/08/2026, no dia em que o projecto começou. 42 alunos,
4 professores, 4 facturas, **2355 registos de auditoria**, com actividade a 23/10 — dois dias antes
desta medição. Exercita **76 das 170 tabelas por escola**: isso é largura de uso real, não um
cadastro de demonstração nem um resto de ensaio.

Era isto que a frase "o uso real é 1 escola, 2 alunos" escondia. Há uma escola a usar o sistema de
forma continuada desde Agosto.

### As 43 outras

Todas com nome de teste, todas com exactamente 1 aluno, e **todas criadas a 8 e 9 de Setembro** — dois
dias, uma rajada de E2E, não poluição a entrar aos poucos. Trazem consigo:

- **34 das 38 facturas** da base (só 4 são da escola real)
- **12 509 dos ~14 900 registos de auditoria** — a tabela de auditoria é 84% ruído de ensaio

Qualquer métrica de uso lida sem as excluir mente por mais do dobro. Foi o que me aconteceu, e à
auditoria 16 antes de mim.

### Os módulos adormecidos: zero, confirmado à unidade

Não "≈0 registos" por estimativa do `pg_stat`, mas contagem exacta:

| Módulo                            | Linhas    |
| --------------------------------- | --------- |
| Presenças (sessões / registos)    | **0 / 0** |
| RH: contratos / folhas de salário | **0 / 0** |
| Pagamentos online (gateway)       | **0**     |
| Alumni                            | **0**     |

Estes, mais as 102 tabelas que nunca tiveram uma linha, são a desproporção verdadeira — e são a
razão por que a acção 4 (declarar módulos adormecidos) continua a ser a mais útil da lista. O que
muda é o tom: não se trata de um sistema sem utilizadores, mas de metade de um sistema a mais.

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

**Feito** (22–23/10, tudo fundido):

- ~~Fundir a #139~~ — já estava fundida, com a #144. ✔
- ~~Portão de guardas nas _server functions_~~ — PR #241: 497 declarações, 480 com guarda, 17
  públicas declaradas com a defesa de cada uma. Provado a injectar uma sem guarda; e apanhou uma a
  sério (`studentNumberLoginAvailable`, da #148) uma hora depois de entrar. ✔
- ~~Triagem das PRs~~ — na [18](./18-triagem-prs-2026-10-22.md). Desbloqueadas três PRs paradas oito
  dias por CI caducado; fundidas a #126, #148, #208 e a pilha YFT. ✔
- ~~Arrumação~~ — `types.ts` apagado (um só ficheiro de tipos), aviso no `drizzle/`, comentário de
  `sga.ts`, heap de 8 GB no `typecheck`. ✔

**Por fazer**, por ordem de retorno:

1. **Declarar os módulos adormecidos.** Presenças, RH e folha, pagamentos online e alumni têm
   **exactamente zero linhas** (medido a 25/10, não estimado). Escolher um para piloto real numa
   escola e marcar os outros como não suportados, em vez de os manter a meio caminho entre "feito" e
   "nunca usado". É a acção mais útil que resta, e a única que ataca a desproporção medida acima.
2. **Limpar ou marcar as 43 escolas de ensaio.** São identificáveis sem ambiguidade: nome de teste,
   exactamente 1 aluno, todas criadas a 8–9/09. Trazem 34 das 38 facturas e 12 509 dos ~14 900
   registos de auditoria. Enquanto estiverem por marcar, toda a métrica de uso mente por mais do
   dobro — foi o que aconteceu à auditoria 16 e à primeira versão deste relatório. A limpeza exige
   `SIGA_CLEANUP_ALLOW_PRODUCTION=1` (o _dry-run_ salta o guarda).
3. **_Staging_.** Desbloqueia a prova E2E autenticada e tira as migrações da produção às cegas.
4. **Rotacionar o segredo Google OAuth** e só depois apagar o ficheiro do disco. Apagá-lo antes não
   resolve: o segredo já foi exposto num chat a 25/09 e continua válido.
5. **Activar a protecção de passwords comprometidas** no Supabase Auth.
6. **Tirar o `estudo/yft-school-system` para repositório próprio** — falta decidir o destino.

## Limites desta análise

**Da versão de 22/10:** não consultei a base de produção — o MCP do Supabase pedia uma autorização
que a sessão não tinha —, pelo que os números de uso vinham das leituras de 21 e 22/10 e eram
estimativas do `pg_stat`. Foi essa a causa do exagero que a secção central agora corrige.

**Da revisão de 25/10:** os números de produção são contagens exactas (`count(*)` por tabela, via
`query_to_xml`), em leitura apenas, sem dados pessoais e sem nada escrito. O que continua por provar
é o mesmo de antes: **nenhum fluxo autenticado foi exercido de ponta a ponta num browser**, por falta
de _staging_. E os 480 guardas em 497 _server functions_ são contados por análise do texto do código
— é um limite inferior fiável para quem usa guarda, não uma prova de que cada guarda está correcto.
