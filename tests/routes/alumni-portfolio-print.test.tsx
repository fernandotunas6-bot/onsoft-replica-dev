// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf } from "./_harness";

/**
 * Testes de montagem e render de `/alumni/portal/portfolio/print`.
 *
 * Valida:
 * 1. Transição de loading para carregado com o cabeçalho do perfil.
 * 2. Itens `visibility: "private"` nunca aparecem — nem em destaque nem
 *    na lista geral, é uma vista pública/imprimível.
 * 3. Um item `featured` aparece na secção "Trabalhos em destaque" e não
 *    é duplicado na secção "Portfólio" geral.
 * 4. Sem nenhum item público (só privados), mostra o aviso de portfólio
 *    vazio — não um "Portfólio" em branco silencioso.
 */

const getMyAlumniPortalMock = vi.fn();
const getMyAlumniPortfolioMock = vi.fn();

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());
vi.mock("@/components/ui/media-frame", async () => (await import("./_harness")).mediaFrameMock());

vi.mock("@/features/alumni/self-service", () => ({
  getMyAlumniPortal: () => getMyAlumniPortalMock(),
}));

vi.mock("@/features/alumni/portfolio", () => ({
  getMyAlumniPortfolio: () => getMyAlumniPortfolioMock(),
}));

function buildPortal() {
  return {
    profile: {
      headline: "Engenheira de Software",
      current_role: "Engenheira de Software",
      current_company: "TechAO",
      graduation_year: 2020,
      graduation_course: "Informática",
      city: "Luanda",
      province: "Luanda",
      country: "Angola",
      biography: null,
      skills: [],
    },
    person: { full_name: "Beatriz Ndongo", photo_url: null },
    experiences: [],
  };
}

function buildItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    item_type: "project",
    title: "Plataforma escolar",
    role: null,
    organization: null,
    summary: null,
    skills: [],
    external_url: null,
    image_url: null,
    document_requests: null,
    visibility: "alumni",
    featured: false,
    ...overrides,
  };
}

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/alumni.portal.portfolio.print");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/alumni/portal/portfolio/print", () => {
  it("mostra loading e depois o cabeçalho do perfil carregado", async () => {
    getMyAlumniPortalMock.mockResolvedValue(buildPortal());
    getMyAlumniPortfolioMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    expect(screen.getByText(/A preparar portfólio profissional/)).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Beatriz Ndongo")).toBeDefined();
    });
    expect(screen.getByText(/Conclusão 2020/)).toBeDefined();
  });

  it("nunca mostra itens com visibility 'private'", async () => {
    getMyAlumniPortalMock.mockResolvedValue(buildPortal());
    getMyAlumniPortfolioMock.mockResolvedValue([
      buildItem({ id: "pub", title: "Item público" }),
      buildItem({ id: "priv", title: "Item privado", visibility: "private" }),
    ]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Item público")).toBeDefined();
    });
    expect(screen.queryByText("Item privado")).toBeNull();
  });

  it("um item em destaque aparece só na secção de destaque, não duplicado no portfólio geral", async () => {
    getMyAlumniPortalMock.mockResolvedValue(buildPortal());
    getMyAlumniPortfolioMock.mockResolvedValue([
      buildItem({ id: "feat", title: "Trabalho destacado", featured: true }),
      buildItem({ id: "reg", title: "Trabalho regular" }),
    ]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Trabalhos em destaque")).toBeDefined();
    });
    expect(screen.getAllByText("Trabalho destacado").length).toBe(1);
    expect(screen.getByText("Trabalho regular")).toBeDefined();
  });

  it("sem nenhum item público mostra o aviso de portfólio vazio", async () => {
    getMyAlumniPortalMock.mockResolvedValue(buildPortal());
    getMyAlumniPortfolioMock.mockResolvedValue([
      buildItem({ id: "priv", title: "Item privado", visibility: "private" }),
    ]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Ainda não existem itens visíveis no portfólio.")).toBeDefined();
    });
  });
});
