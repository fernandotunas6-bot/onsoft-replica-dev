# Contas, vínculos e permissões

**Data:** 08/10/2026. **Estado:** implementação presente; aceitação integrada por concluir. As alterações específicas são distinguidas no documento de correcções.

## Objectivo e âmbito

Contas, vínculos e permissões; operar dentro da responsabilidade escolar/plataforma definida pela arquitectura, sem duplicar a fonte de verdade de outro módulo.

## Estado actual e comportamento pretendido

**Implementado:** os ficheiros, contratos e tabelas abaixo estão inventariados. A auditoria anterior e os testes locais identificam provas parciais. Não implica que todas as operações estejam completas.

**Proposto:** concluir em staging os critérios de persistência, recuperação e isolamento indicados nesta SPEC. **Por decidir:** regras da instituição não presentes na configuração/documentação e acessos externos indispensáveis.

## Perfis e permissões

Administrador gere; utilizador pede vínculo e aceita convite. O cargo não substitui grant por módulo nem âmbito escolar. O servidor volta a autorizar cada pedido.

## Pré-condições e dependências

Sessão válida, vínculo activo e escola seleccionada autorizada; configurações do ano/turma/contrato quando usadas. Escrita sensível exige AAL2. Relações carregadas de outra escola são recusadas. Testes com escrita exigem ambiente isolado e destinos sintéticos.

## Fluxo principal e alternativas

Pedir acesso → verificar identidade → aprovar/rejeitar → atribuir papel → conceder/repor grant → revogar.

Sem pré-requisito: explicar a falta e ligar à configuração responsável. Sem permissão: impedir o pedido. Erro recuperável: preservar o preenchimento, mostrar o motivo e permitir repetir sem duplicar. Conflito de versão/capacidade: reler o contexto e pedir revisão antes de gravar. Transporte externo indisponível: não anunciar entrega/sucesso fictícios.

## Estados e transições

- `hr_employments.employment_type`: `fixed_term`, `intern`, `other`, `permanent`, `service_provider`, `temporary`
- `hr_employments.status`: `active`, `draft`, `expired`, `suspended`, `terminated`
- `people.sex`: `female`, `male`, `other`, `undisclosed`
- `people.status`: `active`, `archived`, `inactive`
- `school_access_requests.requested_profile`: `aluno`, `encarregado`, `funcionario`, `outro`, `professor`
- `school_access_requests.status`: `approved`, `cancelled`, `in_review`, `info_requested`, `pending`, `rejected`
- `school_invitations.status`: `accepted`, `expired`, `pending`, `revoked`
- `school_memberships.status`: `active`, `invited`, `revoked`, `suspended`
- `schools.status`: `active`, `archived`, `setup`, `suspended`
- `staff_module_grants.level`: `Escrita`, `Leitura`, `Nenhum`, `Total`
- `student_guardians.relationship`: `father`, `grandparent`, `guardian`, `mother`, `other`, `sibling`
- `students.status`: `active`, `applicant`, `cancelled`, `graduated`, `inactive`, `locked`, `suspended`, `transferred`, `withdrawn`
- `teachers.employment_type`: `fixed_term`, `part_time`, `permanent`, `visiting`
- `teachers.highest_qualification`: `bachelor`, `doctorate`, `licentiate`, `master`, `other`, `secondary`
- `teachers.status`: `active`, `archived`, `inactive`, `leave`
- `tenants.status`: `active`, `archived`, `cancelled`, `past_due`, `provisioning`, `provisioning_failed`, `suspended`, `trial`

Enum permitido não autoriza qualquer transição: as guardas de alteração, publicação, fecho e reabertura no servidor/SQL são normativas. Transições sem regra documentada ficam **por decidir**, não são habilitadas por esta SPEC.

## Campos, formatos e validações

Os schemas ligados são o contrato efectivo, incluindo refinamentos, campos opcionais/defaults e validação condicional. O inventário abaixo mostra as declarações encontradas; expressões multilinha e schemas derivados devem ser lidos na fonte, não inferidos apenas desta tabela.

| Campo          | Declaração observada                                                    | Schema de origem                                                      |
| -------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `query`        | `z.string().trim().min(3, "Escreva pelo menos 3 caracteres.").max(80),` | [request-schemas.ts](../../../src/features/access/request-schemas.ts) |
| `status`       | `z.enum([...accessRequestStatuses, "open", "all"]).default("open"),`    | [request-schemas.ts](../../../src/features/access/request-schemas.ts) |
| `fullName`     | `z.string().trim().min(2).max(160),`                                    | [schemas.ts](../../../src/features/access/schemas.ts)                 |
| `email`        | `z.string().trim().email(),`                                            | [schemas.ts](../../../src/features/access/schemas.ts)                 |
| `cargo`        | `z.enum(applicationRoles),`                                             | [schemas.ts](../../../src/features/access/schemas.ts)                 |
| `userId`       | `z.string().uuid(),`                                                    | [schemas.ts](../../../src/features/access/schemas.ts)                 |
| `cargo`        | `z.enum(applicationRoles),`                                             | [schemas.ts](../../../src/features/access/schemas.ts)                 |
| `userId`       | `z.string().uuid(),`                                                    | [schemas.ts](../../../src/features/access/schemas.ts)                 |
| `disabled`     | `z.boolean(),`                                                          | [schemas.ts](../../../src/features/access/schemas.ts)                 |
| `userId`       | `z.string().uuid(),`                                                    | [schemas.ts](../../../src/features/access/schemas.ts)                 |
| `userId`       | `z.string().uuid(),`                                                    | [schemas.ts](../../../src/features/access/schemas.ts)                 |
| `newPassword`  | `z.string().min(8),`                                                    | [schemas.ts](../../../src/features/access/schemas.ts)                 |
| `email`        | `z.string().trim().email(),`                                            | [schemas.ts](../../../src/features/access/schemas.ts)                 |
| `roleCode`     | `z.string().trim().min(2).max(50).default("teacher"),`                  | [schemas.ts](../../../src/features/access/schemas.ts)                 |
| `fullName`     | `z.string().trim().min(2).max(160).optional(),`                         | [schemas.ts](../../../src/features/access/schemas.ts)                 |
| `invitationId` | `z.string().uuid(),`                                                    | [schemas.ts](../../../src/features/access/schemas.ts)                 |
| `token`        | `z.string().trim().min(10).max(256),`                                   | [schemas.ts](../../../src/features/access/schemas.ts)                 |

## Regras de negócio e fonte

Identidade Auth é partilhada entre escolas; alterações globais não podem prejudicar outro vínculo. Grant por módulo sobrepõe cargo e exige MFA para escrita.

Fonte: implementação e skills canónicos, `DATABASE_RULES.md`, configuração efectiva da escola e SPEC temática quando ligada. Regras académicas/financeiras sem fundamento institucional confirmado ficam **por decidir**.

Especificação complementar: [SGA_SECURITY_ACCESS_SPEC.md](../SGA_SECURITY_ACCESS_SPEC.md).

## Modelo de dados e relações

Tabelas confirmadas no banco existente; este levantamento não propõe substituí-las:

| Tabela                   | Colunas existentes                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit_logs`             | `id`, `school_id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `request_id`, `metadata`, `occurred_at`                                                                                                                                                                                                                                                                                       |
| `hr_employments`         | `id`, `school_id`, `person_id`, `position_id`, `department_id`, `employee_number`, `employment_type`, `status`, `hire_date`, `termination_date`, `work_location`, `weekly_hours`, `notes`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version`                                                                                                                              |
| `member_roles`           | `school_id`, `membership_id`, `role_id`, `created_at`                                                                                                                                                                                                                                                                                                                                                   |
| `people`                 | `id`, `school_id`, `full_name`, `preferred_name`, `date_of_birth`, `sex`, `national_id`, `email`, `phone`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `photo_path`, `photo_url`, `deleted_at`, `user_id`, `province`, `municipality`, `commune`, `address`                                                                                                                       |
| `profiles`               | `id`, `display_name`, `locale`, `created_at`, `updated_at`, `phone`, `full_name`, `avatar_url`, `cargo`, `school_id`, `national_id`, `first_name`, `last_name`, `preferred_name`, `avatar_path`, `timezone`, `status`, `onboarding_status`, `last_active_at`                                                                                                                                            |
| `roles`                  | `id`, `school_id`, `code`, `name`, `is_system`, `created_at`                                                                                                                                                                                                                                                                                                                                            |
| `school_access_requests` | `id`, `school_id`, `user_id`, `full_name`, `national_id`, `institutional_number`, `requested_profile`, `status`, `matched_person_id`, `reviewer_id`, `decision_note`, `reviewed_at`, `created_at`, `updated_at`, `enrollment_application_id`, `contact_phone`, `message`, `match_kind`, `granted_role_code`, `membership_id`, `info_request_note`, `requester_reply`                                    |
| `school_invitations`     | `id`, `school_id`, `email`, `role_code`, `invited_by`, `status`, `token_hash`, `expires_at`, `accepted_at`, `accepted_by`, `created_at`, `updated_at`                                                                                                                                                                                                                                                   |
| `school_memberships`     | `id`, `school_id`, `user_id`, `status`, `created_at`, `updated_at`, `joined_at`, `invited_at`, `activated_at`, `suspended_at`, `last_access_at`                                                                                                                                                                                                                                                         |
| `schools`                | `id`, `public_code`, `name`, `timezone`, `currency_code`, `status`, `theme`, `created_at`, `updated_at`, `nif`, `email`, `phone`, `province`, `municipality`, `address`, `logo_path`, `official_authorization_reference`, `tenant_id`, `commercial_name`, `city`, `logo_url`, `director_name`, `evaluation_periods`, `passing_grade`, `preferences`, `commune`, `neighborhood`, `latitude`, `longitude` |
| `staff_module_grants`    | `id`, `school_id`, `user_id`, `module_key`, `level`, `created_at`, `updated_at`, `created_by`, `updated_by`                                                                                                                                                                                                                                                                                             |
| `student_guardians`      | `id`, `school_id`, `student_id`, `guardian_person_id`, `relationship`, `is_primary`, `is_financially_responsible`, `is_pickup_authorized`, `valid_from`, `valid_until`, `created_by`, `created_at`                                                                                                                                                                                                      |
| `students`               | `id`, `school_id`, `person_id`, `student_number`, `admission_date`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`                                                                                                                                                                                                                                                      |
| `teachers`               | `id`, `school_id`, `person_id`, `employee_number`, `hired_on`, `employment_type`, `highest_qualification`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `user_id`                                                                                                                                                                                                                  |
| `tenants`                | `id`, `name`, `slug`, `status`, `plan_id`, `subscription_status`, `trial_ends_at`, `contact_name`, `contact_phone`, `contact_email`, `max_students`, `max_storage_gb`, `created_at`, `updated_at`, `billing_exempt`, `billing_exempt_reason`                                                                                                                                                            |

Relações confirmadas:

- `audit_logs` → `schools` (`audit_logs_school_id_fkey`)
- `hr_employments` → `hr_departments` (`hr_employments_department_id_fkey`)
- `hr_employments` → `hr_positions` (`hr_employments_position_id_fkey`)
- `hr_employments` → `people` (`hr_employments_person_id_fkey`)
- `hr_employments` → `schools` (`hr_employments_school_id_fkey`)
- `member_roles` → `roles` (`member_roles_role_id_fkey`)
- `member_roles` → `roles` (`member_roles_school_id_role_id_fkey`)
- `member_roles` → `school_memberships` (`member_roles_membership_id_fkey`)
- `member_roles` → `school_memberships` (`member_roles_school_id_membership_id_fkey`)
- `member_roles` → `schools` (`member_roles_school_id_fkey`)
- `people` → `schools` (`people_school_id_fkey`)
- `profiles` → `schools` (`profiles_school_id_fkey`)
- `roles` → `schools` (`roles_school_id_fkey`)
- `school_access_requests` → `enrollment_applications` (`school_access_requests_enrollment_application_id_fkey`)
- `school_access_requests` → `people` (`school_access_requests_person_id_fkey`)
- `school_access_requests` → `school_memberships` (`school_access_requests_membership_id_fkey`)
- `school_access_requests` → `schools` (`school_access_requests_school_id_fkey`)
- `school_invitations` → `schools` (`school_invitations_school_id_fkey`)
- `school_memberships` → `schools` (`school_memberships_school_id_fkey`)
- `schools` → `tenants` (`schools_tenant_id_fkey`)
- `staff_module_grants` → `schools` (`staff_module_grants_school_id_fkey`)
- `student_guardians` → `people` (`student_guardians_school_id_guardian_person_id_fkey`)
- `student_guardians` → `schools` (`student_guardians_school_id_fkey`)
- `student_guardians` → `students` (`student_guardians_school_id_student_id_fkey`)
- `students` → `people` (`students_school_id_person_id_fkey`)
- `students` → `schools` (`students_school_id_fkey`)
- `teachers` → `people` (`teachers_school_id_person_id_fkey`)
- `teachers` → `schools` (`teachers_school_id_fkey`)
- `tenants` → `plans` (`tenants_plan_id_fkey`)

## Contratos de API e erros

| Função                          | Método | Entrada                                       | Fonte                                                                 |
| ------------------------------- | ------ | --------------------------------------------- | --------------------------------------------------------------------- |
| `listStaffModuleGrants`         | GET    | `Sem schema de entrada explícito neste bloco` | [grants.ts](../../../src/features/access/grants.ts)                   |
| `setStaffModuleGrant`           | POST   | `setStaffModuleGrantInputSchema`              | [grants.ts](../../../src/features/access/grants.ts)                   |
| `clearStaffModuleGrant`         | POST   | `clearStaffModuleGrantInputSchema`            | [grants.ts](../../../src/features/access/grants.ts)                   |
| `getInstitutionalLinkState`     | GET    | `Sem schema de entrada explícito neste bloco` | [requests-server.ts](../../../src/features/access/requests-server.ts) |
| `searchSchoolsForAccessRequest` | POST   | `searchSchoolsForAccessInputSchema`           | [requests-server.ts](../../../src/features/access/requests-server.ts) |
| `submitAccessRequest`           | POST   | `submitAccessRequestInputSchema`              | [requests-server.ts](../../../src/features/access/requests-server.ts) |
| `actOnMyAccessRequest`          | POST   | `requesterAccessRequestActionInputSchema`     | [requests-server.ts](../../../src/features/access/requests-server.ts) |
| `listSchoolAccessRequests`      | GET    | `listSchoolAccessRequestsInputSchema`         | [requests-server.ts](../../../src/features/access/requests-server.ts) |
| `reviewAccessRequest`           | POST   | `reviewAccessRequestInputSchema`              | [requests-server.ts](../../../src/features/access/requests-server.ts) |
| `listSystemAccounts`            | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/access/server.ts)                   |
| `inviteSystemUser`              | POST   | `inviteUserInputSchema`                       | [server.ts](../../../src/features/access/server.ts)                   |
| `updateSystemAccountCargo`      | POST   | `updateAccountCargoInputSchema`               | [server.ts](../../../src/features/access/server.ts)                   |
| `setSystemAccountDisabled`      | POST   | `setAccountDisabledInputSchema`               | [server.ts](../../../src/features/access/server.ts)                   |
| `resendSystemInvite`            | POST   | `resendSystemInviteInputSchema`               | [server.ts](../../../src/features/access/server.ts)                   |
| `sendSystemInviteEmail`         | POST   | `resendSystemInviteInputSchema`               | [server.ts](../../../src/features/access/server.ts)                   |
| `signInWithIdentifierFn`        | POST   | `signInWithIdentifierInputSchema`             | [server.ts](../../../src/features/access/server.ts)                   |
| `resetStaffPasswordDirect`      | POST   | `resetStaffPasswordInputSchema`               | [server.ts](../../../src/features/access/server.ts)                   |
| `listSchoolRoles`               | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/access/server.ts)                   |
| `listSchoolInvitations`         | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/access/server.ts)                   |
| `createSchoolInvitation`        | POST   | `createSchoolInvitationInputSchema`           | [server.ts](../../../src/features/access/server.ts)                   |
| `revokeSchoolInvitation`        | POST   | `revokeSchoolInvitationInputSchema`           | [server.ts](../../../src/features/access/server.ts)                   |
| `acceptSchoolInvitation`        | POST   | `acceptSchoolInvitationInputSchema`           | [server.ts](../../../src/features/access/server.ts)                   |

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

- [accept-invitation.test.ts](../../../tests/access/accept-invitation.test.ts)
- [bi-login-resolve.test.ts](../../../tests/access/bi-login-resolve.test.ts)
- [bi-login.test.ts](../../../tests/access/bi-login.test.ts)
- [cross-school-account-actions.test.ts](../../../tests/access/cross-school-account-actions.test.ts)
- [elevated-role-aal2.test.ts](../../../tests/access/elevated-role-aal2.test.ts)
- [grants-mfa.test.ts](../../../tests/access/grants-mfa.test.ts)
- [institutional-link.test.ts](../../../tests/access/institutional-link.test.ts)
- [invitation-person-link.test.ts](../../../tests/access/invitation-person-link.test.ts)
- [invitations.test.ts](../../../tests/access/invitations.test.ts)
- [schemas.test.ts](../../../tests/access/schemas.test.ts)
- [access-policy.test.ts](../../../tests/auth/access-policy.test.ts)
- [active-school-switch.test.ts](../../../tests/auth/active-school-switch.test.ts)
- [multi-school-memberships.test.ts](../../../tests/auth/multi-school-memberships.test.ts)
- [nav-vocabulary.test.ts](../../../tests/auth/nav-vocabulary.test.ts)
- [navigation-catalog.test.ts](../../../tests/auth/navigation-catalog.test.ts)
- [permissions.test.ts](../../../tests/auth/permissions.test.ts)
- [phone-change-schemas.test.ts](../../../tests/auth/phone-change-schemas.test.ts)
- [portal-engine.test.ts](../../../tests/auth/portal-engine.test.ts)
- [reset-password-otp.test.ts](../../../tests/auth/reset-password-otp.test.ts)
- [reset-password.test.ts](../../../tests/auth/reset-password.test.ts)
- [schemas.test.ts](../../../tests/auth/schemas.test.ts)
- [session-hint.test.ts](../../../tests/auth/session-hint.test.ts)
- [use-phone-change.test.ts](../../../tests/auth/use-phone-change.test.ts)
- [user-profile-specs.test.ts](../../../tests/auth/user-profile-specs.test.ts)

**Riscos/pendências:** jornada anual e A/B autenticado exigem staging; concorrência PostgreSQL, fornecedores, restauro, artefactos oficiais extensos e dispositivos reais não ficam certificados por mocks/PGlite. Consultar a matriz e o progresso para o resultado efectivamente executado.

## Fontes e navegação

- [acessos.tsx](../../../src/routes/acessos.tsx)
- [alterar-senha.tsx](../../../src/routes/alterar-senha.tsx)
- [schemas.ts](../../../src/features/access/schemas.ts)
- [server.ts](../../../src/features/access/server.ts)

[Índice](../README.md) · [Contratos transversais](../CONTRATOS_TRANSVERSAIS.md)
