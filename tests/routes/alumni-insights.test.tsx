// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf, clickTab } from "./_harness";
import type { getAlumniGeoAnalytics } from "@/features/alumni/admin-tools";

/**
 * Testes de montagem e render de `/alumni/insights`.
 *
 * Valida:
 * 1. Transição de loading para carregado com os três indicadores
 *    (províncias, Alumni geolocalizados, % empregabilidade calculada).
 * 2. Distribuição por província na aba "Mapa & Território".
 * 3. Trocar de finalidade na aba "Comunicação segmentada" dispara nova
 *    consulta da audiência com essa finalidade.
 * 4. `getAlumniExportDataset` só é pedido quando "Exportar CSV" é clicado
 *    — a query fica `enabled: false` até lá.
 */

type GeoRow = Awaited<ReturnType<typeof getAlumniGeoAnalytics>>[number];

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());

const getAlumniGeoAnalyticsMock = vi.fn();
const getAlumniExportDatasetMock = vi.fn();
const buildAlumniCommunicationAudienceMock = vi.fn();

vi.mock("@/features/alumni/admin-tools", () => ({
  getAlumniGeoAnalytics: () => getAlumniGeoAnalyticsMock(),
  getAlumniExportDataset: () => getAlumniExportDatasetMock(),
  buildAlumniCommunicationAudience: (input: unknown) => buildAlumniCommunicationAudienceMock(input),
}));

const luandaRow: GeoRow = {
  province: "Luanda",
  total: 10,
  employed: 6,
  mentors: 2,
  openToOpportunities: 3,
  cities: ["Luanda", "Talatona"],
};

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/alumni.insights");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/alumni/insights", () => {
  it("mostra os indicadores geográficos e a % de empregabilidade calculada", async () => {
    getAlumniGeoAnalyticsMock.mockResolvedValue([luandaRow]);
    buildAlumniCommunicationAudienceMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Luanda")).toBeDefined();
    });
    expect(screen.getByText("1")).toBeDefined(); // 1 província
    // 6/10 = 60%.
    expect(screen.getByText("60%")).toBeDefined();
  });

  it("mostra as cidades da província na distribuição geográfica", async () => {
    getAlumniGeoAnalyticsMock.mockResolvedValue([luandaRow]);
    buildAlumniCommunicationAudienceMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Luanda · Talatona")).toBeDefined();
    });
  });

  it("trocar de finalidade na aba de comunicação dispara nova consulta da audiência", async () => {
    getAlumniGeoAnalyticsMock.mockResolvedValue([luandaRow]);
    buildAlumniCommunicationAudienceMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(buildAlumniCommunicationAudienceMock).toHaveBeenCalledWith({
        data: { purpose: "general" },
      });
    });

    clickTab(screen.getByRole("tab", { name: "Comunicação segmentada" }));
    fireEvent.click(await screen.findByRole("button", { name: "mentoring" }));

    await waitFor(() => {
      expect(buildAlumniCommunicationAudienceMock).toHaveBeenCalledWith({
        data: { purpose: "mentoring" },
      });
    });
  });

  it("só pede o dataset de exportação quando 'Exportar CSV' é clicado", async () => {
    getAlumniGeoAnalyticsMock.mockResolvedValue([]);
    buildAlumniCommunicationAudienceMock.mockResolvedValue([]);
    getAlumniExportDatasetMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    await screen.findByText("Distribuição por província");
    expect(getAlumniExportDatasetMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Exportar CSV/ }));

    await waitFor(() => {
      expect(getAlumniExportDatasetMock).toHaveBeenCalled();
    });
  });
});
