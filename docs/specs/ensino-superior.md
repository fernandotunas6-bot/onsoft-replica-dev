# Ensino Superior no SIGA: estado e plano

Levantamento de 2026-09-28. Objectivo: uma instituição de ensino superior a
funcionar no SIGA com as suas próprias regras, sem afectar as escolas do ensino
geral que já estão em produção.

Regra de ouro (a mesma do motor académico): cada regra vive em configuração da
instituição, não no código. O Decreto 424/25 é do ensino geral; no superior,
cada instituição tem o seu regulamento académico.

## O que já existe

| Peça | Onde | Estado |
|---|---|---|
| Nível "Ensino Superior" (1.º–5.º ano) e regime semestral | `src/lib/angola-academic.ts` (`superior`, 2 períodos) | ✅ |
| Cursos | `programs` (`kind`, `grading_profile`) | ✅ |
| Unidades curriculares por semestre, com créditos | `program_subjects` (`semester`, `credits`) | ✅ |
| Plano curricular editável | `ProgramCurriculumPanel` | ✅ |
| Escala e perfil de notas por curso | `grading-profiles.ts` (0–20, GPA 0–4) | ✅ |
| Média ponderada por créditos ECTS | `grading-profiles.ts` | ✅ |
| Épocas de exame (normal, recurso, especial) | `siga_exam_sessions`, `siga_exam_registrations` | ✅ (pensadas para o geral) |
| Pautas, versões e histórico académico ligado | `grade_sheets`, `grade_sheet_versions`, `student_academic_history` | ✅ (por turma) |

## O que falta

1. **Inscrição por unidade curricular.** Hoje o aluno matricula-se numa turma
   e herda as disciplinas da turma. No superior, inscreve-se em cada cadeira do
   semestre (incluindo cadeiras em atraso de anos anteriores).
   → tabela `course_unit_enrollments` (aluno, ano, semestre, unidade, estado,
   nota final, créditos obtidos).
2. **Precedências.** Uma cadeira só pode ser feita depois de outra ter sido
   aprovada (ex.: Análise II exige Análise I).
   → tabela `program_subject_prerequisites`; a inscrição recusa sem elas.
3. **Aprovação por cadeira e créditos acumulados.** Não há "transita/reprova"
   por ano: cada cadeira aprovada soma créditos.
4. **Progressão por créditos.** A passagem de ano depende dos créditos obtidos
   (ex.: 2.º ano com pelo menos 45 de 60 ECTS), configurável no regulamento.
5. **Regulamento académico da instituição.** Nota mínima (normalmente 10),
   dispensa de exame por média de frequência, pesos contínua/exame, número de
   épocas, limite de créditos por semestre e regra de progressão.
   → reutilizar `assessment_rule_sets` com um `formula.superior` próprio.
6. **Trabalho de fim de curso / monografia.** Orientador, tema, defesa, júri e
   nota.
7. **Documentos próprios.** Declaração de frequência, certificado de
   habilitações com créditos e média final ponderada, suplemento ao diploma.

## Ordem proposta

1. Regulamento académico da instituição (5), só configuração, sem mexer nos dados.
2. Inscrição por unidade curricular (1) e precedências (2): migração nova,
   aplicada primeiro numa cópia da base e comparada com a produção.
3. Aprovação e créditos (3) e progressão (4), a partir das pautas por cadeira.
4. Monografia (6) e documentos (7).
5. Uma instituição de demonstração criada pelo registo (WEB → Natureza
   "Ensino Superior"), com um curso completo de exemplo, para validar tudo.

As escolas do ensino geral não mudam: as regras novas só se aplicam a cursos
de nível `superior`.
