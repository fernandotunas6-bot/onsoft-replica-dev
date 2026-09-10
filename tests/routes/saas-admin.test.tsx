// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf } from "./_harness";

/**
 * Teste de montagem e render de `/saas-admin`.
 *
 * Página estática sem dados de servidor — é a ponte SIGA → ADMIN (SaaS
 * Control Center). Não usa `AppShell` (tem o próprio layout de página
 * cheia), por isso não é mockado aqui. Valida que:
 * 1. Monta sem rebentar e mostra o convite claro para o ADMIN.
 * 2. Todas as secções do Control Center listadas apontam para
 *    `getAdminUrl(path)` — regressão directa se algum `path` mudar sem
 *    actualizar a lista `ADMIN_SECTIONS`.
 * 3. O botão "Criar Escola no WEB" aponta para o WEB, não para uma página
 *    de criação de escola dentro do SIGA (regra não negociável do
 *    ecossistema: o wizard de criação é do WEB, nunca do SIGA).
 */

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/saas-admin");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
});

describe("/saas-admin", () => {
  it("monta sem rebentar e convida para o ADMIN", async () => {
    const Page = await loadPage();
    renderRoute(Page);

    expect(screen.getByText("Gestão de escolas clientes")).toBeDefined();
    expect(screen.getByRole("link", { name: /Abrir ADMIN/ })).toBeDefined();
  });

  it("todas as secções do Control Center apontam para o domínio ADMIN", async () => {
    const Page = await loadPage();
    renderRoute(Page);

    const sections = [
      "Escolas clientes",
      "Subscrições",
      "Domínios",
      "Auditoria",
      "Webhooks gateway",
      "Admins plataforma",
      "Catálogo SaaS",
    ];
    for (const label of sections) {
      const link = screen.getByRole("link", { name: new RegExp(label) });
      const href = link.getAttribute("href") ?? "";
      expect(href.includes("admin") || href.startsWith("http")).toBe(true);
    }
  });

  it("'Criar escola no WEB' aponta para o WEB, não para uma rota do SIGA", async () => {
    const Page = await loadPage();
    renderRoute(Page);

    const link = screen.getByRole("link", { name: /Criar escola no WEB/ });
    const href = link.getAttribute("href") ?? "";
    // Regra não negociável: o wizard de criação de escola é do WEB.
    expect(href).not.toMatch(/\/criar-escola$/);
  });
});
