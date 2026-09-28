-- Componentes da pauta (MAC, NPP, NPT) com o tipo certo para o motor oficial.
--
-- `private.compute_subject_averages` (usado por `build_grade_sheet`) separa os
-- itens do diário por `kind`: contínuos (`continuous`, `assignment`, `test`,
-- `recovery`) e exame (`term_exam`, `exam`, `resit`), e faz
-- média = contínua × peso contínuo + exame × peso exame.
--
-- O servidor criava os três componentes com `kind = 'score'` (que a base
-- recusa) e caía sempre para `continuous`. Resultado: a NPT contava como
-- avaliação contínua, a parte de exame ficava vazia e, com o modelo do Decreto
-- 424/25 (50/50), a pauta oficial daria metade da média — 14 em tudo sairia 7.
-- Ainda não aconteceu porque nenhuma escola tem modelo nem gerou pautas.
--
-- A regra da aplicação (Decreto Executivo 424/25, `calculateTrimesterAverage`)
-- é MT = (MAC + NPT) ÷ 2, com a NPP já incluída no MAC. Fica:
--   MAC → continuous (peso 1)
--   NPP → informative: registada, mas fora das duas médias (a base não aceita
--         peso 0, e contá-la de novo seria contá-la duas vezes)
--   NPT → term_exam (peso 1)
--
-- Idempotente.

ALTER TABLE public.grade_items DROP CONSTRAINT IF EXISTS grade_items_kind_check;
ALTER TABLE public.grade_items ADD CONSTRAINT grade_items_kind_check CHECK (
  kind = ANY (ARRAY[
    'continuous', 'assignment', 'test', 'term_exam', 'exam', 'resit', 'recovery', 'informative'
  ])
);

UPDATE public.grade_items SET kind = 'continuous'
WHERE upper(code) = 'MAC' AND kind IS DISTINCT FROM 'continuous';
UPDATE public.grade_items SET kind = 'informative'
WHERE upper(code) = 'NPP' AND kind IS DISTINCT FROM 'informative';
UPDATE public.grade_items SET kind = 'term_exam'
WHERE upper(code) = 'NPT' AND kind IS DISTINCT FROM 'term_exam';
