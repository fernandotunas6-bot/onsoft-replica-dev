# Registo central de pessoas

**Data:** 08/10/2026. **Estado:** implementação presente; aceitação integrada por concluir. As alterações específicas são distinguidas no documento de correcções.

## Objectivo e âmbito

Registo central de pessoas; operar dentro da responsabilidade escolar/plataforma definida pela arquitectura, sem duplicar a fonte de verdade de outro módulo.

## Estado actual e comportamento pretendido

**Implementado:** os ficheiros, contratos e tabelas abaixo estão inventariados. A auditoria anterior e os testes locais identificam provas parciais. Não implica que todas as operações estejam completas.

**Proposto:** concluir em staging os critérios de persistência, recuperação e isolamento indicados nesta SPEC. **Por decidir:** regras da instituição não presentes na configuração/documentação e acessos externos indispensáveis.

## Perfis e permissões

Administrador/Secretaria gerem; outros apenas no âmbito autorizado. O cargo não substitui grant por módulo nem âmbito escolar. O servidor volta a autorizar cada pedido.

## Pré-condições e dependências

Sessão válida, vínculo activo e escola seleccionada autorizada; configurações do ano/turma/contrato quando usadas. Escrita sensível exige AAL2. Relações carregadas de outra escola são recusadas. Testes com escrita exigem ambiente isolado e destinos sintéticos.

## Fluxo principal e alternativas

Pesquisar duplicados → cadastrar pessoa/documentos → atribuir papel → vincular familiar → editar com versão → arquivar.

Sem pré-requisito: explicar a falta e ligar à configuração responsável. Sem permissão: impedir o pedido. Erro recuperável: preservar o preenchimento, mostrar o motivo e permitir repetir sem duplicar. Conflito de versão/capacidade: reler o contexto e pedir revisão antes de gravar. Transporte externo indisponível: não anunciar entrega/sucesso fictícios.

## Estados e transições

- `academic_years.status`: `active`, `archived`, `closed`, `draft`
- `class_groups.shift`: `afternoon`, `evening`, `full_day`, `morning`
- `class_groups.status`: `active`, `archived`, `closed`, `draft`
- `class_subjects.status`: `active`, `archived`, `inactive`
- `enrollments.status`: `active`, `cancelled`, `completed`, `pending`, `transferred`
- `finance_contracts.status`: `active`, `cancelled`
- `finance_invoices.status`: `cancelled`, `open`, `paid`, `partially_paid`
- `finance_receipts.payment_method`: `bank_transfer`, `card`, `cash`, `other`
- `finance_receipts.status`: `issued`, `reversed`
- `hr_employments.employment_type`: `fixed_term`, `intern`, `other`, `permanent`, `service_provider`, `temporary`
- `hr_employments.status`: `active`, `draft`, `expired`, `suspended`, `terminated`
- `people.sex`: `female`, `male`, `other`, `undisclosed`
- `people.status`: `active`, `archived`, `inactive`
- `person_roles.role`: `aluno`, `contacto_institucional`, `coordenador`, `diretor`, `encarregado`, `fornecedor`, `funcionario`, `professor`, `utilizador`
- `siga_access_cards.status`: `active`, `expired`, `lost`, `suspended`
- `siga_files.area`: `escola`, `pessoal`, `publico`, `secretaria`
- `siga_files.category`: `bilhete`, `certificado`, `comunicado`, `contrato`, `fatura`, `foto`, `material_aula`, `outro`, `pauta`, `recibo`, `talao`
- `siga_files.storage_backend`: `local`, `sga`
- `siga_files.visibility`: `private`, `public`, `school`
- `student_guardians.relationship`: `father`, `grandparent`, `guardian`, `mother`, `other`, `sibling`
- `students.status`: `active`, `applicant`, `cancelled`, `graduated`, `inactive`, `locked`, `suspended`, `transferred`, `withdrawn`
- `teachers.employment_type`: `fixed_term`, `part_time`, `permanent`, `visiting`
- `teachers.highest_qualification`: `bachelor`, `doctorate`, `licentiate`, `master`, `other`, `secondary`
- `teachers.status`: `active`, `archived`, `inactive`, `leave`

Enum permitido não autoriza qualquer transição: as guardas de alteração, publicação, fecho e reabertura no servidor/SQL são normativas. Transições sem regra documentada ficam **por decidir**, não são habilitadas por esta SPEC.

## Campos, formatos e validações

Os schemas ligados são o contrato efectivo, incluindo refinamentos, campos opcionais/defaults e validação condicional. O inventário abaixo mostra as declarações encontradas; expressões multilinha e schemas derivados devem ser lidos na fonte, não inferidos apenas desta tabela.

| Campo | Declaração observada | Schema de origem |
| --- | --- | --- |
| `related_person_id` | `z.string().uuid(),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `relationship_type` | `z.enum(personRelationshipTypeOptions),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `priority` | `z.number().int().optional(),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `authorized` | `z.boolean().default(true),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `valid_from` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `valid_until` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `notes` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `full_name` | `z.string().trim().min(2, "Nome completo é obrigatório").max(160),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `first_name` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `last_name` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `preferred_name` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `photo_url` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `sex` | `z.enum(personSexOptions).optional(),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `birth_date` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `marital_status` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `nationality` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `birth_place` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `province` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `municipality` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `commune` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `address` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `phone_primary` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `phone_alternative` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `whatsapp` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `email` | `z` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `nif` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `profession` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `religion` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `special_needs` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `notes` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `person` | `personCoreFieldsSchema,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `roles` | `z.array(z.enum(personRoleOptions)).default([]),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `documents` | `z.array(personDocumentInputSchema).default([]),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `relationships` | `z.array(personRelationshipInputSchema).default([]),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `duplicateDecision` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `query` | `z.string().trim().max(160).default(""),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `province` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `municipality` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `commune` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `role` | `z.enum(personRoleOptions).optional(),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `limit` | `z.number().int().min(1).max(50).default(20),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `fullName` | `z.string().trim().min(2),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `birthDate` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `documentNumber` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `nif` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `phone` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `email` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `survivorId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `duplicateId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `reason` | `z.string().trim().min(3, "Indica o motivo da mesclagem"),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `personId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `status` | `z.enum(["active", "inactive"]),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `personId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `roles` | `z.array(z.enum(personInstitutionRoleOptions)).max(personInstitutionRoleOptions.length),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `personId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `photoUrl` | `z` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `personId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `document` | `personDocumentInputSchema,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `fullName` | `z.string().trim().min(2).max(160),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `email` | `z.union([z.literal(""), z.string().trim().email()]).optional(),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `phone` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `employeeNumber` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `hiredOn` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `teacherId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `fullName` | `z.string().trim().min(2).max(160),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `email` | `z.union([z.literal(""), z.string().trim().email()]).optional(),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `phone` | `optionalText,` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `status` | `z.enum(["active", "inactive"]).default("active"),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `teacherId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `query` | `z.string().trim().optional(),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `status` | `z.enum(["all", "active", "inactive"]).default("all"),` | [schemas.ts](../../../src/features/people/schemas.ts) |
| `limit` | `z.number().int().min(1).max(200).default(100),` | [schemas.ts](../../../src/features/people/schemas.ts) |

## Regras de negócio e fonte

Uma pessoa pode ter vários papéis; identidade institucional e vínculos não são reescritos por alteração de contacto.

Fonte: implementação e skills canónicos, `DATABASE_RULES.md`, configuração efectiva da escola e SPEC temática quando ligada. Regras académicas/financeiras sem fundamento institucional confirmado ficam **por decidir**.

## Modelo de dados e relações

Tabelas confirmadas no banco existente; este levantamento não propõe substituí-las:

| Tabela | Colunas existentes |
| --- | --- |
| `academic_years` | `id`, `school_id`, `name`, `starts_on`, `ends_on`, `status`, `created_at`, `created_by`, `updated_by` |
| `audit_logs` | `id`, `school_id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `request_id`, `metadata`, `occurred_at` |
| `class_groups` | `id`, `school_id`, `academic_year_id`, `campus_id`, `grade_level_id`, `homeroom_teacher_id`, `code`, `name`, `shift`, `capacity`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `delegate_student_id`, `whatsapp_invite_url`, `whatsapp_group_name`, `room_id` |
| `class_subjects` | `id`, `school_id`, `class_group_id`, `subject_id`, `teacher_id`, `weekly_periods`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at` |
| `enrollments` | `id`, `school_id`, `academic_year_id`, `class_group_id`, `student_id`, `enrollment_number`, `enrolled_on`, `status`, `ended_on`, `end_reason`, `created_by`, `updated_by`, `created_at`, `updated_at`, `attendance_rate`, `final_average` |
| `finance_contracts` | `id`, `school_id`, `enrollment_id`, `fee_plan_id`, `discount_percentage`, `status`, `created_by`, `created_at` |
| `finance_invoices` | `id`, `school_id`, `contract_id`, `fee_item_id`, `invoice_number`, `competence_month`, `amount`, `discount_amount`, `due_date`, `status`, `issued_by`, `cancelled_at`, `cancelled_by`, `cancellation_reason`, `created_at`, `penalty_amount` |
| `finance_receipts` | `id`, `school_id`, `invoice_id`, `receipt_number`, `amount`, `paid_on`, `payment_method`, `received_by`, `status`, `reversed_at`, `reversed_by`, `reversal_reason`, `created_at`, `external_id` |
| `grade_levels` | `id`, `school_id`, `program_id`, `code`, `name`, `sequence`, `is_active`, `created_at` |
| `hr_employments` | `id`, `school_id`, `person_id`, `position_id`, `department_id`, `employee_number`, `employment_type`, `status`, `hire_date`, `termination_date`, `work_location`, `weekly_hours`, `notes`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version` |
| `people` | `id`, `school_id`, `full_name`, `preferred_name`, `date_of_birth`, `sex`, `national_id`, `email`, `phone`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `photo_path`, `photo_url`, `deleted_at`, `user_id`, `province`, `municipality`, `commune`, `address` |
| `person_documents` | `id`, `school_id`, `person_id`, `document_type`, `document_number`, `issued_at`, `expires_at`, `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at`, `file_id`, `file_name` |
| `person_roles` | `id`, `school_id`, `person_id`, `role`, `active`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at` |
| `school_settings` | `id`, `school_id`, `domain`, `version`, `value`, `changed_by`, `created_at` |
| `siga_access_cards` | `id`, `school_id`, `person_id`, `student_id`, `card_number`, `barcode`, `qr_secret`, `rfid_tag`, `status`, `issued_at`, `expires_at`, `created_at`, `updated_at` |
| `siga_files` | `id`, `school_id`, `owner_user_id`, `name`, `mime`, `size_bytes`, `area`, `visibility`, `storage_backend`, `storage_path`, `class_group_id`, `is_folder`, `parent_id`, `title`, `description`, `category`, `document_date`, `reference_code`, `related_user_id`, `related_person_id`, `created_at`, `created_by`, `updated_at`, `updated_by`, `last_action`, `last_action_at`, `last_action_by`, `is_system`, `deleted_at` |
| `student_guardians` | `id`, `school_id`, `student_id`, `guardian_person_id`, `relationship`, `is_primary`, `is_financially_responsible`, `is_pickup_authorized`, `valid_from`, `valid_until`, `created_by`, `created_at` |
| `students` | `id`, `school_id`, `person_id`, `student_number`, `admission_date`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at` |
| `teachers` | `id`, `school_id`, `person_id`, `employee_number`, `hired_on`, `employment_type`, `highest_qualification`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `user_id` |

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
- `hr_employments` → `hr_departments` (`hr_employments_department_id_fkey`)
- `hr_employments` → `hr_positions` (`hr_employments_position_id_fkey`)
- `hr_employments` → `people` (`hr_employments_person_id_fkey`)
- `hr_employments` → `schools` (`hr_employments_school_id_fkey`)
- `people` → `schools` (`people_school_id_fkey`)
- `person_documents` → `people` (`person_documents_person_id_fkey`)
- `person_documents` → `schools` (`person_documents_school_id_fkey`)
- `person_roles` → `people` (`person_roles_person_id_fkey`)
- `person_roles` → `schools` (`person_roles_school_id_fkey`)
- `school_settings` → `schools` (`school_settings_school_id_fkey`)
- `siga_access_cards` → `people` (`siga_access_cards_person_id_fkey`)
- `siga_access_cards` → `schools` (`siga_access_cards_school_id_fkey`)
- `siga_access_cards` → `students` (`siga_access_cards_student_id_fkey`)
- `siga_files` → `people` (`siga_files_related_person_id_fkey`)
- `siga_files` → `schools` (`siga_files_school_id_fkey`)
- `siga_files` → `siga_files` (`siga_files_parent_id_fkey`)
- `student_guardians` → `people` (`student_guardians_school_id_guardian_person_id_fkey`)
- `student_guardians` → `schools` (`student_guardians_school_id_fkey`)
- `student_guardians` → `students` (`student_guardians_school_id_student_id_fkey`)
- `students` → `people` (`students_school_id_person_id_fkey`)
- `students` → `schools` (`students_school_id_fkey`)
- `teachers` → `people` (`teachers_school_id_person_id_fkey`)
- `teachers` → `schools` (`teachers_school_id_fkey`)

## Contratos de API e erros

| Função | Método | Entrada | Fonte |
| --- | --- | --- | --- |
| `searchPeople` | GET | `searchPeopleInputSchema` | [server.ts](../../../src/features/people/server.ts) |
| `findPersonDuplicates` | POST | `findPersonDuplicatesInputSchema` | [server.ts](../../../src/features/people/server.ts) |
| `getPerson` | GET | `getPersonInputSchema` | [server.ts](../../../src/features/people/server.ts) |
| `createPerson` | POST | `createPersonInputSchema` | [server.ts](../../../src/features/people/server.ts) |
| `mergePeople` | POST | `mergePeopleInputSchema` | [server.ts](../../../src/features/people/server.ts) |
| `listStaffDirectory` | GET | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/people/server.ts) |
| `listTeachers` | GET | `listTeachersInputSchema` | [server.ts](../../../src/features/people/server.ts) |
| `createTeacher` | POST | `createTeacherInputSchema` | [server.ts](../../../src/features/people/server.ts) |
| `updateTeacher` | POST | `updateTeacherInputSchema` | [server.ts](../../../src/features/people/server.ts) |
| `deleteTeacher` | POST | `deleteTeacherInputSchema` | [server.ts](../../../src/features/people/server.ts) |
| `updatePerson` | POST | `updatePersonInputSchema` | [server.ts](../../../src/features/people/server.ts) |
| `setPersonInstitutionRoles` | POST | `setPersonInstitutionRolesInputSchema` | [server.ts](../../../src/features/people/server.ts) |
| `setPersonPhotoUrl` | POST | `setPersonPhotoUrlInputSchema` | [server.ts](../../../src/features/people/server.ts) |
| `addPersonDocument` | POST | `addPersonDocumentInputSchema` | [server.ts](../../../src/features/people/server.ts) |
| `updatePersonStatus` | POST | `updatePersonStatusInputSchema` | [server.ts](../../../src/features/people/server.ts) |
| `getMyTeacherContactVisibility` | GET | `Sem schema de entrada explícito neste bloco` | [teacher-contact-visibility.ts](../../../src/features/people/teacher-contact-visibility.ts) |
| `setMyTeacherContactVisibility` | POST | `Sem schema de entrada explícito neste bloco` | [teacher-contact-visibility.ts](../../../src/features/people/teacher-contact-visibility.ts) |

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

- [angola-identity-edit-contract.test.ts](../../../tests/people/angola-identity-edit-contract.test.ts)
- [merge-integrity.test.ts](../../../tests/people/merge-integrity.test.ts)
- [schemas.test.ts](../../../tests/people/schemas.test.ts)
- [teacher-contact-visibility.test.ts](../../../tests/people/teacher-contact-visibility.test.ts)

**Riscos/pendências:** jornada anual e A/B autenticado exigem staging; concorrência PostgreSQL, fornecedores, restauro, artefactos oficiais extensos e dispositivos reais não ficam certificados por mocks/PGlite. Consultar a matriz e o progresso para o resultado efectivamente executado.

## Fontes e navegação

- [index.tsx](../../../src/routes/pessoas/index.tsx)
- [$teacherId.tsx](../../../src/routes/professores/$teacherId.tsx)
- [schemas.ts](../../../src/features/people/schemas.ts)
- [server.ts](../../../src/features/people/server.ts)

[Índice](../README.md) · [Contratos transversais](../CONTRATOS_TRANSVERSAIS.md)
