import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConnectedMobile } from "../staging/Connected";
const fixture = vi.hoisted(() => ({
  getSession: vi.fn(),
  signInWithPassword: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  listFactors: vi.fn(),
  verify: vi.fn(),
  passkey: vi.fn(),
  passkeysSupported: vi.fn(() => false),
  platformHost: vi.fn(() => false),
}));
vi.mock("../../src/integrations/supabase/client", () => ({ supabase: { auth: fixture } }));
vi.mock("../../src/features/auth/verification", () => ({
  listVerificationFactors: fixture.listFactors,
  sessionAal: () => "aal1",
  verifyWithCode: fixture.verify,
  verifyWithPasskey: fixture.passkey,
  passkeysSupported: fixture.passkeysSupported,
  passkeyErrorMessage: () => "Não foi possível confirmar com a chave de acesso.",
}));
vi.mock("../../src/lib/saas/platform-domain", () => ({
  isPlatformOwnedHostname: fixture.platformHost,
}));
vi.mock("../../src/features/mobile-v4/browser", () => ({ createSigaMobileV4Gateway: () => ({}) }));
vi.mock("../src/App", () => ({ App: () => <div>Institutional application mounted</div> }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  fixture.passkeysSupported.mockReturnValue(false);
  fixture.platformHost.mockReturnValue(false);
});
it("shows actual login controls and clears password after a rejected SDK sign-in", async () => {
  fixture.getSession.mockResolvedValue({ data: { session: null }, error: null });
  fixture.signInWithPassword.mockResolvedValue({ error: new Error("private detail") });
  render(<ConnectedMobile />);
  const email = await screen.findByLabelText("E-mail institucional");
  fireEvent.change(email, { target: { value: "teacher@example.test" } });
  fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "test credential" } });
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
  await screen.findByText("Não foi possível entrar. Verifica o e-mail e a senha.");
  expect((screen.getByLabelText("Senha") as HTMLInputElement).value).toBe("");
  expect(screen.queryByText("private detail")).toBeNull();
  expect(fixture.signInWithPassword).toHaveBeenCalledWith({
    email: "teacher@example.test",
    password: "test credential",
  });
});
it("requires the existing verified TOTP before mounting an aal1 account with MFA", async () => {
  fixture.getSession.mockResolvedValue({
    data: { session: { access_token: "local-token" } },
    error: null,
  });
  fixture.listFactors.mockResolvedValue({ totpId: "configured-factor", passkeyId: null });
  fixture.verify.mockRejectedValue(new Error("invalid"));
  render(<ConnectedMobile />);
  await screen.findByLabelText("Código de autenticação");
  expect(screen.queryByText("Institutional application mounted")).toBeNull();
  fireEvent.change(screen.getByLabelText("Código de autenticação"), {
    target: { value: "123456" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar código" }));
  await screen.findByText("Código inválido ou expirado.");
  expect(fixture.verify).toHaveBeenCalledWith("configured-factor", "123456");
});
it("offers the passkey only on the platform host where its RP ID is valid", async () => {
  fixture.getSession.mockResolvedValue({
    data: { session: { access_token: "local-token" } },
    error: null,
  });
  fixture.listFactors.mockResolvedValue({ totpId: null, passkeyId: "passkey-factor" });
  fixture.passkeysSupported.mockReturnValue(true);
  fixture.passkey.mockRejectedValue(new Error("cancelled"));
  const { unmount } = render(<ConnectedMobile />);
  await screen.findByText(/chave ligada ao domínio do portal/);
  expect(screen.queryByRole("button", { name: "Confirmar com a chave de acesso" })).toBeNull();
  unmount();

  fixture.platformHost.mockReturnValue(true);
  render(<ConnectedMobile />);
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar com a chave de acesso" }));
  await screen.findByText("Não foi possível confirmar com a chave de acesso.");
  expect(fixture.passkey).toHaveBeenCalledWith("passkey-factor");
  expect(screen.queryByText(/chave ligada ao domínio do portal/)).toBeNull();
});
