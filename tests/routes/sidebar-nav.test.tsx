// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentType, ComponentPropsWithRef, ReactNode } from "react";
import { applyAppearance, type AppearanceState } from "@/lib/appearance";
import "./_harness";

/**
 * Barra lateral: o `search` de cada item de navegação tem de chegar ao `<Link>`.
 *
 * Dois bugs da mesma família saíram daqui, ambos por o `search` do item ser
 * ignorado:
 *  - os quatro sub-itens de "Área Pedagógica" (todos `/pedagogica`, distintos
 *    só pelo `?tab=`) acendiam ao mesmo tempo como activos, porque o estado
 *    activo comparava só o caminho;
 *  - o item de topo "Frequência" dos portais Aluno e Encarregado
 *    (`/pedagogica?tab=presencas`) era renderizado SEM `search`, por isso
 *    levava o utilizador ao separador por omissão ("turmas") em vez das faltas.
 *
 * O `Link` mockado despeja `to` e `search` em atributos `data-*`, que é o que
 * estes testes inspeccionam.
 */

vi.setConfig({ testTimeout: 20_000 });

let currentPathname = "/pedagogica";
let currentSearch: Record<string, unknown> = {};

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    search,
    activeOptions: _activeOptions,
    activeProps: _activeProps,
    inactiveProps: _inactiveProps,
    preload: _preload,
    preloadDelay: _preloadDelay,
    ...props
  }: ComponentPropsWithRef<"a"> & {
    children?: ReactNode;
    to?: string;
    search?: Record<string, unknown>;
    activeOptions?: unknown;
    activeProps?: unknown;
    inactiveProps?: unknown;
    preload?: unknown;
    preloadDelay?: unknown;
  }) => (
    <a href="#" data-to={to} data-search={JSON.stringify(search ?? null)} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ preloadRoute: () => Promise.resolve() }),
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: currentPathname, search: currentSearch } }),
}));

/**
 * Conta ESTÁVEL por papel, e é essencial que assim seja: um objecto novo a cada
 * render fazia a barra entrar em ciclo infinito (ver `mergeOpenMenus` em
 * `tests/auth/portal-engine.test.ts`). Aqui a estabilidade mantém o teste a
 * medir a navegação, não o ciclo.
 */
const contas: Record<string, unknown> = {
  Administrador: {
    role: "Administrador",
    grants: {},
    name: "Admin Teste",
    email: "admin@escola.ao",
    initials: "AT",
    avatarUrl: null,
    schools: [],
    schoolName: "Escola Teste",
    schoolId: "school-a",
    roles: ["Administrador"],
    setActiveRole: () => {},
  },
  Aluno: {
    role: "Aluno",
    isAlumni: false,
    grants: {},
    name: "Aluno Teste",
    email: "aluno@escola.ao",
    initials: "AT",
    avatarUrl: null,
    schools: [],
    schoolName: "Escola Teste",
    schoolId: "school-a",
    roles: ["Aluno"],
    setActiveRole: () => {},
  },
};
for (const role of ["Secretaria", "Encarregado"]) {
  contas[role] = {
    ...(contas.Administrador as Record<string, unknown>),
    role,
    name: `${role} Teste`,
    roles: [role],
  };
}
let papel = "Administrador";

vi.mock("@/features/auth/use-current-account", () => ({
  useCurrentAccount: () => contas[papel] as never,
}));

// O modal de perfil e a árvore académica não são o objecto do teste e trazem
// as suas próprias queries.
vi.mock("@/components/auth/UserProfileModal", () => ({ UserProfileModal: () => null }));
vi.mock("@/components/layout/AcademicNavTree", () => ({ AcademicNavTree: () => null }));
// Turmas e disciplinas que o servidor devolveria à conta (menu da entidade).
const academic = vi.hoisted(() => ({
  tree: [] as Array<{
    id: string;
    label: string;
    kind: "course" | "grade";
    classTeacher: boolean;
    classes: Array<{
      id: string;
      name: string;
      classTeacher: boolean;
      subjects: Array<{ id: string; name: string }>;
    }>;
  }>,
}));
vi.mock("@/features/academic/use-academic-nav-tree", () => ({
  useAcademicNavTree: () => ({
    tree: academic.tree,
    schoolId: (contas[papel] as { schoolId?: string }).schoolId ?? null,
  }),
}));

// Entidade que a página declarou em foco (a ficha do aluno lida do servidor).
const focus = vi.hoisted(() => ({
  entity: null as null | {
    type: "student" | "teacher";
    id: string;
    label: string;
    schoolId: string;
  },
}));
// Professores que o servidor devolveria à escola (horário de um professor).
const teacherList = vi.hoisted(() => ({ rows: [] as Array<{ id: string; full_name: string }> }));
vi.mock("@/features/intelligence/teacher-context-lookup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/intelligence/teacher-context-lookup")>()),
  useTeacherNavList: () => teacherList.rows,
}));
vi.mock("@/features/intelligence/entity-focus-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/intelligence/entity-focus-context")>()),
  useEntityFocus: () => ({
    focusedEntity: focus.entity ? { ...focus.entity, data: null } : null,
    setFocusedEntity: () => {},
    clearFocusedEntity: () => {},
    panelCollapsed: true,
    setPanelCollapsed: () => {},
  }),
}));

// A moldura da barra (escola, tenant, terminar sessão) arrasta os módulos de
// servidor e o cliente Supabase; o objecto do teste é só a lista de navegação.
vi.mock("@/features/auth/use-school-settings", () => ({
  useSchoolSettings: () => ({
    school: { name: "Escola Teste" },
    activeYearLabel: "2026/2027",
  }),
}));
vi.mock("@/features/saas/tenant-context", () => ({
  useTenant: () => ({ activeTenant: null, activeSlug: "escola-teste", activePlan: null }),
}));
vi.mock("@/features/auth/use-sign-out", () => ({
  useSignOut: () => ({ signOut: () => {}, signingOut: false }),
}));

let AppSidebar: ComponentType<{ collapsed?: boolean }>;

beforeAll(async () => {
  AppSidebar = (await import("@/components/layout/AppSidebar"))
    .AppSidebar as unknown as ComponentType<{ collapsed?: boolean }>;
}, 60_000);

function renderSidebar(collapsed = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const tree = () => (
    <QueryClientProvider client={client}>
      <AppSidebar collapsed={collapsed} />
    </QueryClientProvider>
  );
  const view = render(tree());
  return { ...view, rerenderSidebar: () => view.rerender(tree()) };
}

/** Todos os links da barra que apontam para um dado caminho. */
function linksTo(path: string) {
  return screen
    .getAllByRole("link")
    .filter((el) => el.getAttribute("data-to") === path)
    .map((el) => ({
      label: el.textContent?.trim() ?? "",
      search: JSON.parse(el.getAttribute("data-search") ?? "null") as Record<
        string,
        unknown
      > | null,
    }));
}

afterEach(() => {
  cleanup();
  papel = "Administrador";
  (contas.Administrador as { schoolId: string }).schoolId = "school-a";
  (contas.Aluno as { isAlumni: boolean }).isAlumni = false;
  currentPathname = "/pedagogica";
  currentSearch = {};
  academic.tree = [];
  focus.entity = null;
  teacherList.rows = [];
  localStorage.clear();
  document.documentElement.style.cssText = "";
  document.documentElement.classList.remove("dark");
  for (const key of ["accent", "sidebarTheme", "density"]) {
    delete document.documentElement.dataset[key];
  }
});

describe("AppSidebar — parâmetros de pesquisa nos links", () => {
  it("leva o ?tab= de cada sub-item de Área Pedagógica para o link", () => {
    renderSidebar();

    const tabs = linksTo("/pedagogica").map((link) => link.search?.["tab"]);
    expect(tabs).toEqual(["turmas", "notas", "horarios", "chamada"]);
  });

  it("leva o ?tab=presencas no item de topo Frequência do portal do Aluno", () => {
    papel = "Aluno";
    currentSearch = { tab: "presencas" };

    renderSidebar();

    const frequencia = linksTo("/pedagogica").find((link) => link.label === "Frequência");
    // Sem `search`, este link caía no separador por omissão ("turmas") em vez
    // das faltas — o rótulo prometia uma coisa e a página abria outra.
    expect(frequencia?.search).toEqual({ tab: "presencas" });
  });

  it("não deixa nenhum link de topo apontar para /pedagogica sem separador", () => {
    papel = "Aluno";

    renderSidebar();

    const semTab = linksTo("/pedagogica").filter((link) => !link.search?.["tab"]);
    expect(semTab).toEqual([]);
  });
});

/** React sintetiza onPointerEnter a partir de pointerover, não de pointerenter
 * no DOM do jsdom. Forçar pointerType distingue rato de touch no teste.
 */
function hoverWithMouse(element: Element) {
  const event = new window.Event("pointerover", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  fireEvent(element, event);
}

describe("AppSidebar — flyouts contextuais à direita", () => {
  it("apresenta subfunções sem expandir verticalmente a sidebar", async () => {
    currentPathname = "/portal";
    renderSidebar();
    const secretaria = screen.getByRole("button", { name: "Secretaria" });
    fireEvent.click(secretaria);
    const flyout = await screen.findByRole("dialog");
    expect(flyout.hasAttribute("data-nav-flyout")).toBe(true);
    expect(flyout.querySelector("a[data-to='/alunos']")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Subfunções de Secretaria" })).toBeTruthy();
    expect(
      screen
        .getByRole("navigation", { name: "Navegação principal" })
        .querySelector(".nav-sub-list"),
    ).toBeNull();
    fireEvent.click(secretaria);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("abre subfunções com hover do rato, sem depender do clique", async () => {
    currentPathname = "/portal";
    renderSidebar();
    const secretaria = screen.getByRole("button", { name: "Secretaria" });
    hoverWithMouse(secretaria);
    const flyout = await screen.findByRole("dialog");
    expect(flyout.getAttribute("data-nav-flyout")).toBe("");
    expect(screen.getByRole("navigation", { name: "Subfunções de Secretaria" })).toBeTruthy();
  });

  it("hover da escola abre um menu não-modal que preserva o resto da sidebar", async () => {
    renderSidebar();
    const school = screen.getByRole("button", { name: "Abrir menu da escola: Escola Teste" });
    hoverWithMouse(school);
    const menu = await screen.findByRole("menu");
    expect(menu.hasAttribute("data-school-flyout")).toBe(true);
    expect(screen.getByRole("navigation", { name: "Navegação principal" })).toBeTruthy();
    expect(document.body.style.pointerEvents).not.toBe("none");
  });

  it("organiza as opções institucionais num submenu à direita, acessível por teclado", async () => {
    renderSidebar();
    const schoolTrigger = screen.getByRole("button", {
      name: "Abrir menu da escola: Escola Teste",
    });
    fireEvent.keyDown(schoolTrigger, { key: "Enter" });
    const institutions = await screen.findByRole("menuitem", { name: /Instituições/ });
    fireEvent.keyDown(institutions, { key: "ArrowRight" });
    const management = await screen.findByRole("menuitem", { name: "Gerir instituições" });
    expect(management.closest("[data-school-submenu]")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Criar escola" })).toBeTruthy();
  });

  it("fecha o flyout depois de seleccionar a subfunção, sem alterar o destino", async () => {
    currentPathname = "/portal";
    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Secretaria" }));
    const flyout = await screen.findByRole("dialog");
    const matricular = screen.getByRole("link", { name: "Matricular Aluno" });
    expect(matricular.getAttribute("data-to")).toBe("/alunos");
    expect(matricular.getAttribute("data-search")).toContain("matricular");
    fireEvent.click(matricular);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("mostra configurações e instituições no flyout da escola, mantendo acesso por teclado", async () => {
    renderSidebar();
    const trigger = screen.getByRole("button", { name: "Abrir menu da escola: Escola Teste" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    const menu = await screen.findByRole("menu");
    expect(menu.hasAttribute("data-school-flyout")).toBe(true);
    expect(menu.textContent).toContain("2026/2027");
    expect(screen.getByRole("menuitem", { name: /Instituições/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Configurações da Escola/ })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Meu perfil" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Criar escola" })).toBeNull();
    fireEvent.keyDown(menu, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });
});

describe("AppSidebar — escola e perfil activos", () => {
  it("conserva o portal Alumni apenas quando o aluno pertence ao programa", () => {
    papel = "Aluno";
    currentPathname = "/portal";
    (contas.Aluno as { isAlumni: boolean }).isAlumni = true;
    renderSidebar();
    expect(screen.getByRole("link", { name: "Meu Portal Alumni" }).getAttribute("data-to")).toBe(
      "/alumni/portal",
    );
  });
});

describe("AppSidebar — contexto", () => {
  it.each([false, true])(
    "identifica a área actual numa página de detalhe (recolhida: %s)",
    (collapsed) => {
      currentPathname = "/alunos/aluno-teste";
      renderSidebar(collapsed);
      fireEvent.click(screen.getByRole("button", { name: "Todas as áreas" }));
      expect(
        screen.getByRole("button", { name: "Secretaria" }).classList.contains("bg-primary/10"),
      ).toBe(true);
      expect(
        screen.getByRole("button", { name: "Financeiro" }).classList.contains("bg-primary/10"),
      ).toBe(false);
    },
  );

  it("mostra apenas o módulo activo e permite consultar todas as áreas", () => {
    currentPathname = "/faturas";
    renderSidebar();
    expect(linksTo("/faturas")).toHaveLength(1);
    expect(linksTo("/alunos")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Todas as áreas" }));
    expect(screen.getByRole("button", { name: "Secretaria" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Secretaria" }));
    expect(linksTo("/alunos").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao módulo" }));
    expect(linksTo("/alunos")).toHaveLength(0);
  });

  it("não restaura menus acumulados de outra sessão", () => {
    currentPathname = "/portal";
    localStorage.setItem(
      "siga:sidebar-open-menus",
      JSON.stringify(["Gestão de Alunos", "Caixa e Pagamentos"]),
    );
    renderSidebar();
    expect(linksTo("/alunos")).toHaveLength(0);
    expect(linksTo("/faturas")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Secretaria" }));
    expect(linksTo("/alunos").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Financeiro" }));
    expect(linksTo("/alunos")).toHaveLength(0);
    expect(linksTo("/faturas")).toHaveLength(1);
  });
});

describe("AppSidebar — teclado na barra recolhida", () => {
  it.each(["escola", "pesquisa"])(
    "fecha o menu recolhido ao mudar de %s e permite voltar a abri-lo",
    async (change) => {
      currentPathname = "/portal";
      const view = renderSidebar(true);
      fireEvent.keyDown(screen.getByRole("button", { name: "Secretaria" }), { key: "Enter" });
      await screen.findByRole("menu");
      if (change === "escola") {
        (contas.Administrador as { schoolId: string }).schoolId = "school-b";
      } else {
        currentSearch = { tab: "novo-contexto" };
      }
      view.rerenderSidebar();
      await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
      const trigger = screen.getByRole("button", { name: "Secretaria" });
      fireEvent.keyDown(trigger, { key: "Enter" });
      await screen.findByRole("menu");
      fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
      await waitFor(() => expect(document.activeElement).toBe(trigger));
    },
  );

  it("mantém o menu recolhido aberto num rerender sem mudança de contexto", async () => {
    currentPathname = "/portal";
    const view = renderSidebar(true);
    fireEvent.keyDown(screen.getByRole("button", { name: "Secretaria" }), { key: "Enter" });
    await screen.findByRole("menu");
    currentSearch = { ...currentSearch };
    view.rerenderSidebar();
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it.each([false, true])(
    "identifica e abre o menu da escola por teclado (recolhida: %s)",
    async (collapsed) => {
      renderSidebar(collapsed);
      const trigger = screen.getByRole("button", { name: "Abrir menu da escola: Escola Teste" });
      trigger.focus();
      fireEvent.keyDown(trigger, { key: "Enter" });
      const menu = await screen.findByRole("menu");
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      fireEvent.keyDown(menu, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(trigger));
    },
  );
  it("abre os destinos num portal e fecha com Escape", async () => {
    currentPathname = "/portal";
    const { container } = renderSidebar(true);
    const trigger = screen.getByRole("button", { name: "Secretaria" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    const menu = await screen.findByRole("menu");
    expect(container.querySelector("aside")?.contains(menu)).toBe(false);
    const enroll = screen.getByRole("menuitem", { name: "Matricular Aluno" });
    expect(enroll.getAttribute("data-to")).toBe("/alunos");
    expect(JSON.parse(enroll.getAttribute("data-search") ?? "null")).toEqual({
      action: "matricular",
    });
    fireEvent.keyDown(menu, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });
  it("fecha o menu recolhido ao escolher um destino com navegação interceptada", async () => {
    currentPathname = "/portal";
    renderSidebar(true);
    fireEvent.keyDown(screen.getByRole("button", { name: "Secretaria" }), { key: "Enter" });
    const enroll = await screen.findByRole("menuitem", { name: "Matricular Aluno" });
    enroll.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(enroll);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });
});

describe("AppSidebar — contexto e perfil", () => {
  it.each(["claro", "tinta"])(
    "conserva o contexto ao alternar aparência com sidebar %s",
    (sidebar) => {
      currentPathname = "/faturas";
      const view = renderSidebar();
      fireEvent.click(screen.getByRole("button", { name: "Todas as áreas" }));
      fireEvent.click(screen.getByRole("button", { name: "Secretaria" }));
      const destinations = linksTo("/alunos");
      expect(destinations.length).toBeGreaterThan(0);

      const appearance: AppearanceState = {
        mode: "light",
        accent: "violeta",
        sidebar,
        radius: 0.875,
        density: "comfortable",
        shadcnTheme: "",
        tweakcnTheme: "",
        importedTheme: null,
        customVars: {},
        schoolBrand: null,
        preferPersonalAccent: false,
      };
      applyAppearance(appearance);
      const lightActive = document.documentElement.style.getPropertyValue("--sidebar-active");
      expect(lightActive).not.toBe("");
      applyAppearance({ ...appearance, mode: "dark", density: "compact" });
      view.rerenderSidebar();
      expect(document.documentElement.classList.contains("dark")).toBe(true);
      expect(document.documentElement.dataset.density).toBe("compact");
      expect(linksTo("/alunos")).toEqual(destinations);
      expect(screen.getByRole("button", { name: "Voltar ao módulo" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Voltar ao módulo" }));
      expect(linksTo("/faturas")).toHaveLength(1);
      expect(linksTo("/alunos")).toHaveLength(0);
    },
  );
  it("conserva a escolha de áreas num rerender com a mesma pesquisa", () => {
    currentPathname = "/faturas";
    const view = renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Todas as áreas" }));
    currentSearch = { ...currentSearch };
    view.rerenderSidebar();
    expect(screen.getByRole("button", { name: "Voltar ao módulo" })).toBeTruthy();
  });
  it("regressa ao contexto ao mudar de escola", () => {
    currentPathname = "/faturas";
    const view = renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Todas as áreas" }));
    (contas.Administrador as { schoolId: string }).schoolId = "school-b";
    view.rerenderSidebar();
    expect(screen.getByRole("button", { name: "Todas as áreas" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Secretaria" })).toBeNull();
  });
  it("retira as áreas administrativas ao mudar para o perfil de aluno", () => {
    currentPathname = "/portal";
    const view = renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Secretaria" }));
    papel = "Aluno";
    view.rerenderSidebar();
    expect(screen.queryByRole("button", { name: "Secretaria" })).toBeNull();
    expect(linksTo("/acessos")).toHaveLength(0);
  });
  it.each(["Administrador", "Aluno"])(
    "Configurações da Escola respeita o perfil %s",
    async (role) => {
      papel = role;
      const view = renderSidebar();
      const trigger = view.container.querySelector<HTMLButtonElement>(
        "[data-sidebar-header-account]",
      )!;
      fireEvent.keyDown(trigger, { key: "Enter" });
      await screen.findByRole("menu");
      const settings = screen.queryByRole("menuitem", { name: "Configurações da Escola" });
      expect(Boolean(settings)).toBe(role === "Administrador");
    },
  );
});

describe("AppSidebar — menu da entidade (Context Engine, opção A)", () => {
  const TURMA_A = "11111111-1111-4111-8111-111111111111";
  const TURMA_B = "22222222-2222-4222-8222-222222222222";
  const MATEMATICA = "33333333-3333-4333-8333-333333333333";
  const tree = () => [
    {
      id: "grade:10ª classe",
      label: "10ª Classe",
      kind: "grade" as const,
      classTeacher: false,
      classes: [
        {
          id: TURMA_A,
          name: "Turma A",
          classTeacher: false,
          subjects: [{ id: MATEMATICA, name: "Matemática" }],
        },
      ],
    },
  ];

  it("abre a disciplina: voltar, cabeçalho e só as funções dessa turma e disciplina", () => {
    academic.tree = tree();
    currentPathname = "/pedagogica";
    currentSearch = { tab: "notas", turma: TURMA_A, disciplina: MATEMATICA, pauta: "1" };
    renderSidebar();

    const section = screen.getByRole("region", { name: "Disciplina: Matemática" });
    expect(section.textContent).toContain("Disciplina · Matemática");
    expect(section.textContent).toContain("Turma A");

    const back = linksTo("/pedagogica").find((link) => link.label.startsWith("Voltar"));
    expect(back?.search).toEqual({ tab: "notas" });

    const notas = linksTo("/pedagogica").find((link) => link.label === "Avaliações e notas");
    expect(notas?.search).toEqual({
      tab: "notas",
      turma: TURMA_A,
      disciplina: MATEMATICA,
      pauta: "1",
    });
    expect(linksTo("/planos-aula")[0]?.search).toEqual({
      turma: TURMA_A,
      disciplina: MATEMATICA,
    });
    // A função actual fica marcada.
    const active = screen
      .getAllByRole("link")
      .find((link) => link.getAttribute("aria-current") === "page");
    expect(active?.textContent).toContain("Avaliações e notas");
    // Nenhum destino de outra turma, e o catálogo do módulo sai até «Voltar».
    expect(document.body.innerHTML).not.toContain(TURMA_B);
    expect(linksTo("/calendario")).toHaveLength(0);
  });

  it("uma turma que o servidor não devolveu não muda o menu", () => {
    academic.tree = tree();
    currentPathname = "/pedagogica";
    currentSearch = { tab: "notas", turma: TURMA_B, disciplina: MATEMATICA };
    renderSidebar();
    expect(screen.queryByRole("region", { name: /Disciplina|Turma/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Voltar a/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Todas as áreas" })).toBeTruthy();
  });

  it("IDs que não são UUID não abrem contexto", () => {
    academic.tree = tree();
    currentPathname = "/pedagogica";
    currentSearch = { tab: "notas", turma: "turma-a" };
    renderSidebar();
    expect(screen.queryByRole("region", { name: /Turma/ })).toBeNull();
  });

  it("só turma abre o contexto da turma", () => {
    academic.tree = tree();
    currentPathname = "/planos-aula";
    currentSearch = { turma: TURMA_A };
    renderSidebar();
    expect(screen.getByRole("region", { name: "Turma: Turma A" })).toBeTruthy();
    expect(linksTo("/planos-aula").some((link) => link.label === "Planos de aula")).toBe(true);
  });

  it("na ficha da turma: voltar à lista de turmas e «Alunos da turma» marcado", () => {
    academic.tree = tree();
    currentPathname = `/pedagogica/turmas/${TURMA_A}`;
    currentSearch = { secao: "alunos" };
    renderSidebar();
    const section = screen.getByRole("region", { name: "Turma: Turma A" });
    const back = linksTo("/pedagogica").find((link) => link.label.startsWith("Voltar"));
    expect(back?.search).toEqual({ tab: "turmas" });
    expect(linksTo(`/pedagogica/turmas/${TURMA_A}`)).toEqual([
      { label: "Ficha da turma", search: {} },
      { label: "Alunos da turma", search: { secao: "alunos" } },
    ]);
    const active = within(section)
      .getAllByRole("link")
      .find((link) => link.getAttribute("aria-current") === "page");
    expect(active?.textContent).toContain("Alunos da turma");
  });

  it("a ficha de uma turma que o servidor não devolveu não muda o menu", () => {
    academic.tree = tree();
    currentPathname = `/pedagogica/turmas/${TURMA_B}`;
    renderSidebar();
    expect(screen.queryByRole("region", { name: /^Turma/ })).toBeNull();
  });

  it("nos arquivos da turma, o menu da turma fica com os materiais marcados", () => {
    academic.tree = tree();
    currentPathname = "/arquivos";
    currentSearch = { turma: TURMA_A };
    renderSidebar();

    const section = screen.getByRole("region", { name: "Turma: Turma A" });
    const active = within(section)
      .getAllByRole("link")
      .find((link) => link.getAttribute("aria-current") === "page");
    expect(active?.textContent).toContain("Materiais e ficheiros");
    expect(
      linksTo("/arquivos").find((link) => link.label === "Materiais e ficheiros")?.search,
    ).toEqual({ turma: TURMA_A });
    // Só com a turma, as presenças são as aulas do dia dessa turma.
    expect(linksTo("/pedagogica").find((link) => link.label === "Presenças")?.search).toEqual({
      tab: "presencas",
      turma: TURMA_A,
    });
  });

  it("nos trabalhos da disciplina: «Trabalhos» marcado e voltar à lista de turmas", () => {
    academic.tree = tree();
    currentPathname = "/pedagogica/trabalhos";
    currentSearch = { turma: TURMA_A, disciplina: MATEMATICA };
    renderSidebar();
    const section = screen.getByRole("region", { name: "Disciplina: Matemática" });
    const active = within(section)
      .getAllByRole("link")
      .find((link) => link.getAttribute("aria-current") === "page");
    expect(active?.textContent).toContain("Trabalhos");
    expect(linksTo("/pedagogica/trabalhos")).toEqual([
      { label: "Trabalhos", search: { turma: TURMA_A, disciplina: MATEMATICA } },
    ]);
    const back = linksTo("/pedagogica").find((link) => link.label.startsWith("Voltar"));
    expect(back?.search).toEqual({ tab: "turmas" });
  });

  it("na disciplina com professor atribuído, «Professor responsável» abre o perfil dele", () => {
    const PROF = "66666666-6666-4666-8666-666666666666";
    academic.tree = tree().map((branch) => ({
      ...branch,
      classes: branch.classes.map((turma) => ({
        ...turma,
        subjects: [{ id: MATEMATICA, name: "Matemática", teacherId: PROF }],
      })),
    }));
    currentPathname = "/pedagogica";
    currentSearch = { tab: "notas", turma: TURMA_A, disciplina: MATEMATICA };
    renderSidebar();
    expect(linksTo(`/professores/${PROF}`)).toEqual([
      { label: "Professor responsável", search: {} },
    ]);
  });

  it("sem professor atribuído, a disciplina não oferece «Professor responsável»", () => {
    academic.tree = tree();
    currentPathname = "/pedagogica";
    currentSearch = { tab: "notas", turma: TURMA_A, disciplina: MATEMATICA };
    renderSidebar();
    expect(screen.queryByRole("link", { name: "Professor responsável" })).toBeNull();
  });

  it("recolhida, mantém os destinos com nome acessível", () => {
    academic.tree = tree();
    currentPathname = "/pedagogica";
    currentSearch = { tab: "notas", turma: TURMA_A, disciplina: MATEMATICA };
    renderSidebar(true);
    const section = screen.getByRole("region", { name: "Disciplina: Matemática" });
    expect(section.textContent).toContain("Avaliações e notas");
    expect(section.textContent).toContain("Presenças");
  });

  it("o aluno não recebe o menu de gestão da disciplina", () => {
    papel = "Aluno";
    academic.tree = tree();
    currentPathname = "/pedagogica";
    currentSearch = { tab: "notas", turma: TURMA_A, disciplina: MATEMATICA };
    renderSidebar();
    expect(screen.queryByRole("region", { name: /Disciplina|Turma/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Voltar a/ })).toBeNull();
  });
});

describe("AppSidebar — menu do aluno (Context Engine, piloto Aluno)", () => {
  const ANA = "44444444-4444-4444-8444-444444444444";
  const OUTRO = "55555555-5555-4555-8555-555555555555";
  const ana = { type: "student" as const, id: ANA, label: "Ana Silva", schoolId: "school-a" };

  it("abre a ficha: voltar à lista, o aluno e as secções, com a actual marcada", () => {
    papel = "Secretaria";
    focus.entity = ana;
    currentPathname = `/alunos/${ANA}`;
    currentSearch = { secao: "financeiro" };
    renderSidebar();

    const section = screen.getByRole("region", { name: "Aluno: Ana Silva" });
    expect(section.textContent).toContain("Aluno · Ana Silva");
    expect(linksTo("/alunos").find((link) => link.label.startsWith("Voltar"))).toBeTruthy();
    expect(linksTo(`/alunos/${ANA}`)).toEqual([
      { label: "Ficha completa", search: {} },
      { label: "Identificação", search: { secao: "identificacao" } },
      { label: "Académico", search: { secao: "academico" } },
      { label: "Financeiro", search: { secao: "financeiro" } },
      { label: "Documentos", search: { secao: "documentos" } },
      { label: "Histórico", search: { secao: "historico" } },
    ]);
    const active = screen
      .getAllByRole("link")
      .find((link) => link.getAttribute("aria-current") === "page");
    expect(active?.textContent).toContain("Financeiro");
    // Não pede turmas nem disciplinas: o aluno vem da ficha que a página leu.
    expect(document.body.innerHTML).not.toContain(OUTRO);
  });

  it("sem secção, a ficha completa fica marcada", () => {
    papel = "Secretaria";
    focus.entity = ana;
    currentPathname = `/alunos/${ANA}`;
    renderSidebar();
    const active = screen
      .getAllByRole("link")
      .find((link) => link.getAttribute("aria-current") === "page");
    expect(active?.textContent).toContain("Ficha completa");
  });

  it("enquanto a página não leu o aluno do servidor, o id da URL não muda o menu", () => {
    papel = "Secretaria";
    currentPathname = `/alunos/${ANA}`;
    renderSidebar();
    expect(screen.queryByRole("region", { name: /^Aluno/ })).toBeNull();
  });

  it("outro aluno em foco, ou de outra escola, não confirma o id da URL", () => {
    papel = "Secretaria";
    currentPathname = `/alunos/${ANA}`;
    focus.entity = { ...ana, id: OUTRO };
    const first = renderSidebar();
    expect(screen.queryByRole("region", { name: /^Aluno/ })).toBeNull();
    first.unmount();

    focus.entity = { ...ana, schoolId: "school-b" };
    renderSidebar();
    expect(screen.queryByRole("region", { name: /^Aluno/ })).toBeNull();
  });

  it("o encarregado não recebe o menu de gestão do aluno", () => {
    papel = "Encarregado";
    focus.entity = ana;
    currentPathname = `/alunos/${ANA}`;
    renderSidebar();
    expect(screen.queryByRole("region", { name: /^Aluno/ })).toBeNull();
  });
});

describe("AppSidebar — menu do professor (Context Engine)", () => {
  const JOAO = "66666666-6666-4666-8666-666666666666";
  const joao = { type: "teacher" as const, id: JOAO, label: "João Mendes", schoolId: "school-a" };

  it("no perfil: voltar a Pessoas, o professor, o perfil marcado, o horário e as presenças", () => {
    papel = "Secretaria";
    focus.entity = joao;
    currentPathname = `/professores/${JOAO}`;
    renderSidebar();

    const section = screen.getByRole("region", { name: "Professor: João Mendes" });
    expect(section.textContent).toContain("Professor · João Mendes");
    expect(linksTo("/pessoas").find((link) => link.label.startsWith("Voltar"))).toBeTruthy();
    expect(linksTo(`/professores/${JOAO}`)).toEqual([{ label: "Perfil e turmas", search: {} }]);
    expect(
      within(section)
        .getAllByRole("link")
        .filter((el) => el.getAttribute("data-to") === "/pedagogica")
        .map((el) => JSON.parse(el.getAttribute("data-search") ?? "null")),
    ).toEqual([
      { tab: "horarios", professor: JOAO },
      { tab: "presencas", professor: JOAO },
    ]);
    const active = within(section)
      .getAllByRole("link")
      .find((link) => link.getAttribute("aria-current") === "page");
    expect(active?.textContent).toContain("Perfil e turmas");
  });

  it("no horário, o professor da URL confirma-se na lista da escola e fica marcado", () => {
    papel = "Secretaria";
    teacherList.rows = [{ id: JOAO, full_name: "João Mendes" }];
    currentPathname = "/pedagogica";
    currentSearch = { tab: "horarios", professor: JOAO };
    renderSidebar();
    const section = screen.getByRole("region", { name: "Professor: João Mendes" });
    const active = within(section)
      .getAllByRole("link")
      .find((link) => link.getAttribute("aria-current") === "page");
    expect(active?.textContent).toContain("Horário semanal");
  });

  it("nos planos de aula do professor, o menu fica com os planos marcados", () => {
    papel = "Secretaria";
    teacherList.rows = [{ id: JOAO, full_name: "João Mendes" }];
    currentPathname = "/planos-aula";
    currentSearch = { professor: JOAO };
    renderSidebar();
    const section = screen.getByRole("region", { name: "Professor: João Mendes" });
    const active = within(section)
      .getAllByRole("link")
      .find((link) => link.getAttribute("aria-current") === "page");
    expect(active?.textContent).toContain("Planos de aula");
  });

  it("um professor que a escola não devolveu não muda o menu", () => {
    papel = "Secretaria";
    teacherList.rows = [{ id: "77777777-7777-4777-8777-777777777777", full_name: "Outro" }];
    currentPathname = "/pedagogica";
    currentSearch = { tab: "horarios", professor: JOAO };
    renderSidebar();
    expect(screen.queryByRole("region", { name: /^Professor/ })).toBeNull();
  });

  it("nos trabalhos do professor: «Trabalhos criados» marcado e voltar à área académica", () => {
    papel = "Secretaria";
    teacherList.rows = [{ id: JOAO, full_name: "João Mendes" }];
    currentPathname = "/pedagogica/trabalhos";
    currentSearch = { professor: JOAO };
    renderSidebar();
    const section = screen.getByRole("region", { name: "Professor: João Mendes" });
    const active = within(section)
      .getAllByRole("link")
      .find((link) => link.getAttribute("aria-current") === "page");
    expect(active?.textContent).toContain("Trabalhos criados");
    const back = linksTo("/pedagogica").find((link) => link.label.startsWith("Voltar"));
    expect(back).toBeTruthy();
    expect(back?.search ?? null).toBeNull();
  });

  it("o encarregado não recebe o menu do professor", () => {
    papel = "Encarregado";
    focus.entity = joao;
    currentPathname = `/professores/${JOAO}`;
    renderSidebar();
    expect(screen.queryByRole("region", { name: /^Professor/ })).toBeNull();
  });
});
