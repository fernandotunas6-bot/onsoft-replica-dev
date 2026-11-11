// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AccountBulkActions } from "@/features/access/AccountBulkActions";

const m = vi.hoisted(() => ({
  suspend: vi.fn(),
  stepUp: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock("@/features/access/server", () => ({
  setSystemAccountDisabled: (...args: unknown[]) => m.suspend(...args),
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: m.success, error: m.error, warning: m.warning },
}));
vi.mock("@/lib/step-up", () => ({
  reportPossibleStepUp: (...args: unknown[]) => m.stepUp(...args),
}));
const accounts = ["a", "b"].map((id) => ({
  id,
  full_name: `Conta ${id}`,
  email: `${id}@example.test`,
  cargo: "Professor",
  disabled: false,
  is_self: false,
}));
function props() {
  return {
    accounts: accounts as never,
    schoolId: "00000000-0000-4000-8000-000000000001",
    selectedIds: ["a", "b"],
    isAdministrator: true,
    contextKey: "user-a:school-a:Admin",
    onChanged: vi.fn(async () => {}),
    onClear: vi.fn(),
    onSelectionChange: vi.fn(),
  };
}
async function start() {
  fireEvent.keyDown(screen.getByRole("button", { name: "Acções dos seleccionados" }), {
    key: "Enter",
  });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Suspender acessos…" }));
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  m.suspend.mockResolvedValue({ notice: null });
  m.stepUp.mockReturnValue(false);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("contas em lote: resultados parciais e contexto", () => {
  it("não altera acessos antes de resolver a escola", async () => {
    render(<AccountBulkActions {...props()} schoolId={null} />);
    await start();
    expect(m.suspend).not.toHaveBeenCalled();
    expect(m.error).toHaveBeenCalledWith(
      "Aguarde a identificação da escola antes de alterar acessos.",
    );
  });
  it("não continua pedidos nem callbacks depois de sair da página", async () => {
    let resolve!: (value: object) => void;
    m.suspend.mockImplementationOnce(
      () =>
        new Promise((finish) => {
          resolve = finish;
        }),
    );
    const p = props();
    const view = render(<AccountBulkActions {...p} />);
    await start();
    await waitFor(() => expect(m.suspend).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => resolve({}));
    expect(m.suspend).toHaveBeenCalledTimes(1);
    expect(p.onChanged).not.toHaveBeenCalled();
    expect(p.onClear).not.toHaveBeenCalled();
  });
  it("mantém apenas as falhas seleccionadas para repetir", async () => {
    m.suspend.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("falha"));
    const p = props();
    render(<AccountBulkActions {...p} />);
    await start();
    await waitFor(() => expect(p.onSelectionChange).toHaveBeenCalledWith(["b"]));
    expect(p.onClear).not.toHaveBeenCalled();
    expect(m.success).toHaveBeenCalledWith("1 conta(s) suspensas.");
    expect(m.error).toHaveBeenCalledWith("1 falha(s): Conta b.");
  });
  it("interrupção de identidade conserva a conta actual e as ainda não tentadas", async () => {
    m.suspend.mockRejectedValueOnce(new Error("step-up"));
    m.stepUp.mockReturnValue(true);
    const p = props();
    render(<AccountBulkActions {...p} />);
    await start();
    await waitFor(() => expect(p.onSelectionChange).toHaveBeenCalledWith(["a", "b"]));
    expect(m.suspend).toHaveBeenCalledTimes(1);
    expect(p.onClear).not.toHaveBeenCalled();
    expect(m.success).not.toHaveBeenCalled();
  });
  it("limpa a selecção quando todas as operações são confirmadas", async () => {
    const p = props();
    render(<AccountBulkActions {...p} />);
    await start();
    await waitFor(() => expect(p.onClear).toHaveBeenCalledOnce());
    expect(m.suspend).toHaveBeenCalledTimes(2);
    expect(m.suspend).toHaveBeenNthCalledWith(1, {
      data: { userId: "a", disabled: true, expectedSchoolId: p.schoolId },
    });
    expect(m.suspend).toHaveBeenNthCalledWith(2, {
      data: { userId: "b", disabled: true, expectedSchoolId: p.schoolId },
    });
    expect(p.onSelectionChange).not.toHaveBeenCalled();
  });
  it("não continua o lote nem modifica a nova selecção após trocar de escola", async () => {
    let resolve!: (value: object) => void;
    m.suspend.mockImplementationOnce(
      () =>
        new Promise((finish) => {
          resolve = finish;
        }),
    );
    const p = props();
    const view = render(<AccountBulkActions {...p} />);
    await start();
    await waitFor(() => expect(m.suspend).toHaveBeenCalledTimes(1));
    view.rerender(<AccountBulkActions {...p} contextKey="user-a:school-b:Admin" />);
    await act(async () => resolve({}));
    expect(m.suspend).toHaveBeenCalledTimes(1);
    expect(p.onChanged).not.toHaveBeenCalled();
    expect(p.onSelectionChange).not.toHaveBeenCalled();
    expect(p.onClear).not.toHaveBeenCalled();
  });
  it("não perde o resultado confirmado se a actualização da lista falhar", async () => {
    const p = props();
    p.onChanged.mockRejectedValueOnce(new Error("rede"));
    render(<AccountBulkActions {...p} />);
    await start();
    await waitFor(() => expect(p.onClear).toHaveBeenCalledOnce());
    expect(m.success).toHaveBeenCalledWith("2 conta(s) suspensas.");
    expect(m.error).not.toHaveBeenCalled();
    expect(m.warning).toHaveBeenCalledWith("Actualize a página para ver os resultados.");
  });
});
