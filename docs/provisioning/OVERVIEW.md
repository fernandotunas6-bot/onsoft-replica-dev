# Provisionamento de Escola — SIGA Plus

> Referência para o fluxo completo de criação e activação de uma escola no SIGA Plus.
> Ficheiro principal: `src/features/saas/provisioning-core.ts`

---

## Fluxo Completo de Provisionamento

```
Pagamento confirmado
        ↓
provisionTenantCore(data, opts)
        ↓
┌─────────────────────────────────────────────────┐
│ 1.  CREATE tenants (slug, plano, trial_ends_at) │
│ 2.  CREATE subscriptions (se plano activo)      │
│ 3.  INSERT tenant_domains (slug.PLATFORM_DOMAIN)│
│ 4.  CREATE schools (1:1 com tenant)             │
│ 5.  inviteUserByEmail (admin_email)             │
│ 6.  UPSERT profiles (admin)                     │
│ 7.  INSERT school_memberships                   │
│ 8.  INSERT member_roles (owner)                 │
│ 9.  syncTenantUsageForSchool                    │
│ 10. bootstrapSchoolDefaults                     │
│ 11. INSERT saas_audit_logs (TENANT_PROVISIONED) │
└─────────────────────────────────────────────────┘
        ↓
Portal activo: {slug}.{{DOMINIO_PRINCIPAL}}
```

---

## Rollback

Qualquer falha após criar o utilizador Auth executa cleanup:

```typescript
// Em caso de erro nos passos 6-8:
await db.auth.admin.deleteUser(adminUserId);
await db.from("schools").delete().eq("id", schoolId);
await db.from("tenants").delete().eq("id", tenantId);
// tenant_domains apagado por CASCADE
// subscriptions apagadas por CASCADE
```

**Nunca deixar tenant incompleto.**

---

## Idempotência

O provisionamento deve ser seguro para re-executar:

```typescript
// Usar INSERT ... ON CONFLICT DO NOTHING onde aplicável
// Verificar existência antes de criar
// Jobs de reprocessamento devem verificar estado actual
```

---

## Estados de Provisionamento (`tenant_provisioning`)

| Estado | Significado |
|---|---|
| `pending` | Aguarda início |
| `processing` | Em execução |
| `active` | Concluído com sucesso |
| `failed` | Falhou — ver `error_message` |
| `suspended` | Suspenso por cancelamento |
| `cancelled` | Cancelado definitivamente |

---

## Entrypoints

| Função | Quem chama | Auth |
|---|---|---|
| `provisionSchoolTenant` | Admin SaaS | `requirePlatformAdmin()` |
| `signupSchoolPublic` | Landing WEB `/start` | Público (sem sessão) |

Ambos chamam `provisionTenantCore()` internamente.

---

## Jobs Assíncronos

Para operações demoradas ou dependentes de serviços externos:

```typescript
// Jobs a implementar:
provisionTenant        // criação de escola (já existe, síncrono)
verifyCustomDomain     // verificação DNS de domínio personalizado
syncSubscription       // sincronização de estado da subscrição
configureEmailRoute    // configuração de encaminhamento de e-mail
checkSSL               // verificação de certificado SSL
deprovisionPremiumFeatures // desactivar ADD-ONs após cancelamento
```

---

## Onboarding Comercial (WEB)

```
Landing Page
      ↓
Escolher plano
      ↓
Criar conta
      ↓
Dados da instituição
      ↓
Escolher portal (slug)  ← verificar disponibilidade aqui
      ↓
Escolher pacote Digital Identity (opcional)
      ↓
Pagamento
      ↓
provisionTenantCore()
      ↓
Portal activo: esperanca.{{DOMINIO_PRINCIPAL}}
      ↓
E-mail de boas-vindas ao admin
```

---

## Reserva de Slug Durante Checkout

Para evitar que dois utilizadores reservem o mesmo slug:

```typescript
// Durante o checkout (TTL: 30 minutos):
INSERT INTO slug_reservations (slug, session_id, user_id, expires_at)
VALUES ($slug, $sessionId, $userId, NOW() + INTERVAL '30 minutes')
ON CONFLICT DO NOTHING;

// Verificação de disponibilidade:
// 1. Não está em tenants.slug
// 2. Não está em reserved_subdomains
// 3. Não está em slug_reservations com expires_at > NOW()
```

---

## Verificação de Disponibilidade de Slug

```
GET /api/domains/check?slug=esperanca

Response:
{
  "slug": "esperanca",
  "available": true,          // ou false
  "reason": null              // ou "reserved" | "taken" | "invalid"
}
```

**Rate limiting:** máximo 20 req/min por IP.
**Validação sempre no backend** — nunca confiar só no frontend.

---

## Critérios de Aceitação

- [ ] `esperanca.{{DOMINIO_PRINCIPAL}}` abre automaticamente a escola correcta
- [ ] Escola A não consegue aceder a dados da Escola B
- [ ] Novas escolas não exigem DNS manual
- [ ] Slugs não têm duplicados
- [ ] `admin`, `api`, etc. não podem ser usados como slug
- [ ] Portais funcionam por HTTPS
- [ ] Recursos respeitam plano contratado
- [ ] Alterações críticas são registadas em `saas_audit_logs`
- [ ] Todos os testes essenciais passam

---

## Webhooks

Eventos a emitir:

```
subscription.created
subscription.activated
subscription.updated
subscription.cancelled
subscription.expired
payment.confirmed
domain.verified
domain.failed
tenant.provisioned
tenant.suspended
```

---

## Feature Flags

Novos recursos podem iniciar desactivados:

```
digital_identity     → false por defeito
custom_domains       → false por defeito
professional_email   → false por defeito
```

Activar gradualmente por tenant ou plano.
