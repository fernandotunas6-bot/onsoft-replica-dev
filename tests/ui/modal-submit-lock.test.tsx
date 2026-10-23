// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FormModal } from "@/components/ui/modal-system/FormModal";
import { QuickModal } from "@/components/ui/modal-system/QuickModal";
import { WizardModal } from "@/components/ui/modal-system/WizardModal";

afterEach(cleanup);

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("operações únicas nos formulários partilhados", () => {
  it.each(["quick", "form", "wizard"] as const)(
    "bloqueia Enter e cliques repetidos durante a operação em %s",
    async (kind) => {
      const pending = deferred();
      const submit = vi.fn(() => pending.promise);
      const common = {
        open: true,
        title: "Editar dados",
        onOpenChange: vi.fn(),
        onSubmit: submit,
        children: <p>Dados de ensaio</p>,
      };
      render(
        kind === "quick" ? (
          <QuickModal {...common} />
        ) : kind === "form" ? (
          <FormModal {...common} />
        ) : (
          <WizardModal
            {...common}
            steps={[{ id: 1, label: "Rever" }]}
            currentStepIndex={0}
            onStepChange={vi.fn()}
          />
        ),
      );
      const form = screen.getByText("Dados de ensaio").closest("form")!;
      act(() => {
        fireEvent.submit(form);
        fireEvent.submit(form);
      });
      expect(submit).toHaveBeenCalledOnce();
      expect(screen.getByRole("button", { name: "Fechar" }).hasAttribute("disabled")).toBe(
        true,
      );
      expect(
        screen
          .getByRole("button", {
            name: kind === "quick" ? "Confirmar" : kind === "form" ? "Guardar" : "Concluir",
          })
          .hasAttribute("disabled"),
      ).toBe(true);
      await act(async () => {
        pending.resolve();
        await pending.promise;
      });
      fireEvent.submit(form);
      expect(submit).toHaveBeenCalledTimes(2);
    },
  );

  it("não contorna disabled com Enter ou envio programático", () => {
    const submit = vi.fn();
    render(
      <FormModal open title="Editar dados" onOpenChange={vi.fn()} disabled onSubmit={submit}>
        <p>Formulário</p>
      </FormModal>,
    );
    fireEvent.submit(screen.getByText("Formulário").closest("form")!);
    expect(submit).not.toHaveBeenCalled();
  });
});
