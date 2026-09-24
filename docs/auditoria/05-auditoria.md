# Auditoria SIGA Plus — 5. Gestão académica e pedagógica

**Data:** 2026-09-24 · **Âmbito:** apenas a área 5 · **Código não alterado.**

Retrato de produção: `supabase/PRODUCTION_SNAPSHOT.json` capturado em 2026-09-24T11:14:55Z
(commit `573cb2f`) — 162 tabelas, 233 funções, 296 políticas, 173 triggers.

Testes da área: `tests/academic/` (14 ficheiros) e `tests/pedagogica/` (3).
**142 testes, todos a passar.** Nenhum dos achados abaixo é coberto por eles.

---

## Nota de leitura: existem dois modelos de avaliação vivos

Antes das oito verificações, é preciso separá-los, porque quase todos os achados dependem
de qual deles se está a olhar:

| | **Modelo MAC/NPP/NPT** | **Modelo SIGA** |
|---|---|---|
| Tabelas | `gradebooks` → `grade_items` → `grade_scores` | `siga_assessment_items` → `siga_assessment_scores` |
| Escrita | `sga-grades.ts` → `sga-grades-legacy.ts` | Centro de Avaliação, planos de aula |
| Caminho | server function + `loadSgaAdminClient()` (service_role) | idem |
| Serve | pautas, histórico, médias trimestrais | avaliações contínuas, dashboard, exportações |

Não são um antigo e um novo: **os dois têm dados reais e os dois são lidos por ecrãs
diferentes.** O primeiro está bem defendido; o segundo tem o buraco descrito em 5.3.

---

## 5.1 Configuração de avaliações, pesos e fórmulas por nível de ensino

**Parcialmente implementado — a tabela de configuração existe e é ignorada.**

`assessment_rule_sets` foi aplicada a produção em `b2bfdd6` (resolveu o beco sem saída
documentado em `sga-grades-legacy.ts:145-155`, em que uma escola nova não conseguia abrir
o primeiro diário). Tem oito colunas de regra pedagógica:

`continuous_weight`, `exam_weight`, `passing_value`, `maximum_absence_percentage`,
`rounding_method`, `grade_change_requires_approval`, `lock_after_publication`, `formula`.

**Achado (P1): nenhuma das oito é lida em lado nenhum da aplicação.** Verificado por
`grep` em todo o `src/`, excluindo os tipos gerados: zero ocorrências. O único uso da
tabela é ir buscar um `id` para satisfazer o `NOT NULL` de `gradebooks.rule_set_id`
(`sga-grades-legacy.ts:110-140`) — e, se não encontrar regra activa, **pede emprestado o
`rule_set_id` de outro diário qualquer da escola** (`:129-137`).

Consequências concretas, cada uma correspondente a uma coluna morta:

- os pesos contínuo/exame não entram no cálculo — a fórmula está fixa no código;
- `passing_value` não é usado: a nota de passagem é a constante `angolaGradeScale.passing = 10`
  (`src/lib/angola-academic.ts:105`), igual para todas as escolas e todos os níveis;
- `rounding_method` não é usado — e o arredondamento é onde está o defeito de 5.4;
- `grade_change_requires_approval` e `lock_after_publication` não são consultados por
  nenhum caminho de escrita. São exactamente as duas regras que a verificação 5.3 e a 5.7
  exigem, e estão declaradas na base sem ninguém as ler.

O ciclo de ensino *é* derivado correctamente (`inferTeachingCycle`), e as regras de
promoção variam por ciclo (`decidePromotionStatus`) — mas essas regras estão no código,
não na configuração da escola.

## 5.2 Validação de 0 a 20, arredondamentos e regras pedagógicas

**Implementado na aplicação; sem rede na base.**

A validação 0–20 existe e está no sítio certo do caminho da aplicação:
`upsertTermGradeInputSchema` (`schemas.ts:112-119`) e a versão em lote (`:122-136`) usam
`z.number().min(0).max(20)`. `normalizeScore` rejeita fora de `[0, 20]`.

**Achado (P2): `grade_scores.score` não tem `CHECK` na base.** O DDL capturado da produção
(`20260924005132_capture_undeclared_production_tables.sql:425-445`) declara
`score numeric(6,2) NOT NULL` e quatro `CHECK` — sobre `note`, `pending_*` e `status`.
Nenhum sobre `score`. Aceita `-500` ou `9999`. `grade_items` tem
`max_score > 0` e `weight` entre 0 e 100, mas nada liga `score` a `max_score`.

Como a escrita passa por service_role, o zod é a única barreira. Vale enquanto todo o
tráfego passar por aquela server function — e o importador de pautas escreve por outro
caminho (ver 5.8).

**Achado (P3): `ensureComponentItems` insere sempre com um `kind` inválido primeiro.**
`sga-grades-legacy.ts:203` usa `kind: "score"`, que não está em
`grade_items_kind_check` (`continuous`, `assignment`, `test`, `term_exam`, `exam`,
`resit`, `recovery`). A primeira inserção falha **sempre**, e o `retry` com `continuous`
(`:213-227`) é que faz o trabalho. O comentário diz "alguns SGA usam kind diferente" — não
é variação entre instalações, é uma violação determinística de restrição. Funciona, mas
duplica as idas à base na criação de cada diário e esconde erros reais no mesmo `catch`.

## 5.3 Permissões para lançamento, alteração, aprovação e reclamação de notas

**Modelo MAC/NPP/NPT: bem defendido, em duas camadas.**

Na aplicação: `requireSgaWriter` limita a `Administrador`, `Secretaria`, `Professor`
(`server-legacy.ts:927`) — mas só verifica o papel na escola, **não** que o docente é o
titular daquela turma/disciplina. Se fosse só isto, qualquer professor lançaria notas a
qualquer turma.

Não é só isto, e é aqui que o desenho está certo: como o backend usa service_role e
service_role ignora RLS, a defesa foi posta em **triggers**, que RLS não contorna.
`private.enforce_teacher_grade_score_scope` (migração `20260903025000`) valida o actor real
gravado em `recorded_by`/`updated_by` e exige que o docente seja o titular activo do
`class_subject` do diário e que a matrícula seja da mesma turma. Confirmado presente em
produção, a par de `enforce_teacher_class_subject_scope` em `class_subjects`.

As políticas RLS de `grade_scores` são igualmente estritas — as seis exigem
`can_manage_students()` ou titularidade do docente, e o par `grade_scores_insert`/`_update`
exige ainda `private.has_permission(school_id, 'assessment.grades.manage')` **e
`private.is_aal2()`** (segundo factor). Não há política de `DELETE`: notas não se apagam.

**Achado (P0): no modelo SIGA, a mesma protecção existe e está anulada por uma política
que ficou para trás.**

`siga_assessment_items` e `siga_assessment_scores` têm, cada uma, **duas políticas
`FOR ALL` permissivas** para `authenticated`:

| Política | Expressão |
|---|---|
| `Manage assigned assessment scores` | `current_user_can_manage_assessment_score(school_id, item_id, enrollment_id)` |
| `Manage assessment scores in own school` | `is_school_member(school_id)` |

O PostgreSQL combina políticas permissivas com **OR**. A segunda torna a primeira
irrelevante.

E `is_school_member` (`APPLY_ENROLLMENT_AND_PREMIUM.sql:61-74`) é apenas:

```sql
SELECT EXISTS (SELECT 1 FROM public.school_memberships
               WHERE school_id = p_school_id AND user_id = (SELECT auth.uid())
                 AND status = 'active');
```

Qualquer papel serve — e `Aluno` e `Encarregado` são papéis de aplicação com membership
(`access-policy.ts:51`; `attendance-server.ts:637` decide por `membership.appRole === "Aluno"`).

O trigger não tapa este caminho. `enforce_teacher_assessment_score_scope`
(`20260903041000:201-262`) só sabe recusar **professores** fora do seu âmbito: se o actor
não é gestor académico e **não é docente**, faz `RETURN NEW` (`:224-229`) quando o pedido
não vem de service_role. Foi desenhado para restringir docentes, não para autorizar.

Resultado, no caminho directo (JWT do utilizador → PostgREST, sem passar pela aplicação):
**um aluno ou um encarregado autenticado pode inserir, alterar e apagar avaliações e notas
de qualquer aluno da sua escola.** O `GRANT` existe (`APPLY_ENROLLMENT_AND_PREMIUM.sql:436`),
a política deixa passar, o trigger deixa passar.

**Como isto aconteceu, e porque vai repetir-se:** `HARDEN_TEACHER_ASSESSMENT_SCOPE.sql:157`
e `:177` fazem exactamente a correcção certa — `DROP POLICY` da política ampla antes de
criar a estrita, com o comentário "Substitui a policy ampla criada por
HARDEN_TENANT_ISOLATION.sql". Mas `APPLY_ENROLLMENT_AND_PREMIUM.sql:439-444` **recria-a**,
e é idempotente. Nenhum dos dois é uma migração numerada: são ficheiros soltos em
`supabase/`, corridos à mão. Correr o APPLY depois do HARDEN reabre o buraco em silêncio —
e foi o que a produção ficou a ter.

O mesmo par de políticas afecta, com a mesma mecânica, `siga_attendance_records`,
`siga_attendance_sessions` e `siga_attendance_justifications` (ver 5.6) — nestas, sem
sequer uma política estrita ao lado.

**Reclamação de notas:** `grade_scores` tem `pending_score`, `pending_reason`,
`pending_requested_by`, `pending_requested_at`, com `CHECK` de consistência entre os quatro.
O desenho está lá. **Nenhum código da aplicação escreve nestas colunas** — a funcionalidade
de reclamação existe no esquema e não na aplicação.

## 5.4 Cálculo de médias, classificações, aproveitamento e reprovação

**Implementado, com fonte única — e com uma contradição no documento impresso.**

A fórmula não está duplicada, ao contrário do que os três ficheiros sugerem à primeira
vista: `lib/angola-academic.ts` é a origem, `assessment-engine.ts` **reexporta**, e
`pautas/assessment.ts` delega no motor acrescentando só a exigência de não mostrar médias
incompletas. É a organização correcta e está documentada nos três sítios.

**Achado (P1): a média impressa e o estado impresso podem contradizer-se.**

`buildClassAcademicSummaries` (`assessment-engine.ts:171-177`) arredonda `overallMfd` a uma
casa **para exibição**, mas `evaluateStudentPromotion` (`:130-136`) decide sobre a média
**por arredondar**. Os dois valores saem no mesmo objecto e são impressos lado a lado.

Executado contra o código real (Primário, duas disciplinas com MFD 9,9 e 10,0):

```
MFDs=[9.9, 10] | media_impressa=10 | estado_impresso=NÃO TRANSITA
```

A pauta diz **"Média 10,0 — NÃO TRANSITA"**. A média verdadeira é 9,95, por isso o *estado*
está certo à luz da regra; o que está errado é imprimir ao lado um número que a contradiz.
Acontece em toda a faixa `[9,95 ; 10,0[` e não é raro numa turma inteira.

Os dois consumidores são precisamente os que mais pesam: `PautasWorkspaceModule.tsx:210`
(pautas) e `server-legacy.ts:1855-1873` → `routes/alunos/$studentId.tsx:583` (histórico do
aluno).

É a mesma ferida da coluna `rounding_method` morta em 5.1: não há política de
arredondamento única, logo cada sítio arredonda como calha.

**Regras de promoção** (`decidePromotionStatus`) estão implementadas por ciclo — Primário
(≥10), I Ciclo (≥10, tolera 2 deficientes), II Ciclo (≥10 e zero negativas, senão
`ADMITIDO A EXAME` se ≥9), Técnico (PAP/estágio ≥10). **Não verificado contra o
Decreto 424/25** — é matéria de conformidade legal, não de código, e deve ser confirmada
por quem responde pela escola.

**Achado (P3): ramo morto em `calculateTrimesterAverage`.** O segundo ramo
(`lib/angola-academic.ts:142-144`), que calcularia `(MAC+NPP+NPT)/3`, exige
`normNpt !== null` — condição que o primeiro ramo já consumiu. Nunca executa. A intenção é
deliberada e está no docblock (`:126-128`: a NPP não entra no cálculo), mas o ramo deixado
lá sugere o contrário a quem leia o ficheiro à procura da fórmula.

## 5.5 Mini-pautas, pautas trimestrais e finais

**Implementado na apresentação; o ciclo de vida oficial não é usado.**

As vistas existem e a separação recente está certa: `MiniPautaView`, `TrimesterPautaView`,
`FinalPautaView`, `ExamPautaView`, e `buildOfficialPautaSummaries` (`official-pauta.ts`),
que projecta a grelha viva no documento rigoroso — só mostra MT com MACT e NPT presentes,
só emite MFD com todos os períodos, e marca `isComplete` para não decidir resultado com
períodos por fechar. É a distinção correcta entre grelha de lançamento e documento oficial.

**Achado (P1): a base tem o ciclo de vida documental completo e a aplicação não lhe toca.**

Existem em produção, com wrapper público:

| Função | Para quê |
|---|---|
| `build_grade_sheet(escola, turma, período, tipo)` | construir a pauta |
| `transition_grade_sheet(escola, pauta, estado, **razão**)` | submeter / homologar / publicar / fechar |
| `issue_report_cards(escola, pauta)` | emitir boletins |
| `reopen_gradebook(escola, diário, **razão**)` | reabertura registada |

E `grade_sheets` tem `submitted_at`, `homologated_at`, `published_at`, `closed_at`,
`reopen_reason`, mais o trigger `notify_grade_sheet`. `report_cards` e `grade_sheet_rows`
completam o modelo.

**Chamadas no código da aplicação: zero — para as quatro.** E zero escritas em
`grade_sheets`, `grade_sheet_rows` e `report_cards` (`grep` por `from("…")` em todo o `src/`).

As pautas são montadas em memória a cada visita e impressas. Não há documento persistido,
não há número de pauta, não há homologação, não há boletim emitido, e não há registo de
quem publicou o quê e quando.

## 5.6 Presenças, faltas justificadas e injustificadas, assiduidade e conduta

**Presenças e justificações: bem modeladas.** `siga_attendance_sessions` (sessão por aula,
com `timetable_slot_id`, `period_number`, `status`), `siga_attendance_records` (estado por
aluno), `siga_attendance_justifications` (com `file_id`, `status`, `reviewed_by`,
`review_notes` — circuito de revisão completo) e `siga_attendance_audits` (`old_status`,
`new_status`, `reason`, `changed_by`, `device_info`). `reopen_attendance(…, razão)` existe
na base — e, como as outras, **não é chamada pela aplicação**.

**Assiduidade:** `enrollments.attendance_rate` é mantida — `attendance-server.ts:110`
actualiza-a. Esta é a peça derivada que funciona.

**Achado (P2): não há registo de conduta.** Procurado por `conduta`, `comportamento`,
`behaviour`, `discipline` em `src/` e no esquema: nada. Os dois únicos acertos de texto são
falsos positivos (`CashFlowForecastChart.tsx:60`, `media-frame.tsx:61`). A verificação 5.6
pede "assiduidade **e conduta**" — metade está feita.

**Achado (P0, mesma raiz de 5.3):** as três tabelas de presenças têm uma política `FOR ALL`
com `is_school_member(school_id)` e **nenhuma política estrita ao lado**. Um aluno
autenticado pode alterar as suas próprias faltas, e as de qualquer colega da escola.

## 5.7 Encerramento, bloqueio, aprovação e reabertura auditada

**Implementado por um mecanismo mais fraco do que o que a base oferece.**

O que existe: `setTermLock` (`school/server.ts:496-520`) escreve `closedTerms` em
`school_settings`, domínio `pedagogy`. Está defendido dos dois lados — exige
`Administrador` na aplicação, e o trigger `enforce_pedagogy_term_lock_scope`
(`20260903050000`) confirma-o na base mesmo sob service_role, recusando actor nulo e
exigindo `owner|admin|administrador`. É auditado por `audit_settings_change`.

As limitações, face ao que a verificação pede:

- **É um interruptor por escola, não por pauta ou por turma.** Fechar o 2.º trimestre fecha-o
  para todas as turmas ao mesmo tempo.
- **A reabertura não pede razão.** `setTermLockInputSchema` (`school/schemas.ts:119-122`) é
  `{ term, closed }` e nada mais. `audit_row_change` regista *que* o valor mudou, não
  *porquê*. As funções da base que existem para isto — `reopen_gradebook(…, reason)` e
  `transition_grade_sheet(…, reason)` — recebem a razão e não são chamadas (5.5).
- **Não há homologação/aprovação.** O estado `homologated_at` de `grade_sheets` nunca é
  escrito.

**Achado (P2): `assertTermOpen` falha em aberto.** `server-legacy.ts:50-56`:

```ts
const { data } = await db.from("school_settings")…   // o erro é descartado
const pedagogy = pedagogySettingsSchema.safeParse(data?.value ?? {}).data;
if (pedagogy?.closedTerms.includes(term)) throw …
```

Se a consulta falhar por qualquer motivo, `data` vem indefinido, `pedagogy` fica indefinido
e a função **retorna sem lançar** — o trimestre fechado aceita notas. Numa verificação de
bloqueio, o incumprimento tem de ser fechar, não abrir.

## 5.8 Histórico académico imutável ou versionado após aprovação

**Não implementado. É a verificação mais fraca da área.**

**Achado (P0/P1): `student_academic_history` não tem protecção nenhuma.**

- Política única: `FOR ALL TO authenticated USING is_school_member(school_id)
  WITH CHECK is_school_member(school_id)` (`20260924005201_student_history_schema.sql:59-61`).
  Qualquer membro da escola — aluno incluído — insere, altera e apaga o histórico de
  qualquer aluno.
- **Nenhum trigger.** Confirmado no retrato: `student_academic_history` não aparece na lista
  de 173 triggers. Sem `audit_row_change`, ao contrário de `grade_scores`, `gradebooks`,
  `grade_sheets`, `report_cards` e `enrollments`, que o têm.
- Sem imutabilidade, sem versionamento, sem noção de "aprovado".

A verificação pede "imutável **ou** versionado após aprovação". Não é nem uma coisa nem
outra: é uma tabela livremente editável sem rasto.

**Achado (P1): `enrollments.final_average` nunca é calculada a partir das notas do sistema.**

A coluna é **lida** e mostrada em cinco sítios:

| Onde | Como aparece ao utilizador |
|---|---|
| `routes/alunos/$studentId.tsx:1363` | cartão "Média final" da ficha do aluno, com indicador ≥10 (`:1368`) |
| `auth/server.ts:184` | `average_grade` do **portal do aluno/encarregado** |
| `students/server.ts:602` | ficha detalhada |
| `intelligence/students/student-relations-adapter.ts:84` | perfil analítico |
| `import/export-engine.ts:907` | exportações |

E é **escrita num único sítio**: `import/importers/pautas-importer.ts:141`, o importador de
Excel. Nenhuma função ou trigger da base a mantém (zero ocorrências em
`20260908210000_capture_all_db_functions.sql`).

Ou seja: um professor lança MAC/NPP/NPT, as pautas passam a calcular MT e MFD
correctamente — e o cartão da ficha do aluno e o portal do encarregado continuam a mostrar
`—`, ou pior, um valor importado de um Excel antigo que já não corresponde às notas
lançadas. É o caso exacto que a auditoria integrada procura: **uma operação num módulo que
não produz o resultado esperado nos outros.**

A mesma ficha mostra, mais acima, o histórico por ano calculado ao vivo
(`$studentId.tsx:583`, `year.overallMfd`). Os dois números convivem no mesmo ecrã e podem
discordar.

---

## Classificação

| Sev. | Achado | Evidência |
|---|---|---|
| **P0** | Aluno/encarregado autenticado escreve avaliações e notas de qualquer aluno da escola: política `is_school_member` permissiva anula a estrita (OR) em `siga_assessment_items`/`_scores`; trigger deixa passar não-docentes | retrato: 2 políticas `FOR ALL`; `20260903041000:224-229` |
| **P0** | O mesmo em presenças — `siga_attendance_records`/`_sessions`/`_justifications`, sem política estrita sequer | retrato de políticas |
| **P0/P1** | `student_academic_history` editável e apagável por qualquer membro, sem trigger de auditoria | `20260924005201:59-61`; ausente dos 173 triggers |
| **P1** | `HARDEN_TEACHER_ASSESSMENT_SCOPE.sql` é desfeito por `APPLY_ENROLLMENT_AND_PREMIUM.sql`, ambos corridos à mão, nenhum é migração | `:157`,`:177` vs `:439-444` |
| **P1** | `enrollments.final_average` só é escrita pelo importador de Excel; lida no portal e na ficha do aluno | 5 leitores, 1 escritor |
| **P1** | Pauta imprime média e estado que se contradizem em `[9,95 ; 10,0[` | executado: `media=10 / NÃO TRANSITA` |
| **P1** | Ciclo de vida oficial da pauta (`build_grade_sheet`, `transition_grade_sheet`, `issue_report_cards`, `reopen_gradebook`) nunca chamado | 0 chamadas |
| **P1** | As 8 colunas de regra de `assessment_rule_sets` não são lidas por ninguém | `grep` em `src/` |
| **P2** | `assertTermOpen` descarta o erro e falha em aberto | `server-legacy.ts:50-56` |
| **P2** | `grade_scores.score` sem `CHECK` de intervalo na base | DDL capturado |
| **P2** | Sem registo de conduta | esquema e `src/` |
| **P3** | Ramo `(MAC+NPP+NPT)/3` inalcançável | `angola-academic.ts:142-144` |
| **P3** | `ensureComponentItems` insere sempre com `kind` inválido e depende do retry | `sga-grades-legacy.ts:203` vs `grade_items_kind_check` |
| **P3** | `grade_items` e `gradebooks` sem trigger de âmbito do docente, ao contrário de `grade_scores` | retrato de triggers |

### O que está bem, e vale dizer

O modelo MAC/NPP/NPT está **genuinamente bem defendido**: políticas estritas dos dois
lados, `has_permission` + `is_aal2()` (segundo factor) na escrita, ausência deliberada de
`DELETE`, e triggers que validam o actor real precisamente porque o backend usa
service_role. A separação entre grelha viva e documento oficial (`official-pauta.ts`) está
certa. A fórmula tem fonte única de verdade, sem duplicação. O bloqueio de trimestre está
defendido na base, não só na aplicação. As presenças têm um circuito de justificação e
auditoria completo.

O padrão dos achados não é desleixo — é **trabalho de endurecimento correcto que não chegou
inteiro à produção**, ou que chegou e foi desfeito por um script idempotente corrido depois.

### Ordem sugerida

1. Largar as políticas amplas das cinco tabelas `siga_*` e do `student_academic_history`, e
   tornar o HARDEN uma migração numerada — senão o próximo APPLY repõe o buraco.
2. `assertTermOpen` a falhar fechado.
3. Decidir quem calcula `final_average` e passar a calculá-la.
4. Uma política de arredondamento só, alimentada por `rounding_method`.
5. Ligar o ciclo de vida da pauta que já está na base, ou assumir que não se usa e remover
   as colunas que prometem o que não existe.

Os pontos 1 e 2 são de segurança e de bloqueio; os restantes são de integridade e podem
seguir a cadência normal.
