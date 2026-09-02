# Estrutura do projecto

Organização do monorepo **SIGA Plus** (quatro apps + SQL partilhado).

---

## Árvore principal

```text
onsoft-replica-dev/
├── src/                      # SIGA — gestão escolar (TanStack Start :3006)
│   ├── routes/               # Rotas de ficheiro (/alunos, /pedagogica, …)
│   ├── features/             # Módulos (students, finance, academic, …)
│   ├── components/           # UI partilhada do SIGA
│   └── lib/                  # URLs do ecossistema, helpers
├── painel/
│   ├── web/                  # WEB comercial (Vite :5174)
│   ├── admin/                # ADMIN SaaS Control Center (Next.js :3005)
│   └── docs/                 # DOC — VitePress (:5173)
├── scripts/siga/             # Inventário modules.json, checks, scaffold
├── supabase/                 # SQL SGA (APPLY_*.sql — nunca migrações Lovable)
└── tests/                    # Vitest + Playwright E2E
```

Cada app mantém o seu frontend. Não unificar design systems.

---

## SIGA (`src/`)

| Pasta | Conteúdo |
| --- | --- |
| `routes/` | Páginas TanStack Router |
| `features/<módulo>/` | `schemas.ts`, `server.ts`, UI do módulo |
| `features/auth/` | `access-policy`, `portal-engine`, `navigation-catalog`, `route-inventory` |
| `components/layout/` | `AppShell`, `AppSidebar`, `PageHeader` |

Navegação: [mapa de módulos](/siga/navegacao). Inventário: `scripts/siga/modules.json`.

```sh
npm run siga:check      # inventário + testes de navegação
npm run siga:scaffold -- <id> [--with-page]
```

---

## ADMIN (`painel/admin`)

Next.js App Router — **Control Center SaaS**, não a operação escolar:

- `/tenants`, `/subscriptions`, `/domains`
- `/platform-admins`, `/audit`, `/settings/billing`

Manual: [Control Center](/admin/control-center).

---

## WEB (`painel/web`)

Vite + React — landing, `/pricing`, wizard `/start` (criar escola via API SaaS).

Manual: [Criar escola](/web/criar-escola).

---

## DOC (`painel/docs`)

VitePress. Manuais reais sob `/siga/`, `/admin/`, `/web/`, `/arquitetura/`, `/integracoes/`.  
Secções `/vite/`, `/nextjs/`, `/components/` ainda reflectem o template de UI — usar como referência de componentes, não como mapa do produto.

---

## SQL e ambiente

- Aplicar **só** `supabase/APPLY_IN_SQL_EDITOR.sql`, `APPLY_ENROLLMENT_AND_PREMIUM.sql`, `APPLY_SAAS_PLATFORM.sql`
- Node **24** (`nvm use 24`)
- `npm run siga:sync-env` propaga `.env` → `painel/web` e `painel/admin`
- `npm run dev:ecosystem` arranca as quatro apps

---

## Ligações

- [Funcionalidades & permissões](/guide/features)
- [Navegação SIGA](/siga/navegacao)
- [Arquitetura](/arquitetura/)
- [Segurança de rotas](/guide/route-security)
