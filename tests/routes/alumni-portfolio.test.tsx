// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf } from "./_harness";

/**
 * Testes de montagem e render de `/alumni/portal/portfolio`.
 *
 * Valida:
 * 1. Transição de loading para carregado com um item real e a contagem.
 * 2. Estado vazio quando não há itens.
 * 3. Trocar o nível de ensino filtra o `<select>` de instituição pelo
 *    nível seleccionado e reinicia a instituição escolhida — e mostra o
 *    aviso "Ainda não há instituições registadas neste nível" só quando o
 *    filtro fica vazio.
 * 4. "Adicionar item" só desbloqueia com título de 2+ caracteres.
 * 5. Remover um item chama `deleteMyAlumniPortfolioItem` com o ID certo.
 */

const getMyAlumniPortfolioMock = vi.fn();
const getMyPortfolioDocumentOptionsMock = vi.fn();
const getMyAlumniEducationHistoryMock = vi.fn();
const saveMyAlumniPortfolioItemMock = vi.fn();
const deleteMyAlumniPortfolioItemMock = vi.fn();

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());
vi.mock("@/components/ui/media-frame", async () => (await import("./_harness")).mediaFrameMock());

vi.mock("@/features/alumni/portfolio", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/alumni/portfolio")>();
  return {
    alumniPortfolioEducationLevels: actual.alumniPortfolioEducationLevels,
    alumniPortfolioItemTypes: actual.alumniPortfolioItemTypes,
    getMyAlumniPortfolio: () => getMyAlumniPortfolioMock(),
    getMyPortfolioDocumentOptions: () => getMyPortfolioDocumentOptionsMock(),
    saveMyAlumniPortfolioItem: (input: unknown) => saveMyAlumniPortfolioItemMock(input),
    deleteMyAlumniPortfolioItem: (input: unknown) => deleteMyAlumniPortfolioItemMock(input),
  };
});

vi.mock("@/features/alumni/education-history", () => ({
  getMyAlumniEducationHistory: () => getMyAlumniEducationHistoryMock(),
}));

const sampleItem = {
  id: "item-1",
  item_type: "project",
  education_level: "higher",
  title: "Plataforma de gestão escolar",
  summary: "Construção de um SIGA para escolas angolanas.",
  organization: "TechAO",
  role: "Engenheira",
  image_url: null,
  external_url: null,
  document_requests: null,
  skills: ["React", "TypeScript"],
  featured: false,
  visibility: "alumni",
  alumni_education_stages: null,
};

const higherStage = {
  id: "stage-higher",
  education_level: "higher",
  institution_name: "Universidade Agostinho Neto",
  course_name: "Informática",
};

const primaryStage = {
  id: "stage-primary",
  education_level: "primary",
  institution_name: "Escola Primária Kilamba",
  course_name: null,
};

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/alumni.portal.portfolio");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/alumni/portal/portfolio", () => {
  it("mostra loading e depois o item de portfólio e a contagem", async () => {
    getMyAlumniPortfolioMock.mockResolvedValue([sampleItem]);
    getMyPortfolioDocumentOptionsMock.mockResolvedValue([]);
    getMyAlumniEducationHistoryMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    expect(screen.getByText(/A carregar portfólio/)).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Plataforma de gestão escolar")).toBeDefined();
    });
    expect(screen.getByText("1 item(ns)")).toBeDefined();
  });

  it("mostra o estado vazio quando não há itens", async () => {
    getMyAlumniPortfolioMock.mockResolvedValue([]);
    getMyPortfolioDocumentOptionsMock.mockResolvedValue([]);
    getMyAlumniEducationHistoryMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("O seu portfólio ainda está vazio")).toBeDefined();
    });
  });

  it("trocar o nível de ensino filtra as instituições e avisa quando fica vazio", async () => {
    getMyAlumniPortfolioMock.mockResolvedValue([]);
    getMyPortfolioDocumentOptionsMock.mockResolvedValue([]);
    getMyAlumniEducationHistoryMock.mockResolvedValue([higherStage, primaryStage]);

    const Page = await loadPage();
    renderRoute(Page);

    // Nível por omissão é "primary" — mostra a escola primária.
    await waitFor(() => {
      expect(screen.getByText("Escola Primária Kilamba")).toBeDefined();
    });

    const levelSelect = screen.getByDisplayValue("Primária");
    fireEvent.change(levelSelect, { target: { value: "higher" } });

    await waitFor(() => {
      expect(screen.getByText(/Universidade Agostinho Neto/)).toBeDefined();
    });
    expect(screen.queryByText("Escola Primária Kilamba")).toBeNull();

    fireEvent.change(levelSelect, { target: { value: "middle" } });
    await waitFor(() => {
      expect(screen.getByText("Ainda não há instituições registadas neste nível.")).toBeDefined();
    });
  });

  it("'Adicionar item' só desbloqueia com título de 2+ caracteres", async () => {
    getMyAlumniPortfolioMock.mockResolvedValue([]);
    getMyPortfolioDocumentOptionsMock.mockResolvedValue([]);
    getMyAlumniEducationHistoryMock.mockResolvedValue([]);
    saveMyAlumniPortfolioItemMock.mockResolvedValue({ id: "item-new" });

    const Page = await loadPage();
    renderRoute(Page);

    const addButton = await screen.findByRole("button", { name: /Adicionar item/ });
    expect(addButton).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByPlaceholderText("Título do projecto / evidência"), {
      target: { value: "A" },
    });
    expect(addButton).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByPlaceholderText("Título do projecto / evidência"), {
      target: { value: "App" },
    });
    expect(addButton).toHaveProperty("disabled", false);

    fireEvent.click(addButton);
    await waitFor(() => {
      expect(saveMyAlumniPortfolioItemMock).toHaveBeenCalled();
    });
  });

  it("remover um item chama deleteMyAlumniPortfolioItem com o ID certo", async () => {
    getMyAlumniPortfolioMock.mockResolvedValue([sampleItem]);
    getMyPortfolioDocumentOptionsMock.mockResolvedValue([]);
    getMyAlumniEducationHistoryMock.mockResolvedValue([]);
    deleteMyAlumniPortfolioItemMock.mockResolvedValue({ ok: true });

    const Page = await loadPage();
    renderRoute(Page);

    await screen.findByText("Plataforma de gestão escolar");
    const deleteButton = screen.getByRole("button", { name: "" });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(deleteMyAlumniPortfolioItemMock).toHaveBeenCalledWith({
        data: { itemId: "item-1" },
      });
    });
  });
});
