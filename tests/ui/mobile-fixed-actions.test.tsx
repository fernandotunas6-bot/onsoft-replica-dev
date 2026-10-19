// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { SaveBar } from "@/components/mobile/SaveBar";
import { MobileTabs } from "@/components/mobile/MobileTabs";
import { PremiumModal } from "@/components/ui/premium-modal";

afterEach(cleanup);

describe("barra de guardar no mobile e desktop", () => {
  it("fica acima da navegação mobile e permite alcançar o fim do formulário", () => {
    const onSave = vi.fn();
    const { container } = render(<SaveBar onSave={onSave} onCancel={vi.fn()} />);
    const save = screen.getByRole("button", { name: "Guardar alterações" });
    const fixed = save.closest("div.fixed");
    expect(fixed?.className).toContain("bottom-above-nav");
    expect(fixed?.className).toContain("lg:bottom-0");
    expect(fixed?.className).toContain("z-40");
    expect(container.querySelector('[aria-hidden="true"].h-24')).toBeTruthy();
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("não permite guardar quando não há alterações", () => {
    const onSave = vi.fn();
    render(<SaveBar onSave={onSave} dirty={false} />);
    const save = screen.getByRole("button", { name: "Guardar alterações" });
    expect(save.hasAttribute("disabled")).toBe(true);
    fireEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("separadores de navegação compactos", () => {
  const tabs = [
    { id: "resumo", label: "Resumo" },
    { id: "alunos", label: "Alunos" },
    { id: "turmas", label: "Turmas" },
  ];

  it("navega com setas, Home e End sem deslocar a página inteira", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<MobileTabs tabs={tabs} activeId="resumo" onSelect={onSelect} />);
    const all = screen.getAllByRole("tab");
    expect(all.map((tab) => tab.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    fireEvent.keyDown(all[0], { key: "ArrowRight" });
    expect(onSelect).toHaveBeenLastCalledWith("alunos");
    expect(document.activeElement).toBe(all[1]);
    rerender(<MobileTabs tabs={tabs} activeId="alunos" onSelect={onSelect} />);
    expect(screen.getByRole("tab", { name: "Alunos" }).getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(all[1], { key: "End" });
    expect(onSelect).toHaveBeenLastCalledWith("turmas");
    fireEvent.keyDown(all[2], { key: "Home" });
    expect(onSelect).toHaveBeenLastCalledWith("resumo");
    fireEvent.keyDown(all[0], { key: "ArrowLeft" });
    expect(onSelect).toHaveBeenLastCalledWith("turmas");
  });

  it("permite focar o primeiro separador quando o identificador não existe", () => {
    render(<MobileTabs tabs={tabs} activeId="pendente" onSelect={vi.fn()} />);
    expect(screen.getAllByRole("tab")[0].getAttribute("tabindex")).toBe("0");
    expect(screen.getByRole("tablist", { name: "Separadores da página" })).toBeTruthy();
  });
});

describe("modal institucional partilhado", () => {
  it("mantém conteúdo longo e acções dentro da altura dinâmica do ecrã", () => {
    render(
      <PremiumModal
        open
        onOpenChange={vi.fn()}
        title="Inscrição escolar"
        size="full"
        footer={<button type="button">Guardar inscrição</button>}
      >
        <p>Dados do encarregado</p>
      </PremiumModal>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("max-h-[calc(100dvh-2rem)]");
    expect(dialog.className).toContain("flex-col");
    const body = screen.getByText("Dados do encarregado").parentElement;
    expect(body?.className).toContain("min-h-0");
    expect(body?.className).toContain("overflow-y-auto");
    expect(screen.getByRole("button", { name: "Guardar inscrição" })).toBeTruthy();
  });
});
