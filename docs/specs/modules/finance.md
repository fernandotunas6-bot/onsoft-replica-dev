# Tesouraria escolar

**Data:** 08/10/2026. **Estado:** implementação presente; aceitação integrada por concluir. As alterações específicas são distinguidas no documento de correcções.

## Objectivo e âmbito

Tesouraria escolar; operar dentro da responsabilidade escolar/plataforma definida pela arquitectura, sem duplicar a fonte de verdade de outro módulo.

## Estado actual e comportamento pretendido

**Implementado:** os ficheiros, contratos e tabelas abaixo estão inventariados. A auditoria anterior e os testes locais identificam provas parciais. Não implica que todas as operações estejam completas.

**Proposto:** concluir em staging os critérios de persistência, recuperação e isolamento indicados nesta SPEC. **Por decidir:** regras da instituição não presentes na configuração/documentação e acessos externos indispensáveis.

## Perfis e permissões

Administrador/Tesouraria escrevem; aluno/encarregado consultam âmbito próprio. O cargo não substitui grant por módulo nem âmbito escolar. O servidor volta a autorizar cada pedido.

## Pré-condições e dependências

Sessão válida, vínculo activo e escola seleccionada autorizada; configurações do ano/turma/contrato quando usadas. Escrita sensível exige AAL2. Relações carregadas de outra escola são recusadas. Testes com escrita exigem ambiente isolado e destinos sintéticos.

## Fluxo principal e alternativas

Configurar plano → emitir obrigação → receber/confirmar pagamento → emitir recibo → reconciliar saldo → estornar com motivo.

Sem pré-requisito: explicar a falta e ligar à configuração responsável. Sem permissão: impedir o pedido. Erro recuperável: preservar o preenchimento, mostrar o motivo e permitir repetir sem duplicar. Conflito de versão/capacidade: reler o contexto e pedir revisão antes de gravar. Transporte externo indisponível: não anunciar entrega/sucesso fictícios.

## Estados e transições

- `academic_years.status`: `active`, `archived`, `closed`, `draft`
- `class_groups.shift`: `afternoon`, `evening`, `full_day`, `morning`
- `class_groups.status`: `active`, `archived`, `closed`, `draft`
- `enrollments.status`: `active`, `cancelled`, `completed`, `pending`, `transferred`
- `fee_items.frequency`: `annual`, `monthly`, `once`, `term`
- `fee_items.kind`: `enrollment`, `other`, `service`, `tuition`
- `fee_plans.status`: `active`, `draft`, `retired`
- `finance_contracts.status`: `active`, `cancelled`
- `finance_invoices.status`: `cancelled`, `open`, `paid`, `partially_paid`
- `finance_payment_plans.channel`: `cash`, `express`, `multicaixa`, `multicaixa_express`, `transfer`, `unitel_money`
- `finance_payment_plans.status`: `cancelled`, `pending_gateway`, `scheduled`, `settled`
- `finance_receipts.payment_method`: `bank_transfer`, `card`, `cash`, `other`
- `finance_receipts.status`: `issued`, `reversed`
- `hr_payroll_payment_items.status`: `authorized`, `blocked`, `cancelled`, `failed`, `paid`, `pending`, `processing`
- `people.sex`: `female`, `male`, `other`, `undisclosed`
- `people.status`: `active`, `archived`, `inactive`
- `programs.grading_profile`: `20_ects`, `components`, `components`, `frequencia_exame`, `gpa4`, `scale`, `scale`, `so_exame`
- `programs.kind`: `general`, `postgraduate`, `professional`, `technical`, `undergraduate`
- `school_integrations.status`: `configured`, `connected`, `disconnected`, `error`
- `school_memberships.status`: `active`, `invited`, `revoked`, `suspended`
- `schools.status`: `active`, `archived`, `setup`, `suspended`
- `siga_cash_expenses.method`: `cash`, `express`, `multicaixa`, `multicaixa_express`, `transfer`, `unitel_money`
- `siga_cash_expenses.status`: `posted`, `reversed`
- `student_guardians.relationship`: `father`, `grandparent`, `guardian`, `mother`, `other`, `sibling`
- `students.status`: `active`, `applicant`, `cancelled`, `graduated`, `inactive`, `locked`, `suspended`, `transferred`, `withdrawn`

Enum permitido não autoriza qualquer transição: as guardas de alteração, publicação, fecho e reabertura no servidor/SQL são normativas. Transições sem regra documentada ficam **por decidir**, não são habilitadas por esta SPEC.

## Campos, formatos e validações

Os schemas ligados são o contrato efectivo, incluindo refinamentos, campos opcionais/defaults e validação condicional. O inventário abaixo mostra as declarações encontradas; expressões multilinha e schemas derivados devem ser lidos na fonte, não inferidos apenas desta tabela.

| Campo              | Declaração observada                                                  | Schema de origem                                                                       |
| ------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `reference`        | `z.string().trim().min(5).max(160),`                                  | [gateway-webhook-schemas.ts](../../../src/features/finance/gateway-webhook-schemas.ts) |
| `amount`           | `z.number().positive(),`                                              | [gateway-webhook-schemas.ts](../../../src/features/finance/gateway-webhook-schemas.ts) |
| `invoiceId`        | `z.string().uuid().optional(),`                                       | [gateway-webhook-schemas.ts](../../../src/features/finance/gateway-webhook-schemas.ts) |
| `planId`           | `z.string().uuid().optional(),`                                       | [gateway-webhook-schemas.ts](../../../src/features/finance/gateway-webhook-schemas.ts) |
| `entity`           | `z.string().trim().max(20).optional(),`                               | [gateway-webhook-schemas.ts](../../../src/features/finance/gateway-webhook-schemas.ts) |
| `channel`          | `z`                                                                   | [gateway-webhook-schemas.ts](../../../src/features/finance/gateway-webhook-schemas.ts) |
| `externalId`       | `z.string().trim().min(6).max(120),`                                  | [gateway-webhook-schemas.ts](../../../src/features/finance/gateway-webhook-schemas.ts) |
| `limit`            | `z.number().int().min(1).max(250).default(100),`                      | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `invoiceId`        | `z.string().uuid(),`                                                  | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `receiptNumber`    | `z.string().trim().max(64).optional(),`                               | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `amount`           | `z.number().positive().max(999_999_999_999.99),`                      | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `method`           | `z.enum([`                                                            | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `reference`        | `z.string().trim().max(160).optional(),`                              | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `paidAt`           | `z.string().datetime({ offset: true }).optional(),`                   | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `studentId`        | `z.string().uuid(),`                                                  | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `dueOn`            | `z.string().date(),`                                                  | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `issuedOn`         | `z.string().date().optional(),`                                       | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `description`      | `z.string().trim().max(500).optional(),`                              | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `category`         | `z.string().trim().min(1).max(80),`                                   | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `amount`           | `z.number().positive().max(999_999_999_999.99).optional(),`           | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `documentNumber`   | `z.string().trim().min(1).max(64),`                                   | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `description`      | `z.string().trim().min(1).max(500),`                                  | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `category`         | `z.string().trim().min(1).max(80),`                                   | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `amount`           | `z.number().positive().max(999_999_999_999.99),`                      | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `method`           | `z.enum([`                                                            | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `reference`        | `z.string().trim().max(160).optional(),`                              | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `occurredAt`       | `z.string().datetime({ offset: true }).optional(),`                   | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `cashEntryId`      | `z.string().uuid(),`                                                  | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `reason`           | `z.string().trim().min(5).max(300),`                                  | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `invoiceId`        | `z.string().uuid(),`                                                  | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `reason`           | `z.string().trim().min(5, "Indique o motivo da anulação.").max(300),` | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `planId`           | `z.string().uuid(),`                                                  | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `planName`         | `z.string().trim().min(2).max(120).default("Plano padrão"),`          | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `tuitionAmount`    | `z.number().positive().max(999_999_999_999.99),`                      | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `enrollmentAmount` | `z.number().positive().max(999_999_999_999.99),`                      | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `invoiceId`        | `z.string().uuid().optional(),`                                       | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `studentId`        | `z.string().uuid().optional(),`                                       | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `channel`          | `z.enum([`                                                            | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `installments`     | `z.number().int().min(1).max(24).default(1),`                         | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `reference`        | `z.string().trim().max(160).optional(),`                              | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `notes`            | `z.string().trim().max(500).optional(),`                              | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `schoolName`       | `string;`                                                             | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `studentName`      | `string;`                                                             | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `invoiceNumber`    | `string;`                                                             | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `receiptNumber`    | `string;`                                                             | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `amountLabel`      | `string;`                                                             | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `invoices`         | `Array<{ status: string; due_on?: string \| null }>,`                 | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |
| `studentId`        | `z.string().uuid(),`                                                  | [schemas.ts](../../../src/features/finance/schemas.ts)                                 |

## Regras de negócio e fonte

Valor, desconto e multa seguem regras activas; provider confirma no backend; estorno e webhook repetido não duplicam movimentos.

Fonte: implementação e skills canónicos, `DATABASE_RULES.md`, configuração efectiva da escola e SPEC temática quando ligada. Regras académicas/financeiras sem fundamento institucional confirmado ficam **por decidir**.

## Modelo de dados e relações

Tabelas confirmadas no banco existente; este levantamento não propõe substituí-las:

| Tabela                           | Colunas existentes                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `academic_years`                 | `id`, `school_id`, `name`, `starts_on`, `ends_on`, `status`, `created_at`, `created_by`, `updated_by`                                                                                                                                                                                                                                                                                                   |
| `class_groups`                   | `id`, `school_id`, `academic_year_id`, `campus_id`, `grade_level_id`, `homeroom_teacher_id`, `code`, `name`, `shift`, `capacity`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `delegate_student_id`, `whatsapp_invite_url`, `whatsapp_group_name`, `room_id`                                                                                                                      |
| `enrollments`                    | `id`, `school_id`, `academic_year_id`, `class_group_id`, `student_id`, `enrollment_number`, `enrolled_on`, `status`, `ended_on`, `end_reason`, `created_by`, `updated_by`, `created_at`, `updated_at`, `attendance_rate`, `final_average`                                                                                                                                                               |
| `fee_items`                      | `id`, `school_id`, `fee_plan_id`, `code`, `name`, `kind`, `amount`, `frequency`, `is_active`, `created_at`, `grade_level_id`                                                                                                                                                                                                                                                                            |
| `fee_plans`                      | `id`, `school_id`, `academic_year_id`, `code`, `name`, `currency_code`, `status`, `created_at`                                                                                                                                                                                                                                                                                                          |
| `finance_contracts`              | `id`, `school_id`, `enrollment_id`, `fee_plan_id`, `discount_percentage`, `status`, `created_by`, `created_at`                                                                                                                                                                                                                                                                                          |
| `finance_gateway_webhook_events` | `id`, `school_id`, `channel`, `http_status`, `ok`, `message`, `reference`, `invoice_id`, `amount`, `provider`, `dev_mode`, `external_id`, `created_at`                                                                                                                                                                                                                                                  |
| `finance_invoices`               | `id`, `school_id`, `contract_id`, `fee_item_id`, `invoice_number`, `competence_month`, `amount`, `discount_amount`, `due_date`, `status`, `issued_by`, `cancelled_at`, `cancelled_by`, `cancellation_reason`, `created_at`, `penalty_amount`                                                                                                                                                            |
| `finance_payment_plans`          | `id`, `school_id`, `invoice_id`, `student_id`, `channel`, `installments`, `reference`, `status`, `notes`, `created_at`, `updated_at`, `created_by`, `updated_by`                                                                                                                                                                                                                                        |
| `finance_receipts`               | `id`, `school_id`, `invoice_id`, `receipt_number`, `amount`, `paid_on`, `payment_method`, `received_by`, `status`, `reversed_at`, `reversed_by`, `reversal_reason`, `created_at`, `external_id`                                                                                                                                                                                                         |
| `grade_levels`                   | `id`, `school_id`, `program_id`, `code`, `name`, `sequence`, `is_active`, `created_at`                                                                                                                                                                                                                                                                                                                  |
| `hr_payroll_payment_items`       | `id`, `school_id`, `batch_id`, `payroll_item_id`, `employment_id`, `destination_id`, `beneficiary_name`, `destination_label`, `amount_kz`, `status`, `block_reason`, `provider_reference`, `failure_reason`, `paid_at`, `confirmed_by`, `metadata`, `created_at`, `updated_at`, `created_by`, `updated_by`, `version`, `cash_expense_id`                                                                |
| `payment_gateway_charges`        | `id`, `school_id`, `provider`, `invoice_id`, `student_name`, `method`, `merchant_transaction_id`, `provider_charge_id`, `amount`, `reference_entity`, `reference_number`, `phone_number`, `status`, `status_message`, `receipt_number`, `reconciled_at`, `last_webhook_at`, `raw_last_payload`, `created_by`, `created_at`, `updated_at`                                                                |
| `people`                         | `id`, `school_id`, `full_name`, `preferred_name`, `date_of_birth`, `sex`, `national_id`, `email`, `phone`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `photo_path`, `photo_url`, `deleted_at`, `user_id`, `province`, `municipality`, `commune`, `address`                                                                                                                       |
| `profiles`                       | `id`, `display_name`, `locale`, `created_at`, `updated_at`, `phone`, `full_name`, `avatar_url`, `cargo`, `school_id`, `national_id`, `first_name`, `last_name`, `preferred_name`, `avatar_path`, `timezone`, `status`, `onboarding_status`, `last_active_at`                                                                                                                                            |
| `programs`                       | `id`, `school_id`, `academic_level_id`, `code`, `name`, `kind`, `is_active`, `created_at`, `grading_profile`                                                                                                                                                                                                                                                                                            |
| `saas_audit_logs`                | `id`, `tenant_id`, `user_id`, `action`, `entity`, `entity_id`, `metadata`, `ip_address`, `created_at`                                                                                                                                                                                                                                                                                                   |
| `school_integrations`            | `id`, `school_id`, `provider`, `status`, `config`, `created_at`, `updated_at`, `created_by`, `updated_by`                                                                                                                                                                                                                                                                                               |
| `school_memberships`             | `id`, `school_id`, `user_id`, `status`, `created_at`, `updated_at`, `joined_at`, `invited_at`, `activated_at`, `suspended_at`, `last_access_at`                                                                                                                                                                                                                                                         |
| `school_settings`                | `id`, `school_id`, `domain`, `version`, `value`, `changed_by`, `created_at`                                                                                                                                                                                                                                                                                                                             |
| `schools`                        | `id`, `public_code`, `name`, `timezone`, `currency_code`, `status`, `theme`, `created_at`, `updated_at`, `nif`, `email`, `phone`, `province`, `municipality`, `address`, `logo_path`, `official_authorization_reference`, `tenant_id`, `commercial_name`, `city`, `logo_url`, `director_name`, `evaluation_periods`, `passing_grade`, `preferences`, `commune`, `neighborhood`, `latitude`, `longitude` |
| `siga_cash_expenses`             | `id`, `school_id`, `document_number`, `description`, `category`, `amount`, `method`, `reference`, `occurred_at`, `status`, `reversal_reason`, `reversed_at`, `reversed_by`, `created_at`, `created_by`, `updated_at`, `updated_by`                                                                                                                                                                      |
| `student_guardians`              | `id`, `school_id`, `student_id`, `guardian_person_id`, `relationship`, `is_primary`, `is_financially_responsible`, `is_pickup_authorized`, `valid_from`, `valid_until`, `created_by`, `created_at`                                                                                                                                                                                                      |
| `students`                       | `id`, `school_id`, `person_id`, `student_number`, `admission_date`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`                                                                                                                                                                                                                                                      |

Relações confirmadas:

- `academic_years` → `schools` (`academic_years_school_id_fkey`)
- `class_groups` → `academic_years` (`class_groups_school_id_academic_year_id_fkey`)
- `class_groups` → `campuses` (`class_groups_school_id_campus_id_fkey`)
- `class_groups` → `grade_levels` (`class_groups_school_id_grade_level_id_fkey`)
- `class_groups` → `rooms` (`class_groups_school_id_room_id_fkey`)
- `class_groups` → `schools` (`class_groups_school_id_fkey`)
- `class_groups` → `students` (`class_groups_delegate_student_fk`)
- `class_groups` → `teachers` (`class_groups_school_id_homeroom_teacher_id_fkey`)
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
- `finance_gateway_webhook_events` → `schools` (`finance_gateway_webhook_events_school_id_fkey`)
- `finance_invoices` → `fee_items` (`finance_invoices_school_id_fee_item_id_fkey`)
- `finance_invoices` → `finance_contracts` (`finance_invoices_school_id_contract_id_fkey`)
- `finance_invoices` → `schools` (`finance_invoices_school_id_fkey`)
- `finance_payment_plans` → `schools` (`finance_payment_plans_school_id_fkey`)
- `finance_receipts` → `finance_invoices` (`finance_receipts_school_id_invoice_id_fkey`)
- `finance_receipts` → `schools` (`finance_receipts_school_id_fkey`)
- `grade_levels` → `programs` (`grade_levels_school_id_program_id_fkey`)
- `grade_levels` → `schools` (`grade_levels_school_id_fkey`)
- `hr_payroll_payment_items` → `hr_employments` (`hr_payroll_payment_items_employment_id_fkey`)
- `hr_payroll_payment_items` → `hr_payment_destinations` (`hr_payroll_payment_items_destination_id_fkey`)
- `hr_payroll_payment_items` → `hr_payroll_items` (`hr_payroll_payment_items_payroll_item_id_fkey`)
- `hr_payroll_payment_items` → `hr_payroll_payment_batches` (`hr_payroll_payment_items_batch_id_fkey`)
- `hr_payroll_payment_items` → `schools` (`hr_payroll_payment_items_school_id_fkey`)
- `payment_gateway_charges` → `schools` (`payment_gateway_charges_school_id_fkey`)
- `people` → `schools` (`people_school_id_fkey`)
- `profiles` → `schools` (`profiles_school_id_fkey`)
- `programs` → `academic_levels` (`programs_school_id_academic_level_id_fkey`)
- `programs` → `schools` (`programs_school_id_fkey`)
- `saas_audit_logs` → `tenants` (`saas_audit_logs_tenant_id_fkey`)
- `school_integrations` → `schools` (`school_integrations_school_id_fkey`)
- `school_memberships` → `schools` (`school_memberships_school_id_fkey`)
- `school_settings` → `schools` (`school_settings_school_id_fkey`)
- `schools` → `tenants` (`schools_tenant_id_fkey`)
- `siga_cash_expenses` → `schools` (`siga_cash_expenses_school_id_fkey`)
- `student_guardians` → `people` (`student_guardians_school_id_guardian_person_id_fkey`)
- `student_guardians` → `schools` (`student_guardians_school_id_fkey`)
- `student_guardians` → `students` (`student_guardians_school_id_student_id_fkey`)
- `students` → `people` (`students_school_id_person_id_fkey`)
- `students` → `schools` (`students_school_id_fkey`)

## Contratos de API e erros

| Função                            | Método | Entrada                                       | Fonte                                                                        |
| --------------------------------- | ------ | --------------------------------------------- | ---------------------------------------------------------------------------- |
| `getAppyPayStatus`                | GET    | `Sem schema de entrada explícito neste bloco` | [appypay.functions.ts](../../../src/features/finance/appypay.functions.ts)   |
| `listGatewayCharges`              | GET    | `Sem schema de entrada explícito neste bloco` | [appypay.functions.ts](../../../src/features/finance/appypay.functions.ts)   |
| `createInvoiceCharge`             | POST   | `createSchema`                                | [appypay.functions.ts](../../../src/features/finance/appypay.functions.ts)   |
| `reconcileOpenCharges`            | POST   | `Sem schema de entrada explícito neste bloco` | [appypay.functions.ts](../../../src/features/finance/appypay.functions.ts)   |
| `getStudentScholarship`           | GET    | `Sem schema de entrada explícito neste bloco` | [scholarship-server.ts](../../../src/features/finance/scholarship-server.ts) |
| `setStudentScholarship`           | POST   | `setScholarshipInputSchema`                   | [scholarship-server.ts](../../../src/features/finance/scholarship-server.ts) |
| `getFinanceSchemaStatus`          | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/finance/server.ts)                         |
| `listFinanceStudents`             | GET    | `financeListInputSchema`                      | [server.ts](../../../src/features/finance/server.ts)                         |
| `getFinanceReporting`             | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/finance/server.ts)                         |
| `listInvoices`                    | GET    | `financeListInputSchema`                      | [server.ts](../../../src/features/finance/server.ts)                         |
| `listCashEntries`                 | GET    | `financeListInputSchema`                      | [server.ts](../../../src/features/finance/server.ts)                         |
| `recordInvoicePayment`            | POST   | `recordInvoicePaymentInputSchema`             | [server.ts](../../../src/features/finance/server.ts)                         |
| `generateInvoicePaymentReference` | POST   | `paymentReferenceInputSchema`                 | [server.ts](../../../src/features/finance/server.ts)                         |
| `confirmManualMulticaixaPayment`  | POST   | `confirmManualPaymentInputSchema`             | [server.ts](../../../src/features/finance/server.ts)                         |
| `cancelInvoice`                   | POST   | `cancelInvoiceInputSchema`                    | [server.ts](../../../src/features/finance/server.ts)                         |
| `issueInvoice`                    | POST   | `issueInvoiceInputSchema`                     | [server.ts](../../../src/features/finance/server.ts)                         |
| `recordCashExpense`               | POST   | `recordCashExpenseInputSchema`                | [server.ts](../../../src/features/finance/server.ts)                         |
| `reverseCashEntry`                | POST   | `reverseCashEntryInputSchema`                 | [server.ts](../../../src/features/finance/server.ts)                         |
| `createPaymentPlan`               | POST   | `createPaymentPlanInputSchema`                | [server.ts](../../../src/features/finance/server.ts)                         |
| `listPaymentPlans`                | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/finance/server.ts)                         |
| `listGatewayWebhookEvents`        | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/finance/server.ts)                         |
| `cancelPaymentPlan`               | POST   | `cancelPaymentPlanInputSchema`                | [server.ts](../../../src/features/finance/server.ts)                         |
| `listFeePlanSettings`             | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/finance/server.ts)                         |
| `upsertFeePlanSettings`           | POST   | `upsertFeePlanSettingsInputSchema`            | [server.ts](../../../src/features/finance/server.ts)                         |
| `saveGradeTuitionPrices`          | POST   | `gradeTuitionPricesInputSchema`               | [server.ts](../../../src/features/finance/server.ts)                         |
| `exportSaftAoXml`                 | POST   | `generateSaftInputSchema`                     | [server.ts](../../../src/features/finance/server.ts)                         |
| `createPayflowAdminLaunch`        | POST   | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/finance/server.ts)                         |
| `syncStudentToPayflow`            | POST   | `syncStudentToPayflowInputSchema`             | [server.ts](../../../src/features/finance/server.ts)                         |
| `syncSchoolBankToPayflow`         | POST   | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/finance/server.ts)                         |

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

- [appypay-stale-settling.test.ts](../../../tests/finance/appypay-stale-settling.test.ts)
- [cash-reversal.test.ts](../../../tests/finance/cash-reversal.test.ts)
- [emiss-multicaixa.test.ts](../../../tests/finance/emiss-multicaixa.test.ts)
- [fee-items.test.ts](../../../tests/finance/fee-items.test.ts)
- [fee-plan-defaults.test.ts](../../../tests/finance/fee-plan-defaults.test.ts)
- [gateway-failure-rate-alert.test.ts](../../../tests/finance/gateway-failure-rate-alert.test.ts)
- [gateway-settlement-atomic.test.ts](../../../tests/finance/gateway-settlement-atomic.test.ts)
- [gateway-settlement-idempotency.test.ts](../../../tests/finance/gateway-settlement-idempotency.test.ts)
- [gateway-settlement.test.ts](../../../tests/finance/gateway-settlement.test.ts)
- [gateway-webhook-metrics.test.ts](../../../tests/finance/gateway-webhook-metrics.test.ts)
- [gateway-webhook-schemas.test.ts](../../../tests/finance/gateway-webhook-schemas.test.ts)
- [gateway-webhook-signed.test.ts](../../../tests/finance/gateway-webhook-signed.test.ts)
- [gateway-webhook-telemetry.test.ts](../../../tests/finance/gateway-webhook-telemetry.test.ts)
- [invoice-numbering.test.ts](../../../tests/finance/invoice-numbering.test.ts)
- [late-fee.test.ts](../../../tests/finance/late-fee.test.ts)
- [movimentos-passam-pelas-rpc.test.ts](../../../tests/finance/movimentos-passam-pelas-rpc.test.ts)
- [payflow-education-sync.test.ts](../../../tests/finance/payflow-education-sync.test.ts)
- [payflow-settlement-idempotency.test.ts](../../../tests/finance/payflow-settlement-idempotency.test.ts)
- [payflow-settlement-refund.test.ts](../../../tests/finance/payflow-settlement-refund.test.ts)
- [payflow-settlement.test.ts](../../../tests/finance/payflow-settlement.test.ts)
- [payflow-sso.test.ts](../../../tests/finance/payflow-sso.test.ts)
- [payment-plans-guards.test.ts](../../../tests/finance/payment-plans-guards.test.ts)
- [reverse-salary-expense.test.ts](../../../tests/finance/reverse-salary-expense.test.ts)
- [saft-export.test.ts](../../../tests/finance/saft-export.test.ts)
- [saft-generator.test.ts](../../../tests/finance/saft-generator.test.ts)
- [saft-validator.test.ts](../../../tests/finance/saft-validator.test.ts)
- [schemas.test.ts](../../../tests/finance/schemas.test.ts)
- [scholarship.test.ts](../../../tests/finance/scholarship.test.ts)

**Riscos/pendências:** jornada anual e A/B autenticado exigem staging; concorrência PostgreSQL, fornecedores, restauro, artefactos oficiais extensos e dispositivos reais não ficam certificados por mocks/PGlite. Consultar a matriz e o progresso para o resultado efectivamente executado.

## Fontes e navegação

- [faturas.tsx](../../../src/routes/faturas.tsx)
- [financeiro.tsx](../../../src/routes/financeiro.tsx)
- [relatorios.financeiros.tsx](../../../src/routes/relatorios.financeiros.tsx)
- [schemas.ts](../../../src/features/finance/schemas.ts)
- [server.ts](../../../src/features/finance/server.ts)

[Índice](../README.md) · [Contratos transversais](../CONTRATOS_TRANSVERSAIS.md)
