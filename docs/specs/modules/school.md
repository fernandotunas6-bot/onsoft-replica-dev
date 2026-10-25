# Configuração institucional

**Data:** 08/10/2026. **Estado:** implementação presente; aceitação integrada por concluir. As alterações específicas são distinguidas no documento de correcções.

## Objectivo e âmbito

Configuração institucional; operar dentro da responsabilidade escolar/plataforma definida pela arquitectura, sem duplicar a fonte de verdade de outro módulo.

## Estado actual e comportamento pretendido

**Implementado:** os ficheiros, contratos e tabelas abaixo estão inventariados. A auditoria anterior e os testes locais identificam provas parciais. Não implica que todas as operações estejam completas.

**Proposto:** concluir em staging os critérios de persistência, recuperação e isolamento indicados nesta SPEC. **Por decidir:** regras da instituição não presentes na configuração/documentação e acessos externos indispensáveis.

## Perfis e permissões

Administrador escolar; Secretaria nos campos permitidos. O cargo não substitui grant por módulo nem âmbito escolar. O servidor volta a autorizar cada pedido.

## Pré-condições e dependências

Sessão válida, vínculo activo e escola seleccionada autorizada; configurações do ano/turma/contrato quando usadas. Escrita sensível exige AAL2. Relações carregadas de outra escola são recusadas. Testes com escrita exigem ambiente isolado e destinos sintéticos.

## Fluxo principal e alternativas

Resolver escola → completar identidade/localização → seleccionar ano → configurar avaliação/cobrança/modelos → guardar versão → reler.

Sem pré-requisito: explicar a falta e ligar à configuração responsável. Sem permissão: impedir o pedido. Erro recuperável: preservar o preenchimento, mostrar o motivo e permitir repetir sem duplicar. Conflito de versão/capacidade: reler o contexto e pedir revisão antes de gravar. Transporte externo indisponível: não anunciar entrega/sucesso fictícios.

## Estados e transições

- `academic_years.status`: `active`, `archived`, `closed`, `draft`
- `assessment_rule_sets.rounding_method`: `down`, `nearest`, `none`, `up`
- `assessment_rule_sets.status`: `active`, `retired`
- `class_groups.shift`: `afternoon`, `evening`, `full_day`, `morning`
- `class_groups.status`: `active`, `archived`, `closed`, `draft`
- `class_subjects.status`: `active`, `archived`, `inactive`
- `fee_items.frequency`: `annual`, `monthly`, `once`, `term`
- `fee_items.kind`: `enrollment`, `other`, `service`, `tuition`
- `fee_plans.status`: `active`, `draft`, `retired`
- `people.sex`: `female`, `male`, `other`, `undisclosed`
- `people.status`: `active`, `archived`, `inactive`
- `program_subjects.status`: `active`, `inactive`
- `programs.grading_profile`: `20_ects`, `components`, `components`, `frequencia_exame`, `gpa4`, `scale`, `scale`, `so_exame`
- `programs.kind`: `general`, `postgraduate`, `professional`, `technical`, `undergraduate`
- `rooms.status`: `active`, `inactive`
- `school_invitations.status`: `accepted`, `expired`, `pending`, `revoked`
- `school_memberships.status`: `active`, `invited`, `revoked`, `suspended`
- `schools.status`: `active`, `archived`, `setup`, `suspended`
- `students.status`: `active`, `applicant`, `cancelled`, `graduated`, `inactive`, `locked`, `suspended`, `transferred`, `withdrawn`
- `subjects.status`: `active`, `archived`, `inactive`
- `teachers.employment_type`: `fixed_term`, `part_time`, `permanent`, `visiting`
- `teachers.highest_qualification`: `bachelor`, `doctorate`, `licentiate`, `master`, `other`, `secondary`
- `teachers.status`: `active`, `archived`, `inactive`, `leave`
- `tenants.status`: `active`, `archived`, `cancelled`, `past_due`, `provisioning`, `provisioning_failed`, `suspended`, `trial`

Enum permitido não autoriza qualquer transição: as guardas de alteração, publicação, fecho e reabertura no servidor/SQL são normativas. Transições sem regra documentada ficam **por decidir**, não são habilitadas por esta SPEC.

## Campos, formatos e validações

Os schemas ligados são o contrato efectivo, incluindo refinamentos, campos opcionais/defaults e validação condicional. O inventário abaixo mostra as declarações encontradas; expressões multilinha e schemas derivados devem ser lidos na fonte, não inferidos apenas desta tabela.

| Campo                    | Declaração observada                                                      | Schema de origem                                      |
| ------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------- |
| `name`                   | `z.string().trim().min(3).max(120),`                                      | [schemas.ts](../../../src/features/school/schemas.ts) |
| `nif`                    | `schoolNifSchema,`                                                        | [schemas.ts](../../../src/features/school/schemas.ts) |
| `directorName`           | `z.string().trim().min(3).max(120),`                                      | [schemas.ts](../../../src/features/school/schemas.ts) |
| `phone`                  | `angolaPhoneSchema,`                                                      | [schemas.ts](../../../src/features/school/schemas.ts) |
| `email`                  | `z.string().trim().email().max(255),`                                     | [schemas.ts](../../../src/features/school/schemas.ts) |
| `address`                | `z.string().trim().min(5).max(200),`                                      | [schemas.ts](../../../src/features/school/schemas.ts) |
| `academicYear`           | `z.string().trim().max(40).optional(),`                                   | [schemas.ts](../../../src/features/school/schemas.ts) |
| `currency`               | `z.enum(["AOA", "USD", "EUR"]),`                                          | [schemas.ts](../../../src/features/school/schemas.ts) |
| `evaluationPeriods`      | `z.number().int().min(2).max(3),`                                         | [schemas.ts](../../../src/features/school/schemas.ts) |
| `passingGrade`           | `z.number().min(0).max(20),`                                              | [schemas.ts](../../../src/features/school/schemas.ts) |
| `preferences`            | `z.record(z.string(), z.boolean()).default({}),`                          | [schemas.ts](../../../src/features/school/schemas.ts) |
| `logoUrl`                | `z.union([z.string().trim().url().max(2048), z.literal("")]).optional(),` | [schemas.ts](../../../src/features/school/schemas.ts) |
| `motto`                  | `z.string().trim().max(160).optional(),`                                  | [schemas.ts](../../../src/features/school/schemas.ts) |
| `schoolType`             | `z`                                                                       | [schemas.ts](../../../src/features/school/schemas.ts) |
| `philosophy`             | `z.string().trim().max(600).optional(),`                                  | [schemas.ts](../../../src/features/school/schemas.ts) |
| `province`               | `z.string().trim().max(80).optional(),`                                   | [schemas.ts](../../../src/features/school/schemas.ts) |
| `municipality`           | `z.string().trim().max(80).optional(),`                                   | [schemas.ts](../../../src/features/school/schemas.ts) |
| `commune`                | `z.string().trim().max(80).optional(),`                                   | [schemas.ts](../../../src/features/school/schemas.ts) |
| `neighborhood`           | `z.string().trim().max(120).optional(),`                                  | [schemas.ts](../../../src/features/school/schemas.ts) |
| `latitude`               | `z.number().min(-90).max(90).nullable().optional(),`                      | [schemas.ts](../../../src/features/school/schemas.ts) |
| `longitude`              | `z.number().min(-180).max(180).nullable().optional(),`                    | [schemas.ts](../../../src/features/school/schemas.ts) |
| `bankName`               | `z.string().trim().min(2).max(120),`                                      | [schemas.ts](../../../src/features/school/schemas.ts) |
| `accountHolder`          | `z.string().trim().min(3).max(160),`                                      | [schemas.ts](../../../src/features/school/schemas.ts) |
| `iban`                   | `z`                                                                       | [schemas.ts](../../../src/features/school/schemas.ts) |
| `swift`                  | `z.string().trim().max(11).optional().or(z.literal("")),`                 | [schemas.ts](../../../src/features/school/schemas.ts) |
| `multicaixaMerchant`     | `z.string().trim().max(64).optional().or(z.literal("")),`                 | [schemas.ts](../../../src/features/school/schemas.ts) |
| `softwareCertified`      | `z.string().trim().max(120).optional().or(z.literal("")),`                | [schemas.ts](../../../src/features/school/schemas.ts) |
| `invoiceSeries`          | `z.string().trim().max(32).optional().or(z.literal("")),`                 | [schemas.ts](../../../src/features/school/schemas.ts) |
| `fiscalNotes`            | `z.string().trim().max(500).optional().or(z.literal("")),`                | [schemas.ts](../../../src/features/school/schemas.ts) |
| `dueDay`                 | `z.number().int().min(1).max(28),`                                        | [schemas.ts](../../../src/features/school/schemas.ts) |
| `lateFeePercent`         | `z.number().min(0).max(100),`                                             | [schemas.ts](../../../src/features/school/schemas.ts) |
| `graceDays`              | `z.number().int().min(0).max(60),`                                        | [schemas.ts](../../../src/features/school/schemas.ts) |
| `lateFeeScope`           | `z.enum(["all", "electronic"]),`                                          | [schemas.ts](../../../src/features/school/schemas.ts) |
| `siblingDiscountPercent` | `z.number().min(0).max(100),`                                             | [schemas.ts](../../../src/features/school/schemas.ts) |
| `scale`                  | `z.enum(["20_ects", "gpa4"]),`                                            | [schemas.ts](../../../src/features/school/schemas.ts) |
| `components`             | `z.enum(["frequencia_exame", "so_exame"]),`                               | [schemas.ts](../../../src/features/school/schemas.ts) |
| `teachingLevels`         | `z`                                                                       | [schemas.ts](../../../src/features/school/schemas.ts) |
| `courses`                | `z`                                                                       | [schemas.ts](../../../src/features/school/schemas.ts) |
| `closedTerms`            | `z`                                                                       | [schemas.ts](../../../src/features/school/schemas.ts) |
| `gradingProfile`         | `gradingProfileSchema.nullable().default(null),`                          | [schemas.ts](../../../src/features/school/schemas.ts) |
| `term`                   | `z.union([z.literal(1), z.literal(2), z.literal(3)]),`                    | [schemas.ts](../../../src/features/school/schemas.ts) |
| `closed`                 | `z.boolean(),`                                                            | [schemas.ts](../../../src/features/school/schemas.ts) |

## Regras de negócio e fonte

Dados e versão persistem após refresh/login; ausência de configuração deve orientar o próximo passo e impedir operação dependente.

Fonte: implementação e skills canónicos, `DATABASE_RULES.md`, configuração efectiva da escola e SPEC temática quando ligada. Regras académicas/financeiras sem fundamento institucional confirmado ficam **por decidir**.

## Modelo de dados e relações

Tabelas confirmadas no banco existente; este levantamento não propõe substituí-las:

| Tabela                 | Colunas existentes                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `academic_years`       | `id`, `school_id`, `name`, `starts_on`, `ends_on`, `status`, `created_at`, `created_by`, `updated_by`                                                                                                                                                                                                                                                                                                   |
| `assessment_rule_sets` | `id`, `school_id`, `grading_scale_id`, `code`, `name`, `version`, `status`, `continuous_weight`, `exam_weight`, `passing_value`, `maximum_absence_percentage`, `rounding_method`, `grade_change_requires_approval`, `lock_after_publication`, `formula`, `created_by`, `created_at`                                                                                                                     |
| `audit_logs`           | `id`, `school_id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `request_id`, `metadata`, `occurred_at`                                                                                                                                                                                                                                                                                       |
| `class_groups`         | `id`, `school_id`, `academic_year_id`, `campus_id`, `grade_level_id`, `homeroom_teacher_id`, `code`, `name`, `shift`, `capacity`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `delegate_student_id`, `whatsapp_invite_url`, `whatsapp_group_name`, `room_id`                                                                                                                      |
| `class_subjects`       | `id`, `school_id`, `class_group_id`, `subject_id`, `teacher_id`, `weekly_periods`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`                                                                                                                                                                                                                                                     |
| `enrollment_forms`     | `id`, `school_id`, `slug`, `title`, `subtitle`, `hero_text`, `accent_color`, `logo_url`, `is_open`, `visible_fields`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version`                                                                                                                                                                                                   |
| `fee_items`            | `id`, `school_id`, `fee_plan_id`, `code`, `name`, `kind`, `amount`, `frequency`, `is_active`, `created_at`, `grade_level_id`                                                                                                                                                                                                                                                                            |
| `fee_plans`            | `id`, `school_id`, `academic_year_id`, `code`, `name`, `currency_code`, `status`, `created_at`                                                                                                                                                                                                                                                                                                          |
| `grade_levels`         | `id`, `school_id`, `program_id`, `code`, `name`, `sequence`, `is_active`, `created_at`                                                                                                                                                                                                                                                                                                                  |
| `people`               | `id`, `school_id`, `full_name`, `preferred_name`, `date_of_birth`, `sex`, `national_id`, `email`, `phone`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `photo_path`, `photo_url`, `deleted_at`, `user_id`, `province`, `municipality`, `commune`, `address`                                                                                                                       |
| `program_subjects`     | `id`, `school_id`, `program_id`, `subject_id`, `semester`, `credits`, `status`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version`                                                                                                                                                                                                                                         |
| `programs`             | `id`, `school_id`, `academic_level_id`, `code`, `name`, `kind`, `is_active`, `created_at`, `grading_profile`                                                                                                                                                                                                                                                                                            |
| `rooms`                | `id`, `school_id`, `code`, `name`, `capacity`, `status`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version`, `room_type`, `campus_id`, `building`, `block`, `floor`, `resources`, `accessibility`, `notes`                                                                                                                                                                 |
| `school_branding`      | `id`, `school_id`, `logo_url`, `favicon_url`, `primary_color`, `secondary_color`, `school_name`, `short_name`, `portal_title`, `login_background`, `created_at`, `updated_at`                                                                                                                                                                                                                           |
| `school_invitations`   | `id`, `school_id`, `email`, `role_code`, `invited_by`, `status`, `token_hash`, `expires_at`, `accepted_at`, `accepted_by`, `created_at`, `updated_at`                                                                                                                                                                                                                                                   |
| `school_memberships`   | `id`, `school_id`, `user_id`, `status`, `created_at`, `updated_at`, `joined_at`, `invited_at`, `activated_at`, `suspended_at`, `last_access_at`                                                                                                                                                                                                                                                         |
| `school_settings`      | `id`, `school_id`, `domain`, `version`, `value`, `changed_by`, `created_at`                                                                                                                                                                                                                                                                                                                             |
| `schools`              | `id`, `public_code`, `name`, `timezone`, `currency_code`, `status`, `theme`, `created_at`, `updated_at`, `nif`, `email`, `phone`, `province`, `municipality`, `address`, `logo_path`, `official_authorization_reference`, `tenant_id`, `commercial_name`, `city`, `logo_url`, `director_name`, `evaluation_periods`, `passing_grade`, `preferences`, `commune`, `neighborhood`, `latitude`, `longitude` |
| `students`             | `id`, `school_id`, `person_id`, `student_number`, `admission_date`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`                                                                                                                                                                                                                                                      |
| `subjects`             | `id`, `school_id`, `code`, `name`, `short_name`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `subject_type_id`, `curriculum_area_id`, `description`, `department`, `is_mandatory`, `is_practical`, `has_assessment`, `has_exam`, `has_attendance`, `has_pauta`, `annual_hours`, `default_lesson_duration`, `color`, `icon`, `display_order`, `deleted_at`, `version`              |
| `teachers`             | `id`, `school_id`, `person_id`, `employee_number`, `hired_on`, `employment_type`, `highest_qualification`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `user_id`                                                                                                                                                                                                                  |
| `tenants`              | `id`, `name`, `slug`, `status`, `plan_id`, `subscription_status`, `trial_ends_at`, `contact_name`, `contact_phone`, `contact_email`, `max_students`, `max_storage_gb`, `created_at`, `updated_at`, `billing_exempt`, `billing_exempt_reason`                                                                                                                                                            |
| `terms`                | `id`, `school_id`, `academic_year_id`, `name`, `sequence`, `starts_on`, `ends_on`, `created_at`, `created_by`, `updated_by`                                                                                                                                                                                                                                                                             |

Relações confirmadas:

- `academic_years` → `schools` (`academic_years_school_id_fkey`)
- `assessment_rule_sets` → `grading_scales` (`assessment_rule_sets_grading_scale_id_fkey`)
- `assessment_rule_sets` → `schools` (`assessment_rule_sets_school_id_fkey`)
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
- `enrollment_forms` → `schools` (`enrollment_forms_school_id_fkey`)
- `fee_items` → `fee_plans` (`fee_items_school_id_fee_plan_id_fkey`)
- `fee_items` → `grade_levels` (`fee_items_grade_level_fkey`)
- `fee_items` → `schools` (`fee_items_school_id_fkey`)
- `fee_plans` → `academic_years` (`fee_plans_school_id_academic_year_id_fkey`)
- `fee_plans` → `schools` (`fee_plans_school_id_fkey`)
- `grade_levels` → `programs` (`grade_levels_school_id_program_id_fkey`)
- `grade_levels` → `schools` (`grade_levels_school_id_fkey`)
- `people` → `schools` (`people_school_id_fkey`)
- `program_subjects` → `programs` (`program_subjects_program_id_fkey`)
- `program_subjects` → `schools` (`program_subjects_school_id_fkey`)
- `program_subjects` → `subjects` (`program_subjects_subject_fkey`)
- `programs` → `academic_levels` (`programs_school_id_academic_level_id_fkey`)
- `programs` → `schools` (`programs_school_id_fkey`)
- `rooms` → `schools` (`rooms_school_id_fkey`)
- `school_branding` → `schools` (`school_branding_school_id_fkey`)
- `school_invitations` → `schools` (`school_invitations_school_id_fkey`)
- `school_memberships` → `schools` (`school_memberships_school_id_fkey`)
- `school_settings` → `schools` (`school_settings_school_id_fkey`)
- `schools` → `tenants` (`schools_tenant_id_fkey`)
- `students` → `people` (`students_school_id_person_id_fkey`)
- `students` → `schools` (`students_school_id_fkey`)
- `subjects` → `curriculum_areas` (`subjects_curriculum_area_id_fkey`)
- `subjects` → `schools` (`subjects_school_id_fkey`)
- `subjects` → `subject_types` (`subjects_subject_type_id_fkey`)
- `teachers` → `people` (`teachers_school_id_person_id_fkey`)
- `teachers` → `schools` (`teachers_school_id_fkey`)
- `tenants` → `plans` (`tenants_plan_id_fkey`)
- `terms` → `academic_years` (`terms_school_id_academic_year_id_fkey`)
- `terms` → `schools` (`terms_school_id_fkey`)

## Contratos de API e erros

| Função                   | Método | Entrada                                       | Fonte                                                                       |
| ------------------------ | ------ | --------------------------------------------- | --------------------------------------------------------------------------- |
| `getSchoolSettings`      | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/school/server.ts)                         |
| `listAcademicYears`      | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/school/server.ts)                         |
| `listAcademicTerms`      | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/school/server.ts)                         |
| `updateSchoolSettings`   | POST   | `updateSchoolSettingsInputSchema`             | [server.ts](../../../src/features/school/server.ts)                         |
| `listRecentAuditLogs`    | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/school/server.ts)                         |
| `updateBillingSettings`  | POST   | `updateBillingSettingsInputSchema`            | [server.ts](../../../src/features/school/server.ts)                         |
| `updateSchoolBanking`    | POST   | `updateSchoolBankingInputSchema`              | [server.ts](../../../src/features/school/server.ts)                         |
| `updateSchoolAgt`        | POST   | `updateSchoolAgtInputSchema`                  | [server.ts](../../../src/features/school/server.ts)                         |
| `updatePedagogySettings` | POST   | `pedagogySettingsSchema`                      | [server.ts](../../../src/features/school/server.ts)                         |
| `setTermLock`            | POST   | `setTermLockInputSchema`                      | [server.ts](../../../src/features/school/server.ts)                         |
| `getSchoolSetupGuide`    | GET    | `Sem schema de entrada explícito neste bloco` | [setup-guide-server.ts](../../../src/features/school/setup-guide-server.ts) |
| `getSchoolSetupStatus`   | GET    | `Sem schema de entrada explícito neste bloco` | [setup-status.ts](../../../src/features/school/setup-status.ts)             |
| `applySchoolStructure`   | POST   | `Sem schema de entrada explícito neste bloco` | [setup-status.ts](../../../src/features/school/setup-status.ts)             |

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

- [area-tone.test.ts](../../../tests/school/area-tone.test.ts)
- [banking-guard.test.ts](../../../tests/school/banking-guard.test.ts)
- [settings-domain-names.test.ts](../../../tests/school/settings-domain-names.test.ts)
- [settings-domains.test.ts](../../../tests/school/settings-domains.test.ts)
- [settings-update.test.ts](../../../tests/school/settings-update.test.ts)
- [setup-guide-ui.test.tsx](../../../tests/school/setup-guide-ui.test.tsx)
- [setup-guide.test.ts](../../../tests/school/setup-guide.test.ts)
- [setup-steps.test.ts](../../../tests/school/setup-steps.test.ts)

**Riscos/pendências:** jornada anual e A/B autenticado exigem staging; concorrência PostgreSQL, fornecedores, restauro, artefactos oficiais extensos e dispositivos reais não ficam certificados por mocks/PGlite. Consultar a matriz e o progresso para o resultado efectivamente executado.

## Fontes e navegação

- [schemas.ts](../../../src/features/school/schemas.ts)
- [server.ts](../../../src/features/school/server.ts)

[Índice](../README.md) · [Contratos transversais](../CONTRATOS_TRANSVERSAIS.md)
