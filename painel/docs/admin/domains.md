# Domínios (ADMIN)

Gestão de hostnames por escola: subdomínios `*.portal-siga.com` e domínios
customizados (`tenant_domains`).

## Tipos

| Tipo | Origem | Estado inicial |
| --- | --- | --- |
| `siga_subdomain` | Provisionamento (`{slug}.portal-siga.com`) | `active` |
| `custom_domain` | Registo manual em `/domains` | `pending` |

## Registar domínio custom

1. ADMIN → **Domínios** → escolher escola + hostname (ex. `portal.colegio.ao`)
2. Configurar DNS na infraestrutura do cliente:
   - **CNAME** `portal.colegio.ao` → `{slug}.portal-siga.com`, ou
   - **TXT** `_siga-verify.portal.colegio.ao` = `siga-verify={tenant_id}`
3. ADMIN → **Verificar DNS** (valida e activa se correcto)
4. Alternativa: **Activar manual** (operador confirma fora do sistema)

## Resolução no SIGA

O produto escolar resolve o tenant por:

- Subdomínio `*.portal-siga.com` → slug
- Domínio custom activo → lookup em `tenant_domains.hostname`

API pública de verificação: `GET /api/saas/tenants/lookup?slug=...`

## APIs (operador autenticado)

```text
GET  /api/saas/domains
POST /api/saas/domains
POST /api/saas/domains/status
POST /api/saas/domains/verify
```

## Leitura relacionada

- [Control Center](/admin/control-center)
- [Fluxos — domínios](/arquitetura/fluxos#domínios-customizados)
