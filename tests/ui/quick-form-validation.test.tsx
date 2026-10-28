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
  it("apresenta validação por campo e não envia uma mutação inválida", async () => {
    const onSubmit = vi.fn(async () => {});
    setup({
      onSubmit,
      validate: (values) => (values["nome"]?.length === 1 ? { nome: "Nome curto." } : {}),
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
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledOnce();
    await act(async () => complete());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
