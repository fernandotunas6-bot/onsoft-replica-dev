// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentType, ComponentPropsWithRef, ReactNode } from "react";
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
});

describe("AppSidebar — parâmetros de pesquisa nos links", () => {
  it("leva o ?tab= de cada sub-item de Área Pedagógica para o link", () => {
    // O menu guarda os abertos em localStorage; abrir "Área Pedagógica" à mão.
    localStorage.setItem("siga:sidebar-open-menus", JSON.stringify(["Área Pedagógica"]));

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

describe("AppSidebar — contexto", () => {
  it("mostra apenas o módulo activo e permite consultar todas as áreas", () => {
    currentPathname = "/faturas";
    renderSidebar();
    expect(linksTo("/faturas")).toHaveLength(1);
    expect(linksTo("/alunos")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Todas as áreas" }));
    expect(screen.getByRole("button", { name: "Gestão de Alunos" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Gestão de Alunos" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Gestão de Alunos" }));
    expect(linksTo("/alunos").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Caixa e Pagamentos" }));
    expect(linksTo("/alunos")).toHaveLength(0);
    expect(linksTo("/faturas")).toHaveLength(1);
  });
});

describe("AppSidebar — teclado na barra recolhida", () => {
  it("abre os destinos num portal e fecha com Escape", async () => {
    currentPathname = "/portal";
    const { container } = renderSidebar(true);
    const trigger = screen.getByRole("button", { name: "Gestão de Alunos" });
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
});

describe("AppSidebar — contexto e perfil", () => {
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
    expect(screen.queryByRole("button", { name: "Gestão de Alunos" })).toBeNull();
  });
  it("retira as áreas administrativas ao mudar para o perfil de aluno", () => {
    currentPathname = "/portal";
    const view = renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Gestão de Alunos" }));
    papel = "Aluno";
    view.rerenderSidebar();
    expect(screen.queryByRole("button", { name: "Gestão de Alunos" })).toBeNull();
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
