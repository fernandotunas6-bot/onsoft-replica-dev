// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StatGrid } from "@/components/layout/PageHeader";
import { ListFilterBar } from "@/components/filters/ListFilterBar";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("estatísticas recolhidas", () => {
  it("mantém os controlos ocultos fora da navegação até expandir", () => {
    render(
      <StatGrid collapsible>
        <button type="button">Abrir turma</button>
      </StatGrid>,
    );
    const toggle = screen.getByRole("button", { name: "Ver estatísticas" });
    const region = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(region.hasAttribute("inert")).toBe(true);
    expect(screen.queryByRole("button", { name: "Abrir turma" })).toBeNull();
    fireEvent.click(toggle);
    expect(region.hasAttribute("inert")).toBe(false);
    expect(screen.getByRole("button", { name: "Abrir turma" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ocultar estatísticas" }));
    expect(region.hasAttribute("inert")).toBe(true);
  });
  it("preserva a preferência de apresentação guardada", () => {
    localStorage.setItem("siga:stats-demo", "true");
    render(
      <StatGrid collapsible storageKey="demo">
        <button type="button">Abrir turma</button>
      </StatGrid>,
    );
    expect(screen.getByRole("button", { name: "Abrir turma" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ocultar estatísticas" }));
    expect(localStorage.getItem("siga:stats-demo")).toBe("false");
  });
});

describe("filtros das listagens", () => {
  it("identifica a pesquisa pelo seu rótulo sem alterar o placeholder", () => {
    render(
      <ListFilterBar
        fields={[
          { name: "q", label: "Nome do aluno", placeholder: "Pesquisar por nome ou número…" },
        ]}
        values={{ q: "" }}
        onChange={vi.fn()}
        onReset={vi.fn()}
        activeCount={0}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Nome do aluno" }).getAttribute("placeholder")).toBe(
      "Pesquisar por nome ou número…",
    );
    expect(screen.getByRole("button", { name: "Limpar" }).hasAttribute("disabled")).toBe(true);
  });
  it("remove apenas o filtro escolhido e conserva o seu valor vazio", () => {
    const onChange = vi.fn();
    render(
      <ListFilterBar
        fields={[]}
        values={{}}
        onChange={onChange}
        onReset={vi.fn()}
        activeCount={1}
        chips={[{ name: "estado", label: "Estado", value: "Activo", emptyValue: "todos" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remover filtro Estado: Activo" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("estado", "todos");
  });
});
