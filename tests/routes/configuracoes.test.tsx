// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf, setRouteSearch, resetRouteLocation } from "./_harness";

/**
 * Testes de montagem e render de `/configuracoes`.
 *
 * A rota é um redireccionador puro: nunca mostra conteúdo próprio, só um
 * spinner enquanto o `useEffect` decide para onde ir. Como o mock partilhado
 * de `useNavigate` é um no-op fixo (`_harness.tsx`), este ficheiro sobrepõe
 * localmente o mock do router para poder espiar a chamada de navegação —
 * é o único sítio, até agora, onde o destino do redireccionamento é o
 * próprio contrato a validar.
 *
 * Valida:
 * 1. `?painel=documentos` e `?painel=modelos` (case-insensitive, com
 *    espaços) redireccionam para `/documentos#modelos`, não para `/`.
 * 2. Qualquer outro valor de `painel` guarda o pedido em sessionStorage
 *    (`requestSettingsOpen`) e volta para `/`.
 * 3. Sem `painel`, guarda uma string vazia e volta para `/` na mesma.
 */

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

  it("guarda o painel pedido e volta para / para qualquer outro valor", async () => {
    setRouteSearch({ painel: "financeiro" });

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({ to: "/", replace: true });
    });
    expect(sessionStorage.getItem("siga:open-settings")).toBe("financeiro");
  });

  it("sem painel, guarda pedido vazio e volta para /", async () => {
    setRouteSearch({});

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({ to: "/", replace: true });
    });
    expect(sessionStorage.getItem("siga:open-settings")).toBe("");
  });
});
