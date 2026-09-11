// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf } from "./_harness";

/**
 * Testes de montagem e render de `/alumni/portal/portfolio/education`.
 *
 * Valida:
 * 1. As três secções de nível (Primária/Médio/Superior) aparecem sempre,
 *    mesmo vazias, cada uma com a sua contagem — uma instituição do
 *    Ensino Superior só aparece na secção certa.
 * 2. "Adicionar instituição" só desbloqueia com nome de 2+ caracteres, e
 *    envia os anos como número (não string) ou `undefined` quando vazios.
 * 3. Remover uma instituição chama `deleteMyAlumniEducationStage` com o
 *    ID certo.
 */

const getMyAlumniEducationHistoryMock = vi.fn();
const saveMyAlumniEducationStageMock = vi.fn();
const deleteMyAlumniEducationStageMock = vi.fn();

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());

vi.mock("@/features/alumni/education-history", () => ({
  getMyAlumniEducationHistory: () => getMyAlumniEducationHistoryMock(),
  saveMyAlumniEducationStage: (input: unknown) => saveMyAlumniEducationStageMock(input),
  deleteMyAlumniEducationStage: (input: unknown) => deleteMyAlumniEducationStageMock(input),
}));

const higherStage = {
  id: "stage-1",
  education_level: "higher",
  institution_name: "Universidade Agostinho Neto",
  course_name: "Informática",
  degree_name: "Licenciatura",
  started_year: 2016,
  ended_year: 2020,
  city: "Luanda",
  province: "Luanda",
  country: "Angola",
};

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/alumni.portal.portfolio.education");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/alumni/portal/portfolio/education", () => {
  it("mostra as três secções de nível sempre, cada instituição na secção certa", async () => {
    getMyAlumniEducationHistoryMock.mockResolvedValue([higherStage]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Universidade Agostinho Neto")).toBeDefined();
    });
    // "Primária" etc. aparecem duas vezes: opção do <select> e título da
    // secção — usar a heading para não ambiguar com o formulário.
    expect(screen.getByRole("heading", { name: "Primária" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Ensino Médio" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Ensino Superior" })).toBeDefined();
    // Primária e Médio ficam com a mensagem de secção vazia (2x).
    expect(screen.getAllByText("Nenhuma instituição registada neste nível.").length).toBe(2);
  });

  it("'Adicionar instituição' só desbloqueia com nome de 2+ caracteres e envia anos como número", async () => {
    getMyAlumniEducationHistoryMock.mockResolvedValue([]);
    saveMyAlumniEducationStageMock.mockResolvedValue({ id: "stage-new" });

    const Page = await loadPage();
    renderRoute(Page);

    const addButton = await screen.findByRole("button", { name: "Adicionar instituição" });
    expect(addButton).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByPlaceholderText("Nome da escola / universidade"), {
      target: { value: "Colégio Exemplo" },
    });
    fireEvent.change(screen.getByPlaceholderText("Ano inicial"), { target: { value: "2010" } });
    expect(addButton).toHaveProperty("disabled", false);

    fireEvent.click(addButton);

    await waitFor(() => {
      expect(saveMyAlumniEducationStageMock).toHaveBeenCalledWith({
        data: {
          educationLevel: "primary",
          institutionName: "Colégio Exemplo",
          courseName: undefined,
          degreeName: undefined,
          startedYear: 2010,
          endedYear: undefined,
          city: undefined,
          province: undefined,
          country: "Angola",
        },
      });
    });
  });

  it("remover uma instituição chama deleteMyAlumniEducationStage com o ID certo", async () => {
    getMyAlumniEducationHistoryMock.mockResolvedValue([higherStage]);
    deleteMyAlumniEducationStageMock.mockResolvedValue({ ok: true });

    const Page = await loadPage();
    renderRoute(Page);

    await screen.findByText("Universidade Agostinho Neto");
    const deleteButton = screen.getByRole("button", { name: "" });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(deleteMyAlumniEducationStageMock).toHaveBeenCalledWith({
        data: { stageId: "stage-1" },
      });
    });
  });
});
