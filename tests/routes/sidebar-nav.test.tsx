// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentType, ReactNode } from "react";
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
  }: {
    children?: ReactNode;
    to?: string;
    search?: Record<string, unknown>;
  }) => (
    <a href="#" data-to={to} data-search={JSON.stringify(search ?? null)}>
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

let AppSidebar: ComponentType<Record<string, never>>;

beforeAll(async () => {
  AppSidebar = (await import("@/components/layout/AppSidebar"))
    .AppSidebar as unknown as ComponentType<Record<string, never>>;
}, 60_000);

function renderSidebar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <AppSidebar />
    </QueryClientProvider>,
  );
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
