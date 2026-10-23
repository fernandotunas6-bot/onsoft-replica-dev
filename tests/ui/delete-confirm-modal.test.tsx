// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DeleteConfirmModal } from "@/components/ui/modal-system/DeleteConfirmModal";

afterEach(cleanup);

function setup(overrides: Partial<React.ComponentProps<typeof DeleteConfirmModal>> = {}) {
  const onConfirm = vi.fn(async () => {});
  const onOpenChange = vi.fn();
  render(
    <DeleteConfirmModal
      open
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      title="Eliminar turma"
      itemName="Turma A"
      itemType="turma"
      {...overrides}
    />,
  );
  return { onConfirm, onOpenChange };
}

describe("confirmação compacta de eliminação", () => {
  it("mostra uma confirmação pequena com uma acção real e título acessível", () => {
    const { onConfirm } = setup({
      warningMessage: "A operação pode afectar matrículas.",
      impacts: [{ label: "matrículas", count: 12 }],
    });
    expect(screen.getByRole("dialog", { name: "Eliminar turma" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Eliminar definitivamente" })).toBeTruthy();
    expect(screen.getByText("12 matrículas")).toBeTruthy();
    expect(screen.getByText("A operação pode afectar matrículas.")).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("bloqueia eliminações proibidas inclusive por submissão do formulário", () => {
    const { onConfirm } = setup({ cannotDeleteReason: "A turma tem notas encerradas." });
    const button = screen.getByRole("button", { name: "Eliminar definitivamente" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    fireEvent.submit(button.closest("form")!);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("notas encerradas");
  });

  it("impede submissões repetidas e fecho durante uma operação pendente", async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((done) => {
      resolve = done;
    });
    const onConfirm = vi.fn(() => pending);
    const onOpenChange = vi.fn();
    setup({ onConfirm, onOpenChange });

    const confirm = screen.getByRole("button", { name: "Eliminar definitivamente" });
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(confirm.closest("form")!);
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();

    resolve();
    await waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("mostra erro genérico e permite repetir quando a operação falha", async () => {
    const onConfirm = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("Dados privados do servidor"))
      .mockResolvedValueOnce();
    setup({ onConfirm });
    fireEvent.click(screen.getByRole("button", { name: "Eliminar definitivamente" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Não foi possível eliminar"),
    );
    expect(screen.getByRole("alert").textContent).not.toContain("Dados privados");
    fireEvent.click(screen.getByRole("button", { name: "Eliminar definitivamente" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));
  });
});
