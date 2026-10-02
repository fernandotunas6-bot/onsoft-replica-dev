# Inventário — promessa vs produto

**Gerado em 2026-09-25 por `npm run siga:inventario`. Não editar à mão.**

Cruza o que existe na base com o que o código refere. Ver o cabeçalho de `scripts/siga/inventario-promessa-vs-produto.mjs` para o método e para o limite da detecção — que é textual, e por isso a coluna certa a ler é *referências*, não *uso*.

| Estado | Tabelas | O que significa |
|---|---:|---|
| viva | 72 | código e dados |
| sem dados | 63 | há código, não há linhas — por estrear |
| **SEM LEITOR** | 7 | **há linhas e nenhuma referência em `src/`** |
| ORFA | 20 | nem código nem dados |

## SEM LEITOR (7)

| Tabela | Linhas | Ficheiros | Escreve | Por RPC | Triggers |
|---|---:|---:|:-:|---|---:|
| `reserved_subdomains` | 40 | 0 | — | — | 0 |
| `notifications` | 16 | 0 | — | — | 0 |
| `module_catalog` | 8 | 0 | — | — | 0 |
| `school_modules` | 8 | 0 | — | — | 1 |
| `announcements` | 2 | 0 | — | — | 1 |
| `financial_rule_sets` | 1 | 0 | — | — | 1 |
| `grading_scales` | 1 | 0 | — | — | 1 |

## ORFA (20)

| Tabela | Linhas | Ficheiros | Escreve | Por RPC | Triggers |
|---|---:|---:|:-:|---|---:|
| `assessment_key_subjects` | 0 | 0 | — | — | 0 |
| `attendance_records` | 0 | 0 | — | — | 1 |
| `attendance_session_roster` | 0 | 0 | — | — | 0 |
| `attendance_sessions` | 0 | 0 | — | — | 3 |
| `document_signatures` | 0 | 0 | — | — | 2 |
| `email_aliases` | 0 | 0 | — | — | 0 |
| `finance_invoice_events` | 0 | 0 | — | — | 0 |
| `grade_sheet_rows` | 0 | 0 | — | — | 0 |
| `grade_sheets` | 0 | 0 | — | — | 2 |
| `hr_payroll_item_components` | 0 | 0 | — | — | 1 |
| `import_templates` | 0 | 0 | — | — | 0 |
| `issued_documents` | 0 | 0 | — | — | 2 |
| `mailboxes` | 0 | 0 | — | — | 0 |
| `report_cards` | 0 | 0 | — | — | 1 |
| `school_shift_slots` | 0 | 0 | — | — | 1 |
| `school_slug_history` | 0 | 0 | — | — | 0 |
| `slug_reservations` | 0 | 0 | — | — | 0 |
| `student_status_events` | 0 | 0 | — | — | 0 |
| `subscription_addons` | 0 | 0 | — | — | 0 |
| `teacher_subjects` | 0 | 0 | — | — | 1 |

## sem dados (63)

| Tabela | Linhas | Ficheiros | Escreve | Por RPC | Triggers |
|---|---:|---:|:-:|---|---:|
| `alumni_communication_preferences` | 0 | 2 | sim | — | 0 |
| `alumni_contributions` | 0 | 2 | sim | — | 0 |
| `alumni_education_stages` | 0 | 2 | sim | — | 0 |
| `alumni_engagements` | 0 | 2 | sim | — | 0 |
| `alumni_event_registrations` | 0 | 4 | sim | — | 0 |
| `alumni_events` | 0 | 2 | sim | — | 0 |
| `alumni_experiences` | 0 | 2 | sim | — | 0 |
| `alumni_mentorships` | 0 | 4 | sim | — | 0 |
| `alumni_opportunities` | 0 | 3 | sim | — | 0 |
| `alumni_opportunity_applications` | 0 | 4 | sim | — | 0 |
| `alumni_portfolio_items` | 0 | 1 | sim | — | 0 |
| `alumni_privacy_audit` | 0 | 1 | sim | — | 0 |
| `alumni_profiles` | 0 | 10 | sim | — | 2 |
| `alumni_survey_responses` | 0 | 2 | sim | — | 0 |
| `alumni_surveys` | 0 | 2 | sim | — | 0 |
| `assessment_rule_sets` | 0 | 1 | — | — | 0 |
| `communication_dispatches` | 0 | 5 | sim | — | 0 |
| `communication_events` | 0 | 1 | sim | — | 0 |
| `contact_verification_profiles` | 0 | 1 | sim | — | 1 |
| `hr_absence_events` | 0 | 1 | sim | — | 3 |
| `hr_attendance_assurance_evidence` | 0 | 1 | — | `hr_evaluate_teacher_attendance_assurance`, `hr_redeem_teacher_qr` | 0 |
| `hr_attendance_assurance_policies` | 0 | 1 | sim | `hr_evaluate_teacher_attendance_assurance` | 1 |
| `hr_compensation_events` | 0 | 0 | — | `hr_redeem_teacher_qr` | 4 |
| `hr_contract_remuneration_policies` | 0 | 2 | — | — | 3 |
| `hr_contract_salary_amendments` | 0 | 1 | — | `hr_apply_approved_salary_change` | 2 |
| `hr_contracts` | 0 | 5 | — | `hr_apply_approved_salary_change`, `hr_assign_teacher_substitute`, `hr_calculate_payroll_run`, `hr_create_extra_teacher_lesson`, `hr_materialize_teacher_lessons`, `hr_redeem_teacher_qr` | 3 |
| `hr_departments` | 0 | 1 | sim | — | 2 |
| `hr_employments` | 0 | 6 | sim | `hr_assign_teacher_substitute`, `hr_calculate_payroll_run`, `hr_create_extra_teacher_lesson`, `hr_create_payroll_payment_batch` | 2 |
| `hr_payment_destinations` | 0 | 1 | sim | `hr_create_payroll_payment_batch`, `hr_refresh_payroll_payment_batch` | 2 |
| `hr_payment_settings` | 0 | 0 | — | `hr_authorize_payroll_payment_batch`, `hr_create_payroll_payment_batch` | 1 |
| `hr_payroll_items` | 0 | 2 | sim | `hr_approve_payroll_run`, `hr_authorize_payroll_payment_batch`, `hr_create_payroll_payment_batch` | 3 |
| `hr_payroll_payment_batches` | 0 | 1 | sim | `hr_authorize_payroll_payment_batch`, `hr_create_payroll_payment_batch`, `hr_refresh_payroll_payment_batch` | 1 |
| `hr_payroll_payment_items` | 0 | 1 | sim | `hr_authorize_payroll_payment_batch`, `hr_create_payroll_payment_batch`, `hr_refresh_payroll_payment_batch` | 2 |
| `hr_payroll_runs` | 0 | 3 | sim | `hr_approve_payroll_run`, `hr_authorize_payroll_payment_batch`, `hr_calculate_payroll_run`, `hr_create_payroll_payment_batch`, `hr_create_payroll_run` | 8 |
| `hr_positions` | 0 | 1 | sim | — | 2 |
| `hr_salary_change_requests` | 0 | 2 | sim | `hr_apply_approved_salary_change` | 2 |
| `hr_salary_scale_steps` | 0 | 1 | — | — | 1 |
| `hr_salary_scale_versions` | 0 | 1 | — | — | 2 |
| `hr_salary_scales` | 0 | 1 | — | — | 1 |
| `hr_teacher_attendance_policies` | 0 | 1 | sim | `hr_evaluate_teacher_lesson_attendance`, `hr_redeem_teacher_qr` | 1 |
| `hr_teacher_employment_links` | 0 | 0 | — | `hr_assign_teacher_substitute`, `hr_create_extra_teacher_lesson`, `hr_materialize_teacher_lessons` | 2 |
| `hr_teacher_lesson_occurrences` | 0 | 2 | sim | `hr_assign_teacher_substitute`, `hr_create_extra_teacher_lesson`, `hr_evaluate_teacher_attendance_assurance`, `hr_evaluate_teacher_lesson_attendance`, `hr_materialize_teacher_lessons`, `hr_redeem_teacher_qr` | 2 |
| `hr_teacher_qr_sessions` | 0 | 1 | sim | `hr_redeem_teacher_qr` | 1 |
| `notification_preferences` | 0 | 1 | — | — | 0 |
| `person_documents` | 0 | 2 | sim | — | 1 |
| `person_roles` | 0 | 2 | sim | — | 0 |
| `program_subjects` | 0 | 1 | sim | — | 2 |
| `school_announcements` | 0 | 2 | sim | — | 1 |
| `school_branding` | 0 | 3 | sim | — | 0 |
| `school_email_routes` | 0 | 3 | sim | — | 0 |
| `school_integration_secrets` | 0 | 1 | sim | — | 0 |
| `siga_access_cards` | 0 | 2 | sim | — | 0 |
| `siga_attendance_audits` | 0 | 1 | sim | — | 0 |
| `siga_attendance_justifications` | 0 | 1 | sim | — | 0 |
| `siga_attendance_records` | 0 | 4 | sim | — | 0 |
| `siga_cash_expenses` | 0 | 2 | sim | — | 1 |
| `siga_lesson_meetings` | 0 | 1 | sim | — | 0 |
| `siga_turnstile_devices` | 0 | 3 | sim | — | 0 |
| `staff_module_grants` | 0 | 2 | sim | — | 0 |
| `student_academic_history` | 0 | 2 | sim | — | 0 |
| `tenant_provisioning` | 0 | 1 | sim | — | 0 |
| `user_communication_preferences` | 0 | 1 | sim | — | 1 |
| `verification_otps` | 0 | 1 | sim | — | 0 |

## viva (72)

| Tabela | Linhas | Ficheiros | Escreve | Por RPC | Triggers |
|---|---:|---:|:-:|---|---:|
| `audit_logs` | 26458 | 3 | sim | — | 1 |
| `role_permissions` | 22782 | 1 | sim | — | 1 |
| `import_rows` | 4400 | 1 | sim | — | 0 |
| `document_sequences` | 810 | 1 | sim | `next_document_number_service` | 1 |
| `roles` | 712 | 6 | sim | — | 1 |
| `people` | 489 | 29 | sim | `hr_create_payroll_payment_batch`, `register_student` | 2 |
| `import_audits` | 360 | 1 | sim | — | 0 |
| `import_table_specs` | 157 | 1 | — | — | 0 |
| `school_settings` | 95 | 8 | sim | `delete_sga_assessment_item`, `register_payment` | 2 |
| `member_roles` | 94 | 5 | sim | — | 1 |
| `profiles` | 94 | 10 | sim | — | 0 |
| `school_memberships` | 94 | 10 | sim | — | 2 |
| `saas_audit_logs` | 92 | 9 | sim | — | 0 |
| `enrollment_forms` | 90 | 3 | sim | — | 1 |
| `schools` | 90 | 24 | sim | — | 2 |
| `tenants` | 90 | 9 | sim | — | 0 |
| `subscriptions` | 89 | 2 | sim | — | 0 |
| `tenant_domains` | 89 | 10 | sim | — | 0 |
| `tenant_usage` | 89 | 2 | sim | — | 0 |
| `permissions` | 74 | 1 | — | — | 0 |
| `academic_years` | 51 | 14 | sim | `enroll_student`, `save_academic_calendar` | 2 |
| `students` | 45 | 23 | sim | `enroll_student`, `register_student` | 2 |
| `finance_gateway_webhook_events` | 44 | 5 | sim | — | 0 |
| `academic_levels` | 42 | 3 | sim | — | 1 |
| `campuses` | 42 | 5 | sim | — | 1 |
| `grade_levels` | 41 | 9 | sim | — | 1 |
| `programs` | 41 | 8 | sim | — | 1 |
| `fee_items` | 38 | 5 | sim | — | 1 |
| `finance_invoices` | 38 | 11 | sim | `register_payment`, `reverse_receipt` | 2 |
| `class_groups` | 36 | 23 | sim | `enroll_student`, `hr_materialize_teacher_lessons` | 3 |
| `enrollments` | 36 | 22 | sim | `enroll_student` | 2 |
| `fee_plans` | 36 | 3 | sim | — | 1 |
| `finance_contracts` | 36 | 6 | sim | — | 1 |
| `siga_attendance_sessions` | 36 | 7 | sim | — | 0 |
| `finance_payment_plans` | 35 | 2 | sim | — | 0 |
| `finance_receipts` | 31 | 7 | sim | `register_payment`, `reverse_receipt` | 1 |
| `school_integrations` | 23 | 5 | sim | — | 0 |
| `enrollment_applications` | 20 | 5 | sim | — | 1 |
| `curriculum_areas` | 18 | 1 | sim | — | 1 |
| `timetable_slots` | 17 | 9 | sim | `create_timetable_slot_guarded`, `hr_materialize_teacher_lessons`, `hr_redeem_teacher_qr`, `update_timetable_slot_guarded` | 4 |
| `import_jobs` | 16 | 2 | sim | — | 0 |
| `siga_direct_messages` | 16 | 1 | sim | — | 0 |
| `siga_files` | 14 | 3 | sim | — | 0 |
| `siga_file_events` | 12 | 1 | sim | — | 0 |
| `student_status_history` | 12 | 2 | sim | — | 0 |
| `subject_types` | 12 | 1 | sim | — | 1 |
| `class_subjects` | 10 | 15 | sim | `create_timetable_slot_guarded`, `delete_sga_assessment_item`, `hr_create_extra_teacher_lesson`, `hr_materialize_teacher_lessons`, `update_timetable_slot_guarded` | 2 |
| `subjects` | 10 | 13 | sim | — | 3 |
| `grade_items` | 9 | 4 | sim | — | 0 |
| `grade_scores` | 9 | 3 | sim | — | 2 |
| `teacher_availability` | 7 | 1 | — | `replace_teacher_availability` | 1 |
| `teachers` | 7 | 15 | sim | `delete_sga_assessment_item`, `hr_evaluate_teacher_attendance_assurance`, `hr_redeem_teacher_qr` | 2 |
| `terms` | 7 | 13 | sim | `hr_materialize_teacher_lessons`, `save_academic_calendar` | 2 |
| `rooms` | 6 | 4 | sim | — | 1 |
| `school_shifts` | 6 | 1 | sim | — | 1 |
| `academic_schedules` | 4 | 1 | sim | `hr_redeem_teacher_qr` | 1 |
| `plans` | 4 | 3 | — | — | 0 |
| `platform_admins` | 4 | 2 | sim | — | 0 |
| `gradebooks` | 3 | 3 | sim | — | 1 |
| `calendar_feed_tokens` | 2 | 1 | sim | — | 0 |
| `curriculum_subjects` | 2 | 0 | — | `replace_curriculum_subjects` | 1 |
| `document_templates` | 2 | 2 | — | — | 1 |
| `school_billing_settings` | 2 | 1 | sim | — | 2 |
| `student_guardians` | 2 | 9 | sim | `register_student` | 1 |
| `curricula` | 1 | 1 | sim | — | 1 |
| `document_requests` | 1 | 4 | sim | — | 2 |
| `school_invitations` | 1 | 1 | sim | — | 1 |
| `siga_access_logs` | 1 | 2 | sim | — | 0 |
| `siga_assessment_items` | 1 | 4 | sim | `delete_sga_assessment_item` | 2 |
| `siga_assessment_scores` | 1 | 4 | sim | `delete_sga_assessment_item` | 3 |
| `siga_lesson_plan_components` | 1 | 1 | sim | — | 0 |
| `siga_lesson_plans` | 1 | 1 | sim | — | 1 |
