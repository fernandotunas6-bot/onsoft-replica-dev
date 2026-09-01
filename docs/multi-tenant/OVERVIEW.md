# Multi-Tenancy & Isolamento — SIGA Plus

> Garante que nenhuma escola acede a dados de outra escola.

---

## Princípio de Isolamento

```
1 tenant = 1 escola = 1 school_id
```

- **`school_id`** — isolamento operacional (alunos, notas, propinas, etc.)
- **`tenant_id`** — isolamento comercial (planos, subscriptions, domains)
- Os dois coexistem mas não se substituem

A relação é 1:1: `tenants.id` → `schools.tenant_id`

---

## Row Level Security (RLS)

Todas as tabelas operacionais têm RLS activado com policies baseadas em:

```sql
-- Função auxiliar (já existente no schema):
current_school_id()   -- devolve o school_id do utilizador autenticado
is_platform_admin()   -- verifica se o utilizador está em platform_admins
is_school_admin()     -- verifica cargo/role na escola actual
```

### Padrão de policy

```sql
-- SELECT: qualquer membro da escola
CREATE POLICY "school_members_select"
  ON public.<tabela> FOR SELECT
  USING (school_id = current_school_id());

-- INSERT/UPDATE/DELETE: apenas admins da escola
CREATE POLICY "school_admins_write"
  ON public.<tabela> FOR ALL
  USING (school_id = current_school_id() AND is_school_admin());

-- Platform admins: acesso total (para suporte/operações)
CREATE POLICY "platform_admin_all"
  ON public.<tabela> FOR ALL
  USING (is_platform_admin());
```

---

## Camadas de Validação

```
Request
  ↓
Middleware: validar hostname (anti host-header attack)
  ↓
TenantResolver: hostname → tenant
  ↓
Auth: Supabase Auth JWT
  ↓
Backend server function: verificar school_id do perfil
  ↓
Supabase Query: RLS filtra school_id automaticamente
  ↓
Response
```

**Nunca confiar somente no hostname para autorização.**

---

## Teste de Isolamento Obrigatório

```typescript
// tests/saas/tenant-isolation.test.ts
describe("Tenant Isolation", () => {
  it("User of school A cannot read school B data", async () => {
    // 1. Autenticar como user da escola A
    // 2. Tentar ler dados da escola B (school_id diferente)
    // 3. Esperar resultado vazio ou erro de autorização
  });

  it("Platform admin can read any school", async () => {
    // Platform admin deve conseguir ler qualquer escola
  });
});
```

---

## Protecção Contra Host Header Attack

Aceitar somente hostnames:

```typescript
const ALLOWED_HOSTNAME_PATTERNS = [
  /^(www\.)?{{DOMINIO_PRINCIPAL}}$/,
  /^[a-z0-9-]+\.{{DOMINIO_PRINCIPAL}}$/,
  // domínios personalizados verificados em tenant_domains
];

function validateHostname(hostname: string): boolean {
  // verificar contra lista de padrões permitidos
  // se domínio customizado: verificar em tenant_domains
}
```

---

## Cache de Tenants

Para evitar consultas excessivas ao banco:

```typescript
// TTL sugerido: 60 segundos em produção
// Invalidar cache quando slug/domínio muda
const tenantCache = new Map<string, { tenant: Tenant; expiresAt: number }>();

async function getCachedTenant(hostname: string): Promise<Tenant | null> {
  const cached = tenantCache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) return cached.tenant;
  const tenant = await fetchTenantByHostname(hostname);
  if (tenant) tenantCache.set(hostname, { tenant, expiresAt: Date.now() + 60_000 });
  return tenant;
}
```

---

## Contexto de Request (Edge/Server)

```typescript
interface TenantRequestContext {
  schoolId: string;
  tenantId: string;
  domain: string;
  tenantSlug: string;
  plan: Plan | null;
  subscriptionStatus: SubscriptionLifecycle;
}
```

---

## Estados do Ciclo de Assinatura

| Estado | Acesso ao SIGA | Portal activo | E-mail activo |
|---|---|---|---|
| `active` | ✅ Completo | ✅ | ✅ |
| `trialing` | ✅ Completo | ✅ | ✅ |
| `past_due` | ⚠️ Com aviso | ✅ | ✅ |
| `suspended` | ❌ Bloqueado | ⚠️ Página de suspensão | ✅ (sem perda) |
| `cancelled` | ❌ Bloqueado | ❌ | ❌ |

**Nunca apagar dados automaticamente** na suspensão ou cancelamento.

---

## Suspensão

Em suspensão, o portal apresenta:

```
Portal temporariamente indisponível.
Entre em contacto com a instituição.
```

Sem revelar detalhes financeiros ao visitante.
