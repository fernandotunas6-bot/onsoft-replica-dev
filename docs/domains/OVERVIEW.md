# Domínios, E-mail & Identidade Digital — SIGA Plus

> Documentação canónica para agentes e equipas técnicas.
> Leia [ARCHITECTURE_HARMONIZATION.md](../agents/ARCHITECTURE_HARMONIZATION.md) antes de alterar qualquer código que cruze aplicações.

---

## 1. Domínio Central

O domínio da plataforma **nunca** é codificado directamente no código-fonte.
Toda referência deriva de uma única variável de ambiente:

```env
PLATFORM_DOMAIN={{DOMINIO_PRINCIPAL}}
```

No servidor:
```typescript
const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN;
// ex.: "siga.ao"
```

### Subdomínios reservados

| Subdomínio | Destino |
|---|---|
| `www` | Landing page (WEB) |
| `app` | Portal SIGA geral / login |
| `admin` | Painel SaaS (ADMIN) |
| `payflow` | Pagamentos (PAYFLOW) |
| `api` | API REST / Edge Functions |
| `auth` | Supabase Auth |
| `status` | Status page (futuro) |
| `mail`, `smtp`, `imap`, `pop` | Infraestrutura de e-mail |
| `billing`, `financeiro` | Billing SaaS |
| `support`, `suporte`, `help`, `ajuda` | Suporte |
| `docs`, `documentation` | Documentação |
| `cdn`, `static`, `assets` | CDN |
| `security`, `seguranca` | Segurança |
| `login`, `signup`, `register` | Auth helpers |
| `root`, `cloud`, `system`, `sistema` | Infra reservada |
| `pagamentos`, `payments` | Alias PayFlow (reservados) |

Estes slugs são geridos pela tabela `reserved_subdomains` e **nunca** podem ser atribuídos a uma escola.

---

## 2. Arquitectura de Subdomínios

```
{{DOMINIO_PRINCIPAL}}
│
├── www.{{DOMINIO_PRINCIPAL}}      → Landing (WEB)
├── app.{{DOMINIO_PRINCIPAL}}      → SIGA Plus (login geral)
├── admin.{{DOMINIO_PRINCIPAL}}    → Admin SaaS (ADMIN)
├── payflow.{{DOMINIO_PRINCIPAL}}  → PayFlow (pagamentos)
├── docs.{{DOMINIO_PRINCIPAL}}     → Documentação (DOC)
├── api.{{DOMINIO_PRINCIPAL}}      → API
├── auth.{{DOMINIO_PRINCIPAL}}     → Supabase Auth
├── status.{{DOMINIO_PRINCIPAL}}   → Status page (futuro)
│
└── *.{{DOMINIO_PRINCIPAL}}        → Portais das escolas (wildcard)
       │
       ├── esperanca.{{DOMINIO_PRINCIPAL}}
       ├── horizonte.{{DOMINIO_PRINCIPAL}}
       └── colegio-central.{{DOMINIO_PRINCIPAL}}
```

**Princípio fundamental:** NÃO criar registros DNS por escola.
O wildcard `*.{{DOMINIO_PRINCIPAL}}` aponta para a aplicação.
A aplicação resolve o tenant pelo hostname.

---

## 3. Tenant Resolver

### Ficheiros relevantes

| Ficheiro | Responsabilidade |
|---|---|
| `src/lib/saas/tenant-resolver.ts` | Lógica de resolução client-side |
| `src/features/saas/tenant-lookup.ts` | Consulta Supabase por slug ou hostname |
| `src/features/saas/tenant-context.tsx` | Provider React — contexto activo |

### Fluxo de resolução

```
Request (hostname)
        ↓
resolveTenantLookup(hostname)
        ↓
┌───────────────────────────────────────────────────────────────┐
│ localhost / 127.0.0.1           → DEV fallback (minha-escola) │
│ *.{{DOMINIO_PRINCIPAL}}         → slug = primeiro segmento    │
│ outro hostname (custom domain)  → lookup em tenant_domains    │
└───────────────────────────────────────────────────────────────┘
        ↓
fetchTenantBySlug(slug) ou fetchTenantByHostname(hostname)
        ↓
Supabase → tenants + plans + tenant_usage
        ↓
TenantContext.activeTenant
```

### Mapeamento de subdomínios especiais

| hostname | Resolução |
|---|---|
| `{{DOMINIO_PRINCIPAL}}`, `www.*` | Landing page |
| `app.*` | Portal geral / login |
| `admin.*`, `saas-admin.*` | Painel administrativo |
| `payflow.*` | PayFlow (não é tenant escolar) |
| `docs.*` | Documentação |
| `esperanca.*` | Tenant slug = `esperanca` |
| `portal.escola.ao` | Lookup em `tenant_domains` por hostname |

---

## 4. Slug das Escolas

### Regras de validação

- Obrigatório e único globalmente
- Lowercase, sem espaços, sem acentos
- Apenas: `a-z`, `0-9`, `-`
- Mínimo 3, máximo 50 caracteres
- Não pode estar na lista de slugs reservados
- Indexado em `tenants.slug`

### Geração automática

```
"Colégio Adventista Esperança"
→ normalizar (remover acentos, lowercase, espaços → hífens)
→ "colegio-adventista-esperanca"
```

### Alteração de slug (fluxo controlado)

```
1. Solicitar novo slug
2. Verificar disponibilidade (backend — nunca só frontend)
3. Mostrar impacto (URLs afectadas, e-mails, integrações)
4. Confirmação explícita do utilizador
5. Registar em school_slug_history (old → new)
6. Actualizar tenants.slug + tenant_domains.hostname
7. Criar redirect temporário (old → new, TTL configurável)
8. Invalidar cache de tenants
9. Notificar escola por e-mail
```

---

## 5. Modelo de Dados (Identidade Digital)

### Tabelas existentes no SaaS

- `tenants` — tenant comercial (1:1 com escola)
- `tenant_domains` — hostnames activos (siga_subdomain | custom_domain)
- `subscriptions` — plano + ciclo de facturação
- `saas_audit_logs` — auditoria de operações SaaS

### Tabelas a criar no módulo Digital Identity

| Tabela | Propósito |
|---|---|
| `reserved_subdomains` | Lista de slugs proibidos |
| `school_branding` | Logo, cores, favicon por escola |
| `school_email_routes` | Encaminhamento de e-mail institucional |
| `mailboxes` | Caixas de correio profissionais (ADD-ON) |
| `email_aliases` | Aliases para uma mailbox |
| `school_slug_history` | Histórico de mudanças de slug |
| `slug_reservations` | Reserva temporária durante checkout |
| `subscription_addons` | ADD-ONs por subscrição |
| `tenant_provisioning` | Estado de provisionamento por escola |

Ver schema completo em [SCHEMA.md](./SCHEMA.md).

---

## 6. Provisionamento de Escola

O fluxo de criação é transaccional e orquestrado por `provisionTenantCore()`:

```
1. criar tenant (tenants)
2. criar subscription (subscriptions) se plano
3. reservar hostname (tenant_domains)
4. criar escola (schools)
5. criar utilizador Auth (auth.admin.inviteUserByEmail)
6. criar perfil (profiles)
7. criar membership (school_memberships)
8. atribuir role owner (member_roles)
9. sincronizar usage (tenant_usage)
10. bootstrap de dados escolares (bootstrapSchoolDefaults)
11. registo de auditoria (saas_audit_logs)
```

Qualquer falha após criar o utilizador Auth executa rollback:
`deleteUser + deletes em cascata`.

---

## 7. Domínio Personalizado

Fluxo para escolas com domínio próprio:

```
escola.ao   ou   portal.escola.ao
        ↓
Cliente configura CNAME
        ↓
CNAME → custom.{{DOMINIO_PRINCIPAL}}
        ↓
Sistema verifica DNS (verifyCustomDomainDns)
        ↓
Estado: pending → DNS found → verifying → SSL issued → active
        ↓
Inserir em tenant_domains (type: custom_domain)
```

Verificação via `domain-verify.ts`:
- Método 1: `CNAME {hostname} → {slug}.portal-siga.com`
- Método 2: `TXT _siga-verify.{hostname} = siga-verify={tenantId}`

---

## 8. E-mail Institucional

### Separação de responsabilidades

| Tipo | Exemplo | Onde configurar |
|---|---|---|
| Transacional da plataforma | `noreply@{{DOMINIO_PRINCIPAL}}` | `.env` servidor |
| Institucional da escola | `esperanca@{{DOMINIO_PRINCIPAL}}` | `school_email_routes` |
| Caixas profissionais | `direcao@escola.ao` | `mailboxes` (ADD-ON) |

### Encaminhamento (plano básico)

```
esperanca@{{DOMINIO_PRINCIPAL}}
        ↓ encaminhamento (school_email_routes)
        ↓
colegio@gmail.com
```

Não criar servidor SMTP próprio. Usar provider externo (Cloudflare Email, Resend, etc.).

### Providers (interfaces)

```typescript
interface EmailProvider {
  createRoute(source: string, destination: string): Promise<void>;
  removeRoute(routeId: string): Promise<void>;
  verifyDomain(domain: string): Promise<VerifyResult>;
  sendTransactional(msg: TransactionalEmail): Promise<void>;
}

interface DnsProvider {
  createRecord(record: DnsRecord): Promise<void>;
  deleteRecord(recordId: string): Promise<void>;
  verifyRecord(hostname: string, type: string): Promise<boolean>;
}
```

---

## 9. Planos de Identidade Digital (ADD-ON)

| Plano | Domínio | E-mail | Extras |
|---|---|---|---|
| **Basic** | `escola.{{DOMINIO_PRINCIPAL}}` | `escola@{{DOMINIO_PRINCIPAL}}` (encaminhamento) | — |
| **Professional** | `escola.{{DOMINIO_PRINCIPAL}}` | `nome@{{DOMINIO_PRINCIPAL}}` | comunicações |
| **Premium** | `portal.escola.ao` (custom) | `escola@{{DOMINIO_PRINCIPAL}}` | custom domain |
| **Enterprise** | `escola.ao` | `*@escola.ao` | caixas profissionais, branding completo |

ADD-ONs são registados em `subscription_addons`.

---

## 10. Segurança

### Princípios

- RLS em todas as tabelas com `school_id` / `tenant_id`
- Nenhuma leitura cross-tenant possível via policies
- Nunca confiar apenas no hostname — validar `school_id` no backend
- Tokens Cloudflare apenas server-side (nunca `VITE_*`)
- Validar hostnames contra lista de permitidos (anti host-header attack)

### Variáveis de ambiente servidor-only

```env
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_ZONE_ID=
CLOUDFLARE_API_TOKEN=
PLATFORM_DOMAIN=
PLATFORM_BASE_URL=
PLATFORM_ADMIN_URL=
PLATFORM_API_URL=
```

---

## 11. Fases de Implementação

| Fase | Conteúdo |
|---|---|
| **1** | Config domínio central, wildcard DNS, tenant resolver melhorado, slug, segurança, testes |
| **2** | Onboarding, painel de domínio, subscription_addons |
| **3** | E-mail institucional, encaminhamento, e-mail transacional |
| **4** | Domínios personalizados |
| **5** | Caixas profissionais (mailboxes) |
| **6** | White label parcial (Enterprise) |

**Nunca saltar fases sem testar as anteriores.**

---

## 12. Auditoria

Toda operação crítica regista em `saas_audit_logs`:

```
domain_created | domain_verified | domain_removed
slug_changed | email_route_created | email_route_changed
mailbox_created | mailbox_suspended
custom_domain_added | custom_domain_verified
subscription_addon_activated | subscription_addon_deactivated
```

Campos obrigatórios: `user_id`, `school_id`, `ip_address`, `old_value`, `new_value`, `created_at`.

---

## 13. Desenvolvimento Local

Para simular subdomínios em localhost:

```typescript
// Em tenant-resolver.ts, DEV fallback:
const devSlug = localStorage.getItem("siga_dev_tenant_slug");
// Definir via: useTenant().setDevSlug("esperanca")
```

Não é necessário Cloudflare para desenvolvimento básico.

---

## Ver também

- [SCHEMA.md](./SCHEMA.md) — DDL completo das novas tabelas
- [MULTI-TENANT.md](../multi-tenant/OVERVIEW.md) — isolamento e RLS
- [EMAIL.md](../email/OVERVIEW.md) — arquitectura de e-mail
- [CLOUDFLARE.md](../cloudflare/OVERVIEW.md) — integração Cloudflare
- [PROVISIONING.md](../provisioning/OVERVIEW.md) — fluxo de provisionamento
