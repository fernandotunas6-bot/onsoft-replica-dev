# Planos de aula

**Data:** 08/10/2026. **Estado:** implementação presente; aceitação integrada por concluir. As alterações específicas são distinguidas no documento de correcções.

## Objectivo e âmbito

Planos de aula; operar dentro da responsabilidade escolar/plataforma definida pela arquitectura, sem duplicar a fonte de verdade de outro módulo.

## Estado actual e comportamento pretendido

**Implementado:** os ficheiros, contratos e tabelas abaixo estão inventariados. A auditoria anterior e os testes locais identificam provas parciais. Não implica que todas as operações estejam completas.

**Proposto:** concluir em staging os critérios de persistência, recuperação e isolamento indicados nesta SPEC. **Por decidir:** regras da instituição não presentes na configuração/documentação e acessos externos indispensáveis.

## Perfis e permissões

Professor nas próprias turmas; Direcção/Administrador na supervisão autorizada. O cargo não substitui grant por módulo nem âmbito escolar. O servidor volta a autorizar cada pedido.

## Pré-condições e dependências

Sessão válida, vínculo activo e escola seleccionada autorizada; configurações do ano/turma/contrato quando usadas. Escrita sensível exige AAL2. Relações carregadas de outra escola são recusadas. Testes com escrita exigem ambiente isolado e destinos sintéticos.

## Fluxo principal e alternativas

Escolher turma/disciplina → preparar plano → guardar componentes → rever/publicar → relacionar aula e evidências.

Sem pré-requisito: explicar a falta e ligar à configuração responsável. Sem permissão: impedir o pedido. Erro recuperável: preservar o preenchimento, mostrar o motivo e permitir repetir sem duplicar. Conflito de versão/capacidade: reler o contexto e pedir revisão antes de gravar. Transporte externo indisponível: não anunciar entrega/sucesso fictícios.

## Estados e transições

- `class_groups.shift`: `afternoon`, `evening`, `full_day`, `morning`
- `class_groups.status`: `active`, `archived`, `closed`, `draft`
- `class_subjects.status`: `active`, `archived`, `inactive`
- `people.sex`: `female`, `male`, `other`, `undisclosed`
- `people.status`: `active`, `archived`, `inactive`
- `siga_assessment_items.purpose`: `diagnostic`, `formative`, `summative`
- `siga_lesson_plan_components.kind`: `avaliacao`, `prova`
- `siga_lesson_plans.status`: `draft`, `published`
- `subjects.status`: `active`, `archived`, `inactive`
- `teachers.employment_type`: `fixed_term`, `part_time`, `permanent`, `visiting`
- `teachers.highest_qualification`: `bachelor`, `doctorate`, `licentiate`, `master`, `other`, `secondary`
- `teachers.status`: `active`, `archived`, `inactive`, `leave`

Enum permitido não autoriza qualquer transição: as guardas de alteração, publicação, fecho e reabertura no servidor/SQL são normativas. Transições sem regra documentada ficam **por decidir**, não são habilitadas por esta SPEC.

## Campos, formatos e validações

Os schemas ligados são o contrato efectivo, incluindo refinamentos, campos opcionais/defaults e validação condicional. O inventário abaixo mostra as declarações encontradas; expressões multilinha e schemas derivados devem ser lidos na fonte, não inferidos apenas desta tabela.

| Campo | Declaração observada | Schema de origem |
| --- | --- | --- |
| `kind` | `lessonPlanComponentKindSchema,` | [schemas.ts](../../../src/features/lesson-plans/schemas.ts) |
| `name` | `z.string().trim().min(2, "Indique um nome").max(120),` | [schemas.ts](../../../src/features/lesson-plans/schemas.ts) |
| `plannedCount` | `z.number().int().min(1).max(20).default(1),` | [schemas.ts](../../../src/features/lesson-plans/schemas.ts) |
| `classGroupId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/lesson-plans/schemas.ts) |
| `subjectId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/lesson-plans/schemas.ts) |
| `term` | `termSchema,` | [schemas.ts](../../../src/features/lesson-plans/schemas.ts) |
| `title` | `z.string().trim().min(2, "Indique um título").max(180),` | [schemas.ts](../../../src/features/lesson-plans/schemas.ts) |
| `content` | `z.string().trim().max(20_000).optional(),` | [schemas.ts](../../../src/features/lesson-plans/schemas.ts) |
| `fileId` | `z.string().uuid().optional(),` | [schemas.ts](../../../src/features/lesson-plans/schemas.ts) |
| `fileName` | `z.string().trim().max(255).optional(),` | [schemas.ts](../../../src/features/lesson-plans/schemas.ts) |
| `status` | `z.enum(["draft", "published"]).default("draft"),` | [schemas.ts](../../../src/features/lesson-plans/schemas.ts) |
| `components` | `z.array(lessonPlanComponentInputSchema).max(20).default([]),` | [schemas.ts](../../../src/features/lesson-plans/schemas.ts) |
| `id` | `z.string().uuid(),` | [schemas.ts](../../../src/features/lesson-plans/schemas.ts) |
| `query` | `z.string().trim().optional(),` | [schemas.ts](../../../src/features/lesson-plans/schemas.ts) |
| `classGroupId` | `z.string().uuid().optional(),` | [schemas.ts](../../../src/features/lesson-plans/schemas.ts) |
| `subjectId` | `z.string().uuid().optional(),` | [schemas.ts](../../../src/features/lesson-plans/schemas.ts) |
| `term` | `termSchema.optional(),` | [schemas.ts](../../../src/features/lesson-plans/schemas.ts) |
| `limit` | `z.number().int().min(1).max(200).default(50),` | [schemas.ts](../../../src/features/lesson-plans/schemas.ts) |

## Regras de negócio e fonte

Associação ao horário/avaliação não elimina autorização; aprovação e estados seguem contratos existentes.

Fonte: implementação e skills canónicos, `DATABASE_RULES.md`, configuração efectiva da escola e SPEC temática quando ligada. Regras académicas/financeiras sem fundamento institucional confirmado ficam **por decidir**.

Especificação complementar: [SGA_ANGOLA_LESSON_PLANS_ASSESSMENTS_2026.md](../SGA_ANGOLA_LESSON_PLANS_ASSESSMENTS_2026.md).

## Modelo de dados e relações

Tabelas confirmadas no banco existente; este levantamento não propõe substituí-las:

| Tabela | Colunas existentes |
| --- | --- |
| `class_groups` | `id`, `school_id`, `academic_year_id`, `campus_id`, `grade_level_id`, `homeroom_teacher_id`, `code`, `name`, `shift`, `capacity`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `delegate_student_id`, `whatsapp_invite_url`, `whatsapp_group_name`, `room_id` |
| `class_subjects` | `id`, `school_id`, `class_group_id`, `subject_id`, `teacher_id`, `weekly_periods`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at` |
| `people` | `id`, `school_id`, `full_name`, `preferred_name`, `date_of_birth`, `sex`, `national_id`, `email`, `phone`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `photo_path`, `photo_url`, `deleted_at`, `user_id`, `province`, `municipality`, `commune`, `address` |
| `siga_assessment_items` | `id`, `school_id`, `class_group_id`, `subject_id`, `term`, `name`, `kind`, `component`, `assessed_on`, `max_score`, `counts_toward_pauta`, `allow_recovery`, `description`, `created_at`, `updated_at`, `created_by`, `updated_by`, `lesson_plan_component_id`, `starts_at`, `duration_minutes`, `purpose` |
| `siga_assessment_scores` | `id`, `school_id`, `item_id`, `enrollment_id`, `score`, `previous_score`, `status`, `recorded_by`, `updated_at` |
| `siga_lesson_plan_components` | `id`, `school_id`, `lesson_plan_id`, `kind`, `name`, `planned_count`, `sequence`, `created_at` |
| `siga_lesson_plans` | `id`, `school_id`, `class_group_id`, `subject_id`, `term`, `title`, `content`, `file_id`, `file_name`, `status`, `created_at`, `updated_at`, `created_by`, `updated_by` |
| `subjects` | `id`, `school_id`, `code`, `name`, `short_name`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `subject_type_id`, `curriculum_area_id`, `description`, `department`, `is_mandatory`, `is_practical`, `has_assessment`, `has_exam`, `has_attendance`, `has_pauta`, `annual_hours`, `default_lesson_duration`, `color`, `icon`, `display_order`, `deleted_at`, `version` |
| `teachers` | `id`, `school_id`, `person_id`, `employee_number`, `hired_on`, `employment_type`, `highest_qualification`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `user_id` |

Relações confirmadas:

- `class_groups` → `academic_years` (`class_groups_school_id_academic_year_id_fkey`)
- `class_groups` → `campuses` (`class_groups_school_id_campus_id_fkey`)
- `class_groups` → `grade_levels` (`class_groups_school_id_grade_level_id_fkey`)
- `class_groups` → `rooms` (`class_groups_school_id_room_id_fkey`)
- `class_groups` → `schools` (`class_groups_school_id_fkey`)
- `class_groups` → `students` (`class_groups_delegate_student_fk`)
- `class_groups` → `teachers` (`class_groups_school_id_homeroom_teacher_id_fkey`)
- `class_subjects` → `class_groups` (`class_subjects_school_id_class_group_id_fkey`)
- `class_subjects` → `schools` (`class_subjects_school_id_fkey`)
- `class_subjects` → `subjects` (`class_subjects_school_id_subject_id_fkey`)
- `class_subjects` → `teachers` (`class_subjects_school_id_teacher_id_fkey`)
- `people` → `schools` (`people_school_id_fkey`)
- `siga_assessment_items` → `schools` (`siga_assessment_items_school_id_fkey`)
- `siga_assessment_items` → `siga_lesson_plan_components` (`siga_assessment_items_lesson_plan_component_id_fkey`)
- `siga_assessment_scores` → `schools` (`siga_assessment_scores_school_id_fkey`)
- `siga_assessment_scores` → `siga_assessment_items` (`siga_assessment_scores_item_id_fkey`)
- `siga_lesson_plan_components` → `schools` (`siga_lesson_plan_components_school_id_fkey`)
- `siga_lesson_plan_components` → `siga_lesson_plans` (`siga_lesson_plan_components_lesson_plan_id_fkey`)
- `siga_lesson_plans` → `schools` (`siga_lesson_plans_school_id_fkey`)
- `siga_lesson_plans` → `siga_files` (`siga_lesson_plans_file_id_fkey`)
- `subjects` → `curriculum_areas` (`subjects_curriculum_area_id_fkey`)
- `subjects` → `schools` (`subjects_school_id_fkey`)
- `subjects` → `subject_types` (`subjects_subject_type_id_fkey`)
- `teachers` → `people` (`teachers_school_id_person_id_fkey`)
- `teachers` → `schools` (`teachers_school_id_fkey`)

## Contratos de API e erros

| Função | Método | Entrada | Fonte |
| --- | --- | --- | --- |
| `listLessonPlans` | GET | `listLessonPlansInputSchema` | [server.ts](../../../src/features/lesson-plans/server.ts) |
| `getLessonPlan` | GET | `getLessonPlanInputSchema` | [server.ts](../../../src/features/lesson-plans/server.ts) |
| `createLessonPlan` | POST | `createLessonPlanInputSchema` | [server.ts](../../../src/features/lesson-plans/server.ts) |
| `updateLessonPlan` | POST | `updateLessonPlanInputSchema` | [server.ts](../../../src/features/lesson-plans/server.ts) |
| `deleteLessonPlan` | POST | `deleteLessonPlanInputSchema` | [server.ts](../../../src/features/lesson-plans/server.ts) |

Erros esperados: sessão expirada, vínculo/grant insuficiente, AAL1 em escrita sensível, entrada inválida, recurso inexistente/fora do âmbito, conflito/duplicado, dependência indisponível e falha de persistência. Não expor SQL, tokens nem detalhes pessoais em mensagens/logs. A existência do endpoint não é prova de aceitação por perfil.

## Isolamento entre escolas

Verificar A/B em UI, ID enviado, servidor, RLS quando exposta, exportação, anexos, cache e realtime. `is_school_member` inclui alunos/encarregados: não serve sozinho para dados sensíveis/escrita. Cliente administrativo exige guardas e filtros de âmbito; troca de escola invalida o contexto anterior.

## Interface desktop e mobile

Preservar design system e terminologia; controlar largura de tabelas e altura de modais; campos com label e foco visível. Acção principal ligada ao estado real do pedido, sem duplo envio; confirmação de destruição; retorno com filtros/contexto. Viewport emulado não comprova toque, rotação, teclado virtual ou WebView nativo.

## Carregamento, vazio, sucesso, falha e acesso negado

Carregamento acompanha o pedido; vazio tem próxima acção adequada ao perfil. Sucesso exige resultado persistido/confirmado. Falha conserva dados e permite recuperação. Acesso negado não apresenta registos de outro âmbito nem aparenta lista vazia por erro silenciado.

## Auditoria e notificações

Actor/escola/acção/motivo/versão quando relevantes. Notificação é efeito do evento confirmado, com destinatário autorizado e repetição controlada. Destinos reais não são usados em ensaios. Logs não contêm senhas, códigos ou segredos.

## Critérios de aceitação

1. Perfil permitido conclui o fluxo principal; UI, pedido e banco concordam após refresh/login.
2. Entrada inválida e recurso de B enviado por A não produzem escrita nem exposição.
3. Pedido repetido e falha intermédia deixam resultado consistente; histórico e efeitos dependentes reconciliam.
4. Perfil sem grant e AAL1 em escrita sensível são recusados pelo servidor.
5. Documento/indicador/notificação corresponde a dados reais e ao filtro/contexto activo.
6. Desktop e mobile aplicáveis são utilizáveis por teclado; limitações reais ficam explicitadas.

## Testes, riscos e decisões pendentes

Testes existentes inventariados (a presença do ficheiro não afirma execução nesta evolução):

- [lesson-plan-scope.test.ts](../../../tests/lesson-plans/lesson-plan-scope.test.ts)
- [schemas.test.ts](../../../tests/lesson-plans/schemas.test.ts)

**Riscos/pendências:** jornada anual e A/B autenticado exigem staging; concorrência PostgreSQL, fornecedores, restauro, artefactos oficiais extensos e dispositivos reais não ficam certificados por mocks/PGlite. Consultar a matriz e o progresso para o resultado efectivamente executado.

## Fontes e navegação

- [planos-aula.tsx](../../../src/routes/planos-aula.tsx)
- [schemas.ts](../../../src/features/lesson-plans/schemas.ts)
- [server.ts](../../../src/features/lesson-plans/server.ts)

[Índice](../README.md) · [Contratos transversais](../CONTRATOS_TRANSVERSAIS.md)
