// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf, setRouteSearch, resetRouteLocation } from "./_harness";
import * as ecosystemUrls from "@/lib/ecosystem-urls";

/**
 * Testes de montagem de /criar-escola.
 *
 * Valida a regra de arquitetura onde a criação de escolas
 * redireciona automaticamente para o WEB (landing page / portal comercial).
 */

vi.mock("@tanstack/react-router", async () => {
  const harness = await import("./_harness");
  return harness.reactRouterMock();
});

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/criar-escola");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetRouteLocation();
});

describe("/criar-escola", () => {
  it("redireciona automaticamente para o WEB via window.location.replace", async () => {
    // Interceptar a API que gera a URL WEB
    const urlSpy = vi
      .spyOn(ecosystemUrls, "getCreateSchoolUrl")
      .mockReturnValue("https://portal-siga.test/start");

    // Substituir window.location.replace num ambiente jsdom
    const replaceMock = vi.fn();
    const originalLocation = window.location;
    delete (window as any).location;
    window.location = { ...originalLocation, replace: replaceMock } as any;

    try {
      const Page = await loadPage();
      renderRoute(Page);

      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("https://portal-siga.test/start");
      });
      expect(urlSpy).toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, "location", { value: originalLocation, writable: true });
    }
  });
});
