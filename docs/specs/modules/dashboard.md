# Painéis e portais por perfil

**Data:** 08/10/2026. **Estado:** implementação presente; aceitação integrada por concluir. As alterações específicas são distinguidas no documento de correcções.

## Objectivo e âmbito

Painéis e portais por perfil; operar dentro da responsabilidade escolar/plataforma definida pela arquitectura, sem duplicar a fonte de verdade de outro módulo.

## Estado actual e comportamento pretendido

**Implementado:** os ficheiros, contratos e tabelas abaixo estão inventariados. A auditoria anterior e os testes locais identificam provas parciais. Não implica que todas as operações estejam completas.

**Proposto:** concluir em staging os critérios de persistência, recuperação e isolamento indicados nesta SPEC. **Por decidir:** regras da instituição não presentes na configuração/documentação e acessos externos indispensáveis.

## Perfis e permissões

Direcção, Administrador, Secretaria, Tesouraria, Professor, Aluno e Encarregado. O cargo não substitui grant por módulo nem âmbito escolar. O servidor volta a autorizar cada pedido.

## Pré-condições e dependências

Sessão válida, vínculo activo e escola seleccionada autorizada; configurações do ano/turma/contrato quando usadas. Escrita sensível exige AAL2. Relações carregadas de outra escola são recusadas. Testes com escrita exigem ambiente isolado e destinos sintéticos.

## Fluxo principal e alternativas

Resolver perfil/escola → carregar indicadores reais → abrir tarefa → concluir no módulo responsável → actualizar resumo.

Sem pré-requisito: explicar a falta e ligar à configuração responsável. Sem permissão: impedir o pedido. Erro recuperável: preservar o preenchimento, mostrar o motivo e permitir repetir sem duplicar. Conflito de versão/capacidade: reler o contexto e pedir revisão antes de gravar. Transporte externo indisponível: não anunciar entrega/sucesso fictícios.

## Estados e transições

- `academic_schedules.status`: `approved`, `archived`, `draft`, `published`, `review`
- `academic_years.status`: `active`, `archived`, `closed`, `draft`
- `class_groups.shift`: `afternoon`, `evening`, `full_day`, `morning`
- `class_groups.status`: `active`, `archived`, `closed`, `draft`
- `class_subjects.status`: `active`, `archived`, `inactive`
- `document_requests.request_type`: `certificate`, `declaration`, `other`, `term`, `transfer`
- `document_requests.status`: `approved`, `cancelled`, `fulfilled`, `in_review`, `rejected`, `submitted`
- `enrollment_applications.status`: `accepted`, `pending`, `rejected`
- `enrollments.status`: `active`, `cancelled`, `completed`, `pending`, `transferred`
- `finance_invoices.status`: `cancelled`, `open`, `paid`, `partially_paid`
- `finance_receipts.payment_method`: `bank_transfer`, `card`, `cash`, `other`
- `finance_receipts.status`: `issued`, `reversed`
- `hr_teacher_lesson_occurrences.attendance_exception_status`: `approved`, `none`, `pending_review`, `proportional`, `rejected`, `within_grace`
- `hr_teacher_lesson_occurrences.evidence_method`: `attendance_import`, `manual`, `qr`, `system`
- `hr_teacher_lesson_occurrences.occurrence_kind`: `extra`, `scheduled`, `substitution`
- `hr_teacher_lesson_occurrences.review_decision`: `approved`, `rejected`
- `hr_teacher_lesson_occurrences.status`: `cancelled`, `confirmed`, `rejected`, `scheduled`
- `import_jobs.exchange_mode`: `human`, `siga_exchange`
- `import_jobs.source_format`: `csv`, `json`, `ods`, `xls`, `xlsx`
- `import_jobs.status`: `analyzing`, `cancelled`, `completed`, `failed`, `importing`, `mapping`, `ready`, `rolled_back`, `uploaded`, `validating`
- `people.sex`: `female`, `male`, `other`, `undisclosed`
- `people.status`: `active`, `archived`, `inactive`
- `programs.grading_profile`: `20_ects`, `components`, `components`, `frequencia_exame`, `gpa4`, `scale`, `scale`, `so_exame`
- `programs.kind`: `general`, `postgraduate`, `professional`, `technical`, `undergraduate`
- `rooms.status`: `active`, `inactive`
- `school_announcements.audience`: `all_guardians`, `alumni_all`, `alumni_events`, `alumni_fundraising`, `alumni_mentoring`, `alumni_opportunities`, `alumni_surveys`, `guardians_with_debt`, `students_finalists`, `students_secondary`, `teaching_staff`
- `school_announcements.channel`: `email`, `portal`, `sms`, `whatsapp`
- `school_announcements.status`: `draft`, `scheduled`, `sent`
- `siga_assessment_items.purpose`: `diagnostic`, `formative`, `summative`
- `siga_attendance_sessions.status`: `cancelled`, `completed`, `pending`
- `siga_competencies.status`: `active`, `archived`
- `students.status`: `active`, `applicant`, `cancelled`, `graduated`, `inactive`, `locked`, `suspended`, `transferred`, `withdrawn`
- `subjects.status`: `active`, `archived`, `inactive`
- `teachers.employment_type`: `fixed_term`, `part_time`, `permanent`, `visiting`
- `teachers.highest_qualification`: `bachelor`, `doctorate`, `licentiate`, `master`, `other`, `secondary`
- `teachers.status`: `active`, `archived`, `inactive`, `leave`
- `timetable_slots.status`: `active`, `archived`, `cancelled`

Enum permitido não autoriza qualquer transição: as guardas de alteração, publicação, fecho e reabertura no servidor/SQL são normativas. Transições sem regra documentada ficam **por decidir**, não são habilitadas por esta SPEC.

## Campos, formatos e validações

Os schemas ligados são o contrato efectivo, incluindo refinamentos, campos opcionais/defaults e validação condicional. O inventário abaixo mostra as declarações encontradas; expressões multilinha e schemas derivados devem ser lidos na fonte, não inferidos apenas desta tabela.

Sem declaração de campos Zod local inventariada; consultar o contrato de origem/importado nas fontes, antes de qualquer alteração.

## Regras de negócio e fonte

Indicadores derivam de registos autorizados; professor só vê atribuições, aluno só a própria ficha, encarregado só educandos vinculados.

Fonte: implementação e skills canónicos, `DATABASE_RULES.md`, configuração efectiva da escola e SPEC temática quando ligada. Regras académicas/financeiras sem fundamento institucional confirmado ficam **por decidir**.

## Modelo de dados e relações

Tabelas confirmadas no banco existente; este levantamento não propõe substituí-las:

| Tabela | Colunas existentes |
| --- | --- |
| `academic_schedules` | `id`, `school_id`, `academic_year_id`, `class_group_id`, `version_number`, `name`, `status`, `valid_from`, `valid_to`, `published_at`, `published_by`, `notes`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version` |
| `academic_years` | `id`, `school_id`, `name`, `starts_on`, `ends_on`, `status`, `created_at`, `created_by`, `updated_by` |
| `audit_logs` | `id`, `school_id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `request_id`, `metadata`, `occurred_at` |
| `class_groups` | `id`, `school_id`, `academic_year_id`, `campus_id`, `grade_level_id`, `homeroom_teacher_id`, `code`, `name`, `shift`, `capacity`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `delegate_student_id`, `whatsapp_invite_url`, `whatsapp_group_name`, `room_id` |
| `class_subjects` | `id`, `school_id`, `class_group_id`, `subject_id`, `teacher_id`, `weekly_periods`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at` |
| `document_requests` | `id`, `school_id`, `student_id`, `template_id`, `request_type`, `status`, `purpose`, `requested_by`, `reviewed_by`, `reviewed_at`, `review_note`, `created_at`, `updated_at` |
| `enrollment_applications` | `id`, `school_id`, `form_id`, `full_name`, `payload`, `status`, `decided_at`, `decided_by`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version`, `student_id` |
| `enrollment_forms` | `id`, `school_id`, `slug`, `title`, `subtitle`, `hero_text`, `accent_color`, `logo_url`, `is_open`, `visible_fields`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version` |
| `enrollments` | `id`, `school_id`, `academic_year_id`, `class_group_id`, `student_id`, `enrollment_number`, `enrolled_on`, `status`, `ended_on`, `end_reason`, `created_by`, `updated_by`, `created_at`, `updated_at`, `attendance_rate`, `final_average` |
| `finance_invoices` | `id`, `school_id`, `contract_id`, `fee_item_id`, `invoice_number`, `competence_month`, `amount`, `discount_amount`, `due_date`, `status`, `issued_by`, `cancelled_at`, `cancelled_by`, `cancellation_reason`, `created_at`, `penalty_amount` |
| `finance_receipts` | `id`, `school_id`, `invoice_id`, `receipt_number`, `amount`, `paid_on`, `payment_method`, `received_by`, `status`, `reversed_at`, `reversed_by`, `reversal_reason`, `created_at`, `external_id` |
| `grade_levels` | `id`, `school_id`, `program_id`, `code`, `name`, `sequence`, `is_active`, `created_at` |
| `grading_scales` | `id`, `school_id`, `code`, `name`, `version`, `minimum_value`, `maximum_value`, `passing_value`, `decimal_places`, `is_active`, `created_at` |
| `hr_teacher_lesson_occurrences` | `id`, `school_id`, `timetable_slot_id`, `class_subject_id`, `teacher_id`, `employment_id`, `contract_id`, `lesson_date`, `scheduled_starts_at`, `scheduled_ends_at`, `actual_started_at`, `actual_ended_at`, `quantity`, `status`, `evidence_method`, `evidence_ref`, `confirmed_at`, `confirmed_by`, `compensation_event_id`, `notes`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version`, `occurrence_kind`, `original_teacher_id`, `adjustment_reason`, `late_minutes`, `early_leave_minutes`, `attendance_percent`, `payable_quantity`, `attendance_exception_status`, `review_decision`, `review_reason`, `reviewed_by`, `reviewed_at` |
| `import_jobs` | `id`, `school_id`, `academic_year_id`, `user_id`, `module`, `file_name`, `file_path`, `status`, `total_rows`, `valid_rows`, `invalid_rows`, `duplicate_rows`, `inserted_rows`, `updated_rows`, `ignored_rows`, `job_metadata`, `started_at`, `completed_at`, `created_at`, `updated_at`, `schema_version`, `exchange_mode`, `source_format`, `dry_run`, `idempotency_key`, `manifest`, `dependency_plan`, `error_summary` |
| `people` | `id`, `school_id`, `full_name`, `preferred_name`, `date_of_birth`, `sex`, `national_id`, `email`, `phone`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `photo_path`, `photo_url`, `deleted_at`, `user_id`, `province`, `municipality`, `commune`, `address` |
| `programs` | `id`, `school_id`, `academic_level_id`, `code`, `name`, `kind`, `is_active`, `created_at`, `grading_profile` |
| `rooms` | `id`, `school_id`, `code`, `name`, `capacity`, `status`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version`, `room_type`, `campus_id`, `building`, `block`, `floor`, `resources`, `accessibility`, `notes` |
| `school_announcements` | `id`, `school_id`, `title`, `body`, `audience`, `channel`, `status`, `scheduled_for`, `published_at`, `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at`, `version` |
| `siga_assessment_item_competencies` | `id`, `school_id`, `item_id`, `competency_id`, `created_by`, `created_at` |
| `siga_assessment_items` | `id`, `school_id`, `class_group_id`, `subject_id`, `term`, `name`, `kind`, `component`, `assessed_on`, `max_score`, `counts_toward_pauta`, `allow_recovery`, `description`, `created_at`, `updated_at`, `created_by`, `updated_by`, `lesson_plan_component_id`, `starts_at`, `duration_minutes`, `purpose` |
| `siga_assessment_scores` | `id`, `school_id`, `item_id`, `enrollment_id`, `score`, `previous_score`, `status`, `recorded_by`, `updated_at` |
| `siga_attendance_sessions` | `id`, `school_id`, `academic_year_id`, `class_group_id`, `subject_id`, `teacher_id`, `timetable_slot_id`, `lesson_date`, `period_number`, `starts_at`, `ends_at`, `status`, `notes`, `created_at`, `created_by`, `updated_at`, `updated_by` |
| `siga_competencies` | `id`, `school_id`, `subject_id`, `grade_level_id`, `code`, `description`, `status`, `display_order`, `created_by`, `updated_by`, `created_at`, `updated_at` |
| `students` | `id`, `school_id`, `person_id`, `student_number`, `admission_date`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at` |
| `subjects` | `id`, `school_id`, `code`, `name`, `short_name`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `subject_type_id`, `curriculum_area_id`, `description`, `department`, `is_mandatory`, `is_practical`, `has_assessment`, `has_exam`, `has_attendance`, `has_pauta`, `annual_hours`, `default_lesson_duration`, `color`, `icon`, `display_order`, `deleted_at`, `version` |
| `teachers` | `id`, `school_id`, `person_id`, `employee_number`, `hired_on`, `employment_type`, `highest_qualification`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `user_id` |
| `terms` | `id`, `school_id`, `academic_year_id`, `name`, `sequence`, `starts_on`, `ends_on`, `created_at`, `created_by`, `updated_by` |
| `timetable_slots` | `id`, `school_id`, `class_subject_id`, `weekday`, `starts_at`, `ends_at`, `room`, `status`, `created_by`, `created_at`, `updated_by`, `schedule_id`, `room_id`, `shift_id`, `day_period_number`, `notes` |

Relações confirmadas:

- `academic_schedules` → `academic_years` (`academic_schedules_academic_year_id_fkey`)
- `academic_schedules` → `class_groups` (`academic_schedules_class_group_id_fkey`)
- `academic_schedules` → `schools` (`academic_schedules_school_id_fkey`)
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
- `document_requests` → `document_templates` (`document_requests_school_id_template_id_fkey`)
- `document_requests` → `schools` (`document_requests_school_id_fkey`)
- `document_requests` → `students` (`document_requests_school_id_student_id_fkey`)
- `enrollment_applications` → `enrollment_forms` (`enrollment_applications_form_id_fkey`)
- `enrollment_applications` → `schools` (`enrollment_applications_school_id_fkey`)
- `enrollment_forms` → `schools` (`enrollment_forms_school_id_fkey`)
- `enrollments` → `academic_years` (`enrollments_school_id_academic_year_id_fkey`)
- `enrollments` → `class_groups` (`enrollments_school_id_class_group_id_fkey`)
- `enrollments` → `schools` (`enrollments_school_id_fkey`)
- `enrollments` → `students` (`enrollments_school_id_student_id_fkey`)
- `finance_invoices` → `fee_items` (`finance_invoices_school_id_fee_item_id_fkey`)
- `finance_invoices` → `finance_contracts` (`finance_invoices_school_id_contract_id_fkey`)
- `finance_invoices` → `schools` (`finance_invoices_school_id_fkey`)
- `finance_receipts` → `finance_invoices` (`finance_receipts_school_id_invoice_id_fkey`)
- `finance_receipts` → `schools` (`finance_receipts_school_id_fkey`)
- `grade_levels` → `programs` (`grade_levels_school_id_program_id_fkey`)
- `grade_levels` → `schools` (`grade_levels_school_id_fkey`)
- `grading_scales` → `schools` (`grading_scales_school_id_fkey`)
- `hr_teacher_lesson_occurrences` → `class_subjects` (`hr_teacher_lesson_occurrences_class_subject_id_fkey`)
- `hr_teacher_lesson_occurrences` → `hr_compensation_events` (`hr_teacher_lesson_occurrences_compensation_event_id_fkey`)
- `hr_teacher_lesson_occurrences` → `hr_contracts` (`hr_teacher_lesson_occurrences_contract_id_fkey`)
- `hr_teacher_lesson_occurrences` → `hr_employments` (`hr_teacher_lesson_occurrences_employment_id_fkey`)
- `hr_teacher_lesson_occurrences` → `schools` (`hr_teacher_lesson_occurrences_school_id_fkey`)
- `hr_teacher_lesson_occurrences` → `teachers` (`hr_teacher_lesson_occurrences_original_teacher_id_fkey`)
- `hr_teacher_lesson_occurrences` → `teachers` (`hr_teacher_lesson_occurrences_teacher_id_fkey`)
- `hr_teacher_lesson_occurrences` → `timetable_slots` (`hr_teacher_lesson_occurrences_timetable_slot_id_fkey`)
- `import_jobs` → `academic_years` (`import_jobs_academic_year_id_fkey`)
- `import_jobs` → `schools` (`import_jobs_school_id_fkey`)
- `people` → `schools` (`people_school_id_fkey`)
- `programs` → `academic_levels` (`programs_school_id_academic_level_id_fkey`)
- `programs` → `schools` (`programs_school_id_fkey`)
- `rooms` → `schools` (`rooms_school_id_fkey`)
- `school_announcements` → `schools` (`school_announcements_school_id_fkey`)
- `siga_assessment_item_competencies` → `schools` (`siga_assessment_item_competencies_school_id_fkey`)
- `siga_assessment_item_competencies` → `siga_assessment_items` (`siga_assessment_item_competencies_item_id_fkey`)
- `siga_assessment_item_competencies` → `siga_competencies` (`siga_assessment_item_competencies_competency_id_fkey`)
- `siga_assessment_items` → `schools` (`siga_assessment_items_school_id_fkey`)
- `siga_assessment_items` → `siga_lesson_plan_components` (`siga_assessment_items_lesson_plan_component_id_fkey`)
- `siga_assessment_scores` → `schools` (`siga_assessment_scores_school_id_fkey`)
- `siga_assessment_scores` → `siga_assessment_items` (`siga_assessment_scores_item_id_fkey`)
- `siga_attendance_sessions` → `academic_years` (`siga_attendance_sessions_academic_year_id_fkey`)
- `siga_attendance_sessions` → `class_groups` (`siga_attendance_sessions_class_group_id_fkey`)
- `siga_attendance_sessions` → `schools` (`siga_attendance_sessions_school_id_fkey`)
- `siga_attendance_sessions` → `subjects` (`siga_attendance_sessions_subject_id_fkey`)
- `siga_attendance_sessions` → `teachers` (`siga_attendance_sessions_teacher_id_fkey`)
- `siga_attendance_sessions` → `timetable_slots` (`siga_attendance_sessions_timetable_slot_id_fkey`)
- `siga_competencies` → `grade_levels` (`siga_competencies_grade_level_id_fkey`)
- `siga_competencies` → `schools` (`siga_competencies_school_id_fkey`)
- `siga_competencies` → `subjects` (`siga_competencies_subject_id_fkey`)
- `students` → `people` (`students_school_id_person_id_fkey`)
- `students` → `schools` (`students_school_id_fkey`)
- `subjects` → `curriculum_areas` (`subjects_curriculum_area_id_fkey`)
- `subjects` → `schools` (`subjects_school_id_fkey`)
- `subjects` → `subject_types` (`subjects_subject_type_id_fkey`)
- `teachers` → `people` (`teachers_school_id_person_id_fkey`)
- `teachers` → `schools` (`teachers_school_id_fkey`)
- `terms` → `academic_years` (`terms_school_id_academic_year_id_fkey`)
- `terms` → `schools` (`terms_school_id_fkey`)
- `timetable_slots` → `academic_schedules` (`timetable_slots_schedule_id_fkey`)
- `timetable_slots` → `class_subjects` (`timetable_slots_school_id_class_subject_id_fkey`)
- `timetable_slots` → `rooms` (`timetable_slots_room_id_fkey`)
- `timetable_slots` → `school_shifts` (`timetable_slots_shift_id_fkey`)
- `timetable_slots` → `schools` (`timetable_slots_school_id_fkey`)

## Contratos de API e erros

| Função | Método | Entrada | Fonte |
| --- | --- | --- | --- |
| `getDashboardOverview` | GET | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/dashboard/server.ts) |
| `getSchoolTodayOps` | GET | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/dashboard/server.ts) |
| `listSchoolAlerts` | GET | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/dashboard/server.ts) |
| `getMyStudentAgenda` | GET | `agendaInputSchema` | [student-agenda.ts](../../../src/features/dashboard/student-agenda.ts) |
| `getMyStudentTimetable` | GET | `agendaInputSchema` | [student-agenda.ts](../../../src/features/dashboard/student-agenda.ts) |
| `getMyStudentCompetencies` | GET | `Sem schema de entrada explícito neste bloco` | [student-competencies.ts](../../../src/features/dashboard/student-competencies.ts) |

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

- [alerts.test.ts](../../../tests/dashboard/alerts.test.ts)
- [realtime-contract.test.ts](../../../tests/dashboard/realtime-contract.test.ts)
- [school-today-contract.test.ts](../../../tests/dashboard/school-today-contract.test.ts)
- [student-agenda.test.ts](../../../tests/dashboard/student-agenda.test.ts)
- [student-competencies-card.test.tsx](../../../tests/dashboard/student-competencies-card.test.tsx)
- [student-grades-card.test.tsx](../../../tests/dashboard/student-grades-card.test.tsx)

**Riscos/pendências:** jornada anual e A/B autenticado exigem staging; concorrência PostgreSQL, fornecedores, restauro, artefactos oficiais extensos e dispositivos reais não ficam certificados por mocks/PGlite. Consultar a matriz e o progresso para o resultado efectivamente executado.

## Fontes e navegação

- [index.tsx](../../../src/routes/index.tsx)
- [server.ts](../../../src/features/dashboard/server.ts)

[Índice](../README.md) · [Contratos transversais](../CONTRATOS_TRANSVERSAIS.md)
