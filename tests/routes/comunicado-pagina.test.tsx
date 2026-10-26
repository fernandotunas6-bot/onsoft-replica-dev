// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import {
  renderRoute,
  resetCurrentAccount,
  resetRouteLocation,
  routeComponentOf,
  setCurrentAccount,
  setRouteParams,
} from "./_harness";

/**
 * `/comunicacoes/<id>` (SIGA Context Engine, contexto Comunicações): o comunicado
 * que o servidor devolve, por inteiro, com o público, o canal e as datas.
 */

vi.setConfig({ testTimeout: 25_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());
vi.mock("@/features/auth/use-current-account", async () =>
  (await import("./_harness")).currentAccountMock({ role: "Secretaria" }),
);

const getSchoolAnnouncementMock = vi.fn();
vi.mock("@/features/communications/server", () => ({
  getSchoolAnnouncement: (args: unknown) => getSchoolAnnouncementMock(args),
}));

const COMUNICADO = "44444444-4444-4444-8444-444444444444";

const announcement = {
  id: COMUNICADO,
  schoolId: "school-a",
  title: "Reunião de pais",
  body: "Sexta-feira às 17h.\nNo salão polivalente.",
  audience: "all_guardians",
  channel: "portal",
  status: "sent",
  scheduled_for: null,
  published_at: "2026-10-20T09:00:00Z",
  created_at: "2026-10-19T10:00:00Z",
  updated_at: null,
};

let Page: ComponentType;

beforeAll(async () => {
  Page = routeComponentOf(await import("@/routes/comunicacoes_.$announcementId"));
}, 60_000);

afterEach(() => {
  cleanup();
  getSchoolAnnouncementMock.mockReset();
  resetRouteLocation();
  resetCurrentAccount();
});

function open(role = "Secretaria") {
  setRouteParams({ announcementId: COMUNICADO });
  setCurrentAccount({ role, roles: [role] });
  renderRoute(Page);
}

describe("/comunicacoes/<id>", () => {
  it("mostra o comunicado por inteiro, o público, o canal e a data", async () => {
    getSchoolAnnouncementMock.mockResolvedValue(announcement);
    open();
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "Reunião de pais" })).toBeDefined(),
    );
    expect(getSchoolAnnouncementMock).toHaveBeenCalledWith({ data: { id: COMUNICADO } });
    const body = screen.getByRole("region", { name: "Comunicado" });
    expect(body.textContent).toContain("No salão polivalente.");
    expect(body.textContent).toContain("Enviado");
    const sending = screen.getByRole("region", { name: "Envio" });
    expect(sending.textContent).toContain("Todos os encarregados");
    expect(sending.textContent).toContain("Portal");
    expect(screen.getByText("Publicado").nextElementSibling?.textContent).toBe("20/10/2026");
    // A secretaria gere os comunicados na lista.
    expect(screen.getByRole("link", { name: "lista de comunicados" })).toBeDefined();
  });

  it("um agendado mostra a data marcada", async () => {
    getSchoolAnnouncementMock.mockResolvedValue({
      ...announcement,
      status: "scheduled",
      published_at: null,
      scheduled_for: "2026-11-02",
    });
    open();
    await waitFor(() => expect(screen.getByText("Agendado para")).toBeDefined());
    expect(screen.getByText("Agendado para").nextElementSibling?.textContent).toBe("02/11/2026");
    expect(screen.queryByText("Publicado")).toBeNull();
  });

  it("o encarregado lê o comunicado sem as acções de gestão", async () => {
    getSchoolAnnouncementMock.mockResolvedValue(announcement);
    open("Encarregado");
    await waitFor(() => expect(screen.getByText("Todos os encarregados")).toBeDefined());
    expect(screen.queryByRole("link", { name: "lista de comunicados" })).toBeNull();
  });

  it("um comunicado que o servidor não devolve mostra «Comunicado não encontrado»", async () => {
    getSchoolAnnouncementMock.mockResolvedValue(null);
    open("Aluno");
    await waitFor(() => expect(screen.getByText("Comunicado não encontrado")).toBeDefined());
    expect(screen.getByRole("link", { name: "Ver os comunicados" })).toBeDefined();
  });

  it("quem não abre as Comunicações não faz o pedido", async () => {
    open("Tesouraria");
    expect(screen.getByText("Sem acesso às comunicações")).toBeDefined();
    expect(getSchoolAnnouncementMock).not.toHaveBeenCalled();
  });
});
