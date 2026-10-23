// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WizardModal } from "@/components/ui/modal-system/WizardModal";

afterEach(cleanup);

function setup(
  overrides: { currentStepIndex?: number; canProceed?: boolean; isSubmitting?: boolean } = {},
) {
  const onStepChange = vi.fn();
  const onSubmit = vi.fn();
  const view = render(
    <WizardModal
      open
      onOpenChange={vi.fn()}
      title="Nova matrícula"
      steps={[
        { id: "dados", label: "Dados" },
        { id: "turma", label: "Turma" },
        { id: "revisao", label: "Revisão" },
      ]}
      currentStepIndex={1}
      onStepChange={onStepChange}
      onSubmit={onSubmit}
      {...overrides}
    >
      <input aria-label="Nome" />
    </WizardModal>,
  );
  return { ...view, onStepChange, onSubmit };
}

describe("navegação por etapas", () => {
  it("torna etapas concluídas botões focáveis e identifica a etapa actual", () => {
    const { onStepChange } = setup();
    const completed = screen.getByRole("button", { name: "Etapa 1: Dados" });
    completed.focus();
    expect(document.activeElement).toBe(completed);
    fireEvent.click(completed);
    expect(onStepChange).toHaveBeenCalledExactlyOnceWith(0);
    expect(
      screen.getByRole("button", { name: "Etapa 2: Turma" }).getAttribute("aria-current"),
    ).toBe("step");
    expect(
      (screen.getByRole("button", { name: "Etapa 3: Revisão" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("não avança por submissão do formulário quando a etapa está inválida", () => {
    const { container, onStepChange, onSubmit } = setup({ canProceed: false });
    fireEvent.submit(container.ownerDocument.querySelector("form")!);
    expect(onStepChange).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("avança uma etapa válida e só conclui na última etapa", () => {
    const { onStepChange, onSubmit } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Avançar" }));
    expect(onStepChange).toHaveBeenCalledExactlyOnceWith(2);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("conclui a última etapa válida", () => {
    const { onSubmit, onStepChange } = setup({ currentStepIndex: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onStepChange).not.toHaveBeenCalled();
  });

  it("bloqueia mudanças de etapa e submissões enquanto está a guardar", () => {
    const { container, onStepChange, onSubmit } = setup({
      currentStepIndex: 2,
      isSubmitting: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Etapa 1: Dados" }));
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    fireEvent.submit(container.ownerDocument.querySelector("form")!);
    expect(onStepChange).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
