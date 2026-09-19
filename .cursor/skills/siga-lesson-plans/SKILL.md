---
name: siga-lesson-plans
description: >-
  Extends the SIGA Planos de Aula module (lesson plans + custom assessment/exam
  structure feeding the Centro de Avaliação). Use when changing
  src/features/lesson-plans, src/routes/planos-aula.tsx, or when the user mentions
  planos de aula, avaliações/provas por turma-disciplina-trimestre.
---

# SIGA · Planos de Aula

1. Ler `docs/agents/CONTINUE.md` (ciclo 34) e o skill `siga`.
2. Tabelas: `siga_lesson_plans` + `siga_lesson_plan_components`, em
   `supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql`. `siga_assessment_items` ganhou a
   coluna `lesson_plan_component_id` (nullable, `ON DELETE SET NULL`).
3. **Não duplicar o motor de notas.** Cada componente do plano (avaliação → MAC,
   prova → NPP) materializa-se em `siga_assessment_items`/`siga_assessment_scores`
   já existentes (Centro de Avaliação); a pauta oficial continua a ler daí via
   `componentAverage` + `upsertTermGradesBatch`.
4. `saveComponents` em `server.ts` nunca apaga um item de avaliação com nota já
   lançada — só desliga a referência (`lesson_plan_component_id = NULL`) ou remove
   os itens excedentes sem pontuação.
5. UI: `LessonPlanModal.tsx` usa `PremiumModal` (o padrão visual "premium" do
   projecto) + `PickFileButton` da biblioteca de arquivos para o anexo.
6. Estender `src/features/lesson-plans/schemas.ts` e `server.ts` — não reescrever
   outros módulos (nomeadamente `academic/sga-grades.ts`, que continua fixo a
   MAC/NPP/NPT na pauta oficial).
7. Teste Zod em `tests/lesson-plans/schemas.test.ts`.
8. Deep-link tutor: `/planos-aula?turma=&disciplina=` (Ciclo 56.7) — a página faz seed
   dos filtros `usePersistedListFilters` e pré-preenche o modal de novo plano.
