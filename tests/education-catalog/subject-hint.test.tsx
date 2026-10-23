// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QuickFormModal } from "@/components/modals/QuickFormModal";
import { subjectCreationHint, subjectSuggestions } from "@/features/education-catalog/subject-hint";

const existing = [
  { name: "Matemática", code: "MAT" },
  { name: "Inglês", code: "ING" },
];

describe("ajuda ao criar uma disciplina", () => {
  it("avisa que a escola já tem a mesma disciplina, escrita de outra forma", () => {
    expect(subjectCreationHint("Matematica", "", existing, "AO")).toEqual({
      duplicateOf: { name: "Matemática", code: "MAT" },
      catalogName: "Matemática",
      suggestedCode: null,
    });
    expect(
      subjectCreationHint("Língua Estrangeira (Inglês)", "LE", existing, "AO")?.duplicateOf,
    ).toEqual({
      name: "Inglês",
      code: "ING",
    });
  });

  it("sugere o nome e o código do catálogo quando não há duplicado", () => {
    expect(subjectCreationHint("quimica", "", existing, "AO")).toEqual({
      duplicateOf: null,
      catalogName: "Química",
      suggestedCode: "QUI",
    });
    // Código já escrito: não sugere outro.
    expect(subjectCreationHint("Química", "QG", existing, "AO")).toEqual({
      duplicateOf: null,
      catalogName: null,
      suggestedCode: null,
    });
  });

  it("disciplina que o catálogo não conhece: sem aviso", () => {
    expect(subjectCreationHint("Robótica Educativa", "", existing, "AO")).toBeNull();
    expect(subjectCreationHint("", "", existing, "AO")).toBeNull();
  });

  it("sugestões com o nome do país, sem repetir", () => {
    const pt = subjectSuggestions("PT");
    expect(pt).toContain("Português");
    expect(pt).not.toContain("Língua Portuguesa");
    expect(new Set(pt).size).toBe(pt.length);
    expect(subjectSuggestions("AO")).toContain("Língua Portuguesa");
  });
});

describe("QuickFormModal: sugestões e aviso", () => {
  afterEach(cleanup);

  it("liga a lista de sugestões ao campo e mostra o aviso enquanto se escreve", () => {
    render(
      <QuickFormModal
        title="Nova disciplina"
        fields={[{ name: "nome", label: "Disciplina", suggestions: ["Matemática", "Química"] }]}
        renderHint={(values) => (values["nome"] ? <p>escrito: {values["nome"]}</p> : null)}
        onSubmit={async () => undefined}
        trigger={(open) => (
          <button type="button" onClick={open}>
            abrir
          </button>
        )}
      />,
    );
    fireEvent.click(screen.getByText("abrir"));
    const input = screen.getByLabelText("Disciplina");
    expect(input.getAttribute("list")).toBe("nome-suggestions");
    expect(document.querySelectorAll("#nome-suggestions option")).toHaveLength(2);
    fireEvent.change(input, { target: { value: "Quimica" } });
    expect(screen.getByText("escrito: Quimica")).toBeTruthy();
  });
});
