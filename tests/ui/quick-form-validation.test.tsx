// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QuickFormModal } from "@/components/modals/QuickFormModal";

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/step-up", () => ({ reportPossibleStepUp: () => false }));
vi.mock("@/components/ui/modal-system/confirm-close", () => ({
  confirmDiscardChanges: () => true,
}));
vi.mock("@/components/ui/modal-system", () => ({
  ModalShell: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  ModalHeader: ({ title, onClose }: { title: string; onClose: () => void }) => (
    <div>
      <h2>{title}</h2>
      <button type="button" onClick={onClose}>
        Fechar
      </button>
    </div>
  ),
  ModalContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ModalFooter: ({
    onCancel,
    onSubmit,
    isSubmitting,
  }: {
    onCancel: () => void;
    onSubmit: () => void;
    isSubmitting: boolean;
  }) => (
    <div>
      <button type="button" onClick={onCancel}>
        Cancelar
      </button>
      <button type="button" onClick={onSubmit} disabled={isSubmitting}>
        Guardar
      </button>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function setup({
  onSubmit,
  validate,
}: {
  onSubmit: (values: Record<string, string>) => Promise<void>;
  validate?: (values: Record<string, string>) => Record<string, string>;
}) {
  render(
    <QuickFormModal
      title="Editar pessoa"
      fields={[{ name: "nome", label: "Nome completo" }]}
      onSubmit={onSubmit}
      validate={validate}
      trigger={(open) => (
        <button type="button" onClick={open}>
          Abrir
        </button>
      )}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
}

describe("QuickFormModal — registos seguros", () => {
  it("não envia um select obrigatório sem opções e aceita o opcional vazio", async () => {
    const onSubmit = vi.fn(async () => {});
    const fields = [
      { name: "turma", label: "Turma", type: "select" as const, options: ["A", "B"] },
      { name: "disciplina", label: "Disciplina", type: "select" as const, optionsFor: () => [] },
    ];
    const { rerender } = render(
      <QuickFormModal
        title="Selecção"
        fields={fields}
        onSubmit={onSubmit}
        trigger={(open) => <button onClick={open}>Abrir</button>}
      />,
    );
    fireEvent.click(screen.getByText("Abrir"));
    fireEvent.click(screen.getByText("Guardar"));
    expect(onSubmit).not.toHaveBeenCalled();
    rerender(
      <QuickFormModal
        title="Selecção"
        fields={[fields[0]!, { ...fields[1]!, required: false }]}
        onSubmit={onSubmit}
        trigger={(open) => <button onClick={open}>Abrir</button>}
      />,
    );
    fireEvent.click(screen.getByText("Guardar"));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ turma: "A", disciplina: "" }),
    );
  });

  it("resolve os valores iniciais de selectores dependentes antes da submissão", async () => {
    const onSubmit = vi.fn(async () => {});
    render(
      <QuickFormModal
        title="Selecção"
        fields={[
          { name: "turma", label: "Turma", type: "select", options: ["A", "B"], defaultValue: "B" },
          {
            name: "disciplina",
            label: "Disciplina",
            type: "select",
            optionsFor: (values) => (values.turma === "B" ? ["Física"] : []),
          },
          {
            name: "recurso",
            label: "Recurso",
            type: "select",
            optionsFor: (values) => (values.disciplina === "Física" ? ["Laboratório"] : []),
          },
        ]}
        renderHint={(values) => (
          <p>
            Selecção: {values.turma}/{values.disciplina}/{values.recurso}
          </p>
        )}
        onSubmit={onSubmit}
        trigger={(open) => <button onClick={open}>Abrir</button>}
      />,
    );
    fireEvent.click(screen.getByText("Abrir"));
    await screen.findByText("Selecção: B/Física/Laboratório");
    fireEvent.click(screen.getByText("Guardar"));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
        turma: "B",
        disciplina: "Física",
        recurso: "Laboratório",
      }),
    );
  });

  it("actualiza o aviso com a opção real após mudar a turma", async () => {
    const onSubmit = vi.fn(async () => {});
    render(
      <QuickFormModal
        title="Selecção"
        fields={[
          { name: "turma", label: "Turma", type: "select", options: ["A", "B"] },
          {
            name: "disciplina",
            label: "Disciplina",
            type: "select",
            optionsFor: (values) => (values.turma === "A" ? ["Matemática"] : ["Física"]),
          },
        ]}
        renderHint={(values) => (
          <p>
            Selecção: {values.turma}/{values.disciplina}
          </p>
        )}
        onSubmit={onSubmit}
        trigger={(open) => <button onClick={open}>Abrir</button>}
      />,
    );
    fireEvent.click(screen.getByText("Abrir"));
    fireEvent.change(screen.getByLabelText("Turma"), { target: { value: "B" } });
    await screen.findByText("Selecção: B/Física");
    fireEvent.click(screen.getByText("Guardar"));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ turma: "B", disciplina: "Física" }),
    );
  });

  it("preserva uma escolha que continua válida quando a lista de opções cresce", async () => {
    render(
      <QuickFormModal
        title="Selecção"
        fields={[
          { name: "turma", label: "Turma", type: "select", options: ["A", "B"] },
          {
            name: "disciplina",
            label: "Disciplina",
            type: "select",
            optionsFor: (values) =>
              values.turma === "A" ? ["Matemática", "Física"] : ["Matemática", "Física", "Química"],
          },
        ]}
        renderHint={(values) => <p>Escolhida: {values.disciplina}</p>}
        onSubmit={vi.fn()}
        trigger={(open) => <button onClick={open}>Abrir</button>}
      />,
    );
    fireEvent.click(screen.getByText("Abrir"));
    fireEvent.change(screen.getByLabelText("Turma"), { target: { value: "A" } });
    fireEvent.change(screen.getByLabelText("Disciplina"), { target: { value: "Física" } });
    fireEvent.change(screen.getByLabelText("Turma"), { target: { value: "B" } });
    expect((screen.getByLabelText("Disciplina") as HTMLSelectElement).value).toBe("Física");
    await screen.findByText("Escolhida: Física");
  });

  it("preserva espaços da senha e normaliza apenas campos de cadastro", async () => {
    const onSubmit = vi.fn(async () => {});
    render(
      <QuickFormModal
        title="Criar acesso"
        fields={[
          { name: "nome", label: "Nome", defaultValue: "  Ana Teste  " },
          { name: "senha", label: "Senha", type: "password", defaultValue: "  Segredo@123  " },
        ]}
        onSubmit={onSubmit}
        trigger={(open) => <button onClick={open}>Abrir</button>}
      />,
    );
    fireEvent.click(screen.getByText("Abrir"));
    fireEvent.click(screen.getByText("Guardar"));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
        nome: "Ana Teste",
        senha: "  Segredo@123  ",
      }),
    );
  });

  it("isola labels, erros e sugestões de dois formulários com o mesmo nome de campo", () => {
    const fields = [{ name: "nome", label: "Nome", suggestions: ["Ana"] }];
    render(
      <>
        <QuickFormModal
          title="Pessoa"
          fields={fields}
          validate={() => ({ nome: "Nome curto" })}
          onSubmit={vi.fn()}
          trigger={(open) => <button onClick={open}>Abrir pessoa</button>}
        />
        <QuickFormModal
          title="Professor"
          fields={fields}
          onSubmit={vi.fn()}
          trigger={(open) => <button onClick={open}>Abrir professor</button>}
        />
      </>,
    );
    fireEvent.click(screen.getByText("Abrir pessoa"));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "A" } });
    fireEvent.click(screen.getByText("Guardar"));
    fireEvent.click(screen.getByText("Abrir professor"));
    const controls = screen.getAllByLabelText("Nome") as HTMLInputElement[];
    expect(controls).toHaveLength(2);
    expect(new Set(controls.map((field) => field.id)).size).toBe(2);
    expect(controls[0]!.value).toBe("A");
    expect(controls[1]!.value).toBe("");
    const errorId = controls[0]!.getAttribute("aria-describedby")!;
    expect(document.getElementById(errorId)?.textContent).toBe("Nome curto");
    const lists = controls.map((field) => field.getAttribute("list")!);
    expect(new Set(lists).size).toBe(2);
    for (const id of lists) expect(document.getElementById(id)?.tagName).toBe("DATALIST");
  });

  it("respeita BI obrigatório e permite BI opcional vazio", async () => {
    const onSubmit = vi.fn(async () => {});
    const { rerender } = render(
      <QuickFormModal
        title="Documento"
        fields={[{ name: "bi", label: "BI", type: "angola-identity", required: true }]}
        onSubmit={onSubmit}
        trigger={(open) => <button onClick={open}>Abrir</button>}
      />,
    );
    fireEvent.click(screen.getByText("Abrir"));
    fireEvent.click(screen.getByText("Guardar"));
    expect((screen.getByLabelText("BI") as HTMLInputElement).required).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
    rerender(
      <QuickFormModal
        title="Documento"
        fields={[{ name: "bi", label: "BI", type: "angola-identity", required: false }]}
        onSubmit={onSubmit}
        trigger={(open) => <button onClick={open}>Abrir</button>}
      />,
    );
    fireEvent.click(screen.getByText("Guardar"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ bi: "" }));
  });

  it("congela os campos durante a gravação e recupera os valores após falha", async () => {
    let reject!: (error: Error) => void;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail;
        }),
    );
    render(
      <QuickFormModal
        title="Editar"
        fields={[
          { name: "nome", label: "Nome", defaultValue: "Ana" },
          { name: "nota", label: "Nota", type: "textarea", defaultValue: "Texto" },
          { name: "cargo", label: "Cargo", type: "select", options: ["Professor"] },
          { name: "bi", label: "BI", type: "angola-identity", required: false },
        ]}
        onSubmit={onSubmit}
        trigger={(open) => <button onClick={open}>Abrir</button>}
      />,
    );
    fireEvent.click(screen.getByText("Abrir"));
    fireEvent.click(screen.getByText("Guardar"));
    for (const label of ["Nome", "Nota", "Cargo", "BI"]) {
      expect((screen.getByLabelText(label) as HTMLInputElement).disabled).toBe(true);
    }
    await act(async () => reject(new Error("Falha de rede")));
    for (const label of ["Nome", "Nota", "Cargo", "BI"]) {
      expect((screen.getByLabelText(label) as HTMLInputElement).disabled).toBe(false);
    }
    expect((screen.getByLabelText("Nome") as HTMLInputElement).value).toBe("Ana");
    expect(screen.getByRole("alert").textContent).toContain("foram mantidos");
  });

  it("apresenta validação por campo e não envia uma mutação inválida", async () => {
    const onSubmit = vi.fn(async () => {});
    setup({
      onSubmit,
      validate: (values): Record<string, string> =>
        values["nome"]?.length === 1 ? { nome: "Nome curto." } : {},
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Nome completo" }), {
      target: { value: "A" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByRole("alert").textContent).toContain("Nome curto.");
    expect(
      screen.getByRole("textbox", { name: "Nome completo" }).getAttribute("aria-invalid"),
    ).toBe("true");
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Nome completo" }), {
      target: { value: "Ana" },
    });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
  });

  it("conserva os valores e mantém o modal aberto quando o servidor falha", async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error("Servidor indisponível");
    });
    setup({ onSubmit });
    const field = screen.getByRole("textbox", { name: "Nome completo" }) as HTMLInputElement;
    fireEvent.change(field, { target: { value: "Ana Silva" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("foram mantidos"));
    expect(field.value).toBe("Ana Silva");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("bloqueia o segundo clique e o fecho durante uma gravação em curso", async () => {
    let complete = () => {};
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    setup({ onSubmit });
    fireEvent.change(screen.getByRole("textbox", { name: "Nome completo" }), {
      target: { value: "Ana Silva" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    fireEvent.submit(screen.getByRole("textbox", { name: "Nome completo" }).closest("form")!);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledOnce();
    await act(async () => complete());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
