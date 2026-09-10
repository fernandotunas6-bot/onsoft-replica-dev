// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";

/**
 * Regressão do crash da página de portfólio Alumni.
 *
 * O componente chamava `useMemo` DEPOIS de dois `return` condicionais (ecrã de
 * loading e "portal não activado"). No primeiro render corriam 5 Hooks e saía
 * cedo; quando os dados chegavam, o render seguinte corria 6. O React rebenta
 * com "Rendered more hooks than during the previous render" — de forma
 * determinística, sempre que a página acabava de carregar.
 *
 * Este teste faz exactamente essa transição loading → carregado. Nenhum dos
 * ~1100 testes existentes montava um componente, por isso o bug passou.
 */

vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/media-frame", () => ({
  MediaAvatar: () => <div data-testid="avatar" />,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}));

const getMyAlumniPortal = vi.fn();
const getMyAlumniPortfolio = vi.fn();
const getMyAlumniEducationHistory = vi.fn();

vi.mock("@/features/alumni/self-service", () => ({
  getMyAlumniPortal: () => getMyAlumniPortal(),
}));
vi.mock("@/features/alumni/portfolio", () => ({
  getMyAlumniPortfolio: () => getMyAlumniPortfolio(),
}));
vi.mock("@/features/alumni/education-history", () => ({
  getMyAlumniEducationHistory: () => getMyAlumniEducationHistory(),
}));

async function loadShowcaseComponent() {
  const mod = await import("@/routes/alumni.portal.portfolio.showcase");
  const route = mod.Route as unknown as { component: () => ReactElement };
  return route.component;
}

function renderWithQuery(Component: () => ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Component />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Portfólio Alumni — showcase", () => {
  it("sobrevive à transição loading → carregado (Rules of Hooks)", async () => {
    getMyAlumniPortal.mockResolvedValue({
      profile: { headline: "Engenheiro civil", current_role: "Estagiário" },
      person: { full_name: "Ana Domingos" },
    });
    getMyAlumniPortfolio.mockResolvedValue([
      {
        id: "1",
        visibility: "public",
        education_level: "primary",
        featured: false,
        title: "Projecto",
      },
    ]);
    getMyAlumniEducationHistory.mockResolvedValue([]);

    const Showcase = await loadShowcaseComponent();
    renderWithQuery(Showcase);

    // Primeiro render: ecrã de loading (early return, menos Hooks).
    expect(screen.getByText(/A preparar portfólio/i)).toBeDefined();

    // Render seguinte, já com dados: é aqui que a ordem dos Hooks mudava e o
    // React rebentava. Se voltar a acontecer, este waitFor falha.
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Ana Domingos" })).toBeDefined();
    });
  });

  it("mostra o aviso quando o portal não está activado", async () => {
    getMyAlumniPortal.mockResolvedValue(null);
    getMyAlumniPortfolio.mockResolvedValue([]);
    getMyAlumniEducationHistory.mockResolvedValue([]);

    const Showcase = await loadShowcaseComponent();
    renderWithQuery(Showcase);

    await waitFor(() => {
      expect(screen.getByText(/Portal Alumni ainda não está activado/i)).toBeDefined();
    });
  });
});
