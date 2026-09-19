// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, waitFor, screen, fireEvent } from "@testing-library/react";
import type { ComponentType } from "react";
import {
  renderRoute,
  routeComponentOf,
  setRouteParams,
  resetRouteLocation,
  currentAccountMock,
} from "./_harness";
import * as accessServer from "@/features/access/server";

vi.setConfig({ testTimeout: 25_000 });

const navigateMock = vi.fn();
vi.mock("@tanstack/react-router", async () => {
  const harness = await import("./_harness");
  return {
    ...harness.reactRouterMock(),
    useNavigate: () => navigateMock,
  };
});

// Estado de auth para ser alterado
let mockSession: { user: { id: string } } | null = null;
vi.mock("@/components/auth/AuthGate", () => ({
  useAuthSession: () => mockSession,
}));

const setActiveSchoolIdMock = vi.fn();
vi.mock("@/features/auth/use-current-account", () =>
  currentAccountMock({ setActiveSchoolId: setActiveSchoolIdMock }),
);

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/convite.$token");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetRouteLocation();
  mockSession = null;
});

describe("/convite/$token", () => {
  it("redireciona para o login (alterar-senha/login) se não houver sessão ativa", async () => {
    setRouteParams({ token: "abc-123" });
    mockSession = null; // não logado

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      // Como tem useEffect verificando login + idle, quando o utilizador
      // carregar no botão ou logo em renderização manual
      expect(screen.getByText("Iniciar Sessão para Aceitar")).toBeDefined();
    });

    const btn = screen.getByRole("button", { name: "Iniciar Sessão para Aceitar" });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/alterar-senha",
        search: { redirect: encodeURIComponent("/convite/abc-123") },
      });
    });
  });

  it("aceita o convite automaticamente se já estiver logado", async () => {
    setRouteParams({ token: "valid-token" });
    mockSession = { user: { id: "user-123" } };

    const acceptSpy = vi.spyOn(accessServer, "acceptSchoolInvitation").mockResolvedValue({
      success: true,
      schoolId: "school-abc",
      roleCode: "admin",
    });

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(acceptSpy).toHaveBeenCalledWith({ data: { token: "valid-token" } });
    });

    // Validar mudança de UI
    await waitFor(() => {
      expect(screen.getByText("Convite Aceite!")).toBeDefined();
    });

    expect(setActiveSchoolIdMock).toHaveBeenCalledWith("school-abc");

    // O redirecionamento acontece após 2s, por isso precisamos simular ou assumir que o setTimeout está coberto.
    // Em jsdom, setTimeout não avança automaticamente.
  });

  it("mostra erro se o convite falhar", async () => {
    setRouteParams({ token: "invalid-token" });
    mockSession = { user: { id: "user-123" } };

    vi.spyOn(accessServer, "acceptSchoolInvitation").mockRejectedValue(
      new Error("Convite inválido ou expirado."),
    );

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Não foi possível aceitar")).toBeDefined();
      expect(screen.getByText("Convite inválido ou expirado.")).toBeDefined();
    });
  });
});
