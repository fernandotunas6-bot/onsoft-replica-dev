// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import {
  emitRealtime,
  realtimeBindingsFor,
  renderRoute,
  resetCurrentAccount,
  resetPersistedFilters,
  resetRealtime,
  resetRouteLocation,
  routeComponentOf,
  setCurrentAccount,
} from "./_harness";
import type { listSchoolAnnouncements } from "@/features/communications/server";

/**
 * Smoke de render de `/comunicacoes`.
 *
 * Três ramos que só existem no render e que nenhum dos ~1.100 testes de lógica
 * alcança: o aviso de migração em falta (que substitui o erro cru quando a
 * tabela não existe), o corte por papel (`canManage`) e a subscrição realtime
 * — esta última é a classe de bug do Ciclo 54, em que o cliente escutava uma
 * tabela com nome errado e o painel nunca actualizava, silenciosamente.
 */

type Announcement = Awaited<ReturnType<typeof listSchoolAnnouncements>>[number];

// Montar uma rota real em jsdom leva ~1s isolado, mas passa facilmente dos 5s
// por omissão quando a suite inteira corre em paralelo (o handoff já regista
// falhas por carga da máquina no Ciclo 71). Timeout explícito para estes
// testes: fica a medir o render, não a fila de CPU.
vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());
vi.mock("@/features/auth/use-current-account", async () =>
  (await import("./_harness")).currentAccountMock(),
);
vi.mock("@/integrations/supabase/client", async () =>
  (await import("./_harness")).supabaseClientMock(),
);

const listSchoolAnnouncementsMock = vi.fn();

vi.mock("@/features/communications/server", () => ({
  listSchoolAnnouncements: () => listSchoolAnnouncementsMock(),
  createSchoolAnnouncement: vi.fn(),
  updateSchoolAnnouncement: vi.fn(),
  updateSchoolAnnouncementStatus: vi.fn(),
  archiveSchoolAnnouncement: vi.fn(),
}));

vi.mock("@/features/integrations/server", () => ({
  sendSchoolResendEmail: vi.fn(),
  sendSchoolWhatsAppMessage: vi.fn(),
}));

/** Sem cast: tem de satisfazer a forma real devolvida pela server function. */
const comunicado: Announcement = {
  id: "com-1",
  title: "Reunião de encarregados",
  body: "Sábado às 9h no pavilhão.",
  audience: "all_guardians",
  channel: "portal",
  status: "sent",
  scheduled_for: null,
  published_at: "2026-09-01T08:00:00.000Z",
  created_at: "2026-09-01T07:00:00.000Z",
  updated_at: null,
};

let Comunicacoes: ComponentType;

// O `import` da rota arrasta um grafo de módulos grande e passa dos 5s de
// timeout por omissão do Vitest à primeira vez. Fica no `beforeAll`, com
// timeout próprio, para os testes em si medirem só o render.
beforeAll(async () => {
  Comunicacoes = routeComponentOf(await import("@/routes/comunicacoes"));
}, 60_000);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetRouteLocation();
  resetCurrentAccount();
  resetRealtime();
  resetPersistedFilters();
});

describe("/comunicacoes — render", () => {
  it("atravessa a transição loading → carregado e lista o comunicado", async () => {
    listSchoolAnnouncementsMock.mockResolvedValue([comunicado]);

    renderRoute(Comunicacoes);

    expect(screen.getByText("A carregar comunicados…")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Reunião de encarregados")).toBeDefined();
    });
    expect(screen.getByRole("heading", { name: "Comunicações" })).toBeDefined();
  });

  it("mostra o estado vazio quando a escola ainda não publicou nada", async () => {
    listSchoolAnnouncementsMock.mockResolvedValue([]);

    renderRoute(Comunicacoes);

    await waitFor(() => {
      expect(screen.getByText("Ainda não há comunicados")).toBeDefined();
    });
  });

  it("troca o erro cru pelo aviso de migração quando a tabela não existe", async () => {
    listSchoolAnnouncementsMock.mockRejectedValue(
      new Error('relation "public.school_announcements" does not exist'),
    );

    renderRoute(Comunicacoes);

    await waitFor(() => {
      expect(screen.getByText("Migração de comunicações ainda não aplicada")).toBeDefined();
    });
    // O erro do Postgres não deve chegar ao ecrã, e o convite a redigir tem de
    // desaparecer: sem tabela, o formulário não teria onde gravar.
    expect(screen.queryByText(/does not exist/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Novo comunicado/ })).toBeNull();
    expect(
      screen.getByText("Aplique a migração para activar a redacção de comunicados."),
    ).toBeDefined();
  });

  it("mostra o erro real quando a falha não é de schema", async () => {
    listSchoolAnnouncementsMock.mockRejectedValue(new Error("Sem membership activa nesta escola."));

    renderRoute(Comunicacoes);

    await waitFor(() => {
      expect(screen.getByText("Sem membership activa nesta escola.")).toBeDefined();
    });
    expect(screen.queryByText("Migração de comunicações ainda não aplicada")).toBeNull();
  });

  it("deixa o comunicado só de leitura para papéis sem gestão", async () => {
    listSchoolAnnouncementsMock.mockResolvedValue([comunicado]);
    setCurrentAccount({ role: "Professor" });

    renderRoute(Comunicacoes);

    await waitFor(() => {
      expect(
        screen.getByText("Apenas Administrador e Secretaria podem criar ou alterar comunicados."),
      ).toBeDefined();
    });
    expect(screen.queryByRole("button", { name: /Novo comunicado/ })).toBeNull();
  });

  it("subscreve `school_announcements` e recarrega a lista ao receber evento", async () => {
    listSchoolAnnouncementsMock.mockResolvedValue([comunicado]);

    renderRoute(Comunicacoes);

    await waitFor(() => {
      expect(screen.getByText("Reunião de encarregados")).toBeDefined();
    });

    // Nome da tabela errado = painel que nunca actualiza e não dá erro nenhum.
    const bindings = realtimeBindingsFor("school_announcements");
    expect(bindings).toHaveLength(1);
    expect(bindings[0]?.schema).toBe("public");

    listSchoolAnnouncementsMock.mockResolvedValue([
      comunicado,
      { ...comunicado, id: "com-2", title: "Pauta do 1.º trimestre" },
    ]);
    emitRealtime("school_announcements");

    await waitFor(() => {
      expect(screen.getByText("Pauta do 1.º trimestre")).toBeDefined();
    });
  });
});
