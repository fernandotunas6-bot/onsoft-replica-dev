# SIGA Context Engine 2026 — especificação de implementação

Navegação contextual inteligente · Sidebar 360° · Workspace dinâmico.
Versão de 25/10/2026, sobre `main` em `a6d8f53` + PR #332 (com a #333 integrada no
`049642b`, a pedido do proprietário).

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

| Peça                                                                                          | Papel                                                                                                                                         | Origem                         |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `AppShell.tsx`                                                                                | Sidebar, header, main, RightRail; mobile com header e navegação inferior; partilha o contexto resolvido (`ActiveContextProvider`)             | existente + fase 3             |
| `AppSidebar.tsx`                                                                              | Sidebar 240/64 px; catálogo; escola activa; mostra o menu da entidade                                                                         | existente + fase 3             |
| `AcademicNavTree.tsx`                                                                         | Curso/classe → turma → disciplina (mudança explícita de turma)                                                                                | existente; consultas extraídas |
| `NavItem.tsx`                                                                                 | `NavLinkRow`, `NavSubheader`                                                                                                                  | reutilizado                    |
| `RightRail.tsx`                                                                               | Único painel contextual (Relacionado / Mensagens)                                                                                             | existente                      |
| `portal-engine.ts`, `navigation-catalog.ts`, `contextual-navigation.ts`                       | Catálogo autorizado e módulo activo (nível 1)                                                                                                 | existente                      |
| `access-policy.ts`                                                                            | `canAccessPath`, `canReadModule`, plano                                                                                                       | existente                      |
| `intelligence/context-resolver.ts`                                                            | `routeContextCandidates`, `resolveContext` (rota → foco → pais → memória → área), `contextKey`, `focusContextLookup`, `combineContextLookups` | PR #332                        |
| `intelligence/context-registry.ts`                                                            | `ContextNavEntry`, `getContextEntries`, `findActiveContextEntry`, `contextBreadcrumb`                                                         | PR #332                        |
| `intelligence/academic-context-entries.ts`                                                    | Entradas de turma e disciplina                                                                                                                | PR #332                        |
| `academic/use-academic-nav-tree.ts`                                                           | Turmas/disciplinas que o servidor devolve à conta; mesmas chaves de query da árvore                                                           | fase 3                         |
| `intelligence/academic-context-lookup.ts`                                                     | `ContextLookup` a partir dessa árvore; rótulos do servidor                                                                                    | fase 3                         |
| `layout/ContextEntityNav.tsx`                                                                 | `useEntityNavigation` + menu da entidade (turma, disciplina, aluno) na sidebar                                                                | fase 3 e 5                     |
| `intelligence/entity-navigation.ts`                                                           | Tipo `EntityNavigation` e ajudas partilhadas pela sidebar e pelo telemóvel                                                                    | fase 8                         |
| `mobile/MoreHub.tsx`, `mobile/MobileEntityNav.tsx`                                            | Hub «Mais» do telemóvel; mostra o menu da entidade aberta                                                                                     | existente + fase 8             |
| `students/student-sections.ts`                                                                | Secções da ficha do aluno (`?secao=`) e quem lê cada uma                                                                                      | fase 5                         |
| `intelligence/student-context-entries.ts`                                                     | Entradas do aluno: Ficha completa e as secções que a conta lê                                                                                 | fase 5                         |
| `intelligence/context-breadcrumb.ts`, `active-context.ts`, `layout/ActiveContextProvider.tsx` | Breadcrumb do contexto no `PageHeader`, a partir do mesmo contexto do menu                                                                    | fase 3                         |
| `intelligence/context-engine.ts`                                                              | `buildAppContext` descarta entidade declarada por outra escola                                                                                | este ramo                      |

## 2. Organização visual — opção A (decisão do proprietário, 25/10)

Esquema conceptual de referência: barra global, sidebar contextual («Disciplina ·
Matemática» com as suas funções) e conteúdo principal com breadcrumb «Pedagógica / Turma A /
Matemática». **Opção A aprovada:** sem coluna nova nem disposição em duas colunas.

| Região             | Implementação                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Barra global       | Sem coluna nova. Escola no cabeçalho da sidebar; «Todas as áreas» mantém o catálogo.                                                                                                                                                                                                                                                                                                                                                        |
| Sidebar contextual | Com turma/disciplina confirmada: «← Voltar a ‹módulo›», cabeçalho `Disciplina · Matemática` / `Turma A`, grupos do registo (Ensino, Avaliação, Acompanhamento), entrada actual com `aria-current="page"`. A árvore académica continua por baixo para mudar de turma. O catálogo do módulo volta com «Voltar» ou «Todas as áreas». Com um aluno aberto: «← Voltar» à lista de alunos, `Aluno · ‹nome›` e as secções da ficha que a conta lê. |
| Recolhida (64 px)  | Mesmas entradas só com ícone e nome acessível (`sr-only` + `title`).                                                                                                                                                                                                                                                                                                                                                                        |
| Telemóvel          | Sem sidebar. O hub «Mais» da barra inferior mostra o mesmo menu da entidade («Voltar», cabeçalho, grupos e entrada actual), com as linhas de 56 px do hub. «Todas as áreas» e a pesquisa continuam a levar a todo o lado.                                                                                                                                                                                                                   |
| Conteúdo principal | A página da função. O `PageHeader` acrescenta ao breadcrumb a turma e a disciplina da URL («Área Pedagógica / 10.ª A / Matemática»); cada passo leva à mesma página nesse nível, e um breadcrumb explícito da página manda. A ficha do aluno com `?secao=` mostra só essa secção, com «Ver ficha completa».                                                                                                                                 |
| Painel direito     | `RightRail` existente; nunca um segundo painel.                                                                                                                                                                                                                                                                                                                                                                                             |

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

## 4. Fases 3 e 5 — como funciona

1. `useEntityNavigation(pathname, search)` só actua para **Administrador, Secretaria e
   Professor** (as entradas são de gestão da turma; aluno e encarregado vêem o que é seu
   pelo portal, e as regras de rota deixam-nos abrir `/pedagogica` e `/planos-aula`).
2. Lê `routeContextCandidates`: `?turma=` em `/pedagogica`, `/planos-aula` e `/arquivos`;
   `?disciplina=` só nas duas primeiras (os ficheiros estão por turma). Sem turma na URL
   não pede nada.
3. `useAcademicNavTree` devolve as turmas e disciplinas da conta (professor: as suas
   atribuições; equipa: as da escola e ano). Mesmas chaves de query que a árvore
   académica: um só pedido. As chaves levam escola e papel e a troca de escola repõe-nas.
4. `academicContextLookup` confirma turma/disciplina e dá os rótulos.
5. `resolveContext` → `getContextEntries` (papel, permissões, plano) →
   `findActiveContextEntry`.
6. `AppSidebar` mostra `ContextEntityNav` e esconde o catálogo do módulo enquanto a
   entidade está aberta.
7. Aluno: em `/alunos/<id>` o aluno só entra no caminho depois de a ficha o ler do
   servidor na escola activa. A página declara o foco (`EntityFocus`) e
   `focusContextLookup` só o aceita se for o aluno da URL; outro aluno, outra escola ou a
   ficha ainda a carregar deixam a sidebar como estava. `combineContextLookups` junta este
   lookup ao académico.
8. As entradas do aluno (`student-context-entries.ts`) levam a `/alunos/<id>?secao=…`.
   `allow` tira as secções que a conta não lê; o Financeiro segue o servidor
   (`listInvoices`, `getStudentScholarship`): Administração, Secretaria e Tesouraria, salvo
   «Nenhum» no módulo, ou cargo elevável com permissão. O Histórico também segue o servidor
   (`getStudentAcademicHistory`): só Administração e Secretaria. Sem `?secao=`, a ficha
   completa.
9. `ActiveContextProvider`, na `AppShell`, resolve o contexto uma vez e partilha-o com o
   `PageHeader` (`useActiveContext`), que acrescenta os passos depois do título.

## 5. Inventário (Implementado · Parcial · Ausente · Bloqueado)

«Implementado» exige rota real com dados reais, não só um botão.

### 5.1 Disciplina e turma (prioridade 1)

| Função                                 | Destino                                             | Estado                                                                                                                            |
| -------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Menu da entidade na sidebar            | `ContextEntityNav`                                  | Implementado (fase 3)                                                                                                             |
| Avaliações e notas / pauta             | `/pedagogica?tab=notas&turma&disciplina&pauta=1`    | Implementado                                                                                                                      |
| Pauta da turma                         | `/pedagogica?tab=notas&turma&pauta=1`               | Implementado                                                                                                                      |
| Presenças                              | `/pedagogica?tab=presencas&turma[&disciplina]`      | Implementado — na turma, as aulas do dia dessa turma; na disciplina, abre a chamada dessa aula                                    |
| Planos de aula                         | `/planos-aula?turma&disciplina`                     | Implementado                                                                                                                      |
| Materiais e ficheiros                  | `/arquivos?turma`                                   | Implementado — turma e disciplina abrem a pasta da turma (`arquivos` com «Nenhum» tira-a)                                         |
| Chamada do professor                   | `/pedagogica?tab=presencas&turma&disciplina`        | Implementado — «Presenças» da disciplina abre a chamada; `/professor/presenca` fica fora                                          |
| Trabalhos                              | `/pedagogica/trabalhos?turma&disciplina`            | Implementado — lista da turma ou da disciplina (em curso e prazo terminado); criam-se no detalhe da aula; entregas na #335        |
| Horário da turma                       | `/pedagogica?tab=horarios&turma`                    | Implementado — turma e disciplina abrem o horário da turma (`ScheduleWorkspace`)                                                  |
| Alunos da turma                        | `/pedagogica/turmas/$classGroupId?secao=alunos`     | Implementado — a turma tem página própria (decisão do proprietário, 25/10/2026), com «Ficha da turma» e «Alunos da turma» no menu |
| Professor responsável                  | `/professores/$teacherId`                           | Implementado — na disciplina, quando o servidor devolve o professor dela (`class_subjects.teacher_id`)                            |
| Visão geral da disciplina, reclamações | —                                                   | Ausente; não se criam páginas para encher o menu                                                                                  |
| Breadcrumb contextual no `PageHeader`  | `context-breadcrumb.ts` via `ActiveContextProvider` | Implementado — `/pedagogica`, `/planos-aula`, `/pedagogica/trabalhos`, `/arquivos`                                                |

### 5.2 Aluno (prioridade 2)

| Função                           | Destino                                                                                             | Estado                                                                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Rota reconhecida pelo resolvedor | `/alunos/$studentId`                                                                                | Implementado (#332)                                                                                                                          |
| Lookup e entradas do aluno       | foco da ficha + `student-context-entries.ts`                                                        | Implementado (fase 5)                                                                                                                        |
| Menu do aluno na sidebar         | `ContextEntityNav`                                                                                  | Implementado (desktop; só a equipa)                                                                                                          |
| Ficha por secção                 | `/alunos/$studentId?secao=identificacao\|academico\|financeiro\|documentos\|historico`              | Implementado                                                                                                                                 |
| Histórico                        | `/alunos/$studentId?secao=historico`                                                                | Implementado — um bloco por ano lectivo, com média, situação e médias por disciplina (o motor da Pauta Final); só Administração e Secretaria |
| Turma do aluno                   | `/pedagogica/turmas/$classGroupId`, `/pedagogica/trabalhos?turma`, `/pedagogica?tab=horarios&turma` | Implementado — a turma da matrícula vem da ficha lida no servidor (relação do aluno); só Administração e Secretaria                          |
| Comunicação                      | —                                                                                                   | Ausente — a ficha não mostra esse conteúdo                                                                                                   |
| Faturas e documentos do aluno    | `/faturas`, `/documentos`                                                                           | Parcial — sem filtro por aluno na URL; na ficha, o Financeiro com todas as faturas (por pagar e pagas, dívida e vencido) e os Documentos     |
| Fatura (contexto financeiro)     | `/faturas/$invoiceId`                                                                               | Implementado — detalhes, aluno, pagamentos e recibos; menu da fatura para Administração e Tesouraria; receber e anular na lista              |
| Relações no painel direito       | `students/student-relation-map`                                                                     | Implementado                                                                                                                                 |
| Botões de gestão da ficha        | foto, turma, estado, anular, editar, encarregados, presença                                         | Implementado — só a quem grava em Pessoas (o guarda do servidor); o encarregado não os vê                                                    |

### 5.3 Restantes contextos

| Contexto                                            | Estado                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Professor                                           | Parcial — menu com «Perfil e turmas» (`/professores/$teacherId`) e «Horário semanal» (`/pedagogica?tab=horarios&professor`) e «Planos de aula» (`/planos-aula?professor`, as disciplinas que dá), «Trabalhos criados» (`/pedagogica/trabalhos?professor`, de todas as turmas dele) e «Presenças» (`/pedagogica?tab=presencas&professor`, as aulas do dia dele; o histórico continua o da escola), estes quatro só a quem grava no Pedagógico |
| Financeiro                                          | Parcial — seguir [FINANCE_MASTER_2026.md](finance/FINANCE_MASTER_2026.md)                                                                                                                                                                                                                                                                                                                                                                    |
| Documentos e Arquivos                               | Parcial                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Website escolar                                     | Bloqueado — PRs #205, #206, #275, #277                                                                                                                                                                                                                                                                                                                                                                                                       |
| RH                                                  | Parcial (só por cargo)                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Biblioteca, Transporte                              | Ausente — sem rotas no `main`                                                                                                                                                                                                                                                                                                                                                                                                                |
| Comunicações, Calendário, Relatórios, Configurações | Parcial — sem entidade                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Mobile (gaveta/navegação inferior)                  | Implementado no hub «Mais» (fase 8); falta validar em aparelhos                                                                                                                                                                                                                                                                                                                                                                              |

## 6. Comportamento de menus

- Clique em qualquer entrada; nada depende de hover.
- Recolhida: ícones com nome acessível; o popover da árvore académica mantém-se.
- Destino activo: `aria-current="page"`; «Voltar» nunca fica activo.
- Mobile: o hub «Mais» da barra inferior mostra o menu da entidade, com linhas de 56 px e
  «Voltar» de 44 px; escolher uma entrada fecha o hub (mudar de secção do aluno só muda a
  pesquisa da URL).

## 7. Memória, cache e desempenho

- Sem turma na URL nenhum pedido é feito; com turma, o pedido é o mesmo da árvore.
- Troca de escola: `resetQueries` em tudo excepto `["auth"]` (`use-current-account`).
- Memória de navegação (recentes e favoritos, `lib/navigation-memory.ts`): por utilizador e
  escola (`siga:nav-recent:<utilizador>:<escola>`), só caminho, parâmetros e rótulo do
  caminho. A memória antiga, só por utilizador, sai na primeira leitura: os recentes apagam-se
  e os favoritos sem id de entidade passam para a escola actual. Terminar sessão apaga os
  recentes do dispositivo; os favoritos ficam. Um destino que a conta deixou de poder abrir
  (`canAccessPath` com papel, permissões e plano) não se oferece, e abrir um destino passa
  sempre pela página, que valida no servidor.
- Memória de contexto (`resume-context.ts`, `useResumeNavigation`): na área académica sem
  turma aberta, a sidebar oferece «Continuar em ‹turma› · ‹disciplina›», o destino recente mais
  novo que abria uma turma ou disciplina. Dos recentes (por utilizador e escola) só saem os ids;
  o nome e a confirmação vêm da árvore académica do servidor, e uma turma que o servidor já não
  devolve não se oferece.

## 8. Segurança multi-tenant

- Turma/disciplina só entram no caminho se o servidor as devolveu à conta: o professor
  não abre o contexto de uma turma que não lecciona alterando a URL.
- Cada entrada passa por `canAccessPath` e `canReadModule`; o menu da entidade só para
  a equipa.
- Uma entidade declarada por outra escola é descartada.
- O aluno da URL só entra no caminho depois de a ficha o ler do servidor na escola activa.
- Recentes e favoritos são por escola: uma conta com duas escolas não vê na segunda os
  destinos (com ids de alunos ou turmas) da primeira.
- Nenhuma alteração a SQL, RLS ou permissões.

## 9. Estado das fases

| Fase                | Estado                                                       | Evidência                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Auditoria         | Parcial                                                      | Inventário §5; falta auditoria em sessão autenticada                                                                                                                                           |
| 2 Motor de contexto | Implementado                                                 | PR #332 (24 testes)                                                                                                                                                                            |
| 3 Sidebar           | **Implementado (desktop, turma/disciplina/aluno/professor)** | `ContextEntityNav`; 17 testes de sidebar + 7 de lookup + 15 do professor; breadcrumb com 9 testes                                                                                              |
| 4 Disciplina piloto | Parcial                                                      | Trabalhos da turma e da disciplina (`/pedagogica/trabalhos`); faltam as entregas (#335) e validação em staging                                                                                 |
| 5 Aluno piloto      | **Implementado (desktop)**                                   | Secções com URL própria (24 testes de regras e entradas, 13 de render); capturas a 1440/390 px com dados fictícios; falta sessão autenticada                                                   |
| 6–7 Restantes       | Ausente                                                      |                                                                                                                                                                                                |
| 8 Desktop/mobile    | Parcial                                                      | Sidebar (expandida e recolhida) e hub «Mais» testados em jsdom (8 testes do hub); capturas a 1440 e 390 px com dados fictícios; falta validar em aparelhos e nas larguras 767/768/1023/1024 px |
| 9 Optimização       | Parcial                                                      | Sem pedidos novos (mesma chave); medições por fazer                                                                                                                                            |
| 10 Revisão          | Parcial                                                      | Lint, TypeScript e suite completa passam (703 ficheiros); Playwright pendente                                                                                                                  |

## 10. Testes de aceitação

| Cenário                        | Coberto                                                                                                | Falta                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ | -------------------- |
| A Professor turma → disciplina | Menu só com a turma/disciplina activas; outra turma recusada                                           | Entregas (#335); E2E |
| B Aluno                        | Aluno não recebe o menu de gestão                                                                      | E2E                  |
| C Secretaria → aluno           | Menu com as secções que a conta lê; Financeiro segue o servidor; secção recusada abre a ficha completa | E2E                  |
| D Multi-escola                 | Entidade de outra escola descartada; queries repostas; recentes e favoritos por escola                 | E2E com duas escolas |
| E URL directa                  | Menu, secção e breadcrumb restaurados a partir da URL                                                  | E2E                  |
| F Segurança                    | IDs não-UUID ignorados; turma ou professor não devolvidos pelo servidor ignorados                      | Testes de servidor   |
| G Dispositivos                 | Recolhida; hub «Mais» no telemóvel                                                                     | Aparelhos reais      |
| H Regressão                    | Suite completa passa (703 ficheiros, 4909 testes)                                                      | Playwright           |

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
- A #333 entrou no ramo da #332 no `049642b`, a pedido do proprietário; daqui em diante há
  um só ramo. O menu do aluno e o breadcrumb seguiram por cima.
- #329 (Trabalhos) e #327 (disciplinas da turma) não tocam nestes ficheiros. A #335 (entregas)
  traz `/pedagogica/tarefas/$taskId`; a lista de trabalhos da #332 liga-se a ela quando entrar.

## 13. Limitações conhecidas

- No telemóvel, o menu da entidade só aparece ao abrir o hub «Mais»; falta validar em
  aparelhos.
- Presenças e Materiais estão cobertos em jsdom e em capturas com dados fictícios; falta
  confirmar numa sessão autenticada que a chamada e a pasta da turma abrem com dados reais.
- A memória de contexto não está ligada.
- Referências externas (Moodle, Canvas, Linear, Jira, Salesforce, Notion, VS Code, Odoo,
  ClickUp) inspiram os princípios; nada foi copiado.
