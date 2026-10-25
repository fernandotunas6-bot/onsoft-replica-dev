# SIGA Context Engine 2026 — especificação de implementação

Navegação contextual inteligente · Sidebar 360° · Workspace dinâmico.
Versão de 25/10/2026, sobre `main` em `a6d8f53`.

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
RLS). Um ID na URL nunca cria um destino no menu.

---

## 1. O que já existe e é reaproveitado

Nada é substituído. Cada peça abaixo é estendida no seu lugar.

| Peça existente                                                | Papel no Context Engine                                                                    | Estado                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `src/components/layout/AppShell.tsx`                          | Coordena sidebar, header, main e RightRail; mobile com header e navegação inferior         | Mantido                                                  |
| `src/components/layout/AppSidebar.tsx`                        | Sidebar 240 px / 64 px recolhida; grupos do catálogo; pesquisa; escola activa              | Mantido; recebe o menu da entidade (fase 3)              |
| `src/components/layout/AcademicNavTree.tsx`                   | Curso/classe → turma → disciplina; leva a `/pedagogica?tab=notas&turma&disciplina&pauta=1` | Mantido; passa a abrir o contexto da disciplina (fase 3) |
| `src/components/layout/NavItem.tsx`                           | `NavLinkRow`, `NavButtonRow`, `NavSubheader`, profundidade `sub`                           | Reutilizado para o menu da entidade                      |
| `src/components/layout/RightRail.tsx`                         | Separadores «Relacionado» e «Mensagens»; coluna em ≥1536 px, Sheet abaixo                  | Mantido — único painel contextual                        |
| `src/features/auth/portal-engine.ts`, `navigation-catalog.ts` | Catálogo por papel, permissões e plano                                                     | Fonte única dos módulos (nível 1)                        |
| `src/features/auth/contextual-navigation.ts`                  | Resolve o módulo activo a partir da rota e da pesquisa                                     | Fonte do nível 1                                         |
| `src/features/auth/access-policy.ts`                          | `canAccessPath`, `canReadModule`, `canWriteModule`, plano                                  | Filtro obrigatório de cada destino                       |
| `src/features/intelligence/*`                                 | `EntityFocus`, relações por entidade, sugestões, `useAppContext`                           | Base do nível 2–3                                        |
| `src/features/auth/use-navigation-memory.ts`                  | Recentes e favoritos por utilizador                                                        | Base da memória de contexto (fase 9 do prompt)           |
| `use-current-account.ts` (`setActiveSchoolId`)                | Troca de escola faz `resetQueries` a tudo excepto `["auth"]`                               | Garante o cenário D na cache                             |

**Novo nesta entrega (fase 2, só lógica, sem alteração visual):**

| Ficheiro                                        | O que faz                                                                                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/intelligence/context-frame.ts`    | `resolveContextFrame` — contexto tipado a partir da rota, da entidade declarada e da conta; `key` estável por escola/papel/ano/entidade |
| `src/features/intelligence/context-registry.ts` | Registo declarativo de destinos por entidade; `buildContextNavigation` filtra por estado, papel, `canAccessPath` e plano                |
| `src/features/intelligence/context-engine.ts`   | `buildAppContext` descarta uma entidade declarada por outra escola                                                                      |
| `tests/intelligence/context-engine.test.ts`     | 19 testes: ordem de resolução, IDs inválidos, isolamento de escola, menu por papel, extensão do registo, rotas existentes               |

## 2. Organização visual

Esquema conceptual enviado pelo proprietário em 25/10: barra global de ícones, sidebar
contextual («Disciplina · Matemática» com Visão geral, Alunos da turma, Trabalhos e tarefas
→ Trabalho 1/2, Avaliações e notas, Presenças, Planos de aula) e conteúdo principal com
breadcrumb «Pedagógica / Turma A / Matemática» e o título da função. O painel de relações
surge à direita só quando há espaço e é útil.

Como se aplica sem violar o contrato visual aprovado (sidebar 240/64 px, menu compacto
por omissão, sem nova coluna obrigatória):

| Região             | Implementação                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Barra global       | **Opção A (por omissão):** sem coluna nova. O cabeçalho da sidebar mostra a escola e, em contexto de entidade, «← Voltar a ‹módulo›»; os módulos continuam no catálogo e na pesquisa. **Opção B (como no esquema):** faixa de ícones de 56–64 px + painel contextual de 240 px, só em ≥1440 px e como preferência da escola (mesmo mecanismo de `expandedSidebar`). A opção B muda a largura útil e precisa de aprovação explícita do proprietário antes de ser activada por omissão. |
| Sidebar contextual | Cabeçalho da entidade (tipo · nome), botão de regresso, grupos do registo (`perfil`, `ensino`, `trabalhos`, `avaliacao`, `acompanhamento`), sub-itens com `depth="sub"` (ex.: trabalhos de uma disciplina). Recolhida a 64 px: ícones e popover à direita, como `AcademicNavTree` já faz.                                                                                                                                                                                             |
| Conteúdo principal | `PageHeader` com breadcrumb contextual e o título da função; só os dados dessa função.                                                                                                                                                                                                                                                                                                                                                                                                |
| Painel direito     | `RightRail` existente; nunca um segundo painel.                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Acabamento: tokens `--sidebar-*`, `--sidebar-active`, `--background`, `--border`,
`--primary`; margem esquerda recta e concavidade à direita conforme
[SIGA_VISUAL_MASTER_2026-10-23.md](../design/SIGA_VISUAL_MASTER_2026-10-23.md). Sem cores
fixas, sem imagens decorativas, transições 120–200 ms com `motion-reduce`.

## 3. Níveis de contexto e contrato TypeScript

| Nível                 | Significado                                         | Onde vive                                                   |
| --------------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| 0 Conta e instituição | utilizador, escola activa, papel, plano, permissões | `useCurrentAccount`, `useSchoolSettings` (`selectedYearId`) |
| 1 Módulo              | área do catálogo                                    | `getNavigationContext`                                      |
| 2 Entidade            | turma, disciplina, aluno, professor                 | `ContextFrame.entity`                                       |
| 3 Relações            | objectos ligados à entidade                         | `useRelations` + registo                                    |
| 4 Funcionalidade      | rota + `tab`                                        | `ContextFrame.activeView`                                   |
| 5 Operação            | criar, lançar, publicar…                            | a página; não altera o frame                                |

```ts
type ContextEntity =
  | { type: "subject"; classGroupId: string; subjectId: string }
  | { type: "class"; classGroupId: string }
  | { type: "student"; studentId: string }
  | { type: "teacher"; teacherId: string };

interface ContextFrame {
  schoolId: string | null;
  role: string;
  academicYearId: string | null;
  entity: ContextEntity | null;
  source: "route" | "focus" | "none";
  activeView: { pathname: string; tab: string | null };
  key: string; // escola|papel|ano|entidade
}
```

Mapeamento dos campos de referência do prompt: `tenantId` = `schoolId` (o SIGA não tem
outro nível de tenant); `userId`, `grants`, `capabilities` continuam no `AppContext` e em
`access-policy`; `termId` fica para quando a rota o tipar; `parentContext` é implícito
(disciplina ⊂ turma); `contextVersion` = `key`. Não se criaram identificadores redundantes.

**Ordem de resolução** (implementada e testada):

1. Rota e parâmetros tipados: `/alunos/$studentId`, `/professores/$teacherId`,
   `turma`/`disciplina` (GUID, validados por zod) em `/pedagogica`, `/planos-aula`,
   `/professor/presenca`.
2. Entidade declarada pela página (`useDeclareEntityFocus`), só se for da escola activa.
3. Contexto geral (sem entidade).

Valores que não são GUID nunca criam contexto. A entidade declarada nunca substitui a da
rota. Mudar escola, papel, ano ou entidade muda `key`.

## 4. Registo de destinos

Cada `ContextDestination` declara: `id` estável, `label`, `icon`, `group`, `contexts`,
`status` (`implemented` | `partial`), `priority`, `roles` (só estreita), `link(entity)`
(rota + parâmetros) e `emptyLabel`. A autorização vem de `canAccessPath` com permissões e
plano. Um módulo acrescenta destinos passando `registry` — o motor não muda (há um teste
que o demonstra).

Política de carregamento: o registo só tem funções puras e nomes de ícone; não importa
componentes de página, por isso não pesa no bundle inicial. Os dados de cada destino são
carregados pela própria página (React Query, chaves já existentes).

## 5. Inventário (Implementado · Parcial · Ausente · Bloqueado)

Fonte: rotas em `src/routes`, `validateSearch` de cada uma e funções de servidor.
«Implementado» exige rota real com dados reais, não só um botão.

### 5.1 Disciplina (prioridade 1)

| Função                            | Destino                                          | Estado       | Nota                                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Avaliações e notas / pauta        | `/pedagogica?tab=notas&turma&disciplina&pauta=1` | Implementado | Já usado pela árvore académica                                                                                                                                        |
| Planos de aula                    | `/planos-aula?turma&disciplina`                  | Implementado | Equipa docente                                                                                                                                                        |
| Presenças / chamada               | `/professor/presenca?turma&disciplina`           | Implementado | Administrador, Tesouraria, Professor                                                                                                                                  |
| Materiais e ficheiros             | `/arquivos?turma`                                | Implementado | Por turma, não por disciplina                                                                                                                                         |
| Trabalhos e tarefas               | —                                                | Parcial      | `createClassTask`/`archiveClassTask` e `siga_class_tasks` existem; `siga_class_task_submissions` só servidor (#331); falta lista e ecrã de entregas — SPEC na PR #329 |
| Entregas, correcção, feedback     | —                                                | Parcial      | Tabela pronta, sem funções nem ecrã                                                                                                                                   |
| Alunos da turma                   | `/pedagogica?tab=turmas`                         | Parcial      | Confirmar em sessão se o separador usa `turma` da URL; não entra no registo até estar provado                                                                         |
| Horário da turma                  | `/pedagogica?tab=horarios`                       | Parcial      | Confirmar filtro por `turma` na URL antes de registar                                                                                                                 |
| Visão geral da disciplina         | —                                                | Ausente      | Não existe página; não se cria para encher o menu                                                                                                                     |
| Conteúdos programáticos, unidades | `/pedagogica/catalogo`                           | Parcial      | Catálogo de referência, não por turma                                                                                                                                 |
| Reclamações de notas              | —                                                | Ausente      |                                                                                                                                                                       |
| Professor responsável             | `/professores/$teacherId`                        | Parcial      | Falta resolver o professor a partir de turma+disciplina no cliente                                                                                                    |

### 5.2 Aluno (prioridade 2)

| Função                              | Destino                                              | Estado       | Nota                                             |
| ----------------------------------- | ---------------------------------------------------- | ------------ | ------------------------------------------------ |
| Ficha, dados pessoais, encarregados | `/alunos/$studentId`                                 | Implementado | Secretaria, Administrador, Encarregado           |
| Académico, histórico                | `/alunos/$studentId` (secções)                       | Parcial      | Secções na mesma página, sem URL própria (`tab`) |
| Propinas, faturas do aluno          | `/alunos/$studentId` (`listInvoices({ studentId })`) | Parcial      | Sem destino filtrado em `/faturas`               |
| Documentos                          | `/documentos`                                        | Parcial      | Sem filtro por aluno na URL                      |
| Ficheiros pessoais                  | `/arquivos?pessoa`                                   | Parcial      | `pessoa` é a pessoa, confirmar ligação ao aluno  |
| Relações no painel direito          | `students/student-relation-map`                      | Implementado |                                                  |

### 5.3 Restantes contextos

| Contexto                                            | Estado       | Nota                                                                                                                               |
| --------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Turma (titular, primário)                           | Implementado | Mesmos destinos sem `disciplina`                                                                                                   |
| Professor                                           | Parcial      | Perfil e relações existem; trabalhos/planos por professor sem filtro na URL                                                        |
| Financeiro (fatura, cobrança)                       | Parcial      | Rotas e `payment-states.ts` existem; sem entidade fatura no frame. Seguir [FINANCE_MASTER_2026.md](finance/FINANCE_MASTER_2026.md) |
| Documentos e Arquivos                               | Parcial      | `FileBrowser` com `turma`/`pessoa`; sem frame «ficheiro»                                                                           |
| Website escolar                                     | Bloqueado    | Editor em PRs abertas (#205, #206, #275, #277); não mexer até integrarem                                                           |
| RH                                                  | Parcial      | Rotas `financeiro/rh/*`, só por cargo (`roleOnlyPrefixes`)                                                                         |
| Biblioteca, Transporte                              | Ausente      | Não há rotas no `main`; não criar páginas fictícias                                                                                |
| Comunicações, Calendário, Relatórios, Configurações | Parcial      | Módulos com rota; sem entidade                                                                                                     |

## 6. Comportamento de menus

- Grupo com sub-itens: clique expande (`aria-expanded`); nada depende só de hover.
- Desktop recolhido: popover à direita (`side="right"`, altura limitada ao viewport),
  fecha com Escape e devolve o foco — padrão já usado em `AcademicNavTree`.
- Destino activo: `aria-current="page"` pelo mesmo cálculo de `isContextDestinationActive`.
- Mobile: gaveta existente; toque expande; botão de regresso visível; alvos ≥44 px.
- Profundidade máxima visível: entidade → grupo → sub-item. Mais fundo abre página.

## 7. Memória de contexto

- Guardar por utilizador **e escola** apenas o último `activeView` e o `id` do destino,
  nunca dados pessoais (nomes de alunos não vão para `localStorage`).
- Restaurar só se a `key` do frame for a mesma e o destino voltar a passar em
  `buildContextNavigation`. A memória nunca concede acesso.
- Terminar sessão (`queryClient.clear()`) e trocar de escola (`resetQueries`) já descartam
  dados; a memória de contexto deve ser apagada nos mesmos pontos.

## 8. Cache e desempenho

- Troca de escola já repõe as consultas (excepto `["auth"]`); muitas chaves não levam a
  escola, por isso esta reposição é obrigatória e não pode ser removida.
- Novas consultas do contexto devem incluir `schoolId` e `academicYearId` na chave.
- O motor é síncrono e puro (O(destinos)); não faz pedidos. Não usar `useMemo` sem medição.
- Prefetch só do destino seleccionado; nada de carregar todos os módulos ao abrir.

## 9. Segurança multi-tenant

- `buildContextNavigation` não mostra nada sem `schoolId` e entidade.
- Cada destino passa por `canAccessPath` (papel, permissões, plano) e por `roles`.
- O servidor valida o vínculo professor↔turma/disciplina (ex.: pauta por cadeira,
  presença) e a escola em cada pedido; tabelas de trabalhos de menores são só servidor.
- Uma entidade declarada por outra escola é descartada no `AppContext` e no frame.
- Não se criam políticas RLS nem migrações nesta especificação.

## 10. Plano de execução e estado

| Fase                      | Estado                    | Evidência / próximo passo                                                                                         |
| ------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1 Auditoria               | Parcial                   | Inventário §5 a partir de rotas e servidor; falta auditoria runtime autenticada                                   |
| 2 Motor de contexto       | **Implementado (lógica)** | `context-frame.ts`, `context-registry.ts`, 19 testes; sem ligação à UI                                            |
| 3 Sidebar                 | Ausente                   | Mostrar `buildContextNavigation` na `AppSidebar` quando há entidade; botão de regresso; sem coluna nova (opção A) |
| 4 Disciplina piloto       | Parcial                   | Destinos reais ligados no registo; falta ecrã de Trabalhos (depende da PR #329) e validação em staging            |
| 5 Aluno piloto            | Parcial                   | Ficha no registo; falta dar URL (`tab`) às secções e filtros por aluno                                            |
| 6 Financeiro e documentos | Ausente                   | Depois da 5; sem migrações financeiras                                                                            |
| 7 Restantes módulos       | Ausente                   | Só módulos com rota                                                                                               |
| 8 Desktop/mobile          | Ausente                   | 390/768/1024/1440/1536 px, teclado e toque                                                                        |
| 9 Optimização             | Ausente                   | Medir antes/depois                                                                                                |
| 10 Revisão                | Parcial                   | Lint, TypeScript e testes desta entrega passam; Playwright pendente                                               |

## 11. Testes de aceitação

| Cenário                                                 | Coberto agora                                                  | Falta                                   |
| ------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------- |
| A Professor: turma → disciplina → trabalhos → entrega   | Menu da disciplina só com a turma/disciplina activas           | Ecrã de trabalhos; E2E                  |
| B Aluno: só dados próprios                              | Aluno não recebe destinos de gestão da turma                   | E2E com conta de aluno                  |
| C Secretaria: aluno → matrícula → documentos → propinas | Ficha no menu                                                  | Destinos filtrados por aluno            |
| D Multi-escola                                          | Entidade de outra escola descartada; `key` muda; cache reposta | E2E com duas escolas                    |
| E URL directa                                           | Frame resolvido só da rota                                     | Sidebar/breadcrumb restaurados (fase 3) |
| F Segurança                                             | IDs não-GUID ignorados; `canAccessPath` em cada destino        | Testes de servidor por ID alterado      |
| G Dispositivos                                          | —                                                              | Fase 8                                  |
| H Regressão                                             | Testes existentes de navegação e inteligência passam           | Suite completa e Playwright             |

## 12. Como estender (novo módulo)

```ts
import {
  CONTEXT_DESTINATIONS,
  type ContextDestination,
} from "@/features/intelligence/context-registry";

const calendario: ContextDestination = {
  id: "subject.calendar",
  label: "Calendário",
  icon: "Calendar",
  group: "acompanhamento",
  contexts: ["subject"],
  status: "implemented", // só quando a rota aceitar os parâmetros
  priority: 5,
  link: (entity) =>
    entity.type === "subject"
      ? { to: "/calendario", search: { turma: entity.classGroupId } }
      : null,
  emptyLabel: "Sem eventos.",
};

buildContextNavigation({ frame, grants, plan, registry: [...CONTEXT_DESTINATIONS, calendario] });
```

Antes de marcar `implemented`: a rota tem de aceitar os parâmetros no `validateSearch`, a
página tem de filtrar por eles e o servidor tem de validar a escola e o vínculo.

## 13. Coordenação com outros agentes (25/10)

| PR aberta                        | Área               | Cuidado                                               |
| -------------------------------- | ------------------ | ----------------------------------------------------- |
| #329 SPEC trabalhos e matrículas | Trabalhos/entregas | O destino `subject.tasks` espera o ecrã desta linha   |
| #330 renovar matrículas          | Matrícula          | Sem ficheiros comuns                                  |
| #327 disciplinas da turma        | Pauta              | Pode afectar o separador de notas; o destino não muda |
| #205/#206/#275/#277 Website      | Editor             | Contexto Website bloqueado até integrarem             |

Não foram alterados `AppSidebar`, `AppShell`, `RightRail`, estilos nem base de dados.

## 14. Limitações conhecidas

- O motor ainda não está visível: a fase 3 liga-o à sidebar.
- `termId` (período) não está na URL de nenhuma rota; o filtro por período fica na página.
- A opção B (barra global de ícones) precisa de decisão do proprietário.
- Referências externas (Moodle, Canvas, Linear, Jira, Salesforce, Notion, VS Code, Odoo,
  ClickUp) inspiram os princípios; nenhum código, logótipo ou interface foi copiado.
