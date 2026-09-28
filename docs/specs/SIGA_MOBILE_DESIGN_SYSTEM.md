# SIGA Mobile Design System — auditoria e plano de execução

Data: 2026-09-28 · Âmbito: camada de experiência (tokens, primitives, shell, navegação, ecrãs).
A lógica de negócio, permissões, rotas e regras académicas/financeiras **não** se alteram.

## 1. Retrato do que existe hoje

| Área | Estado |
| --- | --- |
| Tokens | Existem: Tailwind v4 CSS-first em `src/styles.css`, cores oklch, radius, densidade (`data-density`), safe-areas. **Faltam** tokens de mobile (altura de controlo, padding de ecrã, altura da barra inferior, escala de z-index). |
| Tipografia | Uma família (Inter), pesos limitados a 600, mínimos em px por degrau. Coerente. |
| Shell | `AppShell` é desktop-first: sidebar fixa ≥lg, `Sheet` lateral no telemóvel, header com 10+ controlos, footer sempre visível. **Não existe barra inferior nem hub "Mais".** |
| Navegação | Catálogo por papel em `portal-engine.ts` (admin/professor/aluno/encarregado) já filtrado por RBAC e plano. Serve de fonte para a barra inferior. |
| Tabelas | 49 ficheiros com `<Table>`, 41 com `overflow-x-auto`, apenas 7 com variantes `*:hidden`. **Este é o maior défice mobile: a tabela desktop é a única vista.** |
| Primitives | shadcn completo (56 componentes). `StatCard`, `StatusBadge`, `EmptyState`, `DataTableShell` já existem — mas `DataTableShell` só tem 1 consumidor e o `StatusBadge` usa cores cruas (emerald/amber/rose/sky) em vez de tokens. |
| Dinheiro | `kwanza()` em `src/lib/currency.ts`. Sem componente, sem `tabular-nums` garantido. |
| Dashboard | Já é por papel (`AdminPortalDashboard`, `TeacherPortalDashboard`, `StudentPortalDashboard`, `GuardianPortalDashboard`). Falta a ordem mobile (alerta → KPI → acções → agenda). |
| Offline/PWA | `src/lib/pwa.ts` existe; faltava banner de estado de ligação. |
| Filtros | Toolbars densas dentro dos cartões, sem folha inferior nem chips removíveis. |

## 2. Défices por prioridade

1. **Tabelas** — linha de tabela é ilegível a 360px; nenhum ecrã converte linha em entidade.
2. **Navegação** — no telemóvel a única via é o hambúrguer + árvore de sidebar desktop.
3. **Densidade de header** — 10 controlos no topo a 360px; nada é priorizado.
4. **Filtros** — botões e chips embutidos, sem folha; ocupam meio ecrã.
5. **Estado** — `StatusBadge` fora do sistema de cor; estados novos criados à mão nos ecrãs.
6. **Feedback** — spinners genéricos em vez de skeletons por forma de conteúdo.

## 3. Ordem de execução (o que foi feito nesta passagem)

1. Tokens mobile + correcção do `StatusBadge` para tokens semânticos.
2. `MoneyValue`, `useBreakpoint`, registo de estados.
3. Primitives mobile: `BottomSheet`, `ActionSheet`, `FilterSheet`, `FilterChips`, `MobileSearch`,
   `EntityList`/`EntityRow`, `MetricGrid`, `QuickActions`, `MobileTabs`, `SaveBar`, skeletons.
4. Shell mobile: `MobileHeader`, `BottomNavigation`, `MoreHub`, `OfflineBanner` — integrados no
   `AppShell` sem tocar no desktop.
5. `ResponsiveEntityView` e migração dos ecrãs de lista (alunos, pessoas, faturas, financeiro).

## 4. Regra de ouro operacional

Não esconder funcionalidade no telemóvel — mudar a forma de a usar:
pauta → fluxo de lançamento aluno-a-aluno; horário → agenda vertical; tabela → lista de entidades;
filtros → folha inferior; CRUD → página de entidade com acções contextuais.
