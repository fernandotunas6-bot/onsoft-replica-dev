# Integração Cloudflare — SIGA Plus

> A integração com Cloudflare é server-side apenas.
> **Nunca** expor API tokens no frontend (sem `VITE_CLOUDFLARE_*`).

---

## Responsabilidades do Cloudflare no SIGA

| Recurso | Propósito |
|---|---|
| DNS Wildcard | `*.{{DOMINIO_PRINCIPAL}}` → aplicação (sem DNS por escola) |
| SSL/TLS | Certificados automáticos para todos os subdomínios |
| Proxy | Protecção e performance |
| Email Routing | Encaminhamento institucional de e-mail |
| Workers (futuro) | Tenant resolution na borda |
| Rate Limiting | Protecção de login, API, slug check |
| Cache | Assets estáticos (onde aplicável) |

---

## Variáveis de Ambiente (servidor-only)

```env
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_ZONE_ID=
CLOUDFLARE_API_TOKEN=

PLATFORM_DOMAIN=
PLATFORM_BASE_URL=
PLATFORM_ADMIN_URL=
PLATFORM_API_URL=
```

> Guardar em secret storage do ambiente de deploy (não no `.env` de produção commited).

---

## Configuração DNS

### Wildcard (não requer acção por escola)

```
Type:  A  (ou CNAME para load balancer)
Name:  *
Value: IP_DA_APLICAÇÃO
Proxy: ✅ Cloudflare proxy activo
```

### Subdomínios fixos

```
Type:    CNAME
Name:    custom
Value:   <endereço da aplicação>
Proxied: ✅
```

Este é o destino dos CNAMEs dos domínios personalizados das escolas.

---

## Email Routing

Para o e-mail institucional básico:

```
Cloudflare Email Routing activo na zona
        ↓
Regra: esperanca@{{DOMINIO_PRINCIPAL}} → colegio@gmail.com
        ↓
Gerido via API ou painel Cloudflare
```

Registros MX necessários (Cloudflare cria automaticamente ao activar):
```
MX: route1.mx.cloudflare.net  (prioridade 25)
MX: route2.mx.cloudflare.net  (prioridade 93)
```

---

## Interface de Provider (abstracção)

```typescript
interface CloudflareDnsProvider extends DnsProvider {
  createEmailRoute(source: string, destination: string): Promise<{ routeId: string }>;
  deleteEmailRoute(routeId: string): Promise<void>;
  listEmailRoutes(): Promise<EmailRoute[]>;
  verifyCustomDomain(hostname: string): Promise<DomainVerifyResult>;
}
```

A abstracção permite substituição futura por outro provider sem alterar a aplicação.

---

## Domínios Personalizados

Instruções para o cliente configurar CNAME:

```
Tipo:    CNAME
Nome:    portal
Destino: custom.{{DOMINIO_PRINCIPAL}}
```

Ou, em alternativa, verificação por TXT:

```
Tipo:    TXT
Nome:    _siga-verify.{hostname}
Valor:   siga-verify={tenantId}
```

Verificação implementada em `src/features/saas/domain-verify.ts`.

---

## Rate Limiting

Configurar regras Cloudflare para:

| Endpoint | Limite sugerido |
|---|---|
| `/api/domains/check` | 20 req/min por IP |
| `/api/auth/login` | 10 req/min por IP |
| `/api/auth/reset` | 5 req/min por IP |
| `/api/saas/signup` | 3 req/min por IP |

---

## Edge Tenant Resolution (futuro)

```
Request → Cloudflare Worker
                ↓
        resolver hostname
                ↓
        lookup em KV Store (cache)
                ↓
        injectar header: X-Tenant-Id, X-Tenant-Slug
                ↓
        forward para aplicação
```

Benefício: tenant resolvido antes de chegar à aplicação, sem consulta ao banco.

---

## Segurança

- Cloudflare WAF activo na zona
- SSL mode: Full (strict) — certificados end-to-end
- HSTS activado
- Bot Fight Mode activado
- Nunca desactivar proxy para domínios de produção
