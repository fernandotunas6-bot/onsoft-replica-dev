---
name: siga-admin
description: >-
  Extends the SIGA Plus SaaS Control Center (painel/admin): tenants,
  subscriptions, billing, domains, usage and platform admins. Use when
  editing painel/admin or moving SaaS UI off /saas-admin.
---

# ADMIN — SaaS Control Center

Arquitectura: [ARCHITECTURE_HARMONIZATION.md](../../../docs/agents/ARCHITECTURE_HARMONIZATION.md).
Backend ainda no SIGA: skill `siga-saas`. Limites: `siga-ecosystem`.

- Pasta: `painel/admin`
- Stack: Next.js 16 App Router + Tailwind 4 + shadcn; `@supabase/ssr` instalado
- Dev: `npm run dev` → `:3005`
- Home: redirect `/` → `/tenants`

## Responsabilidade

Verdade SaaS: Tenant, School, Subscription, Plan, Domain, Usage, Billing,
Provisioning, Status. Métricas, trials, suspensões, auditoria da plataforma.

Portão: `platform_admins` / `requirePlatformAdmin()`. Cargo escolar
`Administrador` **não** entra aqui.

## Não fazer aqui

Alunos, pautas, propinas, documentos escolares. Landing/pricing comerciais
(isso é WEB). Não importar UI do SIGA. Não redesenhar o template só para
«ficar igual» ao SIGA.

## Estado (auditoria)

UI SaaS viva: `/dashboard`, `/dashboard-2`, `/tasks`, `/calendar`, `/mail`,
`/chat`, `/pricing`, `/faqs`, `/tenants`, `/subscriptions`, `/platform-admins`,
`/audit`, `/domains`, `/gateway-webhooks`, `/settings/billing`. Consome APIs
SaaS com Bearer + `platform_admins`. Nova escola → WEB `/start`.
SIGA `/saas-admin` é ponte para aqui.
