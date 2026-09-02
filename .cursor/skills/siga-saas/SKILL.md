---
name: siga-saas
description: >-
  Extends SIGA SaaS backend still hosted in the school app: tenants,
  platform_admins, provisionSchoolTenant, signupSchoolPublic. Use when
  editing src/features/saas, /saas-admin, or provisioning. UI destination
  is ADMIN (painel/admin) and WEB /start — do not grow the SIGA wizard.
---

# SIGA · backend SaaS (transitional)

Arquitectura: [ARCHITECTURE_HARMONIZATION.md](../../../docs/agents/ARCHITECTURE_HARMONIZATION.md).
UI destino: ADMIN (`siga-admin`, `/tenants`) e wizard WEB (`siga-web`, `/start`).
**Não** crescer o wizard comercial no SIGA. `/saas-admin` é ponte para o ADMIN.

- Rota actual: `saas-admin.tsx` (gate + `SaaSControlCenter` — UI a migrar)
- Ponte pública: `criar-escola.tsx` → `getCreateSchoolUrl()` (WEB `/start`)
- Servidor: `src/features/saas/server.ts` (`requirePlatformAdmin`, `getSaaSStats`,
  `listTenants`, `provisionSchoolTenant`, `updateTenantStatusFn`)
- Cliente: `src/lib/saas/provisioning-service.ts` — wrappers finos + fallback
  demo se o servidor falhar (tabelas em falta, sem ser platform admin, etc.)
- SQL: `supabase/APPLY_SAAS_PLATFORM.sql` (terceiro a aplicar no SGA, depois
  de `APPLY_IN_SQL_EDITOR.sql` e `APPLY_ENROLLMENT_AND_PREMIUM.sql`)
- Multi-tenant por subdomínio (opcional, já montado em `__root.tsx`):
  `src/lib/saas/tenant-resolver.ts`, `src/features/saas/tenant-context.tsx`

## Regras

1. **1 tenant = 1 escola.** `school_id`/`current_school_id()` continuam a ser
   o único limite de isolamento operacional (students, invoices, grades...).
   `tenant_id` só existe em `schools` (1:1) e nas tabelas comerciais novas —
   nunca acrescentar `tenant_id` às tabelas de domínio.
2. **Administrador da plataforma ≠ Administrador de escola.** É a tabela
   `platform_admins`, sem ligação a `profiles.cargo`. `requirePlatformAdmin()`
   é o portão real; a regra em `access-policy.ts` só reduz quem sequer tenta.
3. Provisionar escola cria, nesta ordem: `tenants` → `subscriptions` (se plano) →
   `tenant_domains` → `schools` → utilizador Auth → `profiles` (upsert) → `school_memberships` →
   `roles`/`member_roles` → `tenant_usage` → `saas_audit_logs`. Qualquer falha
   depois de criar o utilizador Auth desfaz tudo (`deleteUser` + deletes).
4. Nunca inserir directamente nas tabelas `tenants`/`plans`/etc. a partir do
   browser — sempre via `createServerFn` em `server.ts` (service role, RLS
   destas tabelas só deixa passar `is_platform_admin()`).
5. Testes: `tests/saas/schemas.test.ts` — só lógica pura (padrão do projecto:
   sem mock de Supabase).
