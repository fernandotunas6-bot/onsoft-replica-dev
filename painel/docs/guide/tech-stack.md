# Pilha tecnológica

Resumo das tecnologias por camada do ecossistema **SIGA Plus**.

::: tip Por aplicação
Não escolher entre Vite e Next como «versão do produto» — ver [Stack por aplicação](/guide/choosing-framework).
:::

---

## SIGA (gestão escolar)

| Área | Tecnologia |
| --- | --- |
| Runtime | TanStack Start, React 19, TypeScript |
| Rotas | TanStack Router (`src/routes/`) |
| Dados | React Query + `createServerFn` |
| Validação | Zod (`features/*/schemas.ts`) |
| BD | Supabase SGA (PostgreSQL + RLS) |
| UI | Tailwind CSS, Radix/shadcn-style, Lucide |
| Listas | `usePersistedListFilters` + `ListFilterBar` |
| Gráficos | Recharts (carregamento diferido) |
| Auth | Supabase Auth + MFA TOTP + grants por módulo |

Navegação: `navigation-catalog.ts` + `portal-engine.ts`. Inventário: `scripts/siga/modules.json`.

---

## WEB / ADMIN / DOC

| App | Stack |
| --- | --- |
| WEB | Vite, React, tipografia/comercial próprios |
| ADMIN | Next.js 15 App Router, layout do template admin |
| DOC | VitePress + Vue (tema preservado) |

URLs partilhadas: `ecosystem-urls.ts` / `VITE_*` / `NEXT_PUBLIC_*`.

---

## Ferramentas

```bash
npm run siga:check          # inventário + navegação
npm run siga:sql            # SQL canónico SGA
npm run siga:scaffold -- <id>
npm run dev:ecosystem       # 5 apps
npm test                    # Vitest (Node 24)
```

CI: lint + test + `check-modules.mjs` + build (ver `.github/workflows/ci.yml`).

---

## Ligações

- [Instalação](/guide/installation)
- [Estrutura](/guide/project-structure)
- [Arquitetura](/arquitetura/)
- [Integrações](/integracoes/)
