# Auditoria SIGA Plus — 5. Gestão académica e pedagógica

**Data:** 2026-09-24 · **Âmbito:** apenas a área 5 · **Código não alterado.**

Evidência: `supabase/PRODUCTION_SNAPSHOT.json` recapturado hoje (162 tabelas, 296
políticas, 173 triggers) e consultas em leitura à produção ligada. Testes da área:
`tests/academic/` (15 ficheiros, 94 testes), `tests/pedagogica/` (3, 48 testes).

---

## O facto que atravessa a área: há dois sistemas de notas, ambos vivos

| | Modelo A | Modelo B |
|---|---|---|
| Tabelas | `gradebooks`, `grade_items`, `grade_scores`, `grade_sheets` | `siga_assessment_items`, `siga_assessment_scores` |
| Regras | `assessment_rule_sets` (pesos, arredondamento, nota de passagem) | fórmula do Decreto 424/25 fixa no código |
| Motor | RPCs em `private.*` | `src/lib/angola-academic.ts` |
| Quem escreve | lançamento do docente (`sga-grades.ts`), importação Excel | `server-legacy.ts` (`upsertAssessmentScores`) |
| Quem lê | `routes/pedagogica.tsx` | **painel** (`dashboard/server.ts:420`), **exportação** (`export-engine.ts:519`) |

**Achado (P1): o que se importa não aparece onde se procura.** `notas-importer.ts`
e `avaliacoes-importer.ts` escrevem em `grade_items`/`grade_scores` (modelo A). O
mapa de calor de desempenho do painel lê `siga_assessment_scores` e a exportação
do módulo "avaliações" lê `siga_assessment_items` — ambos modelo B. Importar mil
notas por Excel deixa o painel e a exportação exactamente como estavam. A
exportação e a importação do mesmo módulo não fecham o ciclo: o que sai não é o
que entrou.

## 5.1 Configuração de avaliações, pesos e fórmulas por nível de ensino

**Implementado no modelo A.** `assessment_rule_sets` tem `continuous_weight`,
`exam_weight`, `passing_value`, `rounding_method`, `maximum_absence_percentage`,
`grade_change_requires_approval`, `lock_after_publication` e `formula` (jsonb),
com `CHECK` a exigir que os pesos somem 100 e índice único de uma regra activa
por `(escola, código)`. `publish_assessment_rule_version` versiona e aposenta a
anterior. As funções da base consomem estes campos (`round_grade`,
`compute_subject_averages`, `close_gradebook`).

Em Setembro estas duas tabelas não existiam em produção e `gradebooks.rule_set_id`
é `NOT NULL` — nenhuma escola nova conseguia abrir o primeiro diário, logo não
conseguia lançar notas. **Resolvido:** o retrato de hoje confirma as duas tabelas
com RLS e política de leitura por `academic.structure.read`.

**Achado (P2): o modelo B ignora tudo isto.** `angolaGradeScale.passing` é `10`
fixo e a fórmula MAC/NPT está escrita no código. Uma escola que configure nota de
passagem 9,5 vê-a respeitada num sistema e ignorada no outro.

## 5.2 Validação de 0 a 20, arredondamentos e regras pedagógicas

**Implementado, com uma falha de desenho.** `normalizeScore` recusa fora de
`[0,20]` e arredonda a uma casa; `parsePautaScore` devolve `NaN` fora do
intervalo, que a interface apanha.

**Achado (P2): uma nota inválida é silenciosamente tratada como nota em falta.**
`normalizeScore` devolve `null` tanto para "ainda não lançada" como para "25".
`calculateTrimesterAverage` degrada de propósito para o componente disponível
(`if (normMac !== null) return normMac`), o que é correcto durante o lançamento.
Combinando os dois: um NPT gravado como 25 por engano faz a média trimestral
passar a ser a MAC sozinha — um número plausível, sem aviso nenhum.

Isto está mitigado no documento impresso, e de forma deliberada: o trabalho de
hoje em `pautas/official-pauta.ts` só exibe MT com MACT e NPT presentes e só
emite MFD com todos os períodos, marcando `isComplete`. A grelha viva continua a
degradar — o que falta é distinguir "em falta" de "inválida" na origem.

**Achado (P3): ramo morto.** O segundo `if` de `calculateTrimesterAverage` exige
MAC, NPP e NPT não nulos, mas o primeiro já apanha todos os casos com MAC e NPT.
A média de três componentes nunca corre. O comentário diz que a NPP não participa
— o código concorda, mas o ramo fica lá a sugerir o contrário.

## 5.3 Permissões para lançamento, alteração, aprovação e reclamação

**A intenção está toda lá, e está bem desenhada.** Fluxo de alteração com
aprovação (`grade_scores.pending_score`/`pending_reason`/`pending_requested_by` +
`review_grade_change`), reclamações (`create_grade_complaint`,
`respond_grade_complaint`, com prazo), actas de conselho
(`create_council_minutes`), e políticas endurecidas que exigem MFA
(`private.is_aal2()`), a permissão `assessment.grades.manage` e que o autor
declarado seja o utilizador real (`updated_by = auth.uid()`).

**Achado (P0): as políticas endurecidas são anuladas por políticas antigas que
ficaram na base.** Políticas `PERMISSIVE` do mesmo comando combinam-se com **OR**:
basta a mais permissiva. Em produção, hoje:

| Tabela | Política endurecida | Política antiga que a anula |
|---|---|---|
| `grade_scores` | `grade_scores_update` | `Academic update grade scores` |
| `grade_items` | `grade_items_update` | `Academic update grade items` |
| `gradebooks` | `gradebooks_update` | `Academic update gradebooks` |
| `siga_assessment_scores` | `Manage assigned assessment scores` | `Manage assessment scores in own school` |
| `siga_assessment_items` | `Manage assigned assessment items` | `Manage assessment items in own school` |

São 9 tabelas ao todo com escrita `PERMISSIVE` sobreposta — também `enrollments`,
`students`, `people` e `class_groups`. A consulta que o demonstra já existe no
repositório (`scripts/siga/audits/rls-permissive-overlap.readonly.sql`), escrita
esta madrugada; investiga cinco tabelas, e nenhuma delas é de notas.

A política antiga de `grade_scores` exige `is_school_member(school_id) AND
(can_manage_students() OR <é o docente da disciplina>)`. Não exige MFA, não exige
`assessment.grades.manage`, e **não exige `updated_by = auth.uid()`**.

**Achado agravante (P0): o trigger que devia apanhar isto confia numa coluna que
o cliente escreve, e falha aberto.** `private.enforce_teacher_grade_score_scope`
começa em `v_actor := COALESCE(NEW.updated_by, NEW.recorded_by)` — não em
`auth.uid()`. Se `v_actor` for nulo, ou se não for docente, o trigger devolve
`NEW` sem verificar nada (só levanta excepção quando o pedido é `service_role`).
O mesmo padrão em `enforce_teacher_assessment_score_scope`, sobre `recorded_by`.

As duas falhas compõem-se. A política endurecida existia precisamente para
amarrar `updated_by` ao utilizador real e dar sentido ao trigger; a política
antiga desfaz a amarra, e o trigger aceita o que lhe derem. **Um utilizador com
papel de secretaria (ou qualquer papel de `can_manage_students()`) pode alterar
qualquer nota da escola gravando `updated_by = NULL`: sem MFA, sem a permissão de
notas, e sem deixar autor.** O trigger de auditoria regista a alteração com actor
nulo — o registo fica, a responsabilidade não.

Hoje as 94 contas activas em produção são todas `owner`, o que esconde a parte de
separação de funções. A perda de MFA e de autoria é real já agora.

## 5.4 Médias, classificações, aproveitamento, recuperação e reprovação

**Implementado e com fonte única.** `src/lib/angola-academic.ts` é a origem da
matemática do Decreto 424/25, reexportada por `assessment-engine.ts` e partilhada
com as pautas — sem duplicação. `decidePromotionStatus` trata primário, I ciclo,
II ciclo (com `ADMITIDO A EXAME` acima de 9) e técnico com PAP. Coberto por
`tests/academic/assessment-engine.test.ts` e `angola-academic.test.ts`.

**Achado (P2): a média exibida e a média que decide não são a mesma.**
`buildClassAcademicSummaries` calcula `overallMfd` arredondado a uma casa para
mostrar, mas `evaluateStudentPromotion` decide sobre a média **não arredondada**.
Com 9,96, a pauta mostra `10.0` e a situação diz `NÃO TRANSITA`. É a linha que um
encarregado contesta.

## 5.5 Mini-pautas, pautas trimestrais e finais

**Implementado.** `build_grade_sheet` monta a pauta, `grade_sheets` tem o ciclo
completo (`submitted_at`, `homologated_at`, `published_at`, `closed_at`,
`reopen_reason`), `grade_sheet_rows` guarda médias contínua/exame/período,
percentagem de faltas, resultado e `subject_breakdown`. `issue_report_cards` emite
boletins. `transition_grade_sheet` faz as passagens de estado.

O trabalho de hoje separou a projecção oficial da grelha viva
(`official-pauta.ts`, `exam-pauta.ts`, `document-context.ts`), que é a distinção
certa: a grelha acompanha, o documento não inventa.

## 5.6 Presenças, faltas, assiduidade e conduta

**Implementado, e também em dois modelos.** `siga_attendance_sessions` /
`siga_attendance_records`, com justificações e `siga_attendance_audits`; e
`attendance_sessions` / `attendance_records` / `attendance_session_roster`.
`reopen_attendance` exige motivo. Assiduidade consolidada em
`enrollments.attendance_rate`. `maximum_absence_percentage` existe na regra e
`grade_sheet_rows.absence_percentage` também — **não verifiquei** se a
reprovação por faltas chega a ser aplicada.

## 5.7 Encerramento, bloqueio, aprovação e reabertura auditada

**Implementado com rigor — menos a parte auditada.** `submit_gradebook`,
`close_gradebook` e `reopen_gradebook` exigem `is_aal2()` e a permissão
respectiva; a reabertura exige motivo com pelo menos 5 caracteres e só aceita
diários em `submitted`/`closed`.

**Achado (P1): o motivo da reabertura é exigido e deitado fora.**
`private.reopen_gradebook` valida `reason`, devolve-o no `jsonb` de resposta e
nunca o grava: `gradebooks` não tem coluna para ele e a função não insere em
nenhuma tabela de auditoria. O trigger `audit_gradebooks` regista a mudança de
estado, mas não o porquê. `grade_sheets` tem `reopen_reason` — os diários não.
Pedir uma justificação e não a guardar é pior do que não a pedir: dá a
convicção de um registo que não existe.

## 5.8 Histórico académico imutável ou versionado

**Não implementado.** `student_academic_history` (`final_average`, `outcome`,
`academic_year_label`) tem uma única política: `FOR ALL` com
`is_school_member(school_id)`. Confirmei o corpo de `is_school_member` na
produção — verifica apenas que existe uma inscrição activa em
`school_memberships`, **sem qualquer verificação de papel**.

**Achado (P1):** qualquer membro activo da escola pode inserir, alterar ou apagar
qualquer linha do histórico académico. A tabela não tem trigger de auditoria
(ao contrário de `grade_scores`, `gradebooks` e `grade_sheets`, que têm
`audit_row_change`), não tem versionamento e não tem estado de homologação. É o
registo que sobrevive ao aluno, e é o menos protegido da área.

---

## Classificação

| Sev. | Achado | Evidência |
|---|---|---|
| **P0** | Políticas `PERMISSIVE` antigas anulam as endurecidas em 5 tabelas de notas: escrita sem MFA, sem `assessment.grades.manage` e sem `updated_by = auth.uid()` | `pg_policies` na produção, 2026-09-24 |
| **P0** | `enforce_teacher_grade_score_scope` tira o actor de `NEW.updated_by` e devolve `NEW` quando é nulo — falha aberto | `pg_get_functiondef`, produção |
| **P1** | Dois modelos de notas: importação escreve em A, painel e exportação leem B | `notas-importer.ts` vs `dashboard/server.ts:420`, `export-engine.ts:519` |
| **P1** | `reopen_gradebook` exige motivo e não o guarda em lado nenhum | corpo da função; `gradebooks` sem coluna |
| **P1** | `student_academic_history` alterável por qualquer membro, sem auditoria nem versão | política única + ausência de trigger |
| **P2** | Nota fora de `[0,20]` vira "em falta" e a média degrada sem aviso | `normalizeScore` + `calculateTrimesterAverage` |
| **P2** | Situação decidida na média não arredondada, exibida na arredondada | `buildClassAcademicSummaries` |
| **P2** | Modelo B ignora `assessment_rule_sets`: passagem fixa em 10 | `angolaGradeScale` |
| **P2** | 99 das 162 tabelas com `GRANT SELECT` a `anon`, incluindo `siga_assessment_scores` e `student_academic_history` | retrato de hoje |
| **P3** | Ramo inalcançável na média de três componentes | `calculateTrimesterAverage` |

Sobre o P2 do `anon`: **não há fuga activa.** Só 4 políticas abrangem `anon`
(`enrollment_applications`, `enrollment_forms`, `reserved_subdomains`,
`school_branding`) e as tabelas de notas não estão entre elas — o RLS trava a
leitura. O que falta é a segunda camada: a concessão está 95 tabelas mais larga
do que precisa, e qualquer tabela que perca o RLS ou ganhe uma política `USING
(true)` passa a porta aberta sem que nada mais a segure.

**A ordem que proponho:** os dois P0 primeiro, e juntos — corrigir só as políticas
deixa o trigger a confiar numa coluna do cliente, e corrigir só o trigger deixa a
escrita sem MFA. Depois o P1 do histórico académico, que é o dado que não se
recupera.
