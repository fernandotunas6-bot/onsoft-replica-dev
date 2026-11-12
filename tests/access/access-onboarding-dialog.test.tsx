// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  invite: vi.fn(),
  createPerson: vi.fn(),
  updateCargo: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/features/access/server", () => ({
  inviteSystemUser: m.invite,
  updateSystemAccountCargo: m.updateCargo,
  listSystemAccounts: vi.fn(),
}));
vi.mock("@/features/people/server", () => ({ createPerson: m.createPerson }));
vi.mock("@/lib/toast", () => ({
  toast: { success: m.success, warning: m.warning, error: m.error },
}));
vi.mock("@/lib/step-up", () => ({ reportPossibleStepUp: () => false }));

const { AccessOnboardingDialog } = await import("@/features/access/AccessOnboardingDialog");

type Account = Parameters<typeof AccessOnboardingDialog>[0]["accounts"][number];
function mount(accounts: Account[] = []) {
  const onChanged = vi.fn().mockResolvedValue(undefined);
  render(
    <AccessOnboardingDialog
      accounts={accounts}
      accountsLoading={false}
      accountsError={false}
      secretMissing={false}
      isAdministrator
      onChanged={onChanged}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
  return onChanged;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(cleanup);

describe("Adicionar à equipa", () => {
  it("não fecha enquanto o convite grava e mantém o texto se a gravação falhar", async () => {
    let fail: (error: Error) => void = () => {};
    m.invite.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    mount();
    fireEvent.change(screen.getByLabelText("Nome completo"), {
      target: { value: "Maria António" },
    });
    fireEvent.change(screen.getByLabelText(/E-mail do funcionário/), {
      target: { value: "maria@escola.ao" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Criar e enviar convite" }));
    await waitFor(() => expect(m.invite).toHaveBeenCalledTimes(1));

    // Com alterações, o Escape pede confirmação; descartar não pode fechar a meio do pedido.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    fireEvent.click(await screen.findByRole("button", { name: "Descartar alterações" }));
    expect(screen.getByText("Adicionar à equipa")).toBeTruthy();

    await act(async () => {
      fail(new Error("Endereço já usado noutra conta."));
    });
    await waitFor(() => expect(m.error).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Adicionar à equipa")).toBeTruthy();
    expect((screen.getByLabelText("Nome completo") as HTMLInputElement).value).toBe(
      "Maria António",
    );
  });

  it("registo sem login avisa quando a ficha RH ficou pendente", async () => {
    m.createPerson.mockResolvedValue({ id: "p1", hrRegistration: "pending" });
    mount();
    fireEvent.click(screen.getByRole("tab", { name: /Sem login/ }));
    fireEvent.change(screen.getByLabelText("Nome completo"), {
      target: { value: "João Kiala" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar pessoa" }));
    await waitFor(() => expect(m.success).toHaveBeenCalledTimes(1));
    expect(m.warning).toHaveBeenCalledWith(
      "A ficha de Funcionários/RH ainda está pendente de sincronização.",
      expect.anything(),
    );
  });

  it("a lista de contas mostra o cargo entre parênteses, sem espaço a mais", () => {
    mount([
      {
        id: "u1",
        full_name: "Ana Tchipa",
        email: "ana@escola.ao",
        cargo: "Utilizador",
        is_self: false,
      } as Account,
    ]);
    fireEvent.click(screen.getByRole("tab", { name: /Conta existente/ }));
    expect(
      screen.getByRole("option", { name: "Ana Tchipa — ana@escola.ao (Utilizador)" }),
    ).toBeTruthy();
  });
});
