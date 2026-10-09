// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as Dialog from "@radix-ui/react-dialog";
import { ModalShell } from "@/components/ui/modal-system/ModalShell";

afterEach(cleanup);

function setup(props: { preventOutsideClose?: boolean; hasUnsavedChanges?: boolean } = {}) {
  const onOpenChange = vi.fn();
  render(
    <ModalShell open onOpenChange={onOpenChange} {...props}>
      <Dialog.Title>Editar aluno</Dialog.Title>
      <Dialog.Description>Dados do aluno</Dialog.Description>
    </ModalShell>,
  );
  return onOpenChange;
}

async function outsideClick() {
  // Radix installs its document pointer listener on the next task.
  await new Promise((resolve) => setTimeout(resolve, 10));
  fireEvent.pointerDown(document.body, { pointerType: "mouse", button: 0 });
}

describe("protecção de fecho dos modais", () => {
  it("impede fechar por toque fora quando configurado", async () => {
    const onOpenChange = setup({ preventOutsideClose: true });
    await outsideClick();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
  it("permite fechar por toque fora por omissão", async () => {
    const onOpenChange = setup();
    await outsideClick();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
  it("mantém Escape disponível quando apenas o toque fora está bloqueado", () => {
    const onOpenChange = setup({ preventOutsideClose: true });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
  it("pede confirmação acessível e permite continuar a editar", () => {
    const onOpenChange = setup({ hasUnsavedChanges: true });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Alterações não guardadas" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continuar a editar" }));
    expect(screen.queryByRole("dialog", { name: "Alterações não guardadas" })).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
  it("só descarta depois da confirmação explícita", () => {
    const onOpenChange = setup({ hasUnsavedChanges: true });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Descartar alterações" }));
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });
});
