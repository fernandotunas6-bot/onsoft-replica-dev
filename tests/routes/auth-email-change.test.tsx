// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf } from "./_harness";

/**
 * Testes de montagem e render de `/auth/email-change`.
 *
 * Mesma mecânica de `/auth/magic-link`, com duas diferenças que valem
 * teste próprio: **sem** fallback para `getSession()` (chegar aqui sem
 * `code`/`token_hash` válidos é sempre erro, nunca "já havia sessão") e o
 * redireccionamento de sucesso vai para `/perfil`, não para `/`.
 *
 * Valida:
 * 1. `?code=...` troca por sessão e mostra sucesso.
 * 2. `?error=...` mostra a mensagem decodificada.
 * 3. `?token_hash=...&type=email_change_new` (o tipo que a Supabase usa
 *    para o e-mail de destino) ainda assim chama `verifyOtp` com
 *    `type: "email_change"` — normalização igual à do magic-link.
 * 4. Sem parâmetros: erro directo, sem tentar `getSession()` primeiro.
 * 5. `exchangeCodeForSession` falha → mensagem de link já utilizado.
 */

const exchangeCodeForSessionMock = vi.fn();
const verifyOtpMock = vi.fn();
const getSessionMock = vi.fn();

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: (code: string) => exchangeCodeForSessionMock(code),
      verifyOtp: (input: unknown) => verifyOtpMock(input),
      getSession: () => getSessionMock(),
    },
  },
}));

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/auth.email-change");
  return routeComponentOf(mod);
}

function navigateTo(url: string) {
  window.history.pushState(null, "", url);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.pushState(null, "", "/");
});

describe("/auth/email-change", () => {
  it("troca ?code=... por sessão e mostra sucesso", async () => {
    navigateTo("/auth/email-change?code=abc123");
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("E-mail actualizado com sucesso")).toBeDefined();
    });
    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("abc123");
  });

  it("mostra a mensagem de erro decodificada quando o provedor devolve ?error=", async () => {
    navigateTo(
      "/auth/email-change?error=access_denied&error_description=Endere%C3%A7o+j%C3%A1+em+uso",
    );

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Endereço já em uso")).toBeDefined();
    });
  });

  it("type=email_change_new no URL ainda assim chama verifyOtp com type: 'email_change'", async () => {
    navigateTo("/auth/email-change?token_hash=xyz&type=email_change_new");
    verifyOtpMock.mockResolvedValue({ error: null });

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(verifyOtpMock).toHaveBeenCalledWith({ token_hash: "xyz", type: "email_change" });
    });
  });

  it("sem parâmetros mostra erro directo, sem consultar getSession()", async () => {
    navigateTo("/auth/email-change");

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Nenhum link de confirmação válido encontrado.")).toBeDefined();
    });
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it("exchangeCodeForSession com erro mostra a mensagem de link já utilizado", async () => {
    navigateTo("/auth/email-change?code=usado-2x");
    exchangeCodeForSessionMock.mockResolvedValue({ error: { message: "invalid_grant" } });

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(
        screen.getByText("O link de confirmação é inválido ou já foi utilizado."),
      ).toBeDefined();
    });
    expect(screen.getByRole("link", { name: "Voltar ao início de sessão" })).toBeDefined();
  });
});
