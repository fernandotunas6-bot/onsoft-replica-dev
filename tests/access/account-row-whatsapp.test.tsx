// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AccountRowActions } from "@/features/access/AccountRowActions";

const m = vi.hoisted(() => ({ recovery: vi.fn(), suspend: vi.fn(), error: vi.fn() }));
vi.mock("@/features/access/server", () => ({
  resendSystemInvite: (...args: unknown[]) => m.recovery(...args),
  setSystemAccountDisabled: (...args: unknown[]) => m.suspend(...args),
  resetStaffPasswordDirect: vi.fn(),
  sendSystemInviteEmail: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: m.error, success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/step-up", () => ({ reportPossibleStepUp: () => false }));

const account = {
  id: "account-a",
  full_name: "Ana Teste",
  email: "ana@example.test",
  cargo: "Professor",
  disabled: false,
  is_self: false,
  last_sign_in_at: null,
  email_confirmed: true,
};
function show(canAdminister = true, whatsappEnabled = true) {
  render(
    <AccountRowActions
      account={account as never}
      canAdminister={canAdminister}
      whatsappEnabled={whatsappEnabled}
      onChanged={vi.fn()}
      onPrint={vi.fn()}
    />,
  );
  fireEvent.keyDown(screen.getByRole("button", { name: "Mais acções para Ana Teste" }), {
    key: "Enter",
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  m.recovery.mockResolvedValue({ actionLink: "https://example.test/recovery" });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("partilha de acesso por WhatsApp", () => {
  it("prepara a ligação e exige um clique explícito para abrir o WhatsApp", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    show();
    fireEvent.click(await screen.findByRole("menuitem", { name: /Partilhar acesso por WhatsApp/ }));
    const link = await screen.findByRole("link", { name: "Abrir WhatsApp" });
    expect(link.getAttribute("href")).toContain(
      encodeURIComponent("https://example.test/recovery"),
    );
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(open).not.toHaveBeenCalled();
    expect(m.recovery).toHaveBeenCalledExactlyOnceWith({ data: { userId: "account-a" } });
    expect(screen.queryByRole("button", { name: "Suspender acesso" })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Fechar" }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole("link", { name: "Abrir WhatsApp" })).toBeNull());
    expect(m.suspend).not.toHaveBeenCalled();
  });
  it("não prepara partilha sem integração instalada", async () => {
    show(true, false);
    await screen.findByRole("menuitem", { name: /Ver perfil/ });
    expect(screen.queryByRole("menuitem", { name: /Partilhar acesso por WhatsApp/ })).toBeNull();
    expect(m.recovery).not.toHaveBeenCalled();
  });
  it("não oferece ligação de acesso a quem não administra contas", async () => {
    show(false);
    await screen.findByRole("menuitem", { name: /Ver perfil/ });
    expect(screen.queryByRole("menuitem", { name: /Partilhar acesso por WhatsApp/ })).toBeNull();
    expect(m.recovery).not.toHaveBeenCalled();
  });
  it("uma recusa do servidor não abre partilha nem suspende a conta", async () => {
    m.recovery.mockRejectedValueOnce(new Error("Conta partilhada entre escolas"));
    show();
    fireEvent.click(await screen.findByRole("menuitem", { name: /Partilhar acesso por WhatsApp/ }));
    await waitFor(() => expect(m.error).toHaveBeenCalledWith("Conta partilhada entre escolas"));
    expect(screen.queryByRole("link", { name: "Abrir WhatsApp" })).toBeNull();
    expect(m.suspend).not.toHaveBeenCalled();
  });
});
