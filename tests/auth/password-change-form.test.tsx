// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Mudar a senha dentro do SIGA (Perfil, Definições, primeiro acesso).
 *
 * A reautenticação com a senha actual (`signInWithPassword`) cria uma sessão
 * aal1. Numa conta com 2FA verificado, o Supabase Auth recusa a nova senha
 * nessa sessão (`insufficient_aal`, supabase/auth#1766): antes desta correcção
 * a pessoa via só «Não foi possível actualizar a senha». Agora pede-se o
 * segundo factor e só depois se grava.
 */

const signInWithPasswordMock = vi.fn(async (_input: unknown) => ({ error: null }));
const updateUserMock = vi.fn(async (_input: unknown) => ({ error: null as unknown }));
const signOutMock = vi.fn(async (_input: unknown) => ({ error: null }));
const noSecondFactor = async () => ({
  data: { currentLevel: "aal1", nextLevel: "aal1" },
  error: null,
});
const aalMock = vi.fn(noSecondFactor);
type FactorList = {
  data: { totp: Array<{ id: string; status: string }>; webauthn: Array<{ id: string }> };
  error: null;
};
const noFactors = async (): Promise<FactorList> => ({
  data: { totp: [], webauthn: [] },
  error: null,
});
const listFactorsMock = vi.fn(noFactors);
const challengeMock = vi.fn(async (_input: unknown) => ({
  data: { id: "challenge-1" },
  error: null,
}));
const mfaVerifyMock = vi.fn(async (_input: unknown) => ({ data: {}, error: null }));
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: (input: unknown) => signInWithPasswordMock(input),
      updateUser: (input: unknown) => updateUserMock(input),
      signOut: (input: unknown) => signOutMock(input),
      mfa: {
        getAuthenticatorAssuranceLevel: () => aalMock(),
        listFactors: () => listFactorsMock(),
        challenge: (input: unknown) => challengeMock(input),
        verify: (input: unknown) => mfaVerifyMock(input),
      },
    },
  },
}));
vi.mock("@/components/auth/AuthGate", () => ({
  useAuthSession: () => ({ user: { id: "u1", email: "secretaria@escola.ao" } }),
}));
vi.mock("@/components/ui/stacked-modal", () => ({ useOptionalStackNav: () => null }));
vi.mock("@/lib/pwned-password", () => ({ passwordExposureCount: async () => 0 }));
vi.mock("@/lib/toast", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const withTotp = async (): Promise<FactorList> => ({
  data: { totp: [{ id: "totp-1", status: "verified" }], webauthn: [] },
  error: null,
});
const needsSecondFactor = async () => ({
  data: { currentLevel: "aal1", nextLevel: "aal2" },
  error: null,
});

async function renderForm() {
  const { PasswordChangeForm } = await import("@/features/auth/PasswordChangeForm");
  render(<PasswordChangeForm />);
  fireEvent.change(screen.getByLabelText("Senha actual"), { target: { value: "Antiga-123" } });
  fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "NovaSenha-2026" } });
  fireEvent.change(screen.getByLabelText("Confirmar nova senha"), {
    target: { value: "NovaSenha-2026" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Actualizar senha/ }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  aalMock.mockImplementation(noSecondFactor);
  listFactorsMock.mockImplementation(noFactors);
});

describe("PasswordChangeForm", () => {
  it("conta sem 2FA: reautentica, grava a senha e termina as outras sessões", async () => {
    await renderForm();

    await waitFor(() =>
      expect(updateUserMock).toHaveBeenCalledWith({ password: "NovaSenha-2026" }),
    );
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "secretaria@escola.ao",
      password: "Antiga-123",
    });
    await waitFor(() => expect(signOutMock).toHaveBeenCalledWith({ scope: "others" }));
    expect(toastSuccess).toHaveBeenCalled();
    expect(screen.queryByLabelText("Código da aplicação autenticadora")).toBeNull();
  });

  it("conta com 2FA: pede o segundo factor depois da senha actual e só então grava", async () => {
    aalMock.mockImplementation(needsSecondFactor);
    listFactorsMock.mockImplementation(withTotp);
    await renderForm();

    const code = await screen.findByLabelText("Código da aplicação autenticadora");
    expect(updateUserMock).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();

    fireEvent.change(code, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar código" }));

    await waitFor(() =>
      expect(mfaVerifyMock).toHaveBeenCalledWith({
        factorId: "totp-1",
        challengeId: "challenge-1",
        code: "123456",
      }),
    );
    await waitFor(() =>
      expect(updateUserMock).toHaveBeenCalledWith({ password: "NovaSenha-2026" }),
    );
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(screen.queryByLabelText("Código da aplicação autenticadora")).toBeNull();
  });

  it("recusa insufficient_aal do servidor: mostra a confirmação em vez do erro genérico", async () => {
    aalMock.mockImplementationOnce(noSecondFactor).mockImplementation(needsSecondFactor);
    listFactorsMock.mockImplementation(withTotp);
    updateUserMock
      .mockResolvedValueOnce({
        error: {
          code: "insufficient_aal",
          message: "AAL2 session is required to update email or password when MFA is enabled.",
        },
      })
      .mockResolvedValueOnce({ error: null });
    await renderForm();

    const code = await screen.findByLabelText("Código da aplicação autenticadora");
    expect(toastError).not.toHaveBeenCalled();
    fireEvent.change(code, { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar código" }));

    await waitFor(() => expect(updateUserMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  });
});
