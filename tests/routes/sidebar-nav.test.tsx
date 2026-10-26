// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentType, ComponentPropsWithRef, ReactNode } from "react";
import { applyAppearance, type AppearanceState } from "@/lib/appearance";
import { navMemoryOwner, touchRecentNav } from "@/lib/navigation-memory";
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
for (const role of ["Secretaria", "Encarregado", "Tesouraria"]) {
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
    type: "student" | "teacher" | "invoice" | "employee" | "file" | "task" | "folder";
    id: string;
    label: string;
    schoolId: string;
    relations?: {
      class?: string;
      student?: string;
      teacher?: string;
      employee?: string;
      "subject-offering"?: string;
      folder?: string;
    };
    parent?: { type: "subject-offering"; id: string };
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

function leaveWithPointer(element: Element, pointerType: string) {
  const event = new window.Event("pointerout", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  Object.defineProperty(event, "relatedTarget", { value: document.body });
  fireEvent(element, event);
}

describe("AppSidebar — acordeão de subfunções e menu da escola", () => {
  it("expande as subfunções dentro da própria lista, sem abrir diálogo", async () => {
    currentPathname = "/portal";
    renderSidebar();
    const secretaria = screen.getByRole("button", { name: "Secretaria" });
    expect(secretaria.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(secretaria);
    expect(secretaria.getAttribute("aria-expanded")).toBe("true");
    // Para baixo, dentro da navegação principal — nunca um diálogo/popover à parte.
    expect(screen.queryByRole("dialog")).toBeNull();
    const list = screen
      .getByRole("navigation", { name: "Navegação principal" })
      .querySelector(".nav-sub-list");
    expect(list).toBeTruthy();
    expect(list?.querySelector("a[data-to='/alunos']")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Subfunções de Secretaria" })).toBeTruthy();
    fireEvent.click(secretaria);
    expect(secretaria.getAttribute("aria-expanded")).toBe("false");
    expect(
      screen
        .getByRole("navigation", { name: "Navegação principal" })
        .querySelector(".nav-sub-list"),
    ).toBeNull();
  });

  it("mantém só uma secção aberta de cada vez, bem organizada", async () => {
    currentPathname = "/portal";
    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Secretaria" }));
    expect(linksTo("/alunos").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Financeiro" }));
    expect(linksTo("/alunos")).toHaveLength(0);
    expect(linksTo("/faturas").length).toBeGreaterThan(0);
  });

  it("fecha o acordeão quando a navegação muda de contexto", () => {
    currentPathname = "/portal";
    const view = renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Secretaria" }));
    expect(linksTo("/alunos").length).toBeGreaterThan(0);
    currentPathname = "/alunos";
    view.rerenderSidebar();
    // A navegação para dentro do módulo troca para a vista contextual — o
    // seletor de áreas, e com ele o acordeão, deixa de existir.
    expect(screen.queryByRole("button", { name: "Secretaria" })).toBeNull();
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

  it("a subfunção aponta para o destino certo, com o search preservado", () => {
    currentPathname = "/portal";
    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Secretaria" }));
    const matricular = screen.getByRole("link", { name: "Matricular Aluno" });
    expect(matricular.getAttribute("data-to")).toBe("/alunos");
    expect(matricular.getAttribute("data-search")).toContain("matricular");
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
  it("com rato, o submenu abre ao apontar e fica aberto ao passar para ele", async () => {
    currentPathname = "/portal";
    renderSidebar(true);
    const trigger = screen.getByRole("button", { name: "Secretaria" });
    hoverWithMouse(trigger);
    const menu = await screen.findByRole("menu");
    // Do ícone para o submenu: o atraso de fecho deixa o cursor chegar lá.
    leaveWithPointer(trigger, "mouse");
    hoverWithMouse(menu);
    await new Promise((resolve) => setTimeout(resolve, 260));
    expect(screen.getByRole("menu")).toBe(menu);
    leaveWithPointer(menu, "mouse");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("ao toque não simula hover: só abre com o toque/clique", async () => {
    currentPathname = "/portal";
    renderSidebar(true);
    const trigger = screen.getByRole("button", { name: "Secretaria" });
    const event = new window.Event("pointerover", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "pointerType", { value: "touch" });
    fireEvent(trigger, event);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("menu")).toBeNull();
  });

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

  it("de volta à área sem turma, oferece continuar na disciplina onde estava", () => {
    academic.tree = tree();
    touchRecentNav(navMemoryOwner("admin@escola.ao", "school-a"), {
      path: "/pedagogica",
      label: "Pedagógica",
      search: `tab=notas&turma=${TURMA_A}&disciplina=${MATEMATICA}`,
    });
    currentPathname = "/pedagogica";
    currentSearch = { tab: "turmas" };
    renderSidebar();
    const resume = screen.getByRole("link", { name: "Continuar em Turma A · Matemática" });
    expect(JSON.parse(resume.getAttribute("data-search") ?? "null")).toEqual({
      tab: "notas",
      turma: TURMA_A,
      disciplina: MATEMATICA,
    });
  });

  it("não oferece continuar numa turma que o servidor já não devolve", () => {
    academic.tree = tree();
    touchRecentNav(navMemoryOwner("admin@escola.ao", "school-a"), {
      path: "/pedagogica",
      label: "Pedagógica",
      search: `tab=notas&turma=${TURMA_B}`,
    });
    currentPathname = "/pedagogica";
    currentSearch = { tab: "turmas" };
    renderSidebar();
    expect(screen.queryByRole("link", { name: /^Continuar em/ })).toBeNull();
  });

  it("os recentes de outra escola não se oferecem", () => {
    academic.tree = tree();
    touchRecentNav(navMemoryOwner("admin@escola.ao", "school-b"), {
      path: "/pedagogica",
      label: "Pedagógica",
      search: `tab=notas&turma=${TURMA_A}`,
    });
    currentPathname = "/pedagogica";
    currentSearch = { tab: "turmas" };
    renderSidebar();
    expect(screen.queryByRole("link", { name: /^Continuar em/ })).toBeNull();
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

  it("com a turma da matrícula lida pela ficha, o menu leva à turma do aluno", () => {
    const TURMA = "11111111-1111-4111-8111-111111111111";
    papel = "Secretaria";
    focus.entity = { ...ana, relations: { class: TURMA } };
    currentPathname = `/alunos/${ANA}`;
    renderSidebar();
    const section = screen.getByRole("region", { name: "Aluno: Ana Silva" });
    expect(section.textContent).toContain("Turma do aluno");
    expect(linksTo(`/pedagogica/turmas/${TURMA}`)).toEqual([
      { label: "Ficha da turma", search: {} },
    ]);
    expect(linksTo("/pedagogica/trabalhos")).toEqual([
      { label: "Trabalhos da turma", search: { turma: TURMA } },
    ]);
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

describe("AppSidebar — menu da fatura (Context Engine, contexto financeiro)", () => {
  const FATURA = "66666666-6666-4666-8666-666666666666";
  const ANA = "44444444-4444-4444-8444-444444444444";
  const fatura = {
    type: "invoice" as const,
    id: FATURA,
    label: "FT-2026/0311",
    schoolId: "school-a",
    relations: { student: ANA },
  };

  it("a tesouraria abre a fatura: voltar às faturas e a fatura, sem a ficha do aluno", () => {
    papel = "Tesouraria";
    focus.entity = fatura;
    currentPathname = `/faturas/${FATURA}`;
    renderSidebar();
    const section = screen.getByRole("region", { name: "Fatura: FT-2026/0311" });
    expect(section.textContent).toContain("Fatura · FT-2026/0311");
    expect(linksTo("/faturas").map((link) => link.label)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^Voltar/), "Todas as faturas"]),
    );
    expect(linksTo(`/faturas/${FATURA}`)).toEqual([{ label: "Detalhes e recibos", search: {} }]);
    // A tesouraria não abre fichas de alunos (`/alunos` não é dela): o menu não as oferece,
    // mas leva às outras faturas do aluno, onde se recebem.
    expect(linksTo(`/alunos/${ANA}`)).toEqual([]);
    expect(linksTo("/faturas")).toContainEqual({
      label: "Faturas do aluno",
      search: { aluno: ANA },
    });
    const active = screen
      .getAllByRole("link")
      .find((link) => link.getAttribute("aria-current") === "page");
    expect(active?.textContent).toContain("Detalhes e recibos");
  });

  it("a administração vai da fatura ao financeiro e à ficha do aluno dela", () => {
    papel = "Administrador";
    focus.entity = fatura;
    currentPathname = `/faturas/${FATURA}`;
    renderSidebar();
    const section = screen.getByRole("region", { name: "Fatura: FT-2026/0311" });
    expect(section.textContent).toContain("Aluno da fatura");
    expect(linksTo(`/alunos/${ANA}`)).toEqual([
      { label: "Financeiro do aluno", search: { secao: "financeiro" } },
      { label: "Ficha do aluno", search: {} },
    ]);
  });

  it("sem aluno devolvido com a fatura, não há grupo do aluno", () => {
    papel = "Administrador";
    focus.entity = { ...fatura, relations: {} };
    currentPathname = `/faturas/${FATURA}`;
    renderSidebar();
    expect(screen.getByRole("region", { name: "Fatura: FT-2026/0311" })).toBeDefined();
    expect(linksTo(`/alunos/${ANA}`)).toEqual([]);
  });

  it("antes de a página ler a fatura, ou com uma fatura de outra escola, o menu não muda", () => {
    papel = "Tesouraria";
    currentPathname = `/faturas/${FATURA}`;
    const first = renderSidebar();
    expect(screen.queryByRole("region", { name: /^Fatura/ })).toBeNull();
    first.unmount();
    focus.entity = { ...fatura, schoolId: "school-b" };
    renderSidebar();
    expect(screen.queryByRole("region", { name: /^Fatura/ })).toBeNull();
  });

  it("quem não abre as faturas não recebe o menu da fatura", () => {
    for (const role of ["Secretaria", "Encarregado"]) {
      papel = role;
      focus.entity = fatura;
      currentPathname = `/faturas/${FATURA}`;
      const view = renderSidebar();
      expect(screen.queryByRole("region", { name: /^Fatura/ })).toBeNull();
      view.unmount();
    }
  });
});

describe("AppSidebar — menu do ficheiro (Context Engine, Documentos e Arquivos)", () => {
  const FICHEIRO = "77777777-7777-4777-8777-777777777777";
  const TURMA = "11111111-1111-4111-8111-111111111111";
  const ANA = "44444444-4444-4444-8444-444444444444";
  const ficheiro = {
    type: "file" as const,
    id: FICHEIRO,
    label: "Certidão de nascimento",
    schoolId: "school-a",
    relations: { class: TURMA, student: ANA },
  };

  it("a secretaria vai do ficheiro à pasta da turma e aos documentos do aluno", () => {
    papel = "Secretaria";
    focus.entity = ficheiro;
    currentPathname = `/arquivos/${FICHEIRO}`;
    renderSidebar();
    const section = screen.getByRole("region", { name: "Ficheiro: Certidão de nascimento" });
    expect(section.textContent).toContain("Ficheiro · Certidão de nascimento");
    expect(linksTo(`/arquivos/${FICHEIRO}`)).toEqual([
      { label: "Detalhes e auditoria", search: {} },
    ]);
    expect(linksTo("/arquivos")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: expect.stringMatching(/^Voltar/) }),
        { label: "Todos os arquivos", search: {} },
        { label: "Pasta da turma", search: { turma: TURMA } },
      ]),
    );
    expect(linksTo(`/alunos/${ANA}`)).toEqual([
      { label: "Documentos do aluno", search: { secao: "documentos" } },
      { label: "Ficha do aluno", search: {} },
    ]);
  });

  it("a tesouraria não abre fichas de alunos: o menu não as oferece", () => {
    papel = "Tesouraria";
    focus.entity = ficheiro;
    currentPathname = `/arquivos/${FICHEIRO}`;
    renderSidebar();
    expect(screen.getByRole("region", { name: "Ficheiro: Certidão de nascimento" })).toBeDefined();
    expect(linksTo(`/alunos/${ANA}`)).toEqual([]);
  });

  it("sem ligações devolvidas com o ficheiro, só o ficheiro e os arquivos", () => {
    papel = "Secretaria";
    focus.entity = { ...ficheiro, relations: {} };
    currentPathname = `/arquivos/${FICHEIRO}`;
    renderSidebar();
    expect(linksTo("/arquivos").map((link) => link.label)).not.toContain("Pasta da turma");
    expect(linksTo(`/alunos/${ANA}`)).toEqual([]);
  });

  it("antes de a página ler o ficheiro, ou com um de outra escola, o menu não muda", () => {
    papel = "Secretaria";
    currentPathname = `/arquivos/${FICHEIRO}`;
    const first = renderSidebar();
    expect(screen.queryByRole("region", { name: /^Ficheiro/ })).toBeNull();
    first.unmount();
    focus.entity = { ...ficheiro, schoolId: "school-b" };
    renderSidebar();
    expect(screen.queryByRole("region", { name: /^Ficheiro/ })).toBeNull();
  });

  it("quem não abre os Arquivos não recebe o menu do ficheiro", () => {
    papel = "Encarregado";
    focus.entity = ficheiro;
    currentPathname = `/arquivos/${FICHEIRO}`;
    renderSidebar();
    expect(screen.queryByRole("region", { name: /^Ficheiro/ })).toBeNull();
  });
});

describe("AppSidebar — menu da pasta (Context Engine, Documentos e Arquivos)", () => {
  const PASTA = "99999999-9999-4999-8999-999999999999";
  const ACIMA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const pasta = {
    type: "folder" as const,
    id: PASTA,
    label: "Provas 2026",
    schoolId: "school-a",
    relations: { folder: ACIMA },
  };

  it("a pasta aberta pela URL: conteúdo, pasta acima e todos os arquivos", () => {
    papel = "Secretaria";
    focus.entity = pasta;
    currentPathname = "/arquivos";
    currentSearch = { pasta: PASTA };
    renderSidebar();
    const section = screen.getByRole("region", { name: "Pasta: Provas 2026" });
    expect(section.textContent).toContain("Pasta · Provas 2026");
    expect(linksTo("/arquivos")).toEqual([
      expect.objectContaining({ label: expect.stringMatching(/^Voltar/), search: null }),
      { label: "Conteúdo da pasta", search: { pasta: PASTA } },
      { label: "Pasta acima", search: { pasta: ACIMA } },
      { label: "Todos os arquivos", search: {} },
    ]);
    const active = screen
      .getAllByRole("link")
      .find((link) => link.getAttribute("aria-current") === "page");
    expect(active?.textContent).toContain("Conteúdo da pasta");
  });

  it("na raiz não há «Pasta acima»", () => {
    papel = "Secretaria";
    focus.entity = { ...pasta, relations: {} };
    currentPathname = "/arquivos";
    currentSearch = { pasta: PASTA };
    renderSidebar();
    expect(linksTo("/arquivos").map((link) => link.label)).not.toContain("Pasta acima");
  });

  it("uma pasta que o servidor não devolveu, ou de outra escola, não muda o menu", () => {
    papel = "Secretaria";
    currentPathname = "/arquivos";
    currentSearch = { pasta: PASTA };
    const first = renderSidebar();
    expect(screen.queryByRole("region", { name: /^Pasta/ })).toBeNull();
    first.unmount();
    focus.entity = { ...pasta, schoolId: "school-b" };
    renderSidebar();
    expect(screen.queryByRole("region", { name: /^Pasta/ })).toBeNull();
  });

  it("quem não abre os Arquivos não recebe o menu da pasta", () => {
    papel = "Encarregado";
    focus.entity = pasta;
    currentPathname = "/arquivos";
    currentSearch = { pasta: PASTA };
    renderSidebar();
    expect(screen.queryByRole("region", { name: /^Pasta/ })).toBeNull();
  });
});

describe("AppSidebar — menu do trabalho (Context Engine, §5.2)", () => {
  const TAREFA = "88888888-8888-4888-8888-888888888888";
  const TURMA = "11111111-1111-4111-8111-111111111111";
  const MATEMATICA = "33333333-3333-4333-8333-333333333333";
  const OFERTA = `${TURMA}:${MATEMATICA}`;
  const trabalho = {
    type: "task" as const,
    id: TAREFA,
    label: "Ficha 2",
    schoolId: "school-a",
    relations: { class: TURMA, "subject-offering": OFERTA },
    parent: { type: "subject-offering" as const, id: OFERTA },
  };
  const tree = () => [
    {
      id: "grade:10ª classe",
      label: "10ª Classe",
      kind: "grade" as const,
      classTeacher: false,
      classes: [
        {
          id: TURMA,
          name: "Turma A",
          classTeacher: false,
          subjects: [{ id: MATEMATICA, name: "Matemática" }],
        },
      ],
    },
  ];

  it("o trabalho fica debaixo da disciplina, com as entregas por estado", () => {
    academic.tree = tree();
    focus.entity = trabalho;
    currentPathname = `/pedagogica/tarefas/${TAREFA}`;
    currentSearch = { estado: "por-devolver" };
    renderSidebar();
    const section = screen.getByRole("region", { name: "Trabalho: Ficha 2" });
    expect(section.textContent).toContain("Trabalho · Ficha 2");
    // A turma e a disciplina vêm por cima, confirmadas pela árvore do servidor.
    expect(section.textContent).toContain("Turma A · Matemática");
    expect(linksTo(`/pedagogica/tarefas/${TAREFA}`)).toEqual([
      { label: "Entregas e correcção", search: {} },
      { label: "Por entregar", search: { estado: "por-entregar" } },
      { label: "Por devolver", search: { estado: "por-devolver" } },
      { label: "Devolvidas", search: { estado: "devolvidas" } },
    ]);
    const active = screen
      .getAllByRole("link")
      .find((link) => link.getAttribute("aria-current") === "page");
    expect(active?.textContent).toContain("Por devolver");
    expect(linksTo("/pedagogica/trabalhos")).toEqual([
      expect.objectContaining({
        label: expect.stringMatching(/^Voltar/),
        search: { turma: TURMA, disciplina: MATEMATICA },
      }),
      { label: "Trabalhos da disciplina", search: { turma: TURMA, disciplina: MATEMATICA } },
    ]);
    expect(linksTo("/pedagogica").map((link) => link.search)).toEqual(
      expect.arrayContaining([
        { tab: "notas", turma: TURMA, disciplina: MATEMATICA, pauta: "1" },
        { tab: "presencas", turma: TURMA, disciplina: MATEMATICA },
      ]),
    );
    expect(linksTo(`/pedagogica/turmas/${TURMA}`)).toEqual([
      { label: "Ficha da turma", search: {} },
    ]);
  });

  it("uma disciplina que a árvore não confirma não entra no cabeçalho", () => {
    academic.tree = [];
    focus.entity = trabalho;
    currentPathname = `/pedagogica/tarefas/${TAREFA}`;
    renderSidebar();
    const section = screen.getByRole("region", { name: "Trabalho: Ficha 2" });
    expect(section.textContent).not.toContain("Matemática");
  });

  it("antes de a página ler o trabalho, ou com um de outra escola, o menu não muda", () => {
    academic.tree = tree();
    currentPathname = `/pedagogica/tarefas/${TAREFA}`;
    const first = renderSidebar();
    expect(screen.queryByRole("region", { name: /^Trabalho/ })).toBeNull();
    first.unmount();
    focus.entity = { ...trabalho, schoolId: "school-b" };
    renderSidebar();
    expect(screen.queryByRole("region", { name: /^Trabalho/ })).toBeNull();
  });

  it("nunca a tesouraria nem ao encarregado", () => {
    for (const role of ["Tesouraria", "Encarregado"]) {
      papel = role;
      academic.tree = tree();
      focus.entity = trabalho;
      currentPathname = `/pedagogica/tarefas/${TAREFA}`;
      const view = renderSidebar();
      expect(screen.queryByRole("region", { name: /^Trabalho/ })).toBeNull();
      view.unmount();
    }
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

  it("com o vínculo de RH devolvido, a administração vai à ficha de RH; a secretaria não", () => {
    const VINCULO = "55555555-5555-4555-8555-555555555555";
    papel = "Administrador";
    focus.entity = { ...joao, relations: { employee: VINCULO } };
    currentPathname = `/professores/${JOAO}`;
    const view = renderSidebar();
    expect(linksTo(`/financeiro/rh/funcionarios/${VINCULO}`)).toEqual([
      { label: "Ficha de RH", search: {} },
    ]);
    view.unmount();
    // `/financeiro/rh` é só da Administração e da Tesouraria, pelo cargo.
    papel = "Secretaria";
    renderSidebar();
    expect(screen.getByRole("region", { name: "Professor: João Mendes" })).toBeDefined();
    expect(linksTo(`/financeiro/rh/funcionarios/${VINCULO}`)).toEqual([]);
  });

  it("o encarregado não recebe o menu do professor", () => {
    papel = "Encarregado";
    focus.entity = joao;
    currentPathname = `/professores/${JOAO}`;
    renderSidebar();
    expect(screen.queryByRole("region", { name: /^Professor/ })).toBeNull();
  });
});

describe("AppSidebar — menu do funcionário (Context Engine, contexto RH)", () => {
  const VINCULO = "55555555-5555-4555-8555-555555555555";
  const PROFESSOR = "66666666-6666-4666-8666-666666666666";
  const rosa = {
    type: "employee" as const,
    id: VINCULO,
    label: "Rosa Mateus",
    schoolId: "school-a",
    relations: { teacher: PROFESSOR },
  };

  it("a tesouraria abre a ficha: voltar aos funcionários, a ficha marcada e as páginas do RH", () => {
    papel = "Tesouraria";
    focus.entity = rosa;
    currentPathname = `/financeiro/rh/funcionarios/${VINCULO}`;
    renderSidebar();
    const section = screen.getByRole("region", { name: "Funcionário: Rosa Mateus" });
    expect(section.textContent).toContain("Funcionário · Rosa Mateus");
    expect(linksTo("/financeiro/rh/funcionarios").map((link) => link.label)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^Voltar/), "Todos os funcionários"]),
    );
    expect(linksTo(`/financeiro/rh/funcionarios/${VINCULO}`)).toEqual([
      { label: "Ficha do funcionário", search: {} },
    ]);
    for (const path of [
      "/financeiro/rh/faltas",
      "/financeiro/rh/folha",
      "/financeiro/rh/salarios",
    ]) {
      expect(linksTo(path), path).toHaveLength(1);
    }
    // A tesouraria não abre perfis de professores.
    expect(linksTo(`/professores/${PROFESSOR}`)).toEqual([]);
    const active = within(section)
      .getAllByRole("link")
      .find((link) => link.getAttribute("aria-current") === "page");
    expect(active?.textContent).toContain("Ficha do funcionário");
  });

  it("a administração vai da ficha ao perfil do professor da mesma pessoa", () => {
    papel = "Administrador";
    focus.entity = rosa;
    currentPathname = `/financeiro/rh/funcionarios/${VINCULO}`;
    renderSidebar();
    expect(linksTo(`/professores/${PROFESSOR}`)).toEqual([
      { label: "Perfil do professor", search: {} },
    ]);
  });

  it("antes de a página ler a ficha, ou com um vínculo de outra escola, o menu não muda", () => {
    papel = "Tesouraria";
    currentPathname = `/financeiro/rh/funcionarios/${VINCULO}`;
    const first = renderSidebar();
    expect(screen.queryByRole("region", { name: /^Funcionário/ })).toBeNull();
    first.unmount();
    focus.entity = { ...rosa, schoolId: "school-b" };
    renderSidebar();
    expect(screen.queryByRole("region", { name: /^Funcionário/ })).toBeNull();
  });

  it("quem não abre o RH não recebe o menu do funcionário", () => {
    for (const role of ["Secretaria", "Encarregado"]) {
      papel = role;
      focus.entity = rosa;
      currentPathname = `/financeiro/rh/funcionarios/${VINCULO}`;
      const view = renderSidebar();
      expect(screen.queryByRole("region", { name: /^Funcionário/ }), role).toBeNull();
      view.unmount();
    }
  });
});
