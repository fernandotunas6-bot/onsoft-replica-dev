// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, waitFor, screen, fireEvent } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf, setRouteSearch, resetRouteLocation } from "./_harness";
import * as feedClient from "@/features/calendar/feed";

vi.mock("@tanstack/react-router", async () => {
  const harness = await import("./_harness");
  return harness.reactRouterMock();
});

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/calendario.ics");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetRouteLocation();
});

describe("/calendario/ics", () => {
  it("monta o estado inicial de erro se o token for inválido ou curto", async () => {
    setRouteSearch({ token: "curto" });
    const feedSpy = vi.spyOn(feedClient, "getPublicCalendarFeed").mockResolvedValue({
      events: [],
      calendarName: "Escola",
    });

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Calendário móvel")).toBeDefined();
    });

    expect(feedSpy).not.toHaveBeenCalled();
    const button = screen.getByRole("button", { name: "Descarregar .ics" });
    expect(button).toHaveProperty("disabled", true);
  });

  it("carrega e permite descarregar ICS se o token for válido", async () => {
    const validToken = "1234567890abcdef123";
    setRouteSearch({ token: validToken });
    const feedSpy = vi.spyOn(feedClient, "getPublicCalendarFeed").mockResolvedValue({
      events: [
        {
          id: "evt-1",
          title: "Aula Aberta",
          event_date: "2026-09-12",
          ends_on: "2026-09-12",
          start_time: "10:00",
          end_time: "12:00",
          isAllDay: false,
        } as any,
      ],
      calendarName: "Escola Secundária",
    });

    const createObjectUrlMock = vi.fn().mockReturnValue("blob:test-url");
    const revokeObjectUrlMock = vi.fn();
    window.URL.createObjectURL = createObjectUrlMock;
    window.URL.revokeObjectURL = revokeObjectUrlMock;

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(feedSpy).toHaveBeenCalledWith({ data: { token: validToken } });
      expect(screen.getByText("1 evento(s) disponíveis.")).toBeDefined();
    });

    const button = screen.getByRole("button", { name: "Descarregar .ics" });
    expect(button).toHaveProperty("disabled", false);

    fireEvent.click(button);
    expect(createObjectUrlMock).toHaveBeenCalled();
  });
});
