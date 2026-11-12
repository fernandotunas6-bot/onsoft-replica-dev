# Provisionamento e administração da plataforma

**Data:** 08/10/2026. **Estado:** implementação presente; aceitação integrada por concluir. As alterações específicas são distinguidas no documento de correcções.

## Objectivo e âmbito

Provisionamento e administração da plataforma; operar dentro da responsabilidade escolar/plataforma definida pela arquitectura, sem duplicar a fonte de verdade de outro módulo.

## Estado actual e comportamento pretendido

**Implementado:** os ficheiros, contratos e tabelas abaixo estão inventariados. A auditoria anterior e os testes locais identificam provas parciais. Não implica que todas as operações estejam completas.

**Proposto:** concluir em staging os critérios de persistência, recuperação e isolamento indicados nesta SPEC. **Por decidir:** regras da instituição não presentes na configuração/documentação e acessos externos indispensáveis.

## Perfis e permissões

Visitante no signup; platform_admins no controlo global. O cargo não substitui grant por módulo nem âmbito escolar. O servidor volta a autorizar cada pedido.

## Pré-condições e dependências

Sessão válida, vínculo activo e escola seleccionada autorizada; configurações do ano/turma/contrato quando usadas. Escrita sensível exige AAL2. Relações carregadas de outra escola são recusadas. Testes com escrita exigem ambiente isolado e destinos sintéticos.

## Fluxo principal e alternativas

WEB recolhe instituição/conta → API provisiona tenant/escola/vínculos/plano/domínio → ADMIN supervisiona → SIGA inicia configuração.

Sem pré-requisito: explicar a falta e ligar à configuração responsável. Sem permissão: impedir o pedido. Erro recuperável: preservar o preenchimento, mostrar o motivo e permitir repetir sem duplicar. Conflito de versão/capacidade: reler o contexto e pedir revisão antes de gravar. Transporte externo indisponível: não anunciar entrega/sucesso fictícios.

## Estados e transições

- `academic_years.status`: `active`, `archived`, `closed`, `draft`
- `document_sequences.document_type`: `certificate`, `credit_note`, `declaration`, `expense`, `invoice`, `other`, `receipt`, `term`, `transfer`
- `fee_items.frequency`: `annual`, `monthly`, `once`, `term`
- `fee_items.kind`: `enrollment`, `other`, `service`, `tuition`
- `fee_plans.status`: `active`, `draft`, `retired`
- `school_email_routes.status`: `active`, `failed`, `pending`, `suspended`
- `school_memberships.status`: `active`, `invited`, `revoked`, `suspended`
- `schools.status`: `active`, `archived`, `setup`, `suspended`
- `students.status`: `active`, `applicant`, `cancelled`, `graduated`, `inactive`, `locked`, `suspended`, `transferred`, `withdrawn`
- `subscriptions.billing_period`: `monthly`, `quarterly`, `semiannual`, `yearly`
- `subscriptions.status`: `active`, `canceled`, `past_due`, `trialing`, `unpaid`
- `tenant_domains.status`: `active`, `failed`, `pending`
- `tenant_domains.type`: `custom_domain`, `siga_subdomain`
- `tenant_mailboxes.provider`: `google`, `simulated`, `zoho`
- `tenant_mailboxes.status`: `active`, `deleted`, `suspended`
- `tenant_provisioning.provisioning_status`: `active`, `cancelled`, `failed`, `pending`, `processing`, `suspended`
- `tenants.status`: `active`, `archived`, `cancelled`, `past_due`, `provisioning`, `provisioning_failed`, `suspended`, `trial`

Enum permitido não autoriza qualquer transição: as guardas de alteração, publicação, fecho e reabertura no servidor/SQL são normativas. Transições sem regra documentada ficam **por decidir**, não são habilitadas por esta SPEC.

## Campos, formatos e validações

Os schemas ligados são o contrato efectivo, incluindo refinamentos, campos opcionais/defaults e validação condicional. O inventário abaixo mostra as declarações encontradas; expressões multilinha e schemas derivados devem ser lidos na fonte, não inferidos apenas desta tabela.

| Campo | Declaração observada | Schema de origem |
| --- | --- | --- |
| `name` | `z.string().trim().min(2, "Nome da escola obrigatório"),` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `commercial_name` | `z.string().trim().optional(),` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `nif` | `z` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `address` | `z.string().trim().max(200).optional(),` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `city` | `z.string().trim().max(80).optional(),` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `province` | `z` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `municipality` | `z.string().trim().max(80).optional(),` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `commune` | `z.string().trim().max(80).optional(),` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `neighborhood` | `z.string().trim().max(120).optional(),` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `school_type` | `z` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `teaching_levels` | `z` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `secondary_courses` | `z` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `phone` | `optionalAngolaPhone,` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `email` | `normalizedEmail("E-mail da escola inválido").optional().or(z.literal("")),` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `logo_url` | `z.string().trim().optional(),` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `contact_name` | `z.string().trim().min(2, "Nome do responsável obrigatório"),` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `contact_role` | `z.string().trim().optional(),` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `contact_phone` | `optionalAngolaPhone,` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `contact_email` | `normalizedEmail("E-mail do responsável inválido"),` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `plan_code` | `planCodeSchema,` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `trial_days` | `z.number().int().min(0).max(90).default(14),` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `slug` | `z` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `admin_email` | `normalizedEmail("E-mail do administrador inválido"),` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `admin_name` | `z.string().trim().min(2, "Nome do administrador obrigatório"),` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `admin_password` | `adminPasswordSchema.optional(),` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `tenantId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `status` | `z.enum([` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `email` | `z.string().trim().email("E-mail inválido"),` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `userId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `tenantId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `hostname` | `z` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `domainId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `domainId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `status` | `z.enum(["pending", "active", "failed"]),` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `slug` | `z.string().trim().toLowerCase().min(1),` | [schemas.ts](../../../src/features/saas/schemas.ts) |
| `hostname` | `z.string().trim().toLowerCase().min(3).max(253),` | [schemas.ts](../../../src/features/saas/schemas.ts) |

## Regras de negócio e fonte

Administrador escolar não é administrador da plataforma; subscrição SaaS é distinta de propina. Rollback e limites são verificáveis.

Fonte: implementação e skills canónicos, `DATABASE_RULES.md`, configuração efectiva da escola e SPEC temática quando ligada. Regras académicas/financeiras sem fundamento institucional confirmado ficam **por decidir**.

## Modelo de dados e relações

Tabelas confirmadas no banco existente; este levantamento não propõe substituí-las:

| Tabela | Colunas existentes |
| --- | --- |
| `academic_years` | `id`, `school_id`, `name`, `starts_on`, `ends_on`, `status`, `created_at`, `created_by`, `updated_by` |
| `document_sequences` | `id`, `school_id`, `document_type`, `prefix`, `next_number`, `padding`, `updated_at` |
| `enrollment_forms` | `id`, `school_id`, `slug`, `title`, `subtitle`, `hero_text`, `accent_color`, `logo_url`, `is_open`, `visible_fields`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version` |
| `fee_items` | `id`, `school_id`, `fee_plan_id`, `code`, `name`, `kind`, `amount`, `frequency`, `is_active`, `created_at`, `grade_level_id` |
| `fee_plans` | `id`, `school_id`, `academic_year_id`, `code`, `name`, `currency_code`, `status`, `created_at` |
| `finance_gateway_webhook_events` | `id`, `school_id`, `channel`, `http_status`, `ok`, `message`, `reference`, `invoice_id`, `amount`, `provider`, `dev_mode`, `external_id`, `created_at` |
| `member_roles` | `school_id`, `membership_id`, `role_id`, `created_at` |
| `permissions` | `id`, `code`, `description` |
| `plans` | `id`, `name`, `code`, `description`, `max_students`, `max_staff`, `max_storage_gb`, `price_aoa_monthly`, `price_aoa_yearly`, `features`, `is_active`, `created_at`, `updated_at` |
| `platform_admins` | `user_id`, `created_at` |
| `profiles` | `id`, `display_name`, `locale`, `created_at`, `updated_at`, `phone`, `full_name`, `avatar_url`, `cargo`, `school_id`, `national_id`, `first_name`, `last_name`, `preferred_name`, `avatar_path`, `timezone`, `status`, `onboarding_status`, `last_active_at` |
| `role_permissions` | `school_id`, `role_id`, `permission_id` |
| `roles` | `id`, `school_id`, `code`, `name`, `is_system`, `created_at` |
| `saas_audit_logs` | `id`, `tenant_id`, `user_id`, `action`, `entity`, `entity_id`, `metadata`, `ip_address`, `created_at` |
| `saas_signup_leads` | `id`, `session_id`, `last_step`, `plan_code`, `school_name`, `email`, `contact_name`, `contact_phone`, `email_verified_at`, `completed_at`, `tenant_id`, `reminder_count`, `last_reminder_at`, `unsubscribed_at`, `created_at`, `updated_at` |
| `school_branding` | `id`, `school_id`, `logo_url`, `favicon_url`, `primary_color`, `secondary_color`, `school_name`, `short_name`, `portal_title`, `login_background`, `created_at`, `updated_at` |
| `school_email_routes` | `id`, `school_id`, `source_address`, `destination_address`, `provider`, `status`, `verified`, `created_at`, `updated_at`, `cloudflare_route_id` |
| `school_memberships` | `id`, `school_id`, `user_id`, `status`, `created_at`, `updated_at`, `joined_at`, `invited_at`, `activated_at`, `suspended_at`, `last_access_at` |
| `school_settings` | `id`, `school_id`, `domain`, `version`, `value`, `changed_by`, `created_at` |
| `schools` | `id`, `public_code`, `name`, `timezone`, `currency_code`, `status`, `theme`, `created_at`, `updated_at`, `nif`, `email`, `phone`, `province`, `municipality`, `address`, `logo_path`, `official_authorization_reference`, `tenant_id`, `commercial_name`, `city`, `logo_url`, `director_name`, `evaluation_periods`, `passing_grade`, `preferences`, `commune`, `neighborhood`, `latitude`, `longitude` |
| `students` | `id`, `school_id`, `person_id`, `student_number`, `admission_date`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at` |
| `subscriptions` | `id`, `tenant_id`, `plan_id`, `status`, `current_period_start`, `current_period_end`, `cancel_at_period_end`, `created_at`, `updated_at`, `billing_period` |
| `tenant_domains` | `id`, `tenant_id`, `hostname`, `type`, `status`, `ssl_status`, `verified_at`, `created_at`, `last_checked_at`, `check_count`, `updated_at` |
| `tenant_mailboxes` | `id`, `tenant_id`, `email`, `display_name`, `provider`, `provider_account_id`, `status`, `created_at`, `updated_at` |
| `tenant_provisioning` | `id`, `school_id`, `domain_status`, `email_status`, `subscription_status`, `ssl_status`, `provisioning_status`, `error_message`, `created_at`, `updated_at`, `completed_at` |
| `tenant_usage` | `id`, `tenant_id`, `active_students_count`, `active_staff_count`, `storage_bytes_used`, `api_calls_count`, `last_calculated_at` |
| `tenants` | `id`, `name`, `slug`, `status`, `plan_id`, `subscription_status`, `trial_ends_at`, `contact_name`, `contact_phone`, `contact_email`, `max_students`, `max_storage_gb`, `created_at`, `updated_at`, `billing_exempt`, `billing_exempt_reason` |

Relações confirmadas:

- `academic_years` → `schools` (`academic_years_school_id_fkey`)
- `document_sequences` → `schools` (`document_sequences_school_id_fkey`)
- `enrollment_forms` → `schools` (`enrollment_forms_school_id_fkey`)
- `fee_items` → `fee_plans` (`fee_items_school_id_fee_plan_id_fkey`)
- `fee_items` → `grade_levels` (`fee_items_grade_level_fkey`)
- `fee_items` → `schools` (`fee_items_school_id_fkey`)
- `fee_plans` → `academic_years` (`fee_plans_school_id_academic_year_id_fkey`)
- `fee_plans` → `schools` (`fee_plans_school_id_fkey`)
- `finance_gateway_webhook_events` → `schools` (`finance_gateway_webhook_events_school_id_fkey`)
- `member_roles` → `roles` (`member_roles_role_id_fkey`)
- `member_roles` → `roles` (`member_roles_school_id_role_id_fkey`)
- `member_roles` → `school_memberships` (`member_roles_membership_id_fkey`)
- `member_roles` → `school_memberships` (`member_roles_school_id_membership_id_fkey`)
- `member_roles` → `schools` (`member_roles_school_id_fkey`)
- `profiles` → `schools` (`profiles_school_id_fkey`)
- `role_permissions` → `permissions` (`role_permissions_permission_id_fkey`)
- `role_permissions` → `roles` (`role_permissions_role_id_fkey`)
- `role_permissions` → `roles` (`role_permissions_school_id_role_id_fkey`)
- `role_permissions` → `schools` (`role_permissions_school_id_fkey`)
- `roles` → `schools` (`roles_school_id_fkey`)
- `saas_audit_logs` → `tenants` (`saas_audit_logs_tenant_id_fkey`)
- `saas_signup_leads` → `tenants` (`saas_signup_leads_tenant_id_fkey`)
- `school_branding` → `schools` (`school_branding_school_id_fkey`)
- `school_email_routes` → `schools` (`school_email_routes_school_id_fkey`)
- `school_memberships` → `schools` (`school_memberships_school_id_fkey`)
- `school_settings` → `schools` (`school_settings_school_id_fkey`)
- `schools` → `tenants` (`schools_tenant_id_fkey`)
- `students` → `people` (`students_school_id_person_id_fkey`)
- `students` → `schools` (`students_school_id_fkey`)
- `subscriptions` → `plans` (`subscriptions_plan_id_fkey`)
- `subscriptions` → `tenants` (`subscriptions_tenant_id_fkey`)
- `tenant_domains` → `tenants` (`tenant_domains_tenant_id_fkey`)
- `tenant_mailboxes` → `tenants` (`tenant_mailboxes_tenant_id_fkey`)
- `tenant_provisioning` → `schools` (`tenant_provisioning_school_id_fkey`)
- `tenant_usage` → `tenants` (`tenant_usage_tenant_id_fkey`)
- `tenants` → `plans` (`tenants_plan_id_fkey`)

## Contratos de API e erros

| Função | Método | Entrada | Fonte |
| --- | --- | --- | --- |
| `listResendDomainsFn` | GET | `Sem schema de entrada explícito neste bloco` | [resend-domains-server.ts](../../../src/features/saas/resend-domains-server.ts) |
| `verifyResendDomainFn` | POST | `verifyResendDomainInputSchema` | [resend-domains-server.ts](../../../src/features/saas/resend-domains-server.ts) |
| `createResendDomainFn` | POST | `createResendDomainInputSchema` | [resend-domains-server.ts](../../../src/features/saas/resend-domains-server.ts) |
| `checkTenantSlug` | GET | `tenantSlugInputSchema` | [server.ts](../../../src/features/saas/server.ts) |
| `getTenantBySlug` | GET | `tenantSlugInputSchema` | [server.ts](../../../src/features/saas/server.ts) |
| `getTenantByHostname` | GET | `tenantHostnameInputSchema` | [server.ts](../../../src/features/saas/server.ts) |
| `getTenantForCurrentUser` | GET | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/saas/server.ts) |
| `listPlans` | GET | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/saas/server.ts) |
| `getIsPlatformAdmin` | GET | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/saas/server.ts) |
| `getSaaSStats` | GET | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/saas/server.ts) |
| `listTenants` | GET | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/saas/server.ts) |
| `updateTenantStatusFn` | POST | `updateTenantStatusInputSchema` | [server.ts](../../../src/features/saas/server.ts) |
| `provisionSchoolTenant` | POST | `createSchoolWizardInputSchema` | [server.ts](../../../src/features/saas/server.ts) |
| `signupSchoolPublic` | POST | `publicSchoolSignupInputSchema` | [server.ts](../../../src/features/saas/server.ts) |
| `getSchoolDomain` | GET | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/saas/server.ts) |
| `requestDomainVerification` | POST | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/saas/server.ts) |
| `updateEmailForwarding` | POST | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/saas/server.ts) |
| `updateSchoolBranding` | POST | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/saas/server.ts) |
| `provisionMailbox` | POST | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/saas/server.ts) |
| `getMySubscription` | GET | `Sem schema de entrada explícito neste bloco` | [subscription-server.ts](../../../src/features/saas/subscription-server.ts) |
| `requestPlanChange` | POST | `requestPlanChangeInputSchema` | [subscription-server.ts](../../../src/features/saas/subscription-server.ts) |
| `cancelPlanChangeRequest` | POST | `Sem schema de entrada explícito neste bloco` | [subscription-server.ts](../../../src/features/saas/subscription-server.ts) |
| `startPlanPayment` | POST | `Sem schema de entrada explícito neste bloco` | [subscription-server.ts](../../../src/features/saas/subscription-server.ts) |
| `submitPlanPaymentProof` | POST | `Sem schema de entrada explícito neste bloco` | [subscription-server.ts](../../../src/features/saas/subscription-server.ts) |

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

- [admin-account.test.ts](../../../tests/saas/admin-account.test.ts)
- [admin-login-mfa.test.ts](../../../tests/saas/admin-login-mfa.test.ts)
- [admin-school-url.test.ts](../../../tests/saas/admin-school-url.test.ts)
- [alive-bridges.test.ts](../../../tests/saas/alive-bridges.test.ts)
- [commercial-lifecycle-rules.test.ts](../../../tests/saas/commercial-lifecycle-rules.test.ts)
- [custom-domain-claim.test.ts](../../../tests/saas/custom-domain-claim.test.ts)
- [debug-schema.test.ts](../../../tests/saas/debug-schema.test.ts)
- [debug-signup.test.ts](../../../tests/saas/debug-signup.test.ts)
- [deploy-production-workflow.test.ts](../../../tests/saas/deploy-production-workflow.test.ts)
- [domain-polling.test.ts](../../../tests/saas/domain-polling.test.ts)
- [domain-verify.test.ts](../../../tests/saas/domain-verify.test.ts)
- [e2e-cleanup.test.ts](../../../tests/saas/e2e-cleanup.test.ts)
- [ecosystem-cors.test.ts](../../../tests/saas/ecosystem-cors.test.ts)
- [ecosystem-flow.test.ts](../../../tests/saas/ecosystem-flow.test.ts)
- [email-routing.test.ts](../../../tests/saas/email-routing.test.ts)
- [mailbox-providers.test.ts](../../../tests/saas/mailbox-providers.test.ts)
- [notify-ci-failure.test.ts](../../../tests/saas/notify-ci-failure.test.ts)
- [payflow-bindings.test.ts](../../../tests/saas/payflow-bindings.test.ts)
- [plan-features.test.ts](../../../tests/saas/plan-features.test.ts)
- [platform-admin-mfa.test.ts](../../../tests/saas/platform-admin-mfa.test.ts)
- [platform-domain.test.ts](../../../tests/saas/platform-domain.test.ts)
- [platform-owned-hostname.test.ts](../../../tests/saas/platform-owned-hostname.test.ts)
- [provisioning-observability.test.ts](../../../tests/saas/provisioning-observability.test.ts)
- [provisioning-verify.test.ts](../../../tests/saas/provisioning-verify.test.ts)
- [public-signup.test.ts](../../../tests/saas/public-signup.test.ts)
- [resend-domains-platform-only.test.ts](../../../tests/saas/resend-domains-platform-only.test.ts)
- [resend-domains-schemas.test.ts](../../../tests/saas/resend-domains-schemas.test.ts)
- [rls-isolation.test.ts](../../../tests/saas/rls-isolation.test.ts)
- [schemas.test.ts](../../../tests/saas/schemas.test.ts)
- [school-bootstrap.test.ts](../../../tests/saas/school-bootstrap.test.ts)
- [settings-identity.test.ts](../../../tests/saas/settings-identity.test.ts)
- [signup-captcha.test.ts](../../../tests/saas/signup-captcha.test.ts)
- [signup-details.test.ts](../../../tests/saas/signup-details.test.ts)
- [signup-payload-contract.test.ts](../../../tests/saas/signup-payload-contract.test.ts)
- [signup-teaching-context.test.ts](../../../tests/saas/signup-teaching-context.test.ts)
- [signup-validation.test.ts](../../../tests/saas/signup-validation.test.ts)
- [sql-sga-checklist.test.ts](../../../tests/saas/sql-sga-checklist.test.ts)
- [subscription-view.test.ts](../../../tests/saas/subscription-view.test.ts)
- [tenant-access.test.ts](../../../tests/saas/tenant-access.test.ts)
- [tenant-by-school.test.ts](../../../tests/saas/tenant-by-school.test.ts)
- [tenant-limits.test.ts](../../../tests/saas/tenant-limits.test.ts)
- [tenant-lookup-public-columns.test.ts](../../../tests/saas/tenant-lookup-public-columns.test.ts)
- [tenant-lookup.test.ts](../../../tests/saas/tenant-lookup.test.ts)
- [tenant-resolver.test.ts](../../../tests/saas/tenant-resolver.test.ts)
- [tenant-security.test.ts](../../../tests/saas/tenant-security.test.ts)
- [usage-sync.test.ts](../../../tests/saas/usage-sync.test.ts)

**Riscos/pendências:** jornada anual e A/B autenticado exigem staging; concorrência PostgreSQL, fornecedores, restauro, artefactos oficiais extensos e dispositivos reais não ficam certificados por mocks/PGlite. Consultar a matriz e o progresso para o resultado efectivamente executado.

## Fontes e navegação

- [criar-escola.tsx](../../../src/routes/criar-escola.tsx)
- [saas-admin.tsx](../../../src/routes/saas-admin.tsx)
- [schemas.ts](../../../src/features/saas/schemas.ts)
- [server.ts](../../../src/features/saas/server.ts)

[Índice](../README.md) · [Contratos transversais](../CONTRATOS_TRANSVERSAIS.md)
