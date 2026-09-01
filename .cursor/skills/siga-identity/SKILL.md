---
name: siga-identity
description: >-
  Módulo de Identidade Digital SIGA Plus: domínios multi-tenant, subdomínios
  automáticos por escola, tenant resolver, e-mail institucional, encaminhamento,
  domínio personalizado, branding por escola, planos de identidade digital e
  integração Cloudflare. Usar quando trabalhar em:
  - src/features/saas/domain-verify.ts
  - src/features/saas/tenant-lookup.ts
  - src/lib/saas/tenant-resolver.ts
  - docs/domains/, docs/email/, docs/cloudflare/, docs/multi-tenant/, docs/provisioning/
  - tabelas: tenant_domains, school_email_routes, mailboxes, school_branding,
    reserved_subdomains, subscription_addons
  - painel de "Identidade Digital" no Admin SaaS ou nas Settings da escola
---

# SIGA · Identidade Digital (Digital Identity)

Ler primeiro:
- [docs/domains/OVERVIEW.md](../../../docs/domains/OVERVIEW.md) — arquitectura canónica
- [docs/agents/ARCHITECTURE_HARMONIZATION.md](../../../docs/agents/ARCHITECTURE_HARMONIZATION.md) — ecossistema

---

## 1. Princípio Central

```
NÃO criar DNS por escola.
Wildcard *.{{DOMINIO_PRINCIPAL}} aponta para a aplicação.
A aplicação resolve o tenant pelo hostname.
```

O domínio da plataforma é **sempre** lido de:
```env
PLATFORM_DOMAIN={{DOMINIO_PRINCIPAL}}
```
Nunca hardcoded. Nunca `VITE_*` para tokens Cloudflare.

---

## 2. Ficheiros Existentes

| Ficheiro | O que faz |
|---|---|
| `src/lib/saas/tenant-resolver.ts` | `resolveTenantLookup(hostname)` — modo slug ou hostname |
| `src/features/saas/tenant-lookup.ts` | `fetchTenantBySlug()` + `fetchTenantByHostname()` → Supabase |
| `src/features/saas/tenant-context.tsx` | Provider React `TenantProvider` / hook `useTenant()` |
| `src/features/saas/domain-verify.ts` | `verifyCustomDomainDns()` — CNAME ou TXT |
| `src/features/saas/provisioning-core.ts` | `provisionTenantCore()` — criação completa de escola |
| `src/features/saas/plan-features.ts` | `planIncludesModule()` — feature gate por plano |
| `supabase/APPLY_SAAS_PLATFORM.sql` | Schema: `tenants`, `tenant_domains`, `subscriptions` |

---

## 3. Regras Absolutas

### Segurança

1. **Nunca** expor `CLOUDFLARE_API_TOKEN` no frontend (sem `VITE_*`)
2. **Nunca** confiar apenas no hostname para autorização — validar `school_id` no backend
3. **Nunca** permitir From arbitrário em e-mail — somente domínios verificados
4. **Sempre** validar slug no backend (não apenas frontend)
5. **Sempre** RLS activo em tabelas com `school_id` / `tenant_id`

### Dados

6. **1 tenant = 1 escola** — relação 1:1 via `schools.tenant_id`
7. **Nunca** criar instalação separada do SIGA por escola — arquitectura multi-tenant
8. **Nunca** alterar `tenants` / `tenant_domains` directamente do browser
9. **Sempre** usar `createServerFn` + service role para operações SaaS
10. **Sempre** registar operações críticas em `saas_audit_logs`

### Domínios

11. **Nunca** hardcodar domínio — usar `process.env.PLATFORM_DOMAIN`
12. **Nunca** criar DNS record por escola — wildcard resolve tudo
13. **Nunca** alterar slug sem registar em `school_slug_history` e manter redirect
14. **Sempre** verificar slug contra `reserved_subdomains` antes de aceitar

### Provisionamento

15. **Sempre** seguir a ordem: `tenants → subscriptions → tenant_domains → schools → auth user → profile → membership → roles`
16. **Sempre** fazer rollback se qualquer passo falhar
17. **Nunca** deixar tenant incompleto na base de dados

---

## 4. Fluxo de Tenant Resolution

```typescript
// Dado um hostname:
const lookup = resolveTenantLookup(hostname);
// → { mode: "slug", slug: "esperanca" }
// → { mode: "hostname", hostname: "portal.escola.ao" }

const tenant =
  lookup.mode === "slug"
    ? await fetchTenantBySlug(lookup.slug)
    : await fetchTenantByHostname(lookup.hostname);
```

### Casos especiais de hostname

| hostname | Resultado |
|---|---|
| `localhost` / `127.0.0.1` | DEV fallback → slug `minha-escola` |
| `*.{{DOMINIO_PRINCIPAL}}` | slug = primeiro segmento |
| `admin.*` / `saas-admin.*` | `isAdminArea = true` |
| outro domínio | lookup em `tenant_domains` |

---

## 5. Verificação de Slug

```typescript
// Disponível se:
// 1. Não existe em tenants.slug
// 2. Não existe em reserved_subdomains
// 3. Não existe em slug_reservations com expires_at > NOW()
// 4. Formato válido: /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/

// API:
// GET /api/domains/check?slug=esperanca
// → { available: true, slug: "esperanca" }
// → { available: false, reason: "reserved" | "taken" | "invalid" }
```

---

## 6. Verificação de Domínio Personalizado

```typescript
import { verifyCustomDomainDns } from "@/features/saas/domain-verify";

const result = await verifyCustomDomainDns(
  "portal.escola.ao",  // hostname do cliente
  "esperanca",          // slug do tenant
  tenantId              // para token TXT
);
// → { ok: true, method: "cname" }
// → { ok: false, reason: "..." }
```

Instruções para o cliente:
```
CNAME portal → esperanca.portal-siga.com
  OU
TXT _siga-verify.portal.escola.ao → siga-verify={tenantId}
```

---

## 7. Feature Gate por Plano

```typescript
import { planIncludesModule } from "@/features/saas/plan-features";
import { useTenant } from "@/features/saas/tenant-context";

// React:
const { activePlan } = useTenant();
const canAccessFinance = planIncludesModule(activePlan, "financeiro");

// Server (para features de identidade digital):
const hasCustomDomain = activePlan?.features?.custom_domain ?? false;
if (!hasCustomDomain) throw new ForbiddenError("Requer plano Premium");
```

---

## 8. Tabelas Relevantes

### Existentes (não recriar)

```
tenants              → tenant comercial (slug, status, plan_id)
tenant_domains       → hostnames (siga_subdomain | custom_domain)
subscriptions        → ciclo de facturação
saas_audit_logs      → auditoria SaaS
```

### A criar (módulo Digital Identity)

```
reserved_subdomains      → slugs proibidos
school_branding          → logo, cores, favicon
school_email_routes      → encaminhamento institucional
mailboxes                → caixas profissionais (ADD-ON)
email_aliases            → aliases para mailboxes
school_slug_history      → histórico de mudanças de slug
slug_reservations        → reserva durante checkout (TTL 30min)
subscription_addons      → ADD-ONs por subscrição
tenant_provisioning      → estado de provisionamento
```

Schema completo: [docs/domains/SCHEMA.md](../../../docs/domains/SCHEMA.md)

---

## 9. E-mail

### Separação de responsabilidades

```
E-mail transacional da plataforma
  → noreply@{{DOMINIO_PRINCIPAL}}
  → configurado em variáveis servidor-only
  → Resend / SendGrid / provider externo

E-mail institucional da escola (plano básico)
  → esperanca@{{DOMINIO_PRINCIPAL}}
  → encaminhamento via school_email_routes
  → Cloudflare Email Routing

Caixas profissionais (ADD-ON)
  → direcao@escola.ao
  → tabela mailboxes
  → provider externo (pago)
```

### Interface obrigatória

```typescript
interface EmailProvider {
  createRoute(source: string, destination: string): Promise<{ routeId: string }>;
  removeRoute(routeId: string): Promise<void>;
  verifyDomain(domain: string): Promise<{ verified: boolean }>;
  sendTransactional(msg: TransactionalEmail): Promise<{ messageId: string }>;
}
```

---

## 10. Branding por Escola

```typescript
// Quando entrar por esperanca.{{DOMINIO_PRINCIPAL}}:
// - carregar school_branding onde school_id = escola activa
// - mostrar logo, nome, cores (sem scripts personalizados)
// - manter identidade SIGA onde aplicável

// Não criar branding se plano não incluir (feature gate)
```

---

## 11. Planos de Identidade Digital (ADD-ON)

| addon_code | Inclui |
|---|---|
| `digital_identity_basic` | `escola.{{DOMINIO_PRINCIPAL}}` + encaminhamento |
| `digital_identity_professional` | Basic + comunicações |
| `digital_identity_premium` | Professional + domínio personalizado |
| `digital_identity_enterprise` | Premium + caixas profissionais + branding |

ADD-ONs em `subscription_addons`. Verificar sempre no servidor:
```typescript
const addons = await getActiveAddons(tenantId);
const hasPremium = addons.some(a => a.addon_code === "digital_identity_premium");
```

---

## 12. UX e UI

- **Não redesenhar** dashboard, sidebar, tabelas ou componentes existentes
- Novas telas usam o design system existente (Shadcn/UI + Tailwind)
- Estados visuais obrigatórios: `Activo | Pendente | A verificar | Erro | Suspenso`
- Bloqueio por plano: mostrar `🔒 Recurso Premium` + botão de upgrade
- Suspenso: mostrar página institucional sem detalhes financeiros
- **Destino das novas UI:** ADMIN (`siga-admin`) → módulo "Domínios & Identidade Digital"
  e SIGA → "Configurações → Identidade Digital"

---

## 13. Procedimento para Alterações

```
ANALISAR  → ler código existente antes de alterar
MAPEAR    → identificar tabelas/funções relevantes
PLANEJAR  → documentar mudança + rollback
IMPLEMENTAR → código incremental
TESTAR    → cenários: slug, domínio, isolamento, plano
CORRIGIR  → bugs encontrados
DOCUMENTAR → actualizar docs/ relevantes
```

Nunca saltar etapas. Nunca aplicar migrations sem backup.

---

## 14. Testes Obrigatórios

```typescript
// Tenant resolution
it("esperanca.DOMAIN → tenant Esperança")
it("horizonte.DOMAIN → tenant Horizonte")
it("admin.DOMAIN → isAdminArea = true")
it("custom domain → lookup por hostname")

// Isolamento
it("user escola A não lê dados escola B")  // OBRIGATÓRIO

// Slug
it("slug válido aceite")
it("slug reservado rejeitado")
it("slug duplicado rejeitado")
it("slug inválido (caracteres) rejeitado")

// Domínio
it("CNAME correcto → verified")
it("CNAME incorrecto → reason explicativo")
it("TXT correcto → verified")

// Plano
it("feature activa → acesso permitido")
it("feature inactiva → ForbiddenError")
it("trial expirado → acesso bloqueado")
```

---

## 15. Referências

- [docs/domains/OVERVIEW.md](../../../docs/domains/OVERVIEW.md)
- [docs/domains/SCHEMA.md](../../../docs/domains/SCHEMA.md)
- [docs/multi-tenant/OVERVIEW.md](../../../docs/multi-tenant/OVERVIEW.md)
- [docs/email/OVERVIEW.md](../../../docs/email/OVERVIEW.md)
- [docs/cloudflare/OVERVIEW.md](../../../docs/cloudflare/OVERVIEW.md)
- [docs/provisioning/OVERVIEW.md](../../../docs/provisioning/OVERVIEW.md)
- [docs/agents/ARCHITECTURE_HARMONIZATION.md](../../../docs/agents/ARCHITECTURE_HARMONIZATION.md)
