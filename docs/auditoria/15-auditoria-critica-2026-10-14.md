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
4. **Decidir o Lighthouse** — com o que o §14 mediu, a escolha é outra: os orçamentos
   explícitos do próprio ficheiro **passam todos**; só o `minScore` composto falha.
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

---

## 14. O Lighthouse, medido (2026-10-14)

O relatório tinha uma pergunta em aberto: corrigir o desempenho ou baixar o limiar. Tentou-se
corrigir. O que se aprendeu muda a pergunta.

### O que se fez

`/brands/siga-plus-icon.png` era o maior pedido do caminho crítico — 1254×1254, 670 KB, para um
render de no máximo 160 px. Reduzido a 384 px e **106 KB**. O peso da página caiu de
**3 164 KiB para 2 613 KiB**.

### O que mudou na pontuação

**Nada.** 0.84 → 0.83, dentro do ruído entre execuções:

| Métrica                  | Antes          | Depois         |
| ------------------------ | -------------- | -------------- |
| `categories.performance` | 0.84           | **0.83**       |
| First Contentful Paint   | 1,6 s (0.47)   | 1,7 s (0.43)   |
| Largest Contentful Paint | 1,9 s (0.66)   | 1,9 s (0.66)   |
| Speed Index              | 1,6 s (0.77)   | 1,7 s (0.74)   |
| Total Blocking Time      | 0 ms (1)       | 0 ms (1)       |
| Cumulative Layout Shift  | 0.003 (1)      | 0 (1)          |

**Cortar 550 KB não moveu uma única métrica.** O gargalo não são bytes: a medição corre contra
`127.0.0.1`, onde a transferência é praticamente grátis. Com resposta do servidor em 180 ms,
`bootup-time` de 0,3 s e trabalho de main thread de 0,8 s, o FCP de 1,7 s está no caminho de
render — CSS e tipo de letra bloqueantes, e o ecrã de entrada a depender da hidratação — não no
tamanho dos ficheiros. As «oportunidades» que o relatório lista (287 KB de JavaScript não usado,
imagens sobredimensionadas) têm **peso 0** na pontuação e enganam quem as tente primeiro.

### O que a medição revela sobre o próprio portão

Das asserções do `lighthouserc.json`, **a única que falha é o `categories:performance`**:

| Asserção                          | Orçamento   | Medido  | Estado  |
| --------------------------------- | ----------- | ------- | ------- |
| `first-contentful-paint`          | ≤ 2 000 ms  | 1 700   | passa   |
| `largest-contentful-paint`        | ≤ 2 500 ms  | 1 900   | passa   |
| `interactive`                     | ≤ 3 500 ms  | 1 900   | passa   |
| `total-blocking-time`             | ≤ 300 ms    | 0       | passa   |
| `max-potential-fid`               | ≤ 300 ms    | 20      | passa   |
| `cumulative-layout-shift`         | ≤ 0.1       | 0       | passa   |
| `categories:accessibility`        | ≥ 0.95      | —       | passa   |
| `categories:best-practices`       | ≥ 0.9       | —       | passa   |
| **`categories:performance`**      | **≥ 0.9**   | **0.83**| **falha** |

O ficheiro contradiz-se: declara 2 s de FCP aceitável e ao mesmo tempo exige uma pontuação que,
na curva do preset `desktop`, só se alcança com FCP perto de 1 s. Os orçamentos que a equipa
escolheu explicitamente estão todos cumpridos; o número composto é o que está fora de passo.

Por isso a decisão deixa de ser «corrigir ou baixar». É: **ou se assume que os orçamentos
explícitos são o contrato — e então o `minScore` composto sai ou desce —, ou se aceita que
chegar a 0.90 é trabalho no caminho de render** (menos JavaScript inicial no `/`, CSS crítico,
ecrã de entrada sem depender da hidratação), que é arquitectura e não uma correcção pontual.

A redução do ícone fica: 550 KB a menos continua a valer para quem abre o SIGA numa rede real,
mesmo que a medição em `localhost` não o mostre.

### Nota de método

Medir isto exigiu acrescentar `workflow_dispatch` ao CI: o Lighthouse só corria em push na
`main` e no agendamento, por isso **medir uma correcção de desempenho obrigava a publicar
primeiro** — e não há reprodução local, porque o `preview:prod` usa `workerd`, que recusa correr
em macOS abaixo de 13.5. Isto é parte da explicação de o portão ter ficado vermelho quatro dias
sem ninguém o tocar: era caro de observar. O disparo manual não arrasta o smoke E2E.

---

## 15. A limpeza dos restos de E2E não podia correr

Ao executar a simulação do §13 com o script, dois factos que a leitura não dava.

**São 43, não 42.** O padrão na `main` é `^(e2e|web|mat|gw)-[a-z0-9]+$` — um só segmento depois
do prefixo. O teste do WEB cria `e2e-web-<id>`, com **dois**, e esse escapava a cada execução.
Havia trabalho local **não commitado** que já tinha corrigido o padrão para
`^(e2e|web|mat|gw)(-[a-z0-9]+)+$`, com testes, e que nunca chegou à `main` — outra vez o padrão
do §9.1: feito, não integrado.

**E a execução real teria falhado em todos os 43.** Esse mesmo trabalho local acrescentou
`scripts/siga/e2e-safety.mjs` com `assertSafeE2ETarget()`, que **recusa a produção por desenho**
— correctíssimo para impedir os testes @live de escreverem lá — e passou a ser chamado dentro de
`cleanupE2ETenantBySlug`. Só que limpar restos **na** produção é o inverso de correr testes
**contra** a produção. O `--dry-run` passava porque salta a chamada (`continue` antes dela); a
execução real teria lançado «produção nunca é permitida» em cada tenant.

Resolvido com `assertSafeCleanupTarget()`: fora da produção delega nas regras estritas do E2E;
na produção exige um opt-in próprio, `SIGA_CLEANUP_ALLOW_PRODUCTION=1`, e nada mais afrouxa — o
opt-in da limpeza **não** abre a porta ao E2E com escrita, e continuam a valer a validação do
URL (sem credenciais embutidas, sem projectos misturados) e, em quem chama, o padrão do slug e o
domínio `@siga-plus.test`. Seis casos cobertos em `tests/security/e2e-safety.test.ts`.

As duas cópias do padrão ficaram alinhadas: `scripts/siga/e2e-cleanup-lib.mjs` e
`tests/e2e/helpers/sga-live-admin.ts` — são duas implementações paralelas de
`cleanupE2ETenantBySlug`, e `tests/saas/e2e-cleanup.test.ts` guarda-as uma contra a outra.

Para correr:

```
SIGA_CLEANUP_ALLOW_PRODUCTION=1 npm run siga:e2e-cleanup-stale
```

---

## 16. O trabalho dos outros agentes (07–14/10)

Sete dias, **357 commits** fora da `main` em **21 ramos** com actividade: 147 assinados `Claude`,
10 `Claude Code`, 196 `Valentino Canguele`, 6 `gpt-engineer-app[bot]`. Dezenove ramos têm PR
aberto. **Três não têm PR nenhum** — é aí que o trabalho morre.

### 16.1 O achado grave: uma falha de RLS corrigida e esquecida

`origin/ccr-1cb32a3f-afnzyp`, 12 commits, último a 07/10, **sem PR**. Nenhum dos seus ficheiros
de teste existe na `main`. Contém a migração
`20261007100000_teacher_scope_and_treasury_reads.sql`, que o próprio cabeçalho descreve como
auditoria 13, F-01 e F-08:

> F-01: um professor de uma só turma lia pela API **todos os alunos, pessoas, matrículas e
> encarregados da escola**, e — pelo ramo «qualquer membro» — todas as notas e presenças.
> F-08: a tesouraria lia notas e presenças.

**Confirmei na produção que a falha está aberta.** A política `students_read` é, em produção:

```
school_id IN (SELECT private.user_permission_school_ids('students.records.read'))
OR (membro AND (papel de pessoal OR private.teacher_students()))
```

O primeiro ramo basta, e `private.user_permission_school_ids` devolve a escola a **qualquer
membro activo cujo papel tenha a permissão**, sem âmbito de turma. E o papel `teacher` tem
`students.records.read`, `people.records.read` e `students.enrollments.read` **nas 47 escolas**.
O ramo estreito do professor nunca é alcançado. O mesmo padrão em `people_read` e
`enrollments_read`.

A exposição **hoje** é pequena por acidente: há 1 membro activo com papel `teacher`, 1 `student`,
3 `admin` e 51 `owner`. Mas o Huambo já tem 9 professores e 42 alunos em tabela — a falha abre no
momento em que esses professores receberem acesso, que é o uso normal do produto.

A correcção existe, tem ensaio PGlite que reproduz o defeito antes e confirma o âmbito depois, e
está há sete dias num ramo que ninguém abriu. **E não pode ser aplicada como está:** a versão
`20261007100000` colide com `20261007100000_web_site_content`, que já está na `main` e aplicada.
Precisa de ser renumerada, como aconteceu com a `enrollment_class_change`.

### 16.2 Os outros dois ramos órfãos

| Ramo                                    | Commits | O que traz                                                        |
| --------------------------------------- | ------- | ----------------------------------------------------------------- |
| `ccr-680ee371-6vebkz`                   | 6       | Numeração `1 + ano + 4 dígitos` para aluno, matrícula e documentos; entrar com o número de aluno; contexto de nível por área de formação. 1 749 linhas, com migração `20261012140000`. |
| `audit/timetable-enrollment-2026-10-10` | 1       | Guarda de conflito de sala e acesso às RPCs de horário: relatório, migração e teste estático. |

### 16.3 Nove migrações escritas e nunca aplicadas

A §4 mostrou a base à frente do código. O inverso também é verdade — em ramos não fundidos há
migrações que nunca chegaram à produção:

| Migração                                            | Ramo / PR                        |
| --------------------------------------------------- | -------------------------------- |
| `20261007100000_teacher_scope_and_treasury_reads`   | **órfão** (§16.1)                |
| `20261012140000_numbering_one_year_digits`          | **órfão**                        |
| `20261010100000_timetable_rooms_one_placeholder_rule` | #121 Auditoria 14              |
| `20261010110000_teacher_number_and_merge_people`    | #121 Auditoria 14                |
| `20261010130000_early_enrollment`                   | #121 Auditoria 14                |
| `20261013100000_audit_logs_document_code_index`     | #121 Auditoria 14                |
| `20261012100000_enrollment_cycle_guard`             | #118 Auditoria 14                |
| `20261012160000_siga_ai_module`                     | #130 SIGA AI                     |
| `20261006160000_waitlist_scholarship_shift_indexes` | #87                              |

E duas são **duplicados com outra versão** de migrações já aplicadas, que voltariam a correr se
alguém fundisse o ramo sem olhar: `20261010083336_mobile_v4_chat_commands` (#119) contra a
`20261010190715` aplicada, e `20261008170000_bbb_classroom_metadata` (#108) contra a
`20261008144147` aplicada.

### 16.4 A leitura

O §9.1 dizia que o gargalo passou da produção para a integração. Isto quantifica-o: **a mesma
semana produziu cinco apps de front-end em paralelo (Flutter em três ramos, Mobile V4 em dois) e
deixou uma falha de leitura de dados pessoais corrigida mas não integrada.** Não é falta de
trabalho nem de qualidade — o ensaio PGlite do F-01 é melhor do que a média do repositório. É
falta de alguém a fechar o ciclo.

**A regra prática:** um ramo sem PR é trabalho perdido, e ninguém dá por isso porque não há nada
vermelho. Vale mais varrer `git branch -r` por ramos sem PR uma vez por semana do que abrir o
sexto front-end.
