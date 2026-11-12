// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QuickFormModal } from "@/components/modals/QuickFormModal";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";

/**
 * Dois cliques no mesmo instante em «Guardar» chegavam os dois ao servidor antes de o
 * botão ficar desactivado: num pagamento parcial, dois recibos do mesmo valor.
 */
describe("QuickFormModal: um envio de cada vez", () => {
  afterEach(cleanup);

  it("o segundo clique durante o envio não envia outra vez", async () => {
    let calls = 0;
    let finish: () => void = () => undefined;
    render(
      <QuickFormModal
        title="Receber pagamento"
        fields={[{ name: "valor", label: "Valor", required: false }]}
        onSubmit={() => {
          calls += 1;
          return new Promise<void>((resolve) => {
            finish = resolve;
          });
        }}
        trigger={(open) => (
          <button type="button" onClick={open}>
            abrir
          </button>
        )}
      />,
    );
    fireEvent.click(screen.getByText("abrir"));
    const save = screen.getByRole("button", { name: /Guardar/ });
    // Os dois cliques antes de o React voltar a desenhar o botão.
    act(() => {
      save.click();
      save.click();
    });
    expect(calls).toBe(1);
    await act(async () => finish());
  });
});

describe("ConfirmActionModal: uma confirmação de cada vez", () => {
  afterEach(cleanup);

  it("o segundo clique durante a confirmação não confirma outra vez", async () => {
    let calls = 0;
    let finish: () => void = () => undefined;
    render(
      <ConfirmActionModal
        title="Estornar recibo"
        description="Confirma?"
        confirmLabel="Estornar"
        onConfirm={() => {
          calls += 1;
          return new Promise<void>((resolve) => {
            finish = resolve;
          });
        }}
        trigger={(open) => (
          <button type="button" onClick={open}>
            abrir
          </button>
        )}
      />,
    );
    fireEvent.click(screen.getByText("abrir"));
    const confirm = screen.getByRole("button", { name: /Estornar/ });
    act(() => {
      confirm.click();
      confirm.click();
    });
    expect(calls).toBe(1);
    await act(async () => finish());
  });
});
