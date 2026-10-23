import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { Settings, User } from "lucide-react";
import { StackedModal, type StackPanel } from "@/components/ui/stacked-modal";

const panels: StackPanel[] = [
  {
    id: "root",
    title: "Definições",
    icon: Settings,
    rows: [
      { label: "Conta", icon: User, to: "conta" },
      { label: "Escola", icon: Settings, to: "escola" },
    ],
  },
  {
    id: "conta",
    title: "Conta",
    icon: User,
    render: (nav) => (
      <>
        <p>Dados da conta</p>
        <button type="button" onClick={() => nav.reportDirty(true)}>
          Editar conta
        </button>
        <button type="button" onClick={() => nav.push("escola")}>
          Ir para escola
        </button>
        <button type="button" onClick={nav.close}>
          Fechar painel
        </button>
      </>
    ),
  },
  {
    id: "escola",
    title: "Escola",
    icon: Settings,
    render: () => <p>Dados da escola</p>,
  },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Definições — rascunhos protegidos", () => {
  it("não perde alterações quando troca de categoria pela sidebar sem confirmação", () => {
    const confirmation = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<StackedModal open onOpenChange={vi.fn()} panels={panels} rootId="root" />);
    fireEvent.click(screen.getByRole("button", { name: "Editar conta" }));
    fireEvent.click(screen.getByRole("button", { name: "Escola" }));
    expect(confirmation).toHaveBeenCalledOnce();
    expect(screen.getByText("Dados da conta")).toBeTruthy();
    expect(screen.queryByText("Dados da escola")).toBeNull();
  });

  it("permite mudar de categoria após confirmar, sem perguntar outra vez", () => {
    const confirmation = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<StackedModal open onOpenChange={vi.fn()} panels={panels} rootId="root" />);
    fireEvent.click(screen.getByRole("button", { name: "Editar conta" }));
    fireEvent.click(screen.getByRole("button", { name: "Escola" }));
    expect(confirmation).toHaveBeenCalledOnce();
    expect(screen.getByText("Dados da escola")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Conta" }));
    expect(confirmation).toHaveBeenCalledOnce();
  });

  it("protege também a navegação interna e o fecho por acção do formulário", () => {
    const confirmation = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onOpenChange = vi.fn();
    render(<StackedModal open onOpenChange={onOpenChange} panels={panels} rootId="root" />);
    fireEvent.click(screen.getByRole("button", { name: "Editar conta" }));
    fireEvent.click(screen.getByRole("button", { name: "Ir para escola" }));
    fireEvent.click(screen.getByRole("button", { name: "Fechar painel" }));
    expect(confirmation).toHaveBeenCalledTimes(2);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText("Dados da conta")).toBeTruthy();
  });
});
