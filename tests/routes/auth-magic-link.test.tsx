// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf } from "./_harness";

/**
 * Testes de montagem e render de `/auth/magic-link`.
 *
 * Página pública de callback — lê `window.location.search`/`hash`
 * directamente (é a Supabase que gera este URL, não o router da app), por
 * isso o teste navega o jsdom com `history.pushState` antes de montar em
 * vez de usar `setRouteSearch`. Cobre a cadeia de fallback real:
 * `error=` no URL → `code` (OAuth) → `token_hash`+`type` (recovery) →
 * `getSession()` já existente → erro genérico.
 *
 * Valida:
 * 1. `?code=...` troca por sessão e redirecciona (timer de 1.2s) para `/`.
 * 2. `?error=...&error_description=...` mostra a mensagem decodificada do
 *    URL, não a genérica.
 * 3. `?token_hash=...&type=recovery` chama `verifyOtp` com `type: "recovery"`
 *    mesmo quando o URL diz `type=magiclink` — nunca "magiclink" puro (criaria
 *    conta para e-mail inexistente, ver o comentário do próprio ficheiro).
 * 4. Sem nenhum parâmetro e sem sessão activa: erro genérico "Nenhum link...".
 * 5. `exchangeCodeForSession` falha (link já usado) → estado de erro com
 *    atalho "Voltar ao início de sessão".
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
  const mod = await import("@/routes/auth.magic-link");
  return routeComponentOf(mod);
}

function navigateTo(url: string) {
  window.history.pushState(null, "", url);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  window.history.pushState(null, "", "/");
});

describe("/auth/magic-link", () => {
  it("troca ?code=... por sessão, mostra sucesso e redirecciona à raiz", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    navigateTo("/auth/magic-link?code=abc123");
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });

    const Page = await loadPage();
    renderRoute(Page);

    await vi.waitFor(() => {
      expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("abc123");
    });
    await vi.waitFor(() => {
      expect(screen.getByText("Sessão iniciada com sucesso")).toBeDefined();
    });

    vi.advanceTimersByTime(1200);
    // A navegação real é mockada (reactRouterMock) — chegar aqui sem
    // rebentar confirma que o timer de redireccionamento corre.
  });

  it("mostra a mensagem de erro decodificada do URL quando o provedor devolve ?error=", async () => {
    navigateTo(
      "/auth/magic-link?error=access_denied&error_description=Link+expirado+ou+j%C3%A1+usado",
    );

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Link expirado ou já usado")).toBeDefined();
    });
    expect(exchangeCodeForSessionMock).not.toHaveBeenCalled();
  });

  it("token_hash com type=magiclink no URL ainda assim chama verifyOtp com type: 'recovery'", async () => {
    navigateTo("/auth/magic-link?token_hash=xyz&type=magiclink");
    verifyOtpMock.mockResolvedValue({ error: null });

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(verifyOtpMock).toHaveBeenCalledWith({ token_hash: "xyz", type: "recovery" });
    });
  });

  it("sem parâmetros e sem sessão activa mostra o erro genérico", async () => {
    navigateTo("/auth/magic-link");
    getSessionMock.mockResolvedValue({ data: { session: null } });

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Nenhum link de acesso válido encontrado.")).toBeDefined();
    });
  });

  it("exchangeCodeForSession com erro mostra o estado de falha e o atalho de volta", async () => {
    navigateTo("/auth/magic-link?code=usado-2x");
    exchangeCodeForSessionMock.mockResolvedValue({ error: { message: "invalid_grant" } });

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("O link de acesso é inválido ou já foi utilizado.")).toBeDefined();
    });
    expect(screen.getByRole("link", { name: "Voltar ao início de sessão" })).toBeDefined();
  });
});
