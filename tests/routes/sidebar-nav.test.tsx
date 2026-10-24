// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  currentPathname = "/pedagogica";
  currentSearch = {};
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
    expect(screen.getByRole("navigation", { name: "Navegação principal" }).querySelector(".nav-sub-list")).toBeNull();
    fireEvent.click(secretaria);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
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
    expect(screen.getByRole("menuitem", { name: /Instituições/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Configurações da Escola/ })).toBeTruthy();
    fireEvent.keyDown(menu, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
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
