# Importações e exportação de intercâmbio

**Data:** 08/10/2026. **Estado:** implementação presente; aceitação integrada por concluir. As alterações específicas são distinguidas no documento de correcções.

## Objectivo e âmbito

Importações e exportação de intercâmbio; operar dentro da responsabilidade escolar/plataforma definida pela arquitectura, sem duplicar a fonte de verdade de outro módulo.

## Estado actual e comportamento pretendido

**Implementado:** os ficheiros, contratos e tabelas abaixo estão inventariados. A auditoria anterior e os testes locais identificam provas parciais. Não implica que todas as operações estejam completas.

**Proposto:** concluir em staging os critérios de persistência, recuperação e isolamento indicados nesta SPEC. **Por decidir:** regras da instituição não presentes na configuração/documentação e acessos externos indispensáveis.

## Perfis e permissões

Secretaria para dados académicos; Tesouraria para financeiros; Administrador. O cargo não substitui grant por módulo nem âmbito escolar. O servidor volta a autorizar cada pedido.

## Pré-condições e dependências

Sessão válida, vínculo activo e escola seleccionada autorizada; configurações do ano/turma/contrato quando usadas. Escrita sensível exige AAL2. Relações carregadas de outra escola são recusadas. Testes com escrita exigem ambiente isolado e destinos sintéticos.

## Fluxo principal e alternativas

Ficheiro → análise → mapping → validação/duplicados → preview → staging → commit → relatório → reimportação/rollback.

Sem pré-requisito: explicar a falta e ligar à configuração responsável. Sem permissão: impedir o pedido. Erro recuperável: preservar o preenchimento, mostrar o motivo e permitir repetir sem duplicar. Conflito de versão/capacidade: reler o contexto e pedir revisão antes de gravar. Transporte externo indisponível: não anunciar entrega/sucesso fictícios.

## Estados e transições

- `academic_years.status`: `active`, `archived`, `closed`, `draft`
- `class_groups.shift`: `afternoon`, `evening`, `full_day`, `morning`
- `class_groups.status`: `active`, `archived`, `closed`, `draft`
- `class_subjects.status`: `active`, `archived`, `inactive`
- `enrollment_applications.status`: `accepted`, `pending`, `rejected`
- `enrollments.status`: `active`, `cancelled`, `completed`, `pending`, `transferred`
- `fee_items.frequency`: `annual`, `monthly`, `once`, `term`
- `fee_items.kind`: `enrollment`, `other`, `service`, `tuition`
- `fee_plans.status`: `active`, `draft`, `retired`
- `finance_contracts.status`: `active`, `cancelled`
- `finance_invoices.status`: `cancelled`, `open`, `paid`, `partially_paid`
- `finance_receipts.payment_method`: `bank_transfer`, `card`, `cash`, `other`
- `finance_receipts.status`: `issued`, `reversed`
- `grade_items.kind`: `assignment`, `continuous`, `exam`, `informative`, `recovery`, `resit`, `term_exam`, `test`
- `grade_scores.status`: `draft`, `locked`, `submitted`
- `gradebooks.status`: `closed`, `draft`, `open`, `submitted`
- `hr_employments.employment_type`: `fixed_term`, `intern`, `other`, `permanent`, `service_provider`, `temporary`
- `hr_employments.status`: `active`, `draft`, `expired`, `suspended`, `terminated`
- `hr_positions.category`: `director`, `management`, `other`, `staff`, `support`, `teacher`
- `import_audits.action_type`: `deleted`, `inserted`, `updated`
- `import_jobs.exchange_mode`: `human`, `siga_exchange`
- `import_jobs.source_format`: `csv`, `json`, `ods`, `xls`, `xlsx`
- `import_jobs.status`: `analyzing`, `cancelled`, `completed`, `failed`, `importing`, `mapping`, `ready`, `rolled_back`, `uploaded`, `validating`
- `import_rows.status`: `duplicate`, `error`, `ignored`, `imported`, `valid`, `warning`, `will_insert`, `will_update`
- `import_rows.validation_stage`: `business_rule`, `committed`, `duplicate`, `ready`, `reference`, `row`
- `import_table_specs.direct_import_policy`: `allow`, `controlled`, `deny`, `review`
- `import_table_specs.export_policy`: `allow`, `controlled`, `deny`, `review`
- `import_table_specs.sensitivity`: `internal`, `normal`, `secret`, `sensitive`
- `people.sex`: `female`, `male`, `other`, `undisclosed`
- `people.status`: `active`, `archived`, `inactive`
- `programs.grading_profile`: `20_ects`, `components`, `components`, `frequencia_exame`, `gpa4`, `scale`, `scale`, `so_exame`
- `programs.kind`: `general`, `postgraduate`, `professional`, `technical`, `undergraduate`
- `rooms.status`: `active`, `inactive`
- `schools.status`: `active`, `archived`, `setup`, `suspended`
- `siga_assessment_items.purpose`: `diagnostic`, `formative`, `summative`
- `siga_attendance_records.status`: `absent`, `early_exit`, `excused`, `late`, `not_registered`, `present`
- `siga_attendance_sessions.status`: `cancelled`, `completed`, `pending`
- `student_guardians.relationship`: `father`, `grandparent`, `guardian`, `mother`, `other`, `sibling`
- `students.status`: `active`, `applicant`, `cancelled`, `graduated`, `inactive`, `locked`, `suspended`, `transferred`, `withdrawn`
- `subjects.status`: `active`, `archived`, `inactive`
- `teachers.employment_type`: `fixed_term`, `part_time`, `permanent`, `visiting`
- `teachers.highest_qualification`: `bachelor`, `doctorate`, `licentiate`, `master`, `other`, `secondary`
- `teachers.status`: `active`, `archived`, `inactive`, `leave`
- `timetable_slots.status`: `active`, `archived`, `cancelled`

Enum permitido não autoriza qualquer transição: as guardas de alteração, publicação, fecho e reabertura no servidor/SQL são normativas. Transições sem regra documentada ficam **por decidir**, não são habilitadas por esta SPEC.

## Campos, formatos e validações

Os schemas ligados são o contrato efectivo, incluindo refinamentos, campos opcionais/defaults e validação condicional. O inventário abaixo mostra as declarações encontradas; expressões multilinha e schemas derivados devem ser lidos na fonte, não inferidos apenas desta tabela.

| Campo | Declaração observada | Schema de origem |
| --- | --- | --- |
| `academic_year_id` | `z.string().uuid().optional().nullable(),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `module` | `z.enum(importModuleOptions),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `file_name` | `z.string().min(1),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `total_rows` | `z.number().int().nonnegative().default(0),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `schema_version` | `z.string().min(1).default("1.0"),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `exchange_mode` | `z.enum(importExchangeModeOptions).default("human"),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `source_format` | `z.enum(importSourceFormatOptions).default("xlsx"),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `dry_run` | `z.boolean().default(false),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `idempotency_key` | `z.string().trim().min(1).max(200).optional(),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `manifest` | `z.record(z.string(), z.unknown()).default({}),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `dependency_plan` | `z.array(z.unknown()).default([]),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `file_base64` | `z.string().min(1).max(35_000_000, "Ficheiro demasiado grande (máximo 25 MB)."),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `file_name` | `z.string().min(1).max(255),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `job_id` | `z.string().uuid(),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `sheet_name` | `z.string().min(1),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `rows` | `z.array(z.record(z.string(), z.unknown())),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `column_mapping` | `z.record(z.string(), z.string()),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `job_id` | `z.string().uuid(),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `batch_size` | `z` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `dry_run` | `z.boolean().default(false),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `duplicate_strategy` | `z.enum(["update", "ignore", "create_new"]).default("update"),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `after_row_number` | `z.number().int().nonnegative().default(0),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `job_id` | `z.string().uuid(),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `module` | `z.enum(importModuleOptions),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `mappings` | `z.record(z.string(), z.string()),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `save_template_name` | `z.string().optional(),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `row_id` | `z.string().uuid(),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `field_name` | `z.string(),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `new_value` | `z.any(),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `job_id` | `z.string().uuid(),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `reason` | `z.string().optional(),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `id` | `string;` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `school_id` | `string;` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `module` | `ImportModule;` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `file_name` | `string;` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `status` | `ImportJobStatus;` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `total_rows` | `number;` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `valid_rows` | `number;` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `invalid_rows` | `number;` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `duplicate_rows` | `number;` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `inserted_rows` | `number;` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `updated_rows` | `number;` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `ignored_rows` | `number;` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `created_at` | `string;` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `id` | `string;` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `import_job_id` | `string;` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `sheet_name` | `string;` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `row_number` | `number;` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `raw_data` | `Record<string, ImportJsonValue>;` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `normalized_data` | `Record<string, ImportJsonValue>;` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `status` | `ImportRowStatus;` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `warnings` | `string[];` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `errors` | `string[];` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `created_at` | `string;` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `module` | `z.enum(importModuleOptions),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `academic_year_id` | `z.string().uuid().optional().nullable(),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `class_group_id` | `z.string().uuid().optional().nullable(),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `modules` | `z.array(z.enum(importModuleOptions)).min(1),` | [schemas.ts](../../../src/features/import/schemas.ts) |
| `mode` | `z.enum(importExchangeModeOptions),` | [schemas.ts](../../../src/features/import/schemas.ts) |

## Regras de negócio e fonte

Só importadores governados gravam; total aceito/rejeitado/pendente deve reconciliar. CSV/XLSX acima de 25000 linhas por folha são recusados antes de gravar.

Fonte: implementação e skills canónicos, `DATABASE_RULES.md`, configuração efectiva da escola e SPEC temática quando ligada. Regras académicas/financeiras sem fundamento institucional confirmado ficam **por decidir**.

Especificação complementar: [SGA_IMPORT_EXPORT_PREMIUM_SPEC.md](../SGA_IMPORT_EXPORT_PREMIUM_SPEC.md).

## Modelo de dados e relações

Tabelas confirmadas no banco existente; este levantamento não propõe substituí-las:

| Tabela | Colunas existentes |
| --- | --- |
| `academic_levels` | `id`, `school_id`, `code`, `name`, `sequence`, `is_active`, `created_at` |
| `academic_years` | `id`, `school_id`, `name`, `starts_on`, `ends_on`, `status`, `created_at`, `created_by`, `updated_by` |
| `audit_logs` | `id`, `school_id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `request_id`, `metadata`, `occurred_at` |
| `campuses` | `id`, `school_id`, `code`, `name`, `province`, `municipality`, `is_active`, `created_at`, `address` |
| `class_groups` | `id`, `school_id`, `academic_year_id`, `campus_id`, `grade_level_id`, `homeroom_teacher_id`, `code`, `name`, `shift`, `capacity`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `delegate_student_id`, `whatsapp_invite_url`, `whatsapp_group_name`, `room_id` |
| `class_subjects` | `id`, `school_id`, `class_group_id`, `subject_id`, `teacher_id`, `weekly_periods`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at` |
| `enrollment_applications` | `id`, `school_id`, `form_id`, `full_name`, `payload`, `status`, `decided_at`, `decided_by`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version`, `student_id` |
| `enrollment_forms` | `id`, `school_id`, `slug`, `title`, `subtitle`, `hero_text`, `accent_color`, `logo_url`, `is_open`, `visible_fields`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version` |
| `enrollments` | `id`, `school_id`, `academic_year_id`, `class_group_id`, `student_id`, `enrollment_number`, `enrolled_on`, `status`, `ended_on`, `end_reason`, `created_by`, `updated_by`, `created_at`, `updated_at`, `attendance_rate`, `final_average` |
| `fee_items` | `id`, `school_id`, `fee_plan_id`, `code`, `name`, `kind`, `amount`, `frequency`, `is_active`, `created_at`, `grade_level_id` |
| `fee_plans` | `id`, `school_id`, `academic_year_id`, `code`, `name`, `currency_code`, `status`, `created_at` |
| `finance_contracts` | `id`, `school_id`, `enrollment_id`, `fee_plan_id`, `discount_percentage`, `status`, `created_by`, `created_at` |
| `finance_invoices` | `id`, `school_id`, `contract_id`, `fee_item_id`, `invoice_number`, `competence_month`, `amount`, `discount_amount`, `due_date`, `status`, `issued_by`, `cancelled_at`, `cancelled_by`, `cancellation_reason`, `created_at`, `penalty_amount` |
| `finance_receipts` | `id`, `school_id`, `invoice_id`, `receipt_number`, `amount`, `paid_on`, `payment_method`, `received_by`, `status`, `reversed_at`, `reversed_by`, `reversal_reason`, `created_at`, `external_id` |
| `grade_items` | `id`, `school_id`, `gradebook_id`, `code`, `name`, `kind`, `weight`, `max_score`, `assessed_on`, `sequence`, `created_by`, `created_at` |
| `grade_levels` | `id`, `school_id`, `program_id`, `code`, `name`, `sequence`, `is_active`, `created_at` |
| `grade_scores` | `id`, `school_id`, `grade_item_id`, `enrollment_id`, `score`, `status`, `note`, `recorded_by`, `updated_by`, `created_at`, `updated_at`, `pending_score`, `pending_reason`, `pending_requested_by`, `pending_requested_at` |
| `gradebooks` | `id`, `school_id`, `academic_year_id`, `term_id`, `class_subject_id`, `class_group_id`, `rule_set_id`, `status`, `opened_at`, `submitted_at`, `closed_at`, `created_by`, `updated_by`, `created_at`, `updated_at` |
| `hr_departments` | `id`, `school_id`, `name`, `code`, `description`, `parent_department_id`, `active`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version` |
| `hr_employments` | `id`, `school_id`, `person_id`, `position_id`, `department_id`, `employee_number`, `employment_type`, `status`, `hire_date`, `termination_date`, `work_location`, `weekly_hours`, `notes`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version` |
| `hr_positions` | `id`, `school_id`, `department_id`, `name`, `code`, `category`, `description`, `active`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version` |
| `import_audits` | `id`, `import_job_id`, `row_id`, `table_name`, `target_id`, `action_type`, `before_data`, `after_data`, `created_at`, `sequence_no`, `reversible`, `source_hash` |
| `import_jobs` | `id`, `school_id`, `academic_year_id`, `user_id`, `module`, `file_name`, `file_path`, `status`, `total_rows`, `valid_rows`, `invalid_rows`, `duplicate_rows`, `inserted_rows`, `updated_rows`, `ignored_rows`, `job_metadata`, `started_at`, `completed_at`, `created_at`, `updated_at`, `schema_version`, `exchange_mode`, `source_format`, `dry_run`, `idempotency_key`, `manifest`, `dependency_plan`, `error_summary` |
| `import_rows` | `id`, `import_job_id`, `sheet_name`, `row_number`, `raw_data`, `normalized_data`, `status`, `warnings`, `errors`, `duplicate_of`, `target_record_id`, `created_at`, `natural_key`, `natural_key_hash`, `validation_stage`, `resolution`, `source_hash` |
| `import_table_specs` | `id`, `table_schema`, `table_name`, `direct_import_policy`, `export_policy`, `sensitivity`, `module_code`, `dependency_rank`, `natural_key_columns`, `fk_dependencies`, `derived_from`, `notes`, `active`, `created_at`, `updated_at` |
| `people` | `id`, `school_id`, `full_name`, `preferred_name`, `date_of_birth`, `sex`, `national_id`, `email`, `phone`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `photo_path`, `photo_url`, `deleted_at`, `user_id`, `province`, `municipality`, `commune`, `address` |
| `programs` | `id`, `school_id`, `academic_level_id`, `code`, `name`, `kind`, `is_active`, `created_at`, `grading_profile` |
| `rooms` | `id`, `school_id`, `code`, `name`, `capacity`, `status`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version`, `room_type`, `campus_id`, `building`, `block`, `floor`, `resources`, `accessibility`, `notes` |
| `school_settings` | `id`, `school_id`, `domain`, `version`, `value`, `changed_by`, `created_at` |
| `schools` | `id`, `public_code`, `name`, `timezone`, `currency_code`, `status`, `theme`, `created_at`, `updated_at`, `nif`, `email`, `phone`, `province`, `municipality`, `address`, `logo_path`, `official_authorization_reference`, `tenant_id`, `commercial_name`, `city`, `logo_url`, `director_name`, `evaluation_periods`, `passing_grade`, `preferences`, `commune`, `neighborhood`, `latitude`, `longitude` |
| `siga_assessment_items` | `id`, `school_id`, `class_group_id`, `subject_id`, `term`, `name`, `kind`, `component`, `assessed_on`, `max_score`, `counts_toward_pauta`, `allow_recovery`, `description`, `created_at`, `updated_at`, `created_by`, `updated_by`, `lesson_plan_component_id`, `starts_at`, `duration_minutes`, `purpose` |
| `siga_attendance_records` | `id`, `school_id`, `session_id`, `student_id`, `status`, `notes`, `recorded_by`, `created_at`, `updated_at` |
| `siga_attendance_sessions` | `id`, `school_id`, `academic_year_id`, `class_group_id`, `subject_id`, `teacher_id`, `timetable_slot_id`, `lesson_date`, `period_number`, `starts_at`, `ends_at`, `status`, `notes`, `created_at`, `created_by`, `updated_at`, `updated_by` |
| `student_academic_history` | `id`, `school_id`, `student_id`, `academic_year_label`, `grade_level`, `previous_school`, `final_average`, `outcome`, `notes`, `created_by`, `created_at`, `updated_at`, `enrollment_id`, `grade_sheet_id`, `subject_results`, `absence_percentage`, `updated_by` |
| `student_guardians` | `id`, `school_id`, `student_id`, `guardian_person_id`, `relationship`, `is_primary`, `is_financially_responsible`, `is_pickup_authorized`, `valid_from`, `valid_until`, `created_by`, `created_at` |
| `students` | `id`, `school_id`, `person_id`, `student_number`, `admission_date`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at` |
| `subjects` | `id`, `school_id`, `code`, `name`, `short_name`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `subject_type_id`, `curriculum_area_id`, `description`, `department`, `is_mandatory`, `is_practical`, `has_assessment`, `has_exam`, `has_attendance`, `has_pauta`, `annual_hours`, `default_lesson_duration`, `color`, `icon`, `display_order`, `deleted_at`, `version` |
| `teachers` | `id`, `school_id`, `person_id`, `employee_number`, `hired_on`, `employment_type`, `highest_qualification`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `user_id` |
| `terms` | `id`, `school_id`, `academic_year_id`, `name`, `sequence`, `starts_on`, `ends_on`, `created_at`, `created_by`, `updated_by` |
| `timetable_slots` | `id`, `school_id`, `class_subject_id`, `weekday`, `starts_at`, `ends_at`, `room`, `status`, `created_by`, `created_at`, `updated_by`, `schedule_id`, `room_id`, `shift_id`, `day_period_number`, `notes` |

Relações confirmadas:

- `academic_levels` → `schools` (`academic_levels_school_id_fkey`)
- `academic_years` → `schools` (`academic_years_school_id_fkey`)
- `audit_logs` → `schools` (`audit_logs_school_id_fkey`)
- `campuses` → `schools` (`campuses_school_id_fkey`)
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
- `enrollment_applications` → `enrollment_forms` (`enrollment_applications_form_id_fkey`)
- `enrollment_applications` → `schools` (`enrollment_applications_school_id_fkey`)
- `enrollment_forms` → `schools` (`enrollment_forms_school_id_fkey`)
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
- `finance_receipts` → `finance_invoices` (`finance_receipts_school_id_invoice_id_fkey`)
- `finance_receipts` → `schools` (`finance_receipts_school_id_fkey`)
- `grade_items` → `gradebooks` (`grade_items_school_id_gradebook_id_fkey`)
- `grade_items` → `schools` (`grade_items_school_id_fkey`)
- `grade_levels` → `programs` (`grade_levels_school_id_program_id_fkey`)
- `grade_levels` → `schools` (`grade_levels_school_id_fkey`)
- `grade_scores` → `enrollments` (`grade_scores_school_id_enrollment_id_fkey`)
- `grade_scores` → `grade_items` (`grade_scores_school_id_grade_item_id_fkey`)
- `grade_scores` → `schools` (`grade_scores_school_id_fkey`)
- `gradebooks` → `academic_years` (`gradebooks_school_id_academic_year_id_fkey`)
- `gradebooks` → `class_groups` (`gradebooks_school_id_class_group_id_fkey`)
- `gradebooks` → `class_subjects` (`gradebooks_school_id_class_subject_id_fkey`)
- `gradebooks` → `schools` (`gradebooks_school_id_fkey`)
- `gradebooks` → `terms` (`gradebooks_school_id_term_id_fkey`)
- `hr_departments` → `hr_departments` (`hr_departments_parent_department_id_fkey`)
- `hr_departments` → `schools` (`hr_departments_school_id_fkey`)
- `hr_employments` → `hr_departments` (`hr_employments_department_id_fkey`)
- `hr_employments` → `hr_positions` (`hr_employments_position_id_fkey`)
- `hr_employments` → `people` (`hr_employments_person_id_fkey`)
- `hr_employments` → `schools` (`hr_employments_school_id_fkey`)
- `hr_positions` → `hr_departments` (`hr_positions_department_id_fkey`)
- `hr_positions` → `schools` (`hr_positions_school_id_fkey`)
- `import_audits` → `import_jobs` (`import_audits_import_job_id_fkey`)
- `import_audits` → `import_rows` (`import_audits_row_id_fkey`)
- `import_jobs` → `academic_years` (`import_jobs_academic_year_id_fkey`)
- `import_jobs` → `schools` (`import_jobs_school_id_fkey`)
- `import_rows` → `import_jobs` (`import_rows_import_job_id_fkey`)
- `people` → `schools` (`people_school_id_fkey`)
- `programs` → `academic_levels` (`programs_school_id_academic_level_id_fkey`)
- `programs` → `schools` (`programs_school_id_fkey`)
- `rooms` → `schools` (`rooms_school_id_fkey`)
- `school_settings` → `schools` (`school_settings_school_id_fkey`)
- `schools` → `tenants` (`schools_tenant_id_fkey`)
- `siga_assessment_items` → `schools` (`siga_assessment_items_school_id_fkey`)
- `siga_assessment_items` → `siga_lesson_plan_components` (`siga_assessment_items_lesson_plan_component_id_fkey`)
- `siga_attendance_records` → `schools` (`siga_attendance_records_school_id_fkey`)
- `siga_attendance_records` → `siga_attendance_sessions` (`siga_attendance_records_session_id_fkey`)
- `siga_attendance_records` → `students` (`siga_attendance_records_student_id_fkey`)
- `siga_attendance_sessions` → `academic_years` (`siga_attendance_sessions_academic_year_id_fkey`)
- `siga_attendance_sessions` → `class_groups` (`siga_attendance_sessions_class_group_id_fkey`)
- `siga_attendance_sessions` → `schools` (`siga_attendance_sessions_school_id_fkey`)
- `siga_attendance_sessions` → `subjects` (`siga_attendance_sessions_subject_id_fkey`)
- `siga_attendance_sessions` → `teachers` (`siga_attendance_sessions_teacher_id_fkey`)
- `siga_attendance_sessions` → `timetable_slots` (`siga_attendance_sessions_timetable_slot_id_fkey`)
- `student_academic_history` → `enrollments` (`student_academic_history_enrollment_id_fkey`)
- `student_academic_history` → `grade_sheets` (`student_academic_history_grade_sheet_id_fkey`)
- `student_academic_history` → `schools` (`student_academic_history_school_id_fkey`)
- `student_academic_history` → `students` (`student_academic_history_student_fkey`)
- `student_guardians` → `people` (`student_guardians_school_id_guardian_person_id_fkey`)
- `student_guardians` → `schools` (`student_guardians_school_id_fkey`)
- `student_guardians` → `students` (`student_guardians_school_id_student_id_fkey`)
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
| `analyzeImportFile` | POST | `analyzeImportFileInputSchema` | [server.ts](../../../src/features/import/server.ts) |
| `createImportJob` | POST | `createImportJobSchema` | [server.ts](../../../src/features/import/server.ts) |
| `listImportJobs` | GET | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/import/server.ts) |
| `stageImportRows` | POST | `stageImportRowsInputSchema` | [server.ts](../../../src/features/import/server.ts) |
| `listStagingRows` | GET | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/import/server.ts) |
| `updateStagingRowField` | POST | `updateStagingRowSchema` | [server.ts](../../../src/features/import/server.ts) |
| `commitImportBatch` | POST | `commitImportBatchSchema` | [server.ts](../../../src/features/import/server.ts) |
| `rollbackImportJob` | POST | `rollbackImportJobSchema` | [server.ts](../../../src/features/import/server.ts) |
| `downloadOfficialExcelTemplateFn` | POST | `downloadOfficialTemplateSchema` | [server.ts](../../../src/features/import/server.ts) |
| `exportSchoolDataFn` | POST | `exportSchoolDataSchema` | [server.ts](../../../src/features/import/server.ts) |

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

- [academic-advanced-importers.test.ts](../../../tests/import/academic-advanced-importers.test.ts)
- [academic-core.test.ts](../../../tests/import/academic-core.test.ts)
- [all-importers-coverage.test.ts](../../../tests/import/all-importers-coverage.test.ts)
- [bulk-csv.test.ts](../../../tests/import/bulk-csv.test.ts)
- [competence-month.test.ts](../../../tests/import/competence-month.test.ts)
- [cursos-academic-level.test.ts](../../../tests/import/cursos-academic-level.test.ts)
- [dry-run.test.ts](../../../tests/import/dry-run.test.ts)
- [engine.test.ts](../../../tests/import/engine.test.ts)
- [excel-template-builder.test.ts](../../../tests/import/excel-template-builder.test.ts)
- [export-new-modules.test.ts](../../../tests/import/export-new-modules.test.ts)
- [export-permissions.test.ts](../../../tests/import/export-permissions.test.ts)
- [export-reimport-flow.test.ts](../../../tests/import/export-reimport-flow.test.ts)
- [extra-importers.test.ts](../../../tests/import/extra-importers.test.ts)
- [field-catalog.test.ts](../../../tests/import/field-catalog.test.ts)
- [governance.test.ts](../../../tests/import/governance.test.ts)
- [guardians-payments-importers.test.ts](../../../tests/import/guardians-payments-importers.test.ts)
- [horarios-importer.test.ts](../../../tests/import/horarios-importer.test.ts)
- [inscricoes-importer.test.ts](../../../tests/import/inscricoes-importer.test.ts)
- [job-gate-write-mode.test.ts](../../../tests/import/job-gate-write-mode.test.ts)
- [matriculas-commit.test.ts](../../../tests/import/matriculas-commit.test.ts)
- [parser-limits.test.ts](../../../tests/import/parser-limits.test.ts)
- [pedagogical-importers.test.ts](../../../tests/import/pedagogical-importers.test.ts)
- [propinas-importer.test.ts](../../../tests/import/propinas-importer.test.ts)
- [schemas.test.ts](../../../tests/import/schemas.test.ts)

**Riscos/pendências:** jornada anual e A/B autenticado exigem staging; concorrência PostgreSQL, fornecedores, restauro, artefactos oficiais extensos e dispositivos reais não ficam certificados por mocks/PGlite. Consultar a matriz e o progresso para o resultado efectivamente executado.

## Fontes e navegação

- [importar.tsx](../../../src/routes/importar.tsx)
- [schemas.ts](../../../src/features/import/schemas.ts)
- [server.ts](../../../src/features/import/server.ts)

[Índice](../README.md) · [Contratos transversais](../CONTRATOS_TRANSVERSAIS.md)
