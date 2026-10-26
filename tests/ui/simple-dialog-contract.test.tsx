// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

afterEach(cleanup);

function renderBasicDialog() {
  const onOpenChange = vi.fn();
  render(
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar aluno</DialogTitle>
          <DialogDescription>Actualize apenas os dados necessários.</DialogDescription>
        </DialogHeader>
        <label htmlFor="aluno-nome">Nome</label>
        <input id="aluno-nome" />
        <DialogFooter>
          <button type="button">Cancelar</button>
          <button type="button">Guardar</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>,
  );
  return onOpenChange;
}

describe("diálogo partilhado simples e preciso", () => {
  it("preserva a semântica, os campos e as acções do formulário", () => {
    renderBasicDialog();
    const dialog = screen.getByRole("dialog", { name: "Editar aluno" });
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("Actualize apenas os dados necessários.")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Nome" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeTruthy();
  });

  it("mantém fecho acessível e superfície com scroll em ecrãs pequenos", () => {
    const onOpenChange = renderBasicDialog();
    const dialog = screen.getByRole("dialog", { name: "Editar aluno" });
    expect(dialog.className).toContain("overflow-y-auto");
    expect(dialog.className).toContain("max-h-[calc(100dvh-2rem)]");
    expect(dialog.className).toContain("shadow-sm");
    const close = screen.getByRole("button", { name: "Fechar" });
    expect(close.className).toContain("size-[44px]");
    fireEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("não aplica zoom decorativo nem modifica os componentes Radix", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/ui/dialog.tsx"), "utf8");
    expect(source).not.toContain("shadow-float");
    expect(source).not.toContain("zoom-out-95");
    expect(source).not.toContain("zoom-in-95");
    expect(source).toContain("DialogPrimitive.Content");
    expect(source).toContain("DialogPrimitive.Close");
    expect(source).toContain("DialogPrimitive.Portal");
  });
});
