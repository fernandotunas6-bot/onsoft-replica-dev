# Autenticação e contexto escolar

**Data:** 08/10/2026. **Estado:** implementação presente; aceitação integrada por concluir. As alterações específicas são distinguidas no documento de correcções.

## Objectivo e âmbito

Autenticação e contexto escolar; operar dentro da responsabilidade escolar/plataforma definida pela arquitectura, sem duplicar a fonte de verdade de outro módulo.

## Estado actual e comportamento pretendido

**Implementado:** os ficheiros, contratos e tabelas abaixo estão inventariados. A auditoria anterior e os testes locais identificam provas parciais. Não implica que todas as operações estejam completas.

**Proposto:** concluir em staging os critérios de persistência, recuperação e isolamento indicados nesta SPEC. **Por decidir:** regras da instituição não presentes na configuração/documentação e acessos externos indispensáveis.

## Perfis e permissões

Todos os utilizadores; autenticação não equivale a autorização escolar. O cargo não substitui grant por módulo nem âmbito escolar. O servidor volta a autorizar cada pedido.

## Pré-condições e dependências

Sessão válida, vínculo activo e escola seleccionada autorizada; configurações do ano/turma/contrato quando usadas. Escrita sensível exige AAL2. Relações carregadas de outra escola são recusadas. Testes com escrita exigem ambiente isolado e destinos sintéticos.

## Fluxo principal e alternativas

Entrar → verificar sessão/MFA → resolver vínculo → escolher escola → abrir módulo → terminar sessão.

Sem pré-requisito: explicar a falta e ligar à configuração responsável. Sem permissão: impedir o pedido. Erro recuperável: preservar o preenchimento, mostrar o motivo e permitir repetir sem duplicar. Conflito de versão/capacidade: reler o contexto e pedir revisão antes de gravar. Transporte externo indisponível: não anunciar entrega/sucesso fictícios.

## Estados e transições

- `class_groups.shift`: `afternoon`, `evening`, `full_day`, `morning`
- `class_groups.status`: `active`, `archived`, `closed`, `draft`
- `enrollments.status`: `active`, `cancelled`, `completed`, `pending`, `transferred`
- `people.sex`: `female`, `male`, `other`, `undisclosed`
- `people.status`: `active`, `archived`, `inactive`
- `school_memberships.status`: `active`, `invited`, `revoked`, `suspended`
- `schools.status`: `active`, `archived`, `setup`, `suspended`
- `staff_module_grants.level`: `Escrita`, `Leitura`, `Nenhum`, `Total`
- `student_guardians.relationship`: `father`, `grandparent`, `guardian`, `mother`, `other`, `sibling`
- `students.status`: `active`, `applicant`, `cancelled`, `graduated`, `inactive`, `locked`, `suspended`, `transferred`, `withdrawn`
- `teachers.employment_type`: `fixed_term`, `part_time`, `permanent`, `visiting`
- `teachers.highest_qualification`: `bachelor`, `doctorate`, `licentiate`, `master`, `other`, `secondary`
- `teachers.status`: `active`, `archived`, `inactive`, `leave`
- `tenant_domains.status`: `active`, `failed`, `pending`
- `tenant_domains.type`: `custom_domain`, `siga_subdomain`
- `tenants.status`: `active`, `archived`, `cancelled`, `past_due`, `provisioning`, `provisioning_failed`, `suspended`, `trial`

Enum permitido não autoriza qualquer transição: as guardas de alteração, publicação, fecho e reabertura no servidor/SQL são normativas. Transições sem regra documentada ficam **por decidir**, não são habilitadas por esta SPEC.

## Campos, formatos e validações

Os schemas ligados são o contrato efectivo, incluindo refinamentos, campos opcionais/defaults e validação condicional. O inventário abaixo mostra as declarações encontradas; expressões multilinha e schemas derivados devem ser lidos na fonte, não inferidos apenas desta tabela.

| Campo               | Declaração observada                     | Schema de origem                                    |
| ------------------- | ---------------------------------------- | --------------------------------------------------- |
| `fullName`          | `z.string().trim().min(2).max(160),`     | [schemas.ts](../../../src/features/auth/schemas.ts) |
| `firstName`         | `z.string().trim().max(80).optional(),`  | [schemas.ts](../../../src/features/auth/schemas.ts) |
| `lastName`          | `z.string().trim().max(80).optional(),`  | [schemas.ts](../../../src/features/auth/schemas.ts) |
| `phone`             | `z`                                      | [schemas.ts](../../../src/features/auth/schemas.ts) |
| `expectedUpdatedAt` | `z.string().datetime({ offset: true }),` | [schemas.ts](../../../src/features/auth/schemas.ts) |
| `storagePath`       | `avatarStoragePathSchema,`               | [schemas.ts](../../../src/features/auth/schemas.ts) |
| `avatarUrl`         | `z.string().trim().min(1).max(800),`     | [schemas.ts](../../../src/features/auth/schemas.ts) |

## Regras de negócio e fonte

JWT deve ser verificado, user_metadata não concede papéis; escola seleccionada é preferência validada no servidor.

Fonte: implementação e skills canónicos, `DATABASE_RULES.md`, configuração efectiva da escola e SPEC temática quando ligada. Regras académicas/financeiras sem fundamento institucional confirmado ficam **por decidir**.

Especificação complementar: [SGA_SECURITY_ACCESS_SPEC.md](../SGA_SECURITY_ACCESS_SPEC.md).

## Modelo de dados e relações

Tabelas confirmadas no banco existente; este levantamento não propõe substituí-las:

| Tabela                | Colunas existentes                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `class_groups`        | `id`, `school_id`, `academic_year_id`, `campus_id`, `grade_level_id`, `homeroom_teacher_id`, `code`, `name`, `shift`, `capacity`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `delegate_student_id`, `whatsapp_invite_url`, `whatsapp_group_name`, `room_id`                                                                                                                      |
| `enrollments`         | `id`, `school_id`, `academic_year_id`, `class_group_id`, `student_id`, `enrollment_number`, `enrolled_on`, `status`, `ended_on`, `end_reason`, `created_by`, `updated_by`, `created_at`, `updated_at`, `attendance_rate`, `final_average`                                                                                                                                                               |
| `people`              | `id`, `school_id`, `full_name`, `preferred_name`, `date_of_birth`, `sex`, `national_id`, `email`, `phone`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `photo_path`, `photo_url`, `deleted_at`, `user_id`, `province`, `municipality`, `commune`, `address`                                                                                                                       |
| `profiles`            | `id`, `display_name`, `locale`, `created_at`, `updated_at`, `phone`, `full_name`, `avatar_url`, `cargo`, `school_id`, `national_id`, `first_name`, `last_name`, `preferred_name`, `avatar_path`, `timezone`, `status`, `onboarding_status`, `last_active_at`                                                                                                                                            |
| `saas_audit_logs`     | `id`, `tenant_id`, `user_id`, `action`, `entity`, `entity_id`, `metadata`, `ip_address`, `created_at`                                                                                                                                                                                                                                                                                                   |
| `school_branding`     | `id`, `school_id`, `logo_url`, `favicon_url`, `primary_color`, `secondary_color`, `school_name`, `short_name`, `portal_title`, `login_background`, `created_at`, `updated_at`                                                                                                                                                                                                                           |
| `school_memberships`  | `id`, `school_id`, `user_id`, `status`, `created_at`, `updated_at`, `joined_at`, `invited_at`, `activated_at`, `suspended_at`, `last_access_at`                                                                                                                                                                                                                                                         |
| `school_settings`     | `id`, `school_id`, `domain`, `version`, `value`, `changed_by`, `created_at`                                                                                                                                                                                                                                                                                                                             |
| `schools`             | `id`, `public_code`, `name`, `timezone`, `currency_code`, `status`, `theme`, `created_at`, `updated_at`, `nif`, `email`, `phone`, `province`, `municipality`, `address`, `logo_path`, `official_authorization_reference`, `tenant_id`, `commercial_name`, `city`, `logo_url`, `director_name`, `evaluation_periods`, `passing_grade`, `preferences`, `commune`, `neighborhood`, `latitude`, `longitude` |
| `staff_module_grants` | `id`, `school_id`, `user_id`, `module_key`, `level`, `created_at`, `updated_at`, `created_by`, `updated_by`                                                                                                                                                                                                                                                                                             |
| `student_guardians`   | `id`, `school_id`, `student_id`, `guardian_person_id`, `relationship`, `is_primary`, `is_financially_responsible`, `is_pickup_authorized`, `valid_from`, `valid_until`, `created_by`, `created_at`                                                                                                                                                                                                      |
| `students`            | `id`, `school_id`, `person_id`, `student_number`, `admission_date`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`                                                                                                                                                                                                                                                      |
| `teachers`            | `id`, `school_id`, `person_id`, `employee_number`, `hired_on`, `employment_type`, `highest_qualification`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `user_id`                                                                                                                                                                                                                  |
| `tenant_domains`      | `id`, `tenant_id`, `hostname`, `type`, `status`, `ssl_status`, `verified_at`, `created_at`, `last_checked_at`, `check_count`, `updated_at`                                                                                                                                                                                                                                                              |
| `tenants`             | `id`, `name`, `slug`, `status`, `plan_id`, `subscription_status`, `trial_ends_at`, `contact_name`, `contact_phone`, `contact_email`, `max_students`, `max_storage_gb`, `created_at`, `updated_at`, `billing_exempt`, `billing_exempt_reason`                                                                                                                                                            |

Relações confirmadas:

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
- `people` → `schools` (`people_school_id_fkey`)
- `profiles` → `schools` (`profiles_school_id_fkey`)
- `saas_audit_logs` → `tenants` (`saas_audit_logs_tenant_id_fkey`)
- `school_branding` → `schools` (`school_branding_school_id_fkey`)
- `school_memberships` → `schools` (`school_memberships_school_id_fkey`)
- `school_settings` → `schools` (`school_settings_school_id_fkey`)
- `schools` → `tenants` (`schools_tenant_id_fkey`)
- `staff_module_grants` → `schools` (`staff_module_grants_school_id_fkey`)
- `student_guardians` → `people` (`student_guardians_school_id_guardian_person_id_fkey`)
- `student_guardians` → `schools` (`student_guardians_school_id_fkey`)
- `student_guardians` → `students` (`student_guardians_school_id_student_id_fkey`)
- `students` → `people` (`students_school_id_person_id_fkey`)
- `students` → `schools` (`students_school_id_fkey`)
- `teachers` → `people` (`teachers_school_id_person_id_fkey`)
- `teachers` → `schools` (`teachers_school_id_fkey`)
- `tenant_domains` → `tenants` (`tenant_domains_tenant_id_fkey`)
- `tenants` → `plans` (`tenants_plan_id_fkey`)

**Referências não confirmadas como tabelas neste snapshot:** `avatars`. Podem ser views, buckets ou variantes; não criar tabelas para silenciar uma diferença sem verificar o catálogo.

## Contratos de API e erros

| Função                            | Método | Entrada                                       | Fonte                                                                                                             |
| --------------------------------- | ------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `requestEmailChangeFn`            | POST   | `requestEmailChangeInputSchema`               | [email-change-server.ts](../../../src/features/auth/email-change-server.ts)                                       |
| `requestMagicLinkFn`              | POST   | `requestMagicLinkInputSchema`                 | [magic-link-server.ts](../../../src/features/auth/magic-link-server.ts)                                           |
| `syncMagicLinkVerificationFn`     | POST   | `Sem schema de entrada explícito neste bloco` | [magic-link-server.ts](../../../src/features/auth/magic-link-server.ts)                                           |
| `requestPhoneChangeOtpFn`         | POST   | `requestPhoneChangeInputSchema`               | [phone-change-server.ts](../../../src/features/auth/phone-change-server.ts)                                       |
| `confirmPhoneChangeWithOtpFn`     | POST   | `confirmPhoneChangeInputSchema`               | [phone-change-server.ts](../../../src/features/auth/phone-change-server.ts)                                       |
| `resetPasswordWithOtpFn`          | POST   | `resetPasswordWithOtpInputSchema`             | [reset-password-otp-server.ts](../../../src/features/auth/reset-password-otp-server.ts)                           |
| `requestPasswordResetFn`          | POST   | `requestPasswordResetInputSchema`             | [reset-password-server.ts](../../../src/features/auth/reset-password-server.ts)                                   |
| `syncPasswordResetVerificationFn` | POST   | `Sem schema de entrada explícito neste bloco` | [reset-password-server.ts](../../../src/features/auth/reset-password-server.ts)                                   |
| `getCurrentAccountContext`        | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/auth/server.ts)                                                                 |
| `updateCurrentProfile`            | POST   | `updateCurrentProfileInputSchema`             | [server.ts](../../../src/features/auth/server.ts)                                                                 |
| `setCurrentProfileAvatar`         | POST   | `setCurrentProfileAvatarInputSchema`          | [server.ts](../../../src/features/auth/server.ts)                                                                 |
| `signProfileAvatar`               | GET    | `signProfileAvatarInputSchema`                | [server.ts](../../../src/features/auth/server.ts)                                                                 |
| `uploadCurrentProfileAvatar`      | POST   | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/auth/server.ts)                                                                 |
| `requestSignupFn`                 | POST   | `requestSignupInputSchema`                    | [signup-server.ts](../../../src/features/auth/signup-server.ts)                                                   |
| `verifyInstitutionalMembershipFn` | POST   | `Sem schema de entrada explícito neste bloco` | [verify-institutional-membership-server.ts](../../../src/features/auth/verify-institutional-membership-server.ts) |

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
- [schemas.ts](../../../src/features/auth/schemas.ts)
- [server.ts](../../../src/features/auth/server.ts)

[Índice](../README.md) · [Contratos transversais](../CONTRATOS_TRANSVERSAIS.md)
