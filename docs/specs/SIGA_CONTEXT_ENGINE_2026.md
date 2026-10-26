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
2. Lê `routeContextCandidates`: `?turma=` em `/pedagogica`, `/planos-aula`,
   `/pedagogica/trabalhos`, `/arquivos`, `/relatorios/academicos` e `/pedagogica/risco`;
   `?disciplina=` só nas três primeiras (os ficheiros, os relatórios e os alertas estão por
   turma). Sem turma na URL
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

| Função                                 | Destino                                             | Estado                                                                                                                             |
| -------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Menu da entidade na sidebar            | `ContextEntityNav`                                  | Implementado (fase 3)                                                                                                              |
| Avaliações e notas / pauta             | `/pedagogica?tab=notas&turma&disciplina&pauta=1`    | Implementado                                                                                                                       |
| Pauta da turma                         | `/pedagogica?tab=notas&turma&pauta=1`               | Implementado                                                                                                                       |
| Presenças                              | `/pedagogica?tab=presencas&turma[&disciplina]`      | Implementado — na turma, as aulas do dia dessa turma; na disciplina, abre a chamada dessa aula                                     |
| Planos de aula                         | `/planos-aula?turma&disciplina`                     | Implementado                                                                                                                       |
| Materiais e ficheiros                  | `/arquivos?turma`                                   | Implementado — turma e disciplina abrem a pasta da turma (`arquivos` com «Nenhum» tira-a)                                          |
| Chamada do professor                   | `/pedagogica?tab=presencas&turma&disciplina`        | Implementado — «Presenças» da disciplina abre a chamada; `/professor/presenca` fica fora                                           |
| Trabalhos                              | `/pedagogica/trabalhos?turma&disciplina`            | Implementado — lista da turma ou da disciplina (em curso e prazo terminado); criam-se no detalhe da aula; cada um leva às entregas |
| Horário da turma                       | `/pedagogica?tab=horarios&turma`                    | Implementado — turma e disciplina abrem o horário da turma (`ScheduleWorkspace`)                                                   |
| Relatórios da turma                    | `/relatorios/academicos?turma`                      | Implementado — turma e disciplina abrem os relatórios académicos filtrados pela turma; o filtro de turma segue a URL               |
| Alunos em risco                        | `/pedagogica/risco?turma`                           | Implementado — os alertas e a análise abrem na turma (da disciplina, a turma); a turma escolhida fica na URL                       |
| Renovar matrículas                     | `/pedagogica/turmas/$turmaId/renovar`               | Implementado — só na turma, a quem grava em Pessoas (Administração e Secretaria, como `getRenewalPlan`)                            |
| Alunos da turma                        | `/pedagogica/turmas/$classGroupId?secao=alunos`     | Implementado — a turma tem página própria (decisão do proprietário, 25/10/2026), com «Ficha da turma» e «Alunos da turma» no menu  |
| Professor responsável                  | `/professores/$teacherId`                           | Implementado — na disciplina, quando o servidor devolve o professor dela (`class_subjects.teacher_id`)                             |
| Visão geral da disciplina, reclamações | —                                                   | Ausente; não se criam páginas para encher o menu                                                                                   |
| Breadcrumb contextual no `PageHeader`  | `context-breadcrumb.ts` via `ActiveContextProvider` | Implementado — `/pedagogica`, `/planos-aula`, `/pedagogica/trabalhos`, `/arquivos`, `/relatorios/academicos`                       |

### 5.2 Aluno (prioridade 2)

| Função                           | Destino                                                                                             | Estado                                                                                                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rota reconhecida pelo resolvedor | `/alunos/$studentId`                                                                                | Implementado (#332)                                                                                                                                                         |
| Lookup e entradas do aluno       | foco da ficha + `student-context-entries.ts`                                                        | Implementado (fase 5)                                                                                                                                                       |
| Menu do aluno na sidebar         | `ContextEntityNav`                                                                                  | Implementado (desktop; só a equipa)                                                                                                                                         |
| Ficha por secção                 | `/alunos/$studentId?secao=identificacao\|academico\|financeiro\|documentos\|historico`              | Implementado                                                                                                                                                                |
| Histórico                        | `/alunos/$studentId?secao=historico`                                                                | Implementado — um bloco por ano lectivo, com média, situação e médias por disciplina (o motor da Pauta Final); só Administração e Secretaria                                |
| Turma do aluno                   | `/pedagogica/turmas/$classGroupId`, `/pedagogica/trabalhos?turma`, `/pedagogica?tab=horarios&turma` | Implementado — a turma da matrícula vem da ficha lida no servidor (relação do aluno); só Administração e Secretaria                                                         |
| Comunicação                      | —                                                                                                   | Ausente — a ficha não mostra esse conteúdo                                                                                                                                  |
| Faturas e documentos do aluno    | `/faturas?aluno`, `/documentos`                                                                     | Parcial — na ficha, o Financeiro com todas as faturas e os Documentos; «Receber pagamentos» (Administração) e «Faturas do aluno» no menu da fatura levam a `/faturas?aluno` |
| Fatura (contexto financeiro)     | `/faturas/$invoiceId`                                                                               | Implementado — detalhes, aluno, pagamentos e recibos; menu da fatura para Administração e Tesouraria; receber e anular na lista                                             |
| Ficheiro (Documentos e Arquivos) | `/arquivos/$fileId`                                                                                 | Implementado — detalhes, turma e aluno ligados, abrir e descarregar, auditoria; menu do ficheiro para a equipa; editar e apagar na lista                                    |
| Relações no painel direito       | `students/student-relation-map`                                                                     | Implementado                                                                                                                                                                |
| Botões de gestão da ficha        | foto, turma, estado, anular, editar, encarregados, presença                                         | Implementado — só a quem grava em Pessoas (o guarda do servidor); o encarregado não os vê                                                                                   |

### 5.3 Restantes contextos

| Contexto                                            | Estado                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Professor                                           | Parcial — menu com «Perfil e turmas» (`/professores/$teacherId`) e «Horário semanal» (`/pedagogica?tab=horarios&professor`) e «Planos de aula» (`/planos-aula?professor`, as disciplinas que dá), «Trabalhos criados» (`/pedagogica/trabalhos?professor`, de todas as turmas dele) e «Presenças» (`/pedagogica?tab=presencas&professor`, as aulas do dia dele; o histórico continua o da escola), estes quatro só a quem grava no Pedagógico |
| Financeiro                                          | Parcial — seguir [FINANCE_MASTER_2026.md](finance/FINANCE_MASTER_2026.md)                                                                                                                                                                                                                                                                                                                                                                    |
| Documentos e Arquivos                               | Parcial — a pasta da turma abre-se do menu; cada ficheiro tem página própria (`/arquivos/$fileId`) com o menu do ficheiro (pasta da turma, documentos e ficha do aluno ligados). Faltam as pastas como contexto                                                                                                                                                                                                                              |
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
- Medição do bundle (26/10/2026, `vite build --mode production`, gzip nível 9; base = ponto
  de partida da PR no `main`, `a6d8f53`):
  - JS inicial (entrada `client` e o que importa estaticamente): 189,6 KB gzip nos dois, sem
    alteração. O motor, as entradas e o menu não estão no carregamento inicial.
  - Código da `AppShell` (comum às páginas autenticadas): 45,9 → 50,1 KB gzip (+4,2 KB), com
    o resolvedor, as entradas de turma, disciplina, aluno, professor e fatura, o menu e o
    «Continuar». A memória por escola acrescenta 1,0 KB a `use-sign-out` e o contexto activo
    0,3 KB.
  - As páginas novas são blocos próprios, carregados só ao abri-las: ficha da turma 6,6 KB,
    fatura 2,3 KB, trabalhos 1,7 KB; `/pedagogica` desce 4,2 KB (a ficha da turma saiu dela).
  - A primeira medição mostrou que a ficha da turma ia para o bloco partilhado `index` (+9,6
    KB em todas as páginas), porque a configuração da rota importava `TURMA_SECTIONS` do
    componente. As secções passaram para `turma-sections.ts` e o `index` fica em +0,6 KB.
  - Total de JS: 1979 → 1995 KB gzip (+0,8 %).
- Pedidos: o menu não faz pedidos novos. Turmas e disciplinas usam as chaves da árvore
  académica; o professor só se pede com `?professor=`; aluno e fatura vêm da leitura que a
  página já faz. A ficha do aluno deixou de pedir as faturas a quem o servidor as recusa.

## 8. Segurança multi-tenant

- Turma/disciplina só entram no caminho se o servidor as devolveu à conta: o professor
  não abre o contexto de uma turma que não lecciona alterando a URL.
- Cada entrada passa por `canAccessPath` e `canReadModule`; o menu da entidade só para
  a equipa.
- Uma entidade declarada por outra escola é descartada.
- O aluno da URL só entra no caminho depois de a ficha o ler do servidor na escola activa.
- Recentes e favoritos são por escola: uma conta com duas escolas não vê na segunda os
  destinos (com ids de alunos ou turmas) da primeira.
- A fatura só abre se `getInvoiceDetail` a devolver na escola activa (filtro por escola em
  fatura, contrato, matrícula e recibos); o aluno dela vem dessa leitura. O menu da fatura é
  da Administração e da Tesouraria, e o financeiro e a ficha do aluno só aparecem a quem abre
  fichas de alunos.
- O ficheiro só abre se `getSchoolFileDetail` o devolver: a escola activa, não apagado, no
  SGA (não só local), não uma pasta, e visível à conta pela mesma regra da lista
  (`canSeeRow`: área, «Os meus arquivos» do próprio, privado só do dono ou da administração).
  Um ficheiro que a conta não veria devolve «não encontrado», sem dizer porquê. O caminho no
  Storage nunca sai do servidor; o conteúdo abre-se por `signSchoolFile`, que revalida tudo, e
  um ficheiro do sistema sem permissão mostra-se sem conteúdo nem descrição. A turma e o
  aluno ligados vêm dessa leitura, filtrados pela escola.
- Nenhuma alteração a SQL, RLS ou permissões.

## 9. Estado das fases

| Fase                | Estado                                                       | Evidência                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Auditoria         | Parcial                                                      | Inventário §5; falta auditoria em sessão autenticada                                                                                                                                                 |
| 2 Motor de contexto | Implementado                                                 | PR #332 (24 testes)                                                                                                                                                                                  |
| 3 Sidebar           | **Implementado (desktop, turma/disciplina/aluno/professor)** | `ContextEntityNav`; 17 testes de sidebar + 7 de lookup + 15 do professor; breadcrumb com 9 testes                                                                                                    |
| 4 Disciplina piloto | Parcial                                                      | Trabalhos da turma e da disciplina (`/pedagogica/trabalhos`); cada trabalho leva às entregas (`/pedagogica/tarefas/<id>`, do main); falta validação em staging                                       |
| 5 Aluno piloto      | **Implementado (desktop)**                                   | Secções com URL própria (24 testes de regras e entradas, 13 de render); capturas a 1440/390 px com dados fictícios; falta sessão autenticada                                                         |
| 6 Financeiro/docs   | Parcial                                                      | Financeiro do aluno com todas as faturas e a dívida; página e menu da fatura (`/faturas/$invoiceId`) com as cobranças Multicaixa; página e menu do ficheiro (`/arquivos/$fileId`); faltam reembolsos |
| 7 Restantes         | Ausente                                                      |                                                                                                                                                                                                      |
| 8 Desktop/mobile    | Parcial                                                      | Sidebar (expandida e recolhida) e hub «Mais» testados em jsdom (8 testes do hub); capturas a 1440 e 390 px com dados fictícios; falta validar em aparelhos e nas larguras 767/768/1023/1024 px       |
| 9 Optimização       | Parcial                                                      | Bundle medido (§7): JS inicial sem alteração, +4,2 KB gzip na `AppShell`; regressão no bloco partilhado encontrada e corrigida; faltam renderizações e tempos em aparelho                            |
| 10 Revisão          | Parcial                                                      | Lint, TypeScript e suite completa passam (703 ficheiros); Playwright pendente                                                                                                                        |

## 10. Testes de aceitação

| Cenário                        | Coberto                                                                                                | Falta                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ | -------------------- |
| A Professor turma → disciplina | Menu só com a turma/disciplina activas; outra turma recusada                                           | E2E                  |
| B Aluno                        | Aluno não recebe o menu de gestão                                                                      | E2E                  |
| C Secretaria → aluno           | Menu com as secções que a conta lê; Financeiro segue o servidor; secção recusada abre a ficha completa | E2E                  |
| D Multi-escola                 | Entidade de outra escola descartada; queries repostas; recentes e favoritos por escola                 | E2E com duas escolas |
| E URL directa                  | Menu, secção e breadcrumb restaurados a partir da URL                                                  | E2E                  |
| F Segurança                    | IDs não-UUID ignorados; turma ou professor não devolvidos pelo servidor ignorados                      | Testes de servidor   |
| G Dispositivos                 | Recolhida; hub «Mais» no telemóvel                                                                     | Aparelhos reais      |
| H Regressão                    | Suite completa passa (703 ficheiros, 4909 testes)                                                      | Playwright           |

## 11. Como estender

Cada módulo declara a sua contribuição no próprio ficheiro (`ContextModule`, em
`context-modules.ts`): os tipos de entidade que abre e o nome de cada um no cabeçalho, as
entradas (`ContextNavEntry[]`), quem recebe o menu e para onde leva «Voltar». O motor
(resolvedor, registo, sidebar e hub do telemóvel) só lê `CONTEXT_MODULES`; não se mexe nele.
A fatura entrou assim:

```ts
// src/features/intelligence/invoice-context-entries.ts
export const INVOICE_CONTEXT_MODULE: ContextModule = {
  kinds: { invoice: "Fatura" },
  entries: INVOICE_CONTEXT_ENTRIES, // «Detalhes e recibos», «Todas as faturas», aluno da fatura
  menuRoles: ["Administrador", "Tesouraria"],
  back: () => ({ to: "/faturas" }),
};
// src/features/intelligence/context-modules.ts
export const CONTEXT_MODULES = [ACADEMIC_…, STUDENT_…, TEACHER_…, INVOICE_CONTEXT_MODULE];
```

Para um módulo novo:

1. O tipo de entidade em `EntityType` (`types.ts`) e a rota em `routeContextCandidates`
   (só parâmetros tipados, ids UUID), senão abrir a entrada perde o contexto.
2. A confirmação da entidade: a página declara o foco com a entidade lida do servidor
   (`useDeclareEntityFocus`, com `schoolId` e as relações devolvidas), ou um `ContextLookup`
   sobre uma lista que o servidor já devolveu (como a árvore académica).
3. As entradas: cada uma aponta para uma rota que existe, cujo `validateSearch` aceita os
   parâmetros e cuja página filtra por eles; `roles`, `allow` e `available` só estreitam.
4. O servidor valida escola e vínculo em cada leitura; o menu não autoriza nada.
5. Testes: o contrato de `tests/intelligence/context-modules.test.ts` cobre tipos, ids e
   «Voltar»; acrescentar os casos do módulo à sidebar (`tests/routes/sidebar-nav.test.tsx`).

## 12. Coordenação entre agentes (25/10)

- PR #332 (sessão de projecto): motor. Proposta de divisão deixada
  [na própria PR](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/332#issuecomment-6402255146):
  este ramo faz a fase 3 (opção A); a #332 segue com o contexto do aluno e o breadcrumb.
- Ficheiros deste ramo: `AppSidebar.tsx`, `AcademicNavTree.tsx`, `ContextEntityNav.tsx`,
  `use-academic-nav-tree.ts`, `academic-context-lookup.ts`.
- A #333 entrou no ramo da #332 no `049642b`, a pedido do proprietário; daqui em diante há
  um só ramo. O menu do aluno e o breadcrumb seguiram por cima.
- #329 (Trabalhos) e #327 (disciplinas da turma) não tocam nestes ficheiros. A #335 (entregas)
  entrou no main com a #336; cada trabalho da lista leva a `/pedagogica/tarefas/$taskId`.

## 13. Limitações conhecidas

- No telemóvel, o menu da entidade só aparece ao abrir o hub «Mais»; falta validar em
  aparelhos.
- Presenças e Materiais estão cobertos em jsdom e em capturas com dados fictícios; falta
  confirmar numa sessão autenticada que a chamada e a pasta da turma abrem com dados reais.
- Referências externas (Moodle, Canvas, Linear, Jira, Salesforce, Notion, VS Code, Odoo,
  ClickUp) inspiram os princípios; nada foi copiado.
