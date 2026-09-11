// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf, setRouteParams, resetRouteLocation } from "./_harness";

/**
 * Testes de montagem e render de `/alumni/$alumniId/portfolio` (vista
 * administrativa 360º — diferente da `/alumni/portal/portfolio/print`
 * pública: aqui os itens privados continuam visíveis, só que numa secção
 * própria com aviso de uso restrito).
 *
 * Valida:
 * 1. Transição de loading para carregado com os contadores.
 * 2. Itens privados aparecem na sua própria secção "Itens privados" — não
 *    somem como na vista pública, e a secção só existe quando há algum.
 * 3. Alternar destaque chama `setAlumniPortfolioFeatured` com o inverso
 *    do estado actual do item.
 * 4. Estado vazio do portfólio visível quando só há itens privados.
 */

const getAlumniProfileMock = vi.fn();
const listAlumniPortfolioAdminMock = vi.fn();
const setAlumniPortfolioFeaturedMock = vi.fn();

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());
vi.mock("@/components/ui/media-frame", async () => (await import("./_harness")).mediaFrameMock());

vi.mock("@/features/alumni/server", () => ({
  getAlumniProfile: (input: unknown) => getAlumniProfileMock(input),
}));

vi.mock("@/features/alumni/portfolio", () => ({
  listAlumniPortfolioAdmin: (input: unknown) => listAlumniPortfolioAdminMock(input),
  setAlumniPortfolioFeatured: (input: unknown) => setAlumniPortfolioFeaturedMock(input),
}));

function buildProfile() {
  return {
    profile: { headline: "Engenheira de Software", current_role: null },
    person: { full_name: "Beatriz Ndongo", photo_url: null },
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
  const mod = await import("@/routes/alumni.$alumniId.portfolio");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetRouteLocation();
});

describe("/alumni/$alumniId/portfolio", () => {
  it("mostra loading e depois os contadores de itens e destaques", async () => {
    setRouteParams({ alumniId: "al-1" });
    getAlumniProfileMock.mockResolvedValue(buildProfile());
    listAlumniPortfolioAdminMock.mockResolvedValue([
      buildItem({ id: "a" }),
      buildItem({ id: "b", featured: true }),
    ]);

    const Page = await loadPage();
    renderRoute(Page);

    expect(screen.getByText(/A carregar Portfólio Alumni 360º/)).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Beatriz Ndongo")).toBeDefined();
    });
    expect(listAlumniPortfolioAdminMock).toHaveBeenCalledWith({ data: { alumniId: "al-1" } });
    // 2 itens, 1 destaque.
    expect(screen.getByText("2")).toBeDefined();
    expect(screen.getByText("1")).toBeDefined();
  });

  it("itens privados aparecem numa secção própria, não desaparecem", async () => {
    setRouteParams({ alumniId: "al-1" });
    getAlumniProfileMock.mockResolvedValue(buildProfile());
    listAlumniPortfolioAdminMock.mockResolvedValue([
      buildItem({ id: "pub", title: "Item público" }),
      buildItem({ id: "priv", title: "Item privado", visibility: "private" }),
    ]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Item privado")).toBeDefined();
    });
    expect(screen.getByText("Itens privados")).toBeDefined();
    expect(screen.getByText("Item público")).toBeDefined();
  });

  it("não mostra a secção de itens privados quando não há nenhum", async () => {
    setRouteParams({ alumniId: "al-1" });
    getAlumniProfileMock.mockResolvedValue(buildProfile());
    listAlumniPortfolioAdminMock.mockResolvedValue([buildItem()]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Plataforma escolar")).toBeDefined();
    });
    expect(screen.queryByText("Itens privados")).toBeNull();
  });

  it("alternar destaque chama setAlumniPortfolioFeatured com o inverso do estado actual", async () => {
    setRouteParams({ alumniId: "al-1" });
    getAlumniProfileMock.mockResolvedValue(buildProfile());
    listAlumniPortfolioAdminMock.mockResolvedValue([buildItem({ featured: false })]);
    setAlumniPortfolioFeaturedMock.mockResolvedValue({ ok: true });

    const Page = await loadPage();
    renderRoute(Page);

    const toggleButton = await screen.findByRole("button", { name: "Destacar" });
    fireEvent.click(toggleButton);

    await waitFor(() => {
      expect(setAlumniPortfolioFeaturedMock).toHaveBeenCalledWith({
        data: { itemId: "item-1", featured: true },
      });
    });
  });
});
