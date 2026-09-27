# Motor Académico e de Avaliação: estado face à especificação

Levantamento de 2026-09-28. Compara a especificação "Motor Académico e de
Avaliação parametrizável" (22 pontos e a regra de ouro "cada informação nasce no
módulo certo") com o código e com a base de produção.

A arquitectura dos 16 módulos do ano lectivo já está no código, em
`src/features/academic/academic-architecture.ts` (fonte do separador
"Estrutura académica" em Pedagógica). Cada módulo diz onde a informação nasce,
quem a altera, a entidade, o uso, a validação e o destino. Nenhum está marcado
como "por activar". O trabalho que falta não é criar módulos: é fechar os
sítios onde a implementação ainda contraria a regra de ouro.

A produção tem dados de teste: 90 escolas, 36 matrículas, 9 notas e nenhum
modelo de avaliação. É a altura de corrigir antes de as escolas entrarem.

Legenda: ✅ existe · 🟡 parcial · ❌ falta

| # | Ponto | Estado | Onde está | Lacuna |
|---|---|---|---|---|
| 1 | Escola | ✅ | `schools` (nome, NIF, contactos, província, município, comuna, bairro, GPS, endereço) e tipo de instituição em Definições | Desde 2026-09-29 (migração `20260929210000`, aplicada) província, município, comuna, bairro e coordenadas editam-se em Definições → Escola. Continua por limpar: `schools.passing_grade` e `evaluation_periods` duplicam regras que devem viver só no modelo |
| 2 | Ano lectivo | ✅ | `academic_years` (rascunho → activo → fechado → arquivado) | — |
| 3 | Modelo académico | 🟡 | `assessment_rule_sets` + `grading_scales` (versionados; separador "Modelos de avaliação") | **Nenhuma escola em produção tem modelo activo**, e sem ele não se abrem diários nem se geram pautas. Pedagógica passou a avisar, com atalho para o Administrador. Não há campo de periodicidade no modelo |
| 4 | Currículo | ✅ | `curricula`, `curriculum_areas`, `curriculum_subjects` (carga horária, obrigatória) | Conteúdos, objectivos e critérios por disciplina não têm lugar próprio |
| 5 | Competências | ✅ | `siga_competencies`, `siga_assessment_item_competencies` | Sem dados em produção |
| 6 | Atribuição do professor | ✅ | `class_subjects.teacher_id`, `teacher_subjects` | — |
| 7 | Matrícula | ✅ | `enrollments` via `enroll_student` (2FA, lotação, número). Em lote passou a usar o mesmo caminho (2026-09-28) | — |
| 8 | Avaliação | 🟡 | `siga_assessment_items` (provas: tipo, componente, data) | Tabela diferente da que chega à pauta (ver 13) |
| 9 | Cadastro da avaliação | ✅ | `CreateAssessmentDialog` | Desde 2026-09-29 (migração `20260929190000`, aplicada) guarda também a hora, a duração (5–600 min) e a finalidade (diagnóstica, formativa, sumativa); opcionais para as provas antigas |
| 10 | Pesos | 🟡 | `assessment_rule_sets.continuous_weight`, `exam_weight`, `formula` | Pesos por tipo de prova (MAC/Teste/Prova) não são configuráveis; a média do componente é média simples |
| 11 | Lançamento de notas | ✅ | `grade_scores` (componentes) e `siga_assessment_scores` (provas) | — |
| 12 | Histórico da nota | ✅ | `grade_score_history`, pedidos de alteração com aprovação (`grade-change-requests.ts`, `pending_score`), `audit_logs` | — |
| 13 | Motor de cálculo | 🟡 | Pauta oficial: `private.build_grade_sheet` (usa `passing_value` e `formula` do modelo). **Corrigido a 2026-09-29:** MAC, NPP e NPT eram todos `continuous` e a pauta daria metade da média (14 → 7); agora MAC `continuous`, NPP `informative`, NPT `term_exam` (migração `20260929090000`, aplicada), com teste de paridade entre o motor e a fórmula do ecrã | Desde 2026-09-29 o ecrã de notas usa os pesos, o arredondamento e a escala do modelo activo (`getActivePassingValue` → `engine`), tal como a pauta oficial, e o servidor e a pré-pauta validam a escala do modelo. Continuam fixos no código: o recurso `(original + recurso) / 2`, os períodos 1–3 e o cálculo de omissão quando a escola não tem modelo |
| 14 | Boletim | 🟡 | `report_cards`, `private.issue_report_cards` | Sem uso em produção; comportamento e observações por professor não estão no boletim |
| 15 | Pré-pauta | ✅ | `buildPrePautaChecks`: regra activa, alunos, professores, diários submetidos, notas em falta, escala, alterações pendentes, e agora pauta desactualizada | **Passou a ser obrigatória no servidor (2026-09-28)**. Antes só informava. A escala verificada é a do modelo (2026-09-29) |
| 16 | Validação da coordenação | ✅ | `transition_grade_sheet`: submetida → em revisão → homologada, "Devolver para correcção" | — |
| 17 | Pauta oficial | ✅ | Publicada/fechada bloqueia; rectificação exige motivo (`rectified`) | Não há versões guardadas da pauta: rectificar refaz as linhas |
| 18 | Recuperação | 🟡 | Dentro de Exames (`siga_exam_registrations`) | A especificação pede módulo próprio; a regra de recurso no ecrã está fixa no código (ver 13) |
| 19 | Exames | ✅ | `siga_exam_sessions`, `siga_exam_registrations` (época, sala, júri, nota) | Exames externos/nacionais e centros não estão modelados |
| 20 | Resultado final | ✅ | `final-results.ts` → `student_academic_history` | — |
| 21 | Histórico académico | ✅ | `student_academic_history` | Desde 2026-09-29 (migração `20260929170000`, aplicada) cada registo vindo da pauta guarda a matrícula, a pauta anual homologada, a nota final por disciplina (com exames) e as faltas; rectificar deixa o valor anterior na auditoria; não se apaga directamente. Os registos importados de outras escolas ficam sem ligação |
| 22 | Auditoria | 🟡 | `audit_logs` (quem, quando, o quê, metadados). Definições → Segurança → Auditoria tem, desde 2026-09-29, a vista "Académica" (notas, pautas, matrículas, modelo, exames), nome de quem agiu, motivo e campos alterados, sem o ruído automático das permissões | "Aprovado por" não é campo próprio; os registos automáticos não guardam o valor anterior (esse está em `grade_score_history`) |

## Prioridades

1. **Motor de cálculo único no servidor (13, 10, 18).** Tirar de
   `src/lib/angola-academic.ts` as regras normativas usadas no ecrã de notas.
   O servidor deve derivar MAC/NPP/NPT das provas ao gravar, com a fórmula, a
   escala e o arredondamento do modelo activo. O ecrã só mostra o que o servidor
   devolve. É o ponto que mais contraria a regra de ouro.
2. **Modelo académico obrigatório e guiado (3).** Criar o modelo por omissão ao
   criar a escola, ou levar o utilizador ao separador "Modelos de avaliação"
   quando falta. Hoje, sem modelo, a pauta falha no fim do percurso.
3. **Escala do modelo na pré-pauta (15).** Usar `grading_scales` em vez de
   0–20 fixo.
4. **Histórico académico ligado (21) e versões da pauta (17).**
5. **Navegação por etapas.** Pedagógica tem 12 separadores lado a lado.
   Agrupá-los pelas quatro etapas que `academic-architecture.ts` já define
   (Estrutura do ano → Turmas e pessoas → Avaliação → Resultado e registo), pela
   ordem dos módulos, sem acrescentar ecrãs.
6. ~~Campos em falta da escola e da avaliação~~ (feito a 2026-09-29).
   Falta a periodicidade no modelo.

Stack: a especificação fala em Next.js e Python. O SIGA é TanStack Start com
Supabase (Postgres), e a especificação aplica-se igual. As regras vivem em
tabelas de configuração e em funções da base (`private.*`), não no código da
aplicação.

## Opções do director no modelo (2026-09-29)

Em Pedagógica → Modelos de avaliação, o Administrador (com 2FA) escolhe, além
dos pesos, da aprovação e do arredondamento:

- **NPP:** "já incluída no MAC" (Decreto 424/25, omissão) ou "conta na parte
  contínua, com o MAC". O motor oficial conta a NPP pelo tipo do item
  (`informative` ou `continuous`, em `pautaComponentKinds`). Ao publicar, os
  diários ainda abertos passam para a opção nova; os fechados ficam como foram
  calculados.
- **Recurso:** média entre a nota anterior e a de recurso (omissão), a de
  recurso substitui, ou fica a maior.

As opções ficam em `assessment_rule_sets.formula.calculation`, com a migração
`20260929110000` (parâmetro opcional `calculation_options`, já aplicada). Os
testes de paridade cobrem os dois modos da NPP.
