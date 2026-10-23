// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { User, Building2, Sliders } from "lucide-react";
import { StackedModal, useStackNav, type StackPanel } from "@/components/ui/stacked-modal";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Editor() {
  const nav = useStackNav();
  const { reportDirty } = nav;
  useEffect(() => {
    reportDirty(true);
    return () => reportDirty(false);
  }, [reportDirty]);
  return <button onClick={nav.close}>Fechar formulário</button>;
}
const panels: StackPanel[] = [
  {
    id: "root",
    title: "Definições",
    icon: Sliders,
    rows: [
      { label: "Conta", icon: User, to: "conta" },
      { label: "Escola", icon: Building2, to: "escola" },
    ],
  },
  { id: "conta", title: "Conta", icon: User, render: () => <Editor /> },
  { id: "escola", title: "Escola", icon: Building2, render: () => <p>Dados institucionais</p> },
];

describe("definições em página e modal", () => {
  it("apresenta o mesmo conteúdo em página sem overlay, captura de foco ou bloqueio do body", () => {
    render(
      <StackedModal
        open
        presentation="page"
        panels={panels}
        rootId="root"
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Definições" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.hasAttribute("data-scroll-locked")).toBe(false);
    expect(screen.getByRole("button", { name: "Escola" })).toBeTruthy();
  });
  it.each(["page", "modal"] as const)(
    "protege os dados ao trocar categoria em %s",
    (presentation) => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      render(
        <StackedModal
          open
          presentation={presentation}
          panels={panels}
          rootId="root"
          onOpenChange={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Escola" }));
      expect(confirm).toHaveBeenCalledOnce();
      expect(screen.queryByText("Dados institucionais")).toBeNull();
      confirm.mockReturnValue(true);
      fireEvent.click(screen.getByRole("button", { name: "Escola" }));
      expect(screen.getByText("Dados institucionais")).toBeTruthy();
    },
  );
  it("consulta o estado dirty actual ao fechar pelo formulário", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const close = vi.fn();
    render(
      <StackedModal open presentation="page" panels={panels} rootId="root" onOpenChange={close} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Fechar formulário" }));
    expect(close).not.toHaveBeenCalled();
  });
  it("mantém a apresentação modal disponível quando pedida explicitamente", () => {
    render(
      <StackedModal
        open
        panels={panels}
        rootId="root"
        onOpenChange={vi.fn()}
        initialPanelId="escola"
      />,
    );
    expect(screen.getByRole("dialog", { name: "Configurações" })).toBeTruthy();
    expect(screen.getByText("Dados institucionais")).toBeTruthy();
  });
  it("um painel limpo não apaga alterações pendentes de outra secção visível", () => {
    function Clean() {
      const { reportDirty } = useStackNav();
      useEffect(() => {
        reportDirty(false);
      }, [reportDirty]);
      return <p>Secção sem alterações</p>;
    }
    const grouped: StackPanel[] = panels.map((panel) =>
      panel.id === "conta"
        ? {
            ...panel,
            render: undefined,
            rows: [
              { label: "Perfil", icon: User, to: "editor" },
              { label: "Preferências", icon: Sliders, to: "clean" },
            ],
          }
        : panel,
    );
    grouped.push({ id: "editor", title: "Perfil", icon: User, render: () => <Editor /> });
    grouped.push({ id: "clean", title: "Preferências", icon: Sliders, render: () => <Clean /> });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <StackedModal
        open
        presentation="page"
        panels={grouped}
        rootId="root"
        onOpenChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Escola" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.queryByText("Dados institucionais")).toBeNull();
  });
});
