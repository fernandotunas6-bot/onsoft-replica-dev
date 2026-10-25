# Ensino superior

**Data:** 08/10/2026. **Estado:** implementação presente; aceitação integrada por concluir. As alterações específicas são distinguidas no documento de correcções.

## Objectivo e âmbito

Ensino superior; operar dentro da responsabilidade escolar/plataforma definida pela arquitectura, sem duplicar a fonte de verdade de outro módulo.

## Estado actual e comportamento pretendido

**Implementado:** os ficheiros, contratos e tabelas abaixo estão inventariados. A auditoria anterior e os testes locais identificam provas parciais. Não implica que todas as operações estejam completas.

**Proposto:** concluir em staging os critérios de persistência, recuperação e isolamento indicados nesta SPEC. **Por decidir:** regras da instituição não presentes na configuração/documentação e acessos externos indispensáveis.

## Perfis e permissões

Secretaria, Administrador e Professor nas atribuições respectivas. O cargo não substitui grant por módulo nem âmbito escolar. O servidor volta a autorizar cada pedido.

## Pré-condições e dependências

Sessão válida, vínculo activo e escola seleccionada autorizada; configurações do ano/turma/contrato quando usadas. Escrita sensível exige AAL2. Relações carregadas de outra escola são recusadas. Testes com escrita exigem ambiente isolado e destinos sintéticos.

## Fluxo principal e alternativas

Configurar curso/unidade → inscrever estudante → atribuir docente → avaliar → aplicar estatuto válido → certificar.

Sem pré-requisito: explicar a falta e ligar à configuração responsável. Sem permissão: impedir o pedido. Erro recuperável: preservar o preenchimento, mostrar o motivo e permitir repetir sem duplicar. Conflito de versão/capacidade: reler o contexto e pedir revisão antes de gravar. Transporte externo indisponível: não anunciar entrega/sucesso fictícios.

## Estados e transições

- `academic_years.status`: `active`, `archived`, `closed`, `draft`
- `class_groups.shift`: `afternoon`, `evening`, `full_day`, `morning`
- `class_groups.status`: `active`, `archived`, `closed`, `draft`
- `class_subjects.status`: `active`, `archived`, `inactive`
- `course_unit_enrollments.season`: `especial`, `frequencia`, `melhoria`, `normal`, `recurso`
- `course_unit_enrollments.status`: `anulado`, `aprovado`, `dispensado`, `excluido_faltas`, `excluido_frequencia`, `inscrito`, `reprovado`
- `enrollment_applications.status`: `accepted`, `pending`, `rejected`
- `enrollments.status`: `active`, `cancelled`, `completed`, `pending`, `transferred`
- `fee_items.frequency`: `annual`, `monthly`, `once`, `term`
- `fee_items.kind`: `enrollment`, `other`, `service`, `tuition`
- `fee_plans.status`: `active`, `draft`, `retired`
- `finance_contracts.status`: `active`, `cancelled`
- `finance_invoices.status`: `cancelled`, `open`, `paid`, `partially_paid`
- `people.sex`: `female`, `male`, `other`, `undisclosed`
- `people.status`: `active`, `archived`, `inactive`
- `program_subjects.status`: `active`, `inactive`
- `programs.grading_profile`: `20_ects`, `components`, `components`, `frequencia_exame`, `gpa4`, `scale`, `scale`, `so_exame`
- `programs.kind`: `general`, `postgraduate`, `professional`, `technical`, `undergraduate`
- `schools.status`: `active`, `archived`, `setup`, `suspended`
- `students.status`: `active`, `applicant`, `cancelled`, `graduated`, `inactive`, `locked`, `suspended`, `transferred`, `withdrawn`
- `subjects.status`: `active`, `archived`, `inactive`
- `teachers.employment_type`: `fixed_term`, `part_time`, `permanent`, `visiting`
- `teachers.highest_qualification`: `bachelor`, `doctorate`, `licentiate`, `master`, `other`, `secondary`
- `teachers.status`: `active`, `archived`, `inactive`, `leave`

Enum permitido não autoriza qualquer transição: as guardas de alteração, publicação, fecho e reabertura no servidor/SQL são normativas. Transições sem regra documentada ficam **por decidir**, não são habilitadas por esta SPEC.

## Campos, formatos e validações

Os schemas ligados são o contrato efectivo, incluindo refinamentos, campos opcionais/defaults e validação condicional. O inventário abaixo mostra as declarações encontradas; expressões multilinha e schemas derivados devem ser lidos na fonte, não inferidos apenas desta tabela.

Sem declaração de campos Zod local inventariada; consultar o contrato de origem/importado nas fontes, antes de qualquer alteração.

## Regras de negócio e fonte

Inscrição por cadeira e estatutos têm vigência e escola; não inventar equivalências, créditos ou regras de certificação.

Fonte: implementação e skills canónicos, `DATABASE_RULES.md`, configuração efectiva da escola e SPEC temática quando ligada. Regras académicas/financeiras sem fundamento institucional confirmado ficam **por decidir**.

## Modelo de dados e relações

Tabelas confirmadas no banco existente; este levantamento não propõe substituí-las:

| Tabela                          | Colunas existentes                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `academic_levels`               | `id`, `school_id`, `code`, `name`, `sequence`, `is_active`, `created_at`                                                                                                                                                                                                                                                                                                                                |
| `academic_years`                | `id`, `school_id`, `name`, `starts_on`, `ends_on`, `status`, `created_at`, `created_by`, `updated_by`                                                                                                                                                                                                                                                                                                   |
| `audit_logs`                    | `id`, `school_id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `request_id`, `metadata`, `occurred_at`                                                                                                                                                                                                                                                                                       |
| `class_groups`                  | `id`, `school_id`, `academic_year_id`, `campus_id`, `grade_level_id`, `homeroom_teacher_id`, `code`, `name`, `shift`, `capacity`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `delegate_student_id`, `whatsapp_invite_url`, `whatsapp_group_name`, `room_id`                                                                                                                      |
| `class_subjects`                | `id`, `school_id`, `class_group_id`, `subject_id`, `teacher_id`, `weekly_periods`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`                                                                                                                                                                                                                                                     |
| `course_unit_enrollments`       | `id`, `school_id`, `student_id`, `academic_year_id`, `program_id`, `program_subject_id`, `semester`, `credits`, `attempt`, `status`, `final_grade`, `season`, `credits_earned`, `notes`, `created_at`, `updated_at`, `created_by`, `updated_by`, `class_group_id`                                                                                                                                       |
| `enrollment_applications`       | `id`, `school_id`, `form_id`, `full_name`, `payload`, `status`, `decided_at`, `decided_by`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version`, `student_id`                                                                                                                                                                                                               |
| `enrollments`                   | `id`, `school_id`, `academic_year_id`, `class_group_id`, `student_id`, `enrollment_number`, `enrolled_on`, `status`, `ended_on`, `end_reason`, `created_by`, `updated_by`, `created_at`, `updated_at`, `attendance_rate`, `final_average`                                                                                                                                                               |
| `fee_items`                     | `id`, `school_id`, `fee_plan_id`, `code`, `name`, `kind`, `amount`, `frequency`, `is_active`, `created_at`, `grade_level_id`                                                                                                                                                                                                                                                                            |
| `fee_plans`                     | `id`, `school_id`, `academic_year_id`, `code`, `name`, `currency_code`, `status`, `created_at`                                                                                                                                                                                                                                                                                                          |
| `finance_contracts`             | `id`, `school_id`, `enrollment_id`, `fee_plan_id`, `discount_percentage`, `status`, `created_by`, `created_at`                                                                                                                                                                                                                                                                                          |
| `finance_invoices`              | `id`, `school_id`, `contract_id`, `fee_item_id`, `invoice_number`, `competence_month`, `amount`, `discount_amount`, `due_date`, `status`, `issued_by`, `cancelled_at`, `cancelled_by`, `cancellation_reason`, `created_at`, `penalty_amount`                                                                                                                                                            |
| `grade_levels`                  | `id`, `school_id`, `program_id`, `code`, `name`, `sequence`, `is_active`, `created_at`                                                                                                                                                                                                                                                                                                                  |
| `people`                        | `id`, `school_id`, `full_name`, `preferred_name`, `date_of_birth`, `sex`, `national_id`, `email`, `phone`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `photo_path`, `photo_url`, `deleted_at`, `user_id`, `province`, `municipality`, `commune`, `address`                                                                                                                       |
| `program_subject_prerequisites` | `id`, `school_id`, `program_subject_id`, `required_program_subject_id`, `created_at`, `created_by`                                                                                                                                                                                                                                                                                                      |
| `program_subjects`              | `id`, `school_id`, `program_id`, `subject_id`, `semester`, `credits`, `status`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version`                                                                                                                                                                                                                                         |
| `programs`                      | `id`, `school_id`, `academic_level_id`, `code`, `name`, `kind`, `is_active`, `created_at`, `grading_profile`                                                                                                                                                                                                                                                                                            |
| `school_settings`               | `id`, `school_id`, `domain`, `version`, `value`, `changed_by`, `created_at`                                                                                                                                                                                                                                                                                                                             |
| `schools`                       | `id`, `public_code`, `name`, `timezone`, `currency_code`, `status`, `theme`, `created_at`, `updated_at`, `nif`, `email`, `phone`, `province`, `municipality`, `address`, `logo_path`, `official_authorization_reference`, `tenant_id`, `commercial_name`, `city`, `logo_url`, `director_name`, `evaluation_periods`, `passing_grade`, `preferences`, `commune`, `neighborhood`, `latitude`, `longitude` |
| `student_special_statuses`      | `id`, `school_id`, `student_id`, `kind`, `valid_from`, `valid_until`, `employer`, `evidence_note`, `granted_by`, `revoked_at`, `revoked_by`, `revoke_reason`, `created_at`, `updated_at`, `version`                                                                                                                                                                                                     |
| `students`                      | `id`, `school_id`, `person_id`, `student_number`, `admission_date`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`                                                                                                                                                                                                                                                      |
| `subjects`                      | `id`, `school_id`, `code`, `name`, `short_name`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `subject_type_id`, `curriculum_area_id`, `description`, `department`, `is_mandatory`, `is_practical`, `has_assessment`, `has_exam`, `has_attendance`, `has_pauta`, `annual_hours`, `default_lesson_duration`, `color`, `icon`, `display_order`, `deleted_at`, `version`              |
| `teachers`                      | `id`, `school_id`, `person_id`, `employee_number`, `hired_on`, `employment_type`, `highest_qualification`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `user_id`                                                                                                                                                                                                                  |
| `terms`                         | `id`, `school_id`, `academic_year_id`, `name`, `sequence`, `starts_on`, `ends_on`, `created_at`, `created_by`, `updated_by`                                                                                                                                                                                                                                                                             |

Relações confirmadas:

- `academic_levels` → `schools` (`academic_levels_school_id_fkey`)
- `academic_years` → `schools` (`academic_years_school_id_fkey`)
- `audit_logs` → `schools` (`audit_logs_school_id_fkey`)
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
- `course_unit_enrollments` → `academic_years` (`course_unit_enrollments_year_fkey`)
- `course_unit_enrollments` → `class_groups` (`course_unit_enrollments_class_group_fkey`)
- `course_unit_enrollments` → `program_subjects` (`course_unit_enrollments_program_subject_fkey`)
- `course_unit_enrollments` → `programs` (`course_unit_enrollments_program_fkey`)
- `course_unit_enrollments` → `schools` (`course_unit_enrollments_school_id_fkey`)
- `course_unit_enrollments` → `students` (`course_unit_enrollments_student_fkey`)
- `enrollment_applications` → `enrollment_forms` (`enrollment_applications_form_id_fkey`)
- `enrollment_applications` → `schools` (`enrollment_applications_school_id_fkey`)
- `enrollments` → `academic_years` (`enrollments_school_id_academic_year_id_fkey`)
- `enrollments` → `class_groups` (`enrollments_school_id_class_group_id_fkey`)
- `enrollments` → `schools` (`enrollments_school_id_fkey`)
- `enrollments` → `students` (`enrollments_school_id_student_id_fkey`)
- `fee_items` → `fee_plans` (`fee_items_school_id_fee_plan_id_fkey`)
- `fee_items` → `grade_levels` (`fee_items_grade_level_fkey`)
- `fee_items` → `schools` (`fee_items_school_id_fkey`)
- `fee_plans` → `academic_years` (`fee_plans_school_id_academic_year_id_fkey`)
- `fee_plans` → `schools` (`fee_plans_school_id_fkey`)
- `finance_contracts` → `enrollments` (`finance_contracts_school_id_enrollment_id_fkey`)
- `finance_contracts` → `fee_plans` (`finance_contracts_school_id_fee_plan_id_fkey`)
- `finance_contracts` → `schools` (`finance_contracts_school_id_fkey`)
- `finance_invoices` → `fee_items` (`finance_invoices_school_id_fee_item_id_fkey`)
- `finance_invoices` → `finance_contracts` (`finance_invoices_school_id_contract_id_fkey`)
- `finance_invoices` → `schools` (`finance_invoices_school_id_fkey`)
- `grade_levels` → `programs` (`grade_levels_school_id_program_id_fkey`)
- `grade_levels` → `schools` (`grade_levels_school_id_fkey`)
- `people` → `schools` (`people_school_id_fkey`)
- `program_subject_prerequisites` → `program_subjects` (`program_subject_prerequisites_required_fkey`)
- `program_subject_prerequisites` → `program_subjects` (`program_subject_prerequisites_subject_fkey`)
- `program_subject_prerequisites` → `schools` (`program_subject_prerequisites_school_id_fkey`)
- `program_subjects` → `programs` (`program_subjects_program_id_fkey`)
- `program_subjects` → `schools` (`program_subjects_school_id_fkey`)
- `program_subjects` → `subjects` (`program_subjects_subject_fkey`)
- `programs` → `academic_levels` (`programs_school_id_academic_level_id_fkey`)
- `programs` → `schools` (`programs_school_id_fkey`)
- `school_settings` → `schools` (`school_settings_school_id_fkey`)
- `schools` → `tenants` (`schools_tenant_id_fkey`)
- `student_special_statuses` → `schools` (`student_special_statuses_school_id_fkey`)
- `student_special_statuses` → `students` (`student_special_statuses_student_id_fkey`)
- `students` → `people` (`students_school_id_person_id_fkey`)
- `students` → `schools` (`students_school_id_fkey`)
- `subjects` → `curriculum_areas` (`subjects_curriculum_area_id_fkey`)
- `subjects` → `schools` (`subjects_school_id_fkey`)
- `subjects` → `subject_types` (`subjects_subject_type_id_fkey`)
- `teachers` → `people` (`teachers_school_id_person_id_fkey`)
- `teachers` → `schools` (`teachers_school_id_fkey`)
- `terms` → `academic_years` (`terms_school_id_academic_year_id_fkey`)
- `terms` → `schools` (`terms_school_id_fkey`)

## Contratos de API e erros

| Função                        | Método | Entrada                                       | Fonte                                                                  |
| ----------------------------- | ------ | --------------------------------------------- | ---------------------------------------------------------------------- |
| `listHigherEdPrograms`        | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `createHigherEdProgram`       | POST   | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `updateHigherEdProgram`       | POST   | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `listSchoolSubjectsForPlan`   | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `getProgramPlan`              | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `savePlanUnit`                | POST   | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `removePlanUnit`              | POST   | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `setUnitPrerequisites`        | POST   | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `listProgramStudents`         | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `getStudentHigherEd`          | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `getStudentTranscript`        | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `issueHigherEdCertificate`    | POST   | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `enrollStudentUnits`          | POST   | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `enrollCohort`                | POST   | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `cancelUnitEnrollment`        | POST   | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `listStalePendingEnrollments` | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `correctUnitResult`           | POST   | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `recordDoctoralDecision`      | POST   | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `grantUnitExemption`          | POST   | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `recordUnitResult`            | POST   | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `listLaunchableUnits`         | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `getUnitSheet`                | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `getMyHigherEd`               | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `getMyEnrollmentOffer`        | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `enrollMyUnits`               | POST   | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `getAccessRanking`            | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `setApplicationAccessScore`   | POST   | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `exportSisiesWorkbook`        | POST   | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `getHigherEdFees`             | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `saveHigherEdFees`            | POST   | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `getHigherEdRegulation`       | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `saveHigherEdRegulation`      | POST   | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/higher-ed/server.ts)                 |
| `getStudentSpecialStatuses`   | GET    | `Sem schema de entrada explícito neste bloco` | [student-status.ts](../../../src/features/higher-ed/student-status.ts) |
| `grantWorkerStudentStatus`    | POST   | `Sem schema de entrada explícito neste bloco` | [student-status.ts](../../../src/features/higher-ed/student-status.ts) |
| `revokeStudentSpecialStatus`  | POST   | `Sem schema de entrada explícito neste bloco` | [student-status.ts](../../../src/features/higher-ed/student-status.ts) |

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

- [access.test.ts](../../../tests/higher-ed/access.test.ts)
- [degrees.test.ts](../../../tests/higher-ed/degrees.test.ts)
- [engine.test.ts](../../../tests/higher-ed/engine.test.ts)
- [fees.test.ts](../../../tests/higher-ed/fees.test.ts)
- [program-shape.test.ts](../../../tests/higher-ed/program-shape.test.ts)
- [route-access.test.ts](../../../tests/higher-ed/route-access.test.ts)
- [server-guards.test.ts](../../../tests/higher-ed/server-guards.test.ts)
- [worker-student.test.ts](../../../tests/higher-ed/worker-student.test.ts)

**Riscos/pendências:** jornada anual e A/B autenticado exigem staging; concorrência PostgreSQL, fornecedores, restauro, artefactos oficiais extensos e dispositivos reais não ficam certificados por mocks/PGlite. Consultar a matriz e o progresso para o resultado efectivamente executado.

## Fontes e navegação

- [server.ts](../../../src/features/higher-ed/server.ts)

[Índice](../README.md) · [Contratos transversais](../CONTRATOS_TRANSVERSAIS.md)
