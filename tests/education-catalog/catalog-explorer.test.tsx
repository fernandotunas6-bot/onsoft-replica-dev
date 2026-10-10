// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { CatalogExplorer } from "@/features/education-catalog/CatalogExplorer";

describe("Catálogo global — página", () => {
  afterEach(cleanup);

  it("mostra o plano da etapa e filtra pela pesquisa", () => {
    render(<CatalogExplorer />);
    // Angola, Pré-escolar por omissão: mudar para o I Ciclo.
    fireEvent.change(screen.getByLabelText("Nível de ensino"), { target: { value: "AO-ESG1" } });
    const list = () => screen.getAllByRole("list").at(-1)!;
    expect(within(list()).getAllByText("Obrigatória no plano").length).toBeGreaterThan(5);

    fireEvent.change(screen.getByLabelText("Pesquisar disciplinas"), {
      target: { value: "quimca" },
    });
    expect(within(list()).getByText("Química")).toBeTruthy();
    expect(within(list()).queryByText("Termodinâmica")).toBeNull();
  });

  it("diz quando a etapa não tem cursos", () => {
    render(<CatalogExplorer />);
    fireEvent.change(screen.getByLabelText("Nível de ensino"), { target: { value: "AO-EP" } });
    fireEvent.click(screen.getByRole("button", { name: "cursos" }));
    expect(screen.getByText("Sem cursos neste contexto")).toBeTruthy();
  });
});
