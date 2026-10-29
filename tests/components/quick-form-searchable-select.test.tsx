// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QuickFormModal } from "@/components/modals/QuickFormModal";

describe("QuickFormModal: pesquisa sem alterar a turma escolhida", () => {
  afterEach(cleanup);
  it("exige escolha explícita, filtra sem acentos e submete o ID escolhido mesmo noutra pesquisa", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    render(
      <QuickFormModal
        autoOpen
        trigger={() => null}
        title="Matrícula de teste"
        fields={[
          {
            name: "turma",
            label: "Turma",
            type: "select",
            searchable: true,
            placeholder: "Seleccione uma turma",
            options: [
              { value: "civil", label: "10.ª A · Construção Civil · Noite · Sala 31" },
              { value: "informatica", label: "10.ª A · Informática · Manhã · Sala 32" },
            ],
          },
        ]}
        onSubmit={submit}
      />,
    );
    const select = await screen.findByRole("combobox", { name: "Turma" });
    const search = screen.getByRole("searchbox", { name: "Procurar turma" });
    expect((select as HTMLSelectElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(submit).not.toHaveBeenCalled();
    fireEvent.change(search, { target: { value: "noite construcao" } });
    expect(within(select).queryByRole("option", { name: /Informática/ })).toBeNull();
    expect((select as HTMLSelectElement).value).toBe("");
    fireEvent.change(select, { target: { value: "civil" } });
    fireEvent.change(search, { target: { value: "sem correspondencia" } });
    expect(screen.getByRole("status").textContent).toContain("Nenhuma opção corresponde");
    expect((select as HTMLSelectElement).value).toBe("civil");
    fireEvent.change(search, { target: { value: "informatica" } });
    expect(within(select).getByRole("option", { name: /Informática/ })).toBeDefined();
    expect(screen.getByRole("status").textContent).toContain("selecção actual foi mantida");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ turma: "civil" }));
  });

  it("Enter na pesquisa não submete e leva o foco para a lista", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    render(
      <QuickFormModal
        autoOpen
        trigger={() => null}
        title="Matrícula de teste"
        fields={[
          {
            name: "turma",
            label: "Turma",
            type: "select",
            searchable: true,
            placeholder: "Seleccione uma turma",
            defaultValue: "civil",
            options: [
              { value: "civil", label: "10.ª A · Construção Civil · Noite · Sala 31" },
              { value: "informatica", label: "10.ª A · Informática · Manhã · Sala 32" },
            ],
          },
        ]}
        onSubmit={submit}
      />,
    );
    const select = (await screen.findByRole("combobox", { name: "Turma" })) as HTMLSelectElement;
    const search = screen.getByRole("searchbox", { name: "Procurar turma" });
    fireEvent.change(search, { target: { value: "informatica" } });
    // fireEvent devolve false quando o evento foi cancelado (preventDefault).
    expect(fireEvent.keyDown(search, { key: "Enter" })).toBe(false);
    expect(document.activeElement).toBe(select);
    expect(select.value).toBe("civil");
    expect(submit).not.toHaveBeenCalled();
  });
  it("mantém a validação por campo ao pesquisar e limpa o erro só ao mudar a selecção", async () => {
    render(
      <QuickFormModal
        autoOpen
        trigger={() => null}
        title="Matrícula de teste"
        fields={[
          {
            name: "turma",
            label: "Turma",
            type: "select",
            searchable: true,
            defaultValue: "civil",
            options: [
              { value: "civil", label: "Construção Civil" },
              { value: "informatica", label: "Informática" },
            ],
          },
        ]}
        validate={(values): Record<string, string> =>
          values["turma"] === "civil" ? { turma: "Reveja a turma escolhida." } : {}
        }
        onSubmit={async () => {}}
      />,
    );
    const select = await screen.findByRole("combobox", { name: "Turma" });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(select.getAttribute("aria-invalid")).toBe("true");
    expect(select.getAttribute("aria-describedby")).toContain("turma-error");
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar turma" }), {
      target: { value: "informatica" },
    });
    expect(screen.getByRole("alert").textContent).toBe("Reveja a turma escolhida.");
    fireEvent.change(select, { target: { value: "informatica" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(select.getAttribute("aria-invalid")).toBe("false");
  });
});
