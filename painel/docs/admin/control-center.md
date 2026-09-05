# SaaS Control Center (ADMIN)

O **ADMIN** (`painel/admin`, porta **3005**) é a consola da plataforma SIGA Plus.
Gerencia tenants, subscrições, domínios, operadores e auditoria — **não** gere
alunos, pautas nem propinas escolares.

## Quem entra

Contas em `platform_admins` (Supabase Auth). O **administrador escolar**
(Diretor, Secretário no SIGA) **não** tem acesso.

Login: [Control Center SaaS](https://siga-admin.pages.dev/sign-in) → redirecciona para
`/tenants` após autenticação (ou `http://localhost:3005/sign-in` em dev local).

## Rotas principais

| Rota | Função |
| --- | --- |
| `/tenants` | Escolas clientes, estado, métricas, sync utilização, «Gerir» plano/trial |
| `/subscriptions` | Histórico `subscriptions` (plano, período, MRR) |
| `/domains` | Subdomínios `*.portal-siga.com` + domínios custom |
| `/platform-admins` | Conceder/revogar operadores da plataforma |
| `/audit` | Últimos eventos `saas_audit_logs` |
| `/dashboard-2` | Operações gateway + health público do PayFlow |
| `/settings/billing` | Catálogo de planos SaaS (API) |

Nova escola: abrir o [portal WEB `/start`](https://siga-web.pages.dev/start) — o
wizard chama `POST /api/saas/signup` no SIGA.

## APIs consumidas (SIGA :3006)

Todas exigem `Authorization: Bearer <token>` e registo em `platform_admins`:

```text
GET  /api/saas/stats
GET  /api/saas/tenants
POST /api/saas/tenants/status
POST /api/saas/tenants/subscription
POST /api/saas/usage/sync
GET  /api/saas/subscriptions
POST /api/saas/subscriptions/backfill
GET  /api/saas/domains
POST /api/saas/domains
POST /api/saas/domains/status
POST /api/saas/domains/verify
GET  /api/saas/platform-admins
POST /api/saas/platform-admins
POST /api/saas/platform-admins/revoke
GET  /api/saas/audit-logs
GET  /api/saas/me
```

Públicas (sem Bearer): `GET /api/saas/plans`, `POST /api/saas/signup`,
`GET /api/saas/tenants/lookup?slug=...`.

## Domínios custom

Verificação DNS automática em `/domains` (**Verificar DNS**) ou activação
manual. Detalhes: [Domínios (ADMIN)](/admin/domains).

## Subscrições em falta

Escolas provisionadas antes da tabela `subscriptions` não têm linha até:

1. **«Gerir»** plano/trial em `/tenants`, ou
2. **«Sincronizar em falta»** em `/subscriptions` (`POST .../backfill`).

## Ponte no SIGA

`/saas-admin` no produto escolar é apenas uma **ponte** com links para o ADMIN
e o WEB. A UI operacional vive no ADMIN, não no SIGA.

## Leitura relacionada

- [Arquitetura do ecossistema](/arquitetura/)
- [Fluxos e provisionamento](/arquitetura/fluxos)
- [Domínios](/admin/domains)
- [Responsabilidades](/arquitetura/responsabilidades)

Desenvolvimento local: `npm run dev:ecosystem` na raiz do repositório.
