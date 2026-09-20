# Stack por aplicação (não «escolher template»)

O SIGA Plus **não** é um template Vite *ou* Next.js. São **cinco aplicações** com stacks distintas — não unificar frontends.

::: tip Arquitectura
Detalhe canónico: [Arquitetura do ecossistema](/arquitetura/) e [Responsabilidades](/arquitetura/responsabilidades).
:::

---

## Mapa de stacks

| App | Pasta | Stack | Porta |
| --- | --- | --- | --- |
| **SIGA** | raiz (`src/`) | TanStack Start + Router + React Query + Zod | 3006 |
| **WEB** | `painel/web` | Vite + React | 5174 |
| **ADMIN** | `painel/admin` | Next.js App Router | 3005 |
| **PAYFLOW** | `painel/payflow` | Vinext + Cloudflare Workers | 3007 |
| **DOC** | `painel/docs` | VitePress | 5173 |

| Camada | Tecnologia |
| --- | --- |
| UI escolar (SIGA) | React 19, Tailwind, componentes estilo shadcn |
| Dados | Supabase (SGA) — 1 BD, N tenants |
| Validação | Zod em `features/*/schemas.ts` |
| Escrita SGA | `createServerFn` + `loadSgaAdminClient` |
| Ícones | Lucide (`IconChip`, launcher premium) |
| Gráficos | Recharts (lazy) |
| Testes | Vitest + Playwright E2E |
| Node | **24** LTS |

---

## O que cada stack serve

- **SIGA (TanStack Start)** — operação escolar (alunos, pedagógica, tesouraria). Ver [Navegação](/siga/navegacao).
- **WEB (Vite)** — marketing e wizard `/start`. Manual: [Criar escola](/web/criar-escola).
- **ADMIN (Next.js)** — Control Center SaaS. Manual: [Control Center](/admin/control-center).
- **PAYFLOW (Vinext)** — cobrança escolar. Manual: [PayFlow](/financeiro/payflow).
- **DOC (VitePress)** — manuais; secções `/vite/` e `/nextjs/` são referência de **componentes UI do template**, não escolha de produto.

---

## Não fazer

- Não «migrar o SIGA para Next» nem unificar design systems.
- Não tratar `/components/` ou `/theme-customizer/` como mapa do produto escolar.
- Não aplicar migrações Lovable ao projecto SGA.

---

## Ligações

- [Instalação](/guide/installation)
- [Estrutura do projecto](/guide/project-structure)
- [Funcionalidades](/guide/features)
- [Pilha tecnológica (resumo)](/guide/tech-stack)
