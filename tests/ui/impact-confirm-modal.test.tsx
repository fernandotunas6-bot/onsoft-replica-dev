// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ImpactConfirmModal } from "@/components/modals/ImpactConfirmModal";
import type { DeletionImpact } from "@/features/school/deletion-impact";

const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: toastMocks }));

afterEach(cleanup);

function setup(loadImpact: () => Promise<DeletionImpact>, onConfirm = vi.fn(async () => {})) {
  render(
    <ImpactConfirmModal
      title="Desactivar esta turma?"
      verb="Desactivar"
      itemType="a turma"
      itemName="7.ª A"
      confirmLabel="Desactivar turma"
      loadImpact={loadImpact}
      onConfirm={onConfirm}
      trigger={(open) => <button onClick={open}>Abrir</button>}
    />,
  );
  fireEvent.click(screen.getByText("Abrir"));
  const confirm = () =>
    screen.getByRole("button", { name: "Desactivar turma" }) as HTMLButtonElement;
  return { onConfirm, confirm };
}

describe("confirmação com impacto contado no servidor", () => {
  it("não deixa confirmar enquanto calcula; depois mostra o impacto", async () => {
    let resolve!: (impact: DeletionImpact) => void;
    const { confirm, onConfirm } = setup(() => new Promise((r) => (resolve = r)));
    expect(screen.getByText("A calcular o impacto…")).toBeTruthy();
    expect(confirm().disabled).toBe(true);
    resolve({
      impacts: [{ label: "avaliação(ões) — ficam no histórico", count: 3 }],
      blocker: null,
      warning: "A turma fica arquivada.",
    });
    await waitFor(() => expect(confirm().disabled).toBe(false));
    expect(screen.getByText("3 avaliação(ões) — ficam no histórico")).toBeTruthy();
    expect(screen.getByText("A turma fica arquivada.")).toBeTruthy();
    fireEvent.click(confirm());
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it("com bloqueio do servidor, mostra o motivo e não confirma", async () => {
    const { confirm, onConfirm } = setup(async () => ({
      impacts: [{ label: "matrícula(s) activa(s) ou pendente(s)", count: 12 }],
      blocker: "A turma ainda tem matrículas activas ou pendentes.",
      warning: null,
    }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("matrículas"));
    expect(confirm().disabled).toBe(true);
    fireEvent.submit(confirm().closest("form")!);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("falha no cálculo não passa por «sem impacto»", async () => {
    const { confirm, onConfirm } = setup(async () => {
      throw new Error("Sem ligação ao servidor.");
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Sem ligação"));
    expect(confirm().disabled).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("a recusa do servidor ao confirmar chega ao utilizador com a razão", async () => {
    toastMocks.error.mockClear();
    const { confirm } = setup(
      async () => ({ impacts: [], blocker: null, warning: null }),
      vi.fn(async () => {
        throw new Error("Este professor ainda está ligado a disciplinas activas.");
      }),
    );
    await waitFor(() => expect(confirm().disabled).toBe(false));
    fireEvent.click(confirm());
    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith("Não foi possível concluir", {
        description: "Este professor ainda está ligado a disciplinas activas.",
      }),
    );
    // O diálogo continua aberto para tentar de novo ou cancelar.
    expect(screen.getByRole("button", { name: "Desactivar turma" })).toBeTruthy();
  });
});
