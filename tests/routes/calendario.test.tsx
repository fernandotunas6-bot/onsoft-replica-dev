// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import {
  renderRoute,
  resetCurrentAccount,
  resetPersistedFilters,
  resetRouteLocation,
  routeComponentOf,
  setCurrentAccount,
} from "./_harness";
import type { CalendarEventSummary, getActiveAcademicYear } from "@/features/calendar/server";

/**
 * Smoke de render de `/calendario`.
 *
 * O que se fixa aqui é o impasse da escola nova: sem ano lectivo activo não há
 * períodos, turmas nem planos de propina, e a rota tem de dizer **isso** — e
 * não «ainda não existem períodos», que manda o utilizador para um botão que
 * nem sequer está no ecrã. A escolha entre os dois estados vazios (e entre os
 * dois botões do cabeçalho) vive só no render.
 */

type ActiveYear = Awaited<ReturnType<typeof getActiveAcademicYear>>;

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

const listCalendarEventsMock = vi.fn();
const getActiveAcademicYearMock = vi.fn();
const listDayAgendaLessonsMock = vi.fn();

vi.mock("@/features/calendar/server", () => ({
  listCalendarEvents: () => listCalendarEventsMock(),
  getActiveAcademicYear: () => getActiveAcademicYearMock(),
  listDayAgendaLessons: () => listDayAgendaLessonsMock(),
  createAcademicYear: vi.fn(),
  createCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
  updateCalendarEvent: vi.fn(),
}));

vi.mock("@/features/calendar/feed", () => ({
  getOrCreateCalendarFeedToken: vi.fn(),
}));

/** Sem cast: tem de satisfazer `CalendarEventSummary` a sério. */
const trimestre: CalendarEventSummary = {
  id: "term-1",
  title: "1º Trimestre",
  description: "Período lectivo 1",
  event_date: "2026-09-07",
  ends_on: "2026-12-18",
  category: "academic",
  sequence: 1,
  academic_year_id: "ano-1",
};

const anoActivo: NonNullable<ActiveYear> = {
  id: "ano-1",
  name: "2026/2027",
  starts_on: "2026-09-07",
  ends_on: "2027-07-31",
  status: "active",
};

function seed({
  events = [] as CalendarEventSummary[],
  activeYear = anoActivo as ActiveYear,
} = {}) {
  listCalendarEventsMock.mockResolvedValue(events);
  getActiveAcademicYearMock.mockResolvedValue(activeYear);
  listDayAgendaLessonsMock.mockResolvedValue([]);
}

let Calendario: ComponentType;

// O `import` da rota arrasta um grafo de módulos grande e passa dos 5s de
// timeout por omissão do Vitest à primeira vez. Fica no `beforeAll`, com
// timeout próprio, para os testes em si medirem só o render.
beforeAll(async () => {
  Calendario = routeComponentOf(await import("@/routes/calendario"));
}, 60_000);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetRouteLocation();
  resetCurrentAccount();
  resetPersistedFilters();
});

describe("/calendario — render", () => {
  it("atravessa a transição loading → carregado e lista o período", async () => {
    seed({ events: [trimestre] });

    renderRoute(Calendario);

    expect(screen.getByText("A carregar calendário…")).toBeDefined();

    await waitFor(() => {
      expect(screen.getAllByText("1º Trimestre").length).toBeGreaterThan(0);
    });
    expect(screen.getByRole("heading", { name: "Calendário Lectivo" })).toBeDefined();
  });

  it("aponta ao ano lectivo em falta — e não aos períodos — na escola nova", async () => {
    seed({ activeYear: null });

    renderRoute(Calendario);

    await waitFor(() => {
      expect(screen.getByText("A escola ainda não tem ano lectivo")).toBeDefined();
    });
    // Sem ano activo, «Novo período» não teria onde gravar: o cabeçalho tem de
    // oferecer o passo anterior, não o seguinte.
    expect(screen.getByRole("button", { name: /Definir ano lectivo/ })).toBeDefined();
    expect(screen.queryByRole("button", { name: /^Novo período$/ })).toBeNull();
  });

  it("pede o primeiro período quando já existe ano lectivo activo", async () => {
    seed();

    renderRoute(Calendario);

    await waitFor(() => {
      expect(screen.getByText("Ainda não existem períodos neste ano lectivo")).toBeDefined();
    });
    expect(screen.queryByRole("button", { name: /Definir ano lectivo/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Novo período/ })).toBeDefined();
  });

  it("encaminha para a secretaria quem não pode gerir o calendário", async () => {
    seed({ activeYear: null });
    setCurrentAccount({ role: "Professor", grants: {} });

    renderRoute(Calendario);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Peça à secretaria ou à administração para definir o ano lectivo e os períodos.",
        ),
      ).toBeDefined();
    });
    expect(screen.queryByRole("button", { name: /Definir ano lectivo/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Novo período/ })).toBeNull();
  });

  it("mostra o erro do servidor em vez de um calendário vazio", async () => {
    seed();
    listCalendarEventsMock.mockRejectedValue(new Error("Sem membership activa nesta escola."));

    renderRoute(Calendario);

    await waitFor(() => {
      expect(screen.getByText("Sem membership activa nesta escola.")).toBeDefined();
    });
    expect(screen.queryByText("Ainda não existem períodos neste ano lectivo")).toBeNull();
  });
});
