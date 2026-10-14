# Auditoria 15 — análise crítica do sistema (2026-10-14)

**Estado:** as correcções de código do §10.1 a §10.3 e §10.5 estão feitas — ver §12.

**Âmbito:** o sistema todo, medido na `origin/main` (`df78e817`) e na produção, com atenção
especial ao que foi **migrado** desde a auditoria 13 (06/10) — migrações de base, código
publicado e funcionalidades que chegaram ao uso.

**Método:** tudo medido hoje. A produção foi lida pelo MCP do Supabase (leitura) e por HTTP de
fora; o GitHub pela API. A `main` foi lida numa *worktree* própria, porque a árvore local está
115 commits atrás e não serve de base. **Nada foi escrito na produção e nada foi publicado.**

**Não verificado nesta sessão:** não houve percurso de UI nem ensaio de concorrência. A suite
foi corrida depois das correcções (§12), não no estado em que a `main` estava.

---

## 1. Medições de hoje

| Verificação                           | Resultado                                              |
| ------------------------------------- | ------------------------------------------------------ |
| Tabelas `public` na produção          | **206** (o retrato na `main` diz 189)                  |
| Tabelas `public` vazias               | **100** de 206; outras 25 com ≤ 5 linhas               |
| Tabelas com RLS e **zero** políticas  | **76**                                                 |
| Migrações: ficheiros na `main`        | 227                                                    |
| Migrações: histórico da produção      | 190                                                    |
| Aplicadas **sem ficheiro** na `main`  | 6 por nome; **4** por efeito (§4)                      |
| `espera-migracao.ts` — entradas       | 3 — **todas já existem na produção** (§5)              |
| Suite de testes (corrida hoje)        | **3 438 passam**, 19 ignorados (509 ficheiros)         |
| `tsc --noEmit` / `eslint .`           | 0 erros / 0 erros, 47 avisos                           |
| CI no topo da `main`                  | **falha**; testes, build, Lighthouse e E2E *skipped*   |
| Publicação no topo da `main`          | **falha** (13/10) — produção está em `36d0b51b`        |
| PRs abertos                           | **19** (13 em rascunho), ~90 k linhas por integrar     |
| Commits fora da `main`                | **799**                                                |
| Releases da app desktop               | **4** (v1.1.0 → v1.2.2), 12 ficheiros, **0 `.sig`**    |
| Hostnames a responder                 | 5/5                                                    |

Dimensão: 236 k linhas em `src/`, 82 k nos três apps do `painel/`, 9.8 k no `desktop/`,
986 no `mobile-flutter/`; 509 ficheiros de teste; 227 migrações.

---

## 2. O achado central: o topo da `main` não está publicado nem testado

`df78e817` — «feat(flutter): add institutional client and tested backend foundations» — foi
**empurrado directamente para a `main`**, sem PR e sem CI prévio, a 13/10 às 07:14.

O que se seguiu:

- **A publicação falhou.** 230 erros de lint, todos `prettier/prettier`, todos em 6 ficheiros,
  todos em `mobile-flutter/backend/` (`api.ts` 74, `api.test.mjs` 57, `transport.test.mjs` 27,
  `integrations.test.mjs` 26, `integrations.ts` 24, `transport.ts` 22). Formatação.
- **A produção ficou em `36d0b51b`**, de 12/10 às 17:33. Há dois dias que a `main` não é o que
  está publicado.
- **Os testes nunca correram.** No CI, `Estilo, acessibilidade e build` falhou no lint e os
  quatro trabalhos seguintes — testes, build, Lighthouse, smoke E2E — ficaram *skipped*. O
  último commit da `main` não tem uma única verificação de comportamento.
- **O PR #131 existe para isto** («main verde outra vez — formatar o backend Flutter»), aberto
  17 minutos depois da falha, **ainda em rascunho** um dia depois.

Um `prettier --write` em 6 ficheiros desbloqueia a publicação. O problema não é a correcção: é
que um empurrão directo sem PR passou por cima do portão que existe precisamente para isto, e
ninguém fechou o ciclo.

### Os dois portões discordam

O CI da `main` falha em **todos** os runs desde 10/10 — `categories.performance` 0.84 contra um
mínimo de 0.90, igual nos 7 URLs e nas 3 repetições. Mas a publicação **passou** em `36d0b51b`,
`ff213b94`, `e6ece696` e mais cinco: o workflow de publicação corre `typecheck`, `lint` e
`test`, e não corre o Lighthouse.

Ou seja: há uma regressão de desempenho que deixa o CI vermelho há quatro dias e não impede
nada. Um portão que fica vermelho sem consequência deixa de ser portão e passa a ruído — e foi
exactamente esse ruído que fez a falha real de 13/10 não se distinguir das outras.

---

## 3. O esquema corre à frente do produto — e a distância aumentou

A auditoria 13 chamou-lhe «está construído, não está ligado». Oito dias depois está mais
construído e não está mais ligado.

| Área                      | Esquema na produção                        | Uso          |
| ------------------------- | ------------------------------------------ | ------------ |
| Catálogo educacional      | 115 disciplinas, 54 cursos, 8 países       | **0 ligadas**|
| BigBlueButton             | 3 tabelas aplicadas (08/10)                | **0 linhas** |
| Mobile V4 — chat          | `mobile_v4_chat_requests` aplicada (10/10) | **0 linhas** |
| Bolsas de estudo          | `student_scholarships` aplicada (05/10)    | **0 linhas** |
| Lista de espera por turma | `class_group_waitlist` aplicada (05/10)    | **0 linhas** |
| Presenças                 | tabelas e RPCs completos                   | **0 linhas** |
| Avaliação                 | tabelas, regras, pautas, versões           | **1 nota**   |

**O catálogo é o caso mais claro.** É o maior bloco de trabalho da última semana — PRs #122 a
#127, cerca de 15 commits, da estrutura global às siglas em minúsculas. Está aplicado na
produção, está semeado (115 + 54 linhas), e a adopção é **zero**: `subjects.catalog_subject_code`
está a `null` nas 11 disciplinas e `programs.catalog_course_code` a `null` nos 35 cursos. O
trabalho que o `b29e516a` chama «adopção do catálogo pelas escolas» não foi adoptado por nenhuma.

**O BBB e o Mobile V4 são o caso invertido:** as migrações estão aplicadas na produção e o
código está em **rascunho** (PR #108 e PR #116/#119). A base já carrega tabelas de
funcionalidades que a app publicada não tem.

De 206 tabelas, **100 estão vazias** e 25 têm cinco linhas ou menos. E 76 tabelas têm RLS
activo sem **nenhuma** política — alumni (15 tabelas), risco do aluno, exames, planos de aula,
escalas salariais, BBB, Mobile V4. Não é uma fuga (sem política, o `anon` e o `authenticated`
não lêem nada), mas é a confirmação medida de que essa parte do esquema nunca teve um modelo de
acesso pensado, porque nunca foi ligada a ninguém.

---

## 4. Quatro migrações aplicadas sem ficheiro na `main`

A regra da auditoria 12 — nada aplicado na produção sem o ficheiro no repositório — está
quebrada em **quatro** casos:

| Versão na produção | Nome                                          | Onde está o ficheiro         |
| ------------------ | --------------------------------------------- | ---------------------------- |
| `20261007083733`   | `atomic_student_enrollment_and_academic_year` | PR #129 (aberto, 12/10)      |
| `20261007083740`   | `staff_module_grants_require_mfa`             | PR #129 (aberto, 12/10)      |
| `20261008144147`   | `bbb_classroom_metadata`                      | PR #129 e PR #108 (rascunho) |
| `20261010190715`   | `mobile_v4_chat_commands`                     | PR #129 e PR #119 (rascunho) |

As duas de 07/10 são precisamente **os dois RPCs atómicos** que o `CONTINUE.md` de 08/10 dizia
estarem «explicitamente em `tests/security/espera-migracao.ts`» à espera de decisão do dono.
Foram aplicados a 07/10. Os ficheiros nunca chegaram à `main`.

### Duas que pareciam faltar e não faltam

Por nome faltavam seis. Comparadas **por efeito**, duas já estão no repositório:

- `20261004120443_chat_integrity_created_by_on_delete_set_null` — o
  `20261002100000_chat_integrity.sql` já declara
  `FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL`, e a produção tem
  exactamente essa definição.
- `20261004120832_annual_sheet_requires_all_terms_fix_exam_average` — a
  `private.build_grade_sheet` da produção tem **202 linhas de corpo e md5
  `f4af17b0f7f28040906fe099b56a4758`**, idêntico ao que o
  `20261002160000_annual_sheet_requires_all_terms.sql` produz. O «fix» entrou no próprio
  ficheiro a 03/10 (`5a400e2b`); a produção aplicou a versão de antes e a de depois como duas
  entradas.

Outras oito estão aplicadas com **nome igual e versão diferente** da do ficheiro
(`late_fee_one_rule` é `20261004135000` no repositório e `20261005081124` na produção;
`school_logos_no_svg`, `academic_year_dates_cover_terms`, `realtime_publish_school_screens`,
`annual_sheet_requires_all_terms` e os dois de RH idem).

Isto confirma a regra que já estava registada, e desta vez nos dois sentidos: **comparar por
efeito, não por nome** — por nome o repositório tem 227 ficheiros e a produção 190 entradas, e a
diferença não quer dizer nada em nenhuma das direcções. Contar nomes exagera o problema tanto
quanto o esconde.

O **PR #129** resolve as quatro linhas da tabela.

## 5. O retrato — a fonte de verdade — está desactualizado, e isso já produziu dívida falsa

`supabase/PRODUCTION_SNAPSHOT.json` na `main` foi capturado a **2026-10-06T08:39Z** e descreve
**189 tabelas**. A produção tem **206**. Oito dias e 17 tabelas de atraso.

A consequência é concreta. `tests/security/espera-migracao.ts` na `main` lista três objectos
como «escritos e por aplicar»:

- `subjects.catalog_subject_code` — **existe na produção**
- `programs.catalog_course_code` — **existe na produção**
- `merge_school_subjects` — **existe na produção**

Todos aplicados a 10/10 e 12/10. O próprio ficheiro avisa: «uma lista que ninguém esvazia deixa
de ser espera e passa a ser dívida silenciosa» — e é o que aconteceu, porque o teste que obriga
a lista a encolher compara contra o retrato, e o retrato não foi recapturado. O mecanismo
desenhado para impedir dívida silenciosa está, ele mesmo, a produzi-la.

---

## 6. O trabalho não fecha: 19 PRs, 799 commits fora da `main`

| Estado    | PRs | Exemplos                                                |
| --------- | --- | ------------------------------------------------------- |
| Rascunho  | 13  | #108 BBB, #116/#119 Mobile V4, #128 Finanças, #130 IA  |
| Aberto    | 6   | #129 migrações, #121 Auditoria 14, #96 Auditoria 13     |

Cerca de **90 mil linhas** de adições à espera. Casos que importam:

- **A auditoria 14** (PRs #118 e #121, 10/10) — núcleo da matrícula, Pessoas, Perfil, Horários,
  Salas, e uma série de correcções de lógica escolar que se lêem como graves: «uma só regra de
  arredondamento (ecrã e pauta davam médias diferentes)», «facturas em atraso contadas sem
  corte», «a dívida da lista conta a multa por atraso», «desconto estimado de uma falta com o
  salário em vigor na data». Nada disto está publicado.
- **O PR #96** — o relatório da auditoria 13 — está aberto há oito dias e **em conflito**. É a
  branch da árvore local, o que explica os 115 commits de atraso: o trabalho de 07/10 e 08/10
  (as 30 SPECs, os contratos de publicação) nunca foi integrado e vive numa árvore suja.
- **O PR #87** (bolsas, lista de espera, turnos) está aberto desde 05/10 com as migrações já
  aplicadas na produção desde então e as tabelas a zero.

O padrão é consistente: o trabalho é feito, é aplicado à base, e pára antes de chegar à `main`.

---

## 7. Uso real — o primeiro sinal verdadeiro, e só um

A auditoria 13 mediu «uma escola, dois alunos, uma nota, quatro facturas». Hoje:

- **48 escolas, 47 activas, 47 subdomínios.** As **42 de 09/09** continuam lá, uma por aluno.
  A limpeza foi decidida a 06/10 e não foi executada.
- **Colegio Adventista - Huambo: 42 alunos.** Dois de 03/08 e **40 importados a 2026-10-08**.
  Isto é novo e é o primeiro uso a sério do sistema: a importação funcionou com volume real.
- **Mas o ciclo académico continua intocado:** 1 nota em `siga_assessment_scores`, **0** em
  `attendance_records`. Importaram-se 40 alunos e não se lançou uma presença nem uma nota.
- **O chat é a única coisa com uso espontâneo:** 12 conversas, 24 membros, 34 mensagens.

Os 85 alunos da produção são 42 reais + 42 restos de E2E + 1. Qualquer número agregado tirado
desta base continua a medir, sobretudo, testes.

---

## 8. O que melhorou de facto desde 06/10

Em contrapeso ao resto, e porque três registos anteriores ficaram desactualizados:

- **A app desktop saiu.** A auditoria 13 escreveu «0 releases, 0 tags `v*`». Hoje há **4
  releases** (v1.1.0 de 06/10 a v1.2.2 de 10/10), com Windows (`.exe`), macOS (`.dmg`
  universal), Linux (`.deb`, `.rpm`, `.AppImage`) e `SHA256SUMS.txt`.
  **Mas não há caminho de actualização:** `createUpdaterArtifacts: false` no
  `src-tauri/tauri.conf.json` e **0 ficheiros `.sig`** nas quatro releases. Cada versão nova é
  uma reinstalação à mão. Os ficheiros estão também duplicados em dois esquemas de nome (dois
  instaladores Windows de 220 MB por release).
- **O CI tem runners.** A paragem por facturação acabou; os runs de 13/10 correm em minutos.
- **O E2E ao vivo passou** a 12/10 (e a 05/10 e 29/09) — três verdes seguidos depois de três
  vermelhos em Setembro.
- **O acesso de gestão ao Supabase foi restaurado** — o MCP responde, o que as auditorias 11 a
  13 tiveram de contornar com o PostgREST.
- **Os 5 hostnames respondem**, `m.portal-siga.com` incluído.
- **O 503 do PayFlow está resolvido** e confirmado por fora.

---

## 9. A leitura crítica

Três coisas, por ordem de importância.

**1. O gargalo mudou de sítio.** Nas auditorias 11 a 13, o problema era a produção: migrações
por aplicar, acessos revogados, publicação que nunca publicava. Isso está, no essencial,
resolvido — aplica-se SQL, publica-se automaticamente, o CI corre. O gargalo agora é **a
integração**: 799 commits e 19 PRs param antes da `main`, e a base recebe migrações que o código
publicado não acompanha. Inverteu-se a relação: antes o código estava à frente da base; agora a
base está à frente do código.

**2. Está a construir-se largura em vez de profundidade.** Na última semana entrou um catálogo
educacional global, um cliente Flutter, um adaptador BBB, um assistente de IA (PR #130) e um
app móvel V4 — e nenhum dos sete fluxos escolares centrais ganhou uma única linha de uso. A
escola real importou 40 alunos a 08/10 e parou: não lançou presenças nem notas. Esse é o sinal
que importa, e não está a ser seguido. Da sexta app em diante, cada uma nova aumenta a
superfície a manter sem aumentar o que funciona ponta a ponta.

**3. Os portões já não dizem a verdade.** O CI está vermelho há quatro dias por desempenho e
isso não impede publicar; a publicação está vermelha há dois dias por formatação e isso não
impediu empurrar para a `main` sem PR; a lista de «espera de migração» descreve três objectos
que já existem; o retrato que serve de fonte de verdade está oito dias atrasado. Cada um
destes, isolado, é pequeno. Juntos tiram ao sistema a capacidade de dizer onde está — que era,
precisamente, o que as auditorias 11 a 13 construíram.

---

## 10. Por decidir — tudo do dono

Por ordem de custo crescente:

1. ~~`prettier --write` nos 6 ficheiros de `mobile-flutter/backend/`~~ — **feito** (§12).
2. ~~Fundir o PR #129~~ — **integrado** (§12). As duas de 04/10 não precisam de ficheiro: o
   efeito já está no repositório (§4).
3. ~~Recapturar o retrato e esvaziar a `espera-migracao.ts`~~ — **veio no PR #129** (§12).
4. **Decidir o Lighthouse:** se 0.90 é o mínimo, corrigir o desempenho; se não é, baixar o
   limiar. Deixá-lo vermelho é a pior das três opções.
5. **Limpar os 42 restos de E2E** — simulação feita e confirmada (§13); falta correr o script.
6. **Decidir a auditoria 14** (PRs #118/#121): as correcções de arredondamento de médias e de
   contagem de dívida são de lógica escolar e estão fora da produção.
7. **Chaves de assinatura da app desktop** — sem elas não há actualização automática.
8. **Travar o empurrão directo para a `main`** — uma regra de protecção no ramo resolvia o §2.
9. Pendentes de antes, sem novidade: rodar a `service_role` e o PAT, projecto de staging, DMARC,
   o que o PayFlow é.

---

## 11. A regra que sai desta

**Uma migração aplicada sem o ficheiro na `main` é uma funcionalidade que a produção carrega e o
produto não tem.** Já tínhamos a regra de não aplicar sem o ficheiro no repositório; o que esta
auditoria mostra é a outra metade — aplicar e deixar o código em rascunho produz o mesmo
desalinhamento pelo lado inverso, e é mais difícil de ver, porque tudo está verde: a migração
está no histórico, o PR está aberto, a tabela existe. Só a contagem de linhas a zero o revela.

**Corolário prático:** a pergunta a fazer a cada funcionalidade nova não é «está aplicada?» mas
«quantas linhas tem na produção?».

---

## 12. Corrigido nesta sessão

Branch `fix/auditoria-15-2026-10-14`, a partir de `df78e817`. **Nada escrito na produção, nada
publicado.**

| O quê                                     | Como                                            |
| ----------------------------------------- | ----------------------------------------------- |
| Lint que bloqueava a publicação           | `prettier --write` nos 6 ficheiros do §2        |
| 4 migrações órfãs                         | merge do PR #129                                |
| Retrato desactualizado (189 → 206)        | merge do PR #129 (capturado 12/10, confere hoje)|
| `espera-migracao.ts` com 3 entradas falsas| merge do PR #129 — lista vazia                  |
| `src/integrations/supabase/types.ts`      | merge do PR #129 — regenerado                   |

Portões corridos localmente depois das correcções:

| Portão          | Resultado                                        |
| --------------- | ------------------------------------------------ |
| `tsc --noEmit`  | **0 erros**                                      |
| `eslint .`      | **0 erros**, 47 avisos (igual a `36d0b51b`)      |
| `vitest run`    | **3 438 passam**, 19 ignorados (509 ficheiros)   |

A suite correu **sem credenciais** (só `.env.example` na worktree, 0 variáveis `SUPABASE` no
ambiente), por isso não escreveu na produção.

**Por fazer, e porquê:** o Lighthouse (§10.4) precisa de uma decisão sobre o limiar antes de
valer trabalho; a limpeza dos restos de E2E (§10.5) apaga dados da produção; os PRs da auditoria
14 (§10.6), as chaves de assinatura (§10.7), a protecção do ramo (§10.8) e a rotação de segredos
(§10.9) são do dono.

---

## 13. Simulação da limpeza dos restos de E2E (2026-10-14)

Reproduzida em **leitura apenas** contra a produção, com o critério exacto de
`scripts/siga/e2e-cleanup-stale.mjs` — slug `^(e2e|web|mat|gw)-[a-z0-9]+$` **e**
`contact_email` em `@siga-plus.test`:

| Alvo                          | Quantidade                       |
| ----------------------------- | -------------------------------- |
| Tenants                       | **42** (todos de 09/09)          |
| Prefixos de slug              | `gw`, `mat`                      |
| Escolas                       | 42                               |
| Alunos                        | 42                               |
| `tenant_domains`              | 42                               |
| Contas `@siga-plus.test`      | 44                               |
| Notas (`siga_assessment_scores`) | **0**                         |

O que **fica**: 6 escolas, 43 alunos (42 do Huambo + 1 de 08/09), 22 contas reais e a única
nota real. **O Colegio Adventista - Huambo não está no alvo** — verificado por nome contra o
conjunto a apagar (0 correspondências).

Executar com o script, que é o caminho sancionado: tem as guardas (recusa slug fora do padrão e
e-mail fora do domínio de teste), apaga as dependências pela ordem das chaves estrangeiras e
remove as contas pela API de auth, o que SQL cru não faz.

```
npm run siga:e2e-cleanup-stale -- --dry-run   # confirma a lista
npm run siga:e2e-cleanup-stale                # apaga
```

Precisa da `SUPABASE_SERVICE_ROLE_KEY` no ambiente. **Essa chave continua por rodar desde a
exposição de 04/10** (§10.9) — rodá-la antes é a ordem certa, e depois actualizar o segredo do
ambiente `production`, ou a publicação deixa de passar.
