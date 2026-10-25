// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentType, ComponentPropsWithRef, ReactNode } from "react";
import { applyAppearance, type AppearanceState } from "@/lib/appearance";
import type { AcademicNavBranch } from "@/lib/academic-nav";
import {
  EntityFocusProvider,
  useDeclareEntityFocus,
} from "@/features/intelligence/entity-focus-context";
import type { EntityFocus } from "@/features/intelligence/types";
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
let papel = "Administrador";

vi.mock("@/features/auth/use-current-account", () => ({
  useCurrentAccount: () => contas[papel] as never,
}));

// O modal de perfil e a árvore académica não são o objecto do teste e trazem
// as suas próprias queries.
vi.mock("@/components/auth/UserProfileModal", () => ({ UserProfileModal: () => null }));
vi.mock("@/components/layout/AcademicNavTree", () => ({ AcademicNavTree: () => null }));

// Turmas e disciplinas autorizadas que validam o contexto da sidebar; vazias por
// omissão. A árvore pertence sempre à escola A, como a leitura do servidor.
let arvoreAcademica: AcademicNavBranch[] = [];
vi.mock("@/features/academic/use-academic-nav-tree", () => ({
  useAcademicNavTree: () => ({ tree: arvoreAcademica, canRead: true, schoolId: "school-a" }),
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
  arvoreAcademica = [];
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

const TURMA_A = "11111111-1111-4111-8111-111111111111";
const TURMA_B = "22222222-2222-4222-8222-222222222222";
const MATEMATICA = "33333333-3333-4333-8333-333333333333";
const PORTUGUES = "44444444-4444-4444-8444-444444444444";

function duasTurmas(): AcademicNavBranch[] {
  return [
    {
      id: "course:ciências",
      label: "Ciências",
      kind: "course",
      classTeacher: false,
      classes: [
        {
          id: TURMA_A,
          name: "10.ª A",
          classTeacher: false,
          subjects: [{ id: MATEMATICA, name: "Matemática" }],
        },
        {
          id: TURMA_B,
          name: "11.ª B",
          classTeacher: false,
          subjects: [{ id: PORTUGUES, name: "Português" }],
        },
      ],
    },
  ];
}

function contextHeader(container: HTMLElement) {
  return container.querySelector("[data-context-header]")?.textContent ?? null;
}

describe("AppSidebar — contexto da turma e da disciplina", () => {
  it("abre o nível da disciplina validada, só com as suas entradas", () => {
    arvoreAcademica = duasTurmas();
    currentSearch = { tab: "notas", turma: TURMA_A, disciplina: MATEMATICA, pauta: "1" };
    const { container } = renderSidebar();
    expect(contextHeader(container)).toBe("Disciplina · Matemática10.ª A");
    const notas = screen.getByRole("link", { name: "Avaliações e notas" });
    expect(notas.getAttribute("aria-current")).toBe("page");
    expect(JSON.parse(notas.getAttribute("data-search") ?? "null")).toEqual({
      tab: "notas",
      turma: TURMA_A,
      disciplina: MATEMATICA,
      pauta: "1",
    });
    expect(screen.getByRole("link", { name: "Presenças" }).getAttribute("aria-current")).toBeNull();
    expect(linksTo("/planos-aula")).toEqual([
      { label: "Planos de aula", search: { turma: TURMA_A, disciplina: MATEMATICA } },
    ]);
    // Os separadores gerais da área ficam atrás do regresso, não somem.
    expect(linksTo("/pedagogica").map((link) => link.search?.["tab"])).toEqual([
      "notas",
      "presencas",
    ]);
  });

  it("cada «voltar» sobe um nível sem mudar de página", () => {
    arvoreAcademica = duasTurmas();
    currentSearch = { tab: "notas", turma: TURMA_A, disciplina: MATEMATICA, pauta: "1" };
    const { container } = renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Voltar para 10.ª A" }));
    expect(contextHeader(container)).toBe("Turma · 10.ª A");
    const pauta = screen.getByRole("link", { name: "Pauta da turma" });
    expect(JSON.parse(pauta.getAttribute("data-search") ?? "null")).toEqual({
      tab: "notas",
      turma: TURMA_A,
      pauta: "1",
    });
    // A página continua a da disciplina: nada fica activo no nível acima.
    expect(pauta.getAttribute("aria-current")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Voltar para / }));
    expect(container.querySelector("[data-context-level]")).toBeNull();
    expect(screen.getByRole("button", { name: "Todas as áreas" })).toBeTruthy();
    expect(linksTo("/pedagogica").map((link) => link.search?.["tab"])).toEqual([
      "turmas",
      "notas",
      "horarios",
      "chamada",
    ]);
  });

  it("volta ao nível da entidade depois de navegar", () => {
    arvoreAcademica = duasTurmas();
    currentSearch = { tab: "notas", turma: TURMA_A, disciplina: MATEMATICA, pauta: "1" };
    const view = renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Voltar para 10.ª A" }));
    currentSearch = { tab: "presencas", turma: TURMA_A, disciplina: MATEMATICA };
    view.rerenderSidebar();
    expect(contextHeader(view.container)).toBe("Disciplina · Matemática10.ª A");
    expect(screen.getByRole("link", { name: "Presenças" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("um id fora da árvore autorizada não cria contexto", () => {
    arvoreAcademica = duasTurmas();
    currentSearch = { tab: "notas", turma: "99999999-9999-4999-8999-999999999999", pauta: "1" };
    const { container } = renderSidebar();
    expect(container.querySelector("[data-context-level]")).toBeNull();
    expect(screen.getByRole("button", { name: "Todas as áreas" })).toBeTruthy();
  });

  it("não junta a disciplina de outra turma", () => {
    arvoreAcademica = duasTurmas();
    currentSearch = { tab: "notas", turma: TURMA_A, disciplina: PORTUGUES };
    const { container } = renderSidebar();
    expect(contextHeader(container)).toBe("Turma · 10.ª A");
    expect(screen.queryByText(/Português/)).toBeNull();
  });

  it("enquanto não há dados autorizados mantém a área como hoje", () => {
    currentSearch = { tab: "notas", turma: TURMA_A, disciplina: MATEMATICA };
    const { container } = renderSidebar();
    expect(container.querySelector("[data-context-level]")).toBeNull();
    expect(linksTo("/pedagogica").map((link) => link.search?.["tab"])).toEqual([
      "turmas",
      "notas",
      "horarios",
      "chamada",
    ]);
  });

  it("recusa a árvore de outra escola depois de mudar de escola", () => {
    arvoreAcademica = duasTurmas();
    currentSearch = { tab: "notas", turma: TURMA_A, disciplina: MATEMATICA };
    const view = renderSidebar();
    expect(view.container.querySelector("[data-context-level]")).not.toBeNull();
    (contas.Administrador as { schoolId: string }).schoolId = "school-b";
    view.rerenderSidebar();
    expect(view.container.querySelector("[data-context-level]")).toBeNull();
    expect(screen.queryByText(/Matemática/)).toBeNull();
  });

  it("a turma aberta num modal, sem estar na URL, não muda a sidebar", () => {
    // O TurmaProfileModal declara a turma em foco para o painel de relações.
    // A sidebar segue a URL: abrir e fechar o modal não a faz saltar de nível.
    arvoreAcademica = duasTurmas();
    currentSearch = { tab: "turmas" };
    const foco = {
      type: "class",
      id: TURMA_A,
      label: "10.ª A",
      schoolId: "school-a",
      data: {},
    } as unknown as EntityFocus;
    function ModalDaTurma() {
      useDeclareEntityFocus(foco);
      return null;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <EntityFocusProvider>
          <ModalDaTurma />
          <AppSidebar />
        </EntityFocusProvider>
      </QueryClientProvider>,
    );
    expect(container.querySelector("[data-context-level]")).toBeNull();
    expect(screen.getByRole("button", { name: "Todas as áreas" })).toBeTruthy();
  });

  it("o aluno fica com a sua barra, sem o menu de gestão da turma", () => {
    papel = "Aluno";
    arvoreAcademica = duasTurmas();
    currentSearch = { tab: "notas", turma: TURMA_A, disciplina: MATEMATICA, pauta: "1" };
    const { container } = renderSidebar();
    expect(container.querySelector("[data-context-level]")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Voltar para / })).toBeNull();
    expect(screen.queryByText(/Disciplina · /)).toBeNull();
  });

  it("na barra recolhida mostra ícones com nome acessível e sem cabeçalho", () => {
    arvoreAcademica = duasTurmas();
    currentSearch = { tab: "notas", turma: TURMA_A, disciplina: MATEMATICA, pauta: "1" };
    const { container } = renderSidebar(true);
    expect(container.querySelector("aside")?.className).toContain("w-[64px]");
    expect(contextHeader(container)).toBeNull();
    expect(screen.getByRole("button", { name: "Voltar para 10.ª A" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Avaliações e notas" })).toBeTruthy();
  });
});
