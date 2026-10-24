// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NAV_DEPTH_CLASS } from "@/components/layout/NavItem";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { PremiumModal } from "@/components/ui/premium-modal";

afterEach(cleanup);

describe("contrato visual partilhado — menus e modais simples", () => {
  it("mantém navegação compacta no desktop e toque de 44px em ecrãs pequenos", () => {
    expect(NAV_DEPTH_CLASS.root).toContain("min-h-11");
    expect(NAV_DEPTH_CLASS.root).toContain("lg:min-h-9");
    expect(NAV_DEPTH_CLASS.sub).toContain("min-h-11");
    expect(NAV_DEPTH_CLASS.sub).toContain("lg:h-8");
    expect(NAV_DEPTH_CLASS.sub).toContain("lg:min-h-8");
    expect(NAV_DEPTH_CLASS.sub).not.toContain("max-h-8");
  });

  it("preserva exactamente as duas acções de um diálogo simples, com área de toque segura", () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent>
          <DialogTitle>Editar dados</DialogTitle>
          <DialogFooter>
            <button type="button">Cancelar</button>
            <button type="button">Guardar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );
    const footer = screen.getByRole("button", { name: "Guardar" }).parentElement;
    expect(footer?.className).toContain("[&>button]:min-h-11");
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fechar" })).toBeTruthy();
  });

  it("mantém o PremiumModal funcional e legível, sem sombra forte ou rodapé decorativo", () => {
    render(
      <PremiumModal
        open
        onOpenChange={() => {}}
        title="Editar documento"
        description="Conservar os campos existentes."
        footer={
          <>
            <button type="button">Cancelar</button>
            <button type="button">Guardar</button>
          </>
        }
      >
        <label htmlFor="documento-nome">Nome</label>
        <input id="documento-nome" />
      </PremiumModal>,
    );
    const dialog = screen.getByRole("dialog", { name: "Editar documento" });
    expect(dialog.className).toContain("shadow-sm");
    expect(dialog.className).not.toContain("shadow-xl");
    expect(screen.getByRole("textbox", { name: "Nome" })).toBeTruthy();
    const footer = screen.getByRole("button", { name: "Guardar" }).parentElement;
    expect(footer?.className).toContain("bg-card");
    expect(footer?.className).not.toContain("bg-secondary/40");
  });
});
