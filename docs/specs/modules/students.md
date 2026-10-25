# Alunos, matrícula interna e renovação

**Data:** 08/10/2026. **Estado:** implementação presente; aceitação integrada por concluir. As alterações específicas são distinguidas no documento de correcções.

## Objectivo e âmbito

Alunos, matrícula interna e renovação; operar dentro da responsabilidade escolar/plataforma definida pela arquitectura, sem duplicar a fonte de verdade de outro módulo.

## Estado actual e comportamento pretendido

**Implementado:** os ficheiros, contratos e tabelas abaixo estão inventariados. A auditoria anterior e os testes locais identificam provas parciais. Não implica que todas as operações estejam completas.

**Proposto:** concluir em staging os critérios de persistência, recuperação e isolamento indicados nesta SPEC. **Por decidir:** regras da instituição não presentes na configuração/documentação e acessos externos indispensáveis.

## Perfis e permissões

Administrador/Secretaria escrevem; aluno e encarregado consultam dados próprios. O cargo não substitui grant por módulo nem âmbito escolar. O servidor volta a autorizar cada pedido.

## Pré-condições e dependências

Sessão válida, vínculo activo e escola seleccionada autorizada; configurações do ano/turma/contrato quando usadas. Escrita sensível exige AAL2. Relações carregadas de outra escola são recusadas. Testes com escrita exigem ambiente isolado e destinos sintéticos.

## Fluxo principal e alternativas

Preencher cinco passos → validar duplicados/contexto → guardar pessoa/aluno/encarregados/turma/histórico atomicamente → abrir ficha → renovar/transitar após decisão.

Sem pré-requisito: explicar a falta e ligar à configuração responsável. Sem permissão: impedir o pedido. Erro recuperável: preservar o preenchimento, mostrar o motivo e permitir repetir sem duplicar. Conflito de versão/capacidade: reler o contexto e pedir revisão antes de gravar. Transporte externo indisponível: não anunciar entrega/sucesso fictícios.

## Estados e transições

- `academic_years.status`: `active`, `archived`, `closed`, `draft`
- `class_groups.shift`: `afternoon`, `evening`, `full_day`, `morning`
- `class_groups.status`: `active`, `archived`, `closed`, `draft`
- `class_subjects.status`: `active`, `archived`, `inactive`
- `enrollment_applications.status`: `accepted`, `pending`, `rejected`
- `enrollments.status`: `active`, `cancelled`, `completed`, `pending`, `transferred`
- `finance_contracts.status`: `active`, `cancelled`
- `finance_invoices.status`: `cancelled`, `open`, `paid`, `partially_paid`
- `finance_receipts.payment_method`: `bank_transfer`, `card`, `cash`, `other`
- `finance_receipts.status`: `issued`, `reversed`
- `people.sex`: `female`, `male`, `other`, `undisclosed`
- `people.status`: `active`, `archived`, `inactive`
- `programs.grading_profile`: `20_ects`, `components`, `components`, `frequencia_exame`, `gpa4`, `scale`, `scale`, `so_exame`
- `programs.kind`: `general`, `postgraduate`, `professional`, `technical`, `undergraduate`
- `student_guardians.relationship`: `father`, `grandparent`, `guardian`, `mother`, `other`, `sibling`
- `students.status`: `active`, `applicant`, `cancelled`, `graduated`, `inactive`, `locked`, `suspended`, `transferred`, `withdrawn`

Enum permitido não autoriza qualquer transição: as guardas de alteração, publicação, fecho e reabertura no servidor/SQL são normativas. Transições sem regra documentada ficam **por decidir**, não são habilitadas por esta SPEC.

## Campos, formatos e validações

Os schemas ligados são o contrato efectivo, incluindo refinamentos, campos opcionais/defaults e validação condicional. O inventário abaixo mostra as declarações encontradas; expressões multilinha e schemas derivados devem ser lidos na fonte, não inferidos apenas desta tabela.

| Campo                           | Declaração observada                                                            | Schema de origem                                        |
| ------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `query`                         | `z.string().trim().optional(),`                                                 | [schemas.ts](../../../src/features/students/schemas.ts) |
| `limit`                         | `z.number().int().min(1).max(1000).default(25),`                                | [schemas.ts](../../../src/features/students/schemas.ts) |
| `offset`                        | `z.number().int().min(0).default(0),`                                           | [schemas.ts](../../../src/features/students/schemas.ts) |
| `academicYearId`                | `z.string().uuid().optional(),`                                                 | [schemas.ts](../../../src/features/students/schemas.ts) |
| `classGroupId`                  | `z.string().uuid().optional(),`                                                 | [schemas.ts](../../../src/features/students/schemas.ts) |
| `status`                        | `z.string().trim().optional(),`                                                 | [schemas.ts](../../../src/features/students/schemas.ts) |
| `paymentStatus`                 | `z.string().trim().optional(),`                                                 | [schemas.ts](../../../src/features/students/schemas.ts) |
| `quickFilter`                   | `z.string().trim().optional(),`                                                 | [schemas.ts](../../../src/features/students/schemas.ts) |
| `studentId`                     | `z.string().uuid(),`                                                            | [schemas.ts](../../../src/features/students/schemas.ts) |
| `studentIds`                    | `z.array(z.string().uuid()).min(1).max(100),`                                   | [schemas.ts](../../../src/features/students/schemas.ts) |
| `classGroupId`                  | `z.string().uuid(),`                                                            | [schemas.ts](../../../src/features/students/schemas.ts) |
| `academicYearId`                | `z.string().uuid(),`                                                            | [schemas.ts](../../../src/features/students/schemas.ts) |
| `studentIds`                    | `z.array(z.string().uuid()).min(1).max(100),`                                   | [schemas.ts](../../../src/features/students/schemas.ts) |
| `newStatus`                     | `z.enum(studentStatusOptions),`                                                 | [schemas.ts](../../../src/features/students/schemas.ts) |
| `reason`                        | `z`                                                                             | [schemas.ts](../../../src/features/students/schemas.ts) |
| `guardian_person_id`            | `z.string().uuid(),`                                                            | [schemas.ts](../../../src/features/students/schemas.ts) |
| `relationship`                  | `z.string().trim().min(1),`                                                     | [schemas.ts](../../../src/features/students/schemas.ts) |
| `is_primary`                    | `z.boolean().default(false),`                                                   | [schemas.ts](../../../src/features/students/schemas.ts) |
| `authorized_pickup`             | `z.boolean().default(true),`                                                    | [schemas.ts](../../../src/features/students/schemas.ts) |
| `pai`                           | `"father",`                                                                     | [schemas.ts](../../../src/features/students/schemas.ts) |
| `father`                        | `"father",`                                                                     | [schemas.ts](../../../src/features/students/schemas.ts) |
| `mae`                           | `"mother",`                                                                     | [schemas.ts](../../../src/features/students/schemas.ts) |
| `mother`                        | `"mother",`                                                                     | [schemas.ts](../../../src/features/students/schemas.ts) |
| `encarregado`                   | `"guardian",`                                                                   | [schemas.ts](../../../src/features/students/schemas.ts) |
| `guardian`                      | `"guardian",`                                                                   | [schemas.ts](../../../src/features/students/schemas.ts) |
| `tutor`                         | `"guardian",`                                                                   | [schemas.ts](../../../src/features/students/schemas.ts) |
| `avo`                           | `"grandparent",`                                                                | [schemas.ts](../../../src/features/students/schemas.ts) |
| `grandparent`                   | `"grandparent",`                                                                | [schemas.ts](../../../src/features/students/schemas.ts) |
| `irmao`                         | `"sibling",`                                                                    | [schemas.ts](../../../src/features/students/schemas.ts) |
| `sibling`                       | `"sibling",`                                                                    | [schemas.ts](../../../src/features/students/schemas.ts) |
| `conjuge`                       | `"other",`                                                                      | [schemas.ts](../../../src/features/students/schemas.ts) |
| `contacto_emergencia`           | `"other",`                                                                      | [schemas.ts](../../../src/features/students/schemas.ts) |
| `responsavel_financeiro`        | `"other",`                                                                      | [schemas.ts](../../../src/features/students/schemas.ts) |
| `responsavel_autorizado_buscar` | `"other",`                                                                      | [schemas.ts](../../../src/features/students/schemas.ts) |
| `other`                         | `"other",`                                                                      | [schemas.ts](../../../src/features/students/schemas.ts) |
| `personId`                      | `z.string().uuid(),`                                                            | [schemas.ts](../../../src/features/students/schemas.ts) |
| `registrationNumber`            | `z.string().trim().min(1, "Número de processo é obrigatório"),`                 | [schemas.ts](../../../src/features/students/schemas.ts) |
| `classGroupId`                  | `z.string().uuid().optional(),`                                                 | [schemas.ts](../../../src/features/students/schemas.ts) |
| `academicYearId`                | `z.string().uuid().optional(),`                                                 | [schemas.ts](../../../src/features/students/schemas.ts) |
| `admittedOn`                    | `optionalText,`                                                                 | [schemas.ts](../../../src/features/students/schemas.ts) |
| `guardians`                     | `z.array(studentGuardianInputSchema).default([]),`                              | [schemas.ts](../../../src/features/students/schemas.ts) |
| `studentId`                     | `z.string().uuid(),`                                                            | [schemas.ts](../../../src/features/students/schemas.ts) |
| `newStatus`                     | `z.enum(studentStatusOptions),`                                                 | [schemas.ts](../../../src/features/students/schemas.ts) |
| `reason`                        | `optionalText,`                                                                 | [schemas.ts](../../../src/features/students/schemas.ts) |
| `personId`                      | `z.string().uuid(),`                                                            | [schemas.ts](../../../src/features/students/schemas.ts) |
| `expectedVersion`               | `z.number().int().positive(),`                                                  | [schemas.ts](../../../src/features/students/schemas.ts) |
| `fullName`                      | `z.string().trim().min(2).max(160),`                                            | [schemas.ts](../../../src/features/students/schemas.ts) |
| `email`                         | `z.union([z.literal(""), z.string().trim().email()]).optional(),`               | [schemas.ts](../../../src/features/students/schemas.ts) |
| `phone`                         | `optionalPhone,`                                                                | [schemas.ts](../../../src/features/students/schemas.ts) |
| `province`                      | `optionalText,`                                                                 | [schemas.ts](../../../src/features/students/schemas.ts) |
| `municipality`                  | `optionalText,`                                                                 | [schemas.ts](../../../src/features/students/schemas.ts) |
| `commune`                       | `optionalText,`                                                                 | [schemas.ts](../../../src/features/students/schemas.ts) |
| `address`                       | `optionalText,`                                                                 | [schemas.ts](../../../src/features/students/schemas.ts) |
| `studentId`                     | `z.string().uuid(),`                                                            | [schemas.ts](../../../src/features/students/schemas.ts) |
| `classGroupId`                  | `z.string().uuid(),`                                                            | [schemas.ts](../../../src/features/students/schemas.ts) |
| `academicYearId`                | `z.string().uuid(),`                                                            | [schemas.ts](../../../src/features/students/schemas.ts) |
| `enrolledOn`                    | `optionalText,`                                                                 | [schemas.ts](../../../src/features/students/schemas.ts) |
| `enrollmentId`                  | `z.string().uuid(),`                                                            | [schemas.ts](../../../src/features/students/schemas.ts) |
| `classGroupId`                  | `z.string().uuid(),`                                                            | [schemas.ts](../../../src/features/students/schemas.ts) |
| `status`                        | `z.enum(["active", "inactive", "transferred", "withdrawn"]).default("active"),` | [schemas.ts](../../../src/features/students/schemas.ts) |
| `enrollmentId`                  | `z.string().uuid(),`                                                            | [schemas.ts](../../../src/features/students/schemas.ts) |
| `reason`                        | `optionalText,`                                                                 | [schemas.ts](../../../src/features/students/schemas.ts) |
| `academicYearId`                | `z.string().uuid().optional(),`                                                 | [schemas.ts](../../../src/features/students/schemas.ts) |
| `classGroupId`                  | `z.string().uuid().optional(),`                                                 | [schemas.ts](../../../src/features/students/schemas.ts) |
| `status`                        | `z.string().trim().optional(),`                                                 | [schemas.ts](../../../src/features/students/schemas.ts) |
| `query`                         | `z.string().trim().optional(),`                                                 | [schemas.ts](../../../src/features/students/schemas.ts) |
| `limit`                         | `z.number().int().min(1).max(250).default(100),`                                | [schemas.ts](../../../src/features/students/schemas.ts) |
| `studentId`                     | `z.string().uuid(),`                                                            | [schemas.ts](../../../src/features/students/schemas.ts) |
| `guardianPersonId`              | `z.string().uuid(),`                                                            | [schemas.ts](../../../src/features/students/schemas.ts) |
| `relationship`                  | `z.string().trim().min(1).max(40),`                                             | [schemas.ts](../../../src/features/students/schemas.ts) |
| `isPrimary`                     | `z.boolean().default(false),`                                                   | [schemas.ts](../../../src/features/students/schemas.ts) |
| `studentId`                     | `z.string().uuid(),`                                                            | [schemas.ts](../../../src/features/students/schemas.ts) |
| `guardianPersonId`              | `z.string().uuid(),`                                                            | [schemas.ts](../../../src/features/students/schemas.ts) |
| `enrollmentId`                  | `z.string().uuid(),`                                                            | [schemas.ts](../../../src/features/students/schemas.ts) |
| `attendanceRate`                | `z.coerce.number().min(0, "Mínimo 0%").max(100, "Máximo 100%"),`                | [schemas.ts](../../../src/features/students/schemas.ts) |

## Regras de negócio e fonte

Número EST/MAT vem das sequências existentes; pedido UUID é reutilizado no reenvio; turma cheia não admite matrícula extraordinária fictícia.

Fonte: implementação e skills canónicos, `DATABASE_RULES.md`, configuração efectiva da escola e SPEC temática quando ligada. Regras académicas/financeiras sem fundamento institucional confirmado ficam **por decidir**.

## Modelo de dados e relações

Tabelas confirmadas no banco existente; este levantamento não propõe substituí-las:

| Tabela                    | Colunas existentes                                                                                                                                                                                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `academic_years`          | `id`, `school_id`, `name`, `starts_on`, `ends_on`, `status`, `created_at`, `created_by`, `updated_by`                                                                                                                                                                              |
| `audit_logs`              | `id`, `school_id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `request_id`, `metadata`, `occurred_at`                                                                                                                                                                  |
| `class_groups`            | `id`, `school_id`, `academic_year_id`, `campus_id`, `grade_level_id`, `homeroom_teacher_id`, `code`, `name`, `shift`, `capacity`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `delegate_student_id`, `whatsapp_invite_url`, `whatsapp_group_name`, `room_id` |
| `class_subjects`          | `id`, `school_id`, `class_group_id`, `subject_id`, `teacher_id`, `weekly_periods`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`                                                                                                                                |
| `enrollment_applications` | `id`, `school_id`, `form_id`, `full_name`, `payload`, `status`, `decided_at`, `decided_by`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version`, `student_id`                                                                                          |
| `enrollments`             | `id`, `school_id`, `academic_year_id`, `class_group_id`, `student_id`, `enrollment_number`, `enrolled_on`, `status`, `ended_on`, `end_reason`, `created_by`, `updated_by`, `created_at`, `updated_at`, `attendance_rate`, `final_average`                                          |
| `finance_contracts`       | `id`, `school_id`, `enrollment_id`, `fee_plan_id`, `discount_percentage`, `status`, `created_by`, `created_at`                                                                                                                                                                     |
| `finance_invoices`        | `id`, `school_id`, `contract_id`, `fee_item_id`, `invoice_number`, `competence_month`, `amount`, `discount_amount`, `due_date`, `status`, `issued_by`, `cancelled_at`, `cancelled_by`, `cancellation_reason`, `created_at`, `penalty_amount`                                       |
| `finance_receipts`        | `id`, `school_id`, `invoice_id`, `receipt_number`, `amount`, `paid_on`, `payment_method`, `received_by`, `status`, `reversed_at`, `reversed_by`, `reversal_reason`, `created_at`, `external_id`                                                                                    |
| `grade_levels`            | `id`, `school_id`, `program_id`, `code`, `name`, `sequence`, `is_active`, `created_at`                                                                                                                                                                                             |
| `people`                  | `id`, `school_id`, `full_name`, `preferred_name`, `date_of_birth`, `sex`, `national_id`, `email`, `phone`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `photo_path`, `photo_url`, `deleted_at`, `user_id`, `province`, `municipality`, `commune`, `address`  |
| `programs`                | `id`, `school_id`, `academic_level_id`, `code`, `name`, `kind`, `is_active`, `created_at`, `grading_profile`                                                                                                                                                                       |
| `student_guardians`       | `id`, `school_id`, `student_id`, `guardian_person_id`, `relationship`, `is_primary`, `is_financially_responsible`, `is_pickup_authorized`, `valid_from`, `valid_until`, `created_by`, `created_at`                                                                                 |
| `student_status_history`  | `id`, `school_id`, `student_id`, `previous_status`, `new_status`, `reason`, `changed_by`, `created_at`                                                                                                                                                                             |
| `students`                | `id`, `school_id`, `person_id`, `student_number`, `admission_date`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`                                                                                                                                 |

Relações confirmadas:

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
- `enrollment_applications` → `enrollment_forms` (`enrollment_applications_form_id_fkey`)
- `enrollment_applications` → `schools` (`enrollment_applications_school_id_fkey`)
- `enrollments` → `academic_years` (`enrollments_school_id_academic_year_id_fkey`)
- `enrollments` → `class_groups` (`enrollments_school_id_class_group_id_fkey`)
- `enrollments` → `schools` (`enrollments_school_id_fkey`)
- `enrollments` → `students` (`enrollments_school_id_student_id_fkey`)
- `finance_contracts` → `enrollments` (`finance_contracts_school_id_enrollment_id_fkey`)
- `finance_contracts` → `fee_plans` (`finance_contracts_school_id_fee_plan_id_fkey`)
- `finance_contracts` → `schools` (`finance_contracts_school_id_fkey`)
- `finance_invoices` → `fee_items` (`finance_invoices_school_id_fee_item_id_fkey`)
- `finance_invoices` → `finance_contracts` (`finance_invoices_school_id_contract_id_fkey`)
- `finance_invoices` → `schools` (`finance_invoices_school_id_fkey`)
- `finance_receipts` → `finance_invoices` (`finance_receipts_school_id_invoice_id_fkey`)
- `finance_receipts` → `schools` (`finance_receipts_school_id_fkey`)
- `grade_levels` → `programs` (`grade_levels_school_id_program_id_fkey`)
- `grade_levels` → `schools` (`grade_levels_school_id_fkey`)
- `people` → `schools` (`people_school_id_fkey`)
- `programs` → `academic_levels` (`programs_school_id_academic_level_id_fkey`)
- `programs` → `schools` (`programs_school_id_fkey`)
- `student_guardians` → `people` (`student_guardians_school_id_guardian_person_id_fkey`)
- `student_guardians` → `schools` (`student_guardians_school_id_fkey`)
- `student_guardians` → `students` (`student_guardians_school_id_student_id_fkey`)
- `student_status_history` → `schools` (`student_status_history_school_id_fkey`)
- `student_status_history` → `students` (`student_status_history_student_fkey`)
- `students` → `people` (`students_school_id_person_id_fkey`)
- `students` → `schools` (`students_school_id_fkey`)

## Contratos de API e erros

| Função                       | Método | Entrada                                       | Fonte                                                 |
| ---------------------------- | ------ | --------------------------------------------- | ----------------------------------------------------- |
| `searchStudents`             | GET    | `searchStudentsInputSchema`                   | [server.ts](../../../src/features/students/server.ts) |
| `getStudentProfile`          | GET    | `getStudentInputSchema`                       | [server.ts](../../../src/features/students/server.ts) |
| `createStudent`              | POST   | `createStudentInputSchema`                    | [server.ts](../../../src/features/students/server.ts) |
| `enrollNewStudent`           | POST   | `enrollNewStudentInputSchema`                 | [server.ts](../../../src/features/students/server.ts) |
| `changeStudentStatus`        | POST   | `changeStudentStatusInputSchema`              | [server.ts](../../../src/features/students/server.ts) |
| `updateStudentProfile`       | POST   | `updateStudentProfileInputSchema`             | [server.ts](../../../src/features/students/server.ts) |
| `enrollStudentInClass`       | POST   | `enrollStudentInClassInputSchema`             | [server.ts](../../../src/features/students/server.ts) |
| `listEnrollments`            | GET    | `listEnrollmentsInputSchema`                  | [server.ts](../../../src/features/students/server.ts) |
| `updateEnrollment`           | POST   | `updateEnrollmentInputSchema`                 | [server.ts](../../../src/features/students/server.ts) |
| `updateEnrollmentAttendance` | POST   | `updateEnrollmentAttendanceInputSchema`       | [server.ts](../../../src/features/students/server.ts) |
| `cancelEnrollment`           | POST   | `cancelEnrollmentInputSchema`                 | [server.ts](../../../src/features/students/server.ts) |
| `listAcademicDirectory`      | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/students/server.ts) |
| `assignGuardian`             | POST   | `assignGuardianInputSchema`                   | [server.ts](../../../src/features/students/server.ts) |
| `removeGuardian`             | POST   | `removeGuardianInputSchema`                   | [server.ts](../../../src/features/students/server.ts) |
| `getStudentStatusHistory`    | GET    | `getStudentStatusHistoryInputSchema`          | [server.ts](../../../src/features/students/server.ts) |
| `batchAssignClass`           | POST   | `batchAssignClassInputSchema`                 | [server.ts](../../../src/features/students/server.ts) |
| `batchUpdateStudentStatus`   | POST   | `batchUpdateStudentStatusInputSchema`         | [server.ts](../../../src/features/students/server.ts) |

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

- [academic-status.test.ts](../../../tests/students/academic-status.test.ts)
- [atomic-workflows.test.ts](../../../tests/students/atomic-workflows.test.ts)
- [enrollment-directory.test.ts](../../../tests/students/enrollment-directory.test.ts)
- [schemas.test.ts](../../../tests/students/schemas.test.ts)
- [status-history.test.ts](../../../tests/students/status-history.test.ts)
- [student-modal.test.ts](../../../tests/students/student-modal.test.ts)
- [teacher-student-scope.test.ts](../../../tests/students/teacher-student-scope.test.ts)

**Riscos/pendências:** jornada anual e A/B autenticado exigem staging; concorrência PostgreSQL, fornecedores, restauro, artefactos oficiais extensos e dispositivos reais não ficam certificados por mocks/PGlite. Consultar a matriz e o progresso para o resultado efectivamente executado.

## Fontes e navegação

- [$studentId.tsx](../../../src/routes/alunos/$studentId.tsx)
- [index.tsx](../../../src/routes/alunos/index.tsx)
- [schemas.ts](../../../src/features/students/schemas.ts)
- [server.ts](../../../src/features/students/server.ts)

[Índice](../README.md) · [Contratos transversais](../CONTRATOS_TRANSVERSAIS.md)
