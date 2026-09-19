// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf } from "./_harness";
import type { listAlumniEvents } from "@/features/alumni/server";

/**
 * Testes de montagem e render de `/alumni/calendar`.
 *
 * Valida:
 * 1. Transição de loading para carregado com um evento publicado listado.
 * 2. Eventos não publicados (rascunho/cancelado) são filtrados no cliente —
 *    a query devolve tudo, a página só mostra `status === "published"`.
 * 3. Estado vazio quando não há eventos publicados.
 * 4. "Exportar ICS" desactivado quando não há eventos para exportar.
 */

type EventRow = Awaited<ReturnType<typeof listAlumniEvents>>[number];

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());

const listAlumniEventsMock = vi.fn();

vi.mock("@/features/alumni/server", () => ({
  listAlumniEvents: () => listAlumniEventsMock(),
}));

const publishedEvent: EventRow = {
  id: "ev-1",
  school_id: "sch-1",
  title: "Encontro Anual Alumni",
  description: "Networking e apresentação de resultados",
  event_type: "networking",
  location: "Luanda",
  online_url: null,
  starts_at: "2027-06-01T18:00:00Z",
  ends_at: "2027-06-01T20:00:00Z",
  capacity: null,
  status: "published",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
} as EventRow;

const draftEvent: EventRow = {
  ...publishedEvent,
  id: "ev-draft",
  title: "Ainda em preparação",
  status: "draft",
} as EventRow;

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/alumni.calendar");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/alumni/calendar", () => {
  it("mostra loading e depois o evento publicado carregado", async () => {
    listAlumniEventsMock.mockResolvedValue([publishedEvent]);

    const Page = await loadPage();
    renderRoute(Page);

    expect(screen.getByText(/A carregar agenda/)).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Encontro Anual Alumni")).toBeDefined();
    });
    expect(screen.getByRole("button", { name: /Exportar ICS/ })).toHaveProperty("disabled", false);
  });

  it("filtra eventos não publicados — só 'published' aparece na lista", async () => {
    listAlumniEventsMock.mockResolvedValue([publishedEvent, draftEvent]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Encontro Anual Alumni")).toBeDefined();
    });
    expect(screen.queryByText("Ainda em preparação")).toBeNull();
  });

  it("mostra o estado vazio quando não há eventos publicados", async () => {
    listAlumniEventsMock.mockResolvedValue([draftEvent]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Ainda não existem eventos Alumni publicados.")).toBeDefined();
    });
    expect(screen.getByRole("button", { name: /Exportar ICS/ })).toHaveProperty("disabled", true);
  });
});
