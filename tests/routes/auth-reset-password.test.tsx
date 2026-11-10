// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf } from "./_harness";

/**
 * Testes de montagem e render de `/auth/reset-password`.
 *
 * Mesma família de página pública que `/auth/magic-link` (lê
 * `window.location` directamente), mas com um formulário real por baixo:
 * requisitos de senha em tempo real, submissão e um fallback com um
 * segundo `setTimeout` de 800ms + `onAuthStateChange` para o caso em que a
 * sessão só fica disponível depois do cliente Supabase processar o hash.
 *
 * Valida:
 * 1. `?code=...` válido troca a sessão e mostra o formulário de nova senha.
 * 2. `?error=...&error_description=...` mostra a mensagem decodificada.
 * 3. `exchangeCodeForSession` falha → mensagem específica de código usado,
 *    não a genérica de "nenhum token encontrado".
 * 4. Sem parâmetros e sem sessão inicial: `onAuthStateChange` a disparar
 *    `PASSWORD_RECOVERY` antes do retry de 800ms ainda assim desbloqueia o
 *    formulário — a segunda via de entrada da sessão, não só a consulta directa.
 * 5. Requisitos de senha em tempo real desbloqueiam "Atualizar Senha" só
 *    quando todos batem certo, e a submissão chama `updateUser` com a senha
 *    (sem espaços à volta) e mostra o ecrã de sucesso.
 * 6. Conta com 2FA: o Supabase só aceita a nova senha numa sessão aal2
 *    (supabase/auth#1766) e o link de recuperação dá aal1. Pede-se o segundo
 *    factor antes de gravar — também quando é o servidor a recusar.
 */

const exchangeCodeForSessionMock = vi.fn();
const verifyOtpMock = vi.fn();
const getSessionMock = vi.fn();
const updateUserMock = vi.fn();
const noSecondFactor = async () => ({
  data: { currentLevel: "aal1", nextLevel: "aal1" },
  error: null,
});
const aalMock = vi.fn(noSecondFactor);
const noFactors = async () => ({ data: { totp: [], webauthn: [] }, error: null });
const listFactorsMock = vi.fn(noFactors);
const challengeMock = vi.fn(async (_input: unknown) => ({
  data: { id: "challenge-1" },
  error: null,
}));
const mfaVerifyMock = vi.fn(async (_input: unknown) => ({ data: {}, error: null }));
// Sem rede nos testes: a verificação de fugas (HaveIBeenPwned) é simulada.
const exposureMock = vi.fn(async (_password: string): Promise<number | null> => 0);
vi.mock("@/lib/pwned-password", () => ({
  passwordExposureCount: (password: string) => exposureMock(password),
}));
let authStateCallback: ((event: string, session: unknown) => void) | null = null;
const unsubscribeMock = vi.fn();

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/features/saas/tenant-context", () => ({
  useTenant: () => ({ activeTenant: { name: "Complexo Escolar Teste" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: (code: string) => exchangeCodeForSessionMock(code),
      verifyOtp: (input: unknown) => verifyOtpMock(input),
      getSession: () => getSessionMock(),
      updateUser: (input: unknown) => updateUserMock(input),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        authStateCallback = cb;
        return { data: { subscription: { unsubscribe: unsubscribeMock } } };
      },
      mfa: {
        getAuthenticatorAssuranceLevel: () => aalMock(),
        listFactors: () => listFactorsMock(),
        challenge: (input: unknown) => challengeMock(input),
        verify: (input: unknown) => mfaVerifyMock(input),
      },
    },
  },
}));

const withTotp = async () => ({
  data: { totp: [{ id: "totp-1", status: "verified" }], webauthn: [] },
  error: null,
});
const needsSecondFactor = async () => ({
  data: { currentLevel: "aal1", nextLevel: "aal2" },
  error: null,
});

async function fillValidPassword() {
  const passwordInput = await screen.findByLabelText("Nova senha");
  fireEvent.change(passwordInput, { target: { value: "Senha123!" } });
  fireEvent.change(screen.getByLabelText("Confirmar nova senha"), {
    target: { value: "Senha123!" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Atualizar Senha/ }));
}

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/auth.reset-password");
  return routeComponentOf(mod);
}

function navigateTo(url: string) {
  window.history.pushState(null, "", url);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  aalMock.mockImplementation(noSecondFactor);
  listFactorsMock.mockImplementation(noFactors);
  vi.useRealTimers();
  authStateCallback = null;
  window.history.pushState(null, "", "/");
});

describe("/auth/reset-password", () => {
  it("?code=... válido troca a sessão e mostra o formulário de nova senha", async () => {
    navigateTo("/auth/reset-password?code=abc123");
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByLabelText("Nova senha")).toBeDefined();
    });
    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("abc123");
  });

  it("?error=...&error_description=... mostra a mensagem decodificada do URL", async () => {
    navigateTo("/auth/reset-password?error=access_denied&error_description=Link+j%C3%A1+expirado");

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Link já expirado")).toBeDefined();
    });
    expect(exchangeCodeForSessionMock).not.toHaveBeenCalled();
  });

  it("código já usado mostra a mensagem específica, não a genérica de token em falta", async () => {
    navigateTo("/auth/reset-password?code=usado-2x");
    exchangeCodeForSessionMock.mockRejectedValue(new Error("invalid_grant"));

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(
        screen.getByText("O código de recuperação de senha é inválido ou já foi utilizado."),
      ).toBeDefined();
    });
    expect(
      screen.queryByText(
        "Nenhum token de recuperação encontrado ou a sessão de redefinição expirou.",
      ),
    ).toBeNull();
  });

  it("sem parâmetros no URL, um evento PASSWORD_RECOVERY do listener desbloqueia o formulário", async () => {
    navigateTo("/auth/reset-password");
    getSessionMock.mockResolvedValue({ data: { session: null } });

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(authStateCallback).not.toBeNull();
    });
    authStateCallback?.("PASSWORD_RECOVERY", { user: { id: "u1" } });

    await waitFor(() => {
      expect(screen.getByLabelText("Nova senha")).toBeDefined();
    });
  });

  it("só habilita 'Atualizar Senha' quando os requisitos batem certo, e submete a senha sem espaços", async () => {
    navigateTo("/auth/reset-password?code=abc123");
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });
    updateUserMock.mockResolvedValue({ error: null });

    const Page = await loadPage();
    renderRoute(Page);

    const passwordInput = await screen.findByLabelText("Nova senha");
    const confirmInput = screen.getByLabelText("Confirmar nova senha");
    const submitButton = screen.getByRole("button", { name: /Atualizar Senha/ });

    expect(submitButton).toHaveProperty("disabled", true);

    // Só letras, sem número — continua inválido.
    fireEvent.change(passwordInput, { target: { value: "somente-letras" } });
    fireEvent.change(confirmInput, { target: { value: "somente-letras" } });
    expect(submitButton).toHaveProperty("disabled", true);

    // Senha válida mas confirmação não bate certo.
    fireEvent.change(passwordInput, { target: { value: "Senha123!" } });
    fireEvent.change(confirmInput, { target: { value: "Diferente1" } });
    expect(submitButton).toHaveProperty("disabled", true);

    // Confirmação a bater certo — formulário válido.
    fireEvent.change(confirmInput, { target: { value: "Senha123!" } });
    expect(submitButton).toHaveProperty("disabled", false);

    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(updateUserMock).toHaveBeenCalledWith({ password: "Senha123!" });
    });
    await waitFor(() => {
      expect(screen.getByText("Senha atualizada com sucesso!")).toBeDefined();
    });
  });

  it("recusa uma senha que aparece em fugas de dados, sem chamar updateUser", async () => {
    navigateTo("/auth/reset-password?code=abc123");
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });
    exposureMock.mockResolvedValueOnce(42);

    const Page = await loadPage();
    renderRoute(Page);

    const passwordInput = await screen.findByLabelText("Nova senha");
    fireEvent.change(passwordInput, { target: { value: "Senha123!" } });
    fireEvent.change(screen.getByLabelText("Confirmar nova senha"), {
      target: { value: "Senha123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Atualizar Senha/ }));

    await waitFor(() => expect(exposureMock).toHaveBeenCalledWith("Senha123!"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Atualizar Senha/ })).toHaveProperty(
        "disabled",
        false,
      ),
    );
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("conta com 2FA: pede o código antes de gravar e só depois chama updateUser", async () => {
    navigateTo("/auth/reset-password?code=abc123");
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });
    aalMock.mockImplementation(needsSecondFactor);
    listFactorsMock.mockImplementation(withTotp);
    updateUserMock.mockResolvedValue({ error: null });

    const Page = await loadPage();
    renderRoute(Page);
    await fillValidPassword();

    const codeInput = await screen.findByLabelText("Código da aplicação autenticadora");
    expect(updateUserMock).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Nova senha")).toBeNull();

    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar código" }));

    await waitFor(() =>
      expect(mfaVerifyMock).toHaveBeenCalledWith({
        factorId: "totp-1",
        challengeId: "challenge-1",
        code: "123456",
      }),
    );
    await waitFor(() => expect(updateUserMock).toHaveBeenCalledWith({ password: "Senha123!" }));
    await waitFor(() => expect(screen.getByText("Senha atualizada com sucesso!")).toBeDefined());
  });

  it("recusa insufficient_aal do servidor: mostra a confirmação em vez de um erro", async () => {
    navigateTo("/auth/reset-password?code=abc123");
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });
    // A consulta antes de gravar ainda não vê o factor; o servidor recusa.
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

    const Page = await loadPage();
    renderRoute(Page);
    await fillValidPassword();

    const codeInput = await screen.findByLabelText("Código da aplicação autenticadora");
    fireEvent.change(codeInput, { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar código" }));

    await waitFor(() => expect(updateUserMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText("Senha atualizada com sucesso!")).toBeDefined());
  });
});
