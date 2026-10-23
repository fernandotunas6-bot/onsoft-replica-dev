// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, waitFor, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf, setRouteSearch, resetRouteLocation } from "./_harness";

/** Page is the default; the school can explicitly retain the modal presentation. */
const schoolState = vi.hoisted(() => ({
  preferences: {} as Record<string, boolean>,
  loading: false,
}));
vi.mock("@/features/auth/use-school-settings", () => ({
  useSchoolSettings: () => ({
    school: { id: "school-a", preferences: schoolState.preferences },
    isLoading: schoolState.loading,
  }),
}));
vi.mock("@/components/modals/SettingsCenter", () => ({
  SettingsCenter: ({
    presentation,
    initialPanelId,
  }: {
    presentation: string;
    initialPanelId?: string;
  }) => (
    <h1>
      Definições {presentation} {initialPanelId}
    </h1>
  ),
}));

const navigateMock = vi.fn();

vi.mock("@tanstack/react-router", async () => {
  const harness = await import("./_harness");
  return {
    ...harness.reactRouterMock(),
    useNavigate: () => navigateMock,
  };
});
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/configuracoes");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  schoolState.preferences = {};
  schoolState.loading = false;
  vi.clearAllMocks();
  resetRouteLocation();
  sessionStorage.clear();
});

describe("/configuracoes", () => {
  it("redirecciona ?painel=documentos para /documentos#modelos, não para /", async () => {
    setRouteSearch({ painel: "documentos" });

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/documentos",
        hash: "modelos",
        replace: true,
      });
    });
    expect(sessionStorage.getItem("siga:open-settings")).toBeNull();
  });

  it("aceita ?painel=Modelos com maiúsculas e espaços da mesma forma", async () => {
    setRouteSearch({ painel: "  Modelos  " });

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/documentos",
        hash: "modelos",
        replace: true,
      });
    });
  });

  it("mantém as definições na página e conserva o painel pedido por omissão", async () => {
    setRouteSearch({ painel: "financeiro" });

    const Page = await loadPage();
    renderRoute(Page);

    expect(await screen.findByRole("heading", { name: "Definições page financeiro" })).toBeTruthy();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("siga:open-settings")).toBeNull();
  });

  it("por opção da escola, guarda pedido vazio e abre o modal a partir de /", async () => {
    schoolState.preferences = { settingsModal: true };
    setRouteSearch({});

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({ to: "/", replace: true });
    });
    expect(sessionStorage.getItem("siga:open-settings")).toBe("");
  });
  it("não redirecciona enquanto as preferências da escola carregam", async () => {
    schoolState.preferences = { settingsModal: true };
    schoolState.loading = true;
    const Page = await loadPage();
    renderRoute(Page);
    expect(navigateMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("siga:open-settings")).toBeNull();
  });
});
