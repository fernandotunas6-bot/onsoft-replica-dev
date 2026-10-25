# SIGA Context Engine 2026 — especificação de implementação

Navegação contextual inteligente · Sidebar 360° · Workspace dinâmico.
Versão de 25/10/2026, sobre `main` em `a6d8f53` + PR #332.

Este documento transforma o «Prompt Master — SIGA Plus Context Engine» numa
especificação ligada ao código que existe. Não substitui o contrato visual
([VISUAL_MASTER_2026.md](../design/VISUAL_MASTER_2026.md)) nem as regras de base de dados
([DATABASE_RULES.md](../agents/DATABASE_RULES.md)); aplica-os à navegação por contexto.

**Regra central.** Uma escola, um módulo, uma turma, uma disciplina, um aluno ou um
documento podem ser o contexto activo. A sidebar mostra a estrutura desse contexto. O
conteúdo principal mostra só a função seleccionada. O painel da direita mostra só
relações e acções desse contexto.

**Regra de segurança.** A sidebar não autoriza nada. Cada destino continua protegido
pela rota (`canAccessPath`) e pelo servidor (escola, papel, vínculo de turma/disciplina,
RLS). Um ID na URL nunca cria um destino no menu: só entidades que o servidor devolveu
à conta na escola activa.

---

## 1. Peças e responsáveis

Nada é substituído. Cada peça é estendida no seu lugar. Há **um só motor**: o da
PR #332 (`context-resolver.ts`, `context-registry.ts`, `academic-context-entries.ts`).

| Peça                                                                    | Papel                                                                                          | Origem                         |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------ |
| `AppShell.tsx`                                                          | Sidebar, header, main, RightRail; mobile com header e navegação inferior                       | existente                      |
| `AppSidebar.tsx`                                                        | Sidebar 240/64 px; catálogo; escola activa; mostra o menu da entidade                          | existente + fase 3             |
| `AcademicNavTree.tsx`                                                   | Curso/classe → turma → disciplina (mudança explícita de turma)                                 | existente; consultas extraídas |
| `NavItem.tsx`                                                           | `NavLinkRow`, `NavSubheader`                                                                   | reutilizado                    |
| `RightRail.tsx`                                                         | Único painel contextual (Relacionado / Mensagens)                                              | existente                      |
| `portal-engine.ts`, `navigation-catalog.ts`, `contextual-navigation.ts` | Catálogo autorizado e módulo activo (nível 1)                                                  | existente                      |
| `access-policy.ts`                                                      | `canAccessPath`, `canReadModule`, plano                                                        | existente                      |
| `intelligence/context-resolver.ts`                                      | `routeContextCandidates`, `resolveContext` (rota → foco → pais → memória → área), `contextKey` | PR #332                        |
| `intelligence/context-registry.ts`                                      | `ContextNavEntry`, `getContextEntries`, `findActiveContextEntry`, `contextBreadcrumb`          | PR #332                        |
| `intelligence/academic-context-entries.ts`                              | Entradas de turma e disciplina                                                                 | PR #332                        |
| `academic/use-academic-nav-tree.ts`                                     | Turmas/disciplinas que o servidor devolve à conta; mesmas chaves de query da árvore            | fase 3                         |
| `intelligence/academic-context-lookup.ts`                               | `ContextLookup` a partir dessa árvore; rótulos do servidor                                     | fase 3                         |
| `layout/ContextEntityNav.tsx`                                           | `useEntityNavigation` + menu da entidade na sidebar                                            | fase 3                         |
| `intelligence/context-engine.ts`                                        | `buildAppContext` descarta entidade declarada por outra escola                                 | este ramo                      |

## 2. Organização visual — opção A (decisão do proprietário, 25/10)

Esquema conceptual de referência: barra global, sidebar contextual («Disciplina ·
Matemática» com as suas funções) e conteúdo principal com breadcrumb «Pedagógica / Turma A /
Matemática». **Opção A aprovada:** sem coluna nova nem disposição em duas colunas.

| Região             | Implementação                                                                                                                                                                                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Barra global       | Sem coluna nova. Escola no cabeçalho da sidebar; «Todas as áreas» mantém o catálogo.                                                                                                                                                                                                                                              |
| Sidebar contextual | Com turma/disciplina confirmada: «← Voltar a ‹módulo›», cabeçalho `Disciplina · Matemática` / `Turma A`, grupos do registo (Ensino, Avaliação, Acompanhamento), entrada actual com `aria-current="page"`. A árvore académica continua por baixo para mudar de turma. O catálogo do módulo volta com «Voltar» ou «Todas as áreas». |
| Recolhida (64 px)  | Mesmas entradas só com ícone e nome acessível (`sr-only` + `title`).                                                                                                                                                                                                                                                              |
| Conteúdo principal | A página da função (sem alteração nesta fase).                                                                                                                                                                                                                                                                                    |
| Painel direito     | `RightRail` existente; nunca um segundo painel.                                                                                                                                                                                                                                                                                   |

Acabamento só com `NavItem` e tokens `--sidebar-*`; nenhum estilo novo.

## 3. Contrato (PR #332)

```ts
type EntityType = "student" | "teacher" | "class" | "subject-offering" | …;
interface ContextFrame { type: EntityType; id: string; label: string } // label do servidor
interface ResolvedContext extends AppContext {
  schoolId: string; academicYearId: string | null;
  trail: ContextFrame[];      // geral → específico
  activeView: string | null;  // id da entrada activa
  key: string;                // escola|papel|ano|caminho
}
type ContextLookup = (c: { type; id }) => (ContextFrame & { schoolId; parent? }) | null;
```

Ordem de resolução: rota tipada → entidade declarada (mesma escola) → recurso superior →
memória revalidada → área geral. Um ID recusado deixa o contexto no nível acima.
`subject-offering` tem id `<turma>:<disciplina>`; uma disciplina que não pertence à turma
da URL é recusada.

## 4. Fase 3 — como funciona

1. `useEntityNavigation(pathname, search)` só actua para **Administrador, Secretaria e
   Professor** (as entradas são de gestão da turma; aluno e encarregado vêem o que é seu
   pelo portal, e as regras de rota deixam-nos abrir `/pedagogica` e `/planos-aula`).
2. Lê `routeContextCandidates`. Sem turma na URL não pede nada.
3. `useAcademicNavTree` devolve as turmas e disciplinas da conta (professor: as suas
   atribuições; equipa: as da escola e ano). Mesmas chaves de query que a árvore
   académica: um só pedido. As chaves levam escola e papel e a troca de escola repõe-nas.
4. `academicContextLookup` confirma turma/disciplina e dá os rótulos.
5. `resolveContext` → `getContextEntries` (papel, permissões, plano) →
   `findActiveContextEntry`.
6. `AppSidebar` mostra `ContextEntityNav` e esconde o catálogo do módulo enquanto a
   entidade está aberta.

## 5. Inventário (Implementado · Parcial · Ausente · Bloqueado)

«Implementado» exige rota real com dados reais, não só um botão.

### 5.1 Disciplina e turma (prioridade 1)

| Função                                 | Destino                                          | Estado                                                                                        |
| -------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Menu da entidade na sidebar            | `ContextEntityNav`                               | Implementado (fase 3)                                                                         |
| Avaliações e notas / pauta             | `/pedagogica?tab=notas&turma&disciplina&pauta=1` | Implementado                                                                                  |
| Pauta da turma                         | `/pedagogica?tab=notas&turma&pauta=1`            | Implementado                                                                                  |
| Presenças                              | `/pedagogica?tab=presencas&turma&disciplina`     | Parcial — confirmar em sessão que o separador filtra pela turma                               |
| Planos de aula                         | `/planos-aula?turma&disciplina`                  | Implementado                                                                                  |
| Materiais e ficheiros                  | `/arquivos?turma`                                | Parcial — `/arquivos` não está em `routeContextCandidates`; abrir perderia o contexto         |
| Chamada do professor                   | `/professor/presenca?turma&disciplina`           | Parcial — mesma razão                                                                         |
| Trabalhos, entregas, correcção         | —                                                | Parcial — `siga_class_tasks` e `siga_class_task_submissions` (#331) sem ecrã; SPEC na PR #329 |
| Alunos da turma, horário da turma      | `/pedagogica?tab=turmas` / `horarios`            | Parcial — filtro por `turma` por confirmar                                                    |
| Visão geral da disciplina, reclamações | —                                                | Ausente; não se criam páginas para encher o menu                                              |
| Breadcrumb contextual no `PageHeader`  | `contextBreadcrumb`                              | Ausente                                                                                       |

### 5.2 Aluno (prioridade 2)

| Função                           | Destino                         | Estado                                |
| -------------------------------- | ------------------------------- | ------------------------------------- |
| Rota reconhecida pelo resolvedor | `/alunos/$studentId`            | Implementado (#332)                   |
| Lookup e entradas do aluno       | —                               | Ausente                               |
| Ficha, académico, financeiro     | `/alunos/$studentId` (secções)  | Parcial — sem URL por secção          |
| Faturas e documentos do aluno    | `/faturas`, `/documentos`       | Parcial — sem filtro por aluno na URL |
| Relações no painel direito       | `students/student-relation-map` | Implementado                          |

### 5.3 Restantes contextos

| Contexto                                            | Estado                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------- |
| Professor                                           | Parcial (perfil e relações; sem entradas)                                 |
| Financeiro                                          | Parcial — seguir [FINANCE_MASTER_2026.md](finance/FINANCE_MASTER_2026.md) |
| Documentos e Arquivos                               | Parcial                                                                   |
| Website escolar                                     | Bloqueado — PRs #205, #206, #275, #277                                    |
| RH                                                  | Parcial (só por cargo)                                                    |
| Biblioteca, Transporte                              | Ausente — sem rotas no `main`                                             |
| Comunicações, Calendário, Relatórios, Configurações | Parcial — sem entidade                                                    |
| Mobile (gaveta/navegação inferior)                  | Ausente — o menu da entidade é só da `AppSidebar` (desktop); fase 8       |

## 6. Comportamento de menus

- Clique em qualquer entrada; nada depende de hover.
- Recolhida: ícones com nome acessível; o popover da árvore académica mantém-se.
- Destino activo: `aria-current="page"`; «Voltar» nunca fica activo.
- Mobile: gaveta e navegação inferior existentes, com alvos ≥44 px (fase 8).

## 7. Memória, cache e desempenho

- Sem turma na URL nenhum pedido é feito; com turma, o pedido é o mesmo da árvore.
- Troca de escola: `resetQueries` em tudo excepto `["auth"]` (`use-current-account`).
- Memória de contexto: por utilizador e escola, só ids de entrada, revalidada pelo lookup
  (`resolveContext` já aceita `memory`). Ainda não ligada.

## 8. Segurança multi-tenant

- Turma/disciplina só entram no caminho se o servidor as devolveu à conta: o professor
  não abre o contexto de uma turma que não lecciona alterando a URL.
- Cada entrada passa por `canAccessPath` e `canReadModule`; o menu da entidade só para
  a equipa.
- Uma entidade declarada por outra escola é descartada.
- Nenhuma alteração a SQL, RLS ou permissões.

## 9. Estado das fases

| Fase                | Estado                                       | Evidência                                                                    |
| ------------------- | -------------------------------------------- | ---------------------------------------------------------------------------- |
| 1 Auditoria         | Parcial                                      | Inventário §5; falta auditoria em sessão autenticada                         |
| 2 Motor de contexto | Implementado                                 | PR #332 (24 testes)                                                          |
| 3 Sidebar           | **Implementado (desktop, turma/disciplina)** | `ContextEntityNav`; 6 testes de sidebar + 7 de lookup                        |
| 4 Disciplina piloto | Parcial                                      | Falta Trabalhos (#329) e validação em staging                                |
| 5 Aluno piloto      | Ausente                                      | Proposto ao agente da #332                                                   |
| 6–7 Restantes       | Ausente                                      |                                                                              |
| 8 Desktop/mobile    | Parcial                                      | Desktop expandido e recolhido testados em jsdom; capturas e mobile por fazer |
| 9 Optimização       | Parcial                                      | Sem pedidos novos (mesma chave); medições por fazer                          |
| 10 Revisão          | Parcial                                      | Lint, TypeScript e testes passam; Playwright pendente                        |

## 10. Testes de aceitação

| Cenário                        | Coberto                                                            | Falta                       |
| ------------------------------ | ------------------------------------------------------------------ | --------------------------- |
| A Professor turma → disciplina | Menu só com a turma/disciplina activas; outra turma recusada       | Trabalhos; E2E              |
| B Aluno                        | Aluno não recebe o menu de gestão                                  | E2E                         |
| C Secretaria → aluno           | —                                                                  | Fase 5                      |
| D Multi-escola                 | Entidade de outra escola descartada; queries repostas              | E2E com duas escolas        |
| E URL directa                  | Menu restaurado a partir da URL                                    | Breadcrumb                  |
| F Segurança                    | IDs não-UUID ignorados; turma não devolvida pelo servidor ignorada | Testes de servidor          |
| G Dispositivos                 | Recolhida                                                          | Fase 8                      |
| H Regressão                    | Suites de navegação, inteligência, académico e sidebar passam      | Suite completa e Playwright |

## 11. Como estender

Um módulo declara `ContextNavEntry[]` (como `academic-context-entries.ts`) e, se a
entidade for nova, um `ContextLookup` a partir de dados já validados no servidor. Antes de
registar uma entrada: a rota aceita os parâmetros no `validateSearch`, a página filtra por
eles, o servidor valida escola e vínculo, e a rota está em `routeContextCandidates` (senão
abrir a entrada perde o contexto).

## 12. Coordenação entre agentes (25/10)

- PR #332 (sessão de projecto): motor. Proposta de divisão deixada
  [na própria PR](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/332#issuecomment-6402255146):
  este ramo faz a fase 3 (opção A); a #332 segue com o contexto do aluno e o breadcrumb.
- Ficheiros deste ramo: `AppSidebar.tsx`, `AcademicNavTree.tsx`, `ContextEntityNav.tsx`,
  `use-academic-nav-tree.ts`, `academic-context-lookup.ts`.
- #329 (Trabalhos) e #327 (disciplinas da turma) não tocam nestes ficheiros.

## 13. Limitações conhecidas

- Mobile ainda sem menu da entidade.
- Presenças, Materiais e Chamada precisam de confirmação ou de entrar no resolvedor.
- A memória de contexto e o breadcrumb não estão ligados.
- Referências externas (Moodle, Canvas, Linear, Jira, Salesforce, Notion, VS Code, Odoo,
  ClickUp) inspiram os princípios; nada foi copiado.
