// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QuickFormModal } from "@/components/modals/QuickFormModal";

const byClass: Record<string, string[]> = {
  "Ana · 7.ª A": ["Matemática", "Língua Portuguesa"],
  "Rui · 10.ª C": ["Topografia"],
};

/**
 * Nota avulsa: a disciplina oferecida depende do aluno escolhido. Antes vinha o
 * catálogo inteiro da escola, e o servidor recusava as que não eram da turma.
 */
describe("QuickFormModal: opções que dependem de outro campo", () => {
  afterEach(cleanup);

  it("mostra as opções do valor escolhido e volta à primeira ao mudar", async () => {
    let sent: Record<string, string> | null = null;
    render(
      <QuickFormModal
        title="Lançar nota avulsa"
        fields={[
          { name: "matricula", label: "Aluno", type: "select", options: Object.keys(byClass) },
          {
            name: "disciplina",
            label: "Disciplina",
            type: "select",
            optionsFor: (values) => byClass[values["matricula"] ?? "Ana · 7.ª A"] ?? [],
          },
        ]}
        onSubmit={async (values) => {
          sent = values;
        }}
        trigger={(open) => (
          <button type="button" onClick={open}>
            abrir
          </button>
        )}
      />,
    );
    fireEvent.click(screen.getByText("abrir"));

    const options = () =>
      Array.from((screen.getByLabelText("Disciplina") as HTMLSelectElement).options).map(
        (option) => option.value,
      );
    expect(options()).toEqual(["Matemática", "Língua Portuguesa"]);

    fireEvent.change(screen.getByLabelText("Disciplina"), {
      target: { value: "Língua Portuguesa" },
    });
    fireEvent.change(screen.getByLabelText("Aluno"), { target: { value: "Rui · 10.ª C" } });
    expect(options()).toEqual(["Topografia"]);
    expect((screen.getByLabelText("Disciplina") as HTMLSelectElement).value).toBe("Topografia");

    fireEvent.click(screen.getByText("Guardar"));
    await screen.findByText("abrir");
    expect(sent).toEqual({ matricula: "Rui · 10.ª C", disciplina: "Topografia" });
  });
});
