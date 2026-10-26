# Recursos humanos e salários

**Data:** 08/10/2026. **Estado:** implementação presente; aceitação integrada por concluir. As alterações específicas são distinguidas no documento de correcções.

## Objectivo e âmbito

Recursos humanos e salários; operar dentro da responsabilidade escolar/plataforma definida pela arquitectura, sem duplicar a fonte de verdade de outro módulo.

## Estado actual e comportamento pretendido

**Implementado:** os ficheiros, contratos e tabelas abaixo estão inventariados. A auditoria anterior e os testes locais identificam provas parciais. Não implica que todas as operações estejam completas.

**Proposto:** concluir em staging os critérios de persistência, recuperação e isolamento indicados nesta SPEC. **Por decidir:** regras da instituição não presentes na configuração/documentação e acessos externos indispensáveis.

## Perfis e permissões

Administrador e responsáveis com permissões RH/financeiras próprias. O cargo não substitui grant por módulo nem âmbito escolar. O servidor volta a autorizar cada pedido.

## Pré-condições e dependências

Sessão válida, vínculo activo e escola seleccionada autorizada; configurações do ano/turma/contrato quando usadas. Escrita sensível exige AAL2. Relações carregadas de outra escola são recusadas. Testes com escrita exigem ambiente isolado e destinos sintéticos.

## Fluxo principal e alternativas

Vincular trabalhador → contrato → assiduidade/remuneração → preparar folha → aprovar → pagar → reconciliar/anular.

Sem pré-requisito: explicar a falta e ligar à configuração responsável. Sem permissão: impedir o pedido. Erro recuperável: preservar o preenchimento, mostrar o motivo e permitir repetir sem duplicar. Conflito de versão/capacidade: reler o contexto e pedir revisão antes de gravar. Transporte externo indisponível: não anunciar entrega/sucesso fictícios.

## Estados e transições

- `class_groups.shift`: `afternoon`, `evening`, `full_day`, `morning`
- `class_groups.status`: `active`, `archived`, `closed`, `draft`
- `class_subjects.status`: `active`, `archived`, `inactive`
- `enrollments.status`: `active`, `cancelled`, `completed`, `pending`, `transferred`
- `hr_absence_events.absence_type`: `justified_paid`, `justified_unpaid`, `unjustified`
- `hr_absence_events.validation_status`: `cancelled`, `pending`, `rejected`, `validated`
- `hr_attendance_assurance_evidence.decision`: `auto_approve`, `reject`, `review`
- `hr_attendance_assurance_evidence.device_integrity_provider`: `app_attest`, `none`, `play_integrity`, `webauthn`
- `hr_attendance_assurance_evidence.purpose`: `check_in`, `check_out`
- `hr_contract_remuneration_policies.policy_source`: `collective_agreement`, `contract`, `institution`, `other`, `public_service`
- `hr_contract_remuneration_policies.remuneration_model`: `fixed_deduct_absence`, `hybrid`, `validated_units`
- `hr_contracts.contract_type`: `fixed_term`, `intern`, `other`, `permanent`, `service_provider`, `temporary`
- `hr_contracts.salary_type`: `hourly`, `lesson_hour`, `monthly`
- `hr_contracts.status`: `active`, `cancelled`, `draft`, `ended`, `suspended`
- `hr_employments.employment_type`: `fixed_term`, `intern`, `other`, `permanent`, `service_provider`, `temporary`
- `hr_employments.status`: `active`, `draft`, `expired`, `suspended`, `terminated`
- `hr_payment_destinations.method`: `cash`, `other`, `transfer`
- `hr_payroll_items.status`: `approved`, `calculated`, `cancelled`, `draft`, `paid`, `processing`
- `hr_payroll_payment_batches.method`: `cash`, `other`, `transfer`
- `hr_payroll_payment_batches.status`: `authorized`, `awaiting_authorization`, `cancelled`, `completed`, `draft`, `failed`, `partial`, `processing`
- `hr_payroll_payment_items.status`: `authorized`, `blocked`, `cancelled`, `failed`, `paid`, `pending`, `processing`
- `hr_payroll_runs.status`: `approved`, `calculating`, `cancelled`, `draft`, `paid`, `processing`, `review`
- `hr_salary_change_requests.status`: `applied`, `approved`, `cancelled`, `pending`, `rejected`
- `hr_salary_scale_versions.status`: `approved`, `draft`, `retired`
- `hr_teacher_attendance_policies.outside_grace_mode`: `proportional`, `review`
- `hr_teacher_lesson_occurrences.attendance_exception_status`: `approved`, `none`, `pending_review`, `proportional`, `rejected`, `within_grace`
- `hr_teacher_lesson_occurrences.evidence_method`: `attendance_import`, `manual`, `qr`, `system`
- `hr_teacher_lesson_occurrences.occurrence_kind`: `extra`, `scheduled`, `substitution`
- `hr_teacher_lesson_occurrences.review_decision`: `approved`, `rejected`
- `hr_teacher_lesson_occurrences.status`: `cancelled`, `confirmed`, `rejected`, `scheduled`
- `hr_teacher_qr_sessions.purpose`: `check_in`, `check_out`
- `hr_teacher_qr_sessions.status`: `active`, `expired`, `revoked`, `used`
- `people.sex`: `female`, `male`, `other`, `undisclosed`
- `people.status`: `active`, `archived`, `inactive`
- `siga_attendance_sessions.status`: `cancelled`, `completed`, `pending`
- `subjects.status`: `active`, `archived`, `inactive`
- `teachers.employment_type`: `fixed_term`, `part_time`, `permanent`, `visiting`
- `teachers.highest_qualification`: `bachelor`, `doctorate`, `licentiate`, `master`, `other`, `secondary`
- `teachers.status`: `active`, `archived`, `inactive`, `leave`

Enum permitido não autoriza qualquer transição: as guardas de alteração, publicação, fecho e reabertura no servidor/SQL são normativas. Transições sem regra documentada ficam **por decidir**, não são habilitadas por esta SPEC.

## Campos, formatos e validações

Os schemas ligados são o contrato efectivo, incluindo refinamentos, campos opcionais/defaults e validação condicional. O inventário abaixo mostra as declarações encontradas; expressões multilinha e schemas derivados devem ser lidos na fonte, não inferidos apenas desta tabela.

| Campo | Declaração observada | Schema de origem |
| --- | --- | --- |
| `draft` | `["awaiting_authorization", "authorized", "cancelled"],` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `awaiting_authorization` | `["authorized", "draft", "cancelled"],` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `authorized` | `["processing", "partial", "completed", "cancelled"],` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `processing` | `["partial", "completed"],` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `partial` | `["processing", "completed"],` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `failed` | `[],` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `completed` | `[],` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `cancelled` | `[],` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `from` | `HrPaymentBatchStatus,` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `to` | `HrPaymentBatchStatus,` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `_decision` | `HrAssuranceDecision \| null \| undefined,` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `year` | `z.number().int().min(2000).max(2200),` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `month` | `z.number().int().min(1).max(12),` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `notes` | `z.string().trim().max(1000).optional().default(""),` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `payrollRunId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `batchId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `absenceId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `absenceType` | `hrAbsenceTypeSchema,` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `decision` | `z.enum(["validate", "reject"]),` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `reason` | `z.string().trim().min(3).max(1000),` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `paymentItemId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `reason` | `z.string().trim().min(5, "Indique o motivo (mínimo 5 caracteres).").max(500),` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `next` | `z.enum(["repay", "cancel"]),` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `enabled` | `true,` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `centerLatitude` | `null,` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `centerLongitude` | `null,` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `geofenceRadiusM` | `150,` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `maxLocationAccuracyM` | `100,` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `requireLocation` | `false,` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `storeExactLocation` | `false,` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `checkinEarlyMinutes` | `20,` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `checkinLateMinutes` | `20,` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `checkoutEarlyMinutes` | `20,` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `checkoutLateMinutes` | `60,` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `autoApproveScore` | `70,` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `reviewScore` | `45,` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `occurrenceId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `purpose` | `hrQrPurposeSchema,` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `occurrenceId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `substituteTeacherId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `reason` | `z.string().trim().min(3).max(1000),` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `occurrenceId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `name` | `z.string().trim().min(1).max(120).default("Política padrão"),` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `lateGraceMinutes` | `z.number().int().min(0).max(120),` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `earlyLeaveGraceMinutes` | `z.number().int().min(0).max(120),` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `minimumAttendancePercent` | `z.number().min(0).max(100),` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `outsideGraceMode` | `z.enum(["review", "proportional"]),` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `iban` | `string \| null \| undefined,` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `accountNumber` | `string \| null \| undefined,` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `destinationReference` | `string \| null \| undefined,` | [schemas.ts](../../../src/features/hr/schemas.ts) |
| `method` | `string,` | [schemas.ts](../../../src/features/hr/schemas.ts) |

## Regras de negócio e fonte

Salário segue contrato/tabela e política configurados; dados bancários sensíveis ficam no servidor; aprovação/pagamento/anulação exigem MFA e auditoria.

Fonte: implementação e skills canónicos, `DATABASE_RULES.md`, configuração efectiva da escola e SPEC temática quando ligada. Regras académicas/financeiras sem fundamento institucional confirmado ficam **por decidir**.

Especificação complementar: [SGA_GATE_QR_LESSON_ATTENDANCE_PAYROLL_SPEC.md](../SGA_GATE_QR_LESSON_ATTENDANCE_PAYROLL_SPEC.md).

## Modelo de dados e relações

Tabelas confirmadas no banco existente; este levantamento não propõe substituí-las:

| Tabela | Colunas existentes |
| --- | --- |
| `class_groups` | `id`, `school_id`, `academic_year_id`, `campus_id`, `grade_level_id`, `homeroom_teacher_id`, `code`, `name`, `shift`, `capacity`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `delegate_student_id`, `whatsapp_invite_url`, `whatsapp_group_name`, `room_id` |
| `class_subjects` | `id`, `school_id`, `class_group_id`, `subject_id`, `teacher_id`, `weekly_periods`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at` |
| `enrollments` | `id`, `school_id`, `academic_year_id`, `class_group_id`, `student_id`, `enrollment_number`, `enrolled_on`, `status`, `ended_on`, `end_reason`, `created_by`, `updated_by`, `created_at`, `updated_at`, `attendance_rate`, `final_average` |
| `hr_absence_events` | `id`, `school_id`, `employment_id`, `contract_id`, `absence_date`, `absence_type`, `duration_minutes`, `deduction_multiplier`, `source_type`, `source_id`, `reason`, `evidence_ref`, `validation_status`, `validated_at`, `validated_by`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version` |
| `hr_attendance_assurance_evidence` | `id`, `school_id`, `occurrence_id`, `purpose`, `actor_user_id`, `captured_at`, `qr_valid`, `identity_valid`, `time_valid`, `location_supplied`, `location_accuracy_m`, `distance_from_school_m`, `inside_geofence`, `latitude`, `longitude`, `device_integrity_provider`, `device_integrity_valid`, `assurance_score`, `decision`, `reasons`, `metadata` |
| `hr_attendance_assurance_policies` | `school_id`, `enabled`, `center_latitude`, `center_longitude`, `geofence_radius_m`, `max_location_accuracy_m`, `require_location`, `store_exact_location`, `checkin_early_minutes`, `checkin_late_minutes`, `checkout_early_minutes`, `checkout_late_minutes`, `qr_weight`, `identity_weight`, `time_weight`, `location_weight`, `device_integrity_weight`, `auto_approve_score`, `review_score`, `created_at`, `updated_at`, `updated_by`, `version` |
| `hr_contract_remuneration_policies` | `id`, `school_id`, `contract_id`, `remuneration_model`, `monthly_divisor_days`, `standard_workday_minutes`, `deduct_unjustified_absence`, `deduct_justified_unpaid_absence`, `deduct_justified_paid_absence`, `allow_validated_hour_additions`, `allow_validated_lesson_additions`, `allow_overtime_additions`, `policy_source`, `legal_reference`, `notes`, `active`, `created_at`, `updated_at`, `created_by`, `updated_by`, `version` |
| `hr_contract_salary_amendments` | `id`, `school_id`, `contract_id`, `request_id`, `effective_on`, `previous_base_salary_kz`, `new_base_salary_kz`, `salary_scale_step_id`, `applied_by`, `created_at` |
| `hr_contracts` | `id`, `school_id`, `employment_id`, `contract_number`, `contract_type`, `salary_type`, `base_salary_kz`, `hourly_rate_kz`, `lesson_hour_rate_kz`, `currency`, `starts_on`, `ends_on`, `payment_day`, `status`, `metadata`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version`, `salary_scale_step_id`, `salary_scale_snapshot_kz` |
| `hr_employments` | `id`, `school_id`, `person_id`, `position_id`, `department_id`, `employee_number`, `employment_type`, `status`, `hire_date`, `termination_date`, `work_location`, `weekly_hours`, `notes`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version` |
| `hr_payment_destinations` | `id`, `school_id`, `employment_id`, `method`, `beneficiary_name`, `bank_name`, `iban`, `account_number`, `destination_reference`, `is_primary`, `active`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version` |
| `hr_payroll_items` | `id`, `school_id`, `payroll_run_id`, `employment_id`, `contract_id`, `base_amount_kz`, `hourly_amount_kz`, `allowances_kz`, `bonuses_kz`, `overtime_kz`, `deductions_kz`, `gross_amount_kz`, `net_amount_kz`, `status`, `calculation_details`, `created_at`, `updated_at`, `created_by`, `updated_by`, `version` |
| `hr_payroll_payment_batches` | `id`, `school_id`, `payroll_run_id`, `batch_number`, `method`, `status`, `total_amount_kz`, `payable_count`, `blocked_count`, `prepared_at`, `prepared_by`, `authorized_at`, `authorized_by`, `execution_reference`, `notes`, `created_at`, `updated_at`, `created_by`, `updated_by`, `version` |
| `hr_payroll_payment_items` | `id`, `school_id`, `batch_id`, `payroll_item_id`, `employment_id`, `destination_id`, `beneficiary_name`, `destination_label`, `amount_kz`, `status`, `block_reason`, `provider_reference`, `failure_reason`, `paid_at`, `confirmed_by`, `metadata`, `created_at`, `updated_at`, `created_by`, `updated_by`, `version`, `cash_expense_id` |
| `hr_payroll_runs` | `id`, `school_id`, `competence_year`, `competence_month`, `period_start`, `period_end`, `status`, `total_gross_kz`, `total_deductions_kz`, `total_net_kz`, `approved_at`, `approved_by`, `paid_at`, `notes`, `created_at`, `updated_at`, `created_by`, `updated_by`, `version` |
| `hr_salary_change_requests` | `id`, `school_id`, `contract_id`, `requested_step_id`, `proposed_base_salary_kz`, `effective_on`, `reason`, `status`, `requested_by`, `reviewed_by`, `reviewed_at`, `review_reason`, `applied_at`, `created_at`, `updated_at` |
| `hr_salary_scale_steps` | `id`, `version_id`, `category_code`, `category_name`, `grade`, `monthly_base_kz`, `created_at` |
| `hr_salary_scale_versions` | `id`, `scale_id`, `version_label`, `effective_from`, `effective_until`, `status`, `approved_at`, `created_at` |
| `hr_salary_scales` | `id`, `code`, `name`, `jurisdiction`, `sector`, `source_title`, `source_reference`, `source_url`, `created_at` |
| `hr_teacher_attendance_policies` | `id`, `school_id`, `name`, `late_grace_minutes`, `early_leave_grace_minutes`, `minimum_attendance_percent`, `outside_grace_mode`, `active`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version` |
| `hr_teacher_lesson_occurrences` | `id`, `school_id`, `timetable_slot_id`, `class_subject_id`, `teacher_id`, `employment_id`, `contract_id`, `lesson_date`, `scheduled_starts_at`, `scheduled_ends_at`, `actual_started_at`, `actual_ended_at`, `quantity`, `status`, `evidence_method`, `evidence_ref`, `confirmed_at`, `confirmed_by`, `compensation_event_id`, `notes`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version`, `occurrence_kind`, `original_teacher_id`, `adjustment_reason`, `late_minutes`, `early_leave_minutes`, `attendance_percent`, `payable_quantity`, `attendance_exception_status`, `review_decision`, `review_reason`, `reviewed_by`, `reviewed_at` |
| `hr_teacher_qr_sessions` | `id`, `school_id`, `occurrence_id`, `purpose`, `token_hash`, `issued_at`, `expires_at`, `used_at`, `used_by`, `status`, `created_at`, `created_by`, `revoked_at`, `revoked_by`, `metadata` |
| `people` | `id`, `school_id`, `full_name`, `preferred_name`, `date_of_birth`, `sex`, `national_id`, `email`, `phone`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `photo_path`, `photo_url`, `deleted_at`, `user_id`, `province`, `municipality`, `commune`, `address` |
| `siga_attendance_sessions` | `id`, `school_id`, `academic_year_id`, `class_group_id`, `subject_id`, `teacher_id`, `timetable_slot_id`, `lesson_date`, `period_number`, `starts_at`, `ends_at`, `status`, `notes`, `created_at`, `created_by`, `updated_at`, `updated_by` |
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
- `enrollments` → `academic_years` (`enrollments_school_id_academic_year_id_fkey`)
- `enrollments` → `class_groups` (`enrollments_school_id_class_group_id_fkey`)
- `enrollments` → `schools` (`enrollments_school_id_fkey`)
- `enrollments` → `students` (`enrollments_school_id_student_id_fkey`)
- `hr_absence_events` → `hr_contracts` (`hr_absence_events_contract_id_fkey`)
- `hr_absence_events` → `hr_employments` (`hr_absence_events_employment_id_fkey`)
- `hr_absence_events` → `schools` (`hr_absence_events_school_id_fkey`)
- `hr_attendance_assurance_evidence` → `hr_teacher_lesson_occurrences` (`hr_attendance_assurance_evidence_occurrence_id_fkey`)
- `hr_attendance_assurance_evidence` → `schools` (`hr_attendance_assurance_evidence_school_id_fkey`)
- `hr_attendance_assurance_policies` → `schools` (`hr_attendance_assurance_policies_school_id_fkey`)
- `hr_contract_remuneration_policies` → `hr_contracts` (`hr_contract_remuneration_policies_contract_id_fkey`)
- `hr_contract_remuneration_policies` → `schools` (`hr_contract_remuneration_policies_school_id_fkey`)
- `hr_contract_salary_amendments` → `hr_contracts` (`hr_contract_salary_amendments_contract_id_fkey`)
- `hr_contract_salary_amendments` → `hr_salary_change_requests` (`hr_contract_salary_amendments_request_id_fkey`)
- `hr_contract_salary_amendments` → `hr_salary_scale_steps` (`hr_contract_salary_amendments_salary_scale_step_id_fkey`)
- `hr_contract_salary_amendments` → `schools` (`hr_contract_salary_amendments_school_id_fkey`)
- `hr_contracts` → `hr_employments` (`hr_contracts_employment_id_fkey`)
- `hr_contracts` → `hr_salary_scale_steps` (`hr_contracts_salary_scale_step_id_fkey`)
- `hr_contracts` → `schools` (`hr_contracts_school_id_fkey`)
- `hr_employments` → `hr_departments` (`hr_employments_department_id_fkey`)
- `hr_employments` → `hr_positions` (`hr_employments_position_id_fkey`)
- `hr_employments` → `people` (`hr_employments_person_id_fkey`)
- `hr_employments` → `schools` (`hr_employments_school_id_fkey`)
- `hr_payment_destinations` → `hr_employments` (`hr_payment_destinations_employment_id_fkey`)
- `hr_payment_destinations` → `schools` (`hr_payment_destinations_school_id_fkey`)
- `hr_payroll_items` → `hr_contracts` (`hr_payroll_items_contract_id_fkey`)
- `hr_payroll_items` → `hr_employments` (`hr_payroll_items_employment_id_fkey`)
- `hr_payroll_items` → `hr_payroll_runs` (`hr_payroll_items_payroll_run_id_fkey`)
- `hr_payroll_items` → `schools` (`hr_payroll_items_school_id_fkey`)
- `hr_payroll_payment_batches` → `hr_payroll_runs` (`hr_payroll_payment_batches_payroll_run_id_fkey`)
- `hr_payroll_payment_batches` → `schools` (`hr_payroll_payment_batches_school_id_fkey`)
- `hr_payroll_payment_items` → `hr_employments` (`hr_payroll_payment_items_employment_id_fkey`)
- `hr_payroll_payment_items` → `hr_payment_destinations` (`hr_payroll_payment_items_destination_id_fkey`)
- `hr_payroll_payment_items` → `hr_payroll_items` (`hr_payroll_payment_items_payroll_item_id_fkey`)
- `hr_payroll_payment_items` → `hr_payroll_payment_batches` (`hr_payroll_payment_items_batch_id_fkey`)
- `hr_payroll_payment_items` → `schools` (`hr_payroll_payment_items_school_id_fkey`)
- `hr_payroll_runs` → `schools` (`hr_payroll_runs_school_id_fkey`)
- `hr_salary_change_requests` → `hr_contracts` (`hr_salary_change_requests_contract_id_fkey`)
- `hr_salary_change_requests` → `hr_salary_scale_steps` (`hr_salary_change_requests_requested_step_id_fkey`)
- `hr_salary_change_requests` → `schools` (`hr_salary_change_requests_school_id_fkey`)
- `hr_salary_scale_steps` → `hr_salary_scale_versions` (`hr_salary_scale_steps_version_id_fkey`)
- `hr_salary_scale_versions` → `hr_salary_scales` (`hr_salary_scale_versions_scale_id_fkey`)
- `hr_teacher_attendance_policies` → `schools` (`hr_teacher_attendance_policies_school_id_fkey`)
- `hr_teacher_lesson_occurrences` → `class_subjects` (`hr_teacher_lesson_occurrences_class_subject_id_fkey`)
- `hr_teacher_lesson_occurrences` → `hr_compensation_events` (`hr_teacher_lesson_occurrences_compensation_event_id_fkey`)
- `hr_teacher_lesson_occurrences` → `hr_contracts` (`hr_teacher_lesson_occurrences_contract_id_fkey`)
- `hr_teacher_lesson_occurrences` → `hr_employments` (`hr_teacher_lesson_occurrences_employment_id_fkey`)
- `hr_teacher_lesson_occurrences` → `schools` (`hr_teacher_lesson_occurrences_school_id_fkey`)
- `hr_teacher_lesson_occurrences` → `teachers` (`hr_teacher_lesson_occurrences_original_teacher_id_fkey`)
- `hr_teacher_lesson_occurrences` → `teachers` (`hr_teacher_lesson_occurrences_teacher_id_fkey`)
- `hr_teacher_lesson_occurrences` → `timetable_slots` (`hr_teacher_lesson_occurrences_timetable_slot_id_fkey`)
- `hr_teacher_qr_sessions` → `hr_teacher_lesson_occurrences` (`hr_teacher_qr_sessions_occurrence_id_fkey`)
- `hr_teacher_qr_sessions` → `schools` (`hr_teacher_qr_sessions_school_id_fkey`)
- `people` → `schools` (`people_school_id_fkey`)
- `siga_attendance_sessions` → `academic_years` (`siga_attendance_sessions_academic_year_id_fkey`)
- `siga_attendance_sessions` → `class_groups` (`siga_attendance_sessions_class_group_id_fkey`)
- `siga_attendance_sessions` → `schools` (`siga_attendance_sessions_school_id_fkey`)
- `siga_attendance_sessions` → `subjects` (`siga_attendance_sessions_subject_id_fkey`)
- `siga_attendance_sessions` → `teachers` (`siga_attendance_sessions_teacher_id_fkey`)
- `siga_attendance_sessions` → `timetable_slots` (`siga_attendance_sessions_timetable_slot_id_fkey`)
- `subjects` → `curriculum_areas` (`subjects_curriculum_area_id_fkey`)
- `subjects` → `schools` (`subjects_school_id_fkey`)
- `subjects` → `subject_types` (`subjects_subject_type_id_fkey`)
- `teachers` → `people` (`teachers_school_id_person_id_fkey`)
- `teachers` → `schools` (`teachers_school_id_fkey`)

## Contratos de API e erros

| Função | Método | Entrada | Fonte |
| --- | --- | --- | --- |
| `listHrAbsencesForReview` | GET | `hrAbsenceTypeSchema` | [absences.ts](../../../src/features/hr/absences.ts) |
| `reviewHrAbsence` | POST | `reviewHrAbsenceInputSchema` | [absences.ts](../../../src/features/hr/absences.ts) |
| `getAttendanceAssurancePolicy` | GET | `Sem schema de entrada explícito neste bloco` | [attendance-assurance.ts](../../../src/features/hr/attendance-assurance.ts) |
| `saveAttendanceAssurancePolicy` | POST | `attendanceAssurancePolicySchema` | [attendance-assurance.ts](../../../src/features/hr/attendance-assurance.ts) |
| `listAttendanceAssuranceEvidence` | GET | `Sem schema de entrada explícito neste bloco` | [attendance-assurance.ts](../../../src/features/hr/attendance-assurance.ts) |
| `materializeTeacherLessons` | POST | `materializeTeacherLessonsInputSchema` | [materialize-lessons.ts](../../../src/features/hr/materialize-lessons.ts) |
| `upsertHrPaymentDestination` | POST | `upsertHrPaymentDestinationInputSchema` | [payments.ts](../../../src/features/hr/payments.ts) |
| `listHrPaymentDestinations` | GET | `Sem schema de entrada explícito neste bloco` | [payments.ts](../../../src/features/hr/payments.ts) |
| `createPayrollPaymentBatch` | POST | `payrollRunIdInputSchema` | [payments.ts](../../../src/features/hr/payments.ts) |
| `refreshPayrollPaymentBatch` | POST | `paymentBatchIdInputSchema` | [payments.ts](../../../src/features/hr/payments.ts) |
| `authorizePayrollPaymentBatch` | POST | `paymentBatchIdInputSchema` | [payments.ts](../../../src/features/hr/payments.ts) |
| `listPayrollPaymentBatches` | GET | `Sem schema de entrada explícito neste bloco` | [payments.ts](../../../src/features/hr/payments.ts) |
| `getPayrollPaymentBatchDetail` | GET | `paymentBatchIdInputSchema` | [payments.ts](../../../src/features/hr/payments.ts) |
| `confirmPayrollPaymentItem` | POST | `confirmPayrollPaymentItemInputSchema` | [payments.ts](../../../src/features/hr/payments.ts) |
| `reversePayrollPaymentItem` | POST | `reversePayrollPaymentItemInputSchema` | [payments.ts](../../../src/features/hr/payments.ts) |
| `createPayrollRun` | POST | `createPayrollRunInputSchema` | [payroll.ts](../../../src/features/hr/payroll.ts) |
| `calculatePayrollRun` | POST | `payrollRunIdInputSchema` | [payroll.ts](../../../src/features/hr/payroll.ts) |
| `approvePayrollRun` | POST | `payrollRunIdInputSchema` | [payroll.ts](../../../src/features/hr/payroll.ts) |
| `getPayrollRunDetail` | GET | `payrollRunIdInputSchema` | [payroll.ts](../../../src/features/hr/payroll.ts) |
| `applyApprovedHrSalaryChange` | POST | `inputSchema` | [salary-amendments.ts](../../../src/features/hr/salary-amendments.ts) |
| `listHrSalaryChangeRequests` | GET | `Sem schema de entrada explícito neste bloco` | [salary-amendments.ts](../../../src/features/hr/salary-amendments.ts) |
| `listHrContractsForSalaryChange` | GET | `Sem schema de entrada explícito neste bloco` | [salary-amendments.ts](../../../src/features/hr/salary-amendments.ts) |
| `listHrSalaryAmendments` | GET | `Sem schema de entrada explícito neste bloco` | [salary-amendments.ts](../../../src/features/hr/salary-amendments.ts) |
| `listApprovedSalaryScales` | GET | `Sem schema de entrada explícito neste bloco` | [salary-catalog.ts](../../../src/features/hr/salary-catalog.ts) |
| `requestHrSalaryChange` | POST | `salaryRequestSchema` | [salary-changes.ts](../../../src/features/hr/salary-changes.ts) |
| `reviewHrSalaryChange` | POST | `reviewSchema` | [salary-changes.ts](../../../src/features/hr/salary-changes.ts) |
| `getHrDashboard` | GET | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/hr/server.ts) |
| `listHrPayrollRuns` | GET | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/hr/server.ts) |
| `assignTeacherSubstitute` | POST | `assignTeacherSubstituteInputSchema` | [teacher-lesson-exceptions.ts](../../../src/features/hr/teacher-lesson-exceptions.ts) |
| `createExtraTeacherLesson` | POST | `createExtraTeacherLessonInputSchema` | [teacher-lesson-exceptions.ts](../../../src/features/hr/teacher-lesson-exceptions.ts) |
| `evaluateTeacherLessonAttendance` | POST | `occurrenceIdInputSchema` | [teacher-lesson-exceptions.ts](../../../src/features/hr/teacher-lesson-exceptions.ts) |
| `getTeacherAttendancePolicy` | GET | `Sem schema de entrada explícito neste bloco` | [teacher-lesson-exceptions.ts](../../../src/features/hr/teacher-lesson-exceptions.ts) |
| `saveTeacherAttendancePolicy` | POST | `teacherAttendancePolicyInputSchema` | [teacher-lesson-exceptions.ts](../../../src/features/hr/teacher-lesson-exceptions.ts) |
| `listHrTeacherLessonOccurrences` | GET | `Sem schema de entrada explícito neste bloco` | [teacher-lessons.ts](../../../src/features/hr/teacher-lessons.ts) |
| `listTeacherQrOccurrences` | GET | `Sem schema de entrada explícito neste bloco` | [teacher-lessons.ts](../../../src/features/hr/teacher-lessons.ts) |
| `listMyTeacherLessonOccurrences` | GET | `Sem schema de entrada explícito neste bloco` | [teacher-lessons.ts](../../../src/features/hr/teacher-lessons.ts) |
| `openMyLessonClassroom` | POST | `occurrenceIdInputSchema` | [teacher-lessons.ts](../../../src/features/hr/teacher-lessons.ts) |
| `createTeacherLessonQr` | POST | `createTeacherLessonQrInputSchema` | [teacher-lessons.ts](../../../src/features/hr/teacher-lessons.ts) |
| `redeemTeacherLessonQr` | POST | `redeemTeacherLessonQrInputSchema` | [teacher-lessons.ts](../../../src/features/hr/teacher-lessons.ts) |
| `listMyTeachingSchools` | GET | `Sem schema de entrada explícito neste bloco` | [teacher-schools.ts](../../../src/features/hr/teacher-schools.ts) |

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

- [absence-review.test.ts](../../../tests/hr/absence-review.test.ts)
- [agenda-lesson-actions-contract.test.ts](../../../tests/hr/agenda-lesson-actions-contract.test.ts)
- [missing-table.test.ts](../../../tests/hr/missing-table.test.ts)
- [payment-confirm-race.test.ts](../../../tests/hr/payment-confirm-race.test.ts)
- [payment-controls.test.ts](../../../tests/hr/payment-controls.test.ts)
- [payroll-detail.test.ts](../../../tests/hr/payroll-detail.test.ts)
- [payroll-reversal.test.ts](../../../tests/hr/payroll-reversal.test.ts)
- [salary-change-aal2.test.ts](../../../tests/hr/salary-change-aal2.test.ts)
- [schemas-contract.test.ts](../../../tests/hr/schemas-contract.test.ts)

**Riscos/pendências:** jornada anual e A/B autenticado exigem staging; concorrência PostgreSQL, fornecedores, restauro, artefactos oficiais extensos e dispositivos reais não ficam certificados por mocks/PGlite. Consultar a matriz e o progresso para o resultado efectivamente executado.

## Fontes e navegação

- [financeiro.rh.faltas.tsx](../../../src/routes/financeiro_.rh_.faltas.tsx)
- [financeiro.rh.folha.tsx](../../../src/routes/financeiro_.rh_.folha.tsx)
- [financeiro.rh.pagamentos.tsx](../../../src/routes/financeiro_.rh_.pagamentos.tsx)
- [financeiro.rh.presenca.tsx](../../../src/routes/financeiro_.rh_.presenca.tsx)
- [financeiro.rh.tsx](../../../src/routes/financeiro_.rh.tsx)
- [professor.presenca.tsx](../../../src/routes/professor.presenca.tsx)
- [schemas.ts](../../../src/features/hr/schemas.ts)
- [server.ts](../../../src/features/hr/server.ts)

[Índice](../README.md) · [Contratos transversais](../CONTRATOS_TRANSVERSAIS.md)
