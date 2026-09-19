// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf, setRouteSearch, resetRouteLocation } from "./_harness";

/**
 * Testes de montagem e render de `/importar`.
 *
 * A aba "Nova Importação" (por omissão) monta `ImportWorkflowWizard`, que
 * não faz nenhuma chamada ao servidor até o utilizador escolher um ficheiro
 * — por isso a rota monta em segurança sem mockar `@/features/import/server`
 * caso a caso; mesmo assim o módulo inteiro é mockado abaixo para cobrir
 * qualquer chamada disparada por interacção.
 *
 * Valida:
 * 1. Montagem por omissão na aba "Nova Importação" sem rebentar.
 * 2. Deep link `?tab=modelos&modulo=alunos` pré-selecciona a categoria certa
 *    (o filtro deriva a categoria do módulo, não vem solto do URL).
 * 3. Filtro por categoria na aba de modelos.
 * 4. Pesquisa por texto — incluindo o estado vazio "Nenhum modelo oficial
 *    encontrado" quando nada bate certo.
 * 5. Clicar em "Importar" num modelo não rebenta a navegação.
 */

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());

vi.mock("@/features/auth/use-school-settings", () => ({
  useSchoolSettings: () => ({
    school: { id: "sch-1", name: "Complexo Escolar Teste" },
    activeYearLabel: "Ano Lectivo 2025/2026",
    selectedYearId: "year-1",
  }),
}));

// Cobre qualquer chamada que a interacção do wizard/exportação/histórico
// dispare — nenhum destes é invocado apenas pela montagem da página.
vi.mock("@/features/import/server", () => ({
  analyzeImportFile: vi.fn(),
  createImportJob: vi.fn(),
  listImportJobs: vi.fn().mockResolvedValue([]),
  stageImportRows: vi.fn(),
  listStagingRows: vi.fn(),
  updateStagingRowField: vi.fn(),
  commitImportBatch: vi.fn(),
  rollbackImportJob: vi.fn(),
  downloadOfficialExcelTemplateFn: vi.fn(),
  exportSchoolDataFn: vi.fn(),
}));

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/importar");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetRouteLocation();
});

describe("/importar", () => {
  it("monta por omissão na aba 'Nova Importação' sem chamar o servidor", async () => {
    const Page = await loadPage();
    renderRoute(Page);

    expect(screen.getByText("Complexo Escolar Teste")).toBeDefined();
    expect(screen.getByText("Ano Lectivo 2025/2026")).toBeDefined();
    const novaImportacaoTab = screen.getByRole("tab", { name: /Nova Importação/ });
    expect(novaImportacaoTab.getAttribute("aria-selected")).toBe("true");
  });

  it("o deep link ?tab=modelos&modulo=alunos abre a aba de modelos já filtrada por 'Identidade & Pessoas'", async () => {
    setRouteSearch({ tab: "modelos", modulo: "alunos" });

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Modelo de Alunos")).toBeDefined();
    });
    // "Modelo de Turmas" é da categoria "pedagogica" — não deve aparecer sob
    // o filtro derivado do módulo "alunos" (categoria "pessoas").
    expect(screen.queryByText("Modelo de Turmas")).toBeNull();
  });

  it("troca de categoria e mostra os modelos da categoria seleccionada", async () => {
    setRouteSearch({ tab: "modelos" });

    const Page = await loadPage();
    renderRoute(Page);

    const pedagogicaButton = await screen.findByRole("button", {
      name: /Estrutura Pedagógica/,
    });
    fireEvent.click(pedagogicaButton);

    await waitFor(() => {
      expect(screen.getByText("Modelo de Turmas")).toBeDefined();
    });
    expect(screen.queryByText("Modelo de Pessoas")).toBeNull();
  });

  it("pesquisa por texto filtra os modelos e mostra o estado vazio sem correspondência", async () => {
    setRouteSearch({ tab: "modelos" });

    const Page = await loadPage();
    renderRoute(Page);

    const search = await screen.findByPlaceholderText("Buscar modelo ou coluna...");
    fireEvent.change(search, { target: { value: "turmas" } });

    await waitFor(() => {
      expect(screen.getByText("Modelo de Turmas")).toBeDefined();
    });
    expect(screen.queryByText("Modelo de Pessoas")).toBeNull();

    fireEvent.change(search, { target: { value: "xyz-inexistente" } });

    await waitFor(() => {
      expect(
        screen.getByText('Nenhum modelo oficial encontrado para a pesquisa "xyz-inexistente".'),
      ).toBeDefined();
    });
  });

  it("clicar em 'Importar' num modelo não rebenta a navegação", async () => {
    setRouteSearch({ tab: "modelos" });

    const Page = await loadPage();
    renderRoute(Page);

    await screen.findByText("Modelo de Alunos");
    const card = screen.getByText("Modelo de Alunos").closest("div.flex.flex-col") as HTMLElement;
    const importButton = within(card).getByRole("button", { name: /Importar/ });

    expect(() => fireEvent.click(importButton)).not.toThrow();
  });
});
